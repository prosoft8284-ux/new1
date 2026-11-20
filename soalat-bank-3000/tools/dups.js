// بررسی سوال‌های تکراری و شمارش کل
const fs = require('fs');
const dir = __dirname + '/../soalat';
const all = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.txt'))) {
  const lines = fs.readFileSync(dir + '/' + f, 'utf8').split('\n');
  for (const l of lines) {
    const m = l.match(/^[\u06F0-\u06F9]+\)\s*(.+)$/);
    if (m) all.push({ f, q: m[1].trim().replace(/\s+/g, ' ') });
  }
}
const seen = new Map();
const dups = [];
for (const it of all) {
  if (seen.has(it.q)) dups.push(it.f + ' :: ' + it.q);
  else seen.set(it.q, it.f);
}
console.log('کل سوالات:', all.length);
console.log('تکراری:', dups.length);
dups.slice(0, 10).forEach(d => console.log(' -', d));
