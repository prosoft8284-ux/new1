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
import shutil
import subprocess
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

from .textutil import looks_garbled

UA = "bookfetch/0.3 (+https://archive.org; read-only research tool)"
TEXT_TYPES = {"application/pdf": "pdf", "application/epub+zip": "epub", "text/plain": "txt"}
ARCHIVE_LANG = {"fa": "Persian", "ar": "Arabic", "en": "English"}
MIN_SCORE = 0.30  # below this the title barely relates to the query


# -- http ------------------------------------------------------------------
def _get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _get_json(url: str, timeout: int = 60) -> dict:
    return json.loads(_get(url, timeout).decode("utf-8", "replace"))


def _robots_groups(text: str) -> list[tuple[list[str], list[tuple[bool, str]]]]:
    groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
    agents: list[str] = []
    rules: list[tuple[bool, str]] = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if rules:  # a new group begins
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif key == "allow":
            rules.append((True, value))
        elif key == "disallow":
            rules.append((False, value))
    if agents or rules:
        groups.append((agents, rules))
    return groups


def _rule_matches(pattern: str, path: str) -> bool:
    """Robots patterns support `*` and a trailing `$`; robotparser does not.

    This is the whole reason this function exists: ghaemiyeh.com forbids
    `/*/library/download/`, which the stdlib parser silently treats as allowed.
    """
    if not pattern:
        return False
    anchored = pattern.endswith("$")
    body = pattern[:-1] if anchored else pattern
    regex = re.escape(body).replace(r"\*", ".*")
    return re.match(regex + ("$" if anchored else ""), path) is not None


def path_allowed(robots_text: str, path: str, agent: str = "*") -> bool:
    """True when the longest matching rule for this path is an Allow."""
    path = path or "/"
    chosen: list[list[tuple[bool, str]]] = []
    specific, wildcard = [], []
    for agents, rules in _robots_groups(robots_text):
        if agent.lower() in agents:
            specific = rules
        elif "*" in agents:
            wildcard = rules
    chosen.append(specific or wildcard)
    rules = [rule for group in chosen for rule in group]
    best_len, verdict = -1, True
    for allow, pattern in rules:
        if _rule_matches(pattern, path):
            size = len(pattern)
            if size > best_len or (size == best_len and allow):
                best_len, verdict = size, allow
    return verdict


def robots_allows(url: str) -> tuple[bool, str]:
    """Ask the site itself whether this exact path may be fetched.

    If robots.txt cannot be read (403, timeout), we allow with a warning rather
    than pretend the site forbade it: an unreadable file is not a refusal.
    """
    parts = urllib.parse.urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        text = _get(robots_url, timeout=30).decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - unreadable robots is not a refusal
        return True, f"{robots_url} unreadable ({type(exc).__name__}); proceeding cautiously"
    if not _robots_groups(text):
        return True, f"{robots_url} (no rules)"
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return path_allowed(text, path), robots_url


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
    # Squared coverage, so one shared word out of three is worth little: an exact
    # title match must beat a title that happens to contain "Protestant".
    coverage = len(wanted & title) / len(wanted)
    extra = 0.15 * len(wanted & creator) / len(wanted)
    free = 0.10 if candidate.get("rights") == "NOT_IN_COPYRIGHT" else 0.0
    popular = 0.0
    if coverage >= 2 / 3:  # popularity must not rescue a half-matching title
        popular = min(0.10, math.log10(1 + (candidate.get("downloads") or 0)) / 40)
    return round(min(1.0, coverage ** 2 + extra + free + popular), 4)


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
    rows = max(10, min(100, limit * 20))  # filtering happens after the fetch
    docs: list[dict] = []
    seen: set[str] = set()
    attempts = ([" AND language:(" + ARCHIVE_LANG[lang] + ")"] if lang in ARCHIVE_LANG else [])
    for clause in variants:
        for suffix in attempts + [""]:
            q = "mediatype:texts AND " + clause + suffix
            # Without an explicit sort, archive.org returns near-random order:
            # "Protestant Ethic Weber" came back as Florida church journals.
            url = ("https://archive.org/advancedsearch.php?q=" + urllib.parse.quote(q)
                   + fields + "&rows=" + str(rows) + "&sort%5B%5D=downloads+desc"
                   + "&output=json")
            page = _get_json(url).get("response", {}).get("docs", [])
            for doc in page:
                ident = str(doc.get("identifier"))
                if ident not in seen:
                    seen.add(ident)
                    docs.append(doc)
            if page:
                break  # this clause works; a looser one would only add noise
        # Stop once enough results actually answer the query.
        if sum(1 for d in docs if score(base, {"title": d.get("title"),
                                             "creator": d.get("creator"),
                                             "rights": d.get("possible-copyright-status")}) >= 0.30
               ) >= rows:
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
        if candidate["score"] < MIN_SCORE:
            continue  # "Max Weber" must not return "Tap Titans 2"
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


