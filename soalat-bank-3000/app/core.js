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

  /* چیدن روزهای برنامه روی روزهای تقویم: هر روز برنامه (۱..planTotal) به
     نزدیک‌ترین روز تقویم نسبت داده می‌شود؛ روز آخر برنامه = روز کنکور.
     خروجی: آرایه‌ای به طول totalDays که هر خانه‌اش فهرست روزهای برنامه است. */
  function planSchedule(totalDays, planTotal) {
    const total = Math.max(1, Math.round(totalDays));
    const buckets = Array.from({ length: total }, () => []);
    for (let i = 1; i <= planTotal; i += 1) {
      const k = Math.min(total, Math.max(1, Math.ceil((i * total) / planTotal)));
      buckets[k - 1].push(i);
    }
    return buckets;
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

  const api = { planBacklog, cycleStep, cycleStats, scheduleDaily, shuffleArr, g2j, j2g, examInfo, daysBetween, planSchedule };
  root.SBCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
