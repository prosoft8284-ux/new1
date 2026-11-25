#!/usr/bin/env node
/**
 * soalat/*.txt  ->  soalat-4000.csv  (+ soalat-4000-excel.csv)
 *
 * ستون‌ها: ردیف | درس | بخش | شماره در درس | صورت سؤال | گزینه ۱..۴ | شماره پاسخ | متن پاسخ | تحلیل
 * ویرایش CSV با tools/csv-apply.js دوباره روی فایل‌های متنی می‌نشیند.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOALAT = path.join(ROOT, 'soalat');
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = (s) => String(s).replace(/[\u06F0-\u06F9]/g, (d) => String(FA.indexOf(d)));
const toFa = (n) => String(n).replace(/[0-9]/g, (d) => FA[+d]);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const FILES = [
  ['01-nazariye-jameshenasi.txt', 'نظریات جامعه‌شناسی'],
  ['02-jameshenasi-haye-mokhtalef.txt', 'جامعه‌شناسی‌های مختلف (مبانی و حوزه‌ها)'],
  ['03-ravesh-tahqiq.txt', 'روش تحقیق در علوم اجتماعی'],
  ['04-amar.txt', 'آمار در علوم اجتماعی'],
  ['05-zaban.txt', 'زبان عمومی و تخصصی'],
];

const rows = [];
for (const [file, subject] of FILES) {
  const lines = fs.readFileSync(path.join(SOALAT, file), 'utf8').replace(/\r/g, '').split('\n');
  let section = '';
  let q = null;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^—\s*بخش/.test(t)) { section = t; q = null; continue; }
    const qm = t.match(/^([\u06F0-\u06F9]+)\)\s*(.+)$/);
    if (qm) {
      q = { subject, section, n: +toEn(qm[1]), stem: norm(qm[2]), opts: [], key: 0, analysis: '' };
      rows.push(q);
      continue;
    }
    if (!q) continue;
    const om = raw.match(/^\s*([\u06F1-\u06F4])\.\s*(.+)$/);
    if (om) { q.opts[+toEn(om[1]) - 1] = norm(om[2]); continue; }
    const km = t.match(/^✔\s*کلید:\s*گزینه\s*([\u06F1-\u06F4])/);
    if (km) { q.key = +toEn(km[1]); continue; }
    const am = t.match(/^✎\s*تحلیل:\s*(.*)$/);
    if (am) { q.analysis = norm(am[1]); continue; }
    if (q.analysis && /^\s/.test(raw)) q.analysis = norm(q.analysis + ' ' + t);
  }
}

const bad = rows.filter((r) => r.opts.filter(Boolean).length !== 4 || !r.key || !r.analysis || !r.stem);
if (bad.length) {
  console.error('سؤال ناقص:', bad.length, bad.slice(0, 5).map((b) => b.subject + '/' + b.n).join(', '));
  process.exit(1);
}

const esc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const head = ['ردیف', 'درس', 'بخش', 'شماره در درس', 'صورت سؤال', 'گزینه ۱', 'گزینه ۲', 'گزینه ۳', 'گزینه ۴', 'شماره پاسخ', 'متن پاسخ', 'تحلیل'];
const csv = (sep) => {
  const out = [head.join(sep)];
  rows.forEach((q, i) =>
    out.push(
      [i + 1, q.subject, q.section, q.n, q.stem, ...q.opts, q.key, q.opts[q.key - 1], q.analysis]
        .map(esc)
        .join(sep)
    )
  );
  return '\uFEFF' + out.join('\r\n') + '\r\n';
};

fs.writeFileSync(path.join(ROOT, 'soalat-4000.csv'), csv(','));
fs.writeFileSync(path.join(ROOT, 'soalat-4000-excel.csv'), csv(';'));
fs.writeFileSync(path.join(ROOT, 'soalat-4000.txt'), buildTxt(rows));

function buildTxt(rows) {
  let txt = 'بانک ۴۰۰۰ سؤالی ارشد جامعه‌شناسی — نسخهٔ متنی\n';
  txt += 'قالب هر سؤال: صورت سؤال، چهار گزینه با شماره، خط «✔ کلید: گزینه n»، خط «✎ تحلیل:»\n';
  txt += '='.repeat(70) + '\n\n';
  let cur = '';
  for (const q of rows) {
    if (q.subject !== cur) { cur = q.subject; txt += `\n##### ${cur} #####\n\n`; }
    txt += `${toFa(q.n)}) ${q.stem}\n`;
    q.opts.forEach((o, i) => { txt += `   ${FA[i + 1]}. ${o}\n`; });
    txt += `✔ کلید: گزینه ${FA[q.key]}\n✎ تحلیل: ${q.analysis}\n\n`;
  }
  return txt;
}

console.log('CSV ساخته شد | سؤال:', rows.length, '| بخش‌ها:', new Set(rows.map((r) => r.subject + r.section)).size);
