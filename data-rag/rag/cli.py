"""Command line entry point: ingest, search, stats."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .ingest import run_ingest
from .search import Retriever, build_context


def _dpi(value):
    """`auto` keeps the scan's own resolution; a number forces one."""
    if isinstance(value, str) and value.lower() == "auto":
        return "auto"
    return int(value)


def _print_hit(hit: dict, snippet: int = 260) -> None:
    body = " ".join(hit["text"].split())
    if len(body) > snippet:
        body = body[:snippet].rstrip() + "..."
    meta = f"{hit['category']}/{hit['year']}" + (f" | {hit['source']}" if hit["source"] else "")
    print(f"[{hit['rank']}] score={hit['score']:.5f}  {meta}")
    print(f"    {hit['title'] or '(بدون عنوان)'}")
    print(f"    {body}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m rag",
        description="جست‌وجوی ترکیبی و رایگان: Parquet پارتیشن‌بندی‌شده + DuckDB + LanceDB",
    )
    parser.add_argument("--root", default="data", help="پوشه داده (پیش‌فرض: data)")
    sub = parser.add_subparsers(dest="command", required=True)

    ing = sub.add_parser("ingest", help="ساخت Parquet و ایندکس برداری از داده خام")
    ing.add_argument("--input", required=True, help="فایل .jsonl/.json/.csv/.parquet")
    ing.add_argument("--embedder", default="auto", choices=["auto", "fastembed", "hash"])
    ing.add_argument("--model", default=None, help="نام مدل fastembed (پیش‌فرض: خودکار چندزبانه)")
    ing.add_argument("--max-chars", type=int, default=900)
    ing.add_argument("--overlap", type=int, default=120)
    ing.add_argument("--limit", type=int, default=None, help="حداکثر تعداد تکه برای تست")
    ing.add_argument("--rebuild", action="store_true", help="پاک کردن ایندکس قبلی")
    ing.add_argument("--index-type", default="auto", choices=["auto", "none", "sq", "pq"],
                     help="ایندکس برداری: auto (SQ بعد از ۵۰ هزار بردار) | none | sq | pq")

    sea = sub.add_parser("search", help="جست‌وجوی ترکیبی")
    sea.add_argument("query")
    sea.add_argument("-k", type=int, default=8, help="تعداد نتایج نهایی")
    sea.add_argument("--k-vec", type=int, default=60, help="کاندید لایه برداری")
    sea.add_argument("--k-lex", type=int, default=60, help="کاندید لایه متنی")
    sea.add_argument("--category", action="append", default=None, help="فیلتر دسته (تکرارپذیر)")
    sea.add_argument("--lang", action="append", default=None,
                     help="فیلتر زبان مثل fa یا ar (تکرارپذیر)")
    sea.add_argument("--year-from", type=int, default=None)
    sea.add_argument("--year-to", type=int, default=None)
    sea.add_argument("--no-cache", action="store_true")
    sea.add_argument("--rerank", default="off", choices=["off", "heuristic"],
                     help="بازرتبه‌بندی کاندیدها (پیش‌فرض خاموش؛ در مجموعه آزمون سود نشان نداد)")
    sea.add_argument("--rerank-k", type=int, default=20, help="چند کاندید بازرتبه‌بندی شود")
    sea.add_argument("--json", action="store_true", help="خروجی JSON")
    sea.add_argument("--context", action="store_true", help="چاپ پرامپت آماده برای مدل زبانی")

    pdfp = sub.add_parser("ingest-pdf", help="استخراج متن از PDF (حتی اسکن‌شده) و در صورت نیاز ایندکس")
    pdfp.add_argument("--input", required=True, help="فایل PDF")
    pdfp.add_argument("--out", default=None, help="خروجی JSONL (پیش‌فرض: data/extracted/<name>.jsonl)")
    pdfp.add_argument("--dpi", default="auto", help="auto (رزولوشن بومی) یا عدد مثل 300")
    pdfp.add_argument("--lang", default="auto",
                      help="auto | fas | ara | fas+ara (تشخیص خودکار از روی یک صفحه)")
    pdfp.add_argument("--model", default="fast", choices=["fast", "best"],
                      help="fast = ~۲.۳ برابر سریع‌تر، best = دقیق‌تر")
    pdfp.add_argument("--psm", type=int, default=6, help="حالت تحلیل صفحه (۶ برای کتاب تک‌ستونه)")
    pdfp.add_argument("--workers", type=int, default=None, help="تعداد OCR هم‌زمان (پیش‌فرض: همه هسته‌ها)")
    pdfp.add_argument("--pages", default=None, help="مثل 1-50 یا 3,7,19")
    pdfp.add_argument("--force-ocr", action="store_true", help="حتی صفحات دارای لایه متنی را OCR کن")
    pdfp.add_argument("--category", default="کتاب")
    pdfp.add_argument("--title", default=None)
    pdfp.add_argument("--tesseract", default=None, help="مسیر باینری tesseract")
    pdfp.add_argument("--tessdata", default=None, help="پوشه فایل‌های traineddata")
    pdfp.add_argument("--embedder", default="auto", choices=["auto", "fastembed", "hash"])
    pdfp.add_argument("--rebuild", action="store_true", help="ایندکس قبلی را پاک کن")
    pdfp.add_argument("--index", action="store_true", help="بعد از استخراج، ایندکس هم بساز")

    lib = sub.add_parser("library", help="OCR دسته‌ای همه PDFهای یک پوشه، قابل ادامه از محل قطع")
    lib.add_argument("--dir", default="books", help="پوشه کتاب‌ها")
    lib.add_argument("--workers", type=int, default=None)
    lib.add_argument("--model", default="fast", choices=["fast", "best"])
    lib.add_argument("--dpi", default="auto")
    lib.add_argument("--psm", type=int, default=6)
    lib.add_argument("--lang", default="auto",
                     help="auto | fas | ara | fas+ara")
    lib.add_argument("--limit", type=int, default=None, help="فقط N کتاب اول (برای تست)")
    lib.add_argument("--force", action="store_true", help="کتاب‌های تمام‌شده را هم دوباره پردازش کن")
    lib.add_argument("--no-index", action="store_true", help="فقط استخراج، بدون ایندکس")
    lib.add_argument("--batch-size", type=int, default=25, help="هر چند کتاب یک‌بار ایندکس شود")
    lib.add_argument("--embedder", default="auto", choices=["auto", "fastembed", "hash"])

    sub.add_parser("stats", help="آمار ایندکس")

    args = parser.parse_args(argv)

    if args.command == "ingest":
        summary = run_ingest(
            input_path=args.input, root=args.root, embedder_backend=args.embedder,
            model=args.model, max_chars=args.max_chars, overlap=args.overlap,
            rebuild=args.rebuild, limit=args.limit, index_type=args.index_type,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    if args.command == "ingest-pdf":
        from .pdf import extract_pdf, write_jsonl

        extracted = extract_pdf(
            args.input, root=args.root, dpi=_dpi(args.dpi), lang=args.lang,
            model=args.model, psm=args.psm, workers=args.workers, pages=args.pages,
            force_ocr=args.force_ocr, tesseract=args.tesseract, tessdata=args.tessdata,
        )
        out = Path(args.out) if args.out else (
            Path(args.root) / "extracted" / f"{Path(args.input).stem}.jsonl"
        )
        write_jsonl(extracted, out, title=args.title, category=args.category)
        summary = {k: v for k, v in extracted.items() if k != "page_texts"}
        summary["jsonl"] = str(out)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if args.index:
            print(json.dumps(run_ingest(
                input_path=str(out), root=args.root, embedder_backend=args.embedder,
                rebuild=args.rebuild,
            ), ensure_ascii=False, indent=2))
        else:
            print(f"برای ایندکس: python -m rag ingest --input {out}")
        return 0

    if args.command == "library":
        from .library import run_library

        summary = run_library(
            directory=args.dir, root=args.root, index=not args.no_index,
            limit=args.limit, force=args.force, batch_size=args.batch_size,
            embedder=args.embedder, dpi=_dpi(args.dpi), lang=args.lang,
            model=args.model, psm=args.psm, workers=args.workers,
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    if args.command == "stats":
        print(json.dumps(Retriever(root=args.root).stats(), ensure_ascii=False, indent=2))
        return 0

    filters = {
        "category": args.category,
        "lang": args.lang,
        "year_from": args.year_from,
        "year_to": args.year_to,
    }
    retriever = Retriever(root=args.root, k_vec=args.k_vec, k_lex=args.k_lex,
                          use_cache=not args.no_cache, rerank=args.rerank,
                          rerank_k=args.rerank_k)
    result = retriever.search(args.query, k=args.k, filters=filters)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print(f"query: {result['query']}")
    print(f"path={result['path']}  embed={result['embed_ms']}ms  total={result['total_ms']}ms  "
          f"candidates={result['candidates']}")
    if not result["results"]:
        print("نتیجه‌ای پیدا نشد.")
        return 1
    for hit in result["results"]:
        _print_hit(hit)
    if args.context:
        print("\n--- context ---")
        print(build_context(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
