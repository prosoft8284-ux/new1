const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'barnameh');
const OUT = path.join(OUT_DIR, 'barnameh-170-ruz.md');

const SUBJECTS = [
  { key: 'theory', file: 'soalat/01-nazariye-jameshenasi.txt', name: 'نظریات جامعه‌شناسی', tag: 'نظریات', quota: 70 },
  { key: 'domains', file: 'soalat/02-jameshenasi-haye-mokhtalef.txt', name: 'جامعه‌شناسی‌های مختلف', tag: 'جامعه‌شناسی‌ها', quota: 74 },
  { key: 'method', file: 'soalat/03-ravesh-tahqiq.txt', name: 'روش تحقیق', tag: 'روش', quota: 54 },
  { key: 'stat', file: 'soalat/04-amar.txt', name: 'آمار', tag: 'آمار', quota: 54 },
  { key: 'lang', file: 'soalat/05-zaban.txt', name: 'زبان انگلیسی', tag: 'زبان', quota: 48 },
];

const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const toEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

function parseSubject(s) {
  const text = fs.readFileSync(path.join(ROOT, s.file), 'utf8').split('\n');
  const sections = [];
  let current = null;
  let maxQ = 0;
  for (const line of text) {
    const t = line.trim();
    if (t.startsWith('—') && !/^—+\s*$/.test(t)) {
      current = { title: t.replace(/^—\s*/, '').replace(/\s*—$/, ''), start: null };
      sections.push(current);
      continue;
    }
    const m = t.match(/^([۰-۹]+)\)/);
    if (m) {
      const n = +toEn(m[1]);
      maxQ = Math.max(maxQ, n);
      if (current && current.start === null) current.start = n;
      else if (!current) {
        current = { title: 'بخش اول', start: n };
        sections.push(current);
      }
    }
  }
  const real = sections.filter((x) => x.start !== null);
  real.forEach((sec, i) => {
    sec.end = i + 1 < real.length ? real[i + 1].start - 1 : maxQ;
  });
  return { ...s, total: maxQ, sections: real };
}

const subs = SUBJECTS.map(parseSubject);

// blocks of 5 questions
subs.forEach((s) => {
  s.blocks = [];
  const size = 5;
  for (let q = 1; q <= s.total; q += size) {
    const end = Math.min(q + size - 1, s.total);
    const sec = s.sections.find((x) => q >= x.start && q <= x.end) ||
      s.sections[s.sections.length - 1];
    s.blocks.push({ from: q, to: end, topic: sec.title });
  }
  s.used = 0;
});

// weighted round-robin: always pick subjects with the smallest used/quota
const order = [];
const totalBlocks = subs.reduce((a, s) => a + s.blocks.length, 0);
while (order.length < totalBlocks) {
  const pick = subs
    .filter((s) => s.used < s.blocks.length)
    .sort((a, b) => a.used / a.quota - b.used / b.quota)[0];
  order.push({ subject: pick, block: pick.blocks[pick.used] });
  pick.used += 1;
}

// build 170 days
const days = [];
const TOTAL_DAYS = 170;

function weekLabel(d) {
  return Math.ceil(d / 7);
}

