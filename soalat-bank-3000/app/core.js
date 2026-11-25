/* منطق خالص و تست‌پذیر: پخش سوالات عقب‌افتاده، صف دورهٔ بدون تکرار، ثبت اعلان روزانه.
   در مرورگر به‌صورت window.SBCore و در Node با require در دسترس است. */
(function (root) {
  function shuffleArr(list) {
    const x = list.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = x[i]; x[i] = x[j]; x[j] = t;
    }
    return x;
  }

  /* studyDays: [{ d, ids: [...] }] — فقط روزهای مطالعه
     answeredIds: آرایه یا Set شناسه‌های پاسخ‌داده‌شده
     امروز: شمارهٔ روز جاری برنامه
     خروجی: کل سوالات عقب‌افتاده و سهم هر روز مطالعهٔ باقی‌مانده (توزیع مساوی) */
  function planBacklog(studyDays, answeredIds, todayNum) {
    const answered = answeredIds instanceof Set ? answeredIds : new Set(answeredIds || []);
    const pending = [];
    for (const day of studyDays || []) {
      if (day.d >= todayNum) continue;
      for (const id of day.ids || []) if (!answered.has(id)) pending.push(id);
    }
    const upcoming = (studyDays || []).filter((d) => d.d >= todayNum);
    const byDay = {};
    if (pending.length && upcoming.length) {
      const base = Math.floor(pending.length / upcoming.length);
      const rem = pending.length % upcoming.length;
      let k = 0;
      upcoming.forEach((day, i) => {
        const n = base + (i < rem ? 1 : 0);
        if (n > 0) {
          byDay[day.d] = pending.slice(k, k + n);
          k += n;
        }
      });
    }
    return {
      total: pending.length,
      perDay: upcoming.length ? Math.ceil(pending.length / upcoming.length) : 0,
      byDay,
      pending,
      upcomingDays: upcoming.length,
    };
  }

  /* یک گام از صف دوره: سوال‌های تازه به صف اضافه می‌شوند، n سوال برداشته می‌شود
     و هیچ شناسه‌ای در یک دور تکرار نمی‌شود؛ با تمام‌شدن صف، دور تازه شروع می‌شود. */
  function cycleStep(state) {
    const pool = (state.pool || []).slice();
    const n = state.n > 0 ? state.n : 20;
    const poolSet = new Set(pool);
    let queue = (state.queue || []).filter((id) => poolSet.has(id));
    let seen = (state.seen || []).filter((id) => poolSet.has(id));
    let round = state.round > 0 ? state.round : 1;

    const known = new Set([...queue, ...seen]);
    const fresh = pool.filter((id) => !known.has(id));
    if (fresh.length) queue = queue.concat(shuffleArr(fresh));

    let restarted = false;
    if (!queue.length) {
      if (!seen.length) {
        return { pool, queue: [], seen, take: [], round, restarted, total: pool.length };
      }
      round += 1;
      seen = [];
      queue = shuffleArr(pool);
      restarted = true;
    }

    const take = queue.slice(0, Math.min(n, queue.length));
    return {
      pool,
      queue: queue.slice(take.length),
      seen: seen.concat(take),
      take,
      round,
      restarted,
      total: pool.length,
    };
  }

  function cycleStats(state) {
    const pool = state.pool || [];
    const poolSet = new Set(pool);
    const seen = (state.seen || []).filter((id) => poolSet.has(id));
    const queue = (state.queue || []).filter((id) => poolSet.has(id));
    return {
      total: pool.length,
      seen: seen.length,
      left: queue.length,
      round: state.round > 0 ? state.round : 1,
    };
  }

  /* ---------- تقویم، تاریخ کنکور و چیدن برنامه ---------- */
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;

  function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    const gy = jy + 621;
    let leapJ = -14;
    let jp = breaks[0];
    let jump = 0;
    for (let i = 1; i < breaks.length; i += 1) {
      const jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  const g2d = (gy, gm, gd) => {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  };
  const d2g = (jdn) => {
    let j = 4 * jdn + 139361631;
    j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  };
  const j2d = (jy, jm, jd) => g2d(jalCal(jy).gy, 3, jalCal(jy).march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    let k = jdn - g2d(gy, 3, r.march);
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }

  const g2j = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
  const j2g = (jy, jm, jd) => d2g(j2d(jy, jm, jd));

  const iso = (o) => `${o.gy}-${String(o.gm).padStart(2, '0')}-${String(o.gd).padStart(2, '0')}`;

  /* روز کنکور: ۱۶ اردیبهشت. اگر تاریخ شروع از ۱۶ اردیبهشت گذشته باشد، سال بعد. */
  function examInfo(startISO) {
    const [gy, gm, gd] = String(startISO).slice(0, 10).split('-').map(Number);
    const j = g2j(gy, gm, gd);
    const jy = j.jm > 2 || (j.jm === 2 && j.jd >= 16) ? j.jy + 1 : j.jy;
    const g = j2g(jy, 2, 16);
    return { jy, jm: 2, jd: 16, iso: iso(g), totalDays: daysBetween(startISO, iso(g)) + 1 };
  }

  function daysBetween(aISO, bISO) {
    const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10));
    const b = Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10));
    return Math.round((b - a) / 86400000);
  }

  /* ---------- ساخت برنامه بر اساس تقویم واقعی ----------
     محتوای ۱۷۰ روزه (الگو) به بلوک‌های ۵ سوالی شکسته می‌شود و روی روزهای
     واقعی میان «تاریخ شروع» و «روز کنکور» پخش می‌شود:
     جمعه استراحت، پنجشنبه آزمون مبحثی، و سهمیهٔ هر روز بر اساس تعداد روزهای
     مطالعهٔ واقعی حساب می‌شود (نه ۴۰ سوال ثابت). */
  const WDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const PHASES = [
    { id: 1, title: 'پایه', goal: 'بخش‌های آغازین هر پنج درس: کلاسیک‌ها، مفاهیم روش، آمار توصیفی، گرامر پایه' },
    { id: 2, title: 'گسترش', goal: 'نظریهٔ معاصر، حوزه‌ها، طرح‌ها، آمار استنباطی، واژگان' },
    { id: 3, title: 'تسلط', goal: 'بخش‌های دشوار: تلفیقی، ناپارامتری، رگرسیون، درک مطلب' },
    { id: 4, title: 'پایان دور اول', goal: 'پایان بانک + آزمون مبحثی هفتگی' },
    { id: 5, title: 'جمع‌بندی', goal: 'آزمون جامع و شبیه‌ساز، مرور خطا و برگه‌های یک‌صفحه‌ای' },
  ];
  const PHASE_CUTS = [0, 0.165, 0.412, 0.66, 0.82, 1];

  function buildPlan(opts) {
    const total = Math.max(1, Math.round(opts.totalDays));
    const startISO = String(opts.startISO).slice(0, 10);
    const base = Date.UTC(+startISO.slice(0, 4), +startISO.slice(5, 7) - 1, +startISO.slice(8, 10));
    const wdOf = (d) => (new Date(base + (d - 1) * 86400000).getUTCDay() + 1) % 7;

    /* بلوک‌های محتوا به همان ترتیب آموزشی الگو */
    const blocks = [];
    for (const day of opts.days || []) {
      if (day.kind !== 'study') continue;
      for (const t of day.tasks || []) {
        for (const r of t.ranges || []) {
          blocks.push({ subject: t.subject, subjectTitle: t.subjectTitle, section: t.section, from: r.from, to: r.to, n: r.to - r.from + 1 });
        }
      }
    }
    const questions = blocks.reduce((a, b) => a + b.n, 0);

    /* ۱) روز کنکور و دو روز مرور پایانی */
    const kind = new Array(total).fill('study');
    kind[total - 1] = 'final';
    if (total >= 8) { kind[total - 2] = 'review'; kind[total - 3] = 'review'; }
    else if (total >= 4) { kind[total - 2] = 'review'; }

    /* ۲) ریتم هفتگی روی روزهای واقعی: جمعه استراحت، پنجشنبه آزمون */
    for (let d = 1; d <= total; d += 1) {
      if (kind[d - 1] !== 'study') continue;
      const wd = wdOf(d);
      if (wd === 6 && total >= 21) kind[d - 1] = 'rest';
      else if (wd === 5 && total >= 28) kind[d - 1] = 'exam';
    }

    /* ۳) آزمون جامع و شبیه‌ساز فقط اگر روز کافی باشد */
    const studyIdx = () => kind.map((k, i) => (k === 'study' ? i + 1 : 0)).filter(Boolean);
    if (studyIdx().length >= 40) {
      const marks = [0.72, 0.8, 0.87, 0.93].map((f) => Math.max(1, Math.min(total - 3, Math.round(total * f))));
      marks.forEach((target, i) => {
        let pick = target;
        if (kind[pick - 1] !== 'study') {
          for (let step = 1; step < total; step += 1) {
            if (kind[pick - 1 - step] === 'study') { pick -= step; break; }
            if (kind[pick - 1 + step] === 'study') { pick += step; break; }
          }
        }
        if (kind[pick - 1] === 'study') kind[pick - 1] = i % 2 === 1 ? 'mock2' : 'mock';
      });
    }

    /* ۴) پخش سوالات روی روزهای مطالعه */
    const studyDays = kind.map((k, i) => (k === 'study' ? i + 1 : 0)).filter(Boolean);
    const days = [];
    let cursor = 0;
    const per = studyDays.length ? Math.floor(blocks.length / studyDays.length) : 0;
    const rest = studyDays.length ? blocks.length % studyDays.length : 0;

    for (let d = 1; d <= total; d += 1) {
      const wd = wdOf(d);
      const day = {
        d,
        w: Math.floor((d - 1) / 7) + 1,
        weekday: wd,
        weekdayTitle: WDAYS[wd],
        phase: PHASES.findIndex((_, i) => i === 0) + 1,
        kind: kind[d - 1] === 'mock2' ? 'mock' : kind[d - 1],
        tasks: [],
        count: 0,
        pool: null,
        size: null,
        timed: false,
        text: '',
        review: '',
        minutes: 0,
      };
      day.phase = PHASES.findIndex((_, i) => d / total <= PHASE_CUTS[i + 1]) + 1 || 5;

      if (day.kind === 'study') {
        const k = studyDays.indexOf(d);
        const take = per + (k < rest ? 1 : 0);
        const slice = blocks.slice(cursor, cursor + take);
        cursor += take;
        if (!slice.length) {
          day.kind = 'review';
        } else {
          for (const b of slice) {
            const last = day.tasks[day.tasks.length - 1];
            if (last && last.subject === b.subject && last.section === b.section && last.ranges[last.ranges.length - 1].to + 1 >= b.from) {
              const lastRange = last.ranges[last.ranges.length - 1];
              if (lastRange.to + 1 === b.from) lastRange.to = b.to;
              else last.ranges.push({ from: b.from, to: b.to });
            } else {
              day.tasks.push({ subject: b.subject, subjectTitle: b.subjectTitle, section: b.section, ranges: [{ from: b.from, to: b.to }] });
            }
            day.count += b.n;
          }
          day.text = day.tasks.map((t) => `${t.subjectTitle} — ${t.section} (سوال ${t.ranges.map((r) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`)).join('، ')})`).join(' • ');
          day.review = '۱۰ دقیقه مرور دیروز + فلش‌کارت';
          day.minutes = Math.max(30, Math.round(day.count * 10));
        }
      }

      if (day.kind === 'exam') {
        day.count = 25; day.pool = 'week'; day.size = 25; day.timed = true; day.minutes = 25;
        day.text = 'آزمون مبحثی هفته — ۱۵ سوال از مباحث همین هفته + ۱۰ سوال از هفته‌های قبل (۲۵ دقیقه، بدون کتاب)';
        day.review = 'تحلیل کامل خطاها + نوشتن علت هر خطا در دفتر خطا';
      } else if (day.kind === 'mock') {
        const mockIndex = kind.filter((x, i) => i < d && (x === 'mock' || x === 'mock2')).length;
        const isSim = mockIndex % 2 === 0;
        day.count = 200; day.pool = 'all'; day.size = 200; day.timed = true; day.minutes = 200;
        day.text = isSim ? 'آزمون شبیه‌ساز — ۲۰۰ سوال در ساعت واقعی کنکور + تحلیل' : 'آزمون جامع — ۲۰۰ سوال در شرایط زمانی واقعی + تحلیل کامل';
        day.review = 'دسته‌بندی خطاها: نبود دانش / بدفهمی / بی‌دقتی / کمبود زمان';
      } else if (day.kind === 'rest') {
        day.text = 'استراحت فعال — بدون منبع جدید؛ جبران عقب‌افتادگی هفته';
        day.review = '۱۵ دقیقه کارت مفاهیم (اختیاری)';
        day.minutes = 30;
      } else if (day.kind === 'review') {
        day.text = 'مرور و تثبیت — بازخوانی خلاصه‌ها، دفتر خطا و برگه‌های یک‌صفحه‌ای؛ بدون سوال تازه';
        day.review = 'مرور سوالات نادرست همان درس‌ها';
        day.minutes = 180;
      } else if (day.kind === 'final') {
        day.text = 'روز کنکور — مرور ۲۰ دقیقه‌ای برگه‌ها؛ آرامش، تغذیه، رسیدن به‌موقع به حوزه';
        day.review = '—';
        day.minutes = 120;
      }
      days.push(day);
    }

    /* فازها به نسبت روزها */
    const phases = PHASES.map((p, i) => ({
      id: p.id,
      title: p.title,
      from: Math.round(PHASE_CUTS[i] * total) + 1,
      to: Math.max(Math.round(PHASE_CUTS[i] * total) + 1, Math.round(PHASE_CUTS[i + 1] * total)),
      goal: p.goal,
    }));
    phases[phases.length - 1].to = total;

    const counts = days.filter((x) => x.kind === 'study').map((x) => x.count);
    return {
      totalDays: total,
      days,
      phases,
      questions,
      blocks: blocks.length,
      perDayMin: counts.length ? Math.min(...counts) : 0,
      perDayMax: counts.length ? Math.max(...counts) : 0,
      studyDays: counts.length,
      examDays: days.filter((x) => x.kind === 'exam').length,
      restDays: days.filter((x) => x.kind === 'rest').length,
      mockDays: days.filter((x) => x.kind === 'mock').length,
      heavy: (counts.length ? Math.max(...counts) : 0) > 60,
    };
  }

  /* ثبت/لغو اعلان روزانه روی پلاگین Capacitor.
     cfg: { on, h, m, id, title, body }
     خروجی: { status: 'on'|'off'|'denied'|'error', scheduled?: boolean, pendingId?: boolean } */
  async function scheduleDaily(plugin, cfg) {
    if (!plugin) return { status: 'unsupported' };
    const id = cfg.id || 1;
    try {
      let perm = await plugin.checkPermissions();
      if (perm.display !== 'granted') perm = await plugin.requestPermissions();
      if (perm.display !== 'granted') return { status: 'denied' };

      try { await plugin.cancel({ notifications: [{ id }] }); } catch (e) { /* اولین بار چیزی برای لغو نیست */ }
      if (!cfg.on) return { status: 'off' };

      const base = { id, title: cfg.title, body: cfg.body };
      const on = { hour: cfg.h, minute: cfg.m };
      let scheduled = false;
      try {
        await plugin.schedule({ notifications: [{ ...base, schedule: { on, repeats: true, allowWhileIdle: true } }] });
        scheduled = true;
      } catch (e) {
        await plugin.schedule({ notifications: [{ ...base, schedule: { on, repeats: true } }] });
        scheduled = true;
      }

      let pendingId = null;
      if (typeof plugin.getPending === 'function') {
        try {
          const res = await plugin.getPending();
          pendingId = (res.notifications || []).some((x) => x.id === id);
        } catch (e) { pendingId = null; }
      }
      return { status: 'on', scheduled, pendingId };
    } catch (e) {
      return { status: 'error', error: String(e) };
    }
  }

  const api = { planBacklog, cycleStep, cycleStats, scheduleDaily, shuffleArr, g2j, j2g, examInfo, daysBetween, buildPlan };
  root.SBCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
