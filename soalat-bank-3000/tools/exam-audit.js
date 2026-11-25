/* سنجش ارتباط بانک سوال با کنکور کارشناسی ارشد جامعه‌شناسی
   - هر پنج فایل دقیقاً منطبق بر پنج درس دفترچهٔ علوم اجتماعی است.
   - سه سطح: هستهٔ پرتکرار / تعمیقی و کم‌تکرار / فراتر از سطح معمول آزمون.
   سطح هر بخش از روی عنوان بخش تعیین می‌شود (قاعدهٔ شفاف و قابل بازبینی). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));

const DEEP = /(تعمیق|تکمیل|پیشرفته|تخصصی|سطح بالا|جزئیات|تلفیقی|مقایسه|بازخوانی|تکمیلی)/;
const BEYOND = /(دیجیتال|بوت‌استرپ|بیزی|شبکه|ماشین|هوش مصنوعی|کلان‌داده|متن‌کاوی|ارزیابی برنامه)/;

const SUBJECT_EXAM = {
  theory: 'نظریه‌های جامعه‌شناسی',
  domains: 'جامعه‌شناسی (مبانی و حوزه‌ها)',
  method: 'روش تحقیق',
  amar: 'آمار',
  zaban: 'زبان عمومی و تخصصی',
};

const level = (title) => (BEYOND.test(title) ? 'beyond' : DEEP.test(title) ? 'deep' : 'core');
const LABEL = { core: 'هستهٔ پرتکرار', deep: 'تعمیقی/کم‌تکرار', beyond: 'فراتر از سطح معمول' };

const rows = [];
const totals = { core: 0, deep: 0, beyond: 0 };
let total = 0;

for (const s of index.subjects) {
  const t = { core: 0, deep: 0, beyond: 0 };
  const beyondTitles = [];
  for (const sec of s.sections) {
    const lv = level(sec.title);
    t[lv] += sec.count;
    if (lv === 'beyond') beyondTitles.push(`${sec.title} (${sec.count})`);
  }
  totals.core += t.core; totals.deep += t.deep; totals.beyond += t.beyond; total += s.total;
  rows.push({ id: s.id, title: s.title, exam: SUBJECT_EXAM[s.id], total: s.total, ...t, beyondTitles });
}

const pct = (n) => ((n / total) * 100).toFixed(1);
console.log('درس بانک | درس دفترچه | کل | هسته | تعمیقی | فراتر');
for (const r of rows) {
  console.log(`${r.title} | ${r.exam} | ${r.total} | ${r.core} | ${r.deep} | ${r.beyond}`);
}
console.log('---');
console.log(`جمع: ${total}`);
for (const k of ['core', 'deep', 'beyond']) console.log(`${LABEL[k]}: ${totals[k]} (${pct(totals[k])}%)`);
console.log('---');
for (const r of rows) if (r.beyondTitles.length) console.log(r.title + ' → ' + r.beyondTitles.join(' | '));