// phase 1..20: five study days + test day + rest day
const BLOCKS_PER_DAY = Math.max(4, Math.ceil(totalBlocks / 100));
const studyDaysNeeded = Math.ceil(totalBlocks / BLOCKS_PER_DAY);
const weeksNeeded = Math.ceil(studyDaysNeeded / 5);
const firstPassDays = weeksNeeded * 7;
let cursor = 0;
let pending = order.slice();
const logs = [];
for (let d = 1; d <= firstPassDays; d++) {
  const pos = ((d - 1) % 7) + 1; // 1..7 => within week
  const week = weekLabel(d);
  if (pos <= 5) {
    const picked = [];
    const usedKeys = new Set();
    const taken = new Set();
    for (let i = 0; i < pending.length && picked.length < BLOCKS_PER_DAY; i++) {
      const item = pending[i];
      if (picked.length < Math.min(5, BLOCKS_PER_DAY) && usedKeys.has(item.subject.key)) continue;
      usedKeys.add(item.subject.key);
      picked.push(item);
      taken.add(i);
    }
    // remove the chosen items, keep the rest as pending for later days
    pending = pending.filter((_, i) => !taken.has(i));
    cursor += picked.length;
    days.push({
      day: d,
      week,
      type: 'study',
      blocks: picked.map((p) => ({
        tag: p.subject.tag,
        from: p.block.from,
        to: p.block.to,
        topic: p.block.topic,
        key: p.subject.key,
      })),
    });
  } else if (pos === 6) {
    const weeklyQuestions = days
      .filter((x) => x.week === week && x.type === 'study')
      .reduce((a, x) => a + x.blocks.reduce((b, y) => b + (y.to - y.from + 1), 0), 0);
    days.push({
      day: d,
      week,
      type: 'test',
      weeklyQuestions,
      blocks: [],
    });
  } else {
    days.push({ day: d, week, type: 'rest', blocks: [] });
  }
}

// safety: if any block is still pending, add it to the last study day
if (pending.length) {
  const lastStudy = [...days].reverse().find((d) => d.type === 'study');
  for (const item of pending) {
    lastStudy.blocks.push({ tag: item.subject.tag, from: item.block.from, to: item.block.to, topic: item.block.topic, key: item.subject.key });
  }
  cursor += pending.length;
  pending = [];
}

// days 141-170: consolidation

const extraTasks = [
  ['مرور هدفمند', 'بازحل سوالات علامت‌دار و خلاصه‌نویسی: نظریات جامعه‌شناسی'],
  ['مرور هدفمند', 'بازحل سوالات علامت‌دار: جامعه‌شناسی‌های مختلف'],
  ['مرور هدفمند', 'بازحل سوالات علامت‌دار: روش تحقیق'],
  ['مرور هدفمند', 'بازحل سوالات علامت‌دار: آمار'],
  ['مرور هدفمند', 'بازحل سوالات علامت‌دار: زبان انگلیسی'],
  ['مرور مبحثی', 'مرور سریع بخش‌های ضعیف + نوشتن برگه یک‌صفحه‌ای'],
];
const extraCount = 140 - firstPassDays;
for (let k = 0; k < extraCount; k++) {
  const t = extraTasks[k % extraTasks.length];
  days.push({ day: firstPassDays + 1 + k, week: weekLabel(firstPassDays + 1 + k), type: 'final', blocks: [], task: t[1], finalType: t[0] });
}

