#!/usr/bin/env node
/**
 * یکدست‌سازی حروف عربی در متن فارسی: ي (U+064A) -> ی (U+06CC) و ك (U+0643) -> ک (U+06A9)
 *
 * کاربرد: node tools/normalize-arabic.js
 * روی همهٔ فایل‌های soalat/*.txt اعمال می‌شود و شمار تغییرها را گزارش می‌کند.
 */
const fs = require('fs');
const path = require('path');

const SOALAT = path.join(__dirname, '..', 'soalat');
let total = 0;
for (const file of fs.readdirSync(SOALAT).filter((f) => f.endsWith('.txt')).sort()) {
  const p = path.join(SOALAT, file);
  const before = fs.readFileSync(p, 'utf8');
  const n = (before.match(/[\u064A\u0643]/g) || []).length;
  if (!n) continue;
  fs.writeFileSync(p, before.replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9'), 'utf8');
  console.log(`${file}: ${n} حرف عربی اصلاح شد`);
  total += n;
}
console.log(`جمع: ${total}`);
