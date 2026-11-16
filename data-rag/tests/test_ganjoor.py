"""Offline tests for the Ganjoor importer (network is stubbed)."""

from __future__ import annotations

import unittest

import rag.ganjoor as ganjoor


class PoetMatchTests(unittest.TestCase):
    def setUp(self):
        self.original = ganjoor._get_json
        ganjoor._get_json = lambda url, timeout=60: [
            {"id": 2, "name": "حافظ شیرازی", "nickname": "حافظ", "rootCatId": 9},
            {"id": 5, "name": "فردوسی", "nickname": "فردوسی", "rootCatId": 16},
        ]

    def tearDown(self):
        ganjoor._get_json = self.original

    def test_exact_name(self):
        self.assertEqual(ganjoor.find_poet("فردوسی")["id"], 5)

    def test_arabic_letters_normalise(self):
        # «حافظ شيرازي» with Arabic yeh/kaf must still find the poet.
        self.assertEqual(ganjoor.find_poet("حافظ شيرازي")["id"], 2)

    def test_unknown_poet_is_an_error(self):
        with self.assertRaises(SystemExit):
            ganjoor.find_poet("شاعر ناموجود")


class PoemRowTests(unittest.TestCase):
    def test_sections_join_into_one_text(self):
        cat = {"title": "غزلیات", "poems": [{
            "id": 2130, "title": "غزل شمارهٔ ۱", "fullUrl": "/hafez/ghazal/sh1",
            "mainSections": [{"plainText": "بیت اول"}, {"plainText": "بیت دوم"}],
        }]}
        rows = ganjoor._poem_rows(cat, ["حافظ", "غزلیات"], "حافظ شیرازی")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["text"], "بیت اول\nبیت دوم")
        self.assertEqual(rows[0]["id"], "ganjoor:حافظ شیرازی:2130")
        self.assertEqual(rows[0]["title"], "حافظ › غزلیات › غزل شمارهٔ ۱")
        self.assertTrue(rows[0]["source"].endswith("/hafez/ghazal/sh1"))

    def test_empty_poems_are_dropped(self):
        cat = {"title": "x", "poems": [{"id": 1, "title": "empty", "mainSections": []}]}
        self.assertEqual(ganjoor._poem_rows(cat, [], "p"), [])


if __name__ == "__main__":
    unittest.main()
