/* اپ ۱۷۰ روزه — بانک ۴۰۰۰ سوالی جامعه‌شناسی */
const $ = (s, r = document) => r.querySelector(s);
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[+d]);
const fag = (n) => fa(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

const KEY = 'sb:v5';
let IDX = null, PLAN = null;
const SUB = {}, SUBIDX = {};
let ST = { start: null, q: {}, days: {}, pos: {}, cycle: { queue: [], seen: [], round: 1 }, notify: { on: false, h: 20, m: 0 } };
let BACKLOG = null;
let S = null, ticker = null;

/* ---------- ذخیره‌سازی ---------- */
function loadST() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    ST = {
      start: raw.start || null,
      q: raw.q && typeof raw.q === 'object' ? raw.q : {},
      days: raw.days && typeof raw.days === 'object' ? raw.days : {},
      pos: raw.pos && typeof raw.pos === 'object' ? raw.pos : {},
      cycle: {
        queue: Array.isArray(raw.cycle && raw.cycle.queue) ? raw.cycle.queue : [],
        seen: Array.isArray(raw.cycle && raw.cycle.seen) ? raw.cycle.seen : [],
        round: Number(raw.cycle && raw.cycle.round) > 0 ? Number(raw.cycle.round) : 1,
      },
      notify: {
        on: !!(raw.notify && raw.notify.on),
        h: Number(raw.notify && raw.notify.h) >= 0 ? Number(raw.notify.h) : 20,
        m: Number(raw.notify && raw.notify.m) >= 0 ? Number(raw.notify.m) : 0,
        confirmed: !!(raw.notify && raw.notify.confirmed),
      },
    };
  } catch (e) { ST = { start: null, q: {}, days: {}, pos: {}, cycle: { queue: [], seen: [], round: 1 }, notify: { on: false, h: 20, m: 0 } }; }
}
function saveST() { BACKLOG = null; try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }

/* ---------- تاریخ ---------- */
function isoOf(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
/* برنامه از تاریخ شروع تا روز کنکور (۱۶ اردیبهشت) چیده می‌شود:
   ۱۷۰ روز محتوای برنامه روی همان تعداد روزی که واقعاً باقی است توزیع می‌شود. */
let SCHED = null;
function schedule() {
  if (!ST.start || !PLAN) return null;
  if (SCHED && SCHED.start === ST.start) return SCHED;
  const exam = SBCore.examInfo(ST.start);
  SCHED = {
    start: ST.start,
    exam,
    total: exam.totalDays,
    buckets: SBCore.planSchedule(exam.totalDays, PLAN.totalDays),
  };
  return SCHED;
}
function totalDays() { const s = schedule(); return s ? s.total : PLAN.totalDays; }
/* شمارهٔ امروز در تقویم برنامه: ۱ تا روز کنکور */
function currentDay() {
  const s = schedule();
  if (!s) return null;
  const a = new Date(ST.start + 'T00:00:00');
  const b = new Date(isoOf() + 'T00:00:00');
  const diff = Math.round((b - a) / 86400000);
  return Math.min(s.total, Math.max(1, diff + 1));
}
/* روزهای برنامه که در یک روز تقویم می‌آیند (می‌تواند صفر یا دو روز باشد) */
function planDaysOf(dayNum) {
  const s = schedule();
  if (!s) return [];
  const d = dayNum || currentDay();
  return s.buckets[d - 1] || [];
}
/* آخرین روز برنامهٔ رسیده؛ مبنای شمارش عقب‌افتادگی */
function planDayNow() {
  const s = schedule();
  if (!s) return null;
  for (let k = currentDay(); k >= 1; k -= 1) {
    const list = s.buckets[k - 1];
    if (list && list.length) return list[list.length - 1];
  }
  return 1;
}
const dayByNum = (n) => PLAN.days[n - 1];

/* ---------- کمکی ---------- */
function subShort(id) { const m = IDX.subjects.find((s) => s.id === id); return m ? m.short : id; }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400);
}

async function loadSubject(id) {
  if (SUB[id]) return SUB[id];
  const meta = IDX.subjects.find((s) => s.id === id);
  const res = await fetch(meta.file);
  if (!res.ok) throw new Error('بارگذاری سوالات ناموفق بود');
  const arr = await res.json();
  SUB[id] = arr;
  SUBIDX[id] = new Map(arr.map((q) => [q.n, q]));
  return arr;
}
async function allQuestions() {
  const out = [];
  for (const s of IDX.subjects) {
    await loadSubject(s.id);
    for (const q of SUB[s.id]) out.push({ sid: s.id, q, sec: '' });
  }
  return out;
}
async function questionsOfRanges(ranges) {
  const out = [];
  for (const r of ranges) {
    await loadSubject(r.subject);
    for (let n = r.from; n <= r.to; n++) {
      const q = SUBIDX[r.subject].get(n);
      if (q) out.push({ sid: r.subject, q, sec: r.section || '' });
    }
  }
  return out;
}
function rangesOfDay(day) {
  const out = [];
  for (const t of day.tasks || []) for (const r of t.ranges) out.push({ subject: t.subject, section: t.section || '', from: r.from, to: r.to });
  return out;
}
function idsOfRanges(rs) {
  const ids = [];
  for (const r of rs) for (let n = r.from; n <= r.to; n++) ids.push(`${r.subject}-${n}`);
  return ids;
}
function itemOfId(id) {
  const cut = id.lastIndexOf('-');
  const sid = id.slice(0, cut);
  const q = SUBIDX[sid] && SUBIDX[sid].get(Number(id.slice(cut + 1)));
  return q ? { sid, q, sec: '' } : null;
}

/* ---------- جبران روزهای عقب‌افتاده ----------
   سوال‌های پاسخ‌ندادهٔ روزهای گذشته را بین روزهای مطالعهٔ باقی‌مانده پخش می‌کند
   تا نه روی یک روز بار سنگین بیفتد و نه سوالی جا بماند. */
function studyDayList() {
  return PLAN.days
    .filter((d) => d.kind === 'study')
    .map((d) => ({ d: d.d, ids: idsOfRanges(rangesOfDay(d)) }));
}
function backlogPlan() {
  if (BACKLOG) return BACKLOG;
  const d = planDayNow();
  if (!d) return (BACKLOG = { total: 0, perDay: 0, byDay: {}, pending: [] });
  BACKLOG = SBCore.planBacklog(studyDayList(), Object.keys(ST.q), d);
  return BACKLOG;
}

/* ---------- تمرین آزاد و دورهٔ بدون تکرار ---------- */
async function startFree(n) {
  const all = await allQuestions();
  const items = shuffle(all).slice(0, Math.min(n, all.length));
  if (!items.length) { toast('سوالی برای تمرین نیست'); return; }
  await startStudy(items, `تمرین آزاد — ${fa(items.length)} سوال تصادفی`, { free: true });
}

function cyclePool() { return Object.keys(ST.q); }
function cycleStats() {
  return SBCore.cycleStats({
    pool: cyclePool(),
    queue: ST.cycle.queue || [],
    seen: ST.cycle.seen || [],
    round: ST.cycle.round || 1,
  });
}
async function startCycle(n = 20) {
  if (!cyclePool().length) { toast('اول چند سوال از برنامه بزن تا دوره ساخته شود'); return; }
  await allQuestions();
  const step = SBCore.cycleStep({
    pool: cyclePool(),
    queue: ST.cycle.queue || [],
    seen: ST.cycle.seen || [],
    round: ST.cycle.round || 1,
    n,
  });
  ST.cycle = { queue: step.queue, seen: step.seen, round: step.round };
  saveST();
  if (!step.take.length) { toast('سوالی برای دوره نیست'); return; }
  if (step.restarted) toast('دور ' + fa(step.round) + ' شروع شد');
  const items = step.take.map(itemOfId).filter(Boolean);
  await startStudy(items, `دورهٔ سوالات قبلی — دور ${fa(step.round)}`, { cycle: true });
}

/* ---------- وضعیت ---------- */
function record(id, ok) {
  const cur = ST.q[id] || { a: 0, c: 0 };
  cur.a += 1;
  if (ok) cur.c += 1;
  cur.ok = ok ? 1 : 0;
  cur.t = Date.now();
  ST.q[id] = cur;
  saveST();
}
function wrongIds() { return Object.keys(ST.q).filter((id) => ST.q[id].ok === 0); }
function answeredCount() { return Object.keys(ST.q).length; }
function correctCount() { return Object.values(ST.q).filter((v) => v.ok === 1).length; }

