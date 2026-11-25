/* تبدیل جدول برنامه ۱۷۰ روزه (Markdown) به data/plan.json
   + موازنه بار: هر روز مطالعه دقیقاً ۴۰ سوال، در بلوک‌های ۵ سوالی از درس‌های مختلف. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'barnameh', 'barnameh-170-ruz.md');
const OUT = path.join(ROOT, 'data', 'plan.json');

const FA = '۰۱۲۳۴۵۶۷۸۹';
const toNum = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)));
const norm = (s) => s.replace(/\u200c/g, '').trim();

const SUBJECTS = [
  { match: 'نظریات', id: 'theory' },
  { match: 'جامعه‌شناسی‌ها', id: 'domains' },
  { match: 'روش', id: 'method' },
  { match: 'آمار', id: 'amar' },
  { match: 'زبان', id: 'zaban' },
];
const TITLES = { theory: 'نظریات', domains: 'جامعه‌شناسی‌ها', method: 'روش', amar: 'آمار', zaban: 'زبان' };
const ORDER = ['theory', 'domains', 'method', 'amar', 'zaban'];
const PER_DAY = 40;
const BLOCK = 5;

const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const ROUTINE = [
  { wd: 0, title: 'شنبه', program: '۸ بلوک سوال (۴۰ سوال) + مرور ۱۰ دقیقه‌ای دیروز', minutes: 420 },
  { wd: 1, title: 'یک‌شنبه', program: '۸ بلوک سوال (۴۰ سوال) + تحلیل خطاها', minutes: 420 },
  { wd: 2, title: 'دوشنبه', program: '۸ بلوک سوال + ۴۵ دقیقه مطالعه مفهومی منبع', minutes: 450 },
  { wd: 3, title: 'سه‌شنبه', program: '۸ بلوک سوال + فلش‌کارت مفاهیم', minutes: 420 },
  { wd: 4, title: 'چهارشنبه', program: '۸ بلوک سوال + مرور هفته', minutes: 420 },
  { wd: 5, title: 'پنجشنبه', program: 'آزمون مبحثی ۲۵ سوالی + تحلیل کامل + جبران عقب‌افتادگی', minutes: 150 },
  { wd: 6, title: 'جمعه', program: 'استراحت فعال: پیاده‌روی، مرور ۱۵ دقیقه‌ای کارت‌ها، بدون منبع جدید', minutes: 30 },
];

const PHASES = [
  { id: 1, title: 'پایه', from: 1, to: 28, goal: 'بخش‌های آغازین هر پنج درس: کلاسیک‌ها، مفاهیم روش، آمار توصیفی، گرامر پایه — حدود ۸۰۰ سوال' },
  { id: 2, title: 'گسترش', from: 29, to: 70, goal: 'نظریه معاصر، حوزه‌ها، طرح‌ها، آمار استنباطی، واژگان — حدود ۱۲۰۰ سوال' },
  { id: 3, title: 'تسلط', from: 71, to: 112, goal: 'بخش‌های دشوار: تلفیقی، ناپارامتری، رگرسیون، درک مطلب — حدود ۱۲۰۰ سوال' },
  { id: 4, title: 'پایان دور اول', from: 113, to: 140, goal: 'پایان بانک + آزمون مبحثی هفتگی — حدود ۸۰۰ سوال' },
  { id: 5, title: 'جمع‌بندی', from: 141, to: 170, goal: '۲ آزمون جامع + ۲ شبیه‌ساز، مرور خطا و برگه‌های یک‌صفحه‌ای' },
];

const STUDY_METHOD = [
  'هر بلوک ۵ سوالی: ۱۲ دقیقه حل، ۱۰ دقیقه خواندن تحلیل، ۵ دقیقه نوشتن «چرا این گزینه».',
  'بیش از ۲ دقیقه روی یک سوال گیر نکن؛ علامت بزن و برو.',
  'هر پاسخ غلط را در دفتر خطا با سه چیز ثبت کن: علت خطا، نکته درست، «دفعه بعد چه می‌کنم».',
];

/* ---------- خواندن جدول ---------- */
const md = fs.readFileSync(SRC, 'utf8');
const rows = md
  .split('\n')
  .filter((l) => /^\|\s*[۰-۹]+\s*\|/.test(l))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

if (!rows.length) throw new Error('جدول روزبه‌روز پیدا نشد');

