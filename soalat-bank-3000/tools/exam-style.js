/* پروفایل سبک یک دفترچهٔ آزمون یا بانک سؤال.
   اجرا: node tools/exam-style.js <مسیر فایل متنی>
   ورودی: هر سؤال با «۱) متن» و گزینه‌ها با «۱. متن»؛ خط کلید اختیاری است («✔ کلید: گزینه ۲»). */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('مسیر فایل متنی را بدهید'); process.exit(1); }
const full = path.resolve(process.cwd(), file);
if (!fs.existsSync(full)) { console.error('فایل نیست: ' + full); process.exit(1); }

const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const qs = [];
let q = null;
for (const raw of fs.readFileSync(full, 'utf8').replace(/\r/g, '').split('\n')) {
  const t = raw.trim();
  if (!t) continue;
  const qm = t.match(/^([\u06F0-\u06F9]+)[)\-]\s*(.+)$/);
  if (qm) { q = { n: +toEn(qm[1]), stem: norm(qm[2]), options: [], key: 0 }; qs.push(q); continue; }
  if (!q) continue;
  const om = raw.match(/^\s*([\u06F1-\u06F4])\s*[.)]\s*(.+)$/);
  if (om) { q.options.push(norm(om[2])); continue; }
  const km = t.match(/^✔?\s*(?:کلید|پاسخ)\s*[:：]?\s*(?:گزینه)?\s*([\u06F1-\u06F4])/);
  if (km) q.key = +toEn(km[1]);
}

const stat = (arr) => {
  if (!arr.length) return { n: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const p = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))];
  return { n: arr.length, avg: Math.round(avg), med: Math.round(p(0.5)), p10: p(0.1), p90: p(0.9), min: s[0], max: s[s.length - 1] };
};

const FORM = {
  'تعریف/مفهوم': /(چیست|چه معنایی|به چه معنا|چه مفهومی|تعریف|معادل کدام)/,
  'مقایسه/تفاوت': /(تفاوت|مقایسه|چه نسبتی|چه رابطه)/,
  'کدام مورد/نمونه': /(کدام مورد|کدام گزینه|نمونهٔ|مثال)/,
  'محاسبه/برآورد': /(محاسبه|برآورد|چند درصد|حجم نمونه|ضریب)/,
  'ترجمه/زبان': /(ترجمه|meaning of|means|کدام ترجمه)/,
  'منفی («نیست»)': /(نیست|نمی‌باشد|نادرست است|نمی‌توان)/,
};

const withOpts = qs.filter((x) => x.options.length === 4);
const withKey = withOpts.filter((x) => x.key);
const optLens = withOpts.flatMap((x) => x.options.map((o) => o.length));
const stemLens = qs.map((x) => x.stem.length);

let keyLongest = 0, gapSum = 0;
for (const x of withKey) {
  const c = x.options[x.key - 1];
  const o = x.options.filter((_, i) => i !== x.key - 1);
  const avg = o.reduce((a, v) => a + v.length, 0) / o.length;
  if (c.length > Math.max(...o.map((v) => v.length))) keyLongest++;
  gapSum += c.length - avg;
}

const pos = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const x of withKey) pos[x.key]++;
const none = withOpts.filter((x) => x.options.some((o) => /(هیچ‌کدام|همهٔ موارد|همه موارد|هر دو|None|All of the above)/i.test(o))).length;
const english = qs.filter((x) => /[A-Za-z]{4,}/.test(x.stem)).length;

const forms = {};
for (const [name, re] of Object.entries(FORM)) forms[name] = qs.filter((x) => re.test(x.stem)).length;

const st = stat(stemLens), op = stat(optLens);
console.log(`فایل: ${path.basename(full)}`);
console.log(`سؤال: ${qs.length} | با چهار گزینه: ${withOpts.length} | با کلید: ${withKey.length}`);
console.log(`طول صورت سؤال — میانگین ${st.avg} | میانه ${st.med} | صدک۱۰ ${st.p10} | صدک۹۰ ${st.p90} | کمینه ${st.min} | بیشینه ${st.max}`);
console.log(`طول گزینه — میانگین ${op.avg} | میانه ${op.med} | صدک۱۰ ${op.p10} | صدک۹۰ ${op.p90} | کمینه ${op.min} | بیشینه ${op.max}`);
if (withKey.length) {
  const pc = (n) => ((100 * n) / withKey.length).toFixed(0) + '٪';
  console.log(`کلید بلندترین گزینه: ${keyLongest} (${pc(keyLongest)}) | میانگین فاصلهٔ کلید از سه گزینه: ${Math.round(gapSum / withKey.length)} کاراکتر`);
  console.log(`جایگاه کلید — ۱: ${pos[1]} (${pc(pos[1])}) | ۲: ${pos[2]} (${pc(pos[2])}) | ۳: ${pos[3]} (${pc(pos[3])}) | ۴: ${pos[4]} (${pc(pos[4])})`);
}
console.log(`گزینهٔ «هیچ‌کدام/همه/هر دو»: ${none} (${((100 * none) / (withOpts.length || 1)).toFixed(0)}٪)`);
console.log(`سؤال انگلیسی: ${english} (${((100 * english) / qs.length).toFixed(0)}٪)`);
console.log('قالب سؤال:');
for (const [k, v] of Object.entries(forms)) console.log(`  ${k}: ${v} (${((100 * v) / qs.length).toFixed(0)}٪)`);
