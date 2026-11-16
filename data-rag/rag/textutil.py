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


# Letters that exist in only one of the two scripts. ی/ک are deliberately left
# out: Tesseract's Arabic model often emits their Persian forms, so treating them
# as a Persian signal mislabels Arabic books (it did, before this fix).
_PERSIAN_LETTERS = set("پچژگۀ")
_ARABIC_LETTERS = set("ةىئؤ")

# Function words are a much stronger signal than single letters.
_PERSIAN_WORDS = {
    "است", "که", "را", "های", "برای", "این", "آن", "با", "از", "شود",
    "شد", "باشد", "نیست", "کرد", "می", "بر", "تا", "هم", "یک", "چه",
}
_ARABIC_WORDS = {
    "في", "من", "على", "إلى", "الى", "الذي", "التي", "هذا", "هذه",
    "كان", "لا", "ما", "عن", "أن", "إن", "مع", "بين", "كل", "هو", "هي",
    "ثم", "قد", "ولا", "وهو", "كما",
}


def detect_language(text: str) -> str:
    """fa / ar / mixed detector for Persian and Arabic script (weighted).

    Signals, strongest first: script-exclusive letters (پ چ ژ گ vs ة ى ئ ؤ) and
    function words. Persian ک/ی are ignored because they are not exclusive.
    """
    if not text:
        return "fa"
    tokens = normalize(text).split()
    fa_words = sum(1 for tok in tokens if tok in _PERSIAN_WORDS)
    ar_words = sum(1 for tok in tokens if tok in _ARABIC_WORDS)
    fa = 3 * sum(1 for ch in text if ch in _PERSIAN_LETTERS) + fa_words
    ar = 3 * sum(1 for ch in text if ch in _ARABIC_LETTERS) + ar_words
    if fa >= 3 and fa >= 2 * ar:
        return "fa"
    if ar >= 3 and ar >= 2 * fa:
        return "ar"
    if fa or ar:
        return "mixed"
    return "fa"


_ALL_FUNCTION_WORDS = _PERSIAN_WORDS | _ARABIC_WORDS
_WORD = re.compile(r"[\w\u0600-\u06FF]+")


def looks_garbled(text: str) -> bool:
    """Cheap sanity check for a PDF text layer that exists but is unusable.

    Old Persian/Arabic PDFs often ship a text layer whose glyphs are unmapped or
    emitted in reverse. The page "has text", so nothing OCRs it, and the garbage
    goes straight into the index. Two signals catch almost all of it: almost no
    Arabic-script letters, or almost none of the handful of words that appear in
    nearly every sentence of the language.
    """
    words = _WORD.findall(text or "")
    if len(words) < 25:
        return False  # too little text to judge; the length rules already cover it
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return True
    script = sum(1 for ch in letters if "\u0600" <= ch <= "\u06FF") / len(letters)
    if script < 0.5:
        return True
    common = sum(1 for word in words if word in _ALL_FUNCTION_WORDS)
    return common / len(words) < 0.01


def _swap_pairs(term: str, src: str, dst: str) -> str:
    """Replace every non-overlapping `src` with `dst` in one left-to-right pass.

    A plain `str.replace` chain cannot do this: «استقلال» contains overlapping
    «ال» and «لا», so replacing one pair destroys the other. Scanning once keeps
    every match independent.
    """
    out: list[str] = []
    i = 0
    while i < len(term):
        if term.startswith(src, i):
            out.append(dst)
            i += len(src)
        else:
            out.append(term[i])
            i += 1
    return "".join(out)


def lam_alef_variants(term: str) -> list[str]:
    """Handles the `لا` ligature that many PDF text layers extract reversed.

    Persian PDFs routinely turn «استقلال» into «استقالل» because the lam-alef
    ligature is written as alef+lam. Swapping mid-word «ال» and «لا» both ways
    covers either spelling, and the stored text is never modified.
    """
    out = [term]
    if len(term) < 4:
        return out
    # Mid-word only: the leading «ال» of the Arabic article is not a ligature.
    for src, dst in (("لا", "ال"), ("ال", "لا")):
        if src in term[1:]:
            variant = _swap_pairs(term, src, dst)
            if variant not in out:
                out.append(variant)
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
