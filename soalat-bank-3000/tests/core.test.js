/* تست‌های منطق خالص: پخش عقب‌افتادگی، صف دورهٔ بدون تکرار، ثبت اعلان روزانه */
const assert = require('assert');
const core = require('../app/core.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('✓ ' + name);
  } catch (e) {
    console.error('✗ ' + name + '\n  ' + e.message);
    process.exitCode = 1;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('✓ ' + name);
  } catch (e) {
    console.error('✗ ' + name + '\n  ' + e.message);
    process.exitCode = 1;
  }
}

const days = (count, perDay, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    d: i + 1,
    ids: Array.from({ length: perDay }, (_, k) => `${prefix}-${i + 1}-${k + 1}`),
  }));

/* ---------- پخش عقب‌افتادگی ---------- */
test('بدون روز عقب‌افتاده، چیزی برای جبران نیست', () => {
  const plan = core.planBacklog(days(10, 40, 'q'), [], 1);
  assert.strictEqual(plan.total, 0);
  assert.deepStrictEqual(plan.byDay, {});
});

test('عقب‌افتادگی بین روزهای باقی‌مانده مساوی پخش می‌شود', () => {
  const list = days(12, 40, 'q');
  const answered = [];
  for (const day of list.slice(0, 3)) {
    if (day.d === 1) answered.push(...day.ids);
    if (day.d === 2) answered.push(...day.ids.slice(0, 34)); // ۶ سوال نمانده
    if (day.d === 3) answered.push(...day.ids.slice(0, 36)); // ۴ سوال نمانده
  }
  const plan = core.planBacklog(list, answered, 4);
  assert.strictEqual(plan.total, 10);
  const chunks = Object.entries(plan.byDay);
  assert.strictEqual(chunks.length, 9, 'فقط روزهای ۴ تا ۱۲ سهم می‌گیرند');
  const sizes = chunks.map(([, ids]) => ids.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'اختلاف سهم روزها حداکثر یک سوال');
  const all = chunks.flatMap(([, ids]) => ids);
  assert.strictEqual(all.length, 10);
  assert.strictEqual(new Set(all).size, 10, 'هیچ سوالی دو بار پخش نشده');
  for (const [day] of chunks) assert.ok(Number(day) >= 4, 'روز گذشته سهم نمی‌گیرد');
});

