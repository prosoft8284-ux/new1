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

  const api = { planBacklog, cycleStep, cycleStats, scheduleDaily, shuffleArr };
  root.SBCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
