"""Regression tests for the parts that fail silently if they break.

Run with: .venv/bin/python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from rag.ingest import remove_documents, run_ingest
from rag.library import _content_key, _keep_pdf, _load_manifest, _save_manifest
from rag.search import Retriever, build_context
from rag.textutil import (chunk_text, detect_language, lam_alef_variants,
                          looks_garbled, normalize, query_terms)


class TextTests(unittest.TestCase):
    def test_normalize_folds_arabic_variants(self):
        self.assertEqual(normalize("كتابِ عربي"), "کتاب عربی")
        self.assertEqual(normalize("سال ۱۳۹۰"), "سال 1390")

    def test_detect_language(self):
        self.assertEqual(detect_language("این کتاب‌ها درباره تاریخ ایران است و آن را باید خواند"),
                         "fa")
        self.assertEqual(detect_language("السلطة على فرض القرار في الدولة الحديثة"), "ar")
        self.assertEqual(detect_language(
            "این کتاب فارسی است و درباره انقلاب مشروطه سخن گفته؛ نقل‌قول عربي هم دارد: "
            "السلطة على القرار"), "mixed")

    def test_lam_alef_variants_cover_both_spellings(self):
        self.assertIn("استقلال", lam_alef_variants("استقالل"))
        self.assertIn("استقالل", lam_alef_variants("استقلال"))

    def test_query_terms_drop_stopwords_and_keep_short_words_out(self):
        terms = query_terms("کتاب در مورد انقلاب مشروطه")
        self.assertIn("انقلاب", terms)
        self.assertNotIn("در", terms)

    def test_chunking_overlaps_and_respects_budget(self):
        text = " ".join(["این یک جمله آزمایشی است."] * 120)
        chunks = chunk_text(text, max_chars=300, overlap_chars=60)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 380 for c in chunks))

    def test_garbled_text_layer_is_flagged(self):
        good = "این کتاب درباره تاریخ ایران است و در آن از دوره قاجار سخن گفته شده است. " * 3
        self.assertFalse(looks_garbled(good))
        # Unmapped glyphs: text exists, but it is not Persian/Arabic letters.
        self.assertTrue(looks_garbled("ÐÑ Ð¾Ðº Ð½Ð° Ð²Ñ ÐµÑ ÐºÐ¸ Ð¿ÑÐ°Ð²Ð¸Ð»Ð° Ð¸ Ð½Ð¾ÑÐ¼Ñ " * 4))
        # Arabic-script words with no function words at all: reversed word order.
        self.assertTrue(looks_garbled(" ".join(["بابلا", "روشک", "ناهج", "رد", "دش"] * 8)))


class IngestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.docs = self.root / "docs.jsonl"
        rows = [
            {"id": "a#p0001", "title": "الف", "text": "انقلاب مشروطه در ایران رخ داد و ساختار قدرت را دگرگون کرد. " * 4,
             "category": "تاریخ", "lang": "fa"},
            {"id": "b#p0001", "title": "ب", "text": "السلطة على فرض القرار السياسي في الدولة الحديثة والمجتمع المدني. " * 4,
             "category": "سیاست", "lang": "ar"},
        ]
        self.docs.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def _ingest(self, **kwargs):
        return run_ingest(str(self.docs), root=str(self.root), embedder_backend="hash",
                          progress_hint=False, **kwargs)

    def test_incremental_ingest_is_idempotent(self):
        first = self._ingest()
        self.assertEqual(first["documents"], 2)
        second = self._ingest()
        self.assertEqual(second["documents"], 0)
        self.assertEqual(second["skipped_duplicates"], 2)

    def test_dedupe_survives_deleting_the_corpus_cache(self):
        self._ingest()
        (self.root / "corpus.duckdb").unlink(missing_ok=True)
        third = self._ingest()
        self.assertEqual(third["documents"], 0, "dedupe must not depend on the disposable cache")
        self.assertEqual(third["skipped_duplicates"], 2)

    def test_remove_documents_drops_parquet_and_vectors(self):
        self._ingest()
        summary = remove_documents(root=str(self.root), books=["a#p0001"], dry_run=True)
        self.assertEqual(summary["documents_removed"], 1)
        self.assertTrue(any((self.root / "raw").rglob("*.parquet")), "dry run must not delete")

        summary = remove_documents(root=str(self.root), books=["a.pdf"])
        self.assertEqual(summary["documents_removed"], 0, "unknown book matches nothing")

        summary = remove_documents(root=str(self.root), books=["a*"])
        self.assertEqual(summary["documents_removed"], 1)
        self.assertEqual(summary["vectors_left"], 1)


class LibraryHelperTests(unittest.TestCase):
    def test_manifest_roundtrip_and_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "library.json"
            self.assertEqual(_load_manifest(path), {})
            _save_manifest(path, {"a": {"status": "done"}})
            self.assertEqual(_load_manifest(path), {"a": {"status": "done"}})
            path.write_text("{ broken", encoding="utf-8")
            self.assertEqual(_load_manifest(path), {})
            self.assertTrue(path.with_name("library.json.corrupt").exists())

    def test_content_key_matches_copies(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "book.pdf"
            copy = Path(tmp) / "book (1).pdf"
            original.write_bytes(b"x" * 5000)
            copy.write_bytes(b"x" * 5000)
            self.assertEqual(_content_key(original), _content_key(copy))

    def test_include_exclude_and_hidden_files(self):
        self.assertTrue(_keep_pdf("a/book.pdf", None, None))
        self.assertFalse(_keep_pdf(".hidden/book.pdf", None, None))
        self.assertFalse(_keep_pdf("a/._book.pdf", None, None))
        self.assertFalse(_keep_pdf("a/draft.pdf", ["*تاریخ*"], None))
        self.assertTrue(_keep_pdf("a/تاریخ ایران.pdf", ["*تاریخ*"], None))
        self.assertFalse(_keep_pdf("a/draft.pdf", None, ["*draft*"]))


class SearchTests(unittest.TestCase):
    def test_rerank_prefers_the_passage_that_covers_the_query(self):
        fused = [("weak", 0.9), ("strong", 0.5)]
        docs = {
            "weak": {"text": "متن نامرتبط درباره کشاورزی و آب و هوا", "title": ""},
            "strong": {"text": "انقلاب مشروطه در ایران رخ داد و ساختار قدرت را دگرگون کرد",
                       "title": "تاریخ مشروطه"},
        }
        ranked = Retriever._rerank(None, "انقلاب مشروطه ایران", fused, docs)
        self.assertEqual(ranked[0][0], "strong")

    def test_build_context_cites_sources_and_respects_budget(self):
        hits = {"results": [
            {"rank": 1, "title": "ت", "source": "a.pdf#page=7", "text": "متن " * 500, "id": "a"},
            {"rank": 2, "title": "ث", "source": "b.pdf#page=2", "text": "متن دیگر " * 500, "id": "b"},
        ]}
        context = build_context(hits, max_chars=1200, per_hit=900)
        self.assertIn("a.pdf#page=7", context)
        self.assertLessEqual(len(context), 1400)


if __name__ == "__main__":
    unittest.main()