const plan141 = [
  [141, 'مرور', 'بازخوانی خلاصه‌نویسی‌ها: نظریات کلاسیک + فهرست مفاهیم کلیدی (بدون سوال جدید)'],
  [142, 'مرور', 'بازخوانی خلاصه‌نویسی‌ها: نظریات معاصر + مقایسه‌های متفکران'],
  [143, 'مرور', 'مرور دفتر خطا: همه سوالات غلط «نظریات و جامعه‌شناسی‌ها» + نوشتن علت خطا'],
  [144, 'مرور', 'مرور دفتر خطا: همه سوالات غلط «روش و آمار» + بازحل محاسبات'],
  [145, 'مرور', 'مرور دفتر خطا: زبان (گرامر، واژگان، درک مطلب) + ۳۰ واژه تازه'],
  [146, 'مرور', 'مرور فشرده جدول‌ها و نکات پرتکرار؛ آماده‌سازی برگه یک‌صفحه‌ای هر درس'],
  [147, 'آزمون جامع ۱', 'آزمون جامع ۲۰۰ سوالی در شرایط زمانی واقعی + تحلیل کامل و ثبت خطاها'],
  [148, 'تحلیل', 'تحلیل آزمون ۱: دسته‌بندی خطاها (نبود دانش / بدفهمی / بی‌دقتی / کمبود زمان)'],
  [149, 'مرور هدفمند', 'بازحل سوالات غلط آزمون ۱ (نظریات) + مرور مبحث ضعیف'],
  [150, 'مرور هدفمند', 'بازحل سوالات غلط آزمون ۱ (جامعه‌شناسی‌ها) + مرور مبحث ضعیف'],
  [151, 'مرور هدفمند', 'بازحل سوالات غلط آزمون ۱ (روش) + مرور مبحث ضعیف'],
  [152, 'مرور هدفمند', 'بازحل سوالات غلط آزمون ۱ (آمار) + مرور فرمول‌ها'],
  [153, 'مرور هدفمند', 'بازحل سوالات غلط آزمون ۱ (زبان) + تمرین ترجمه و درک مطلب'],
  [154, 'آزمون جامع ۲', 'آزمون جامع ۲۰۰ سوالی + تحلیل کامل'],
  [155, 'تحلیل', 'تحلیل آزمون ۲ و مقایسه روند با آزمون ۱ (کدام درس رشد کرد، کدام نه)'],
  [156, 'مرور دوم', 'مرور دوم سوالات علامت‌دار نظریات (سوالاتی که دو بار غلط زده شدند)'],
  [157, 'مرور دوم', 'مرور دوم سوالات علامت‌دار جامعه‌شناسی‌ها'],
  [158, 'مرور دوم', 'مرور دوم سوالات علامت‌دار روش'],
  [159, 'مرور دوم', 'مرور دوم سوالات علامت‌دار آمار + بازسازی فرمول‌ها از حافظه'],
  [160, 'مرور دوم', 'مرور دوم سوالات علامت‌دار زبان + بازخوانی متن‌های درک مطلب'],
  [161, 'شبیه‌ساز ۳', 'آزمون شبیه‌ساز در ساعت واقعی کنکور + تحلیل'],
  [162, 'تحلیل', 'تحلیل شبیه‌ساز ۳: مدیریت زمان و ترتیب پاسخ‌گویی را اصلاح کن'],
  [163, 'مرور', 'مرور نکات پرتکرار سه درس اول؛ بازخوانی برگه‌های یک‌صفحه‌ای'],
  [164, 'شبیه‌ساز ۴', 'آزمون شبیه‌ساز ۴ در ساعت واقعی کنکور + تحلیل'],
  [165, 'تحلیل', 'تحلیل شبیه‌ساز ۴؛ فهرست نهایی «۱۰ نکته‌ای که نباید فراموش کنم»'],
  [166, 'مرور نهایی', 'مرور کلیدها و تحلیل‌های کوتاه: نظریات + جامعه‌شناسی‌ها'],
  [167, 'مرور نهایی', 'مرور کلیدها و تحلیل‌های کوتاه: روش + آمار + زبان'],
  [168, 'تثبیت', 'مرور سطحی برگه‌های یک‌صفحه‌ای؛ بدون منبع جدید؛ خواب منظم'],
  [169, 'تثبیت', 'مرور سطحی + یک آزمون کوچک ۴۰ سوالی فقط برای گرم‌کردن'],
  [170, 'روز کنکور', 'مرور ۲۰ دقیقه‌ای برگه‌ها؛ آرامش، تغذیه، رسیدن به‌موقع به حوزه'],
];
for (const [d, type, task] of plan141) {
  days.push({ day: d, week: weekLabel(d), type: 'final', blocks: [], task, finalType: type });
}

// ---- checks ----
const studyDays = days.filter((x) => x.type === 'study');
const scheduled = studyDays.reduce((a, x) => a + x.blocks.reduce((b, y) => b + (y.to - y.from + 1), 0), 0);
const perSubject = {};
for (const day of studyDays) {
  for (const b of day.blocks) {
    perSubject[b.tag] = (perSubject[b.tag] || 0) + (b.to - b.from + 1);
  }
}
const missing = cursor < order.length ? order.length - cursor : 0;

