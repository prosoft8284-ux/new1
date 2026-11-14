"""Embedding backends: real multilingual models via fastembed, offline hash fallback.

The fallback keeps the whole pipeline runnable with zero downloads. It is a
character n-gram hashing embedder: good enough to test the plumbing, not a
semantic model. Use `--embedder fastembed` (default `auto`) for real quality.
"""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from .textutil import normalize

# Ordered by preference: multilingual first so Persian/Arabic input works.
PREFERRED_MODELS = [
    "intfloat/multilingual-e5-small",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "intfloat/multilingual-e5-base",
    "intfloat/multilingual-e5-large",
    "BAAI/bge-m3",
    "BAAI/bge-small-en-v1.5",
]


class Embedder:
    def __init__(self, backend: str = "auto", model: str | None = None, dim: int = 256):
        self.backend = ""
        self.model = ""
        self.dim = dim
        self._fast = None

        if backend in ("auto", "fastembed"):
            try:
                self._init_fastembed(model)
            except Exception as exc:  # noqa: BLE001 - fall back on any model/download issue
                if backend == "fastembed":
                    raise SystemExit(f"fastembed backend unavailable: {exc}") from exc
                print(f"[embedder] fastembed unavailable ({exc}); using offline hash embedder")

        if not self.backend:
            self.backend = "hash"
            self.model = f"hash-{dim}"
            self.dim = dim

    # -- fastembed ---------------------------------------------------------
    def _init_fastembed(self, model: str | None) -> None:
        from fastembed import TextEmbedding

        supported = TextEmbedding.list_supported_models()
        by_name = {}
        for entry in supported:
            name = entry.get("model") or entry.get("model_name")
            if name:
                by_name[name] = entry
        if not by_name:
            raise RuntimeError("fastembed reported no supported models")

        chosen = model or next((m for m in PREFERRED_MODELS if m in by_name), None)
        if chosen is None:
            chosen = next((m for m in by_name if "multilingual" in m.lower()), None)
        if chosen is None:
            raise RuntimeError(f"no multilingual model found in: {', '.join(sorted(by_name))[:300]}")
        if chosen not in by_name and model:
            raise RuntimeError(f"model {chosen!r} not supported by this fastembed build")

        entry = by_name[chosen]
        self._fast = TextEmbedding(model_name=chosen)
        self.backend = "fastembed"
        self.model = chosen
        self.dim = int(entry.get("dim") or len(self.embed_passages(["x"])[0]))

    def _fast_embed(self, texts: Sequence[str]) -> np.ndarray:
        vecs = list(self._fast.embed(list(texts), batch_size=64))
        return np.asarray(vecs, dtype=np.float32)

    # -- hash fallback -----------------------------------------------------
    @staticmethod
    def _hash_vec(text: str, dim: int) -> np.ndarray:
        import hashlib

        vec = np.zeros(dim, dtype=np.float32)
        t = normalize(text)
        for n in (3, 4, 5):
            for i in range(len(t) - n + 1):
                digest = hashlib.blake2b(t[i : i + n].encode("utf-8"), digest_size=8).digest()
                h = int.from_bytes(digest, "big")
                vec[h % dim] += 1.0 if (h >> 63) & 1 else -1.0
        return vec

    # -- public API --------------------------------------------------------
    def _prefix(self, kind: str) -> str:
        # e5 family expects "query:"/"passage:" task prefixes.
        return f"{kind}: " if "e5" in self.model.lower() else ""

    @staticmethod
    def _l2(vecs: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms

    def embed_passages(self, texts: Iterable[str]) -> np.ndarray:
        texts = list(texts)
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        if self.backend == "fastembed":
            vecs = self._fast_embed([self._prefix("passage") + t for t in texts])
        else:
            vecs = np.stack([self._hash_vec(t, self.dim) for t in texts])
        return self._l2(vecs.astype(np.float32))

    def embed_query(self, text: str) -> np.ndarray:
        if self.backend == "fastembed":
            vec = self._fast_embed([self._prefix("query") + text])[0]
        else:
            vec = self._hash_vec(text, self.dim)
        vec = vec.astype(np.float32)
        norm = np.linalg.norm(vec)
        return vec / norm if norm else vec

    def meta(self) -> dict:
        return {"embedder": self.backend, "model": self.model, "dim": self.dim}

    @classmethod
    def from_meta(cls, meta: dict) -> "Embedder":
        if meta.get("embedder") == "fastembed":
            return cls(backend="fastembed", model=meta.get("model"), dim=meta.get("dim", 256))
        return cls(backend="hash", dim=int(meta.get("dim", 256)))
