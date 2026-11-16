"""Download ten public-domain Persian/Arabic books for a real end-to-end test.

Every item is verified before download: `archive.org` must report
`possible-copyright-status = NOT_IN_COPYRIGHT` for the identifier, otherwise the
item is skipped instead of downloaded. That field is archive.org's own
determination for the scanned volume, and all of these were printed between 1851
and 1906, so the works themselves are long out of copyright.

Why not قائمیه or فقاهت: their robots.txt disallows automated downloads
(`Disallow: /library/download/`, `/file-access/`) and eshia blocks AI agents by
name, so downloading from them programmatically is off the table. Books from
those sites still work with this pipeline — put them in `books/` yourself.

    .venv/bin/python sample/fetch_public_domain.py --out books

Files are written to `books/` (git-ignored) together with `books/SOURCES.json`,
which records identifier, title, year, rights status and the exact source URL so
the provenance of every test book stays auditable.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# Five Persian, five Arabic: scanned volumes, archive.org verified public domain.
ITEMS = [
    "tutinamehv00nakhgoog",        # طوطی‌نامه، ۱۸۵۸
    "leboustndesadte00grafgoog",   # بوستان سعدی، ۱۸۵۸
    "gtyimanmifrs00delhuoft",      # ۱۹۰۰
    "alnifalawwalwaa01qazvgoog",   # لباب الالباب عوفی، ۱۹۰۶
    "trkhiferozshhzi00ahmagoog",   # تاریخ فیروزشاهی، ۱۸۶۲
    "dwndesumeiribns00bartgoog",   # دیوان عمیر بن شجیم، ۱۹۰۲
    "aldurrahalalfya00zawgoog",    # الدرة الالفیه، ۱۹۰۰
    "almufaalopusder00algoog",     # المفصل فی صنعة الاعراب، ۱۸۷۹
    "alfijjahcarmend00mlgoog",     # الفیه ابن مالک، ۱۸۵۱
    "alkitbalmusammb00vlotgoog",   # المحاسن والاضداد، ۱۸۹۸
]

REQUIRED_RIGHTS = "NOT_IN_COPYRIGHT"
UA = "bookrag-public-domain-test/0.2 (+https://archive.org)"


def _get(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=120) as fh:
        return json.load(fh)


def _pick_pdf(files: list[dict]) -> dict | None:
    """The largest PDF is the full scanned volume, not a preview derivative."""
    pdfs = [f for f in files if str(f.get("name", "")).lower().endswith(".pdf")]
    return max(pdfs, key=lambda f: int(f.get("size") or 0)) if pdfs else None


def _verify_pdf(path: Path) -> int:
    """Refuse anything that is not a readable PDF; return its page count."""
    import pymupdf

    with path.open("rb") as fh:
        if fh.read(4) != b"%PDF":
            raise SystemExit(f"{path.name}: not a PDF")
    with pymupdf.open(path) as doc:
        return doc.page_count


def fetch(out_dir: Path, only_new: bool = True) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    sources_path = out_dir / "SOURCES.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.exists() else {}
    downloaded = 0
    for identifier in ITEMS:
        meta = _get(f"https://archive.org/metadata/{identifier}")
        info = meta.get("metadata", {})
        rights = str(info.get("possible-copyright-status") or "")
        if rights != REQUIRED_RIGHTS:
            print(f"skip {identifier}: rights={rights or 'unknown'} (needs {REQUIRED_RIGHTS})")
            continue
        pdf = _pick_pdf(meta.get("files", []))
        if not pdf:
            print(f"skip {identifier}: no PDF derivative")
            continue
        target = out_dir / f"{identifier}.pdf"
        if only_new and target.exists() and sources.get(identifier, {}).get("bytes") == target.stat().st_size:
            print(f"have {identifier} ({target.stat().st_size / 1e6:.1f} MB)")
            continue
        url = f"https://archive.org/download/{identifier}/{urllib.parse.quote(pdf['name'])}"
        print(f"get  {identifier} ({int(pdf.get('size') or 0) / 1e6:.1f} MB)")
        request = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(request, timeout=600) as response, target.open("wb") as fh:
            while chunk := response.read(1 << 20):
                fh.write(chunk)
        pages = _verify_pdf(target)
        sources[identifier] = {
            "identifier": identifier,
            "title": info.get("title"),
            "creator": info.get("creator"),
            "date": info.get("date") or info.get("year"),
            "language": info.get("language"),
            "rights": rights,
            "licenseurl": info.get("licenseurl"),
            "source_url": f"https://archive.org/details/{identifier}",
            "file_url": url,
            "file": target.name,
            "bytes": target.stat().st_size,
            "pages": pages,
        }
        sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=1), encoding="utf-8")
        downloaded += 1
    print(f"\n{len(sources)} books in {out_dir} (downloaded {downloaded} now)")
    for ident, rec in sources.items():
        print(f"  {ident:32s} {rec['pages']:4d}p  {rec['date']}  {str(rec['title'])[:45]}")
    return 0 if sources else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="books", help="پوشه مقصد (پیش‌فرض: books)")
    parser.add_argument("--force", action="store_true", help="دوباره دانلود کن")
    args = parser.parse_args()
    return fetch(Path(args.out), only_new=not args.force)


if __name__ == "__main__":
    sys.exit(main())
