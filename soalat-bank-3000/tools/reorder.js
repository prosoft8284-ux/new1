/* مرتب‌سازی فایل‌های درس بر اساس ترتیب منطقی سرفصل‌ها
   - هر «بلوک بخش» (سرتیتر + سوال‌هایش، شامل متن درک مطلب) یک واحد جابه‌جایی است.
   - بخش‌ها بر اساس نقشهٔ موضوعی هر درس مرتب و از ۱ شماره‌گذاری مجدد می‌شوند.
   - سوال‌ها در کل فایل پیوسته شماره می‌خورند و شمارهٔ ارجاع داخل متن درک مطلب اصلاح می‌شود.
   اجرا: node tools/reorder.js [--dry] */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[+d]);

/* [عنوان موضوع, الگو, اولویت‌دار؟]
   ترتیب آرایه = ترتیب نهایی بخش‌ها؛ موارد «اولویت‌دار» فقط برای تطبیق، زودتر بررسی می‌شوند. */
const MAP = {
  '01-nazariye-jameshenasi.txt': [
    ['مبانی و مفاهیم بنیادی', /^بخش اول$/],
    ['مارکس و سنت انتقادی', /مارکس/],
    ['دورکیم', /دورکیم/],
    ['وبر', /وبر/],
    ['زیمل، کنش متقابل و پدیدارشناسی', /زیمل|کنش متقابل|مبادله|پدیدار|اتنومتدولوژی/],
    ['کارکردگرایی و ساختار', /کارکردگرایی|ساختارگرایی|ساختاری/],
    ['کلاسیک‌ها (بازخوانی و تعمیق)', /کلاسیک|بازخوانی|تعمیق/, true],
    ['نظریه انتقادی و فرانکفورت', /هابرماس|لومان|فرانکفورت|نظریه انتقادی/],
    ['فمینیسم، نژاد و پسااستعماری', /فمینیست|پسااستعماری|نژاد|مطالعات فرهنگی/, true],
    ['نظریه معاصر', /بوردیو|گیدنز|بک|معاصر|قدرت، دولت/],
    ['جامعه‌شناسی در ایران', /ایران/],
    ['پرسش‌های تلفیقی و مقایسه‌ای', /تلفیقی|مقایسه|ترکیب/],
  ],
  '02-jameshenasi-haye-mokhtalef.txt': [
    ['مبانی و مفاهیم', /^بخش اول$/],
    ['خانواده و جنسیت', /خانواده|جنسیت/],
    ['آموزش و سرمایه انسانی', /آموزش|سرمایه انسانی/],
    ['دین و مناسک', /دین|مناسک/],
    ['کار، سازمان و اقتصاد', /کار|صنعت|سازمان|بازار|اقتصاد|کشاورزی|رفاه|مشاغل/],
    ['شهر، روستا و فضا', /شهر|روستا|مسکن|فضا/],
    ['قومیت، مهاجرت و شهروندی', /قومیت|مهاجرت|شهروندی|تنوع|زبان/],
    ['سیاست و جنبش‌های اجتماعی', /سیاست|جنبش|تغییر اجتماعی|دولت/],
    ['انحراف، جرم و نظم اجتماعی', /انحراف|جرم|مجازات|نظم/],
    ['رسانه و ارتباطات', /رسانه/],
    ['سلامت، بدن و ناتوانی', /سلامت|بدن|ناتوانی/],
    ['جمعیت، سالمندی و مرگ', /جمعیت|سالمندی|مرگ/],
    ['محیط زیست، انرژی و مخاطره', /محیط زیست|انرژی|مخاطره/],
    ['علم، فناوری و هوش مصنوعی', /علم|فناوری|داده|هوش مصنوعی|نوآوری/],
    ['فرهنگ، مصرف و سبک زندگی', /فرهنگ|مصرف|سبک زندگی|ورزش|اوقات فراغت/],
  ],
  '03-ravesh-tahqiq.txt': [
    ['مبانی و مفاهیم روش', /^بخش اول$/],
    ['تحلیل کیفی و روش‌های مکمل', /کیفی/, true],
    ['نمونه‌گیری و خطاهای پیمایش', /نمونه‌گیری|نمونه|خطا/],
    ['متغیرها، سنجش و ابزار', /متغیر|سنجش|شاخص|ابزار|پایایی/],
    ['طرح پژوهش و اعتبار', /طراحی|طرح|اعتبار/],
    ['طرح‌های علّی و روش‌های تخصصی', /علّی|تخصصی|آزمایش/],
    ['اسناد، تحلیل محتوا و روش‌های دیجیتال', /اسناد|محتوا|دیجیتال/],
    ['اخلاق پژوهش و نگارش علمی', /اخلاق|نگارش|بازتولید/],
    ['ارزیابی برنامه و پژوهش سیاستی', /ارزیابی|سیاستی/],
    ['ترکیب روش‌ها و گزارش', /ترکیب|گزارش|استنباط/],
  ],
  '04-amar.txt': [
    ['توصیف و نمودارها', /^بخش اول$|توصیف/],
    ['شاخص‌های پراکندگی', /پراکندگی/],
    ['احتمال و توزیع‌ها', /احتمال|توزیع/],
    ['برآورد و فاصله اطمینان', /برآورد|اطمینان/],
    ['آزمون‌های ناپارامتری', /ناپارامتری/, true],
    ['آزمون فرض و استنباط', /استنباط|آزمون/],
    ['همبستگی و رگرسیون', /همبستگی|رگرسیون/, true],
    ['رگرسیون پیشرفته و مدل‌سازی', /چندگانه|دوحالتی|پیشرفته|مدل/],
    ['تحلیل واریانس، پایایی و سنجش', /واریانس|پایایی|سنجش/],
    ['جمعیت و شاخص‌های جمعیتی', /جمعیت/],
    ['محاسبات و شاخص‌های کاربردی', /محاسبات|کاربردی|شاخص/],
  ],
  '05-zaban.txt': [
    ['واژگان تخصصی و عمومی', /^بخش اول$|واژگان|اصطلاحات/],
    ['دستور زبان پایه', /دستور/, true],
    ['دستور پیشرفته و ساختارهای آزمونی', /پیشرفته|ساختارهای دستوری|جمله‌های آزمونی/, true],
    ['درک مطلب', /درک مطلب|درک متن|متن زیر|متن‌های جامعه‌شناسی/, true],
    ['کلوز و تکمیل متن', /کلوز/, true],
    ['ترجمه', /ترجمه/],
  ],
};

