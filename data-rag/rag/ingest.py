"""Ingest documents -> partitioned Parquet (raw text) + LanceDB (vectors only).

Layout produced:
    data/raw/category=<cat>/year=<yyyy>/part-00000.parquet   (compressed raw text)
    data/idx/lance/chunks.lance                              (ids + vectors + filter columns)
    data/idx/meta.json                                       (embedder used)

Text is stored once, in Parquet. The vector index carries only ids and the
columns we filter on, so the two stores never duplicate the corpus.
"""

from __future__ import annotations

import csv
import json
import shutil
import time
from pathlib import Path
from typing import Iterator

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from .embedder import Embedder
from .textutil import chunk_text, detect_language, normalize

BATCH_ROWS = 20_000
COMPRESSION = "zstd"

PARQUET_COLUMNS = [
    "id", "doc_id", "chunk_index", "title", "text", "norm", "title_norm",
    "source", "published", "lang", "tokens",
]

VECTOR_SCHEMA_TAIL = ["id", "doc_id", "category", "lang", "year"]


def _iter_jsonl(path: Path) -> Iterator[dict]:
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def read_records(path: str | Path) -> Iterator[dict]:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"input not found: {p}")
    if p.suffix == ".jsonl":
        yield from _iter_jsonl(p)
    elif p.suffix == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("documents") or data.get("docs") or data.get("records") or []
        for row in data:
            yield row
    elif p.suffix == ".csv":
        with p.open(encoding="utf-8", newline="") as fh:
            yield from csv.DictReader(fh)
    elif p.suffix == ".parquet":
        yield from pq.read_table(p).to_pylist()
    else:
        raise SystemExit(f"unsupported input: {p.suffix} (use .jsonl, .json, .csv or .parquet)")


def _partition_of(row: dict) -> tuple[str, str]:
    category = str(row.get("category") or "general").strip() or "general"
    published = str(row.get("published") or "")
    year = published[:4] if published[:4].isdigit() and len(published) >= 4 else "unknown"
    return category.replace("/", "_"), year


class _RawWriter:
    """Writes Parquet files, one directory per (category, year) partition."""

    def __init__(self, raw_dir: Path):
        self.raw_dir = raw_dir
        self.counters: dict[tuple[str, str], int] = {}
        self._buf: dict[tuple[str, str], list[dict]] = {}
        self._rows = 0
        self.files = 0

    def add(self, part: tuple[str, str], row: dict) -> None:
        self._buf.setdefault(part, []).append(row)
        self._rows += 1

    def flush(self, force: bool = False) -> None:
        for part, rows in list(self._buf.items()):
            if not rows or (not force and len(rows) < BATCH_ROWS):
                continue
            self._write(part, rows)
            self._buf[part] = []
        if force:
            for part, rows in list(self._buf.items()):
                if rows:
                    self._write(part, rows)
                    self._buf[part] = []

    def _write(self, part: tuple[str, str], rows: list[dict]) -> None:
        category, year = part
        out_dir = self.raw_dir / f"category={category}" / f"year={year}"
        out_dir.mkdir(parents=True, exist_ok=True)
        if part not in self.counters:
            # Continue numbering after files from a previous (incremental) run
            # instead of overwriting part-00000.parquet in the same partition.
            self.counters[part] = len(list(out_dir.glob("part-*.parquet")))
        idx = self.counters[part]
        self.counters[part] = idx + 1
        table = pa.Table.from_pylist(rows, schema=parquet_schema())
        pq.write_table(table, out_dir / f"part-{idx:05d}.parquet", compression=COMPRESSION)
        self.files += 1


def parquet_schema() -> pa.Schema:
    return pa.schema([
        ("id", pa.string()),
        ("doc_id", pa.string()),
        ("chunk_index", pa.int32()),
        ("title", pa.string()),
        ("text", pa.string()),
        ("norm", pa.string()),
        ("title_norm", pa.string()),
        ("source", pa.string()),
        ("published", pa.string()),
        ("lang", pa.string()),
        ("tokens", pa.int32()),
    ])


def _load_existing_doc_ids(root: Path) -> set[str]:
    """Doc ids already in the corpus, so an incremental run stays idempotent."""
    import duckdb

    db_path = root / "corpus.duckdb"
    if not db_path.exists():
        return set()
    try:
        con = duckdb.connect(str(db_path), read_only=True)
        rows = con.execute("SELECT DISTINCT doc_id FROM chunks").fetchall()
        con.close()
        return {str(r[0]) for r in rows}
    except Exception:  # noqa: BLE001 - a stale/corrupt cache must not block ingest
        return set()


def _build_corpus_db(raw_dir: Path, root: Path) -> str:
    """Materialise the Parquet corpus into a DuckDB table for fast lexical filtering.

    Parquet stays the source of truth (portable, cheap, rebuildable); this file is
    a disposable cache that gives DuckDB zone maps and column statistics instead of
    re-opening every partition on each query.
    """
    import duckdb

    db_path = root / "corpus.duckdb"
    if db_path.exists():
        db_path.unlink()
    con = duckdb.connect(str(db_path))
    glob = str(raw_dir / "**" / "*.parquet")
    con.execute(
        "CREATE OR REPLACE TABLE chunks AS "
        "SELECT * FROM read_parquet(?, hive_partitioning=true)",
        [glob],
    )
    try:
        con.execute("CHECKPOINT")
    except Exception:  # noqa: BLE001
        pass
    con.close()
    return str(db_path)