/* ---------- ناوبری ---------- */
function go(name) {
  ['today', 'plan', 'review', 'progress', 'help', 'day', 'study', 'exam', 'result'].forEach((v) => {
    const el = $('#view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  const tabOf = { today: 'today', plan: 'plan', review: 'review', progress: 'progress', help: 'help', day: 'plan' }[name];
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tabOf));
  document.body.classList.toggle('focus', ['study', 'exam'].includes(name));
  const subOf = { plan: 'برنامه تا کنکور', review: 'مرور سوال‌های نادرست', progress: 'پیشرفت من', help: 'راهنما و توضیح برنامه', day: 'جزئیات روز', study: 'حالت مطالعه', exam: 'آزمون', result: 'کارنامه' };
  if (name !== 'today' && subOf[name]) $('#hdr-sub').textContent = subOf[name];
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------- امروز ---------- */
function setupHTML() {
  return `
  <div class="card">
    <h2>روز شروع را مشخص کن</h2>
    <p class="tiny mt8">روز کنکور ۱۶ اردیبهشت است. تاریخ شروع را انتخاب کن؛ اپ فاصلهٔ آن تا ۱۶ اردیبهشت را حساب می‌کند و ۱۷۰ روز برنامه را روی همان روزها می‌چیند، طوری که روز آخر برنامه دقیقاً روز کنکور باشد.</p>
    <div class="mt12"><input type="date" id="start-date" class="start-input" value="${isoOf()}" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:12px;font-family:inherit"></div>
    <button class="btn primary block mt12" data-act="save-start">شروع از این تاریخ</button>
  </div>
  <div class="card">
    <h3>برنامه شامل چیست؟</h3>
    <p class="tiny mt8">۱۰۰ روز مطالعه (۴۰ سوال در روز)، ۲۰ آزمون مبحثی هفتگی، ۲۰ روز استراحت فعال، ۲۵ روز مرور و تحلیل، ۲ آزمون جامع و ۲ شبیه‌ساز، و روز کنکور. همه ۴۰۰۰ سوال دقیقاً یک بار در دور اول می‌آیند.</p>
  </div>`;
}

function kindLabel(kind) {
  return {
    exam: 'آزمون مبحثی هفته',
    rest: 'استراحت فعال',
    mock: 'آزمون جامع',
    review: 'مرور و جمع‌بندی',
    analysis: 'تحلیل آزمون',
    final: 'روز کنکور',
  }[kind] || 'روز مطالعه';
}

/* چوب‌خط: هر بلوک ۵ سوال — ۴۰ سوال روز = ۸ بلوک */
function tallyHTML(count, done) {
  if (count > 40) {
    const pct = count ? Math.round((done / count) * 100) : 0;
    return `<div class="bar mt8"><i style="width:${pct}%"></i></div>`;
  }
  const blocks = Math.ceil(count / 5);
  let html = '<div class="tally" aria-hidden="true">';
  for (let b = 0; b < blocks; b++) {
    html += '<span class="tally-blk">';
    for (let i = 0; i < 5; i++) {
      const n = b * 5 + i + 1;
      if (n <= count) html += `<i class="${n <= done ? 'on' : ''}"></i>`;
    }
    html += '</span>';
  }
  return html + '</div>';
}

function dayCardHTML(day, isToday) {
  const rs = rangesOfDay(day);
  const ids = idsOfRanges(rs);
  const doneQ = ids.filter((id) => ST.q[id]).length;
  const rec = ST.days[day.d] || {};
  const phase = PLAN.phases.find((p) => p.id === day.phase) || {};

  const progressLine = day.kind === 'study'
    ? `<div class="hero-stat">${fa(doneQ)} از ${fa(ids.length)} سوال این روز</div>${tallyHTML(ids.length, doneQ)}`
    : `<div class="hero-stat">${kindLabel(day.kind)}</div>`;

  let head = `
  <header class="hero">
    <div class="hero-row">
      <span class="kicker">روز برنامه ${fa(day.d)} از ${fa(PLAN.totalDays)}</span>
      <span class="kicker dim">هفته ${fa(day.w)} · ${day.weekdayTitle}</span>
    </div>
    <div class="hero-body">
      <div class="hero-num">${fa(day.d)}</div>
      <div class="hero-side">
        <div class="hero-phase">فاز ${fa(day.phase)} — ${phase.title || ''}</div>
        ${progressLine}
        ${rec.done ? '<span class="tag ok">تمام‌شده</span>' : ''}
      </div>
    </div>
  </header>`;

  let body = '';

  if (day.kind === 'study') {
    body += `
    <div class="card mt12">
      <div class="row-between"><h2>${isToday ? 'برنامه امروز' : 'برنامه این روز'}</h2><small>${fa(ids.length)} سوال</small></div>
      <div class="bar mt8"><i style="width:${ids.length ? Math.round((doneQ / ids.length) * 100) : 0}%"></i></div>
      <div class="statline mt8"><small>${fa(doneQ)} از ${fa(ids.length)} سوال پاسخ داده شده</small><small>${day.minutes >= 60 ? fa(Math.round(day.minutes / 60)) + ' ساعت' : fa(day.minutes) + ' دقیقه'}</small></div>
    </div>`;

    day.tasks.forEach((t, ti) => {
      const tIds = idsOfRanges(t.ranges.map((r) => ({ subject: t.subject, ...r })));
      const tDone = tIds.filter((id) => ST.q[id]).length;
      const rangeTxt = t.ranges.map((r) => `سوال ${fa(r.from)} تا ${fa(r.to)}`).join(' و ');
      body += `
      <div class="task ${tDone === tIds.length ? 'done' : ''}">
        <div class="task-h">
          <span class="chip chip-${t.subject}">${subShort(t.subject)}</span>
          <span class="tiny">${rangeTxt}</span>
          ${tDone === tIds.length ? '<span class="pill ok">انجام شد</span>' : `<span class="tiny">${fa(tDone)}/${fa(tIds.length)}</span>`}
        </div>
        ${t.section ? `<div class="task-t">${esc(t.section)}</div>` : ''}
        <div class="task-f">
          <button class="btn ${tDone === tIds.length ? 'ghost' : 'primary'}" data-act="start-task" data-day="${day.d}" data-task="${ti}">
            ${tDone === tIds.length ? 'دوباره بزن' : tDone ? 'ادامه' : 'شروع'}
          </button>
          <small class="tiny">${fa(tIds.length)} سوال</small>
        </div>
      </div>`;
    });

    const carry = (backlogPlan().byDay[day.d] || []);
    if (carry.length) {
      body += `
      <div class="task carry">
        <div class="task-h">
          <span class="chip gold">جبران</span>
          <span class="tiny">${fa(carry.length)} سوال از روزهای گذشته</span>
          <span class="pill">${fa(backlogPlan().total)} سوال کل</span>
        </div>
        <div class="task-t">سوال‌های پاسخ‌ندادهٔ روزهای قبل که بین روزهای باقی‌مانده پخش شده‌اند.</div>
        <div class="task-f">
          <button class="btn primary" data-act="start-carry" data-day="${day.d}">شروع جبران</button>
        </div>
      </div>`;
    }

    body += `
    <button class="btn ghost block mt8" data-act="study-day" data-day="${day.d}">همه ${fa(ids.length)} سوال این روز در یک جلسه</button>
    <button class="btn ${rec.done ? 'ghost' : 'primary'} block mt8" data-act="toggle-day" data-day="${day.d}">
      ${rec.done ? 'علامت «تمام‌شده» را بردار' : 'این روز را تمام کردم'}
    </button>`;
  } else if (day.kind === 'exam') {
    body += `
    <div class="card mt12">
      <div class="row-between"><h2>آزمون مبحثی هفته ${fa(day.w)}</h2><span class="pill">${fa(25)} سوال</span></div>
      <p class="tiny mt8">۲۵ دقیقه، بدون کتاب و بدون بازخورد بین سوال‌ها. ۱۵ سوال از مباحث همین هفته و ۱۰ سوال از هفته‌های قبل. بعد از پایان، کارنامه و تحلیل خطاها را ببین.</p>
      <button class="btn primary block mt12" data-act="start-exam" data-mode="week" data-day="${day.d}">شروع آزمون</button>
    </div>
    <div class="card"><h3>بعد از آزمون</h3><p class="tiny mt8">${esc(day.review)}</p></div>`;
  } else if (day.kind === 'mock') {
    body += `
    <div class="card mt12">
      <div class="row-between"><h2>${/شبیه/.test(day.text) ? 'آزمون شبیه‌ساز' : 'آزمون جامع'}</h2><span class="pill">${fa(200)} سوال</span></div>
      <p class="tiny mt8">${esc(day.text)}</p>
      <p class="tiny mt8">۲۰۰ سوال تصادفی از کل ۴۰۰۰ سوال، در شرایط زمانی واقعی. این آزمون در کارنامه و آمار خطاهای تو ثبت می‌شود.</p>
      <button class="btn primary block mt12" data-act="start-exam" data-mode="all" data-day="${day.d}">شروع آزمون جامع</button>
    </div>`;
  } else if (day.kind === 'review' || day.kind === 'analysis') {
    body += `
    <div class="card mt12">
      <h2>${day.kind === 'analysis' ? 'تحلیل و جمع‌بندی' : 'مرور'}</h2>
      <p class="mt8" style="font-size:14px">${esc(day.text)}</p>
      ${day.focus ? `<div class="mt8"><span class="chip chip-${day.focus}">${subShort(day.focus)}</span></div>` : ''}
      <button class="btn primary block mt12" data-act="review-day" data-day="${day.d}">مرور سوالات نادرست${day.focus ? ' ' + subShort(day.focus) : ''}</button>
    </div>`;
  } else if (day.kind === 'rest') {
    body += `
    <div class="card mt12">
      <h2>استراحت فعال</h2>
      <p class="mt8" style="font-size:14px">${esc(day.text)}</p>
      <ul class="tiny mt8" style="padding-inline-start:18px;line-height:2">
        <li>بدون منبع جدید؛ جبران عقب‌افتادگی هفته</li>
        <li>۱۵ دقیقه مرور کارت‌های مفهوم (اختیاری)</li>
        <li>پیاده‌روی و خواب منظم</li>
      </ul>
    </div>`;
  } else {
    body += `
    <div class="card mt12">
      <h2>${day.kind === 'final' ? 'روز کنکور' : 'تثبیت نهایی'}</h2>
      <p class="mt8" style="font-size:14px">${esc(day.text)}</p>
      <p class="tiny mt8">هیچ مبحث تازه‌ای باز نکن. فقط برگه‌های یک‌صفحه‌ای و کارت‌ها.</p>
    </div>`;
  }

  const routine = PLAN.routine.find((r) => r.wd === day.weekday) || {};
  const method = PLAN.studyMethod.map((m) => `<li>${esc(m)}</li>`).join('');

  return `
  ${isToday ? '' : '<button class="btn ghost" data-act="tab" data-tab="plan">→ بازگشت به برنامه</button>'}
  ${head}
  ${body}
  <div class="card">
    <h3>روتین ${routine.title || day.weekdayTitle}</h3>
    <p class="tiny mt8">${esc(routine.program || '')}</p>
  </div>
  <div class="card">
    <h3>روش خواندن</h3>
    <ul class="tiny mt8" style="padding-inline-start:18px;line-height:1.95">${method}</ul>
  </div>`;
}

function examStripHTML(d, s) {
  const left = s.total - d + 1;
  return `<div class="card tight">
    <div class="row-between"><b>${left > 1 ? `${fa(left)} روز تا کنکور` : 'امروز روز کنکور است'}</b><small>۱۶ اردیبهشت ${fa(s.exam.jy)}</small></div>
    <p class="tiny mt8">برنامه روی ${fa(s.total)} روز چیده شده است (روز ${fa(d)} از ${fa(s.total)}) و روز آخر برنامه همان روز کنکور است.</p>
  </div>`;
}

/* روزی که محتوای تازه ندارد: تقویم بلندتر از برنامهٔ ۱۷۰ روزه است */
function gapDayHTML() {
  const pd = planDayNow();
  return `<div class="card">
    <h2>روز مرور و تثبیت</h2>
    <p class="tiny mt8">امروز روز محتوای تازه نیست؛ از این فرصت برای مرور خطاها و تثبیت مباحث استفاده کن. تا امروز ${fa(pd)} روز از ${fa(PLAN.totalDays)} روز برنامه پوشش داده شده است.</p>
    <div class="practice-row mt12">
      <button class="btn primary" data-act="review-day" data-day="${pd}">مرور سوالات نادرست</button>
      <button class="btn ghost" data-act="free" data-n="25">۲۵ سوال تصادفی</button>
    </div>
  </div>`;
}

function renderToday() {
  const v = $('#view-today');
  if (!ST.start) { v.innerHTML = setupHTML(); return; }
  const d = currentDay();
  const s = schedule();
  const list = planDaysOf(d);
  const b = backlogPlan();
  const banner = b.total
    ? `<div class="card tight notice">
        <b>${fa(b.total)} سوال از روزهای گذشته مانده</b>
        <p class="tiny mt8">این سوال‌ها را بین روزهای مطالعهٔ بعدی پخش کردم (حدود ${fa(b.perDay)} سوال در روز) تا هیچ روزی سنگین نشود و چیزی هم جا نماند.</p>
      </div>`
    : '';
  const cards = list.length
    ? list.map((n, i) => dayCardHTML(dayByNum(n), i === 0)).join('')
    : gapDayHTML();
  v.innerHTML = banner + examStripHTML(d, s) + cards + freePracticeHTML();
  const left = s.total - d;
  $('#hdr-sub').textContent = `روز ${fa(d)} از ${fa(s.total)}` + (left > 0 ? ` • ${fa(left)} روز تا کنکور` : ' • روز کنکور');
}

function freePracticeHTML() {
  return `<div class="card">
    <h3>بیشتر می‌خواهی بخوانی؟</h3>
    <p class="tiny mt8">سهمیهٔ امروز که تمام شد، اینجا هر تعداد سوال تصادفی از کل ۴۰۰۰ سوال — با پاسخ و تحلیل — بزن.</p>
    <div class="practice-row mt12">
      <button class="btn ghost" data-act="free" data-n="10">۱۰ سوال</button>
      <button class="btn" data-act="free" data-n="25">۲۵ سوال</button>
      <button class="btn primary" data-act="free" data-n="50">۵۰ سوال</button>
    </div>
  </div>`;
}

/* ---------- برنامه ---------- */
function dayRowHTML(day) {
  const rec = ST.days[day.d] || {};
  let label = day.text;
  if (day.kind === 'study') {
    const subs = [...new Set(day.tasks.map((t) => subShort(t.subject)))];
    label = subs.join(' • ') + ` — ${fa(day.count)} سوال`;
  }
  const cls = rec.done ? 'done' : day.kind;
  const cnt = day.kind === 'study' ? fa(day.count) : day.kind === 'exam' ? '۲۵' : day.kind === 'mock' ? '۲۰۰' : '';
  return `<button class="drow" data-act="go-day" data-day="${day.d}">
    <span class="dnum ${cls}">${fa(day.d)}</span>
    <span class="rtext">${esc(label)}</span>
    <span class="rcount">${cnt}</span>
  </button>`;
}
function renderPlan() {
  const v = $('#view-plan');
  const doneDays = Object.values(ST.days).filter((x) => x.done).length;
  const s = schedule();
  let html = `<div class="row-between"><h2>برنامه تا کنکور</h2><span class="pill">${fa(doneDays)} روز تمام‌شده</span></div>`;
  html += s
    ? `<p class="tiny mt8">کنکور ۱۶ اردیبهشت ${fa(s.exam.jy)}. از تاریخ شروع تو تا آن روز ${fa(s.total)} روز است و ${fa(PLAN.totalDays)} روز محتوای برنامه روی همین روزها چیده شده: روز آخر برنامه همان روز کنکور است.</p>`
    : `<p class="tiny mt8">اول تاریخ شروع را در صفحهٔ «امروز» انتخاب کن تا برنامه تا روز کنکور (۱۶ اردیبهشت) چیده شود.</p>`;
  html += `<p class="tiny mt8">۱۰۰ روز مطالعه، ۲۰ آزمون مبحثی، ۲۰ روز استراحت، ۲۵ روز مرور و تحلیل، ۲ آزمون جامع و ۲ شبیه‌ساز.</p>`;
  for (const ph of PLAN.phases) {
    html += `<div class="phase-h"><b>فاز ${fa(ph.id)} — ${ph.title}</b><small>روز ${fa(ph.from)} تا ${fa(ph.to)}</small></div>`;
    for (const day of PLAN.days) if (day.d >= ph.from && day.d <= ph.to) html += dayRowHTML(day);
  }
  v.innerHTML = html;
}

/* ---------- مرور ---------- */
async function renderReview() {
  const v = $('#view-review');
  v.innerHTML = '<div class="empty">در حال بارگذاری سوال‌ها…</div>';
  await allQuestions();
  const ids = wrongIds();
  const ans = answeredCount(), cor = correctCount();
  const acc = ans ? Math.round((cor / ans) * 100) : 0;

  let html = `
  <div class="card">
    <h2>مرور</h2>
    <div class="bar mt8 ${acc >= 60 ? 'ok' : ''}"><i style="width:${acc}%"></i></div>
    <div class="statline mt8"><small>${fa(ans)} پاسخ ثبت‌شده</small><small>${fa(acc)}٪ درست</small></div>
    <div class="row-between mt12">
      <div><b>${fa(ids.length)}</b><small> سوال نادرست</small></div>
      <button class="btn ${ids.length ? 'primary' : 'ghost'}" data-act="review-wrong" ${ids.length ? '' : 'disabled'}>مرور ۲۰ سوال</button>
    </div>
  </div>`;

  const cy = cycleStats();
  html += `
  <div class="card">
    <div class="row-between"><h3>دورهٔ سوالات قبلی</h3><span class="pill">دور ${fa(cy.round)}</span></div>
    <p class="tiny mt8">سوال‌هایی که قبلاً زده‌ای، تصادفی و بدون تکرار تا وقتی همه یک دور کامل شوند.</p>
    <div class="bar mt8"><i style="width:${cy.total ? Math.round((cy.seen / cy.total) * 100) : 0}%"></i></div>
    <div class="statline mt8"><small>${fa(cy.seen)} از ${fa(cy.total)} سوال این دور</small><small>${cy.left ? fa(cy.left) + ' سوال مانده' : 'آمادهٔ دور جدید'}</small></div>
    <button class="btn ${cy.total ? 'primary' : 'ghost'} block mt8" data-act="cycle" ${cy.total ? '' : 'disabled'}>
      ${cy.left ? '۲۰ سوال بعدی' : cy.seen ? 'شروع دور ' + fa(cy.round + 1) : 'هنوز سوالی زده نشده'}
    </button>
  </div>

  <div class="card">
    <h3>تمرین آزاد</h3>
    <p class="tiny mt8">وقتی سهمیهٔ روزت تمام شد و باز هم حوصله داری: سوال تصادفی از کل بانک، با جواب و تحلیل.</p>
    <div class="practice-row mt12">
      <button class="btn ghost" data-act="free" data-n="10">۱۰ سوال</button>
      <button class="btn" data-act="free" data-n="25">۲۵ سوال</button>
      <button class="btn primary" data-act="free" data-n="50">۵۰ سوال</button>
    </div>
  </div>`;

  if (!ids.length) {
    html += '<div class="card empty">هنوز سوال نادرستی ثبت نشده. با «امروز» شروع کن.</div>';
  } else {
    html += '<div class="card"><h3>آخرین نادرست‌ها</h3>';
    for (const id of ids.slice(-40).reverse()) {
      const [sid, n] = id.split('-');
      const q = SUBIDX[sid] && SUBIDX[sid].get(Number(n));
      if (!q) continue;
      html += `<div class="wrongitem">
        <div class="q"><span class="chip chip-${sid}">${subShort(sid)}</span> ${esc(q.q)}</div>
        <div class="a">پاسخ درست: ${esc(q.options[q.key - 1])}</div>
      </div>`;
    }
    html += '</div>';
  }
  v.innerHTML = html;
}

/* ---------- پیشرفت ---------- */
function renderProgress() {
  const v = $('#view-progress');
  const ans = answeredCount(), cor = correctCount();
  const total = IDX.total;
  const doneDays = Object.values(ST.days).filter((x) => x.done).length;
  const pct = Math.round((ans / total) * 100);

  let html = `
  <div class="card">
    <div class="row-between"><h2>پیشرفت کل</h2><span class="pill solid">${fa(pct)}٪</span></div>
    <div class="bar mt8"><i style="width:${pct}%"></i></div>
    <div class="statline mt8"><small>${fag(ans)} از ${fag(total)} سوال</small><small>${fa(doneDays)} روز تمام‌شده</small></div>
    <div class="statline"><small>درست</small><small>${fa(cor)} (${fa(ans ? Math.round((cor / ans) * 100) : 0)}٪)</small></div>
  </div>`;

  for (const s of IDX.subjects) {
    const ids = Object.keys(ST.q).filter((id) => id.startsWith(s.id + '-'));
    const c = ids.filter((id) => ST.q[id].ok === 1).length;
    const p = Math.round((ids.length / s.total) * 100);
    html += `
    <div class="card tight">
      <div class="row-between"><b style="font-size:13.5px">${s.title}</b><small>${fa(ids.length)}/${fa(s.total)}</small></div>
      <div class="bar mt8"><i style="width:${p}%"></i></div>
      <div class="statline mt8"><small>دقت</small><small>${fa(ids.length ? Math.round((c / ids.length) * 100) : 0)}٪</small></div>
    </div>`;
  }
  v.innerHTML = html;
}

/* ---------- راهنما ---------- */
function renderHelp() {
  const v = $('#view-help');
  const total = IDX ? fag(IDX.total) : '۴٬۰۰۰';
  const subj = IDX ? IDX.subjects.map((s) => `${esc(s.short)} ${fag(s.total)}`).join(' • ') : '';

  const rows = [
    ['۱', '<b>چهار هزار سوال، دقیقاً یک بار.</b> بانک از پنج درس تشکیل شده است: ' + subj + '. هر سوال چهار گزینه، یک کلید و یک تحلیل کوتاه دارد. در دور اول هر سوال فقط یک بار در برنامه می‌آید.'],
    ['۲', '<b>برنامه تا ۱۶ اردیبهشت، ۱۰۰ روز مطالعه.</b> برنامه ۱۷۰ روز محتوا دارد و اپ آن را روی روزهای واقعیِ باقی‌مانده تا کنکور می‌چیند؛ هر روز مطالعه ۴۰ سوال است: ۸ بلوک ۵ سوالی. کنار آن ۲۰ آزمون مبحثی هفتگی، ۲۰ روز استراحت فعال، ۲۵ روز مرور و تحلیل، ۲ آزمون جامع، ۲ شبیه‌ساز و روز کنکور قرار دارد.'],
    ['۳', '<b>ترتیب درس‌ها ثابت است.</b> هر روز به این ترتیب پیش می‌رود: نظریات، جامعه‌شناسی‌ها، روش، آمار، زبان. درون هر درس، سوال‌ها از بخش نخست کتاب به بخش‌های پیشرفته‌تر جلو می‌روند تا مبحث تازه روی پایهٔ قبلی سوار شود.'],
    ['۴', '<b>درون هر جلسه، آسان به سخت.</b> اپ سوال‌های همان درس را بر پایهٔ طول صورت سوال، محاسبه‌ای بودن و تلفیقی بودن مرتب می‌کند؛ جلسه با سوال سبک‌تر گرم می‌شود و سنگین‌ترها آخر می‌آیند. ترتیب درس‌ها و بلوک‌های روز دست‌نخورده می‌ماند.'],
    ['۵', '<b>حالت مطالعه.</b> گزینه را می‌زنی، پاسخ درست و تحلیل باز می‌شود، بعد «سوال بعد». اگر نمی‌دانی، «نمایش پاسخ» را بزن و صادقانه «می‌دانستم / نمی‌دانستم» را انتخاب کن؛ همین پاسخ، آمار مرور را می‌سازد.'],
    ['۶', '<b>حالت آزمون.</b> آزمون مبحثی هفته ۲۵ سوال و ۲۵ دقیقه است؛ آزمون جامع و شبیه‌ساز ۲۰۰ سوال و ۲۰۰ دقیقه. در آزمون بازخوردی بین سوال‌ها نمی‌بینی، می‌توانی با پاسخنامه بین سوال‌ها جابه‌جا شوی و در پایان کارنامه و فهرست خطاها را می‌گیری.'],
    ['۷', '<b>مرور.</b> هر پاسخ نادرست در «مرور» می‌ماند؛ از همان‌جا ۲۰ سوال تصادفی از خطاها را دوباره می‌زنی. روزهای مرور برنامه هم به همین بخش وصل‌اند.'],
    ['۸', '<b>پیشرفت.</b> تعداد پاسخ‌های ثبت‌شده، درصد درست، روزهای تمام‌شده و دقت هر درس جداگانه نشان داده می‌شود تا نقطهٔ ضعف مشخص باشد.'],
  ];

  v.innerHTML = `
  <div class="card">
    <h2>راهنمای کامل برنامه</h2>
    <p class="help-lead mt8">این اپ یک بانک ${total} سوالی جامعه‌شناسی است که به روز کنکور (۱۶ اردیبهشت) گره خورده: تاریخ شروع را که انتخاب کنی، اپ فاصله تا کنکور را حساب می‌کند و برنامه را روی همان روزها می‌چیند؛ هر روز می‌دانی چه سوال‌هایی، از کدام بخش و به چه ترتیبی باید بزنی. هدف این است که هیچ سوالی جا نیفتد و هیچ روزی بار نامتعارف نداشته باشد.</p>
    <div class="help-note">همهٔ محاسبهٔ برنامه از قبل انجام شده است؛ اپ فقط روزِ تو را نشان می‌دهد. پس نیازی به اینترنت برای برنامه و سوال‌ها نداری.</div>
  </div>

  <div class="card">
    <h3>برنامه چطور ساخته شده</h3>
    ${rows.map(([n, t]) => `<div class="help-row"><span class="n">${n}</span><span class="t">${t}</span></div>`).join('')}
  </div>

  <div class="card">
    <h3>یک روز مطالعه، قدم به قدم</h3>
    <ul class="help-list">
      <li>تب «امروز» را باز کن؛ روزِ جاری برنامه با فاز و تعداد سوال‌های انجام‌شده می‌آید.</li>
      <li>هر بلوک ۵ سوالی: ۱۲ دقیقه حل، ۱۰ دقیقه خواندن تحلیل، ۵ دقیقه نوشتن «چرا این گزینه».</li>
      <li>بیش از ۲ دقیقه روی یک سوال نمان؛ علامت بزن و برو. بعداً در «مرور» برمی‌گردی.</li>
      <li>هر پاسخ نادرست را در دفتر خطا با سه چیز ثبت کن: علت خطا، نکتهٔ درست، «دفعهٔ بعد چه می‌کنم».</li>
      <li>آخر روز «این روز را تمام کردم» را بزن تا روز در برنامه و پیشرفت سبز شود.</li>
    </ul>
  </div>

  <div class="card">
    <h3>چه چیزی و کجا ذخیره می‌شود</h3>
    <ul class="help-list">
      <li><b>تاریخ شروع</b> (روز ۱) تا اپ بداند امروز کدام روز برنامه است.</li>
      <li><b>هر پاسخ</b>: درست یا نادرست، تعداد تلاش و زمان آخرین پاسخ؛ همین داده درصد دقت و فهرست خطاها را می‌سازد.</li>
      <li><b>روزهای تمام‌شده</b> و <b>محل ادامهٔ هر بلوک</b>؛ اگر وسط یک بلوک بیرون بیایی، دفعهٔ بعد از همان سوال ادامه می‌دهی.</li>
      <li>همهٔ این‌ها فقط روی حافظهٔ همین دستگاه (localStorage) ذخیره می‌شود و جایی ارسال نمی‌شود. برای پاک‌کردن، در تنظیمات «پاک کردن همه پیشرفت» را بزن.</li>
    </ul>
  </div>

  <div class="card">
    <h3>آفلاین و نصب روی اندروید</h3>
    <p class="help-lead mt8">سوال‌ها و برنامه داخل خود اپ هستند و بدون اینترنت باز می‌شوند. نسخهٔ اندروید (APK) جدا نصب می‌شود؛ در نسخهٔ وب هم در کروم، منوی سه‌نقطه ← «افزودن به صفحهٔ اصلی» اپ را مثل یک برنامهٔ مستقل باز می‌کند.</p>
    <div class="help-note">اگر بعد از به‌روزرسانی اپ، داده‌های قبلی را نمی‌بینی، یک بار اپ را کامل ببند و باز کن؛ پیشرفت با کلید ثابت ذخیره می‌شود و پاک نمی‌شود.</div>
  </div>

  <div class="card">
    <h3>سهمیهٔ امروز تمام شد؟</h3>
    <ul class="help-list">
      <li><b>تمرین آزاد</b> — از تب «مرور» یا پایین صفحهٔ «امروز»: ۱۰، ۲۵ یا ۵۰ سوال تصادفی از کل ۴۰۰۰ سوال، با پاسخ و تحلیل. هر بار ترکیب تازه است و به برنامهٔ روز دست نمی‌زند.</li>
      <li><b>دورهٔ سوالات قبلی</b> — همان‌جا در تب «مرور»: فقط سوال‌هایی که قبلاً زده‌ای، تصادفی و <b>بدون تکرار</b> تا وقتی همهٔ آن‌ها یک دور کامل شوند؛ بعد خودش دور تازه را شروع می‌کند. نوار پیشرفت، تعداد مرورشده و باقی‌ماندهٔ همان دور را نشان می‌دهد.</li>
      <li><b>یادآوری روزانه</b> — در تنظیمات، ساعت دلخواه را بگذار و روشن کن؛ هر روز همان ساعت یک اعلان می‌آید. (فقط در نسخهٔ اندروید)</li>
    </ul>
  </div>

  <div class="card">
    <h3>اگر چند روز عقب بیفتی</h3>
    <p class="help-lead mt8">سوال‌های پاسخ‌ندادهٔ روزهای گذشته حذف نمی‌شوند: اپ آن‌ها را جمع می‌کند و بین روزهای مطالعهٔ باقی‌مانده پخش می‌کند. بالای صفحهٔ «امروز» می‌بینی چند سوال مانده و هر روز حدوداً چند تا به آن اضافه شده؛ در کارت همان روز هم یک بلوک «جبران» با دکمهٔ شروع می‌آید. هر چه زودتر جبران کنی، سهم روزهای بعد سبک‌تر می‌شود و هیچ سوالی جا نمی‌ماند.</p>
  </div>

  <div class="card">
    <h3>سه قاعدهٔ کوتاه</h3>
    <ul class="help-list">
      <li>تحلیل را نخوانده رد نکن؛ ارزش هر سوال در همان چند خط است.</li>
      <li>آزمون را با زمان واقعی بزن؛ بی‌زمان، آزمون فقط تمرین است.</li>
      <li>عقب‌افتادگی را در روز استراحت جبران کن، نه با سوار کردن دو روز روی هم.</li>
    </ul>
  </div>`;
}

/* ---------- سطح تخمینی و چینش گرم‌کردنی ----------
   سطح ۱ تا ۳ از روی نشانه‌های متنی تخمین زده می‌شود (طول صورت سوال، محاسبه‌ای بودن،
   تلفیقی/مقایسه‌ای بودن، کوتاهی تحلیل). هدف فقط این است که جلسه با سوال سبک‌تر شروع شود. */
function level(q) {
  let l = 1;
  const t = q.q || '';
  if (t.length > 60) l += 1;
  if (/میانگین|واریانس|انحراف معیار|ضریب|احتمال|رگرسیون|کای‌دو|درجه آزادی|آزمون t|محاسبه|نمره z/.test(t)) l += 1;
  if (/تلفیقی|مقایسه|کدام گزینه نادرست|همه موارد|به جز|نمی‌توان|کدام درست نیست/.test(t)) l += 1;
  return Math.min(3, l);
}

function levelDots(q) {
  const l = level(q);
  let s = '<span class="lvl" title="سطح تخمینی ' + fa(l) + ' از ۳">';
  for (let i = 1; i <= 3; i++) s += `<i class="${i <= l ? 'on' : ''}"></i>`;
  return s + '</span>';
}

/* در هر رشته پیوسته از یک درس، سوال‌ها را از سبک به سنگین مرتب می‌کند؛
   ترتیب درس‌ها و بلوک‌های روز دست‌نخورده می‌ماند. */
function warmupSort(items) {
  const out = [];
  let run = [];
  const flush = () => {
    out.push(
      ...run
        .map((it, i) => ({ it, i }))
        .sort((a, b) => level(a.it.q) - level(b.it.q) || a.i - b.i)
        .map((x) => x.it)
    );
    run = [];
  };
  for (const it of items) {
    if (run.length && run[run.length - 1].sid !== it.sid) flush();
    run.push(it);
  }
  flush();
  return out;
}

/* ---------- جلسه مطالعه ---------- */
async function startStudy(items, title, meta = {}) {
  if (!items.length) { toast('سوالی برای این بخش پیدا نشد'); return; }
  items = warmupSort(items);
  let start = 0;
  if (meta.taskKey && ST.pos[meta.taskKey] > 0) start = Math.min(ST.pos[meta.taskKey], items.length - 1);
  S = { mode: 'study', items, i: start, ans: null, revealed: false, title, log: [], ...meta };
  go('study');
  renderStudy();
}

async function startTask(dayNum, ti) {
  const day = dayByNum(dayNum);
  const t = day.tasks[ti];
  toast('بارگذاری…');
  const items = await questionsOfRanges(t.ranges.map((r) => ({ subject: t.subject, section: t.section, from: r.from, to: r.to })));
  await startStudy(items, subShort(t.subject) + (t.section ? ' — ' + t.section : ''), { day: dayNum, taskKey: dayNum + ':' + ti });
}

async function startCarry(dayNum) {
  const ids = backlogPlan().byDay[dayNum] || [];
  if (!ids.length) { toast('برای این روز جبرانی نیست'); return; }
  await allQuestions();
  const items = ids.map(itemOfId).filter(Boolean);
  if (!items.length) { toast('سوالی برای جبران پیدا نشد'); return; }
  await startStudy(shuffle(items), `جبران عقب‌افتادگی — روز ${fa(dayNum)}`, { day: dayNum });
}

async function startDayStudy(dayNum) {
  const day = dayByNum(dayNum);
  toast('بارگذاری…');
  const items = await questionsOfRanges(rangesOfDay(day));
  await startStudy(items, `روز ${fa(dayNum)} — همه سوال‌ها`, { day: dayNum });
}

function renderStudy() {
  const v = $('#view-study');
  const it = S.items[S.i];
  const q = it.q;
  const answered = S.ans !== null;
  const show = answered || S.revealed;
  const key = q.key - 1;
  const pct = Math.round(((S.i) / S.items.length) * 100);

  const opts = q.options.map((o, idx) => {
    let cls = '';
    if (show) {
      if (idx === key) cls = ' good';
      else if (S.ans === idx) cls = ' bad';
    } else if (S.ans === idx) cls = ' pick';
    return `<button class="opt${cls}" data-act="s-ans" data-i="${idx}" ${show ? 'disabled' : ''}>
      <span class="k">${fa(idx + 1)}</span><span>${esc(o)}</span></button>`;
  }).join('');

  let fb = '';
  if (show) {
    const ok = answered ? S.ans === key : null;
    fb = `<div class="exp"><b>پاسخ: گزینه ${fa(key + 1)}</b>${ok === false ? ' — پاسخ تو نادرست بود' : ''}<br>${esc(q.exp)}</div>`;
    if (!answered) {
      fb += `<div class="studybar">
        <button class="btn ghost" data-act="s-grade" data-ok="0">نمی‌دانستم</button>
        <button class="btn primary" data-act="s-grade" data-ok="1">می‌دانستم</button>
      </div>`;
    }
  }

  const bottom = answered
    ? `<div class="studybar"><button class="btn primary" data-act="s-next">${S.i + 1 >= S.items.length ? 'پایان جلسه' : 'سوال بعد'}</button></div>`
    : show ? '' : `<div class="studybar"><button class="btn ghost" data-act="s-exit">خروج</button><button class="btn primary" data-act="s-reveal">نمایش پاسخ</button></div>`;

  v.innerHTML = `
    <div class="qmeta">
      <button class="btn ghost small" data-act="s-exit">خروج</button>
      <span class="count">سوال ${fa(S.i + 1)} از ${fa(S.items.length)}</span>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="card mt12">
      <div class="row-between"><span class="chip chip-${it.sid}">${subShort(it.sid)}</span><span class="tiny">${levelDots(q)}${esc(it.sec || '')}</span></div>
      <div class="qtext">${esc(q.q)}</div>
      ${opts}
      ${fb}
    </div>
    ${bottom}`;
}

function startExamAsync(opts) {
  toast('آماده‌سازی آزمون…');
  startExam(opts);
}

async function startExam({ mode, day }) {
  let items = [], minutes = 25, title = 'آزمون مبحثی هفته';
  if (mode === 'week') {
    const d = dayByNum(day);
    const curDays = PLAN.days.filter((x) => x.w === d.w && x.kind === 'study');
    const prevDays = PLAN.days.filter((x) => x.w === d.w - 1 && x.kind === 'study');
    const cur = shuffle(await questionsOfRanges(curDays.flatMap(rangesOfDay)));
    const prev = shuffle(await questionsOfRanges(prevDays.flatMap(rangesOfDay)));
    items = [...cur.slice(0, 15), ...prev.slice(0, 10)];
    if (items.length < 25) {
      const extra = shuffle(await allQuestions()).filter((x) => !items.some((i) => i.q.id === x.q.id));
      items = items.concat(extra.slice(0, 25 - items.length));
    }
    if (!items.length) { toast('سوالی برای آزمون پیدا نشد'); return; }
    minutes = 25;
    title = `آزمون مبحثی هفته ${fa(d.w)}`;
  } else {
    const all = await allQuestions();
    items = shuffle(all).slice(0, 200);
    minutes = 200;
    title = 'آزمون جامع — ۲۰۰ سوال';
  }
  S = {
    mode: 'exam', items, i: 0, ans: new Array(items.length).fill(null),
    left: minutes * 60, deadline: Date.now() + minutes * 60000, title,
  };
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tickExam, 1000);
  go('exam');
  renderExam();
}

function mmss(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return fa(String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
}

/* زمان بر پایهٔ ساعت واقعی محاسبه می‌شود؛ اگر کاربر از اپ بیرون برود، شمارش متوقف نمی‌شود */
function examLeft() {
  if (!S || S.mode !== 'exam') return 0;
  if (!S.deadline) return Math.max(0, S.left || 0);
  return Math.max(0, Math.round((S.deadline - Date.now()) / 1000));
}
function paintTimer() {
  const el = $('#exam-timer');
  if (!el) return;
  el.textContent = mmss(S.left);
  el.classList.toggle('low', S.left <= 120);
}
function tickExam() {
  if (!S || S.mode !== 'exam') return;
  S.left = examLeft();
  paintTimer();
  if (S.left <= 0) { clearInterval(ticker); ticker = null; submitExam(); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !S || S.mode !== 'exam') return;
  S.left = examLeft();
  paintTimer();
});

/* پاسخنامه آزمون: نوار خانه‌هایی که می‌شود روی هر سوال پرید */
function answerSheetHTML() {
  const answered = S.ans.filter((x) => x !== null).length;
  const cells = S.ans
    .map((a, i) => `<button class="cell${a !== null ? ' done' : ''}${i === S.i ? ' cur' : ''}" data-act="e-go" data-i="${i}">${fa(i + 1)}</button>`)
    .join('');
  return `<details class="as-wrap"${S.sheetOpen ? ' open' : ''}><summary>پاسخنامه — ${fa(answered)} از ${fa(S.items.length)}</summary><div class="answersheet">${cells}</div></details>`;
}

function renderExam() {
  const v = $('#view-exam');
  const it = S.items[S.i];
  const q = it.q;
  const pick = S.ans[S.i];
  const answeredN = S.ans.filter((x) => x !== null).length;

  const opts = q.options.map((o, idx) => `
    <button class="opt${pick === idx ? ' pick' : ''}" data-act="e-pick" data-i="${idx}">
      <span class="k">${fa(idx + 1)}</span><span>${esc(o)}</span></button>`).join('');

  v.innerHTML = `
    <div class="timerbar">
      <button class="btn ghost small" data-act="e-exit">پایان آزمون</button>
      <span class="timer" id="exam-timer">${mmss(Math.max(0, S.left))}</span>
      <small>${fa(answeredN)}/${fa(S.items.length)}</small>
    </div>
    <div class="bar"><i style="width:${Math.round((S.i / S.items.length) * 100)}%"></i></div>
    ${answerSheetHTML()}
    <div class="card mt12">
      <div class="row-between"><span class="chip chip-${it.sid}">${subShort(it.sid)}</span><small class="tiny">سوال ${fa(S.i + 1)} از ${fa(S.items.length)}</small></div>
      <div class="qtext">${esc(q.q)}</div>
      ${opts}
    </div>
    <div class="studybar">
      <button class="btn ghost" data-act="e-prev" ${S.i === 0 ? 'disabled' : ''}>قبلی</button>
      ${S.i + 1 >= S.items.length
        ? '<button class="btn primary" data-act="e-submit">تحویل آزمون</button>'
        : '<button class="btn primary" data-act="e-next">بعدی</button>'}
    </div>`;
}

function submitExam() {
  if (!S || S.mode !== 'exam') return;
  if (ticker) { clearInterval(ticker); ticker = null; }
  const rows = S.items.map((it, i) => {
    const pick = S.ans[i];
    const ok = pick !== null && pick + 1 === it.q.key;
    // فقط سوال‌هایی که واقعاً پاسخ داده شده‌اند در پیشرفت و فهرست خطاها ثبت می‌شوند
    if (pick !== null) record(it.q.id, ok);
    return { it, pick, ok };
  });
  const answered = rows.filter((r) => r.pick !== null);
  showResult({
    title: S.title,
    total: rows.length,
    correct: answered.filter((r) => r.ok).length,
    rows: answered.filter((r) => !r.ok),
    blank: rows.length - answered.length,
    mode: 'exam',
  });
}

/* ---------- نتیجه ---------- */
function showResult({ title, total, correct, rows, mode, day, blank = 0 }) {
  const v = $('#view-result');
  const pct = total ? Math.round((correct / total) * 100) : 0;
  let html = `
  <div class="card">
    <small class="tiny">${esc(title)}</small>
    <div class="score" style="--p:${pct}%"><div><b>${fa(pct)}٪</b><small>${fa(correct)} از ${fa(total)}</small></div></div>
    <div class="row-between"><small class="tiny">نادرست: ${fa(total - correct - blank)}${blank ? ' · بی‌پاسخ: ' + fa(blank) : ''}</small><small class="tiny">${mode === 'exam' ? 'در کارنامه ثبت شد' : 'در پیشرفت ثبت شد'}</small></div>
  </div>`;

  if (rows.length) {
    html += `<div class="card"><h3>سوال‌های نادرست</h3>`;
    for (const r of rows.slice(0, 20)) {
      html += `<div class="wrongitem">
        <div class="q"><span class="chip chip-${r.it.sid}">${subShort(r.it.sid)}</span> ${esc(r.it.q.q)}</div>
        <div class="a">پاسخ درست: ${esc(r.it.q.options[r.it.q.key - 1])}</div>
      </div>`;
    }
    if (rows.length > 20) html += `<small class="tiny">و ${fa(rows.length - 20)} مورد دیگر در بخش «مرور»</small>`;
    html += '</div>';
  }

  html += `<button class="btn primary block" data-act="res-back">بازگشت</button>
           <button class="btn ghost block mt8" data-act="tab" data-tab="review">رفتن به مرور</button>`;
  v.innerHTML = html;
  S = null;
  go('result');
}

function savePos(nextIndex) {
  if (!S || !S.taskKey) return;
  ST.pos[S.taskKey] = nextIndex;
  saveST();
}

function finishStudy() {
  if (S && S.taskKey) { delete ST.pos[S.taskKey]; saveST(); }
  const log = S.log || [];
  const correct = log.filter((x) => x.ok).length;
  const title = S.title;
  const total = log.length;
  const rows = log.filter((x) => !x.ok);
  showResult({ title, total, correct, rows: rows.map((x) => ({ it: { sid: x.sid, q: x.q } })), mode: 'study' });
}

/* ---------- یادآوری (اعلان روزانه) ---------- */
const REMINDER_ID = 4201;
function notifyPlugin() {
  // پلاگین از باندل vendor-notifications.js می‌آید؛ مسیر قدیمی هم به‌عنوان پشتیبان می‌ماند.
  if (window.SB && window.SB.LocalNotifications) return window.SB.LocalNotifications;
  return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
}
function pad2(n) { return String(n).padStart(2, '0'); }
async function applyReminder() {
  const res = await SBCore.scheduleDaily(notifyPlugin(), {
    on: ST.notify.on,
    h: ST.notify.h,
    m: ST.notify.m,
    id: REMINDER_ID,
    title: 'برنامهٔ امروز',
    body: 'سوال‌های امروز و جبران روزهای گذشته منتظرند؛ چند دقیقه وقت بگذار.',
  });
  if (res.status === 'on') {
    ST.notify.confirmed = res.pendingId === false ? false : true;
    return res.pendingId === false ? 'unconfirmed' : 'on';
  }
  if (res.status === 'error') return 'error';
  return res.status;
}

/* ---------- شیت تنظیمات ---------- */
function openSheet() {
  const d = currentDay();
  const s = $('#sheet');
  s.classList.remove('hidden');
  s.innerHTML = `
  <div class="sheet-card">
    <div class="row-between"><h3>تنظیمات</h3><button class="btn ghost small" data-act="close-sheet">بستن</button></div>
    <p class="tiny mt12">تاریخ شروع (روز ۱)</p>
    <input type="date" id="sheet-start-date" class="start-input" value="${ST.start || isoOf()}">
    <button class="btn primary block mt8" data-act="save-start">ذخیره تاریخ</button>
    <p class="tiny mt8">${ST.start ? `امروز روز ${fa(d)} از ${fa(totalDays())} است؛ کنکور ۱۶ اردیبهشت.` : 'هنوز تاریخ شروع انتخاب نشده.'}</p>
    <hr>
    <button class="btn danger block" data-act="reset">پاک کردن همه پیشرفت</button>
    <p class="tiny mt8">این کار پاسخ‌ها، روزهای تمام‌شده و تاریخ شروع را حذف می‌کند.</p>
    <hr>
    <h3 style="font-size:13.5px">یادآوری روزانه</h3>
    <p class="tiny mt8">هر روز سر ساعت انتخابی، یک اعلان یادت می‌اندازد که برنامهٔ امروز و سوال‌های عقب‌افتاده را ببینی.</p>
    <div class="row-between mt8" style="gap:8px">
      <input type="time" id="notify-time" value="${pad2(ST.notify.h)}:${pad2(ST.notify.m)}" style="flex:1;padding:9px;border:1px solid var(--line-2);border-radius:11px;font-family:inherit">
      <button class="btn ghost" data-act="save-reminder">ذخیره ساعت</button>
    </div>
    <div class="row-between mt8">
      <small>${ST.notify.on ? 'یادآوری روشن است' + (ST.notify.confirmed === false ? ' (زمان‌بندی تأیید نشد)' : '') : 'یادآوری خاموش است'}</small>
      <button class="btn ${ST.notify.on ? 'ghost' : 'primary'} small" data-act="toggle-notify">${ST.notify.on ? 'خاموش کن' : 'روشن کن'}</button>
    </div>
    ${!notifyPlugin() ? '<p class="tiny mt8">اعلان فقط در نسخهٔ اندروید (APK) فعال می‌شود.</p>' : ''}
    ${notifyPlugin() && ST.notify.on && ST.notify.confirmed ? '<p class="tiny mt8">✓ زمان‌بندی در سیستم اعلان‌های گوشی ثبت شده است.</p>' : ''}
    <hr>
    <h3 style="font-size:13.5px">نصب روی اندروید</h3>
    <p class="tiny mt8">در کروم اندروید، منوی سه‌نقطه ← «افزودن به صفحه اصلی» (Add to Home screen). اپ مثل یک برنامه جدا باز می‌شود و سوال‌ها آفلاین هم کار می‌کنند.</p>
  </div>`;
}

/* ---------- رویدادها ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;

  if (act === 'tab') {
    const tb = t.dataset.tab;
    if (tb === 'today') renderToday();
    if (tb === 'plan') renderPlan();
    if (tb === 'review') renderReview();
    if (tb === 'progress') renderProgress();
    if (tb === 'help') renderHelp();
    go(tb);
    return;
  }
  if (act === 'settings') { openSheet(); return; }
  if (act === 'toggle-notify') {
    ST.notify.on = !ST.notify.on;
    const r = await applyReminder();
    if (r === 'unsupported') { ST.notify.on = false; saveST(); toast('اعلان فقط در نسخهٔ اندروید کار می‌کند'); openSheet(); return; }
    if (r === 'denied') { ST.notify.on = false; saveST(); toast('اجازهٔ اعلان داده نشد؛ از تنظیمات گوشی اجازه بده'); openSheet(); return; }
    if (r === 'error') { ST.notify.on = false; saveST(); toast('ثبت یادآوری ناموفق بود'); openSheet(); return; }
    saveST();
    if (r === 'unconfirmed') toast('یادآوری ثبت شد؛ اگر اعلان نیامد اجازهٔ اعلان گوشی را بررسی کن');
    else toast(ST.notify.on ? 'یادآوری روزانه روشن شد' : 'یادآوری خاموش شد');
    openSheet();
    return;
  }
  if (act === 'save-reminder') {
    const val = ($('#notify-time') || {}).value || '20:00';
    const parts = val.split(':').map(Number);
    ST.notify.h = Number.isFinite(parts[0]) ? parts[0] : 20;
    ST.notify.m = Number.isFinite(parts[1]) ? parts[1] : 0;
    if (ST.notify.on) await applyReminder();
    saveST();
    toast('ساعت یادآوری ذخیره شد');
    openSheet();
    return;
  }
  if (act === 'close-sheet') { $('#sheet').classList.add('hidden'); return; }

  if (act === 'save-start') {
    // در تنظیمات، ورودی تاریخ داخل شیت اولویت دارد؛ وگرنه کارت شروع در صفحهٔ «امروز»
    const sheet = $('#sheet');
    const sheetOpen = sheet && !sheet.classList.contains('hidden');
    const sheetInput = sheetOpen ? $('#sheet-start-date') : null;
    const val = (sheetInput ? sheetInput.value : '') || ($('#start-date') || {}).value;
    if (!val) { toast('تاریخ را انتخاب کن'); return; }
    ST.start = val; saveST();
    $('#sheet').classList.add('hidden');
    renderToday(); go('today');
    toast('روز ۱ ثبت شد: ' + val);
    return;
  }
  if (act === 'start-today') {
    ST.start = isoOf(); saveST(); renderToday(); return;
  }
  if (act === 'reset') {
    if (!confirm('همه پیشرفت پاک شود؟')) return;
    ST = { start: null, q: {}, days: {}, pos: {}, cycle: { queue: [], seen: [], round: 1 }, notify: ST.notify }; saveST();
    $('#sheet').classList.add('hidden');
    renderToday(); go('today');
    return;
  }

  if (act === 'free') { await startFree(Number(t.dataset.n) || 25); return; }
  if (act === 'cycle') { await startCycle(20); return; }
  if (act === 'start-carry') { await startCarry(Number(t.dataset.day)); return; }
  if (act === 'go-day') { const d = Number(t.dataset.day); $('#view-day').innerHTML = dayCardHTML(dayByNum(d), false); go('day'); return; }
  if (act === 'start-task') { await startTask(Number(t.dataset.day), Number(t.dataset.task)); return; }
  if (act === 'study-day') { await startDayStudy(Number(t.dataset.day)); return; }
  if (act === 'toggle-day') {
    const d = Number(t.dataset.day);
    ST.days[d] = ST.days[d] || {};
    ST.days[d].done = !ST.days[d].done;
    saveST();
    if ($('#view-day').classList.contains('hidden')) renderToday();
    else { $('#view-day').innerHTML = dayCardHTML(dayByNum(d), false); go('day'); }
    return;
  }
  if (act === 'start-exam') { startExamAsync({ mode: t.dataset.mode, day: Number(t.dataset.day) }); return; }
  if (act === 'review-day') { await reviewWrong(Number(t.dataset.day)); return; }
  if (act === 'review-wrong') { await reviewWrong(); return; }

  /* جلسه مطالعه */
  if (act === 's-ans') {
    if (!S || S.ans !== null) return;
    const idx = Number(t.dataset.i);
    S.ans = idx;
    const ok = idx + 1 === S.items[S.i].q.key;
    record(S.items[S.i].q.id, ok);
    S.log.push({ sid: S.items[S.i].sid, q: S.items[S.i].q, ok });
    renderStudy();
    return;
  }
  if (act === 's-reveal') { S.revealed = true; renderStudy(); return; }
  if (act === 's-grade') {
    const ok = t.dataset.ok === '1';
    const it = S.items[S.i];
    record(it.q.id, ok);
    S.log.push({ sid: it.sid, q: it.q, ok });
    S.revealed = false;
    if (S.i + 1 >= S.items.length) finishStudy();
    else { S.i += 1; savePos(S.i); S.ans = null; renderStudy(); }
    return;
  }
  if (act === 's-next') {
    if (S.i + 1 >= S.items.length) finishStudy();
    else { S.i += 1; savePos(S.i); S.ans = null; S.revealed = false; renderStudy(); }
    return;
  }
  if (act === 's-exit') {
    if (S && S.log.length) finishStudy();
    else { backToDay(); }
    return;
  }

  /* آزمون */
  if (act === 'e-pick') { S.ans[S.i] = Number(t.dataset.i); renderExam(); return; }
  if (act === 'e-next') { if (S.i + 1 < S.items.length) S.i += 1; renderExam(); return; }
  if (act === 'e-prev') { if (S.i > 0) S.i -= 1; renderExam(); return; }
  if (act === 'e-go') { S.i = Number(t.dataset.i); renderExam(); return; }
  if (act === 'e-submit') { submitExam(); return; }
  if (act === 'e-exit') {
    if (!confirm('آزمون تمام شود و کارنامه بگیرید؟')) return;
    submitExam();
    return;
  }
  if (act === 'res-back') { backToDay(); return; }
});

