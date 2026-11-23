/* نمایش فشردهٔ بدترین سؤالات برای نوشتن «دنباله»: طول هر گزینه چاپ می‌شود.
   اجرا: node tools/dump-tails.js [تعداد در هر فایل] */
const fs = require('fs');
const path = require('path');
const N = +(process.argv[2] || 10);
const FILES = ['01-nazariye-jameshenasi.txt', '02-jameshenasi-haye-mokhtalef.txt', '03-ravesh-tahqiq.txt', '04-amar.txt', '05-zaban.txt'];
const toEn = (s) => String(s).replace(/[\u06F0-\u06F9]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function parse(file) {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'soalat', file), 'utf8').replace(/\r/g, '').split('\n');
  const out = []; let q = null;
  for (const line of lines) {
    const t = line.trim(); if (!t) continue;
    const qm = t.match(/^([\u06F0-\u06F9]+)\)\s*(.+)$/);
    if (qm) { q = { n: +toEn(qm[1]), q: norm(qm[2]), options: [], key: 0 }; out.push(q); continue; }
    if (!q) continue;
    const om = line.match(/^\s+([\u06F1-\u06F4])\.\s*(.+)$/);
    if (om) { q.options.push(norm(om[2])); continue; }
    const km = t.match(/^✔\s*کلید:\s*گزینه\s*([\u06F1-\u06F4])/);
    if (km) q.key = +toEn(km[1]);
  }
  return out;
}

const skip = new Set();
for (const f of fs.readdirSync(path.join(__dirname, 'rewrites'))) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'rewrites', f), 'utf8'));
  for (const [file, items] of Object.entries(j)) for (const it of items) skip.add(file + ':' + it.n);
}

for (const file of FILES) {
  const qs = parse(file).filter((q) => q.options.length === 4 && q.key && !skip.has(file + ':' + q.n));
  const scored = qs.map((q) => {
    const key = q.options[q.key - 1];
    const others = q.options.filter((_, i) => i !== q.key - 1);
    const avg = others.reduce((a, o) => a + o.length, 0) / others.length;
    return { q, gap: Math.round(key.length - avg) };
  }).filter((x) => x.gap > 22).sort((a, b) => b.gap - a.gap).slice(0, N);
  console.log('\n===== ' + file + ' =====');
  for (const { q, gap } of scored) {
    console.log(`\nQ${q.n} [k=${q.key}] gap=${gap} :: ${q.q}`);
    q.options.forEach((o, i) => console.log(`  ${i + 1} (${o.length}) ${o}${i + 1 === q.key ? '   <<<KEY' : ''}`));
  }
}