const subjectId = (name) => {
  const n = norm(name);
  const hit = SUBJECTS.find((s) => n === norm(s.match) || n.startsWith(norm(s.match)));
  if (!hit) throw new Error('درس ناشناخته: ' + name);
  return hit.id;
};

function parseTask(text) {
  const m = text.match(/^\*\*(.+?)\*\*\s*—\s*([\s\S]+)$/);
  if (!m) return null;
  const sid = subjectId(m[1]);
  const rest = m[2];

  const ranges = [];
  const re = /سوال\s*([۰-۹]+)\s*[–-]\s*([۰-۹]+)/g;
  let r;
  while ((r = re.exec(rest))) ranges.push({ from: toNum(r[1]), to: toNum(r[2]) });
  if (!ranges.length) return null;

  const cut = rest.indexOf('سوال');
  let section = cut > 0 ? rest.slice(0, cut) : '';
  section = section.replace(/[(\s—–-]+$/, '').trim();

  return { subject: sid, subjectTitle: TITLES[sid], section, ranges };
}

function classify(text) {
  const plain = norm(text).replace(/\*\*/g, '').trim();
  if (/^تحلیل/.test(plain)) return 'analysis';
  if (/شبیه|آزمون جامع/.test(plain)) return 'mock';
  if (/روز کنکور/.test(plain)) return 'final';
  if (/آزمون مبحثی/.test(plain)) return 'exam';
  if (/استراحت/.test(plain)) return 'rest';
  if (/^(مرور|تثبیت)/.test(plain)) return 'review';
  return 'study';
}

const days = rows.map((cells) => {
  const d = toNum(cells[0]);
  const w = toNum(cells[1]);
  const program = cells[2];
  const review = cells[4] || '';
  const parts = program.split('<br>').map((p) => p.trim()).filter(Boolean);
  const kind = classify(program);
  const wd = (d - 1) % 7;

  const base = {
    d,
    w,
    phase: (PHASES.find((p) => d >= p.from && d <= p.to) || {}).id || 5,
    weekday: wd,
    weekdayTitle: WEEKDAYS[wd],
    kind,
    text: program.replace(/<br>/g, ' • ').replace(/\*\*/g, ''),
    review,
    minutes: ROUTINE[wd].minutes,
    tasks: [],
    count: 0,
    pool: null,
    size: null,
    timed: false,
  };

  if (kind === 'study') {
    base.tasks = parts.map(parseTask).filter(Boolean);
    if (!base.tasks.length) throw new Error(`روز ${d}: هیچ بلوکی پارس نشد — ${program}`);
    base.count = base.tasks.reduce((s, t) => s + t.ranges.reduce((a, r) => a + (r.to - r.from + 1), 0), 0);
  } else if (kind === 'exam') {
    base.pool = 'week'; base.size = 25; base.timed = true; base.count = 25; base.minutes = 150;
  } else if (kind === 'rest') {
    base.minutes = 30;
  } else if (kind === 'mock') {
    base.pool = 'all'; base.size = 200; base.timed = true; base.minutes = 240;
  } else if (kind === 'review' || kind === 'analysis') {
    const focusMatch = program.match(/\((نظریات|جامعه‌شناسی‌ها|روش|آمار|زبان)\)/) || program.match(/«(نظریات|جامعه‌شناسی‌ها|روش|آمار|زبان)/);
    base.focus = focusMatch ? subjectId(focusMatch[1]) : null;
    base.minutes = 90;
  } else {
    base.minutes = 120;
  }

  return base;
});

/* ---------- موازنه بار ---------- */
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));

const SECTION_OF = {};
for (const s of index.subjects) {
  SECTION_OF[s.id] = s.sections.map((sec) => ({ from: sec.from, to: sec.to, title: sec.title }));
}
function sectionOf(sid, n) {
  const hit = (SECTION_OF[sid] || []).find((s) => n >= s.from && n <= s.to);
  return hit ? hit.title : '';
}