/* باز نگه داشتن پاسخنامه بین رندرها */
document.addEventListener('toggle', (e) => {
  const d = e.target.closest && e.target.closest('.as-wrap');
  if (d && S) S.sheetOpen = d.open;
}, true);

function backToDay() {
  if (ticker) { clearInterval(ticker); ticker = null; }
  S = null;
  renderToday();
  go('today');
}

async function reviewWrong(dayNum) {
  const day = dayNum ? dayByNum(dayNum) : null;
  let ids = wrongIds();
  if (day && day.focus) ids = ids.filter((id) => id.startsWith(day.focus + '-'));
  if (!ids.length) { toast('سوال نادرستی برای مرور نیست'); return; }
  await allQuestions();
  const items = [];
  for (const id of shuffle(ids).slice(0, 20)) {
    const [sid, n] = id.split('-');
    const q = SUBIDX[sid] && SUBIDX[sid].get(Number(n));
    if (q) items.push({ sid, q, sec: '' });
  }
  await startStudy(items, day ? `مرور روز ${fa(day.d)}` : 'مرور سوالات نادرست', { day: dayNum || null });
}

/* ---------- شروع ---------- */
(async function boot() {
  loadST();
  try {
    const [i, p] = await Promise.all([
      fetch('/data/index.json').then((r) => r.json()),
      fetch('/data/plan.json').then((r) => r.json()),
    ]);
    IDX = i; PLAN = p;
  } catch (e) {
    $('#view-today').innerHTML = '<div class="card empty">بارگذاری داده‌ها ناموفق بود. اتصال را بررسی کن و صفحه را دوباره باز کن.</div>';
    return;
  }
  renderToday();
  go('today');
  if (ST.notify.on) applyReminder();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
