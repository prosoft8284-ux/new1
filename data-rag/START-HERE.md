# از اینجا شروع کن

این پروژه سه کار می‌کند: **کتاب را پیدا و دانلود می‌کند**، **متنش را بیرون می‌کشد
(OCR برای اسکن فارسی/عربی)**، و **می‌گذارد با جمله‌ی خودت در همه‌ی کتاب‌ها جست‌وجو کنی**.

همه‌ی دستورها از پوشه‌ی `data-rag` اجرا می‌شوند.

## قدم صفر: آماده‌سازی (یک‌بار بعد از هر ریاستارت)

```bash
cd data-rag
bash scripts/quickstart.sh
```

این اسکریپت محیط را می‌سازد (اگر نبود)، وضعیت کتابخانه را نشان می‌دهد و دستور بعدی
را یادت می‌دهد. اگر `agent-reach` نبود (برای جست‌وجوی وب):

```bash
bash scripts/install-agent-reach.sh
```

## سه سناریو، فقط همین

### ۱) کتاب‌های خودم را دارم

فایل‌ها را در `data-rag/books/` بگذار (PDF)، بعد:

```bash
.venv/bin/python -m rag library --dir books
```

خودش OCR می‌کند، تکه‌تکه می‌کند، ایندکس می‌سازد و اگر قطع شد از همان‌جا ادامه
می‌دهد. پیشرفت:

```bash
.venv/bin/python -m rag status
```

### ۲) کتابی می‌خواهم از اینترنت

```bash
# پیدا کردن (هیچ چیزی دانلود نمی‌شود)
.venv/bin/python -m rag fetch --query "بوستان سعدی" --lang fa --limit 5

# دانلود بهترین نتیجه‌ی مجاز
.venv/bin/python -m rag fetch --query "بوستان سعدی" --lang fa --yes

# بعد مثل سناریوی ۱
.venv/bin/python -m rag library --dir books
```

### ۳) شعر کلاسیک فارسی می‌خواهم (بدون OCR، متن آماده)

```bash
.venv/bin/python -m rag ganjoor --poet "حافظ" --index
.venv/bin/python -m rag ganjoor --poet "فردوسی" --limit 300 --index
```

## پرسیدن سؤال

```bash
.venv/bin/python -m rag search "عدالت در بوستان سعدی"     # ۸ نتیجه
.venv/bin/python -m rag search "عشق" --lang fa -k 5
.venv/bin/python -m rag search "..." --context            # پرامپت آماده برای مدل زبانی
.venv/bin/python -m rag search "..." --json               # خروجی ساختاری
```

برای وصل‌کردن به دستیار (ChatGPT/Claude/…): `.venv/bin/python -m rag mcp`
برای سرویس محلی روی وب: `.venv/bin/python -m rag serve --port 8765`

## چه می‌خواهم → چه دستوری

| می‌خواهم | دستور |
|---|---|
| یک PDF را ایندکس کنم | `ingest-pdf --input a.pdf --index` |
| پوشه‌ای از PDFها را | `library --dir books` |
| کتاب از وب بگیرم | `fetch --query "…" --yes` |
| یک لینک مشخص را بگیرم | `fetch --url https://…/book.pdf` |
| دیوان شاعر را بریزم | `ganjoor --poet "حافظ" --index` |
| جست‌وجو کنم | `search "…"` (`-k` = تعداد) |
| آمار ایندکس | `stats` |
| کیفیت OCR کتاب‌ها را بسنجم | `audit --fix` |
| یک کتاب را کامل پاک کنم | `remove --book 'a.pdf'` |

## اگر خراب شد

| نشانه | کار |
|---|---|
| `.venv/bin/python: No such file` | `bash scripts/setup.sh` |
| `agent-reach: command not found` | `bash scripts/install-agent-reach.sh` |
| «مدل fa در tools نیست» | `TESSDATA_PREFIX` را ست کن یا `bash setup_tesseract.sh` |
| جست‌وجو چیزی برنمی‌گرداند | `stats` ببین ایندکس هست؟ بعد `status` ببین کتاب‌ها done هستند؟ |
| کتاب ناخوانا ایندکس شده | `audit --fix` → موارد `low-trust` را با نسخه‌ی بهتر عوض کن |

## کجا چه چیزی است

```
data-rag/
  books/            فایل‌های PDF که خودت می‌گذاری
  data/             خروجی: raw/ (پارکت متن)، idx/ (بردار)، corpus.duckdb
  scripts/          setup.sh، quickstart.sh، install-agent-reach.sh
  rag/              کد: pdf.py (OCR)، library.py، ingest.py، search.py، fetch.py، ganjoor.py
```

هیچ‌کدام از این‌ها را دستی پاک نکن؛ `remove --book` و `library --force` ابزار خودش را
دارند.
