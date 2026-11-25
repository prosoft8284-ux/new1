#!/usr/bin/env node
/**
 * soalat-4000.csv  ->  soalat/*.txt
 *
 * فقط سؤال‌هایی را بازنویسی می‌کند که در CSV تغییر کرده‌اند؛ سرصفحهٔ فایل،
 * عنوان بخش‌ها، فاصله‌ها و ترتیب سؤال‌ها دست‌نخورده می‌ماند.
 *
 * کاربرد:  node tools/csv-apply.js [مسیر csv]
 * اگر csv داده نشود: soalat-4000.csv
 * اگر ویرایش‌های شما در soalat-4000-excel.csv باشد (جداکنندهٔ «;») هم تشخیص داده می‌شود.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOALAT = path.join(ROOT, 'soalat');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[\u06F0-\u06F9]/g, (d) => String(FA.indexOf(d)));
const toFa = (n) => String(n).replace(/[0-9]/g, (d) => FA[+d]);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const FILES = [
  ['01-nazariye-jameshenasi.txt', 'نظریات جامعه‌شناسی'],
  ['02-jameshenasi-haye-mokhtalef.txt', 'جامعه‌شناسی‌های مختلف (مبانی و حوزه‌ها)'],
  ['03-ravesh-tahqiq.txt', 'روش تحقیق در علوم اجتماعی'],
  ['04-amar.txt', 'آمار در علوم اجتماعی'],
  ['05-zaban.txt', 'زبان عمومی و تخصصی'],
];

const csvPath = path.resolve(process.argv[2] || path.join(ROOT, 'soalat-4000.csv'));
let text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const sep = text.slice(0, text.indexOf('\n')).includes(';') ? ';' : ',';

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

const raw = parseCsv(text, sep);
const head = raw[0];
const col = (name) => head.indexOf(name);
const need = ['درس', 'شماره در درس', 'صورت سؤال', 'گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴', 'شماره پاسخ', 'تحلیل'];
for (const c of need) {
  if (col(c) === -1) { console.error('ستون پیدا نشد:', c, '| ستون‌ها:', head.join(' | ')); process.exit(1); }
}

const rows = raw.slice(1).filter((r) => r.length > 3 && r[col('شماره در درس')] !== undefined && String(r[col('شماره در درس')]).trim() !== '');
const byKey = new Map();
const problems = [];
const seenStem = new Map();
for (const r of rows) {
  const subject = norm(r[col('درس')]);
  const n = +toEn(String(r[col('شماره در درس')]).trim());
  const stem = norm(r[col('صورت سؤال')]);
  const opts = [1, 2, 3, 4].map((i) => norm(r[col('گزینه ' + FA[i])]));
  const key = +toEn(String(r[col('شماره پاسخ')]).trim());
  const analysis = norm(r[col('تحلیل')]);
  const id = subject + '#' + n;
  if (!subject || !n) { problems.push('شماره/درس خالی در ردیف: ' + r.slice(0, 3).join(' | ')); continue; }
  if (!stem) problems.push(id + ': صورت سؤال خالی');
  if (opts.some((o) => !o)) problems.push(id + ': گزینهٔ خالی');
  if (!(key >= 1 && key <= 4)) problems.push(id + ': شماره پاسخ نامعتبر (' + key + ')');
  if (analysis.length < 15) problems.push(id + ': تحلیل خیلی کوتاه/خالی');
  const uniq = new Set(opts.map((o) => o.replace(/[.،؛\s]/g, '')));
  if (uniq.size !== 4) problems.push(id + ': گزینهٔ تکراری');
  if (seenStem.has(stem)) problems.push(id + ': صورت سؤال تکراری با ' + seenStem.get(stem));
  else seenStem.set(stem, id);
  if (key >= 1 && key <= 4 && opts[key - 1]) byKey.set(id, { subject, n, stem, opts, key, analysis });
  else byKey.set(id, null);
}

if (problems.length) {
  console.error('⛔ ورودی معتبر نیست — چیزی نوشته نشد. ' + problems.length + ' مشکل:');
  for (const p of problems.slice(0, 25)) console.error('  - ' + p);
  process.exit(1);
}

let totalChanged = 0;
const report = [];

for (const [file, subject] of FILES) {
  const abs = path.join(SOALAT, file);
  const lines = fs.readFileSync(abs, 'utf8').replace(/\r/g, '').split('\n');
  let changed = 0;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const qm = lines[i].match(/^([\u06F0-\u06F9]+)\)\s*(.+)$/);
    if (!qm) { out.push(lines[i]); continue; }
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      (lines[j][0] === ' ' || /^[✔✎]/.test(lines[j])) &&
      !/^([\u06F0-\u06F9]+)\)\s+/.test(lines[j])
    ) j++;

    const n = +toEn(qm[1]);
    const row = byKey.get(subject + '#' + n);
    if (!row) {
      out.push(...lines.slice(i, j));
      i = j - 1;
      continue;
    }

    // دادهٔ فعلی همین بلوک را از متن استخراج کن تا فقط تغییر واقعی نوشته شود
    const block = lines.slice(i, j);
    const oldOpts = [];
    let oldKey = 0, oldAnalysis = '', oldStem = norm(qm[2]);
    for (const l of block.slice(1)) {
      const om = l.match(/^\s*([\u06F1-\u06F4])\.\s*(.+)$/);
      if (om) { oldOpts[+toEn(om[1]) - 1] = norm(om[2]); continue; }
      const km = l.trim().match(/^✔\s*کلید:\s*گزینه\s*([\u06F1-\u06F4])/);
      if (km) { oldKey = +toEn(km[1]); continue; }
      const am = l.trim().match(/^✎\s*تحلیل:\s*(.*)$/);
      if (am) { oldAnalysis = norm(am[1]); continue; }
      if (oldAnalysis) oldAnalysis = norm(oldAnalysis + ' ' + l);
    }
    const same =
      oldStem === row.stem &&
      oldKey === row.key &&
      oldAnalysis === row.analysis &&
      [0, 1, 2, 3].every((k) => norm(oldOpts[k] || '') === row.opts[k]);
    if (same) { out.push(...block); i = j - 1; continue; }

    const rebuilt = [`${toFa(n)}) ${row.stem}`];
    row.opts.forEach((o, k) => rebuilt.push(`   ${FA[k + 1]}. ${o}`));
    rebuilt.push(`   ✔ کلید: گزینه ${FA[row.key]}`);
    rebuilt.push(`   ✎ تحلیل: ${row.analysis}`);
    out.push(...rebuilt);
    changed++;
    i = j - 1;
  }
  if (changed) fs.writeFileSync(abs, out.join('\n'));
  totalChanged += changed;
  report.push(`${file}: ${changed} سؤال بازنویسی شد`);
}

console.log(report.join('\n'));
console.log('جمع تغییرها:', totalChanged, '| منبع:', path.relative(ROOT, csvPath));
