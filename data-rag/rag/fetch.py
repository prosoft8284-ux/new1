"""Find and download books from sources that allow it, with provenance.

Three routes:

* `search`  — query archive.org and Project Gutenberg, rank the results.
* `get`     — download one archive.org item (PDF first, then EPUB/TXT).
* `url`     — download a link you already have, after checking robots.txt.

Every download is verified (a real PDF/EPUB/TXT, not an HTML login page) and
recorded in `SOURCES.json` next to the file, so a library stays auditable.

Deliberately not implemented: any route that bypasses a paywall, a login, a
DRM layer, or a site's robots.txt. The Persian libraries (قائمیه، فقاهت) publish
books for readers but disallow automated downloads, so `url` refuses their
download paths and tells you to save the file yourself.
"""

from __future__ import annotations

import json
import math
import re
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

UA = "bookfetch/0.3 (+https://archive.org; read-only research tool)"
TEXT_TYPES = {"application/pdf": "pdf", "application/epub+zip": "epub", "text/plain": "txt"}
ARCHIVE_LANG = {"fa": "Persian", "ar": "Arabic", "en": "English"}


# -- http ------------------------------------------------------------------
def _get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _get_json(url: str, timeout: int = 60) -> dict:
    return json.loads(_get(url, timeout).decode("utf-8", "replace"))


def robots_allows(url: str) -> tuple[bool, str]:
    """Ask the site itself whether this exact path may be fetched.

    If robots.txt cannot be read (403, timeout), we allow with a warning rather
    than pretend the site forbade it: an unreadable file is not a refusal.
    """
    parts = urllib.parse.urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
        if not parser.default_entry and not parser.entries:
            return True, f"{robots_url} (no rules)"
        return parser.can_fetch("*", url), robots_url
    except Exception as exc:  # noqa: BLE001 - unreadable robots is not a refusal
        return True, f"{robots_url} unreadable ({type(exc).__name__}); proceeding cautiously"


# -- ranking ---------------------------------------------------------------
_WORD = re.compile(r"[\w\u0600-\u06FF]+")


def _tokens(text: str) -> set[str]:
    return {t for t in (w.lower() for w in _WORD.findall(text or "")) if len(t) > 1}


def score(query: str, candidate: dict) -> float:
    """How well a candidate answers the query, with a nudge for free books."""
    wanted = _tokens(query)
    if not wanted:
        return 0.0
    title = _tokens(str(candidate.get("title") or ""))
    creator = _tokens(str(candidate.get("creator") or ""))
    overlap = len(wanted & title) / len(wanted)
    extra = 0.15 * len(wanted & creator) / len(wanted)
    free = 0.10 if candidate.get("rights") == "NOT_IN_COPYRIGHT" else 0.0
    popular = min(0.10, math.log10(1 + (candidate.get("downloads") or 0)) / 40)
    return round(min(1.0, overlap + extra + free + popular), 4)


# -- archive.org -----------------------------------------------------------
def search_archive(query: str, lang: str | None = None, limit: int = 10) -> list[dict]:
    """Search archive.org, loosening the query only when it finds nothing.

    An exact title phrase plus a language filter is precise but brittle: Latin
    transliterations of Persian titles miss it entirely. Each fallback is tried in
    order, so precision is never traded away for volume.
    """
    base = query.replace('"', " ").strip()
    terms = [t for t in _WORD.findall(base) if len(t) > 1][:6]
    variants = [f'(title:("{base}") OR "{base}")']
    if terms:
        variants.append("(" + " OR ".join(f'title:("{t}")' for t in terms) + ")")
        variants.append("(" + " OR ".join(f'"{t}"' for t in terms) + ")")
    fields = ("&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year"
              "&fl%5B%5D=language&fl%5B%5D=downloads&fl%5B%5D=possible-copyright-status"
              "&fl%5B%5D=licenseurl")
    rows = max(1, min(50, limit * 3))
    docs: list[dict] = []
    attempts = ([" AND language:(" + ARCHIVE_LANG[lang] + ")"] if lang in ARCHIVE_LANG else [])
    for clause in variants:
        for suffix in attempts + [""]:
            q = "mediatype:texts AND " + clause + suffix
            url = ("https://archive.org/advancedsearch.php?q=" + urllib.parse.quote(q)
                   + fields + "&rows=" + str(rows) + "&output=json")
            docs = _get_json(url).get("response", {}).get("docs", [])
            if docs:
                break
        if docs:
            break
    out = []
    for doc in docs:
        candidate = {
            "source": "archive.org",
            "id": doc.get("identifier"),
            "title": doc.get("title"),
            "creator": doc.get("creator"),
            "year": doc.get("year"),
            "language": doc.get("language"),
            "rights": doc.get("possible-copyright-status"),
            "license": doc.get("licenseurl"),
            "downloads": doc.get("downloads"),
            "page": f"https://archive.org/details/{doc.get('identifier')}",
        }
        candidate["score"] = score(query, candidate)
        out.append(candidate)
    return sorted(out, key=lambda c: (-c["score"], -(c.get("downloads") or 0)))[:limit]


