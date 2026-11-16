"""Import public-domain Persian poetry from Ganjoor's open API.

Ganjoor (ganjoor.net) publishes the classical Persian canon as plain text through
a free JSON API, and its robots.txt allows it. One request per book section
returns every poem in that section with full text, so a whole divan is a handful
of polite requests rather than a crawl.

This is the fastest way to fill an index with Persian: the text is already
correct, so there is no OCR and no `trust` question at all.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from .fetch import _get_json
from .textutil import normalize

API = "https://api.ganjoor.net/api/ganjoor"


def find_poet(name: str) -> dict:
    """Fuzzy-match a poet by name; Persian spelling varies (ی/ي، ک/ك، spacing)."""
    wanted = normalize(name)
    poets = _get_json(f"{API}/poets")
    best, best_score = None, 0.0
    for poet in poets:
        candidates = [poet.get("name") or "", poet.get("nickname") or ""]
        for text in candidates:
            other = normalize(text)
            if not other:
                continue
            if other == wanted:
                score = 1.0
            elif wanted in other or other in wanted:
                score = 0.8
            else:
                shared = len(set(wanted.split()) & set(other.split()))
                score = shared / max(1, len(set(wanted.split()) | set(other.split())))
            if score > best_score:
                best, best_score = poet, score
    if not best or best_score < 0.3:
        raise SystemExit(f"شاعری با نام «{name}» در گنجور پیدا نشد "
                         f"({len(poets)} شاعر جست‌وجو شد)")
    return best


def _cat(cat_id: int, tries: int = 3) -> dict:
    """A divan section can be several MB; give it time and retry once or twice."""
    last: Exception | None = None
    for attempt in range(1, tries + 1):
        try:
            return _get_json(f"{API}/cat/{cat_id}?poems=true&mainSections=true", timeout=180)
        except Exception as exc:  # noqa: BLE001 - network hiccups happen
            last = exc
            time.sleep(3 * attempt)
    raise SystemExit(f"بخش {cat_id} خوانده نشد ({type(last).__name__}: {last})")


def _poem_rows(cat: dict, path: list[str], poet: str) -> list[dict]:
    rows = []
    for poem in cat.get("poems") or []:
        sections = poem.get("mainSections") or []
        text = "\n".join(str(s.get("plainText") or "") for s in sections).strip()
        if not text:
            continue
        title = str(poem.get("title") or "").strip()
        rows.append({
            "id": f"ganjoor:{poet}:{poem.get('id')}",
            "title": " › ".join(path + [title]) if title else " › ".join(path),
            "text": text,
            "category": "شعر",
            "lang": "fa",
            "source": f"https://ganjoor.net{poem.get('fullUrl') or ''}",
            "published": None,
            "author": poet,
        })
    return rows


def collect(cat_id: int, poet: str, delay: float = 2.0, limit: int | None = None,
            path: list[str] | None = None, log=print) -> list[dict]:
    """Walk the section tree, sleeping `delay` between requests (Crawl-delay: 2)."""
    path = path or []
    payload = _cat(cat_id)
    cat = payload.get("cat") or {}
    here = path + [str(cat.get("title") or "")]
    rows = _poem_rows(cat, here, poet)
    log(f"  {(' › '.join(here))[:60]:<60} {len(rows):>4} شعر")
    for child in cat.get("children") or []:
        if limit and len(rows) >= limit:
            break
        time.sleep(delay)
        rows.extend(collect(child["id"], poet, delay=delay, limit=None, path=here, log=log))
    return rows[:limit] if limit else rows


def run(poet_name: str, out_path: Path, delay: float = 2.0, limit: int | None = None,
        log=print) -> dict:
    poet = find_poet(poet_name)
    name = poet.get("name") or poet_name
    log(f"گنجور: {name} (شناسه {poet['id']}, ریشه {poet['rootCatId']})")
    rows = collect(int(poet["rootCatId"]), name, delay=delay, limit=limit, log=log)
    if not rows:
        raise SystemExit(f"برای «{name}» متنی برنگشت")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    chars = sum(len(r["text"]) for r in rows)
    return {"poet": name, "poems": len(rows), "chars": chars, "path": str(out_path)}
