/* چسباندن «دنباله» به سه گزینهٔ انحرافی (گزینهٔ کلید دست نمی‌خورد).
   ساختار ورودی: { "file.txt": { "596": ["دنبالهٔ گزینهٔ اول", "دنبالهٔ گزینهٔ دوم", "دنبالهٔ گزینهٔ سوم"] } }
   دنباله‌ها به ترتیب روی گزینه‌های غیرکلید، به همان ترتیبی که در فایل آمده‌اند، می‌نشینند.
   اجرا: node tools/apply-tails.js tools/rewrites/tails/batchT1.json */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'soalat');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));

const src = process.argv[2];
if (!src) { console.error('مسیر فایل JSON را بدهید'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(path.resolve(ROOT, src), 'utf8'));

let applied = 0;
const problems = [];
const cache = new Map();

for (const [file, items] of Object.entries(plan)) {
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) { problems.push(`فایل نیست: ${file}`); continue; }
  if (!cache.has(file)) cache.set(file, fs.readFileSync(full, 'utf8').replace(/\r/g, '').split('\n'));
  const lines = cache.get(file);

  for (const [nStr, tails] of Object.entries(items)) {
    const n = +nStr;
    if (!Array.isArray(tails) || tails.length !== 3) { problems.push(`${file} Q${n}: باید سه دنباله باشد`); continue; }
    const start = lines.findIndex((l) => new RegExp(`^${String(n).replace(/[0-9]/g, (d) => FA[+d])}\\)\\s`).test(l));
    if (start < 0) { problems.push(`${file} Q${n}: سؤال پیدا نشد`); continue; }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[\u06F0-\u06F9]+\)\s/.test(lines[i])) { end = i; break; }
    }
    const optIdx = [];
    let keyIdx = -1;
    for (let i = start + 1; i < end; i++) {
      if (/^\s+[\u06F1-\u06F4]\.\s/.test(lines[i])) optIdx.push(i);
      if (/^✔\s*کلید:/.test(lines[i].trim())) keyIdx = i;
    }
    if (optIdx.length !== 4 || keyIdx < 0) {
      problems.push(`${file} Q${n}: ساختار ناقص (گزینه=${optIdx.length})`); continue;
    }
    const keyNo = +toEn((lines[keyIdx].match(/گزینه\s*([\u06F1-\u06F4])/) || [])[1] || 0);
    if (!keyNo) { problems.push(`${file} Q${n}: کلید خوانده نشد`); continue; }
    const others = optIdx.filter((_, i) => i + 1 !== keyNo);
    others.forEach((li, k) => {
      lines[li] = lines[li].replace(/\s+$/, '') + ' ' + String(tails[k]).trim();
    });
    applied++;
  }
}

if (problems.length) {
  console.log('مشکل‌ها:');
  problems.slice(0, 20).forEach((p) => console.log(' - ' + p));
}
if (problems.length && applied === 0) { console.error('هیچ تغییری اعمال نشد'); process.exit(2); }
for (const [file, lines] of cache) fs.writeFileSync(path.join(DIR, file), lines.join('\n'));
console.log('دنباله اعمال‌شده: ' + applied);
