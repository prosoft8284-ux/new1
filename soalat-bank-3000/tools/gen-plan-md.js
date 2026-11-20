/* بازتولید سلول‌های جدول برنامه ۱۷۰ روزه برای ۴۰۰۰ سوال
   هر روز مطالعه = ۸ بلوک ۵ سوالی = ۴۰ سوال، به ترتیب ثابت درس‌ها
   (نظریات ← جامعه‌شناسی‌ها ← روش ← آمار ← زبان) و درون هر درس از بخش نخست به پیشرفته. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, 'barnameh', 'barnameh-170-ruz.md');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));

const ORDER = ['theory', 'domains', 'method', 'amar', 'zaban'];
const TITLES = { theory: 'نظریات', domains: 'جامعه‌شناسی‌ها', method: 'روش', amar: 'آمار', zaban: 'زبان' };
const BLOCK = 5;

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[+d]);
const toNum = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)));

const SUB = {};
for (const s of index.subjects) SUB[s.id] = s;
const sectionOf = (sid, n) => {
  const hit = SUB[sid].sections.find((x) => n >= x.from && n <= x.to);
  return hit ? hit.title : '';
};

const lines = fs.readFileSync(MD, 'utf8').split('\n');
const dayRows = [];
lines.forEach((line, i) => {
  if (!/^\|\s*[۰-۹]+\s*\|/.test(line)) return;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 5) return;
  const hasRanges = /سوال\s*[۰-۹]+\s*[–-]\s*[۰-۹]+/.test(cells[2]);
  const isStudy = /^\*\*(نظریات|جامعه‌شناسی‌ها|روش|آمار|زبان)\*\*/.test(cells[2]);
  dayRows.push({ i, d: toNum(cells[0]), cells, study: hasRanges && isStudy });
});

const studyDays = dayRows.filter((r) => r.study);
if (!studyDays.length) throw new Error('روز مطالعه پیدا نشد');
const N = studyDays.length;

for (const sid of ORDER) {
  if (SUB[sid].total % BLOCK !== 0) throw new Error(`${sid}: تعداد سوال مضرب ۵ نیست (${SUB[sid].total})`);
}

const PER_DAY = 40;
const TOTAL = index.total;
if (TOTAL !== N * PER_DAY) throw new Error(`تعداد سوال با روزها هم‌خوان نیست: ${TOTAL} و ${N}×${PER_DAY}`);

/* بلوک‌های هر درس در کل برنامه */
const blocks = {};
for (const sid of ORDER) blocks[sid] = SUB[sid].total / BLOCK;

/* پایهٔ روزانه: کمینهٔ بلوک هر درس + توزیع اضافه‌ها روی روزها */
const perDayBlocks = PER_DAY / BLOCK;
const perDayBase = {};
for (const sid of ORDER) perDayBase[sid] = Math.floor(blocks[sid] / N);
const usedBase = ORDER.reduce((a, sid) => a + perDayBase[sid], 0);
const extraPerDay = perDayBlocks - usedBase;
const remaining = {};
for (const sid of ORDER) remaining[sid] = blocks[sid] - perDayBase[sid] * N;
if (ORDER.reduce((a, sid) => a + remaining[sid], 0) !== (perDayBlocks - usedBase) * N) {
  throw new Error('توزیع بلوک‌ها جور نشد');
}

const dayBlocks = [];
for (let k = 0; k < N; k++) {
  const row = {};
  for (const sid of ORDER) row[sid] = perDayBase[sid];
  const take = ORDER.filter((sid) => remaining[sid] > 0)
    .sort((a, b) => remaining[b] - remaining[a] || ORDER.indexOf(a) - ORDER.indexOf(b))
    .slice(0, extraPerDay);
  for (const sid of take) { row[sid] += 1; remaining[sid] -= 1; }
  const sum = ORDER.reduce((a, sid) => a + row[sid], 0);
  if (sum !== perDayBlocks) throw new Error(`روز ${studyDays[k].d}: ${sum} بلوک`);
  dayBlocks.push(row);
}
if (Object.values(remaining).some((v) => v !== 0)) throw new Error('بلوک باقی‌مانده توزیع نشد');

const cursor = {};
for (const sid of ORDER) cursor[sid] = 1;

studyDays.forEach((row, k) => {
  const tasks = [];
  for (const sid of ORDER) {
    for (let b = 0; b < dayBlocks[k][sid]; b++) {
      const from = cursor[sid];
      const to = from + BLOCK - 1;
      cursor[sid] = to + 1;
      tasks.push({ sid, from, to, section: sectionOf(sid, from) });
    }
  }
  const count = tasks.reduce((s, t) => s + (t.to - t.from + 1), 0);
  if (count !== PER_DAY) throw new Error(`روز ${row.d}: ${count} سوال`);

  const program = tasks
    .map((t) => `**${TITLES[t.sid]}** — ${t.section} (سوال ${fa(t.from)}–${fa(t.to)})`)
    .join('<br>');

  const perSubject = ORDER.map((sid) => `${TITLES[sid]}: ${fa(dayBlocks[k][sid] * BLOCK)}`).join(' + ');
  row.cells[2] = program;
  row.cells[3] = `${fa(PER_DAY)} (${perSubject})`;
  lines[row.i] = '| ' + row.cells.join(' | ') + ' |';
});

for (const sid of ORDER) {
  if (cursor[sid] !== SUB[sid].total + 1) throw new Error(`${sid}: پوشش ناقص (${cursor[sid] - 1}/${SUB[sid].total})`);
}

fs.writeFileSync(MD, lines.join('\n'));
console.log('جدول بازتولید شد —', N, 'روز مطالعه ×', PER_DAY, 'سوال =', N * PER_DAY, '| هر روز', perDayBlocks, 'بلوک');
