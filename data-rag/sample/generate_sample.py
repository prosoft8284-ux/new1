"""Generate a demo corpus (Persian, 5 categories, 1995-2025) to try the pipeline.

    python sample/generate_sample.py --docs 1500 --out sample/docs.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

FACTS = {
    "تاریخ": [
        "کوروش بزرگ بنیان‌گذار شاهنشاهی هخامنشی بود و در سال ۵۳۹ پیش از میلاد بابل را گشود.",
        "تخت جمشید در دوره داریوش یکم ساخته شد و مرکز آیینی شاهنشاهی هخامنشی به شمار می‌رفت.",
        "جاده ابریشم شبکه‌ای از مسیرهای تجاری بود که چین را به مدیترانه پیوند می‌داد.",
        "پیدایش خط میخی در میان‌رودان به نیاز دیوان‌سالاری معبدها برای ثبت غله بازمی‌گشت.",
    ],
    "فناوری": [
        "DuckDB یک پایگاه‌داده تحلیلی درون‌فرایندی است که بدون سرور روی فایل‌های Parquet کوئری می‌زند.",
        "جست‌وجوی برداری تقریبی با ایندکس HNSW زمان پاسخ را از ثانیه به میلی‌ثانیه کاهش می‌دهد.",
        "فشرده‌سازی برداری به int8 حجم ایندکس را تا چهار برابر کم می‌کند و افت دقت آن ناچیز است.",
        "LanceDB ایندکس برداری را در قالب فایل Lance روی دیسک نگه می‌دارد و به سرور نیاز ندارد.",
        "کوانتیزه کردن باینری بردارها حافظه را تا سی برابر کم می‌کند و برای مرحله غربالگری مناسب است.",
    ],
    "پزشکی": [
        "کم‌خونی فقر آهن با خستگی، رنگ‌پریدگی پوست و ریزش مو خود را نشان می‌دهد.",
        "پرفشاری خون معمولاً بی‌نشانه است و تنها با اندازه‌گیری منظم فشار خون تشخیص داده می‌شود.",
        "واکسن آنفلوانزا هر سال بازنگری می‌شود زیرا ویروس به‌سرعت جهش می‌یابد.",
        "خواب کمتر از شش ساعت در شبانه‌روز خطر بیماری قلبی را افزایش می‌دهد.",
    ],
    "اقتصاد": [
        "تورم هدف‌گذاری‌شده زمانی رخ می‌دهد که بانک مرکزی نرخ بهره را برای مهار رشد قیمت‌ها بالا می‌برد.",
        "نرخ ارز موثر واقعی قدرت خرید پول یک کشور را در برابر شرکای تجاری می‌سنجد.",
        "کسری بودجه پایدار معمولاً با رشد بدهی عمومی و افزایش هزینه استقراض همراه می‌شود.",
        "بهره‌وری کل عوامل تولید سهم نوآوری و فناوری را در رشد اقتصادی توضیح می‌دهد.",
    ],
    "ورزش": [
        "تیم ملی فوتبال ایران در جام جهانی ۱۹۹۸ فرانسه نخستین پیروزی خود را برابر آمریکا به دست آورد.",
        "کشتی آزاد ایران پرافتخارترین رشته ورزشی کشور در بازی‌های المپیک است.",
        "تمرین هوازی منظم ظرفیت ریه و حداکثر اکسیژن مصرفی ورزشکار را بالا می‌برد.",
        "والیبال ایران در دهه نود خورشیدی به جمع ده تیم برتر جهان رسید.",
    ],
}

FILLER = {
    "تاریخ": ["منابع باستانی", "کتیبه‌ها", "باستان‌شناسان", "دوره میانه", "شهرهای کاروانی", "سکه‌های نقره"],
    "فناوری": ["پردازش موازی", "حافظه نهان", "کوئری ستونی", "ایندکس معکوس", "خط لوله داده", "ذخیره‌سازی سرد"],
    "پزشکی": ["پزشک خانواده", "پرونده الکترونیک", "غربالگری", "تغذیه سالم", "پیگیری درمان", "آزمایش خون"],
    "اقتصاد": ["بازار سرمایه", "نقدینگی", "سیاست مالی", "تجارت خارجی", "بهره‌وری", "بودجه دولت"],
    "ورزش": ["اردوی آماده‌سازی", "لیگ برتر", "کادر فنی", "تمرین تاکتیکی", "هواداران", "بازی دوستانه"],
}

SOURCES = ["archive.ir", "docs.local", "news.example", "wiki.local", "journal.example"]


def build_doc(i: int, category: str, rng: random.Random) -> dict:
    year = rng.randint(1995, 2025)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    paragraphs = []
    for _ in range(rng.randint(2, 4)):
        fact = rng.choice(FACTS[category])
        filler = "، ".join(rng.sample(FILLER[category], k=3))
        paragraphs.append(
            f"{fact} گزارش شماره {rng.randint(100, 999)} با تمرکز بر {filler} تهیه شده است "
            f"و به جزئیات {rng.choice(FILLER[category])} در سال {year} می‌پردازد."
        )
    return {
        "id": f"doc-{i:06d}",
        "title": f"{category}: {rng.choice(FILLER[category])} در سال {year}",
        "text": "\n\n".join(paragraphs),
        "category": category,
        "source": rng.choice(SOURCES),
        "published": f"{year:04d}-{month:02d}-{day:02d}",
        "lang": "fa",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", type=int, default=1500)
    ap.add_argument("--out", default="sample/docs.jsonl")
    args = ap.parse_args()

    rng = random.Random(42)
    categories = list(FACTS)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        for i in range(args.docs):
            fh.write(json.dumps(build_doc(i, categories[i % len(categories)], rng), ensure_ascii=False) + "\n")
    print(f"wrote {args.docs} docs -> {out}")


if __name__ == "__main__":
    main()
