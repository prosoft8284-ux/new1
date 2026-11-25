/* ابزار یکبارمصرف: جایگزینی خط «تحلیل» یک سوال در فایل متنی خام.
   ورودی: فایل JSON به شکل { "theory-12": "متن تازه", ... }
   استفاده: node tools/patch-exp.js /tmp/exp-patch.json            */
const fs = require('fs');
const path = require('path');

const FILES = {
  theory: '01-nazariye-jameshenasi.txt',
  domains: '02-jameshenasi-haye-mokhtalef.txt',
  method: '03-ravesh-tahqiq.txt',
  amar: '04-amar.txt',
  zaban: '05-zaban.txt',
};

const FA = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/\d/g, (d) => FA[+d]);

const patchPath = process.argv[2];
if (!patchPath) { console.error('مسیر فایل JSON را بده'); process.exit(1); }
const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));

const bySubject = {};
for (const [id, text] of Object.entries(patch)) {
  const [sid, n] = id.split('-');
  (bySubject[sid] = bySubject[sid] || []).push({ n: Number(n), text });
}

let applied = 0, missed = [];

for (const [sid, items] of Object.entries(bySubject)) {
  const file = path.join(__dirname, '..', 'soalat', FILES[sid]);
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  for (const item of items) {
    const header = new RegExp('^' + faNum(item.n) + '\\)');
    const start = lines.findIndex((l) => header.test(l));
    if (start === -1) { missed.push(`${sid}-${item.n}: سوال پیدا نشد`); continue; }

    let target = -1;
    for (let i = start + 1; i < Math.min(start + 14, lines.length); i++) {
      if (/^\s*✎ تحلیل:/.test(lines[i])) { target = i; break; }
      if (!lines[i].trim()) break;
    }
    if (target === -1) { missed.push(`${sid}-${item.n}: خط تحلیل پیدا نشد`); continue; }

    lines[target] = '   ✎ تحلیل: ' + item.text.trim();
    applied += 1;
  }

  fs.writeFileSync(file, lines.join('\n'));
}

console.log('جایگزین‌شده:', applied, '| ناموفق:', missed.length);
missed.forEach((m) => console.log('  -', m));
if (missed.length) process.exitCode = 1;
