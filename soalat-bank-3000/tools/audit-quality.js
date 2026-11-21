/* بازرس کیفیت محتوا: تحلیل‌ها، کلیدها، تله‌های تستی و پوشش سرفصل
   اجرا: node tools/audit-quality.js [--coverage] [--verbose] */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'soalat');
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const FILES = {
  '01-nazariye-jameshenasi.txt': 'theory',
  '02-jameshenasi-haye-mokhtalef.txt': 'domains',
  '03-ravesh-tahqiq.txt': 'method',
  '04-amar.txt': 'amar',
  '05-zaban.txt': 'zaban',
};

function parse(file) {
  const lines = fs.readFileSync(path.join(DIR, file), 'utf8').replace(/\r/g, '').split('\n');
  const out = [];
  let q = null;
  let section = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const sec = t.match(/^—\s*(.+?)\s*—$/);
    if (sec) { section = norm(sec[1]); q = null; continue; }
    const qm = t.match(/^([۰-۹]+)\)\s*(.+)$/);
    if (qm) {
      q = { n: +toEn(qm[1]), q: norm(qm[2]), options: [], key: 0, exp: '', section };
      out.push(q);
      continue;
    }
    if (!q) continue;
    const om = line.match(/^\s+([۱-۴])\.\s*(.+)$/);
    if (om) { q.options.push(norm(om[2])); continue; }
    const km = t.match(/^✔\s*کلید:\s*گزینه\s*([۱-۴])/);
    if (km) { q.key = +toEn(km[1]); continue; }
    const em = t.match(/^✎\s*تحلیل:\s*(.+)$/);
    if (em) { q.exp = norm(em[1]); continue; }
  }
  return out;
}

const GENERIC = /^(این سوال|در این سوال|طبق متن|بر اساس متن|گزینه \d|پاسخ صحیح|همان‌طور که)/;
const HEDGE = /(شاید|احتمالاً|به نظر می‌رسد|تقریباً می‌توان)/;
const CONTRADICT = [
  /گزینه\s*([۱-۴])\s*(?:نیز\s*)?(?:درست|صحیح|برتر|بهتر)\s*است/,
  /(?:درست|صحیح)\s*(?:آن|این)\s*گزینه\s*([۱-۴])/,
  /کلید\s*(?:را\s*)?گزینه\s*([۱-۴])/,
];

const report = { files: [], problems: [], coverage: [] };

