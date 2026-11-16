"""Batch OCR over a whole folder of books: resumable, with progress and ETA.

The manifest (`data/library.json`) records every book by absolute path plus size
and mtime, so re-running the command skips what is already done, retries what
failed, and never re-OCRs a page that is still in the page cache.

Indexing is done in batches rather than once at the end: a 1000-book run that
dies at book 900 should not lose its index work.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import re
import time
from pathlib import Path

from .ingest import run_ingest
from .pdf import extract_many, write_jsonl


def _slug(rel: str) -> str:
    return re.sub(r"[^\w\u0600-\u06FF.-]+", "_", rel)[:120]


def _save_manifest(path: Path, books: dict) -> None:
    """Atomic write: a crash mid-save must never leave an unparsable manifest."""
    payload = json.dumps({"books": books}, ensure_ascii=False, indent=1)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def _load_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - a truncated file should cost one warning, not a run
        backup = path.with_name(path.name + ".corrupt")
        path.replace(backup)
        print(f"[library] مانیفست قابل خواندن نبود؛ به {backup.name} منتقل شد و از نو ساخته می‌شود",
              flush=True)
        return {}
    return data.get("books", {}) if isinstance(data, dict) else {}


def _write_progress(root: Path, payload: dict) -> None:
    """Publish machine-readable progress so a run can be inspected without the log."""
    path = root / "library-progress.json"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def _pid_alive(pid) -> bool:
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except (OSError, ValueError):
        return False
    return True


def library_status(root: str = "data") -> dict:
    """What the library looks like right now, without touching the index.

    Reads only the manifest and the progress file, so it is safe (and cheap) to
    call while a run is in flight — the page cache is what it counts.
    """
    root_path = Path(root)
    books = _load_manifest(root_path / "library.json")
    counts: dict[str, int] = {}
    pages = chars = failed_pages = 0
    suspects = []
    for record in books.values():
        status = str(record.get("status") or "unknown")
        counts[status] = counts.get(status, 0) + 1
        if status == "done":
            pages += int(record.get("pages") or 0)
            chars += int(record.get("chars") or 0)
            failed_pages += len(record.get("failed_pages") or [])
            if record.get("quality"):
                suspects.append({"book": Path(record.get("jsonl") or "").stem,
                                 "warnings": record["quality"]})
    progress_path = root_path / "library-progress.json"
    progress = (json.loads(progress_path.read_text(encoding="utf-8"))
                if progress_path.exists() else {})
    cache_files = len(list((root_path / "ocr").glob("**/p*.txt"))) \
        if (root_path / "ocr").exists() else 0
    return {
        "books": counts,
        "done_books": counts.get("done", 0),
        "pending": int(progress.get("remaining") or 0),
        "running": _pid_alive(progress.get("pid")),
        "progress": progress,
        "pages": pages,
        "chars": chars,
        "chars_per_page": round(chars / pages, 1) if pages else 0.0,
        "failed_pages": failed_pages,
        "suspect_books": suspects[:20],
        "cached_pages": cache_files,
    }


def _content_key(path: Path) -> str:
    """Fingerprint for duplicate detection: size plus a hash of the first 4 MiB.

    Full-file hashing a 1000-book library costs more IO than it is worth; a book
    copy differs in name only, so size plus the opening megabytes is enough.
    """
    digest = hashlib.sha1()
    size = path.stat().st_size
    with path.open("rb") as fh:
        digest.update(fh.read(4 * 1024 * 1024))
    return f"{size}:{digest.hexdigest()}"


def _keep_pdf(rel: str, include: list[str] | None, exclude: list[str] | None) -> bool:
    name = Path(rel).name
    if name.startswith("._") or any(part.startswith(".") for part in Path(rel).parts):
        return False
    if include and not any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(name, pat)
                           for pat in include):
        return False
    if exclude and any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(name, pat)
                       for pat in exclude):
        return False
    return True


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
    _save_manifest(manifest_path, books)
    return totals


def run_library(directory: str = "books", root: str = "data", index: bool = True,
                limit: int | None = None, force: bool = False, batch_size: int = 25,
                embedder: str = "auto", progress: bool = True,
                include: list[str] | None = None, exclude: list[str] | None = None,
                **extract_kwargs) -> dict:
    base = Path(directory)
    if not base.exists():
        raise SystemExit(f"پوشه پیدا نشد: {base} (PDFها را داخل آن بگذار)")
    pdfs = sorted(
        p for p in base.rglob("*")
        if p.suffix.lower() == ".pdf" and _keep_pdf(p.relative_to(base).as_posix(),
                                                    include, exclude)
    )
    if limit:
        pdfs = pdfs[:limit]
    if not pdfs:
        raise SystemExit(f"هیچ PDFی در {base} پیدا نشد")

    root_path = Path(root)
    ext_dir = root_path / "extracted"
    ext_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = root_path / "library.json"
    books: dict = _load_manifest(manifest_path)

    # Older manifests predate content keys; backfill them so duplicate detection
    # works on the very first run after upgrading, not only for new books.
    for book_path, record in books.items():
        if record.get("status") == "done" and not record.get("content_key"):
            existing = Path(book_path)
            if existing.exists():
                record["content_key"] = _content_key(existing)

    # A book copied under another name would otherwise be OCR'd and indexed twice.
    by_hash: dict[str, str] = {
        rec["content_key"]: path for path, rec in books.items()
        if rec.get("content_key") and rec.get("status") == "done"
    }
    pending: list[tuple[Path, str, os.stat_result, str]] = []
    duplicates: list[dict] = []
    removed_skipped = 0
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
        if not force and record.get("status") == "removed":
            removed_skipped += 1
            continue
        content_key = _content_key(pdf)
        twin = by_hash.get(content_key)
        if twin and twin != key and not force:
            books[key] = {"status": "duplicate", "of": twin, "size": stat.st_size,
                          "mtime": int(stat.st_mtime), "content_key": content_key}
            duplicates.append({"pdf": str(pdf), "of": twin})
            print(f"[library] = {pdf.name} تکرارِ {Path(twin).name} است؛ رد شد", flush=True)
            continue
        by_hash.setdefault(content_key, key)
        pending.append((pdf, key, stat, content_key))

    # Books extracted earlier (maybe with --no-index) still need indexing.
    to_index: list[tuple[Path, str]] = []
    if index:
        for key, record in books.items():
            if record.get("status") != "done" or record.get("indexed"):
                continue  # removed/duplicate books are intentionally not indexed
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
    pid_file = root_path / "library.pid"
    pid_file.write_text(str(os.getpid()), encoding="utf-8")

    group_size = max(1, min(8, int(extract_kwargs.get("workers") or os.cpu_count() or 4)))

    def pending_with_results():
        """Extract a group of books on one shared pool, then yield them one by one."""
        nonlocal proc_seconds
        for offset in range(0, len(pending), group_size):
            group = pending[offset:offset + group_size]
            started_group = time.time()
            try:
                results = extract_many([pdf for pdf, _k, _s, _c in group],
                                       root=str(root_path), progress=progress,
                                       **extract_kwargs)
            except Exception as exc:  # noqa: BLE001 - report, never abort the queue
                results = [{"pdf": str(pdf), "error": str(exc), "page_texts": {}}
                           for pdf, _k, _s, _c in group]
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

    suspects: list[dict] = []
    for i, ((pdf, key, stat, content_key), extracted) in enumerate(pending_with_results(),
                                                                  start=1):
        book_started = time.time()
        if not extracted or extracted.get("error") or not extracted.get("page_texts"):
            error = (extracted or {}).get("error", "متني استخراج نشد")
            proc_seconds += time.time() - book_started
            failed += 1
            books[key] = {"status": "failed", "error": str(error)[:300],
                          "size": stat.st_size, "mtime": int(st.st_mtime)}
            _save_manifest(manifest_path, books)
            print(f"[library] ✗ {pdf.name}: {error}", flush=True)
            continue

        rel = pdf.relative_to(base).as_posix()
        out = ext_dir / f"{_slug(rel)}.jsonl"
        write_jsonl(extracted, out)

        warnings = list(extracted.get("warnings") or [])
        if warnings:
            suspects.append({"pdf": pdf.name, "warnings": warnings,
                             "failed_pages": extracted.get("failed_pages") or []})
            print(f"[library] ! {pdf.name}: {', '.join(warnings)}", flush=True)
        books[key] = {
            "status": "done",
            "pages": extracted["pages"],
            "ocr_pages": extracted["ocr_pages"],
            "chars": extracted["chars"],
            "chars_per_page": extracted.get("chars_per_page"),
            "seconds": extracted["seconds"],
            "dpi": extracted["dpi"],
            "engine": extracted["engine"],
            "content_key": content_key,
            "quality": warnings,
            "failed_pages": extracted.get("failed_pages") or [],
            "jsonl": str(out),
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _save_manifest(manifest_path, books)
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

        _write_progress(root_path, {
            "pid": os.getpid(),
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total": len(pending),
            "processed": done,
            "failed": failed,
            "remaining": len(pending) - i,
            "pages": pages,
            "pages_per_sec": round(pages / max(1e-6, time.time() - started), 2),
            "current": pdf.name,
            "index": bool(index),
        })

        if index and len(batch) >= batch_size:
            ingested = _flush(batch, root_path, embedder, progress, ingested, books, manifest_path)
            batch = []

    if index and batch:
        ingested = _flush(batch, root_path, embedder, progress, ingested, books, manifest_path)

    elapsed = time.time() - started
    _write_progress(root_path, {
        "pid": None,
        "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(pending),
        "processed": done,
        "failed": failed,
        "remaining": 0,
        "pages": pages,
        "pages_per_sec": round(pages / max(1e-6, elapsed), 2),
        "current": None,
        "index": bool(index),
    })
    pid_file.unlink(missing_ok=True)
    return {
        "pdfs": len(pdfs),
        "processed": done,
        "failed": failed,
        "duplicates": len(duplicates),
        "removed_skipped": removed_skipped,
        "suspect_books": suspects,
        "skipped_done": len(pdfs) - len(pending) - len(duplicates) - removed_skipped,
        "pages": pages,
        "chars": chars,
        "seconds": round(elapsed, 1),
        "processing_seconds": round(proc_seconds, 1),
        "pages_per_sec": round(pages / proc_seconds, 2) if proc_seconds else 0.0,
        "indexed": ingested,
        "manifest": str(manifest_path),
    }