def _vector_table(ids: list[str], doc_ids: list[str], cats: list[str], langs: list[str],
                  years: list[int], vecs: np.ndarray) -> pa.Table:
    dim = vecs.shape[1]
    flat = pa.array(vecs.reshape(-1), type=pa.float32())
    return pa.Table.from_arrays(
        [
            pa.array(ids, type=pa.string()),
            pa.array(doc_ids, type=pa.string()),
            pa.array(cats, type=pa.string()),
            pa.array(langs, type=pa.string()),
            pa.array(years, type=pa.int32()),
            pa.FixedSizeListArray.from_arrays(flat, dim),
        ],
        schema=pa.schema([
            ("id", pa.string()),
            ("doc_id", pa.string()),
            ("category", pa.string()),
            ("lang", pa.string()),
            ("year", pa.int32()),
            ("vector", pa.list_(pa.float32(), dim)),
        ]),
    )


def run_ingest(input_path: str, root: str = "data", embedder_backend: str = "auto",
               model: str | None = None, max_chars: int = 900, overlap: int = 120,
               rebuild: bool = False, limit: int | None = None,
               progress_hint: bool = True) -> dict:
    import lancedb

    root_path = Path(root)
    raw_dir = root_path / "raw"
    idx_dir = root_path / "idx"

    if rebuild:
        for d in (raw_dir, idx_dir):
            if d.exists():
                shutil.rmtree(d)
    idx_dir.mkdir(parents=True, exist_ok=True)

    embedder = Embedder(backend=embedder_backend, model=model)
    meta_path = idx_dir / "meta.json"
    previous = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else None
    if previous and int(previous.get("dim") or 0) != embedder.dim:
        raise SystemExit(
            f"ایندکس موجود با مدل دیگری ساخته شده (dim={previous.get('dim')} vs {embedder.dim}). "
            "با --rebuild دوباره بساز."
        )
    meta_path.write_text(json.dumps(embedder.meta(), ensure_ascii=False), encoding="utf-8")
    if progress_hint:
        print(f"[ingest] embedder={embedder.backend} model={embedder.model} dim={embedder.dim}")

    # Re-indexing the same document twice must not duplicate it.
    existing_docs = set() if rebuild else _load_existing_doc_ids(root_path)
    skipped = 0

    writer = _RawWriter(raw_dir)
    db = lancedb.connect(str(idx_dir / "lance"))
    table = None
    if not rebuild:
        try:
            names = set(db.table_names())
        except Exception:  # noqa: BLE001 - older lancedb
            names = set()
        if "chunks" in names:
            table = db.open_table("chunks")

    started = time.time()
    pending_ids: list[str] = []
    pending_docs: list[str] = []
    pending_cats: list[str] = []
    pending_langs: list[str] = []
    pending_years: list[list[int]] = []
    pending_text: list[str] = []
    docs = chunks = 0

    def flush_vectors() -> None:
        nonlocal table, pending_ids, pending_docs, pending_cats, pending_langs
        nonlocal pending_years, pending_text
        if not pending_text:
            return
        vecs = embedder.embed_passages(pending_text)
        arrow = _vector_table(pending_ids, pending_docs, pending_cats, pending_langs,
                              [y[0] for y in pending_years], vecs)
        if table is None:
            table = db.create_table("chunks", data=arrow, mode="overwrite")
        else:
            table.add(arrow)
        pending_ids, pending_docs, pending_cats = [], [], []
        pending_langs, pending_years, pending_text = [], [], []

    for rec in read_records(input_path):
        text = str(rec.get("text") or rec.get("content") or "")
        if not text.strip():
            continue
        doc_id = str(rec.get("id") or rec.get("doc_id") or f"doc-{docs:07d}")
        if doc_id in existing_docs:
            skipped += 1
            continue
        existing_docs.add(doc_id)
        docs += 1
        title = str(rec.get("title") or rec.get("name") or "")
        source = str(rec.get("source") or rec.get("url") or "")
        published = str(rec.get("published") or rec.get("date") or "")
        lang = str(rec.get("lang") or "").strip()
        if not lang or lang == "auto":
            lang = detect_language(text)
        part = _partition_of(rec)
        year_num = int(part[1]) if part[1].isdigit() else 0

        for i, piece in enumerate(chunk_text(text, max_chars=max_chars, overlap_chars=overlap)):
            cid = f"{doc_id}#{i}"
            writer.add(part, {
                "id": cid, "doc_id": doc_id, "chunk_index": i, "title": title,
                "text": piece, "norm": normalize(piece), "title_norm": normalize(title),
                "source": source, "published": published, "lang": lang,
                "tokens": len(piece.split()),
            })
            pending_ids.append(cid)
            pending_docs.append(doc_id)
            pending_cats.append(part[0])
            pending_langs.append(lang)
            pending_years.append([year_num])
            pending_text.append(piece)
            chunks += 1
            if len(pending_text) >= BATCH_ROWS:
                flush_vectors()
                writer.flush()
            if limit and chunks >= limit:
                break
        if limit and chunks >= limit:
            break

    flush_vectors()
    writer.flush(force=True)

    if table is None:
        raise SystemExit("nothing was ingested (no text found in input)")

    elapsed = time.time() - started
    # Compact the vector segments; harmless if the API is unavailable.
    try:
        table.optimize()
    except Exception:  # noqa: BLE001
        pass

    corpus_db = _build_corpus_db(raw_dir, root_path)
    parquet_bytes = sum(f.stat().st_size for f in raw_dir.rglob("*.parquet"))
    return {
        "documents": docs,
        "skipped_duplicates": skipped,
        "chunks": chunks,
        "parquet_files": writer.files,
        "parquet_mb": round(parquet_bytes / 1e6, 2),
        "vectors": table.count_rows(),
        "embedder": embedder.model,
        "seconds": round(elapsed, 1),
        "raw_dir": str(raw_dir),
        "index_dir": str(idx_dir / "lance"),
        "corpus_db": corpus_db,
    }