function auditFile(file, id) {
  const qs = parse(file);
  const r = {
    file, id, n: qs.length, noKey: 0, badOpts: 0, dupOptions: 0,
    shortExp: 0, genericExp: 0, hedgeExp: 0, contradict: 0, lengthTell: 0,
    sameStart: 0, nearDup: 0, samples: {},
  };
  const stems = new Map();
  for (const q of qs) {
    if (!q.key) r.noKey++;
    if (q.options.length !== 4) r.badOpts++;
    if (new Set(q.options).size !== q.options.length) r.dupOptions++;
    if (q.exp.length < 55) r.shortExp++;
    if (GENERIC.test(q.exp)) {
      r.genericExp++;
      (r.samples.generic = r.samples.generic || []).length < 5 && r.samples.generic.push(`Q${q.n}: ${q.exp.slice(0, 90)}`);
    }
    if (HEDGE.test(q.exp)) {
      r.hedgeExp++;
      (r.samples.hedge = r.samples.hedge || []).length < 5 && r.samples.hedge.push(`Q${q.n}: ${q.exp.slice(0, 90)}`);
    }
    for (const re of CONTRADICT) {
      const m = q.exp.match(re);
      if (m && +toEn(m[1]) !== q.key) {
        r.contradict++;
        (r.samples.contradict = r.samples.contradict || []).length < 8 &&
          r.samples.contradict.push(`Q${q.n} key=${q.key} :: ${q.exp.slice(0, 110)}`);
        break;
      }
    }
    // تلهٔ طول گزینه: گزینهٔ درست به‌طور محسوس بلندتر از بقیه
    const correct = q.options[q.key - 1] || '';
    const others = q.options.filter((_, i) => i !== q.key - 1);
    if (others.length === 3 && correct.length > 18) {
      const avg = others.reduce((a, o) => a + o.length, 0) / others.length;
      if (correct.length - avg > 22) {
        r.lengthTell++;
        (r.samples.lengthTell = r.samples.lengthTell || []).length < 5 &&
          r.samples.lengthTell.push(`Q${q.n} ${Math.round(avg)}→${correct.length} :: ${correct.slice(0, 60)}`);
      }
    }
    const stemKey = q.q.slice(0, 45).replace(/[«»"']/g, '');
    if (stems.has(stemKey)) {
      r.nearDup++;
      (r.samples.nearDup = r.samples.nearDup || []).length < 5 &&
        r.samples.nearDup.push(`Q${q.n} ~ Q${stems.get(stemKey)}`);
    } else stems.set(stemKey, q.n);
    if (q.exp.slice(0, 30) === qs[0].exp.slice(0, 30) && q.n !== qs[0].n) r.sameStart++;
  }
  report.files.push(r);
  return { qs, r };
}

// ---------- نقشهٔ سرفصل: هر مدخل = موضوعی که در آزمون می‌آید و کلیدواژه‌هایش ----------
const SYLLABUS = {
  theory: {
    'کنت و پوزیتیویسم': ['کنت', 'پوزیتیویسم', 'سه‌مرحله'],
    'اسپنسر و داروینیسم اجتماعی': ['اسپنسر', 'داروینیسم'],
    'مارکس و ماتریالیسم تاریخی': ['مارکس', 'بیگانگی', 'بت‌وارگی', 'زیربنا'],
    'دورکیم و واقعیت اجتماعی': ['دورکیم', 'خودکشی', 'همبستگی', 'وجدان جمعی'],
    'وبر و کنش/عقلانیت': ['وبر', 'کنش اجتماعی', 'عقلانیت', 'دیوان‌سالاری', 'قفس آهنین'],
    'زیمل و صورت‌های اجتماعی': ['زیمل', 'صورت اجتماعی', 'بیگانه'],
    'کنش متقابل نمادین': ['مید', 'بلومر', 'کنش متقابل نمادین', 'دیگری تعمیم'],
    'پدیدارشناسی و اتنومتدولوژی': ['شوتس', 'پدیدارشناسی', 'گارفینکل', 'اتنومتدولوژی'],
    'کارکردگرایی ساختاری': ['پارسونز', 'مرتن', 'کارکردگرایی', 'کژکارکرد'],
    'نظریهٔ انتقادی و هابرماس': ['آدورنو', 'هورکهایمر', 'هابرماس', 'کنش ارتباطی', 'حوزهٔ عمومی'],
    'لومان و سیستمی‌ها': ['لومان', 'سیستم اجتماعی', 'خودارجاع'],
    'ساختارگرایی و پساساختارگرایی': ['لوی‌استروس', 'فوکو', 'دریدا', 'بوردیو', 'ساختارگرایی'],
    'فمینیسم': ['فمینیسم', 'جنسیت', 'مردسالاری'],
    'نظریه‌های معاصر/جهانی‌شدن': ['گیدنز', 'بک', 'جهانی‌شدن', 'باستیانس'],
    'نظریهٔ اجتماعی ایران': ['ایران', 'شریعتی', 'آل‌احمد', 'کاتوزیان'],
  },
  domains: {
    'مفاهیم بنیادی جامعه‌شناسی': ['جامعه‌پذیری', 'نهاد', 'گروه', 'قشربندی'],
    'فرهنگ و هنجار': ['فرهنگ', 'هنجار', 'ارزش', 'خرده‌فرهنگ'],
    'جامعه‌شناسی خانواده': ['خانواده', 'ازدواج', 'طلاق'],
    'جامعه‌شناسی شهری': ['شهری', 'حاشیه‌نشینی', 'شهرسازی'],
    'جامعه‌شناسی روستایی و عشایری': ['روستا', 'عشایر', 'دهقان'],
    'جامعه‌شناسی توسعه': ['توسعه', 'نوسازی', 'وابستگی'],
    'جامعه‌شناسی سیاسی': ['قدرت', 'دولت', 'اقتدار', 'سیاسی'],
    'جامعه‌شناسی انقلاب و جنبش': ['انقلاب', 'جنبش اجتماعی', 'اعتراض'],
    'جامعه‌شناسی سازمان و کار': ['سازمان', 'بوروکراسی', 'کار و شغل'],
    'جامعه‌شناسی آموزش': ['آموزش', 'مدرسه', 'سواد'],
    'جامعه‌شناسی دین': ['دین', 'سکولار', 'مذهب'],
    'جامعه‌شناسی انحراف و آسیب': ['انحراف', 'آسیب اجتماعی', 'جرم'],
    'جامعه‌شناسی قشرها و نابرابری': ['نابرابری', 'طبقه', 'قشر', 'فقر'],
    'جامعه‌شناسی ارتباطات': ['ارتباطات', 'رسانه', 'افکار عمومی'],
    'جامعه‌شناسی پزشکی و بدن': ['پزشکی', 'سلامت', 'بیماری', 'بدن'],
    'روان‌شناسی اجتماعی': ['روان‌شناسی اجتماعی', 'نگرش', 'همنوایی'],
    'مطالعات فرهنگی و مصرف': ['مصرف', 'مطالعات فرهنگی', 'سبک زندگی'],
    'تغییرات اجتماعی': ['تغییر اجتماعی', 'نوسازی', 'تحول'],
    'جمعیت‌شناسی پایه': ['جمعیت', 'باروری', 'مهاجرت', 'مرگ‌ومیر'],
  },
  method: {
    'مبانی و پارادایم‌ها': ['پارادایم', 'اثبات‌گرایی', 'تفسیری'],
    'کمی و کیفی': ['کمی', 'کیفی', 'آمیخته'],
    'مسئله و فرضیه': ['فرضیه', 'مسئله', 'متغیر'],
    'مفاهیم و سنجش': ['تعریف عملیاتی', 'سنجش', 'شاخص', 'مقیاس'],
    'روایی و پایایی': ['روایی', 'پایایی'],
    'نمونه‌گیری': ['نمونه‌گیری', 'نمونه', 'خطای نمونه'],
    'پیمایش و پرسشنامه': ['پیمایش', 'پرسشنامه', 'مصاحبه'],
    'آزمایش و شبه‌آزمایش': ['آزمایش', 'گروه گواه', 'شبه'],
    'مشاهده و مطالعهٔ موردی': ['مشاهده', 'مطالعهٔ موردی', 'موردپژوهی'],
    'تحلیل محتوا و اسناد': ['تحلیل محتوا', 'اسناد', 'تحلیل گفتمان'],
    'تحقیق کیفی (فلیک/گراندد)': ['گراندد', 'نظریهٔ زمینه‌ای', 'کدگذاری', 'فلیک'],
    'اخلاق پژوهش': ['اخلاق', 'رضایت آگاهانه', 'محرمانگی'],
    'طرح پژوهش و گزارش': ['طرح پژوهش', 'گزارش', 'بلیکی'],
  },
  amar: {
    'توصیف و نمودار': ['میانه', 'نمودار', 'توزیع فراوانی', 'مد'],
    'شاخص‌های مرکزی و پراکندگی': ['میانگین', 'انحراف معیار', 'واریانس', 'دامنه'],
    'احتمال': ['احتمال', 'فضای نمونه', 'پیشامد'],
    'توزیع‌های احتمال': ['توزیع دوجمله‌ای', 'توزیع نرمال', 'پواسون'],
    'نمونه‌گیری و توزیع نمونه': ['توزیع نمونه', 'قضیهٔ حد مرکزی', 'خطای استاندارد'],
    'برآورد و فاصلهٔ اطمینان': ['برآورد', 'فاصلهٔ اطمینان', 'اطمینان'],
    'آزمون فرض آماری': ['فرض صفر', 'سطح معناداری', 'خطای نوع'],
    'آزمون t و مقایسهٔ میانگین': ['آزمون t', 'مقایسهٔ میانگین'],
    'کای‌دو و جداول توافقی': ['کای‌دو', 'جدول توافقی', 'درجه آزادی'],
    'همبستگی': ['همبستگی', 'پیرسون', 'اسپیرمن'],
    'رگرسیون': ['رگرسیون', 'ضریب تعیین', 'شیب'],
    'آمار غیرپارامتری': ['غیرپارامتری', 'علامت', 'رتبه‌ای'],
    'شاخص‌سازی و نمرهٔ استاندارد': ['نمرهٔ z', 'استاندارد', 'شاخص'],
  },
  zaban: {
    'واژگان پایه': ['vocabulary', 'means', 'synonym', 'opposite'],
    'گرامر و زمان‌ها': ['tense', 'grammar', 'passive', 'conditional'],
    'درک مطلب': ['passage', 'according to', 'author', 'text'],
    'زبان تخصصی جامعه‌شناسی': ['sociology', 'social', 'society', 'theory'],
  },
};

function coverage(qs, id) {
  const map = SYLLABUS[id];
  if (!map) return [];
  const rows = [];
  const hay = qs.map((q) => q.q + ' ' + q.options.join(' ') + ' ' + q.exp).join('\n').toLowerCase();
  for (const [topic, keys] of Object.entries(map)) {
    let n = 0;
    for (const q of qs) {
      const t = (q.q + ' ' + q.options.join(' ') + ' ' + q.exp).toLowerCase();
      if (keys.some((k) => t.includes(k.toLowerCase()))) n++;
    }
    rows.push({ topic, n });
  }
  return rows.sort((a, b) => a.n - b.n);
}

const verbose = process.argv.includes('--verbose');
const withCoverage = process.argv.includes('--coverage');

let hard = 0;
for (const [file, id] of Object.entries(FILES)) {
  if (!fs.existsSync(path.join(DIR, file))) continue;
  const { qs, r } = auditFile(file, id);
  hard += r.noKey + r.badOpts + r.dupOptions + r.contradict;
  console.log(`\n### ${file} — ${r.n} سوال`);
  console.log(
    `کلیدناقص=${r.noKey} گزینه‌ناقص=${r.badOpts} گزینه‌تکراری=${r.dupOptions} ` +
    `تحلیل‌کوتاه=${r.shortExp} تحلیل‌کلیشه=${r.genericExp} تحلیل‌مشکوک=${r.hedgeExp} ` +
    `تناقض‌با‌کلید=${r.contradict} تلهٔ‌طول‌گزینه=${r.lengthTell} شروع‌تکراری=${r.sameStart} نزدیک‌تکراری=${r.nearDup}`
  );
  for (const [k, list] of Object.entries(r.samples)) {
    console.log(`  · ${k}:`);
    list.forEach((s) => console.log('     - ' + s));
  }
  if (withCoverage) {
    const rows = coverage(qs, id);
    const thin = rows.filter((x) => x.n < 8);
    console.log(`  پوشش سرفصل: ${rows.length} موضوع، کم‌پوشش/بدون‌پوشش=${thin.length}`);
    rows.slice(0, 40).forEach((x) => console.log(`     ${x.n >= 8 ? ' ' : '!'} ${x.topic}: ${x.n}`));
    report.coverage.push({ id, rows });
  }
}

console.log('\n---');
console.log(hard === 0 ? 'ساختار: OK (کلید/گزینه/تناقض)' : `خطای ساختاری: ${hard}`);
