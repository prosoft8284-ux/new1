"""Two-stage retrieval: DuckDB narrows on Parquet, LanceDB ranks vectors, RRF fuses.

Stage 1 (cheap, columnar): metadata filters + lexical term matching over the
partitioned Parquet corpus. Partition pruning means untouched partitions are
never opened.
Stage 2 (vectors): LanceDB ANN search, pre-filtered with the same metadata so
it only ever scans the requested slice.
Stage 3: reciprocal rank fusion of both candidate lists, then the text of the
winners is fetched from Parquet by id.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import duckdb
import numpy as np

from .embedder import Embedder
from .textutil import normalize, query_terms

RRF_K = 60
CACHE_SIMILARITY = 0.97
CACHE_ROWS = 5_000


def _sql_str(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _lance_str(value: str) -> str:
    return "'" + str(value).replace("'", "\\'") + "'"


class Retriever:
    def __init__(self, root: str = "data", k_vec: int = 60, k_lex: int = 60,
                 use_cache: bool = True):
        self.root = Path(root)
        self.raw_glob = str(self.root / "raw" / "**" / "*.parquet")
        meta_path = self.root / "idx" / "meta.json"
        if not meta_path.exists():
            raise SystemExit("no index found - run `python -m rag ingest --input ...` first")
        self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self.embedder = Embedder.from_meta(self.meta)
        self.k_vec = k_vec
        self.k_lex = k_lex
        self.use_cache = use_cache
        self.con = duckdb.connect(str(self.root / "cache.duckdb"))
        self.chunks_source = self._attach_corpus()
        import lancedb

        self.db = lancedb.connect(str(self.root / "idx" / "lance"))
        self.table = self.db.open_table("chunks")
        self._cache_ready = False
        self._cache_sig: str | None = None
        self._cache_vecs: list[np.ndarray] = []
        self._cache_ids: list[list[str]] = []
        self._cache_matrix: np.ndarray | None = None

    def _attach_corpus(self) -> str:
        """Use the prebuilt DuckDB table when present, else query Parquet directly."""
        corpus_db = self.root / "corpus.duckdb"
        parquet = f"read_parquet({_sql_str(self.raw_glob)}, hive_partitioning=true)"
        if corpus_db.exists():
            try:
                self.con.execute(f"ATTACH {_sql_str(str(corpus_db))} AS corpus (READ_ONLY)")
                return "corpus.chunks"
            except Exception:  # noqa: BLE001 - fall back to scanning Parquet
                pass
        return parquet

    # -- filters -----------------------------------------------------------
    @staticmethod
    def _filters(filters: dict[str, Any] | None):
        if not filters:
            return "", "TRUE", []
        sql_parts, params = [], []
        if filters.get("category"):
            cats = filters["category"]
            sql_parts.append("category IN (" + ",".join("?" * len(cats)) + ")")
            params += cats
        if filters.get("lang"):
            langs = filters["lang"]
            sql_parts.append("lang IN (" + ",".join("?" * len(langs)) + ")")
            params += langs
        if filters.get("year_from") is not None:
            sql_parts.append("year >= ?")
            params.append(int(filters["year_from"]))
        if filters.get("year_to") is not None:
            sql_parts.append("year <= ?")
            params.append(int(filters["year_to"]))
        sql_where = " AND ".join(sql_parts) if sql_parts else "TRUE"

        lance_parts = []
        if filters.get("category"):
            lance_parts.append("category IN (" + ",".join(_lance_str(c) for c in filters["category"]) + ")")
        if filters.get("lang"):
            lance_parts.append("lang IN (" + ",".join(_lance_str(c) for c in filters["lang"]) + ")")
        if filters.get("year_from") is not None:
            lance_parts.append(f"year >= {int(filters['year_from'])}")
        if filters.get("year_to") is not None:
            lance_parts.append(f"year <= {int(filters['year_to'])}")
        return " AND ".join(lance_parts), sql_where, params

    # -- stage 1: lexical + metadata over Parquet ---------------------------
    def lexical(self, terms: list[str], sql_where: str, params: list, limit: int) -> list[tuple[str, float]]:
        if not terms:
            return []
        score = " + ".join(
            ["(CASE WHEN norm LIKE ? THEN 1 ELSE 0 END) + "
             "3 * (CASE WHEN title_norm LIKE ? THEN 1 ELSE 0 END)"] * len(terms)
        )
        score_params: list[Any] = []
        for term in terms:
            score_params += [f"%{term}%", f"%{term}%"]
        sql = (
            f"SELECT id, lex FROM ("
            f"  SELECT id, ({score}) AS lex"
            f"  FROM {self.chunks_source}"
            f"  WHERE {sql_where}"
            f") WHERE lex > 0 ORDER BY lex DESC LIMIT ?"
        )
        rows = self.con.execute(sql, score_params + params + [limit]).fetchall()
        return [(r[0], float(r[1])) for r in rows]

    # -- stage 2: vector search in LanceDB ---------------------------------
    def vector(self, qvec: np.ndarray, lance_where: str, limit: int) -> list[tuple[str, float]]:
        query = self.table.search(qvec, vector_column_name="vector")
        try:
            query = query.metric("cosine")
        except Exception:  # noqa: BLE001 - older builds default to l2; vectors are normalised
            pass
        if lance_where:
            try:
                query = query.where(lance_where, prefilter=True)
            except TypeError:
                query = query.where(lance_where)
        rows = query.limit(limit).to_list()
        out = []
        for row in rows:
            distance = row.get("_distance")
            out.append((row["id"], 1.0 - float(distance) if distance is not None else 0.0))
        return out

    # -- fusion ------------------------------------------------------------
    @staticmethod
    def fuse(*ranked_lists: list[tuple[str, float]]) -> list[tuple[str, float]]:
        scores: dict[str, float] = {}
        for ranked in ranked_lists:
            for rank, (cid, _score) in enumerate(ranked):
                scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        return sorted(scores.items(), key=lambda kv: -kv[1])

    # -- cache -------------------------------------------------------------
    def _ensure_cache(self) -> None:
        if self._cache_ready:
            return
        for legacy in ("query_cache", "cache_entries"):
            self.con.execute(f"DROP TABLE IF EXISTS {legacy}")
        self.con.execute(
            "CREATE TABLE IF NOT EXISTS cache_v2 ("
            "query VARCHAR, sig VARCHAR, qvec BLOB, dim INTEGER, ids VARCHAR[], "
            "created_at TIMESTAMP)"
        )
        self._cache_ready = True  # rows load lazily per filter signature

    def _load_cache(self, sig: str) -> None:
        self._cache_vecs, self._cache_ids, self._cache_matrix = [], [], None
        rows = self.con.execute(
            "SELECT qvec, ids FROM cache_v2 WHERE dim = ? AND sig = ? "
            "ORDER BY created_at DESC LIMIT ?",
            [self.embedder.dim, sig, CACHE_ROWS],
        ).fetchall()
        for blob, ids in rows:
            if not blob:
                continue
            vec = np.frombuffer(blob, dtype=np.float32)
            if vec.size != self.embedder.dim:
                continue
            self._cache_vecs.append(vec)
            self._cache_ids.append(list(ids or []))

    def _matrix(self) -> np.ndarray | None:
        if not self._cache_vecs:
            return None
        if self._cache_matrix is None:
            self._cache_matrix = np.stack(self._cache_vecs)
        return self._cache_matrix

    def cache_lookup(self, qvec: np.ndarray, sig: str = "") -> list[str] | None:
        """Return the ids of a semantically near-identical past query, if any."""
        if not self.use_cache:
            return None
        self._ensure_cache()
        if sig != getattr(self, "_cache_sig", None):
            self._load_cache(sig)
            self._cache_sig = sig
        matrix = self._matrix()
        if matrix is None:
            return None
        sims = matrix @ qvec
        best = int(np.argmax(sims))
        if float(sims[best]) >= CACHE_SIMILARITY and self._cache_ids[best]:
            return list(self._cache_ids[best])
        return None

    def cache_store(self, query: str, qvec: np.ndarray, ids: list[str], sig: str = "") -> None:
        if not self.use_cache or not ids:
            return
        self._ensure_cache()
        vec = np.asarray(qvec, dtype=np.float32)
        self.con.execute(
            "INSERT INTO cache_v2 VALUES (?, ?, ?, ?, ?, now())",
            [query, sig, vec.tobytes(), self.embedder.dim, list(ids)],
        )
        if sig == getattr(self, "_cache_sig", None):
            self._cache_vecs.append(vec)
            self._cache_ids.append(list(ids))
            self._cache_matrix = None

    # -- fetch text --------------------------------------------------------
    def fetch(self, ids: list[str]) -> dict[str, dict]:
        if not ids:
            return {}
        placeholders = ",".join("?" * len(ids))
        sql = (
            "SELECT id, doc_id, title, text, source, published, category, year, lang"
            f" FROM {self.chunks_source}"
            f" WHERE id IN ({placeholders})"
        )
        rows = self.con.execute(sql, ids).fetchall()
        cols = ["id", "doc_id", "title", "text", "source", "published",
                "category", "year", "lang"]
        return {r[0]: dict(zip(cols, r)) for r in rows}

    # -- public ------------------------------------------------------------
    def search(self, query: str, k: int = 8, filters: dict[str, Any] | None = None) -> dict:
        t0 = time.perf_counter()
        qvec = self.embedder.embed_query(query)
        embed_ms = (time.perf_counter() - t0) * 1000

        lance_where, sql_where, params = self._filters(filters)

        sig = json.dumps(filters or {}, sort_keys=True, ensure_ascii=False)
        source = "hybrid"
        fused: list[tuple[str, float]] = []
        docs: dict[str, dict] = {}

        cached_ids = self.cache_lookup(qvec, sig)
        if cached_ids:
            fused = [(cid, 1.0) for cid in cached_ids][:k]
            docs = self.fetch([cid for cid, _ in fused])
            if docs:
                source = "cache"
            else:  # stale cache (index rebuilt with new ids) -> search for real
                fused, docs = [], {}

        if not fused:
            terms = query_terms(query)
            lex_hits = self.lexical(terms, sql_where, params, self.k_lex)
            vec_hits = self.vector(qvec, lance_where, self.k_vec)
            fused = self.fuse(vec_hits, lex_hits)[:k]
            docs = self.fetch([cid for cid, _ in fused])
            self.cache_store(query, qvec, [cid for cid, _ in fused], sig)
        results = []
        for rank, (cid, score) in enumerate(fused, start=1):
            row = docs.get(cid)
            if not row:
                continue
            results.append({
                "rank": rank,
                "id": cid,
                "score": round(score, 5),
                "title": row["title"],
                "text": row["text"],
                "source": row["source"],
                "category": row["category"],
                "year": row["year"],
                "lang": row["lang"],
                "published": row["published"],
            })

        return {
            "query": query,
            "terms": query_terms(query),
            "path": source,
            "candidates": {"vectors": self.k_vec, "lexical": self.k_lex},
            "embed_ms": round(embed_ms, 1),
            "total_ms": round((time.perf_counter() - t0) * 1000, 1),
            "results": results,
        }

    def stats(self) -> dict:
        row = self.con.execute(
            "SELECT count(*), count(DISTINCT doc_id), count(DISTINCT category), "
            f"count(DISTINCT year) FROM {self.chunks_source}"
        ).fetchone()
        files = list((self.root / "raw").rglob("*.parquet"))
        return {
            "chunks": row[0],
            "documents": row[1],
            "partitions": len(files),
            "categories": row[2],
            "years": row[3],
            "parquet_files": len(files),
            "parquet_mb": round(sum(f.stat().st_size for f in files) / 1e6, 2),
            "vectors": self.table.count_rows(),
            "embedder": self.meta.get("model"),
            "dim": self.meta.get("dim"),
            "corpus_db": "corpus.duckdb" if self.chunks_source == "corpus.chunks" else None,
        }


def build_context(hits: dict, max_chars: int = 6000, per_hit: int = 900) -> str:
    """Turn search results into a compact, citable prompt block for an LLM.

    Each passage is truncated to its own budget so a long chunk can never push
    the whole context over the limit (or crowd out every other source).
    """
    header = "به سؤال کاربر فقط بر اساس منابع زیر پاسخ بده و شماره منبع را ذکر کن.\n\n"
    blocks: list[str] = []
    used = len(header)
    for hit in hits["results"]:
        budget = min(per_hit, max_chars - used)
        if budget < 120:
            break
        body = " ".join(hit["text"].split())
        if len(body) > budget:
            body = body[:budget].rstrip() + "..."
        block = f"[{hit['rank']}] {hit['title']} ({hit['source'] or 'بدون منبع'})\n{body}"
        blocks.append(block)
        used += len(block) + 2
    return header + "\n\n".join(blocks)
