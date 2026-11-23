#!/usr/bin/env node
/**
 * توزیع جایگاه پاسخ را در CSV متعادل می‌کند.
 *
 * برای هر درس، سؤال‌ها به ترتیب پیموده می‌شوند و کلید به گزینه‌ای منتقل می‌شود
 * که تا آن لحظه کمترین سهم را داشته است (جابه‌جایی دو گزینه، بدون تغییر متن).
 * ردیف‌هایی که ترتیب گزینه‌ها برایشان معنا دارد دست‌نخورده می‌مانند:
 *   - تحلیل به شمارهٔ گزینه ارجاع می‌دهد («گزینه ۲»)
 *   - گزینه‌ای به ترتیب اشاره می‌کند («موارد بالا»، «بند ۱»)
 *   - گزینه‌های «هیچ‌کدام / همهٔ موارد / هر دو» که در آزمون همیشه آخر می‌آیند
 *
 * کاربرد: node tools/csv-balance.js [مسیر csv]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[\u06F0-\u06F9]/g, (d) => String(FA.indexOf(d)));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

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
const C = {
  subject: head.indexOf('درس'),
  n: head.indexOf('شماره در درس'),
  o: [1, 2, 3, 4].map((i) => head.indexOf('گزینه ' + FA[i])),
  key: head.indexOf('شماره پاسخ'),
  answer: head.indexOf('متن پاسخ'),
  analysis: head.indexOf('تحلیل'),
  order: head.indexOf('ردیف'),
};
for (const [k, v] of Object.entries(C)) {
  if (v === -1) { console.error('ستون ناموجود:', k); process.exit(1); }
}

const rows = raw.slice(1).filter((r) => r.length > 3 && String(r[C.n]).trim() !== '');
const NUM_REF = /گزینهٔ? ?[۱-۴]|موارد ?[۱-۴]|بند ?[۱-۴]/;
const ORDER_REF = /موارد (?:بالا|پایین)|مورد (?:بالا|پایین)|بند ?[۱-۴]|هیچکدام|هیچ یک|همهٔ موارد|همه موارد|هر دو/;

const before = {};
const after = {};
let skipped = 0, moved = 0;

let curSubject = null;
let counts = null;
for (const r of rows) {
  const subject = norm(r[C.subject]);
  if (subject !== curSubject) { curSubject = subject; counts = { 1: 0, 2: 0, 3: 0, 4: 0 }; }
  before[subject] = before[subject] || { 1: 0, 2: 0, 3: 0, 4: 0 };
  after[subject] = after[subject] || { 1: 0, 2: 0, 3: 0, 4: 0 };

  let key = +toEn(String(r[C.key]).trim());
  before[subject][key]++;
  if (!(key >= 1 && key <= 4)) { skipped++; after[subject][key]++; continue; }

  const opts = C.o.map((i) => r[i]);
  const sensitive = NUM_REF.test(r[C.analysis]) || opts.some((o) => ORDER_REF.test(o));
  if (!sensitive) {
    // بین جایگاه‌هایی که کمترین سهم را دارند تصادفی انتخاب کن تا ترتیب متعادل
    // ولی قابل‌حدس («۱،۲،۳،۴،۱،۲…») نشود.
    const min = Math.min(counts[1], counts[2], counts[3], counts[4]);
    const cands = [1, 2, 3, 4].filter((p) => counts[p] === min);
    const target = cands[Math.floor(Math.random() * cands.length)];
    if (target !== key) {
      const tmp = opts[target - 1];
      opts[target - 1] = opts[key - 1];
      opts[key - 1] = tmp;
      C.o.forEach((ci, k) => { r[ci] = opts[k]; });
      r[C.answer] = opts[target - 1];
      key = target;
      moved++;
    }
  } else skipped++;
  r[C.key] = String(key);
  counts[key]++;
  after[subject][key]++;
}

const esc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const outCsv = (s) => '\uFEFF' + [head.join(s), ...rows.map((r) => r.map(esc).join(s))].join('\r\n') + '\r\n';

if (!moved) {
  console.log('چیزی برای جابه‌جایی نبود (توزیع از قبل متعادل است).');
  process.exit(0);
}

fs.writeFileSync(csvPath, outCsv(sep));
const excelAlternative = path.join(ROOT, 'soalat-4000-excel.csv');
if (path.basename(csvPath) === 'soalat-4000.csv') fs.writeFileSync(excelAlternative, outCsv(';'));

const pct = (o) => [1, 2, 3, 4].map((i) => `${i}:${((o[i] / rows.length) * 100).toFixed(1)}%`).join('  ');
console.log('ردیف‌های جابه‌جاشده:', moved, '| دست‌نخورده (حساس به ترتیب):', skipped);
console.log('پیش:', pct(Object.keys(before).reduce((a, s) => { for (const k of [1, 2, 3, 4]) a[k] += before[s][k]; return a; }, { 1: 0, 2: 0, 3: 0, 4: 0 })));
console.log('پس :', pct(Object.keys(after).reduce((a, s) => { for (const k of [1, 2, 3, 4]) a[k] += after[s][k]; return a; }, { 1: 0, 2: 0, 3: 0, 4: 0 })));
console.log('اکنون tools/csv-apply.js را اجرا کنید تا در soalat/*.txt بنشیند.');
