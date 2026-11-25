/* اعمال بازنویسی‌های دستی گزینه‌ها و تحلیل‌ها از فایل JSON.
   ساختار هر ورودی: { n, key, options:[چهار متن], exp }
   قاعده: کلید و شمارهٔ سؤال تغییر نمی‌کند؛ فقط متن چهار گزینه و متن تحلیل جایگزین می‌شود.
   اجرا: node tools/apply-rewrites.js tools/rewrites/batch1.json */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'soalat');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const src = process.argv[2];
if (!src) { console.error('مسیر فایل JSON را بدهید'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(path.resolve(ROOT, src), 'utf8'));

let applied = 0;
const problems = [];

for (const [file, items] of Object.entries(plan)) {
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) { problems.push(`فایل نیست: ${file}`); continue; }
  const lines = fs.readFileSync(full, 'utf8').replace(/\r/g, '').split('\n');

  for (const it of items) {
    const start = lines.findIndex((l) => new RegExp(`^${String(it.n).replace(/[0-9]/g, (d) => FA[+d])}\\)\\s`).test(l));
    if (start < 0) { problems.push(`${file} Q${it.n}: سؤال پیدا نشد`); continue; }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[\u06F0-\u06F9]+\)\s/.test(lines[i])) { end = i; break; }
    }

    const optIdx = [];
    let keyIdx = -1, expIdx = -1;
    for (let i = start + 1; i < end; i++) {
      if (/^\s+[\u06F1-\u06F4]\.\s/.test(lines[i])) optIdx.push(i);
      if (/^✔\s*کلید:/.test(lines[i].trim())) keyIdx = i;
      if (/^✎\s*تحلیل:/.test(lines[i].trim())) expIdx = i;
    }
    if (optIdx.length !== 4 || keyIdx < 0 || expIdx < 0) {
      problems.push(`${file} Q${it.n}: ساختار ناقص (گزینه=${optIdx.length})`); continue;
    }
    const curKey = +toEn((lines[keyIdx].match(/گزینه\s*([\u06F1-\u06F4])/) || [])[1] || 0);
    if (curKey !== it.key) { problems.push(`${file} Q${it.n}: کلید فایل ${curKey} ≠ کلید ورودی ${it.key}`); continue; }
    if (it.options.length !== 4 || it.options.some((o) => !norm(o))) { problems.push(`${file} Q${it.n}: گزینه‌ها کامل نیست`); continue; }
    if (new Set(it.options.map(norm)).size !== 4) { problems.push(`${file} Q${it.n}: گزینه تکراری`); continue; }
    if (norm(it.exp).length < 80) { problems.push(`${file} Q${it.n}: تحلیل کوتاه`); continue; }

    optIdx.forEach((lineNo, k) => {
      const prefix = (lines[lineNo].match(/^(\s+)/) || ['', '   '])[1];
      lines[lineNo] = `${prefix}${FA[k + 1]}. ${norm(it.options[k])}`;
    });
    lines[expIdx] = `   ✎ تحلیل: ${norm(it.exp)}`;
    applied++;
  }
  fs.writeFileSync(full, lines.join('\n'));
}

console.log(`بازنویسی اعمال‌شده: ${applied}`);
if (problems.length) { console.log('مشکل‌ها:'); problems.forEach((p) => console.log(' - ' + p)); process.exitCode = 1; }
