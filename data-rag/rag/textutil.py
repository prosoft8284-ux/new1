"""Text normalisation (Persian/Arabic aware), chunking and query terms."""

from __future__ import annotations

import re

_CHAR_MAP = {
    "ي": "ی",  # Arabic yeh
    "ى": "ی",
    "ك": "ک",  # Arabic kaf
    "ۀ": "ه",
    "ة": "ه",
    "أ": "ا",
    "إ": "ا",
    "آ": "ا",
    "ٱ": "ا",
    "ؤ": "و",
    "\u0640": "",  # tatweel
}
for _i, _c in enumerate("۰۱۲۳۴۵۶۷۸۹"):
    _CHAR_MAP[_c] = str(_i)
for _i, _c in enumerate("٠١٢٣٤٥٦٧٨٩"):
    _CHAR_MAP[_c] = str(_i)

_TRANS = str.maketrans(_CHAR_MAP)
_DIACRITICS = re.compile(r"[\u064B-\u0652\u0670\u0653-\u0655]")
_NON_WORD = re.compile(r"[^\w\s\u0600-\u06FF]+", re.UNICODE)
_SPACES = re.compile(r"\s+")

# Very small stopword list: only what shows up in nearly every Persian sentence.
STOPWORDS = {
    "و", "در", "به", "از", "که", "این", "را", "با", "برای", "است", "آن", "یک",
    "تا", "هم", "بر", "یا", "شود", "شد", "شدن", "می", "نیز", "بود", "بودن",
    "های", "ها", "اما", "اگر", "چه", "چی", "کدام", "چگونه", "چرا", "the", "of",
    "and", "a", "an", "to", "in", "is", "for", "on", "with", "how", "what",
}


def normalize(text: str) -> str:
    """Fold Arabic/Persian variants, strip diacritics and punctuation, lowercase."""
    if not text:
        return ""
    t = str(text).translate(_TRANS)
    t = t.replace("\u200c", " ")  # ZWNJ -> space so words stay searchable
    t = _DIACRITICS.sub("", t)
    t = _NON_WORD.sub(" ", t)
    return _SPACES.sub(" ", t).strip().lower()


# Letters that only occur in Persian (or are the Persian form) vs Arabic-only forms.
_PERSIAN_MARKERS = set("پچژگکی")
_ARABIC_MARKERS = set("يكةىئؤ")


def detect_language(text: str) -> str:
    """Cheap fa/ar/mixed detector for Persian and Arabic script.

    Persian and Arabic share almost all letters, so the discriminator is the
    handful of letters that differ: پ چ ژ گ and the Persian ک/ی versus Arabic
    ك/ي/ة/ى. Diacritics and Arabic-Indic vs Persian digits are deliberately
    ignored because both scripts use them.
    """
    if not text:
        return "fa"
    fa = sum(1 for ch in text if ch in _PERSIAN_MARKERS)
    ar = sum(1 for ch in text if ch in _ARABIC_MARKERS)
    if fa >= 5 and fa > 2 * ar:
        return "fa"
    if ar >= 5 and ar > 2 * fa:
        return "ar"
    if fa or ar:
        return "mixed"
    return "fa"


def lam_alef_variants(term: str) -> list[str]:
    """Handles the `لا` ligature that many PDF text layers extract reversed.

    Persian PDFs routinely turn «استقلال» into «استقالل» because the lam-alef
    ligature is written as alef+lam. Swapping mid-word «ال» and «لا» both ways
    covers either spelling, and the stored text is never modified.
    """
    out = [term]
    if len(term) < 4:
        return out
    if "ال" in term[1:]:
        out.append(term.replace("لا", "\x00").replace("ال", "لا").replace("\x00", "لا"))
    if "لا" in term[1:]:
        out.append(term.replace("ال", "\x00").replace("لا", "ال").replace("\x00", "ال"))
    # «الله» often arrives as «اهلل»
    if term.startswith("اهلل"):
        out.append("الله" + term[4:])
    return out


def query_terms(query: str, max_terms: int = 12) -> list[str]:
    """Content words of a query, de-duplicated, stopwords removed.

    Each term also yields its lam-alef variants so a query spelled correctly
    still matches a document whose text layer mangled the ligature.
    """
    seen: list[str] = []
    for tok in normalize(query).split():
        if len(tok) < 2 or tok in STOPWORDS:
            continue
        for variant in lam_alef_variants(tok):
            if variant not in seen:
                seen.append(variant)
        if len(seen) >= max_terms:
            break
    return seen[: max_terms + 4]


def chunk_text(text: str, max_chars: int = 900, overlap_chars: int = 120) -> list[str]:
    """Sentence-aware chunking with a character overlap between neighbours."""
    text = _SPACES.sub(" ", str(text or "")).strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    sentences = [s for s in re.split(r"(?<=[.!?؟۔:])\s+|\n+", text) if s.strip()]
    chunks: list[str] = []
    cur = ""
    for sentence in sentences:
        if len(cur) + len(sentence) + 1 <= max_chars:
            cur = f"{cur} {sentence}".strip()
            continue
        if cur:
            chunks.append(cur)
        while len(sentence) > max_chars:  # one sentence longer than a chunk
            chunks.append(sentence[:max_chars])
            sentence = sentence[max_chars - overlap_chars :]
        cur = sentence
    if cur:
        chunks.append(cur)

    if overlap_chars > 0 and len(chunks) > 1:
        merged = [chunks[0]]
        for i in range(1, len(chunks)):
            merged.append(f"{chunks[i - 1][-overlap_chars:]} {chunks[i]}".strip())
        chunks = merged

    return [c for c in chunks if c.strip()]
