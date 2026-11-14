"""Batch OCR over a whole folder of books: resumable, with progress and ETA.

The manifest (`data/library.json`) records every book by absolute path plus size
and mtime, so re-running the command skips what is already done, retries what
failed, and never re-OCRs a page that is still in the page cache.

Indexing is done in batches rather than once at the end: a 1000-book run that
dies at book 900 should not lose its index work.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

from .ingest import run_ingest
from .pdf import extract_many, write_jsonl


def _slug(rel: str) -> str:
    return re.sub(r"[^\w\u0600-\u06FF.-]+", "_", rel)[:120]


def _ingest_batch(paths: list[Path], root: Path, embedder: str, progress: bool) -> dict:
    """Merge a batch of per-book JSONL files, ingest it, then drop the temp file."""
    tmp = root / "extracted" / ".tmp-batch.jsonl"
    with tmp.open("w", encoding="utf-8") as out:
        for path in paths:
            out.write(path.read_text(encoding="utf-8"))
    try:
        return run_ingest(str(tmp), root=str(root), embedder_backend=embedder, progress_hint=progress)
    finally:
        tmp.unlink(missing_ok=True)


def _flush(batch: list[tuple[Path, str]], root: Path, embedder: str, progress: bool,
           totals: dict, books: dict, manifest_path: Path) -> dict:
    result = _ingest_batch([path for path, _ in batch], root, embedder, progress)
    for key, value in result.items():
        if key in totals:
            totals[key] += value
    for _path, key in batch:
        if key in books:
            books[key]["indexed"] = True
    manifest_path.write_text(json.dumps({"books": books}, ensure_ascii=False, indent=1),
                             encoding="utf-8")
    return totals


def run_library(directory: str = "books", root: str = "data", index: bool = True,
                limit: int | None = None, force: bool = False, batch_size: int = 25,
                embedder: str = "auto", progress: bool = True, **extract_kwargs) -> dict:
    base = Path(directory)
    if not base.exists():
        raise SystemExit(f"پوشه پیدا نشد: {base} (PDFها را داخل آن بگذار)")
    pdfs = sorted(p for p in base.rglob("*") if p.suffix.lower() == ".pdf")
    if limit:
        pdfs = pdfs[:limit]
    if not pdfs:
        raise SystemExit(f"هیچ PDFی در {base} پیدا نشد")

    root_path = Path(root)
    ext_dir = root_path / "extracted"
    ext_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = root_path / "library.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    books: dict = manifest.setdefault("books", {})

    pending = []
    for pdf in pdfs:
        key = str(pdf.resolve())
        stat = pdf.stat()
        record = books.get(key, {})
        unchanged = (
            record.get("status") == "done"
            and record.get("size") == stat.st_size
            and record.get("mtime") == int(stat.st_mtime)
        )
        if not force and unchanged:
            continue
        pending.append((pdf, key, stat))

    # Books extracted earlier (maybe with --no-index) still need indexing.
    to_index: list[tuple[Path, str]] = []
    if index:
        for key, record in books.items():
            if record.get("status") != "done" or record.get("indexed"):
                continue
            path = Path(record.get("jsonl") or "")
            if path.exists():
                to_index.append((path, key))

    if progress:
        print(f"[library] {len(pdfs)} PDF، {len(pending)} کتاب برای پردازش "
              f"({len(pdfs) - len(pending)} قبلاً تمام شده، {len(to_index)} در انتظار ایندکس)",
              flush=True)

    done = pages = chars = failed = 0
    proc_seconds = 0.0
    batch: list[tuple[Path, str]] = list(to_index)
    ingested = {"documents": 0, "chunks": 0, "skipped_duplicates": 0}
    started = time.time()

    group_size = max(1, min(8, int(extract_kwargs.get("workers") or os.cpu_count() or 4)))

    def pending_with_results():
        """Extract a group of books on one shared pool, then yield them one by one."""
        nonlocal proc_seconds
        for offset in range(0, len(pending), group_size):
            group = pending[offset:offset + group_size]
            started_group = time.time()
            try:
                results = extract_many([pdf for pdf, _k, _s in group],
                                       root=str(root_path), progress=progress,
                                       **extract_kwargs)
            except Exception as exc:  # noqa: BLE001 - report, never abort the queue
                results = [{"pdf": str(pdf), "error": str(exc), "page_texts": {}}
                           for pdf, _k, _s in group]
            group_seconds = time.time() - started_group
            proc_seconds += group_seconds
            # Pages are interleaved across the group, so split its wall time by
            # page count instead of pretending each book timed itself.
            total_pages = sum(max(1, item.get("pages") or 1) for item in results) or 1
            for item in results:
                share = group_seconds * (max(1, item.get("pages") or 1)) / total_pages
                item["seconds"] = round(share, 1)
                ran = item.get("ocr_this_run") or 0
                item["pages_per_sec"] = round(ran / share, 2) if share else 0.0
            found = {str(Path(item["pdf"])): item for item in results}
            for item in group:
                yield item, found.get(str(item[0]))

    for i, ((pdf, key, stat), extracted) in enumerate(pending_with_results(), start=1):
        book_started = time.time()
        if not extracted or extracted.get("error") or not extracted.get("page_texts"):
            error = (extracted or {}).get("error", "متني استخراج نشد")
            proc_seconds += time.time() - book_started
            failed += 1
            books[key] = {"status": "failed", "error": str(error)[:300],
                          "size": stat.st_size, "mtime": int(st.st_mtime)}
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"[library] ✗ {pdf.name}: {error}", flush=True)
            continue

        rel = pdf.relative_to(base).as_posix()
        out = ext_dir / f"{_slug(rel)}.jsonl"
        write_jsonl(extracted, out)

        books[key] = {
            "status": "done",
            "pages": extracted["pages"],
            "ocr_pages": extracted["ocr_pages"],
            "chars": extracted["chars"],
            "seconds": extracted["seconds"],
            "dpi": extracted["dpi"],
            "engine": extracted["engine"],
            "jsonl": str(out),
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        batch.append((out, key))
        proc_seconds += time.time() - book_started
        done += 1
        pages += extracted["pages"]
        chars += extracted["chars"]

        if progress:
            elapsed = time.time() - started
            rate = pages / elapsed if elapsed else 0
            avg_pages = pages / done
            remaining = (len(pending) - i) * avg_pages
            eta_min = (remaining / rate / 60) if rate else 0
            print(f"[library] {i}/{len(pending)} {pdf.name}: {extracted['pages']} صفحه، "
                  f"{extracted['seconds']}s، {extracted['pages_per_sec']} صفحه/ث (کتاب {i})",
                  flush=True)
            print(f"[library] تا اینجا {pages} صفحه، {rate:.1f} صفحه/ثانیه، "
                  f"ETA ~{eta_min:.0f} دقیقه", flush=True)

        if index and len(batch) >= batch_size:
            ingested = _flush(batch, root_path, embedder, progress, ingested, books, manifest_path)
            batch = []

    if index and batch:
        ingested = _flush(batch, root_path, embedder, progress, ingested, books, manifest_path)

    elapsed = time.time() - started
    return {
        "pdfs": len(pdfs),
        "processed": done,
        "failed": failed,
        "skipped_done": len(pdfs) - len(pending),
        "pages": pages,
        "chars": chars,
        "seconds": round(elapsed, 1),
        "processing_seconds": round(proc_seconds, 1),
        "pages_per_sec": round(pages / proc_seconds, 2) if proc_seconds else 0.0,
        "indexed": ingested,
        "manifest": str(manifest_path),
    }