// ---- markdown ----
const L = [];
L.push('# برنامه ۱۷۰ روزه کنکور کارشناسی ارشد جامعه‌شناسی');
L.push('');
L.push(`> تألیف‌شده بر پایه بانک ${fa(subs.reduce((a,x)=>a+x.total,0))} سوالی این پروژه (۵ فایل). هر سوال بانک دقیقاً یک بار در دور اول برنامه می‌آید؛ دور دوم و آزمون‌ها روی همان سوالات علامت‌دار تمرکز دارند.`);
L.push('');
L.push('## ۱. تصویر کلی');
L.push('');
L.push('| بازه | روزها | کار اصلی | هدف قابل سنجش |');
L.push('|---|---|---|---|');
const qUpTo = (d) => days.filter((x) => x.day <= d && x.type === 'study').reduce((a, x) => a + x.blocks.reduce((b, y) => b + (y.to - y.from + 1), 0), 0);
L.push(`| فاز ۱ — پایه | ۱–۲۸ | کلاسیک‌ها، مفاهیم روش، آمار توصیفی، گرامر پایه | ${fa(qUpTo(28))} سوال اول بانک |`);
L.push(`| فاز ۲ — گسترش | ۲۹–۷۰ | نظریه معاصر، حوزه‌های جامعه‌شناسی، طرح‌ها، آمار استنباطی، واژگان | ${fa(qUpTo(70) - qUpTo(28))} سوال بعدی |`);
L.push(`| فاز ۳ — تسلط | ۷۱–۱۱۲ | بخش‌های دشوار: تلفیقی، ناپارامتری، رگرسیون، درک مطلب | ${fa(qUpTo(112) - qUpTo(70))} سوال بعدی |`);
L.push(`| فاز ۴ — پایان دور اول | ۱۱۳–${fa(firstPassDays)} | سوالات پایانی + آزمون مبحثی هفتگی | بانک کامل شود |`);
L.push(`| فاز ۵ — جمع‌بندی | ${fa(firstPassDays + 1)}–۱۷۰ | ۲ آزمون جامع + ۲ شبیه‌ساز، مرور خطا و برگه‌های یک‌صفحه‌ای | آمادگی اجرایی و مدیریت زمان |`);
L.push('');
const blocksPerDayQ = BLOCKS_PER_DAY * 5;
L.push(`جمع سوالات دور اول: **${fa(subs.reduce((a,x)=>a+x.total,0))}** — روزهای مطالعه: **${fa(Math.round(subs.reduce((a,x)=>a+x.total,0)/(blocksPerDayQ)))} روز × ${fa(blocksPerDayQ)} سوال**.`);
L.push('');
L.push('## ۲. الگوی هفتگی (هفته‌های ۱ تا ۱۸)');
L.push('');
L.push('| روز | برنامه | زمان پیشنهادی |');
L.push('|---|---|---|');
L.push(`| شنبه | ${fa(BLOCKS_PER_DAY)} بلوک سوال (${fa(BLOCKS_PER_DAY*5)} سوال) + مرور ۱۰ دقیقه‌ای دیروز | ${fa(BLOCKS_PER_DAY)} ساعت |`);
L.push(`| یک‌شنبه | ${fa(BLOCKS_PER_DAY)} بلوک سوال + تحلیل خطاها | ${fa(BLOCKS_PER_DAY)} ساعت |`);
L.push(`| دوشنبه | ${fa(BLOCKS_PER_DAY)} بلوک سوال + ۴۵ دقیقه مطالعه مفهومی منبع | ${fa(BLOCKS_PER_DAY+0.5)} ساعت |`);
L.push(`| سه‌شنبه | ${fa(BLOCKS_PER_DAY)} بلوک سوال + فلش‌کارت مفاهیم | ${fa(BLOCKS_PER_DAY)} ساعت |`);
L.push(`| چهارشنبه | ${fa(BLOCKS_PER_DAY)} بلوک سوال + مرور هفته | ${fa(BLOCKS_PER_DAY)} ساعت |`);
L.push('| پنجشنبه | آزمون مبحثی ۲۵ سوالی (۲۵ دقیقه) + تحلیل کامل + جبران عقب‌افتادگی | ۲–۳ ساعت |');
L.push('| جمعه | استراحت فعال: پیاده‌روی، مرور ۱۵ دقیقه‌ای کارت‌ها، بدون منبع جدید | — |');
L.push('');
L.push('**قاعده روزانه:** هر بلوک ۵ سوالی = ۱۲ دقیقه حل + ۱۰ دقیقه خواندن تحلیل + ۵ دقیقه نوشتن «چرا این گزینه». اگر جایی گیر کردی، بیشتر از ۲ دقیقه روی یک سوال نمان.');
L.push('');
L.push('## ۳. جدول روزبه‌روز');
L.push('');
L.push('| روز | هفته | برنامه | سوالات | مرور |');
L.push('|---|---|---|---|---|');