const SECTION_RE = /^—\s+(.+?)\s+—$/;

function cleanTitle(raw) {
  return raw.replace(/^بخش\s+[^\s:]+(\s*[::]\s*)?/, '').trim();
}

function pickTopic(groups, title) {
  const firsts = groups.filter((g) => g[2] && g[1].test(title));
  if (firsts.length) return groups.indexOf(firsts[0]);
  const rest = groups.filter((g) => !g[2] && g[1].test(title));
  return rest.length ? groups.indexOf(rest[0]) : -1;
}

function reorder(entry) {
  const file = path.join(ROOT, 'soalat', entry.file);
  const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');

  let first = lines.findIndex((l) => SECTION_RE.test(l.trim()));
  if (first < 0) throw new Error(entry.file + ': سرتیتر بخش پیدا نشد');
  let preamble = lines.slice(0, first);
  let leadBlock = null;
  // بعضی فایل‌ها سوال‌های بخش اول را پیش از نخستین سرتیتر دارند
  const leadStart = preamble.findIndex((l) => /^\s*[۰-۹]+\)\s*/.test(l));
  if (leadStart >= 0) {
    leadBlock = { rawTitle: 'بخش اول', lines: preamble.slice(leadStart), synthetic: true };
    preamble = preamble.slice(0, leadStart);
  }

  const blocks = [];
  let cur = null;
  for (let i = first; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = t.match(SECTION_RE);
    if (m) {
      cur = { rawTitle: m[1].trim(), lines: [] };
      blocks.push(cur);
      continue;
    }
    if (cur) cur.lines.push(lines[i]);
  }

  if (leadBlock) blocks.unshift(leadBlock);
  blocks.forEach((b) => {
    const idx = pickTopic(entry.groups, b.rawTitle);
    b.topicIndex = idx < 0 ? 999 : idx;
    b.topic = idx < 0 ? 'سایر' : entry.groups[idx][0];
    b.passage = /^متن زیر/.test(b.rawTitle);
    if (idx < 0) console.log('  ⚠ بدون نقشه:', entry.file, '::', b.rawTitle);
  });

  const sorted = blocks
    .map((b, i) => ({ b, i }))
    .sort((a, b) => a.b.topicIndex - b.b.topicIndex || a.i - b.i)
    .map((x) => x.b);

  let qn = 0;
  let secNo = 0;
  const out = [];
  const report = [];

  for (const b of sorted) {
    const startQ = qn;
    const body = b.lines.map((l) =>
      l.replace(/^(\s*)([۰-۹]+)\)(\s*)/, (m, sp1, num, sp2) => {
        qn += 1;
        return sp1 + fa(qn) + ')' + (sp2 || ' ');
      })
    );
    const count = qn - startQ;

    let title;
    if (b.passage) {
      title = b.rawTitle.replace(/([۰-۹]+)\s*تا\s*([۰-۹]+)/, () => `${fa(startQ + 1)} تا ${fa(qn)}`);
    } else {
      secNo += 1;
      title = `بخش ${fa(secNo)}: ${cleanTitle(b.rawTitle) || b.topic}`;
    }
    report.push({ title, count });
    out.push('— ' + title + ' —', ...body);
    if (!count) console.log('  ⚠ بخش بدون سوال:', entry.file, '::', b.rawTitle);
  }

  const finalPreamble = preamble.map((l) =>
    /تعداد سوال این فایل:/.test(l)
      ? `تعداد سوال این فایل: ${fa(qn)} | هر سوال ۴ گزینه دارد؛ کلید و تحلیل زیر همان سوال آمده است.`
      : l
  );

  console.log(`\n${entry.file}: ${blocks.length} بخش → ${qn} سوال`);
  report.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${r.title}  (${r.count})`));

  if (!DRY) fs.writeFileSync(file, finalPreamble.concat(out).join('\n'));
  return qn;
}

const totals = {};
for (const [file, groups] of Object.entries(MAP)) totals[file] = reorder({ file, groups });
console.log('\n' + (DRY ? 'حالت آزمایشی: فایلی نوشته نشد' : 'هر پنج فایل مرتب شدند'));
console.log(JSON.stringify(totals));