def search(query: str, lang: str | None = None, limit: int = 10,
           source: str = "all") -> list[dict]:
    """`source`: archive | gutenberg | web | all.

    `web` goes through the `agent-reach` CLI (Exa backend), which reaches books
    archive.org does not index — Persian PDFs on library sites, Wikisource files.
    """
    found: list[dict] = []
    if source in ("archive", "all"):
        found += search_archive(query, lang=lang, limit=limit)
    if source in ("gutenberg", "all"):
        found += search_gutenberg(query, lang=lang, limit=limit)
    if source in ("web", "all"):
        found += search_web(query, lang=lang, limit=limit)
    found.sort(key=lambda c: (-c["score"], -(c.get("downloads") or 0)))
    return found[:limit]


# -- open web via agent-reach ---------------------------------------------
def _reach_binary() -> str | None:
    found = shutil.which("agent-reach")
    if found:
        return found
    fallback = Path.home() / ".local" / "bin" / "agent-reach"
    return str(fallback) if fallback.exists() else None


def _reach_json(*args: str, timeout: int = 180) -> dict | None:
    """Run one agent-reach command and parse its single JSON object."""
    binary = _reach_binary()
    if not binary:
        return None
    try:
        done = subprocess.run([binary, *args], capture_output=True, text=True, timeout=timeout,
                              check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return None


def search_web(query: str, lang: str | None = None, limit: int = 10) -> list[dict]:
    """Find book files on the open web; unreadable results just return nothing."""
    suffix = " كتاب pdf" if lang == "ar" else " pdf"
    payload = _reach_json("web", "search", f"{query}{suffix}", "--limit", str(max(3, limit)))
    if not payload or not payload.get("ok"):
        return []
    out = []
    for item in payload.get("items", []):
        url = str(item.get("url") or "")
        if not url.startswith("http"):
            continue
        lowered = url.lower()
        is_file = lowered.endswith(".pdf") or lowered.endswith(".epub") \
            or "/library-files/" in lowered
        candidate = {
            "source": "web",
            "id": url,
            "url": url,
            "title": item.get("title"),
            "creator": item.get("author"),
            "year": None,
            "language": lang,
            "rights": "unknown (open web)",
            "license": None,
            "downloads": None,
            "page": url,
            "file": is_file,
        }
        candidate["score"] = score(query, candidate)
        out.append(candidate)
    # A real file always beats a page about the book, whatever the title match.
    return sorted(out, key=lambda c: (not c["file"], -c["score"]))[:limit]


# -- page -> file resolution -----------------------------------------------
_PDF_HREF = re.compile(r'''["'(]([^"'()\s<>]+\.pdf)''', re.I)
_WIKI_PREFIXES = ("ملف:", "File:", "فایل:", "Datei:")


def _looks_like_file(url: str) -> bool:
    return url.lower().split("?")[0].endswith((".pdf", ".epub"))


def resolve_pdf(url: str) -> str | None:
    """Turn a book page into the address of its actual file.

    Search engines return pages; the file is one hop away. Two hops cover most
    of it: a Wikisource `File:x.pdf` page maps to Special:Redirect, and any other
    page is fetched once (robots permitting) and its first `.pdf` link taken.
    """
    parts = urllib.parse.urlsplit(url)
    name = urllib.parse.unquote(parts.path)
    # A Wikisource/Commons `File:...pdf` page also ends in .pdf, so this check has
    # to come before the extension check — otherwise the HTML page is "the file".
    if "/wiki/" in name:
        tail = name.split("/wiki/", 1)[1]
        if tail.startswith(_WIKI_PREFIXES):
            for prefix in _WIKI_PREFIXES:
                if tail.startswith(prefix):
                    return (f"{parts.scheme}://{parts.netloc}/wiki/Special:Redirect/file/"
                            + urllib.parse.quote(tail[len(prefix):]))
    if _looks_like_file(url):
        return url
    allowed, _note = robots_allows(url)
    if not allowed:
        return None
    try:
        html = _get(url, timeout=60).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001 - an unreachable page is just unresolved
        return None
    for raw in _PDF_HREF.findall(html):
        return urllib.parse.urljoin(url, raw)
    return None


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
    """Trust the bytes, not the extension.

    A store page saved as `.pdf` is a common failure: the extension lies, so the
    header decides. HTML is rejected outright — that is a paywall or an error
    page, never a book.
    """
    with path.open("rb") as handle:
        head = handle.read(512)
    suffix = path.suffix.lower()
    if head.startswith(b"%PDF"):
        return "pdf" if suffix in (".pdf", "") else "pdf"
    if head.startswith(b"PK\x03\x04"):
        if suffix == ".epub":
            return "epub"
        raise SystemExit(f"{path.name}: ZIP, not an EPUB — probably an error page")
    stripped = head.lstrip()
    if stripped[:1] == b"<":
        raise SystemExit(f"{path.name}: HTML, not a book — a paywall, a login page or a 404 "
                         "(store pages cannot be fetched as files)")
    if suffix == ".pdf":
        raise SystemExit(f"{path.name}: named .pdf but the bytes are not a PDF")
    try:
        head.decode("utf-8")
        return "txt"
    except UnicodeDecodeError:
        raise SystemExit(f"{path.name}: not a PDF, EPUB or text file") from None


def _text_layer_state(path: Path) -> str:
    """Will the pipeline need OCR? Record the answer at download time.

    Reading a book's embedded text layer is ~0.01s, while discovering it is
    garbage after indexing costs a re-OCRed book, so we sample three pages now.
    """
    if path.suffix.lower() != ".pdf":
        return "n/a"
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - pymupdf ships with the pipeline
        return "unknown"
    try:
        doc = pymupdf.open(path)
        if len(doc) == 0:
            return "absent"
        picks = {min(int(len(doc) * f), len(doc) - 1) for f in (0.25, 0.5, 0.75)}
        text = "".join(doc[p].get_text() for p in sorted(picks))
        doc.close()
    except Exception:  # noqa: BLE001 - a broken PDF is reported, not fatal
        return "unknown"
    if len(text.strip()) < 40:
        return "absent"
    return "garbled" if looks_garbled(text) else "clean"


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
    # Write beside the target and rename only after the bytes check: a rejected
    # download must not leave a fake .pdf behind for the library to pick up.
    staging = target.with_name(f"{target.stem}.part{target.suffix}")
    staging.write_bytes(blob)
    try:
        entry["format"] = _verify(staging)
    except SystemExit:
        staging.unlink(missing_ok=True)
        raise
    entry["file"] = name
    entry["bytes"] = len(blob)
    entry["text_layer"] = _text_layer_state(staging)
    staging.replace(target)
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
    """Download a file link, or the file a book page points at."""
    ok, note = robots_allows(url)
    if not ok:
        raise SystemExit(
            f"خود سایت این مسیر را ممنوع کرده ({note}): {url}\n"
            "این صفحه یا مسیر دانلود با robots.txt بسته شده است. ابزار دور نمی‌زند: "
            "کتاب را دستی از همان سایت بگیر و در books/ بگذار؛ بقیه‌ی کار (OCR، ایندکس، "
            "جست‌وجو) با `python -m rag library --dir books` انجام می‌شود."
        )
    target = resolve_pdf(url)
    if not target:
        raise SystemExit(f"{url}: صفحه‌ای که لینک فایل ندارد (دانلود با جاوااسکریپت یا فرم)")
    allowed, note = robots_allows(target)
    if not allowed:
        raise SystemExit(
            f"این مسیر را خود سایت ممنوع کرده ({note}): {target}\n"
            "robots.txt اجازه نمی‌دهد؛ فایل را دستی دانلود کن و در books/ بگذار. "
            "مسیر مجاز: پایپ‌لاین از فایل‌های محلی استفاده می‌کند."
        )
    blob = _get(target, timeout=600)
    suffix = Path(urllib.parse.urlsplit(target).path).suffix or ".pdf"
    # Page titles look like "File:x.pdf - Wikimedia Commons"; keep the book name.
    clean_title = (title or "").split(" - ")[0].split(" | ")[0].strip()
    clean_title = re.sub(r"^(File:|ملف:|فایل:)", "", clean_title, flags=re.I)
    clean_title = re.sub(r"\.(pdf|epub|djvu)$", "", clean_title, flags=re.I)
    name = _safe_name(clean_title or Path(urllib.parse.urlsplit(target).path).stem) + suffix
    entry = {"source": "direct-url", "page_url": url, "source_url": target, "robots": note,
             "title": title, "rights": "user-supplied; verify the licence yourself"}
    path = _save(blob, out_dir, name, entry)
    return {"path": str(path), "bytes": len(blob), "robots": note, "file_url": target}