for (const day of days) {
  if (day.type === 'study') {
    const groups = [];
    for (const b of day.blocks) {
      const g = groups.find((x) => x.tag === b.tag);
      if (g) g.items.push(b);
      else groups.push({ tag: b.tag, items: [b] });
    }
    const prog = groups
      .map((g) => g.items.length === 1
        ? `**${g.tag}** — ${g.items[0].topic} (سوال ${fa(g.items[0].from)}–${fa(g.items[0].to)})`
        : `**${g.tag}** — ${g.items.map((b) => `سوال ${fa(b.from)}–${fa(b.to)}`).join(' و ')}`)
      .join('<br>');
    const qs = groups.map((g) => `${g.tag}: ${fa(g.items.reduce((a, b) => a + (b.to - b.from + 1), 0))}`).join(' + ');
    const qTotal = day.blocks.reduce((a, b) => a + (b.to - b.from + 1), 0);
    L.push(`| ${fa(day.day)} | ${fa(day.week)} | ${prog} | ${fa(qTotal)} (${qs}) | ۱۰ دقیقه مرور دیروز + فلش‌کارت |`);
  } else if (day.type === 'test') {
    L.push(`| ${fa(day.day)} | ${fa(day.week)} | **آزمون مبحثی هفته** — ۱۵ سوال از مباحث همین هفته + ۱۰ سوال از هفته‌های قبل (۲۵ دقیقه، بدون کتاب) | ۲۵ | تحلیل کامل خطاها + نوشتن علت هر خطا در دفتر خطا |`);
  } else if (day.type === 'rest') {
    L.push(`| ${fa(day.day)} | ${fa(day.week)} | **استراحت فعال** — بدون منبع جدید؛ جبران عقب‌افتادگی هفته | — | ۱۵ دقیقه کارت مفاهیم (اختیاری) |`);
  } else {
    L.push(`| ${fa(day.day)} | ${fa(day.week)} | **${day.finalType}** — ${day.task} | — | — |`);
  }
}

