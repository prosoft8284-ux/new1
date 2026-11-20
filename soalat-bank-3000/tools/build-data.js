// ساخت داده‌های JSON برای اپلیکیشن از فایل‌های متنی سوال + ساخت صفحه برنامه ۱۷۰ روزه
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const APP = path.join(ROOT, 'app');

const FILES = [
  { file: '01-nazariye-jameshenasi.txt', id: 'theory', short: 'نظریات' },
  { file: '02-jameshenasi-haye-mokhtalef.txt', id: 'domains', short: 'جامعه‌شناسی‌ها' },
  { file: '03-ravesh-tahqiq.txt', id: 'method', short: 'روش تحقیق' },
  { file: '04-amar.txt', id: 'amar', short: 'آمار' },
  { file: '05-zaban.txt', id: 'zaban', short: 'زبان انگلیسی' },
];

const toEn = (s) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const clean = (s) => s.replace(/\s+/g, ' ').trim();

function parseFile(entry) {
  const raw = fs.readFileSync(path.join(ROOT, 'soalat', entry.file), 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n');

  const title = clean((lines[0] || '').replace(/^درس\s*[۰-۹]+\s*—\s*/, '')) || entry.file;
  const subline = clean(lines[2] || '');

  const sections = [];
  let current = null;
  const questions = [];
  let q = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^—{5,}$/.test(t)) continue;

    const sec = t.match(/^—\s*(.+?)\s*—$/);
    if (sec && !q) {
      current = { title: clean(sec[1]), from: null };
      sections.push(current);
      continue;
    }
    if (sec) {
      // header بین دو سوال (نباید رخ دهد، ولی محافظت)
      current = { title: clean(sec[1]), from: null };
      sections.push(current);
      continue;
    }

    const qm = t.match(/^([۰-۹]+)\)\s*(.+)$/);
    if (qm) {
      q = { n: +toEn(qm[1]), q: clean(qm[2]), options: [], key: 0, exp: '' };
      questions.push(q);
      if (!current) {
        current = { title: 'بخش اول', from: q.n };
        sections.push(current);
      } else if (current.from === null) {
        current.from = q.n;
      }
      continue;
    }

    if (!q) continue;
    const om = line.match(/^\s+([۱-۴])\.\s*(.+)$/);
    if (om) {
      q.options.push(clean(om[2]));
      continue;
    }
    const km = t.match(/^✔\s*کلید:\s*گزینه\s*([۱-۴])/);
    if (km) {
      q.key = +toEn(km[1]);
      continue;
    }
    const em = t.match(/^✎\s*تحلیل:\s*(.+)$/);
    if (em) {
      q.exp = clean(em[1]);
      continue;
    }
  }

  const real = sections.filter((s) => s.from !== null);
  const total = questions.length ? questions[questions.length - 1].n : 0;
  if (!real.length) real.push({ title: 'بخش اول', from: 1 });
  real.forEach((s, i) => {
    s.to = i + 1 < real.length ? real[i + 1].from - 1 : total;
    s.count = Math.max(0, s.to - s.from + 1);
  });

  return {
    id: entry.id,
    short: entry.short,
    title,
    subtitle: subline,
    total,
    sections: real.map((s) => ({ title: s.title, from: s.from, to: s.to, count: s.count })),
    questions: questions.map((x) => ({
      id: entry.id + '-' + x.n,
      n: x.n,
      q: x.q,
      options: x.options,
      key: x.key,
      exp: x.exp,
    })),
  };
}

// ---------- صفحه برنامه ۱۷۰ روزه ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = (s) =>
  esc(s)
    .replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function renderMd(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      out.push('</ul>');
      listOpen = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      closeList();
      i++;
      continue;
    }

    if (t.startsWith('|') && lines[i + 1] && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      closeList();
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(t);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(cells(lines[i].trim()));
        i++;
      }
      out.push(
        '<div class="table-wrap"><table><thead><tr>' +
          head.map((h) => `<th>${inl(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inl(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>'
      );
      continue;
    }

    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inl(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (t.startsWith('> ')) {
      closeList();
      out.push(`<p class="note">${inl(t.slice(2))}</p>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      if (!listOpen) {
        out.push('<ul>');
        listOpen = true;
      }
      out.push(`<li>${inl(t.replace(/^[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    closeList();
    out.push(`<p>${inl(t)}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

function build() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(APP, { recursive: true });

  const subjects = [];
  for (const f of FILES) {
    const s = parseFile(f);
    fs.writeFileSync(path.join(DATA, s.id + '.json'), JSON.stringify(s.questions));
    subjects.push({
      id: s.id,
      short: s.short,
      title: s.title,
      subtitle: s.subtitle,
      total: s.total,
      sections: s.sections,
      file: 'data/' + s.id + '.json',
    });
    console.log(`${s.id}: سوال=${s.total} بخش=${s.sections.length}`);
  }

  const index = { total: subjects.reduce((a, s) => a + s.total, 0), subjects };
  fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(index, null, 1));

  const planPath = path.join(ROOT, 'barnameh', 'barnameh-170-ruz.md');
  if (fs.existsSync(planPath)) {
    const md = fs.readFileSync(planPath, 'utf8');
    const body = renderMd(md);
    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>برنامه ۱۷۰ روزه | بانک ۴۰۰۰ سوالی</title>
<link rel="stylesheet" href="styles.css">
</head>
<body class="page">
<header class="topbar">
  <a class="brand" href="index.html"><span class="logo">۴۰۰۰</span> بانک سوال جامعه‌شناسی</a>
  <nav><a href="index.html">تمرین و آزمون</a><a class="active" href="plan.html">برنامه ۱۷۰ روزه</a></nav>
</header>
<main class="plan">${body}</main>
</body>
</html>
`;
    fs.writeFileSync(path.join(APP, 'plan.html'), html);
    console.log('plan.html ساخته شد');
  }

  console.log('مجموع سوالات:', index.total);
}

build();
