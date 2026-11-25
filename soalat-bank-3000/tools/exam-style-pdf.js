/* پروفایل سبک دفترچهٔ آزمون از متن استخراج‌شدهٔ PDF (چیدمان سنجش/آزاد).
   اجرا: node tools/exam-style-pdf.js /tmp/exam-1108.txt
   نکته: در استخراج PDF، شمارهٔ گزینه‌ها جابه‌جا می‌آید؛ پس مرز گزینه‌ها با «)» گرفته می‌شود. */
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('مسیر فایل متنی را بدهید'); process.exit(1); }
let raw = fs.readFileSync(file, 'utf8').replace(/\f/g, '\n');
raw = raw.replace(/\u200c/g, '\u200c');

const FA = '۰۱۲۳۴۵۶۷۸۹';
const norm = (s) => s.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();

// مرز سؤال: شماره در یک خط و نقطه در خط بعد
const qRe = /(?:^|\n)\s*([\u06F0-\u06F9]{1,3})\s*\n?\s*\.\s*/g;
const marks = [];
let m;
while ((m = qRe.exec(raw))) marks.push({ n: +m[1].replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))), at: m.index, end: qRe.lastIndex });

const qs = [];
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].end;
  const stop = i + 1 < marks.length ? marks[i + 1].at : raw.length;
  const body = raw.slice(start, stop);
  const parts = body.split(')');
  const stem = norm(parts.length > 1 ? parts[0] : body);
  const options = parts.slice(1).map(norm).filter((s) => s.length > 0).slice(0, 4);
  qs.push({ n: marks[i].n, stem, options });
}

const stat = (arr) => {
  if (!arr.length) return { n: 0, avg: 0, med: 0, p10: 0, p90: 0, min: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const p = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))];
  return { n: arr.length, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), med: p(0.5), p10: p(0.1), p90: p(0.9), min: s[0], max: s[s.length - 1] };
};

const four = qs.filter((q) => q.options.length === 4);
const stems = qs.map((q) => q.stem.length);
const opts = four.flatMap((q) => q.options.map((o) => o.length));
const st = stat(stems), op = stat(opts);

const sentence = /\b(است|هستند|می‌شود|می‌کند|می‌کنند|دارد|دارند|نیست|باشد|شود|کند|بود|کرد)\b|\.$/;
const sentShare = opts.length ? opts.filter((o) => sentence.test(o)).length / opts.length : 0;
const noneShare = four.length ? four.filter((q) => q.options.some((o) => /^(هیچ‌کدام|هیچکدام|همهٔ موارد|همه موارد|هر دو|None|All of the above)/i.test(o))).length / four.length : 0;
const engShare = qs.length ? qs.filter((q) => /[A-Za-z]{4,}/.test(q.stem)).length / qs.length : 0;

const FORMS = {
  'تعریف/مفهوم': /(چیست|چه معنایی|به چه معنا|چه مفهومی|تعریف|معادل)/,
  'مقایسه/تفاوت': /(تفاوت|مقایسه|چه نسبتی|چه رابطه)/,
  'کدام مورد/گزینه': /(کدام)/,
  'محاسبه/برآورد': /(محاسبه|برآورد|چند|حجم نمونه|ضریب|درصد)/,
  'منفی («نیست/نادرست»)': /(نیست|نمی‌باشد|نمی‌توان|نادرست|مورد نیست)/,
  '«صحت/درستی»': /(صحت|درست|صحیح)/,
};

// پراکندگی طول گزینه‌ها در هر سؤال (بدون دانستن کلید)
const spreads = four.map((q) => {
  const ls = q.options.map((o) => o.length);
  return Math.max(...ls) - ls.reduce((a, b) => a + b, 0) / ls.length;
});
const sp = stat(spreads.map((x) => Math.round(x)));

const pc = (x) => (100 * x).toFixed(0) + '٪';
console.log(`فایل: ${file.split('/').pop()}`);
console.log(`سؤال: ${qs.length} | چهارگزینه‌ای: ${four.length} | میانگین گزینه در سؤال: ${(opts.length / (four.length || 1)).toFixed(2)}`);
console.log(`صورت سؤال — میانگین ${st.avg} | میانه ${st.med} | صدک۱۰ ${st.p10} | صدک۹۰ ${st.p90} | کمینه ${st.min} | بیشینه ${st.max}`);
console.log(`گزینه — میانگین ${op.avg} | میانه ${op.med} | صدک۱۰ ${op.p10} | صدک۹۰ ${op.p90} | کمینه ${op.min} | بیشینه ${op.max}`);
console.log(`گزینهٔ جمله‌وار (فعل‌دار): ${pc(sentShare)} | گزینهٔ «هیچ‌کدام/همه/هر دو»: ${pc(noneShare)} | سؤال انگلیسی: ${pc(engShare)}`);
console.log(`پراکندگی طول گزینه‌ها در سؤال (بیشینه منهای میانگین): میانگین ${sp.avg} | میانه ${sp.med} | صدک۹۰ ${sp.p90}`);
console.log('قالب سؤال:');
for (const [name, re] of Object.entries(FORMS)) console.log(`  ${name}: ${qs.filter((q) => re.test(q.stem)).length} (${pc(qs.filter((q) => re.test(q.stem)).length / (qs.length || 1))})`);
const ex = four.slice(0, 2);
console.log('نمونه:');
for (const q of ex) console.log(`  Q${q.n} ${q.stem.slice(0, 80)} || ${q.options.map((o, i) => (i + 1) + ': ' + o.slice(0, 45)).join(' | ')}`);