L.push('');
L.push('## ۴. قواعد مرور فاصله‌دار');
L.push('');
L.push('1. **۲۴ ساعت:** فردای هر بلوک، فقط تحلیل‌های همان بلوک را بازخوانی کن (۱۰ دقیقه).');
L.push('2. **۷ روز:** در آزمون پنجشنبه، چند سوال از هفته قبل بیاید تا بازیابی از حافظه اتفاق بیفتد.');
L.push('3. **۳۰ روز:** در روزهای ۱۴۱–۱۴۶ همه سوالات علامت‌دار را دوباره بزن؛ اگر درست زدی، علامت را بردار.');
L.push('4. **دفتر خطا:** برای هر سوال غلط سه چیز بنویس: علت خطا، نکته درست، و یک جمله «دفعه بعد چه می‌کنم».');
L.push('');
L.push('## ۵. آزمون‌ها');
L.push('');
L.push('| آزمون | روز | حجم | هدف |');
L.push('|---|---|---|---|');
L.push('| مبحثی هفتگی | هر پنجشنبه | ۲۵ سوال | تثبیت و بازیابی |');
L.push('| جامع ۱ | ۱۴۷ | ۲۰۰ سوال | سنجش کل + مدیریت زمان |');
L.push('| جامع ۲ | ۱۵۴ | ۲۰۰ سوال | مقایسه روند |');
L.push('| شبیه‌ساز ۳ | ۱۶۱ | در ساعت کنکور | تمرین شرایط واقعی |');
L.push('| شبیه‌ساز ۴ | ۱۶۴ | در ساعت کنکور | تثبیت روال |');
L.push('');
L.push('## ۶. اگر عقب افتادی');
L.push('');
L.push('- **۱ تا ۳ روز عقب:** روز جمعه را به جبران بده؛ تعداد سوال روزهای بعد را زیاد نکن.');
L.push('- **یک هفته عقب:** فاز پایان دور اول (روزهای ۱۱۳–۱۲۶) را یک هفته کوتاه کن، نه اینکه سوالات را حذف کنی؛ بلوک‌های «جامعه‌شناسی‌ها» قابل فشرده‌شدن‌ترند.');
L.push('- **یک درس کاملاً جا افتاد:** ۲۰ سوال روزانه را به ۲۴ برسان فقط برای همان درس و از فاز جمع‌بندی کم کن.');
L.push('- **فرسودگی:** دو روز کامل استراحت بهتر از دو هفته مطالعه بی‌کیفیت است؛ برنامه را از روز جاری ادامه بده، نه از اول.');
L.push('');
L.push('## ۷. نکات روزهای آخر');
L.push('');
L.push('- روز ۱۶۸ و ۱۶۹: هیچ مبحث تازه‌ای باز نکن؛ فقط برگه‌های یک‌صفحه‌ای و کارت‌ها.');
L.push('- ساعت خواب را از روز ۱۶۰ به ساعت کنکور نزدیک کن.');
L.push('- در جلسه: اول سوالات مطمئن، بعد محاسبات آمار، زبان در پایان اگر وقت ماند؛ برای هر سوال سقف ۷۵ ثانیه بگذار.');
L.push('');
L.push('## ۸. نسخه سبک (اگر شاغل هستی یا وقت محدود داری)');
L.push('');
L.push('- روزی ۲ ساعت: دو بلوک ۵ سوالی + ۲۰ دقیقه تحلیل + ۱۵ دقیقه کارت مفاهیم.');
L.push('- در این حالت دور اول کامل در ۱۷۰ روز جا نمی‌شود؛ اولویت را به نظریات، روش و آمار بده و زبان را به ۵ سوال در روز کاهش بده.');
L.push('- سوالات باقی‌مانده را در فاز جمع‌بندی به‌صورت «تست سریع بدون تحلیل کامل» بزن، فقط برای آشنایی با تیپ سوال.');
L.push('');
L.push('## ۹. محدودیت‌ها');
L.push('');
L.push('- این برنامه بر پایه بانک سوالات همین پروژه نوشته شده؛ اگر منبع یا جزوه دیگری داری، ۴۵ دقیقه مطالعه مفهومی روزهای دوشنبه را به آن اختصاص بده.');
L.push('- تاریخ شروع در فایل ثبت نشده؛ «روز ۱» را روزی بگذار که واقعاً شروع می‌کنی.');
L.push('- برنامه جایگزین آزمون واقعی نیست: بازخورد آزمون‌های آزمایشی بیرونی را در روزهای پنجشنبه لحاظ کن.');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, L.join('\n') + '\n', 'utf8');

console.log('days:', days.length);
console.log('study days:', studyDays.length);
console.log('scheduled questions:', scheduled);
console.log('per subject:', perSubject);
console.log('blocks used:', cursor, '/', order.length, 'missing:', missing);
console.log('file:', OUT);
