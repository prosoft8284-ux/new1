// اعتبارسنجی فایل‌های متنی سوال
const fs = require('fs');
const dir = __dirname + '/../soalat';
const fa2en = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
let bad = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.txt'))) {
  const txt = fs.readFileSync(dir + '/' + f, 'utf8').replace(/\r/g, '');
  const lines = txt.split('\n');
  const idx = [];
  lines.forEach((l, i) => { if (/^[۰-۹]+\)\s/.test(l)) idx.push(i); });
  const nums = idx.map(i => +fa2en(lines[i].match(/^([۰-۹]+)\)/)[1]));
  const problems = [];
  if (nums.some((n, i) => n !== i + 1)) problems.push('شماره‌گذاری پیوسته نیست');
  let noOpts = 0, noKey = 0, noExp = 0, badOpts = 0, badKey = 0;
  idx.forEach((start, k) => {
    const end = k + 1 < idx.length ? idx[k + 1] : lines.length;
    const block = lines.slice(start + 1, end).filter(l => l.trim());
    const opts = block.filter(l => /^\s+[۰-۹]\.\s/.test(l));
    const key = block.find(l => /^✔ کلید/.test(l.trim()));
    const exp = block.find(l => /^✎ تحلیل/.test(l.trim()));
    if (opts.length !== 4) { badOpts++; }
    if (!key) noKey++;
    if (!exp || exp.replace(/^✎ تحلیل:\s*/, '').length < 25) noExp++;
    if (key) {
      const kn = +fa2en(key.match(/گزینه\s*([۰-۹]+)/)[1]);
      const texts = opts.map(o => o.replace(/^\s+[۰-۹]\.\s*/, '').trim());
      if (new Set(texts).size !== texts.length) problems.push('گزینه تکراری در سوال ' + nums[k]);
      if (kn < 1 || kn > 4) badKey++;
    }
  });
  console.log(`${f}: سوال=${nums.length} گزینه‌ناقص=${badOpts} کلیدناقص=${noKey} تحلیل‌ناقص=${noExp} کلیدخارج‌از‌بازه=${badKey} ${problems.slice(0,3).join(' | ')}`);
  bad += badOpts + noKey + noExp + badKey + problems.length;
}
console.log(bad === 0 ? 'ALL OK' : 'ERRORS: ' + bad);