/* روزهایی که ۳۰ سوال ندارند را در بلوک‌های ۵ سوالی از درس‌های مختلف بازتوزیع می‌کند */
function rebalance(days) {
  const odd = days.filter((d) => d.kind === 'study' && d.count !== PER_DAY);
  if (!odd.length) return [];
  const total = odd.reduce((s, d) => s + d.count, 0);
  if (total !== odd.length * PER_DAY) {
    console.warn(`⚠ موازنه انجام نشد: ${odd.length} روز ناهمگون با ${total} سوال (نه دقیقاً ${odd.length * PER_DAY})`);
    return [];
  }

  // صف سوال‌های هر درس به همان ترتیب فعلی
  const queues = { theory: [], domains: [], method: [], amar: [], zaban: [] };
  for (const day of odd) {
    for (const t of day.tasks) {
      for (const r of t.ranges) {
        for (let n = r.from; n <= r.to; n++) queues[t.subject].push(n);
      }
    }
  }

  // هر روز: از هر درس یک بلوک ۵ سوالی، تا ۳۰ سوال
  odd.forEach((day, di) => {
    const picked = [];
    let count = 0;
    let cursor = di % ORDER.length;
    while (count < PER_DAY) {
      let took = false;
      for (let k = 0; k < ORDER.length && count < PER_DAY; k++) {
        const sid = ORDER[(cursor + k) % ORDER.length];
        const q = queues[sid];
        if (!q.length) continue;
        const chunk = q.splice(0, Math.min(BLOCK, PER_DAY - count));
        if (chunk.length) {
          picked.push({ subject: sid, from: chunk[0], to: chunk[chunk.length - 1] });
          count += chunk.length;
          took = true;
        }
      }
      cursor = (cursor + 1) % ORDER.length;
      if (!took) break;
    }

    // ادغام بازه‌های پیوسته در همان درس/بخش
    const tasks = [];
    for (const p of picked) {
      const section = sectionOf(p.subject, p.from);
      const last = tasks[tasks.length - 1];
      if (last && last.subject === p.subject && last.section === section && last.ranges[last.ranges.length - 1].to + 1 === p.from) {
        last.ranges[last.ranges.length - 1].to = p.to;
      } else {
        tasks.push({ subject: p.subject, subjectTitle: TITLES[p.subject], section, ranges: [{ from: p.from, to: p.to }] });
      }
    }
    day.tasks = tasks;
    day.count = tasks.reduce((s, t) => s + t.ranges.reduce((a, r) => a + (r.to - r.from + 1), 0), 0);
    day.text = tasks.map((t) => `${TITLES[t.subject]} — ${t.ranges.map((r) => `${r.from}–${r.to}`).join(' و ')}`).join(' • ');
  });
  return odd.map((d) => d.d);
}

const balanced = rebalance(days);

/* ---------- اعتبارسنجی پوشش ---------- */
const seen = new Map();
for (const day of days) {
  for (const t of day.tasks) {
    for (const r of t.ranges) {
      for (let n = r.from; n <= r.to; n++) {
        const id = `${t.subject}-${n}`;
        if (seen.has(id)) throw new Error(`سوال تکراری در برنامه: ${id} (روز ${seen.get(id)} و ${day.d})`);
        seen.set(id, day.d);
      }
    }
  }
}

const report = index.subjects.map((s) => {
  const covered = [...seen.keys()].filter((id) => id.startsWith(s.id + '-')).length;
  return { id: s.id, title: s.title, total: s.total, covered, missing: s.total - covered };
});

/* ---------- خروجی ---------- */
const plan = {
  generated: new Date().toISOString(),
  totalDays: days.length,
  perDay: PER_DAY,
  balancedDays: balanced,
  phases: PHASES,
  routine: ROUTINE,
  studyMethod: STUDY_METHOD,
  report,
  totalQuestions: [...seen.keys()].length,
  days,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(plan));

const study = days.filter((d) => d.kind === 'study');
const counts = {};
for (const d of study) counts[d.count] = (counts[d.count] || 0) + 1;

console.log('روزها:', days.length, '| روزهای مطالعه:', study.length);
console.log('سوالات پوشش‌داده‌شده (یکتا):', seen.size);
for (const r of report) console.log(`  ${r.title}: ${r.covered}/${r.total}` + (r.missing ? `  ← ${r.missing} پوشش‌نشده` : '  ✓'));
const kinds = {};
for (const d of days) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
console.log('نوع روزها:', JSON.stringify(kinds));
console.log('توزیع تعداد سوال روزانه:', JSON.stringify(counts));
if (balanced.length) console.log('روزهای موازنه‌شده:', balanced.join(', '));
console.log('حجم plan.json:', (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
if (report.some((r) => r.missing > 0)) process.exitCode = 1;
if (Object.keys(counts).some((c) => Number(c) !== PER_DAY)) process.exitCode = 1;
