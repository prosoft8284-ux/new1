#!/usr/bin/env node
/**
 * ویرایش محتوایی CSV از روی یک فایل دستهٔ JSON.
 *
 * ساختار دسته:
 * {
 *   "01-nazariye-jameshenasi.txt": {
 *     "12":  { "analysis": "…" },
 *     "40":  { "options": ["…","…","…","…"], "key": 3 },
 *     "77":  { "stem": "…", "analysis": "…" }
 *   }
 * }
 *
 * فقط فیلدهایی که آمده‌اند عوض می‌شوند؛ سه گزینهٔ دیگر دست‌نخورده می‌مانند.
 * پیش از نوشتن: شمارهٔ سؤال باید موجود باشد، گزینه‌ها چهارتا و یکتا، کلید ۱..۴،
 * و تحلیل دست‌کم ۴۰ کاراکتر. اگر هر کدام از این‌ها نباشد هیچ چیز نوشته نمی‌شود.
 *
 * کاربرد: node tools/csv-patch.js tools/rewrites/csv-fix/fix1.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[\u06F0-\u06F9]/g, (d) => String(FA.indexOf(d)));
const toFa = (n) => String(n).replace(/[0-9]/g, (d) => FA[+d]);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const SUBJECT_OF = {
  '01-nazariye-jameshenasi.txt': 'نظریات جامعه‌شناسی',
  '02-jameshenasi-haye-mokhtalef.txt': 'جامعه‌شناسی‌های مختلف (مبانی و حوزه‌ها)',
  '03-ravesh-tahqiq.txt': 'روش تحقیق در علوم اجتماعی',
  '04-amar.txt': 'آمار در علوم اجتماعی',
  '05-zaban.txt': 'زبان عمومی و تخصصی',
};

const batchPath = process.argv[2];
if (!batchPath) { console.error('مسیر فایل دسته لازم است.'); process.exit(1); }
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

const csvPath = path.join(ROOT, 'soalat-4000.csv');
let text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');

function parseCsv(t, sep) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = parseCsv(text, ',');
const head = raw[0];
const C = {
  subject: head.indexOf('درس'),
  n: head.indexOf('شماره در درس'),
  stem: head.indexOf('صورت سؤال'),
  o: [1, 2, 3, 4].map((i) => head.indexOf('گزینه ' + FA[i])),
  key: head.indexOf('شماره پاسخ'),
  answer: head.indexOf('متن پاسخ'),
  analysis: head.indexOf('تحلیل'),
};

const index = new Map();
for (const r of raw.slice(1)) {
  if (r.length < 5 || String(r[C.n]).trim() === '') continue;
  index.set(norm(r[C.subject]) + '#' + +toEn(String(r[C.n]).trim()), r);
}

const problems = [];
let patched = 0;

for (const [file, items] of Object.entries(batch)) {
  const subject = SUBJECT_OF[file];
  if (!subject) { problems.push('نام فایل ناشناخته: ' + file); continue; }
  for (const [num, patch] of Object.entries(items)) {
    const id = subject + '#' + num;
    const r = index.get(id);
    if (!r) { problems.push(id + ': سؤال پیدا نشد'); continue; }
    const label = id;

    if (patch.stem !== undefined) {
      const s = norm(patch.stem);
      if (s.length < 10) problems.push(label + ': صورت سؤال خیلی کوتاه');
      else r[C.stem] = s;
    }
    if (patch.analysis !== undefined) {
      const a = norm(patch.analysis);
      if (a.length < 40) problems.push(label + ': تحلیل زیر ۴۰ کاراکتر (' + a.length + ')');
      else r[C.analysis] = a;
    }
    if (patch.options !== undefined) {
      if (!Array.isArray(patch.options) || patch.options.length !== 4) { problems.push(label + ': باید دقیقاً چهار گزینه باشد'); continue; }
      const opts = patch.options.map(norm);
      if (opts.some((o) => o.length < 1)) { problems.push(label + ': گزینهٔ خالی'); continue; }
      if (new Set(opts).size !== 4) { problems.push(label + ': گزینهٔ تکراری'); continue; }
      C.o.forEach((ci, k) => { r[ci] = opts[k]; });
      const key = patch.key !== undefined ? +patch.key : +toEn(String(r[C.key]).trim());
      if (!(key >= 1 && key <= 4)) { problems.push(label + ': کلید نامعتبر'); continue; }
      r[C.key] = String(key);
      r[C.answer] = opts[key - 1];
    } else if (patch.key !== undefined) {
      const key = +patch.key;
      if (!(key >= 1 && key <= 4)) { problems.push(label + ': کلید نامعتبر'); continue; }
      r[C.key] = String(key);
      r[C.answer] = r[C.o[key - 1]];
    }
    patched++;
  }
}

if (problems.length) {
  console.error('⛔ چیزی نوشته نشد — ' + problems.length + ' مشکل:');
  for (const p of problems.slice(0, 30)) console.error('  - ' + p);
  process.exit(1);
}

const esc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const body = raw.slice(1).filter((r) => r.length > 3 && String(r[C.n]).trim() !== '');
const out = (sep) => '\uFEFF' + [head.join(sep), ...body.map((r) => r.map(esc).join(sep))].join('\r\n') + '\r\n';
fs.writeFileSync(csvPath, out(','));
fs.writeFileSync(path.join(ROOT, 'soalat-4000-excel.csv'), out(';'));

console.log('وصله اعمال شد:', patched, 'سؤال | از:', path.relative(ROOT, batchPath));