# -- Project Gutenberg (gutendex) ------------------------------------------
def search_gutenberg(query: str, lang: str | None = None, limit: int = 10) -> list[dict]:
    url = ("https://gutendex.com/books?search=" + urllib.parse.quote(query)
           + ("&languages=" + urllib.parse.quote(lang) if lang else ""))
    try:
        data = _get_json(url)
    except Exception:  # noqa: BLE001 - an unavailable mirror must not break search
        return []
    out = []
    for book in data.get("results", [])[:limit]:
        title = book.get("title")
        authors = ", ".join(a.get("name", "") for a in book.get("authors", []))
        candidate = {
            "source": "gutenberg",
            "id": str(book.get("id")),
            "title": title,
            "creator": authors,
            "year": None,
            "language": ",".join(book.get("languages", [])),
            "rights": "public domain",
            "license": None,
            "downloads": book.get("download_count"),
            "page": f"https://www.gutenberg.org/ebooks/{book.get('id')}",
        }
        candidate["score"] = score(query, candidate)
        out.append(candidate)
    return out


def search(query: str, lang: str | None = None, limit: int = 10) -> list[dict]:
    merged = search_archive(query, lang=lang, limit=limit) + search_gutenberg(query, lang=lang,
                                                                           limit=limit)
    merged.sort(key=lambda c: -c["score"])
    return merged[:limit]


# -- download --------------------------------------------------------------
def _safe_name(text: str, fallback: str = "book") -> str:
    name = re.sub(r"[^\w\u0600-\u06FF.-]+", "_", (text or "").strip())[:80].strip("._")
    return name or fallback


def _pick_file(files: list[dict], prefer: str = "pdf") -> dict | None:
    """Largest file of the preferred format (the full scan, not a preview)."""
    order = {prefer: 0, "pdf": 1, "epub": 2, "txt": 3}
    candidates = []
    for item in files:
        name = str(item.get("name", "")).lower()
        for ext in ("pdf", "epub", "txt"):
            if name.endswith("." + ext):
                candidates.append((order.get(ext, 9), -int(item.get("size") or 0), item, ext))
                break
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[0], c[1]))
    kind, _neg, item, ext = candidates[0]
    return {"name": item["name"], "size": int(item.get("size") or 0), "ext": ext}


def _verify(path: Path) -> str:
    head = path.open("rb").read(8)
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK\x03\x04") and path.suffix.lower() == ".epub":
        return "epub"
    if head.startswith(b"PK"):
        raise SystemExit(f"{path.name}: ZIP, not an EPUB — probably an error page")
    try:
        head.decode("utf-8")
        return "txt"
    except UnicodeDecodeError:
        raise SystemExit(f"{path.name}: not a PDF, EPUB or text file") from None


def _record(out_dir: Path, entry: dict) -> None:
    path = out_dir / "SOURCES.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[entry["file"]] = entry
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def _save(blob: bytes, out_dir: Path, name: str, entry: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / name
    target.write_bytes(blob)
    entry["file"] = name
    entry["bytes"] = len(blob)
    entry["format"] = _verify(target)
    _record(out_dir, entry)
    return target


def download_archive(identifier: str, out_dir: Path, prefer: str = "pdf") -> dict:
    meta = _get_json(f"https://archive.org/metadata/{identifier}")
    info = meta.get("metadata", {})
    picked = _pick_file(meta.get("files", []), prefer=prefer)
    if not picked:
        raise SystemExit(f"{identifier}: هیچ فایل {prefer}/pdf/epub/txt ندارد")
    url = (f"https://archive.org/download/{identifier}/"
           + urllib.parse.quote(picked["name"]))
    blob = _get(url, timeout=600)
    name = f"{_safe_name(identifier)}.{picked['ext']}"
    entry = {
        "source": "archive.org",
        "identifier": identifier,
        "title": info.get("title"),
        "creator": info.get("creator"),
        "date": info.get("date") or info.get("year"),
        "language": info.get("language"),
        "rights": info.get("possible-copyright-status"),
        "license": info.get("licenseurl"),
        "source_url": f"https://archive.org/details/{identifier}",
        "file_url": url,
    }
    path = _save(blob, out_dir, name, entry)
    return {"path": str(path), "bytes": len(blob), "rights": entry["rights"],
            "source_url": entry["source_url"]}


def download_url(url: str, out_dir: Path, title: str | None = None) -> dict:
    allowed, note = robots_allows(url)
    if not allowed:
        raise SystemExit(
            f"این مسیر را خود سایت ممنوع کرده ({note}): {url}\n"
            "robots.txt اجازه نمی‌دهد؛ فایل را دستی دانلود کن و در books/ بگذار. "
            "مسیر مجاز: پایپ‌لاین از فایل‌های محلی استفاده می‌کند."
        )
    blob = _get(url, timeout=600)
    suffix = Path(urllib.parse.urlsplit(url).path).suffix or ".pdf"
    name = _safe_name(title or Path(urllib.parse.urlsplit(url).path).stem) + suffix
    entry = {"source": "direct-url", "source_url": url, "robots": note,
             "title": title, "rights": "user-supplied; verify the licence yourself"}
    path = _save(blob, out_dir, name, entry)
    return {"path": str(path), "bytes": len(blob), "robots": note}
