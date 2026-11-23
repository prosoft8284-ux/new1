/* نمایش فشردهٔ سؤال‌های یک فایل به ترتیب شماره، برای بازچینش سبک.
   اجرا: node tools/dump-restyle.js <شماره فایل ۱..۵> [از] [تعداد] */
const fs = require('fs');
const path = require('path');
const FILES = ['01-nazariye-jameshenasi.txt', '02-jameshenasi-haye-mokhtalef.txt', '03-ravesh-tahqiq.txt', '04-amar.txt', '05-zaban.txt'];
const fi = +(process.argv[2] || 1) - 1;
const from = +(process.argv[3] || 1);
const count = +(process.argv[4] || 50);
const file = FILES[fi];
if (!file) { console.error('شمارهٔ فایل ۱ تا ۵'); process.exit(1); }

const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const qs = []; let q = null;
for (const raw of fs.readFileSync(path.join(__dirname, '..', 'soalat', file), 'utf8').replace(/\r/g, '').split('\n')) {
  const t = raw.trim(); if (!t) continue;
  const qm = t.match(/^([\u06F0-\u06F9]+)\)\s*(.+)$/);
  if (qm) { q = { n: +toEn(qm[1]), stem: norm(qm[2]), options: [], key: 0 }; qs.push(q); continue; }
  if (!q) continue;
  const om = raw.match(/^\s+([\u06F1-\u06F4])\.\s*(.+)$/);
  if (om) { q.options.push(norm(om[2])); continue; }
  const km = t.match(/^✔\s*کلید:\s*گزینه\s*([\u06F1-\u06F4])/);
  if (km) q.key = +toEn(km[1]);
}

const pick = qs.filter((x) => x.n >= from && x.options.length === 4 && x.key).slice(0, count);
console.log(`### ${file} — ${pick.length} سؤال از ${from}`);
for (const x of pick) {
  const keyTxt = x.options[x.key - 1];
  const others = x.options.filter((_, i) => i !== x.key - 1);
  const avg = Math.round(others.reduce((a, v) => a + v.length, 0) / 3);
  console.log(`Q${x.n} | k=${x.key} | key(${keyTxt.length}) ${keyTxt}`);
  console.log(`   صورت: ${x.stem}`);
  console.log(`   دیگر: ${others.map((o) => o.length + ':' + o).join(' / ')}  [میانگین ${avg}]`);
}
