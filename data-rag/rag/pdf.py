"""PDF -> text for books at bulk scale (hundreds/thousands of books).

Design decisions, each one measured on a 200 dpi Persian scan:

* **Raw PGM over stdin**, no temp PNG files. Rendering 8 pages costs 22 ms/page
  instead of 192 ms/page because nothing is encoded to PNG or written to disk.
* **Parallel pages across every core**, with `OMP_THREAD_LIMIT=1` so Tesseract
  does not oversubscribe the CPU (that alone was a 20x slowdown).
* **`fast` model by default** (~2.3x quicker than `best` with almost the same
  accuracy on printed text); `--model best` when accuracy matters more.
* **Native DPI by default**: rendering a 200 dpi scan at 300 dpi only
  interpolates pixels and made every page ~20% slower.
* Pages with a real text layer are never OCR'd, and every page result is cached
  on disk so an interrupted run resumes instead of starting over.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from .textutil import detect_language

_TESSERACT_HINTS = [
    Path.home() / "tools" / "squashfs-root" / "AppRun",
    Path.home() / "tools" / "squashfs-root" / "usr" / "bin" / "tesseract",
    Path.cwd() / "tools" / "squashfs-root" / "AppRun",
    Path.cwd() / "tools" / "squashfs-root" / "usr" / "bin" / "tesseract",
]
_MODEL_DIRS = {
    "best": [Path.home() / "tools" / "best", Path.cwd() / "tools" / "best"],
    "fast": [Path.home() / "tools" / "fast", Path.cwd() / "tools" / "fast"],
}
_TESSDATA_FALLBACK = [
    Path.home() / "tools",
    Path.cwd() / "tools",
    Path("/usr/share/tesseract-ocr/5/tessdata"),
    Path("/usr/share/tesseract-ocr/4.00/tessdata"),
    Path("/usr/share/tessdata"),
]

_CTRL = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]")
_PERSIAN_FIX = str.maketrans({"ي": "ی", "ك": "ک", "ﻻ": "لا", "\u0640": ""})
_SENTENCE_END = (".", "!", "?", "؟", "۔", ":", "؛", "»", "”", '"')


def find_tesseract(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("TESSERACT_CMD")
    if env:
        return env
    found = shutil.which("tesseract")
    if found:
        return found
    for hint in _TESSERACT_HINTS:
        if hint.exists():
            return str(hint)
    raise SystemExit(
        "Tesseract پیدا نشد. `./setup_tesseract.sh` را اجرا کن یا TESSERACT_CMD را ست کن."
    )


def find_model_dir(model: str, explicit: str | None = None) -> str | None:
    """Directory holding `<lang>.traineddata` for the requested quality tier."""
    if explicit:
        return explicit
    env = os.environ.get("TESSDATA_PREFIX")
    if env:
        return env
    for candidate in _MODEL_DIRS.get(model, []) + _TESSDATA_FALLBACK:
        if candidate.exists() and any(candidate.glob("*.traineddata")):
            return str(candidate)
    return None


def _pgm_bytes(pix) -> bytes:
    """Leptonica reads PGM natively: header + raw samples, no compression."""
    return b"P5\n%d %d\n255\n" % (pix.width, pix.height) + pix.samples


class OcrEngine:
    def __init__(self, lang: str = "fas", dpi: int = 300, model: str = "fast",
                 psm: int = 6, tesseract: str | None = None,
                 tessdata: str | None = None):
        self.lang = lang
        self.dpi = dpi
        self.model = model
        self.psm = psm
        self.command = find_tesseract(tesseract)
        self.tessdata = find_model_dir(model, tessdata)
        if self.tessdata:
            available = sorted(p.stem for p in Path(self.tessdata).glob("*.traineddata"))
            missing = [part for part in lang.split("+") if available and part not in available]
            if missing:
                raise SystemExit(
                    f"مدل «{'، '.join(missing)}» در {self.tessdata} نیست "
                    f"(موجود: {', '.join(available)}). ./setup_tesseract.sh را اجرا کن."
                )
        self._version = self._probe()

    def _probe(self) -> str:
        env = dict(os.environ)
        if self.tessdata:
            env["TESSDATA_PREFIX"] = self.tessdata
        try:
            out = subprocess.run([self.command, "--version"], capture_output=True,
                                 env=env, timeout=60)
            return (out.stdout.decode("utf-8", "replace").splitlines() or ["tesseract"])[0]
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"اجرای Tesseract ممکن نشد ({self.command}): {exc}") from exc

    def _env(self) -> dict:
        env = dict(os.environ)
        if self.tessdata:
            env["TESSDATA_PREFIX"] = self.tessdata
        env.setdefault("OMP_THREAD_LIMIT", "1")
        return env

    def ocr_pgm(self, pgm: bytes) -> str:
        proc = subprocess.run(
            [self.command, "stdin", "stdout", "-l", self.lang,
             "--psm", str(self.psm), "--dpi", str(self.dpi)],
            input=pgm, capture_output=True, env=self._env(),
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", "replace")[:400])
        return proc.stdout.decode("utf-8", "replace")

    def version(self) -> str:
        return f"{self._version} [{self.model}]"


class _DocHandles:
    """One PyMuPDF document per thread; PyMuPDF handles are not thread-safe."""

    def __init__(self, path: Path):
        self.path = path
        self._local = threading.local()
        self._all: list = []
        self._lock = threading.Lock()

    def page(self, pno: int):
        import pymupdf

        doc = getattr(self._local, "doc", None)
        if doc is None:
            doc = pymupdf.open(self.path)
            self._local.doc = doc
            with self._lock:
                self._all.append(doc)
        return doc[pno]

    def close(self) -> None:
        for doc in self._all:
            try:
                doc.close()
            except Exception:  # noqa: BLE001
                pass


# -- page selection --------------------------------------------------------
def _text_coverage(page) -> float:
    import pymupdf

    area = abs(page.rect)
    if not area:
        return 0.0
    covered = sum(abs(pymupdf.Rect(b[:4])) for b in page.get_text("blocks"))
    return min(covered / area, 1.0)


def _wants_ocr(page, force: bool, min_text_coverage: float) -> bool:
    if force:
        return True
    if len(page.get_text("text").strip()) < 40:
        return True
    # Scanned pages often carry *some* text: a watermark, a running footer.
    return _text_coverage(page) < min_text_coverage


def _native_dpi(page) -> float | None:
    """Resolution of the page image; rendering above it only interpolates."""
    import pymupdf

    best = 0.0
    try:
        infos = page.get_image_info()
    except Exception:  # noqa: BLE001
        return None
    for info in infos:
        width, height = info.get("width") or 0, info.get("height") or 0
        box = pymupdf.Rect(info["bbox"])
        if not width or not height or box.width <= 0 or box.height <= 0:
            continue
        best = max(best, width / (box.width / 72.0), height / (box.height / 72.0))
    return best or None


def _auto_lang(pdf: Path, sample_pages: list[int], dpi: int, model: str, psm: int,
               tesseract: str | None, tessdata: str | None) -> str:
    """Pick the OCR language from a one-page probe: fas, ara, or both."""
    import pymupdf

    if not sample_pages:
        return "fas"
    engine = OcrEngine(lang="fas", dpi=dpi, model=model, psm=psm,
                       tesseract=tesseract, tessdata=tessdata)
    doc = pymupdf.open(pdf)
    try:
        probe = " ".join(
            engine.ocr_pgm(_pgm_bytes(
                doc[p].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY, annots=False)))
            for p in sample_pages[:2]
        )
    finally:
        doc.close()
    return {"fa": "fas", "ar": "ara", "mixed": "fas+ara"}.get(detect_language(probe), "fas")


def _book_dpi(doc, pages: list[int]) -> int | None:
    samples = [p for p in pages[:8]]
    values = [d for d in (_native_dpi(doc[p]) for p in samples) if d]
    if not values:
        return None
    values.sort()
    return int(values[len(values) // 2])


# -- text clean-up ---------------------------------------------------------
def _clean_line(line: str) -> str:
    line = _CTRL.sub(" ", line).translate(_PERSIAN_FIX)
    line = re.sub(r"[ \t]+", " ", line)
    line = re.sub(r"\s+([،؛»”:,.!?؟])", r"\1", line)
    return line.strip()


def reflow(lines: list[str]) -> str:
    """Turn OCR line breaks back into paragraphs."""
    out: list[str] = []
    buffer = ""
    for raw in lines:
        line = _clean_line(raw)
        if not line:
            if buffer:
                out.append(buffer)
                buffer = ""
            continue
        if buffer.endswith("-") and len(buffer) > 2:
            buffer = buffer[:-1] + line
            continue
        buffer = f"{buffer} {line}" if buffer else line
        if line.endswith(_SENTENCE_END) or len(line) < 45:
            out.append(buffer)
            buffer = ""
    if buffer:
        out.append(buffer)
    return "\n\n".join(part.strip() for part in out if part.strip())


def _strip_repeating_lines(pages: list[str], threshold: float = 0.5) -> list[str]:
    """Drop lines repeated across most pages (watermarks, running headers)."""
    total = len(pages)
    if total < 3:
        return pages
    counts: dict[str, int] = {}
    for text in pages:
        for line in {ln.strip() for ln in text.splitlines() if ln.strip()}:
            if len(line) <= 200:
                counts[line] = counts.get(line, 0) + 1
    limit = max(3, int(total * threshold))
    noisy = {line for line, n in counts.items() if n >= limit}
    if not noisy:
        return pages
    return ["\n".join(ln for ln in text.splitlines() if ln.strip() not in noisy)
            for text in pages]


# -- main extraction -------------------------------------------------------
def _cache_dir(root: Path, pdf: Path, dpi: int, lang: str, model: str, psm: int) -> Path:
    stat = pdf.stat()
    key = hashlib.sha1(
        f"{pdf.resolve()}|{stat.st_size}|{int(stat.st_mtime)}|{dpi}|{lang}|{model}|{psm}".encode()
    ).hexdigest()[:16]
    path = root / "ocr" / key
    path.mkdir(parents=True, exist_ok=True)
    return path


def _parse_pages(spec: str | None, count: int) -> list[int]:
    if not spec:
        return list(range(count))
    pages: list[int] = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            start, end = chunk.split("-", 1)
            pages += list(range(int(start) - 1, min(int(end), count)))
        else:
            pages.append(int(chunk) - 1)
    return [p for p in pages if 0 <= p < count]


@dataclass
class _BookPlan:
    pdf: Path
    wanted: list[int]
    plan: list[tuple[int, str, str | None]]
    cache: Path
    lang: str
    dpi: int
    native: int | None
    cached_hits: int
    ocr_planned: int
    ocr_pages: list[int]
    engine: str = field(default="")


def _plan_book(pdf_path, root: str = "data", dpi: int | str = "auto", lang: str = "fas",
               model: str = "fast", psm: int = 6, pages: str | None = None,
               force_ocr: bool = False, min_text_coverage: float = 0.08,
               tesseract: str | None = None, tessdata: str | None = None) -> _BookPlan:
    """Decide per page: reuse the text layer, the page cache, or OCR."""
    import pymupdf

    pdf = Path(pdf_path)
    if not pdf.exists():
        raise SystemExit(f"فایل PDF پیدا نشد: {pdf}")
    root_path = Path(root)

    doc = pymupdf.open(pdf)
    wanted = _parse_pages(pages, doc.page_count)
    if not wanted:
        doc.close()
        raise SystemExit("هیچ صفحه‌ای برای پردازش انتخاب نشد")

    native = _book_dpi(doc, wanted)
    effective_dpi = (max(150, min(400, native or 300))
                     if isinstance(dpi, str) and dpi.lower() == "auto" else int(dpi))
    cache = _cache_dir(root_path, pdf, effective_dpi, lang, model, psm)

    plan: list[tuple[int, str, str | None]] = []
    cached_hits = ocr_planned = 0
    for pno in wanted:
        page = doc[pno]
        needs_ocr = _wants_ocr(page, force_ocr, min_text_coverage)
        ocr_planned += int(needs_ocr)
        cached = cache / f"p{pno + 1:05d}.txt"
        if cached.exists():
            plan.append((pno, "cached", cached.read_text(encoding="utf-8")))
            cached_hits += 1
        elif needs_ocr:
            plan.append((pno, "ocr", None))
        else:
            plan.append((pno, "text", page.get_text("text")))
    doc.close()

    ocr_pages = [p for p, kind, _ in plan if kind == "ocr"]
    if lang == "auto":
        if ocr_pages:
            lang = _auto_lang(pdf, ocr_pages, effective_dpi, model, psm, tesseract, tessdata)
        else:
            sample = " ".join(str(payload) for _p, kind, payload in plan
                              if kind in ("text", "cached") and payload)
            lang = {"fa": "fas", "ar": "ara", "mixed": "fas+ara"}.get(
                detect_language(sample), "fas")

    return _BookPlan(pdf=pdf, wanted=wanted, plan=plan, cache=cache, lang=lang,
                     dpi=effective_dpi, native=native, cached_hits=cached_hits,
                     ocr_planned=ocr_planned, ocr_pages=ocr_pages)


def _run_plans(plans: list[_BookPlan], *, model: str, psm: int, workers: int,
               tesseract: str | None, tessdata: str | None,
               progress: bool = True) -> tuple[dict[int, dict[int, str]], dict[int, list[str]]]:
    """Run every OCR page of every book on one pool: no per-book tail waste."""
    import pymupdf

    results: dict[int, dict[int, str]] = {i: {} for i in range(len(plans))}
    failures: dict[int, list[str]] = {i: [] for i in range(len(plans))}
    engines: dict[tuple[str, int], OcrEngine] = {}
    handles: dict[int, _DocHandles] = {}
    remaining = {i: len(p.ocr_pages) for i, p in enumerate(plans)}
    total = sum(remaining.values())
    if not total:
        return results, failures

    lock = threading.Lock()

    def engine_for(plan: _BookPlan) -> OcrEngine:
        key = (plan.lang, plan.dpi)
        with lock:
            if key not in engines:
                engines[key] = OcrEngine(lang=plan.lang, dpi=plan.dpi, model=model,
                                         psm=psm, tesseract=tesseract, tessdata=tessdata)
                plan.engine = engines[key].version()
        return engines[key]

    def work(idx: int, pno: int) -> tuple[int, int, str]:
        plan = plans[idx]
        with lock:
            handle = handles.get(idx)
            if handle is None:
                handle = handles[idx] = _DocHandles(plan.pdf)
        page = handle.page(pno)
        pix = page.get_pixmap(dpi=plan.dpi, colorspace=pymupdf.csGRAY, annots=False)
        text = engine_for(plan).ocr_pgm(_pgm_bytes(pix))
        (plan.cache / f"p{pno + 1:05d}.txt").write_text(text, encoding="utf-8")
        return idx, pno, text

    done = 0
    started = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {pool.submit(work, i, pno): (i, pno)
                for i, plan in enumerate(plans) for pno in plan.ocr_pages}
        for future in as_completed(jobs):
            idx, _page_no = jobs[future]
            try:
                _idx, pno, text = future.result()
                results[idx][pno] = text
            except Exception as exc:  # noqa: BLE001 - one bad page must not kill the batch
                failures[idx].append(str(exc)[:200])
            done += 1
            remaining[idx] -= 1
            if remaining[idx] == 0:
                finished = handles.pop(idx, None)
                if finished:
                    finished.close()
            if progress and done % 100 == 0:
                rate = done / max(1e-6, time.time() - started)
                print(f"[pdf] {done}/{total} صفحه ({rate:.2f} صفحه/ثانیه)", flush=True)

    for handle in handles.values():
        handle.close()
    return results, failures


def _finish_book(plan: _BookPlan, results: dict[int, str], started: float,
                 failures: list[str] | None = None) -> dict:
    merged = dict(results)
    for pno, kind, payload in plan.plan:
        if kind in ("cached", "text"):
            merged[pno] = str(payload)
    ordered = [reflow(merged.get(p, "").splitlines()) for p in plan.wanted]
    ordered = _strip_repeating_lines(ordered)
    texts = [t for t in ordered if t.strip()]
    elapsed = time.time() - started
    ran = len(plan.ocr_pages)
    return {
        "pdf": str(plan.pdf),
        "pages": len(plan.wanted),
        "ocr_pages": plan.ocr_planned,
        "ocr_this_run": ran,
        "text_pages": len(plan.wanted) - plan.ocr_planned,
        "cached_pages": plan.cached_hits,
        "empty_pages": len(ordered) - len(texts),
        "errors": len(failures or []),
        "chars": sum(len(t) for t in texts),
        "seconds": round(elapsed, 1),
        "pages_per_sec": round(ran / elapsed, 2) if ran and elapsed else 0.0,
        "dpi": plan.dpi,
        "native_dpi": plan.native,
        "cache_dir": str(plan.cache),
        "lang": plan.lang,
        "engine": plan.engine or ("cached pages" if plan.cached_hits and plan.ocr_planned
                                  else "text-layer only"),
        "page_texts": {p + 1: ordered[i] for i, p in enumerate(plan.wanted)},
    }


def extract_pdf(pdf_path: str | Path, root: str = "data", dpi: int | str = "auto",
                lang: str = "fas", model: str = "fast", psm: int = 6,
                workers: int | None = None, pages: str | None = None,
                force_ocr: bool = False, min_text_coverage: float = 0.08,
                tesseract: str | None = None, tessdata: str | None = None,
                progress: bool = True) -> dict:
    """Extract text from a PDF, OCR-ing only the scanned pages.

    `dpi="auto"` uses the page images' own resolution (clamped to 150-400) so a
    200 dpi scan is not pointlessly upscaled to 300. Pass an int to force one.
    """
    plan = _plan_book(pdf_path, root=root, dpi=dpi, lang=lang, model=model, psm=psm,
                      pages=pages, force_ocr=force_ocr,
                      min_text_coverage=min_text_coverage,
                      tesseract=tesseract, tessdata=tessdata)
    workers = workers or min(16, os.cpu_count() or 4)
    if progress and plan.ocr_pages:
        print(f"[pdf] {plan.pdf.name}: lang={plan.lang} dpi={plan.dpi}"
              f"{' (بومی)' if plan.native else ''} | OCR {len(plan.ocr_pages)} صفحه"
              f" + {len(plan.plan) - len(plan.ocr_pages)} متنی/کش | workers={workers}",
              flush=True)
    started = time.time()
    results, failures = _run_plans([plan], model=model, psm=psm, workers=workers,
                                   tesseract=tesseract, tessdata=tessdata,
                                   progress=progress)
    return _finish_book(plan, results.get(0, {}), started, failures.get(0))


def extract_many(pdf_paths, root: str = "data", dpi: int | str = "auto", lang: str = "fas",
                 model: str = "fast", psm: int = 6, workers: int | None = None,
                 force_ocr: bool = False, min_text_coverage: float = 0.08,
                 tesseract: str | None = None, tessdata: str | None = None,
                 progress: bool = True) -> list[dict]:
    """Extract several books with one shared pool of OCR workers.

    Per-book pools leave the machine idle at the end of every short book; a single
    pool over all their pages keeps every core busy and is what makes a 1000-book
    run behave like one long job.
    """
    workers = workers or min(16, os.cpu_count() or 4)
    started = time.time()
    plans: list[_BookPlan] = []
    output: list[dict] = []
    for path in pdf_paths:
        try:
            plans.append(_plan_book(path, root=root, dpi=dpi, lang=lang, model=model,
                                    psm=psm, force_ocr=force_ocr,
                                    min_text_coverage=min_text_coverage,
                                    tesseract=tesseract, tessdata=tessdata))
        except SystemExit as exc:
            output.append({"pdf": str(path), "error": str(exc), "page_texts": {}})
    if not plans:
        return output

    if progress:
        total = sum(len(p.ocr_pages) for p in plans)
        print(f"[pdf] {len(plans)} کتاب، {total} صفحه OCR، workers={workers}", flush=True)

    results, failures = _run_plans(plans, model=model, psm=psm, workers=workers,
                                   tesseract=tesseract, tessdata=tessdata,
                                   progress=progress)
    for i, plan in enumerate(plans):
        output.append(_finish_book(plan, results.get(i, {}), started, failures.get(i)))
    return output


def write_jsonl(extracted: dict, out_path: str | Path, title: str | None = None,
                category: str = "کتاب", source: str | None = None,
                lang: str | None = None) -> Path:
    """One document per page, so citations can point at a page number."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    stem = title or Path(extracted["pdf"]).stem
    source = source or Path(extracted["pdf"]).name
    lang = lang or detect_language(" ".join(extracted["page_texts"].values()))
    with out.open("w", encoding="utf-8") as fh:
        for page, text in extracted["page_texts"].items():
            if not text.strip():
                continue
            fh.write(json.dumps({
                "id": f"{Path(extracted['pdf']).stem}#p{page:04d}",
                "title": f"{stem} — صفحه {page}",
                "text": text,
                "category": category,
                "source": f"{source}#page={page}",
                "published": "",
                "lang": lang,
            }, ensure_ascii=False) + "\n")
    return out
