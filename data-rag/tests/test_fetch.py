"""Offline tests for the book fetcher: ranking and file safety.

Network behaviour is exercised by `rag fetch` itself, not here.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from rag.fetch import _pick_file, _safe_name, _text_layer_state, _verify, score


class RankingTests(unittest.TestCase):
    def test_title_match_beats_unrelated(self):
        query = "بوستان سعدی"
        good = {"title": "بوستان سعدی", "creator": "سعدی", "rights": "NOT_IN_COPYRIGHT"}
        bad = {"title": "تاریخ طبری", "creator": "طبری", "rights": "NOT_IN_COPYRIGHT"}
        self.assertGreater(score(query, good), score(query, bad))
        self.assertEqual(score(query, bad), 0.1, "only the public-domain nudge is left")

    def test_creator_match_adds_a_little(self):
        query = "دیوان حافظ"
        with_creator = {"title": "دیوان", "creator": "حافظ", "rights": "NOT_IN_COPYRIGHT"}
        without = {"title": "دیوان", "creator": "کسی دیگر", "rights": "NOT_IN_COPYRIGHT"}
        self.assertGreater(score(query, with_creator), score(query, without))

    def test_empty_query_scores_zero(self):
        self.assertEqual(score("", {"title": "هر چیزی"}), 0.0)


class SearchSmokeTests(unittest.TestCase):
    """`search()` wires two sources together; a swapped keyword broke it once."""

    def test_search_merges_both_sources(self):
        import rag.fetch as fetch

        def fake_json(url, timeout=60):
            if "archive.org" in url:
                return {"response": {"docs": [
                    {"identifier": "bustan", "title": "بوستان سعدی", "creator": "سعدی",
                     "possible-copyright-status": "NOT_IN_COPYRIGHT"},
                ]}}
            return {"results": [{"id": 1, "title": "The Bustan of Sadi", "authors": [],
                                 "languages": ["en"], "download_count": 5}]}

        def fake_web(query, lang=None, limit=10):
            return [{"source": "web", "id": "u", "url": "https://example.org/b.pdf",
                     "title": "Bustan", "creator": None, "year": None, "language": lang,
                     "rights": "unknown (open web)", "license": None, "downloads": None,
                     "page": "https://example.org/b.pdf", "file": True, "score": 0.5}]

        original_json, original_web = fetch._get_json, fetch.search_web
        fetch._get_json, fetch.search_web = fake_json, fake_web
        try:
            results = fetch.search("بوستان سعدی", lang="fa", limit=3)
        finally:
            fetch._get_json, fetch.search_web = original_json, original_web
        self.assertEqual({r["source"] for r in results}, {"archive.org", "gutenberg", "web"})
        self.assertEqual(results[0]["identifier"] if "identifier" in results[0] else results[0]["id"],
                         "bustan")


class RobotsTests(unittest.TestCase):
    ROBOTS = """# Search engines: full access, except file downloads
User-agent: *
Disallow: /library/download/
Disallow: /*/library/download/
Disallow: /file-access/
Disallow: /*/file-access/
Allow: /library/
Crawl-delay: 2
"""

    def test_wildcard_disallow_is_honoured(self):
        # The stdlib robotparser misses this: it has no `*` support.
        from rag.fetch import path_allowed
        self.assertFalse(path_allowed(self.ROBOTS, "/ar/library/download/6017591"))
        self.assertFalse(path_allowed(self.ROBOTS, "/ar/file-access/55"))
        self.assertFalse(path_allowed(self.ROBOTS, "/library/download/6017591"))

    def test_longest_match_wins(self):
        from rag.fetch import path_allowed
        self.assertTrue(path_allowed(self.ROBOTS, "/library/index"))
        self.assertTrue(path_allowed(self.ROBOTS, "/ar/book/123"))

    def test_other_agent_groups_do_not_leak(self):
        from rag.fetch import path_allowed
        text = "User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\n"
        self.assertFalse(path_allowed(text, "/private/x"))
        self.assertTrue(path_allowed(text, "/book/1"))


class FileTests(unittest.TestCase):
    def test_pick_file_prefers_largest_pdf(self):
        files = [
            {"name": "small.pdf", "size": "1000"},
            {"name": "big.pdf", "size": "9000"},
            {"name": "text.pdf", "size": "5000"},
            {"name": "book.epub", "size": "2000"},
        ]
        picked = _pick_file(files)
        self.assertEqual(picked["name"], "big.pdf")

    def test_pick_file_falls_back_to_other_formats(self):
        files = [{"name": "book.epub", "size": "2000"}, {"name": "notes.txt", "size": "10"}]
        self.assertEqual(_pick_file(files)["ext"], "epub")
        self.assertIsNone(_pick_file([{"name": "cover.jpg", "size": "5"}]))

    def test_safe_name_strips_path_characters(self):
        self.assertEqual(_safe_name("../etc/passwd"), "etc_passwd")
        self.assertTrue(_safe_name("کتاب بوستان") )

    def test_verify_rejects_zip_and_accepts_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "a.pdf"
            pdf.write_bytes(b"%PDF-1.4\n...")
            self.assertEqual(_verify(pdf), "pdf")

            epub = Path(tmp) / "b.epub"
            epub.write_bytes(b"PK\x03\x04rest")
            self.assertEqual(_verify(epub), "epub")

            zipped = Path(tmp) / "c.pdf"
            zipped.write_bytes(b"PK\x03\x04not-a-pdf")
            with self.assertRaises(SystemExit):
                _verify(zipped)

    def test_verify_rejects_html_saved_as_pdf(self):
        """A store page (paywall) served with a .pdf name must not pass."""
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / "book.pdf"
            page.write_bytes(b"<!DOCTYPE html><html><body>login</body></html>")
            with self.assertRaises(SystemExit):
                _verify(page)

    def test_text_layer_state_for_non_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            txt = Path(tmp) / "a.txt"
            txt.write_text("سلام", encoding="utf-8")
            self.assertEqual(_text_layer_state(txt), "n/a")


if __name__ == "__main__":
    unittest.main()
