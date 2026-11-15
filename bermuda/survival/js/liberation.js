/* BERMUDA SURVIVAL — LIBERATION
   The map's regions are occupied, not endless. Every region has a relay node:
   shoot it down and the garrison counter-attacks for 75 seconds; hold and the
   region is liberated and saved. Noise raises island heat, heat makes the
   garrison heavier. No new content, one loop with a beginning and an end. */
window.LIB = (function () {
  'use strict';

  var PHASE = { IDLE: 'idle', INFILTRATE: 'infiltrate', DEFENSE: 'defense', FREE: 'liberated' };

  var S = {
    phase: PHASE.INFILTRATE,
    region: null,
    key: 'world',
    node: { x: 0, y: 0, r: 30, hp: 0, maxHp: 620, alive: true },
    timer: 0,
    heat: 0,
    pulse: 0,
    tick: 0,
    spawn: null,
    toast: null,
    particles: null,
    sfx: null,
    saved: false
  };

  var DEFENSE_SECONDS = 75;

  function init(o) {
    o = o || {};
    S.spawn = o.spawn || null;
    S.toast = o.toast || function () {};
    S.particles = o.particles || function () {};
    S.sfx = o.sfx || null;
    S.region = o.region || null;
    S.key = (S.region && (S.region.id || S.region.type || S.region.kind)) || 'world';
  }

  function start() {
    var S2 = (window.SCENE && window.SCENE.S) || 1.6;
    var kind = (S.region && S.region.kind) || 'jungle';
    var campy = kind === 'camp' || kind === 'outpost' || kind === 'town' || kind === 'depot' ||
      kind === 'airstrip' || kind === 'village' || kind === 'beach';
    if (campy) { S.node.x = 300 * S2; S.node.y = 655 * S2; }
    else { S.node.x = 1205 * S2; S.node.y = 425 * S2; }
    S.node.hp = S.node.maxHp;
    S.node.alive = true;

    var savedState = (window.SAVE && SAVE.get('lib:' + S.key, null)) || null;
    S.saved = !!(savedState && savedState.liberated);
    S.heat = (window.SAVE && SAVE.get('heat:' + S.key, 0)) || 0;
    S.phase = S.saved ? PHASE.FREE : PHASE.INFILTRATE;
    S.timer = 0;
    return S.phase;
  }

  function active() { return S.phase === PHASE.INFILTRATE || S.phase === PHASE.DEFENSE; }
  function controlsWaves() { return S.phase === PHASE.DEFENSE; }

  function hitTest(x, y) {
    if (S.phase !== PHASE.INFILTRATE) return false;
    return Math.hypot(x - S.node.x, y - S.node.y) < S.node.r + 6;
  }

  function hitNode(dmg) {
    if (S.phase !== PHASE.INFILTRATE) return;
    S.node.hp -= dmg;
    if (S.particles) S.particles(S.node.x, S.node.y, 4, '#b06bff', 120, 0.3);
    if (S.sfx && S.sfx.hit) S.sfx.hit(S.node.x, S.node.y);
    if (S.node.hp <= 0) breach();
  }

  function breach() {
    S.node.hp = 0;
    S.node.alive = false;
    S.phase = PHASE.DEFENSE;
    S.timer = DEFENSE_SECONDS;
    S.pulse = 2.2;
    noise(14);
    if (S.sfx && S.sfx.wave) S.sfx.wave();
    if (S.toast) S.toast('گرهٔ رله شکست — از منطقه دفاع کن!');
  }

  function liberate() {
    S.phase = PHASE.FREE;
    S.timer = 0;
    if (window.SAVE) {
      SAVE.set('lib:' + S.key, { liberated: true, at: Date.now() });
      SAVE.set('heat:' + S.key, Math.round(S.heat * 0.35));
      var n = SAVE.get('liberatedCount', 0) + 1;
      SAVE.set('liberatedCount', n);
    }
    if (S.toast) S.toast('منطقه آزاد شد — اسپاون دشمن قطع شد');
  }

  /* noise: every shot, kill and explosion raises island heat */
  function noise(amount) {
    S.heat = Math.min(100, S.heat + amount);
  }

  function heatMul() { return 1 + S.heat / 110; }

  function update(dt) {
    if (S.phase === PHASE.DEFENSE) {
      S.timer -= dt;
      S.pulse -= dt;
      // defence waves: a steady pressure that grows a little with heat
      S.tick += dt;
      var every = Math.max(4.5, 8.5 - S.heat / 22);
      if (S.tick >= every) {
        S.tick = 0;
        if (S.spawn) {
          var n = Math.round(2 + S.heat / 34);
          for (var i = 0; i < n; i++) {
            var a = Math.random() * 6.2832;
            var rr = 120 + Math.random() * 130;
            S.spawn('runner', S.node.x + Math.cos(a) * rr, S.node.y + Math.sin(a) * rr, Math.random() < 0.16);
          }
        }
      }
      if (S.timer <= 0) liberate();
      S.heat = Math.max(0, S.heat - dt * 1.2);
      return;
    }
    if (S.phase === PHASE.INFILTRATE) {
      S.heat = Math.max(0, S.heat - dt * 0.55);
    }
  }

  /* the relay: a crystal mast with an hp arc while it still stands */
  function draw(ctx) {
    var n = S.node;
    if (S.phase === PHASE.FREE) return;
    ctx.save();
    ctx.translate(n.x, n.y);
    var t = performance.now() * 0.001;

    // ground scar
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#2a0d3a';
    ctx.beginPath(); ctx.ellipse(0, 4, 34, 16, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;

    if (n.alive) {
      // mast
      ctx.fillStyle = '#241033';
      ctx.beginPath();
      ctx.moveTo(-9, 2); ctx.lineTo(0, -46); ctx.lineTo(9, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6d3ba8';
      ctx.beginPath();
      ctx.moveTo(-5, 0); ctx.lineTo(0, -40); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
      // crystal core
      var glow = 0.55 + Math.sin(t * 3) * 0.2;
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#c37dff';
      ctx.beginPath(); ctx.ellipse(0, -30, 7, 10, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      // hp arc
      var pct = Math.max(0, n.hp / n.maxHp);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(12,8,18,.75)';
      ctx.beginPath(); ctx.arc(0, -56, 15, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = pct > 0.5 ? '#b06bff' : pct > 0.22 ? '#ffcc55' : '#ff5b6e';
      ctx.beginPath(); ctx.arc(0, -56, 15, -1.5708, -1.5708 + 6.2832 * pct); ctx.stroke();
    } else {
      // wreck
      ctx.fillStyle = '#1a1022';
      ctx.beginPath();
      ctx.moveTo(-14, 2); ctx.lineTo(-2, -22); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill();
    }

    if (S.phase === PHASE.DEFENSE) {
      // siege ring: shrinks as the timer runs out
      var p = Math.max(0, S.timer / DEFENSE_SECONDS);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,110,90,.28)';
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = '#ff8a5b';
      ctx.beginPath(); ctx.arc(0, 0, 52, -1.5708, -1.5708 + 6.2832 * p); ctx.stroke();
    }
    ctx.restore();
  }

  function hudText() {
    if (S.phase === PHASE.FREE) return 'منطقه آزاد است — گشت‌ها قطع شدند';
    if (S.phase === PHASE.DEFENSE) {
      return 'DEFENSE — ' + Math.ceil(S.timer) + 's · گره را نگه دار';
    }
    var pct = Math.round(Math.max(0, S.node.hp) / S.node.maxHp * 100);
    return 'گرهٔ رله را نابود کن (' + pct + '%) · گرما ' + Math.round(S.heat);
  }

  return {
    PHASE: PHASE, init: init, start: start, update: update, draw: draw,
    hitTest: hitTest, hitNode: hitNode, noise: noise, heatMul: heatMul,
    active: active, controlsWaves: controlsWaves,
    hudText: hudText,
    phase: function () { return S.phase; },
    heat: function () { return S.heat; },
    node: function () { return S.node; },
    onDeath: function () {
      if (S.phase === PHASE.DEFENSE) {
        S.phase = PHASE.INFILTRATE;
        S.node.alive = true;
        S.node.hp = Math.round(S.node.maxHp * 0.35);
        if (S.toast) S.toast('دفاع شکست خورد — گره آسیب دیده اما سرجایش است');
      }
      if (window.SAVE) SAVE.set('heat:' + S.key, Math.round(S.heat));
    }
  };
})();