test('عقب‌افتادگی بزرگ هم کامل و بدون تکرار پخش می‌شود', () => {
  const list = days(12, 40, 'q'); // ۳ روز اول کامل جواب نشده = ۱۲۰ سوال
  const plan = core.planBacklog(list, [], 4);
  assert.strictEqual(plan.total, 120);
  const all = Object.values(plan.byDay).flat();
  assert.strictEqual(all.length, 120);
  assert.strictEqual(new Set(all).size, 120);
  const sizes = Object.values(plan.byDay).map((x) => x.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.strictEqual(plan.perDay, 14, 'سهم روزانه = سقف ۱۲۰/۹');
});

/* ---------- صف دورهٔ بدون تکرار ---------- */
test('دوره تا پایان صف تکرار نمی‌کند و بعد دور تازه می‌سازد', () => {
  const pool = Array.from({ length: 45 }, (_, i) => 'p-' + i);
  let state = { pool, queue: [], seen: [], round: 1 };
  const seenInRound = [];

  let step = core.cycleStep({ ...state, n: 20 });
  assert.strictEqual(step.take.length, 20);
  assert.strictEqual(step.queue.length, 25);
  seenInRound.push(...step.take);
  state = step;

  step = core.cycleStep({ ...state, n: 20 });
  assert.strictEqual(step.take.length, 20);
  seenInRound.push(...step.take);
  state = step;

  step = core.cycleStep({ ...state, n: 20 });
  assert.strictEqual(step.take.length, 5, 'آخرین بخش صف');
  seenInRound.push(...step.take);
  state = step;
  assert.strictEqual(step.queue.length, 0);
  assert.strictEqual(step.seen.length, 45);
  assert.strictEqual(new Set(seenInRound).size, 45, 'در یک دور هیچ تکراری نیست');

  step = core.cycleStep({ ...state, n: 20 });
  assert.strictEqual(step.restarted, true);
  assert.strictEqual(step.round, 2);
  assert.strictEqual(step.take.length, 20);
  assert.strictEqual(step.seen.length, 20, 'شمارش دور تازه از صفر شروع می‌شود');

  const stats = core.cycleStats({ pool, queue: step.queue, seen: step.seen, round: step.round });
  assert.deepStrictEqual(stats, { total: 45, seen: 20, left: 25, round: 2 });
});

test('سوال تازه به صف همان دور اضافه می‌شود', () => {
  const pool = Array.from({ length: 10 }, (_, i) => 'x-' + i);
  let step = core.cycleStep({ pool, queue: [], seen: [], round: 1, n: 5 });
  assert.strictEqual(step.take.length, 5);

  const grown = pool.concat(['new-1', 'new-2']);
  step = core.cycleStep({ pool: grown, queue: step.queue, seen: step.seen, round: step.round, n: 20 });
  assert.strictEqual(step.take.length, 7, '۵ سوال باقی‌مانده + ۲ سوال تازه');
  const takeSet = new Set(step.take);
  assert.ok(takeSet.has('new-1') && takeSet.has('new-2'), 'سوال‌های تازه وارد صف شده‌اند');
  assert.strictEqual(new Set([...step.seen, ...step.take]).size, 12);
});

test('سوال حذف‌شده از صف و شمارش کنار گذاشته می‌شود', () => {
  const step = core.cycleStep({ pool: ['a', 'b'], queue: ['a', 'b', 'ghost'], seen: ['ghost2'], round: 1, n: 5 });
  assert.strictEqual(step.take.length, 2);
  assert.strictEqual(step.seen.length, 2);
  assert.deepStrictEqual(step.take.sort(), ['a', 'b']);
});

/* ---------- ثبت اعلان روزانه ---------- */
function fakePlugin({ permission = 'granted', failExact = false } = {}) {
  const calls = { schedule: [], cancel: [], pending: 0, requested: 0 };
  return {
    calls,
    async checkPermissions() { return { display: permission }; },
    async requestPermissions() { calls.requested += 1; return { display: permission }; },
    async cancel(arg) { calls.cancel.push(arg); },
    async schedule(arg) {
      calls.schedule.push(arg);
      if (failExact && calls.schedule.length === 1) throw new Error('exact alarms not permitted');
    },
    async getPending() { calls.pending += 1; return { notifications: [{ id: 4201 }] }; },
  };
}

(async () => {
  await testAsync('روشن‌کردن، زمان‌بندی روزانه را با ساعت درست ثبت می‌کند', async () => {
    const plugin = fakePlugin();
    const res = await core.scheduleDaily(plugin, { on: true, h: 21, m: 15, id: 4201, title: 'برنامهٔ امروز', body: 'ببین' });
    assert.strictEqual(res.status, 'on');
    assert.strictEqual(res.scheduled, true);
    assert.strictEqual(res.pendingId, true, 'زمان‌بندی از سیستم تأیید گرفته شده');
    assert.strictEqual(plugin.calls.cancel.length, 1, 'زمان‌بندی قبلی لغو می‌شود');
    const n = plugin.calls.schedule[0].notifications[0];
    assert.strictEqual(n.id, 4201);
    assert.deepStrictEqual(n.schedule.on, { hour: 21, minute: 15 });
    assert.strictEqual(n.schedule.repeats, true);
    assert.strictEqual(n.schedule.allowWhileIdle, true);
    assert.ok(plugin.calls.pending >= 1);
  });

  await testAsync('بدون اجازهٔ اعلان، چیزی ثبت نمی‌شود', async () => {
    const plugin = fakePlugin({ permission: 'denied' });
    const res = await core.scheduleDaily(plugin, { on: true, h: 8, m: 0, id: 4201 });
    assert.strictEqual(res.status, 'denied');
    assert.strictEqual(plugin.calls.schedule.length, 0);
  });

  await testAsync('اگر اعلان دقیق مجاز نباشد، زمان‌بندی معمولی می‌نشیند', async () => {
    const plugin = fakePlugin({ failExact: true });
    const res = await core.scheduleDaily(plugin, { on: true, h: 7, m: 30, id: 4201, title: 't', body: 'b' });
    assert.strictEqual(res.status, 'on');
    assert.strictEqual(plugin.calls.schedule.length, 2);
    assert.strictEqual(plugin.calls.schedule[1].notifications[0].schedule.allowWhileIdle, undefined);
    assert.deepStrictEqual(plugin.calls.schedule[1].notifications[0].schedule.on, { hour: 7, minute: 30 });
  });

  await testAsync('خاموش‌کردن، زمان‌بندی را لغو می‌کند و اعلانی نمی‌گذارد', async () => {
    const plugin = fakePlugin();
    const res = await core.scheduleDaily(plugin, { on: false, h: 7, m: 30, id: 4201 });
    assert.strictEqual(res.status, 'off');
    assert.strictEqual(plugin.calls.cancel.length, 1);
    assert.strictEqual(plugin.calls.schedule.length, 0);
  });

  await testAsync('بدون پلاگین، وضعیت unsupported برمی‌گردد', async () => {
    const res = await core.scheduleDaily(null, { on: true, h: 7, m: 30 });
    assert.strictEqual(res.status, 'unsupported');
  });

  test('تاریخ شمسی درست تبدیل می‌شود', () => {
    assert.deepStrictEqual(core.g2j(2026, 11, 23), { jy: 1405, jm: 9, jd: 2 });
    assert.deepStrictEqual(core.j2g(1406, 2, 16), { gy: 2027, gm: 5, gd: 6 });
  });

  test('روز کنکور ۱۶ اردیبهشت است و فاصله تا آن حساب می‌شود', () => {
    const e = core.examInfo('2026-11-23');
    assert.strictEqual(e.jy, 1406);
    assert.strictEqual(e.iso, '2027-05-06');
    assert.strictEqual(e.totalDays, 165);
    assert.strictEqual(core.examInfo('2027-05-06').jy, 1407, 'از خود ۱۶ اردیبهشت به بعد باید سال بعد باشد');
  });

  test('برنامه روی روزهای باقی‌مانده چیده می‌شود و روز آخر = کنکور', () => {
    const b = core.planSchedule(165, 170);
    assert.strictEqual(b.length, 165);
    assert.deepStrictEqual(b[0], [1]);
    assert.ok(b[b.length - 1].includes(170), 'روز ۱۷۰ برنامه باید روی آخرین روز باشد');
    assert.strictEqual(b.reduce((a, x) => a + x.length, 0), 170, 'هیچ روزی نباید جا بیفتد');
  });

  test('تقویم بلندتر از برنامه: روزهای بدون محتوا خالی می‌مانند', () => {
    const b = core.planSchedule(200, 170);
    assert.strictEqual(b.length, 200);
    assert.strictEqual(b.reduce((a, x) => a + x.length, 0), 170);
    assert.strictEqual(b.filter((x) => !x.length).length, 30);
    assert.deepStrictEqual(b[b.length - 1], [170]);
  });

  console.log('\n' + passed + ' تست موفق' + (process.exitCode ? ' و برخی ناموفق' : ' — همه سبز'));
})();
