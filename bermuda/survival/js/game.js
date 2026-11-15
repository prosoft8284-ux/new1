/* BERMUDA SURVIVAL — preview scene loop, AI, input */
(function () {
  'use strict';

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var dpr = 1, vw = 0, vh = 0, zoom = 2.2;

  var cam = { x: 300, y: 700 };

  /* ---------------- region (map -> scene) ---------------- */
  var REGION = null;
  (function initRegion() {
    var q = new URLSearchParams(location.search);
    var type = q.get('type') || '';
    var name = q.get('name') || '';
    if (window.REGIONS) REGION = REGIONS.forType(type, name);
    if (REGION) REGION.id = q.get('poi') || '';
    if (REGION && window.SCENE && SCENE.configure) SCENE.configure(REGION);
    if (REGION && REGION.name) document.title = 'BERMUDA SURVIVAL — ' + REGION.name;
  })();
  window.addEventListener('error', function (e) {
    try { if (window.SAVE) SAVE.set('lastError', String((e && e.message) || e)); } catch (err) {}
    var t = document.getElementById('toast');
    if (t) { t.textContent = 'خطای اجرا: ' + ((e && e.message) || 'نامشخص'); t.classList.add('show'); }
  });

  var G = {
    running: false, paused: false, over: false, t: 0, last: 0,
    player: null, aliens: [], bullets: [], ebullets: [], parts: [], drops: [],
    wave: 0, kills: 0, waveTimer: 0, nextWave: 2.5, shake: 0, flash: 0, bossSpawned: false,
    hitStop: 0, nums: [], hurtAng: 0, hurtT: 0, touch: false,
    decals: [], salvage: 0, bossAng: 0, weatherT: 0
  };
  var keys = {}, point = { x: 0, y: 0, down: false, active: false };
  var joy = { active: false, dx: 0, dy: 0 };

  var CHARS = [
    { key: 'wanderer', name: 'روح سرگردان', cls: 'سریع و ماهر در قدرت‌های ذهنی', spd: 128, hp: 100, dmg: 20, rate: 0.15,
      ab: { name: 'جهش سایه', desc: 'تلپورت به سمت نشانه + لحظه‌ای نامیرا', cd: 5.5, icon: '⇢' } },
    { key: 'warrior', name: 'جنگجو', cls: 'مقاوم و قدرتمند', spd: 108, hp: 145, dmg: 26, rate: 0.20,
      ab: { name: 'کوبش زمین', desc: 'موج ضربه در شعاع ۱۶۰ و پرت کردن دشمن‌ها', cd: 8, icon: '⤓' } },
    { key: 'mutant', name: 'جهش‌یافته', cls: 'DNA بیگانه و قدرت جهش', spd: 118, hp: 120, dmg: 22, rate: 0.17,
      ab: { name: 'بازسازی', desc: '۴۵ جان ترمیم + سرعت بیشتر برای ۵ ثانیه', cd: 11, icon: '✚' } },
    { key: 'tech', name: 'متخصص فناوری', cls: 'کنترل فناوری‌های پیشرفته', spd: 112, hp: 95, dmg: 24, rate: 0.13,
      ab: { name: 'پالس EMP', desc: 'فلج کردن همه‌ی بیگانه‌های نزدیک برای ۲.۵ ثانیه', cd: 9.5, icon: '⚡' } },
    { key: 'ronin', name: 'سامورایی فضایی', cls: 'ترکیب مهارت رزمی و انرژی', spd: 122, hp: 105, dmg: 30, rate: 0.22,
      ab: { name: 'ضربه‌ی انرژی', desc: 'قوس برنده در مقابل، ۸۰ آسیب به همه‌ی دشمنان', cd: 7, icon: '⚔' } },
    { key: 'drifter', name: 'مسافر تنها', cls: 'سازگار در شرایط سخت', spd: 116, hp: 130, dmg: 19, rate: 0.16,
      ab: { name: 'دود پنهان', desc: '۳ ثانیه نامرئی و سریع‌تر — بیگانه‌ها گیج می‌شوند', cd: 10, icon: '☁' } }
  ];

  /* ---------------- arsenal ---------------- */
  var WEAPONS = [
    { key: 'pistol', name: 'پیستول دریایی', dmg: 22, rate: 0.16, mag: 24, reserve: 120, maxRes: 160, spread: 0.02, pellets: 1, speed: 780, reload: 1.0, shake: 1.3, color: '#ffd479', pierce: 0, auto: false },
    { key: 'rifle', name: 'تفنگ تهاجمی', dmg: 15, rate: 0.075, mag: 30, reserve: 180, maxRes: 240, spread: 0.055, pellets: 1, speed: 940, reload: 1.4, shake: 1.0, color: '#ffe39a', pierce: 0, auto: true },
    { key: 'shotgun', name: 'شاتگان ساحلی', dmg: 12, rate: 0.66, mag: 6, reserve: 42, maxRes: 60, spread: 0.16, pellets: 6, speed: 680, reload: 1.9, shake: 3.6, color: '#ffc46b', pierce: 0, auto: false },
    { key: 'plasma', name: 'تفنگ پلاسما', dmg: 36, rate: 0.4, mag: 8, reserve: 48, maxRes: 64, spread: 0.012, pellets: 1, speed: 1040, reload: 1.7, shake: 2.0, color: '#9bf6ff', pierce: 2, auto: true }
  ];
  var W_BY = {};
  WEAPONS.forEach(function (w, i) { w.idx = i; W_BY[w.key] = w; });

  /* ---------------- sizing ---------------- */
  function resize() {
    var q = window.META ? META.quality() : 'high';
    dpr = Math.min(q === 'low' ? 1 : 1.75, window.devicePixelRatio || 1);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    zoom = vw < 700 ? 1.55 : 1.95;
  }
  addEventListener('resize', resize);

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  var hapticLast = 0;
  function haptic(ms) {
    if (!navigator.vibrate) return;
    var now = performance.now();
    if (now - hapticLast < 60) return;
    hapticLast = now;
    try { navigator.vibrate(ms); } catch (e) {}
  }

  /* one small canvas per colour instead of a radial gradient every frame */
  var glowCache = {};
  function glow(col, r) {
    var key = col + '|' + r;
    if (glowCache[key]) return glowCache[key];
    var c2 = document.createElement('canvas');
    c2.width = c2.height = r * 2;
    var g2 = c2.getContext('2d');
    var grd = g2.createRadialGradient(r, r, 1, r, r, r);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.beginPath(); g2.arc(r, r, r, 0, 6.2832); g2.fill();
    glowCache[key] = c2;
    return c2;
  }

  function addDecal(x, y, kind, color) {
    G.decals.push({ x: x, y: y, kind: kind, color: color || '#7a1020', life: 26, max: 26, r: 6 + Math.random() * 9 });
    if (G.decals.length > 90) G.decals.shift();
  }

  function spawnParticles(x, y, n, color, spd, life) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, s = rand(spd * 0.3, spd);
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life, max: life, color: color, r: rand(1.2, 3)
      });
    }
  }

  function addAlien(type, x, y, elite) {
    var d = PIX.ALIENS[type];
    if (window.SCENE && SCENE.safeSpawn) { var sp = SCENE.safeSpawn(x, y); x = sp.x; y = sp.y; }
    var hp = Math.round(d.hp * (elite ? 2 : 1));
    G.aliens.push({
      type: type, def: d, x: x, y: y, hp: hp, maxHp: hp,
      vx: 0, vy: 0, cd: rand(0.4, 1.6), hurt: 0, r: d.r * (elite ? 1.15 : 1),
      face: 1, phase: Math.random() * 6.28, state: 'chase', dash: 0,
      elite: !!elite, wind: 0, charge: 0, aimAng: 0, fuse: 0
    });
  }

  /* ---------------- loot ---------------- */
  function addDrop(kind, x, y, wkey) {
    var a = Math.random() * 6.2832, s = rand(30, 95);
    G.drops.push({
      kind: kind, w: wkey, x: x, y: y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: 0, life: kind === 'weapon' ? 999 : 30, bob: Math.random() * 6.28
    });
  }

  function dropLoot(al) {
    var cx = al.x, cy = al.y;
    if (al.def.boss) {
      addDrop('weapon', cx, cy - 6, 'plasma');
      addDrop('med', cx - 16, cy + 6); addDrop('ammo', cx + 16, cy + 6);
      return;
    }
    if (al.elite) {
      if (Math.random() < 0.5) addDrop('weapon', cx, cy, Math.random() < 0.5 ? 'shotgun' : 'plasma');
      else addDrop('med', cx, cy);
      addDrop('ammo', cx, cy);
      return;
    }
    var r = Math.random();
    if (r < 0.3) addDrop('ammo', cx, cy);
    else if (r < 0.42) addDrop('med', cx, cy);
  }

  function explode(a) {
    var R = a.type === 'mother' ? 110 : 78;
    SFX.explosion(a.x, a.y, a.type === 'mother');
    spawnParticles(a.x, a.y, 26, '#ffb03a', 240, 0.55);
    spawnParticles(a.x, a.y, 12, '#fff0c0', 140, 0.35);
    G.shake = Math.min(10, G.shake + 6);
    G.flash = Math.max(G.flash, 0.25);
    var p = G.player;
    if (p && dist(a, p) < R) hurtPlayer(a.def.dmg, a.x, a.y);
  }

  /* one entrance of this region, jittered so a squad does not spawn in a line */
  function entrancePoint() {
    var ring = (window.SCENE && SCENE.spawnPoints) ? SCENE.spawnPoints() : [];
    if (!ring.length) {
      var lib = window.LIB ? LIB.node() : null;
      return { x: (lib ? lib.x : 1205 * SCENE.S) + rand(-90, 90), y: (lib ? lib.y : 425 * SCENE.S) + rand(-90, 90) };
    }
    var q = ring[(Math.random() * ring.length) | 0];
    return { x: q.x + rand(-46, 46), y: q.y + rand(-34, 34) };
  }

  function spawnWave() {
    G.wave++;
    // difficulty ramp: early waves are readable, late waves are pressure
    var heat = window.LIB ? LIB.heatMul() : 1;
    var base = 2 + Math.floor(G.wave * 1.45);
    var n = Math.min(15, Math.round(base * heat));
    var km = window.KITMETA ? KITMETA.forRegion(REGION) : null;
    var pool = (km ? km.enemies.slice() : ['parasite', 'runner', 'skitter']);
    if (G.wave >= 2) pool = pool.concat(['winged', 'bomber']);
    if (G.wave >= 3) pool = pool.concat(['warrior', 'neural']);
    if (G.wave >= 4) pool = pool.concat(['warlock', 'mutant', 'brute']);
    // role squads: a shield up front, a caster behind, a bomber to flush you out
    if (G.wave >= 2 && n >= 4 && Math.random() < 0.55) {
      var sq = entrancePoint();
      var squad = ['brute', 'neural', 'bomber'];
      for (var si = 0; si < squad.length; si++) {
        addAlien(squad[si], sq.x + rand(-26, 26), sq.y + rand(-22, 22), si === 0 && Math.random() < 0.25);
      }
      n -= 3;
    }
    var eliteChance = Math.min(0.22, 0.04 + G.wave * 0.018);
    for (var i = 0; i < n; i++) {
      var ep = entrancePoint();
      var t = pool[(Math.random() * pool.length) | 0];
      addAlien(t, ep.x, ep.y, Math.random() < eliteChance);
      if (t === 'skitter') {
        addAlien('skitter', ep.x + rand(-22, 22), ep.y + rand(-16, 16));
        addAlien('skitter', ep.x + rand(-22, 22), ep.y + rand(-16, 16));
      }
    }
    if (G.wave >= 3 && !G.bossSpawned) {
      G.bossSpawned = true;
      setTimeout(function () {
        if (!G.player || G.over) return;
        var bp = entrancePoint();
        var m = G.aliens.length;
        addAlien('mother', bp.x, bp.y);
        if (G.aliens[m]) { G.aliens[m].phaseT = 0; G.aliens[m].mode = 'walk'; }
        toast('موجود مادر از راه رسید!');
      }, 4000);
    }
    SFX.wave();
    toast('موج ' + G.wave + ' از راه رسید');
    G.nextWave = 24;
  }

  var toastEl = document.getElementById('toast') || document.body.appendChild(document.createElement('div'));
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------------- player ---------------- */
  function makePlayer(def) {
    var arsenal = {};
    WEAPONS.forEach(function (w) {
      arsenal[w.key] = {
        mag: w.mag, reserve: w.reserve,
        unlocked: w.key === 'pistol' || (window.META ? META.isUnlocked(w.key) : (w.key === 'rifle'))
      };
    });
    var bonus = window.META ? META.upgradeBonus() : { dmg: 1, hp: 0, spd: 1 };
    var start = 'pistol';
    if (window.META && META.isUnlocked('rifle')) start = 'rifle';
    return {
      def: def, x: 1010 * SCENE.S, y: 566 * SCENE.S, vx: 0, vy: 0,
      hp: def.hp + bonus.hp, maxHp: def.hp + bonus.hp, speed: def.spd * bonus.spd,
      aim: 0, face: 1, cur: start, arsenal: arsenal, reloading: 0,
      fireCd: 0, dodge: 0, dodgeCd: 0, hurt: 0, moving: 0, inCover: false, anim: 0,
      knockX: 0, knockY: 0, dmgMul: (def.dmg / 22) * bonus.dmg,
      abCd: 0, abT: 0, invis: 0, buff: 0, step: 0, abWas: 0,
      sprite: PIX.SURVIVORS[def.key], radius: 13, aiming: false
    };
  }
  function curW(p) { return W_BY[p.cur]; }
  function curA(p) { return p.arsenal[p.cur]; }

  /* ---------------- input ---------------- */
  addEventListener('keydown', function (e) {
    SFX.unlock();
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'm') { SFX.toggle(); syncMute(); }
    if (e.key === 'Escape') togglePause();
    if (e.key === 'r') startReload();
    if (e.key >= '1' && e.key <= '4') { var wk = WEAPONS[+e.key - 1]; if (wk) setWeapon(wk.key); }
    if (e.key.toLowerCase() === 'q') cycleWeapon(1);
    if (e.key.toLowerCase() === 'e') ability();
  });
  addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

  cv.addEventListener('pointerdown', function (e) {
    SFX.unlock();
    point.down = true; point.active = true;
    point.x = e.clientX; point.y = e.clientY;
  });
  addEventListener('pointermove', function (e) {
    point.x = e.clientX; point.y = e.clientY;
  });
  addEventListener('pointerup', function () { point.down = false; });

  /* touch joystick */
  var joyEl = document.getElementById('joystick');
  var joyKnob = joyEl.querySelector('i');
  var joyId = null;
  joyEl.addEventListener('pointerdown', function (e) {
    joyId = e.pointerId; joy.active = true; joyEl.setPointerCapture(e.pointerId);
  });
  joyEl.addEventListener('pointermove', function (e) {
    if (e.pointerId !== joyId) return;
    var r = joyEl.getBoundingClientRect();
    var dx = e.clientX - (r.left + r.width / 2);
    var dy = e.clientY - (r.top + r.height / 2);
    var len = Math.hypot(dx, dy) || 1;
    var max = r.width / 2 - 10;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    joy.dx = dx / max; joy.dy = dy / max;
    joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  });
  function joyEnd() {
    joy.active = false; joy.dx = joy.dy = 0; joyId = null;
    joyKnob.style.transform = 'translate(0,0)';
  }
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  /* ---------------- combat ---------------- */
  function startReload() {
    var p = G.player;
    if (!p || p.reloading > 0) return;
    var w = curW(p), st = curA(p);
    if (st.mag >= w.mag || st.reserve <= 0) return;
    p.reloading = w.reload;
    SFX.reload();
    document.getElementById('reloadTxt').textContent = 'خشاب‌گذاری…';
  }

  function setWeapon(key) {
    var p = G.player;
    if (!p || !W_BY[key]) return;
    if (!p.arsenal[key] || !p.arsenal[key].unlocked || p.cur === key) return;
    p.cur = key; p.reloading = 0; p.fireCd = 0.2;
    SFX.equip();
    document.getElementById('reloadTxt').textContent = '';
    updateWeaponHud();
    toast(W_BY[key].name + ' در دست');
  }

  function cycleWeapon(dir) {
    var p = G.player;
    if (!p) return;
    var n = WEAPONS.length;
    for (var i = 1; i <= n; i++) {
      var w = WEAPONS[(curW(p).idx + dir * i + n * 4) % n];
      if (p.arsenal[w.key].unlocked) { setWeapon(w.key); return; }
    }
  }

  function shoot() {
    var p = G.player;
    if (!p || p.reloading > 0 || p.fireCd > 0) return;
    var w = curW(p), st = curA(p);
    if (st.mag <= 0) { SFX.empty(); startReload(); return; }
    st.mag--; p.fireCd = w.rate;

    for (var i = 0; i < w.pellets; i++) {
      var a = p.aim + (Math.random() - 0.5) * w.spread * 2 * (p.aiming ? 0.45 : 1);
      if (w.pellets > 1) a += (i - (w.pellets - 1) / 2) * 0.05;
      var sp = w.speed * rand(0.94, 1.06);
      if (window.LIB) LIB.noise(1.2);
      G.bullets.push({
        x: p.x + Math.cos(p.aim) * 18, y: p.y - 8 + Math.sin(p.aim) * 18,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: w.key === 'shotgun' ? 0.42 : 0.8,
        dmg: w.dmg * p.dmgMul * (Math.random() < 0.12 ? 1.6 : 1),
        pierce: w.pierce, hit: [], kind: w.key, color: w.color
      });
    }
    SFX.shot(w.key);
    haptic(w.key === 'shotgun' ? 18 : 8);
    spawnParticles(p.x + Math.cos(p.aim) * 22, p.y - 8 + Math.sin(p.aim) * 22,
      w.pellets > 1 ? 8 : 4, w.color, 190, 0.16);
    G.shake = Math.min(8, G.shake + w.shake);
    // recoil
    p.knockX -= Math.cos(p.aim) * (w.key === 'shotgun' ? 110 : w.key === 'plasma' ? 60 : 18);
    p.knockY -= Math.sin(p.aim) * (w.key === 'shotgun' ? 110 : w.key === 'plasma' ? 60 : 18);
  }

  /* ---------------- character special abilities ---------------- */
  function ability() {
    var p = G.player;
    if (!p || G.over || p.abCd > 0) return;
    var key = p.def.key, fx, i, a, d;
    p.abCd = p.def.ab.cd;
    p.abT = 0.55;
    SFX.ability(key);

    if (key === 'wanderer') {
      var tx = p.x + Math.cos(p.aim) * 190, ty = p.y + Math.sin(p.aim) * 190;
      tx = clamp(tx, 30, SCENE.W - 30); ty = clamp(ty, 40, SCENE.H - 40);
      if (!SCENE.blocked(tx, ty)) {
        spawnParticles(p.x, p.y, 16, '#c69bff', 210, 0.45);
        p.x = tx; p.y = ty; p.inv = 0.35; p.hurt = Math.max(p.hurt, 0.2);
        spawnParticles(p.x, p.y, 14, '#e7d4ff', 170, 0.4);
        G.shake = Math.min(8, G.shake + 2);
      } else {
        p.abCd = 1.2;
      }
    } else if (key === 'warrior') {
      var R = 165;
      for (i = G.aliens.length - 1; i >= 0; i--) {
        a = G.aliens[i];
        d = dist(a, p);
        if (d < R) {
          a.hp -= 55; a.hurt = 0.2;
          var ang = Math.atan2(a.y - p.y, a.x - p.x);
          a.x += Math.cos(ang) * 42; a.y += Math.sin(ang) * 42;
          if (a.hp <= 0) { killAlien(i); }
        }
      }
      spawnParticles(p.x, p.y, 34, '#ffd9a0', 320, 0.55);
      spawnParticles(p.x, p.y, 16, '#ff8a5b', 220, 0.4);
      for (i = 0; i < 14; i++) {
        var ra = (i / 14) * 6.2832;
        spawnParticles(p.x + Math.cos(ra) * 40, p.y + Math.sin(ra) * 26, 2, '#e0b070', 120, 0.5);
      }
      G.shake = Math.min(12, G.shake + 9);
      G.flash = Math.max(G.flash, 0.22);
    } else if (key === 'mutant') {
      p.hp = Math.min(p.maxHp, p.hp + 45);
      p.buff = 5;
      spawnParticles(p.x, p.y, 22, '#a8ff9c', 150, 0.6);
      toast('بازسازی +۴۵ جان · سرعت بیشتر');
    } else if (key === 'tech') {
      var ER = 290;
      for (i = 0; i < G.aliens.length; i++) {
        a = G.aliens[i];
        if (dist(a, p) < ER) { a.stun = 2.5; a.hp -= 18; a.hurt = 0.2; }
      }
      G.ebullets.length = 0;
      for (i = 0; i < 3; i++) spawnParticles(p.x, p.y, 12, '#64e0ff', 260 + i * 60, 0.45 + i * 0.1);
      G.flash = Math.max(G.flash, 0.3);
      G.shake = Math.min(8, G.shake + 3);
      toast('EMP — بیگانه‌ها فلج شدند');
    } else if (key === 'ronin') {
      var CR = 205, ca = Math.cos(p.aim), sa2 = Math.sin(p.aim);
      for (i = G.aliens.length - 1; i >= 0; i--) {
        a = G.aliens[i];
        var dx2 = a.x - p.x, dy2 = a.y - p.y, dl = Math.hypot(dx2, dy2) || 1;
        if (dl > CR + a.r) continue;
        var dot = (dx2 / dl) * ca + (dy2 / dl) * sa2;
        if (dot < 0.45) continue;                 // ~±63° cone
        a.hp -= 80; a.hurt = 0.25;
        if (a.hp <= 0) { killAlien(i); }
      }
      // slash arc particles
      for (i = 0; i < 22; i++) {
        var fa2 = p.aim - 1.0 + (i / 21) * 2.0, rr2 = 60 + Math.random() * CR;
        spawnParticles(p.x + Math.cos(fa2) * rr2, p.y - 10 + Math.sin(fa2) * rr2 * 0.6, 1, '#ffd479', 40, 0.35);
      }
      G.shake = Math.min(9, G.shake + 4);
    } else if (key === 'drifter') {
      p.invis = 3;
      p.buff = 3;
      spawnParticles(p.x, p.y, 28, '#9fb0b8', 90, 0.9);
      toast('دود پنهان — ۳ ثانیه');
    }
    updateAbilityHud();
  }

  function damageProp(prop, dmg, x, y) {
    if (!prop || (prop.kind !== 'crate' && prop.kind !== 'sandbag')) return false;
    prop.hp = (prop.hp == null ? 36 : prop.hp) - dmg;
    spawnParticles(x, y, 4, '#cbb08a', 120, 0.3);
    if (prop.hp > 0) return true;
    var arr = SCENE.props, i = arr.indexOf(prop);
    if (i >= 0) arr.splice(i, 1);
    addDecal(prop.x, prop.y, 'debris', '#8a7a5a');
    spawnParticles(prop.x, prop.y, 12, '#b59a6c', 170, 0.45);
    if (Math.random() < 0.6) addDrop('ammo', prop.x, prop.y);
    SFX.hit(prop.x, prop.y);
    return true;
  }

  function killAlien(idx) {
    if (window.LIB) LIB.noise(6);
    var earned = 1;
    G.hitStop = Math.max(G.hitStop, 0.055);
    var a = G.aliens[idx];
    if (!a) return;
    if (a.def.boss) earned = 30; else if (a.elite) earned = 5;
    G.salvage += earned;
    if (window.META) META.addSalvage(earned);
    addDecal(a.x, a.y + 4, 'blood', a.def.color);
    haptic(a.def.boss ? 60 : 18);
    SFX.kill(a.x, a.y);
    spawnParticles(a.x, a.y, a.elite ? 26 : 16, a.def.color, 190, 0.55);
    if (a.def.suicide) explode(a);
    dropLoot(a);
    G.aliens.splice(idx, 1);
    G.kills++;
    G.shake = Math.min(8, G.shake + (a.def.boss ? 8 : 1.6));
  }

  function pickUp(d) {
    var p = G.player;
    if (!p) return;
    if (d.kind === 'ammo') {
      var w = curW(p), st = curA(p);
      var add = Math.max(6, Math.round(w.mag * 0.8));
      st.reserve = Math.min(w.maxRes, st.reserve + add);
      SFX.pickup('ammo');
      spawnParticles(d.x, d.y, 8, '#8bff9a', 90, 0.3);
      toast('مهمات +' + fa(add) + ' — ' + w.name);
      updateWeaponHud();
    } else if (d.kind === 'med') {
      p.hp = Math.min(p.maxHp, p.hp + 28);
      SFX.pickup('med');
      spawnParticles(d.x, d.y, 10, '#ff8fa8', 90, 0.35);
      toast('بسته‌ی درمان +۲۸');
    } else if (d.kind === 'weapon') {
      var ww = W_BY[d.w], stw = p.arsenal[d.w];
      var first = !stw.unlocked;
      stw.unlocked = true;
      stw.mag = ww.mag;
      stw.reserve = Math.min(ww.maxRes, Math.max(stw.reserve, ww.reserve));
      if (first || p.cur !== d.w) { p.cur = d.w; p.reloading = 0; p.fireCd = 0.2; }
      SFX.pickup('weapon');
      spawnParticles(d.x, d.y, 14, ww.color, 130, 0.45);
      toast((first ? 'سلاح جدید: ' : '') + ww.name);
      updateWeaponHud();
      buildSlots();
    }
  }

  function hurtPlayer(dmg, sx, sy) {
    var p = G.player;
    if (!p || p.hurt > 0 || p.dodge > 0 || p.inv > 0) return;
    if (G.god) return;                       // ?god=1 — screenshot / demo mode
    p.hp -= dmg; p.hurt = 0.32; G.flash = 0.5; G.shake = 7;
    if (sx != null && sy != null) { G.hurtAng = Math.atan2(sy - p.y, sx - p.x); G.hurtT = 0.95; }
    G.nums.push({ x: p.x + rand(-4, 4), y: p.y - 30, txt: '-' + Math.round(dmg),
      life: 0.7, max: 0.7, color: '#ff7b8b' });
    SFX.hurt();
    if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) {} }
    if (p.hp <= 0) { p.hp = 0; die(); }
  }

  /* ---------------- update ---------------- */
  var wasFire = false;
  function update(dt) {
    var p = G.player;
    if (!p) return;
    if (G.hitStop > 0) { G.hitStop = Math.max(0, G.hitStop - dt); dt *= 0.15; }
    G.hurtT = Math.max(0, G.hurtT - dt);
    for (var ni = G.nums.length - 1; ni >= 0; ni--) {
      var nm = G.nums[ni];
      nm.y -= 26 * dt; nm.life -= dt;
      if (nm.life <= 0) G.nums.splice(ni, 1);
    }
    G.t += dt;
    SFX.listener(p.x, p.y);

    // aim
    var camScreenX = (p.x - cam.x) * zoom + vw / 2;
    var camScreenY = (p.y - cam.y) * zoom + vh / 2;
    if (aimStick.active && aimStick.len > 12) {
      p.aim = Math.atan2(aimStick.dy, aimStick.dx);
    } else if (point.active && !joy.active) {
      p.aim = Math.atan2((point.y - camScreenY) / zoom, (point.x - camScreenX) / zoom);
    } else {
      var best = null, bd = 1e9;
      for (var i = 0; i < G.aliens.length; i++) {
        var al = G.aliens[i], d = dist(al, p);
        if (d < 420 && d < bd) { bd = d; best = al; }
      }
      if (best) p.aim = Math.atan2(best.y - p.y, best.x - p.x);
    }
    if (!(aimStick.active && aimStick.len > 12) && (G.touch || joy.active) && G.aliens.length) {
      var aBest = null, aDist = 1e9, aAng = 0;
      for (var ai = 0; ai < G.aliens.length; ai++) {
        var ao = G.aliens[ai], ad = dist(ao, p);
        if (ad > 300 || ad > aDist) continue;
        var a2 = Math.atan2(ao.y - p.y, ao.x - p.x);
        var diff = Math.abs(((a2 - p.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff < 0.26) { aDist = ad; aBest = ao; aAng = a2; }
      }
      if (aBest) p.aim += (((aAng - p.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.5;
    }
    var stickAiming = aimStick.active && aimStick.len > 12;
    if (Math.cos(p.aim) > 0.15) p.face = 1;
    else if (Math.cos(p.aim) < -0.15) p.face = -1;

    // movement
    var mx = 0, my = 0;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (joy.active) { mx += joy.dx; my += joy.dy; }
    var ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.05 ? 1 : 0;

    // dodge
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    if ((keys['shift'] || keys[' ']) && p.dodgeCd <= 0) {
      var dmx = mx, dmy = my;
      if (ml <= 0.1) { dmx = Math.cos(p.aim); dmy = Math.sin(p.aim); ml = 1; }
      var dl2 = Math.hypot(dmx, dmy) || 1;
      p.dodge = 0.22; p.dodgeCd = 1.4;
      SFX.dodge();
      p.vx = dmx / dl2 * 520; p.vy = dmy / dl2 * 520;
      spawnParticles(p.x, p.y, 8, '#8ff0ff', 90, 0.3);
      haptic(12);
    }
    p.abCd = Math.max(0, p.abCd - dt);
    if (p.abWas > 0 && p.abCd <= 0) { SFX.ready(); toast('توانایی آماده است'); }
    p.abWas = p.abCd;
    p.abT = Math.max(0, p.abT - dt);
    p.invis = Math.max(0, p.invis - dt);
    p.buff = Math.max(0, p.buff - dt);
    p.inv = Math.max(0, (p.inv || 0) - dt);
    p.dodge = Math.max(0, p.dodge - dt);
    if (p.dodge > 0) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.90; p.vy *= 0.90;
    } else {
      var spdMul = p.buff > 0 ? 1.35 : 1;
      var aimMul = (p.aiming && !stickAiming) ? 0.62 : 1;
      var wade = 1;
      if (window.SCENE && SCENE.isKit && !SCENE.isKit() && p.y > SCENE.shoreY(p.x) + 6) {
        wade = 0.72;
        if (ml > 0.2 && Math.random() < 0.12) spawnParticles(p.x, p.y, 1, '#cdf7ff', 40, 0.25);
      }
      p.x += mx * p.speed * spdMul * aimMul * wade * dt;
      p.y += my * p.speed * spdMul * aimMul * wade * dt;
      p.step += (Math.hypot(mx, my) * dt) * 9;
    }
    p.x += p.knockX * dt; p.y += p.knockY * dt;
    p.knockX *= 0.86; p.knockY *= 0.86;
    var beforeX = p.x, beforeY = p.y;
    p.x = clamp(p.x, 30, SCENE.W - 30);
    p.y = clamp(p.y, 40, SCENE.H - 40);
    // slide along walls instead of sticking to them
    if (SCENE.blocked(p.x, p.y)) {
      if (!SCENE.blocked(p.x, beforeY)) p.y = beforeY;
      else if (!SCENE.blocked(beforeX, p.y)) p.x = beforeX;
      else { p.x = beforeX; p.y = beforeY; }
    }
    p.inCover = !!(window.SCENE && SCENE.coverAt && SCENE.coverAt(p.x, p.y));

    // fire
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        var wRel = curW(p), stRel = curA(p);
        var need = wRel.mag - stRel.mag;
        var take = Math.min(need, stRel.reserve);
        stRel.mag += take; stRel.reserve -= take;
        document.getElementById('reloadTxt').textContent = '';
        updateWeaponHud();
        haptic(14);
      }
    }
    var fireNow = point.down || keys['j'] || firePressed;
    p.aiming = !!fireNow;
    if (fireNow && (!wasFire || curW(p).auto || stickAiming)) shoot();
    wasFire = fireNow;

    // aliens
    for (var k = G.aliens.length - 1; k >= 0; k--) {
      var a = G.aliens[k];
      var d = dist(a, p);
      var ang = Math.atan2(p.y - a.y, p.x - a.x);
      if (Math.cos(ang) > 0) a.face = 1; else a.face = -1;
      a.phase += dt * 5;
      a.hurt = Math.max(0, a.hurt - dt);
      a.cd -= dt;
      if (a.stun > 0) a.stun -= dt;

      if (a.stun > 0) {
        if (Math.random() < 0.2) spawnParticles(a.x + rand(-8, 8), a.y - 10 + rand(-6, 6), 1, '#64e0ff', 40, 0.3);
        continue;
      }

      if (a.def.boss) {
        a.phaseT = (a.phaseT || 0) + dt;
        var frac = a.hp / a.maxHp;
        if (a.phaseT > 6.5) {
          a.phaseT = 0;
          if (G.aliens.length < 28) {
            addAlien('parasite', a.x + rand(-44, 44), a.y + rand(-34, 34));
            addAlien('parasite', a.x + rand(-44, 44), a.y + rand(-34, 34));
          }
          SFX.charge(a.x, a.y);
          spawnParticles(a.x, a.y, 12, '#ff6b8a', 140, 0.5);
        }
        if (frac < 0.55 && a.cd <= 0) {
          a.cd = 4.5;
          for (var bi = 0; bi < 10; bi++) {
            var ba = (bi / 10) * 6.2832;
            G.ebullets.push({ x: a.x, y: a.y - 10, vx: Math.cos(ba) * 205, vy: Math.sin(ba) * 205, life: 3.2, dmg: 16 });
          }
          SFX.eShot(a.x, a.y, true);
          G.shake = Math.min(9, G.shake + 3);
        }
      }

      var spd = a.def.speed;
      var tx = 0, ty = 0;

      if (p.invis > 0) {
        // the player vanished in smoke — aliens lose track
        tx = Math.cos(a.phase * 0.31) * 0.3;
        ty = Math.sin(a.phase * 0.43) * 0.3;
        a.cd = Math.max(a.cd, 0.4);
      } else if (a.def.charger) {
        if (a.wind > 0) {
          a.wind -= dt;
          if (a.wind <= 0) a.charge = 0.45;
        } else if (a.charge > 0) {
          a.charge -= dt;
          spd = 335;
          tx = Math.cos(a.aimAng); ty = Math.sin(a.aimAng);
          if (Math.random() < 0.45) spawnParticles(a.x, a.y + 4, 1, '#7a6040', 55, 0.3);
        } else {
          tx = Math.cos(ang); ty = Math.sin(ang);
          if (d < 240 && a.cd <= 0) { a.wind = 0.5; a.aimAng = ang; a.cd = 2.8; SFX.charge(a.x, a.y); }
        }
      } else if (a.def.suicide) {
        if (a.fuse > 0) {
          a.fuse -= dt;
          if (a.fuse <= 0) { explode(a); G.aliens.splice(k, 1); continue; }
        } else {
          tx = Math.cos(ang); ty = Math.sin(ang);
          if (d < 42) { a.fuse = 0.75; SFX.fuse(a.x, a.y); }
        }
      } else if (a.type === 'neural' || a.type === 'warlock') {
        var want = 200;
        var move = d > want + 20 ? 1 : d < want - 40 ? -1 : 0;
        tx = Math.cos(ang) * move; ty = Math.sin(ang) * move;
        if (a.cd <= 0 && d < 380 && !(p.inCover && Math.random() < 0.55)) {
          a.cd = a.type === 'warlock' ? 2.4 : 1.7;
          var shots = a.type === 'warlock' ? 3 : 1;
          for (var s2 = 0; s2 < shots; s2++) {
            var sa = ang + (s2 - (shots - 1) / 2) * 0.22;
            G.ebullets.push({ x: a.x, y: a.y, vx: Math.cos(sa) * 230, vy: Math.sin(sa) * 230, life: 2.6, dmg: a.def.dmg });
            if (s2 === 0) SFX.eShot(a.x, a.y, a.type === 'warlock');
          }
        }
      } else if (d > a.r + 20) {
        tx = Math.cos(ang); ty = Math.sin(ang);
        if (a.type === 'winged') {
          a.dash += dt;
          tx += Math.cos(a.phase * 0.6 + a.type.length) * 0.4;
          ty += Math.sin(a.phase * 0.6) * 0.4;
        }
      } else if (a.cd <= 0) {
        a.cd = 0.9;
        hurtPlayer(a.def.dmg * (p.inCover ? 0.7 : 1), a.x, a.y);
        if (a.type === 'brute' || a.type === 'mutant') { p.knockX += Math.cos(ang) * 190; p.knockY += Math.sin(ang) * 190; }
        spawnParticles(p.x, p.y, 6, '#ff5b6e', 120, 0.3);
      }

      // elite auras
      if (a.elite && Math.random() < 0.25) {
        spawnParticles(a.x + rand(-10, 10), a.y + rand(-6, 6), 1, '#ffd166', 20, 0.5);
      }

      var len = Math.hypot(tx, ty) || 1;
      var nx2 = a.x + (tx / len) * spd * dt, ny2 = a.y + (ty / len) * spd * dt;
      if (!SCENE.blocked(nx2, ny2)) { a.x = nx2; a.y = ny2; }
      else if (!SCENE.blocked(nx2, a.y)) { a.x = nx2; }
      else if (!SCENE.blocked(a.x, ny2)) { a.y = ny2; }
      else if (a.cd <= 0) {
        // cornered: sidestep so the pack does not jam behind a wall
        var sw = (a.phase % 2 < 1 ? 1 : -1);
        var sx2 = a.x + Math.cos(ang + 1.57 * sw) * spd * dt;
        var sy2 = a.y + Math.sin(ang + 1.57 * sw) * spd * dt;
        if (!SCENE.blocked(sx2, sy2)) { a.x = sx2; a.y = sy2; a.cd = 0.5; }
      }
      // separation so they don't stack
      for (var j = 0; j < G.aliens.length; j++) {
        if (j === k) continue;
        var o = G.aliens[j];
        var dd = dist(a, o);
        if (dd < a.r + o.r && dd > 0.01) {
          var push = (a.r + o.r - dd) * 0.5;
          a.x -= ((o.x - a.x) / dd) * push;
          a.y -= ((o.y - a.y) / dd) * push;
        }
      }
      a.x = clamp(a.x, 20, SCENE.W - 20);
      a.y = clamp(a.y, 20, SCENE.H - 20);
    }

    // player bullets
    for (var b = G.bullets.length - 1; b >= 0; b--) {
      var bl = G.bullets[b];
      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
      if (bl.life <= 0) { G.bullets.splice(b, 1); continue; }
      var blocker = (window.SCENE && SCENE.propAt) ? SCENE.propAt(bl.x, bl.y) : null;
      if (blocker) {
        if (damageProp(blocker, bl.dmg, bl.x, bl.y)) { G.bullets.splice(b, 1); continue; }
        spawnParticles(bl.x, bl.y, 4, '#d9d3c2', 110, 0.25);
        addDecal(bl.x, bl.y, 'hole', 'rgba(10,10,12,.45)');
        G.bullets.splice(b, 1);
        continue;
      }
      if (window.LIB && LIB.hitTest(bl.x, bl.y)) {
        LIB.hitNode(bl.dmg);
        spawnParticles(bl.x, bl.y, 6, '#c37dff', 150, 0.3);
        G.bullets.splice(b, 1);
        continue;
      }
      for (var q = 0; q < G.aliens.length; q++) {
        var tgt = G.aliens[q];
        if (bl.hit.indexOf(tgt) >= 0) continue;
        if (Math.hypot(tgt.x - bl.x, tgt.y - bl.y) < tgt.r + 4) {
          tgt.hp -= bl.dmg; tgt.hurt = 0.14;
          G.nums.push({ x: tgt.x + rand(-5, 5), y: tgt.y - tgt.r - 6, txt: Math.round(bl.dmg),
            life: 0.62, max: 0.62, color: tgt.elite ? '#ffd479' : '#ffeec2' });
          SFX.hit(bl.x, bl.y);
          addDecal(bl.x, bl.y, 'blood', tgt.def.color);
          spawnParticles(bl.x, bl.y, 5, bl.color || tgt.def.color, 130, 0.28);
          bl.hit.push(tgt);
          if (tgt.hp <= 0) killAlien(q);
          if (bl.pierce > 0) { bl.pierce--; bl.dmg *= 0.8; }
          else { G.bullets.splice(b, 1); }
          break;
        }
      }
    }

    // enemy bullets
    for (var eb = G.ebullets.length - 1; eb >= 0; eb--) {
      var e = G.ebullets[eb];
      e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
      if (e.life <= 0) { G.ebullets.splice(eb, 1); continue; }
      if (window.SCENE && SCENE.propAt) {
        var ebp = SCENE.propAt(e.x, e.y);
        if (ebp && ebp.kind !== 'crate' && ebp.kind !== 'sandbag') { G.ebullets.splice(eb, 1); continue; }
      }
      if (Math.hypot(p.x - e.x, p.y - e.y) < 16) {
        SFX.hit(e.x, e.y);
        hurtPlayer(e.dmg, e.x, e.y);
        G.ebullets.splice(eb, 1);
      }
    }

    // particles
    for (var pi = G.parts.length - 1; pi >= 0; pi--) {
      var pt = G.parts[pi];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) G.parts.splice(pi, 1);
    }

    // loot drops
    for (var di = G.drops.length - 1; di >= 0; di--) {
      var dr = G.drops[di];
      dr.t += dt; dr.life -= dt;
      if (dr.life <= 0) { G.drops.splice(di, 1); continue; }
      dr.x += dr.vx * dt; dr.y += dr.vy * dt;
      dr.vx *= 0.90; dr.vy *= 0.90;
      var dd = dist(dr, p) || 0.01;
      if (dd < 100 && dr.t > 0.3) {
        var pull = (1 - dd / 100) * 340;
        dr.x += ((p.x - dr.x) / dd) * pull * dt;
        dr.y += ((p.y - dr.y) / dd) * pull * dt;
      }
      if (dd < 22 && dr.t > 0.25) { pickUp(dr); G.drops.splice(di, 1); }
    }

    // waves — the liberation loop takes over while the relay is under siege
    if (window.LIB) LIB.update(dt);
    G.nextWave -= dt;
    var liberatedHere = !!(window.LIB && LIB.phase() === 'liberated');
    var maxAlive = Math.min(30, 14 + G.wave);
    if (!liberatedHere && !(window.LIB && LIB.controlsWaves()) && G.nextWave <= 0 && G.aliens.length < maxAlive) spawnWave();
    checkVictory();

    // camera
    cam.x += (p.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (p.y - 30 - cam.y) * Math.min(1, dt * 6);
    var halfW = vw / (2 * zoom), halfH = vh / (2 * zoom);
    cam.x = clamp(cam.x, halfW, SCENE.W - halfW);
    cam.y = clamp(cam.y, halfH, SCENE.H - halfH);

    for (var dci = G.decals.length - 1; dci >= 0; dci--) {
      G.decals[dci].life -= dt;
      if (G.decals[dci].life <= 0) G.decals.splice(dci, 1);
    }
    G.shake = Math.max(0, G.shake - dt * 14);
    G.flash = Math.max(0, G.flash - dt * 1.8);
  }

  /* ---------------- render ---------------- */
  function drawProp(p) {
    var t = performance.now();
    switch (p.kind) {
      case 'palm': PROPS.palmBase(ctx, p, t); break;
      case 'tree': PROPS.treeBase(ctx, p, t); break;
      case 'bush': PROPS.bushBase(ctx, p, t); break;
      case 'rock': PROPS.rock(ctx, p, t); break;
      case 'tent': PROPS.tent(ctx, p, t); break;
      case 'fire': PROPS.fire(ctx, p, t); break;
      case 'crate': PROPS.crate(ctx, p, t); break;
      case 'sandbag': PROPS.sandbag(ctx, p, t); break;
      case 'antenna': PROPS.antenna(ctx, p, t); break;
      case 'wreck': PROPS.wreck(ctx, p, t); break;
      case 'crystal': PROPS.crystal(ctx, p, t); break;
      case 'spire': PROPS.spire(ctx, p, t); break;
      case 'nest': PROPS.nest(ctx, p, t); break;
      default:
        if (window.PROPS2 && PROPS2[p.kind]) PROPS2[p.kind](ctx, p, t);
        break;
    }
  }

  function drawEntity(e, isPlayer) {
    var spr, size;
    if (isPlayer) { spr = e.sprite; size = 46; }
    else {
      spr = e.def.spr;
      size = e.type === 'mother' ? 118 : e.type === 'warrior' ? 62 : e.type === 'mutant' ? 66
        : e.type === 'brute' ? 70 : e.type === 'bomber' ? 52 : e.type === 'skitter' ? 34 : 52;
      if (e.elite) size *= 1.15;
    }
    var bob = isPlayer ? Math.sin(G.t * 10) * (e.moving ? 2 : 0.8) : Math.sin(e.phase * 0.8) * 2;
    // shadow
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#04100a';
    ctx.beginPath(); ctx.ellipse(e.x, e.y, size * 0.28, size * 0.11, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    // glow for alien cores (one cached sprite per colour)
    if (!isPlayer) {
      var gr = Math.round(size * 0.7);
      var gspr = glow(e.def.color + '55', gr);
      ctx.drawImage(gspr, e.x - gr, e.y - size * 0.4 - gr);
    }
    if (!isPlayer && e.elite) {
      ctx.strokeStyle = 'rgba(255,209,102,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, size * 0.36, size * 0.16, 0, 0, 6.2832); ctx.stroke();
    }
    var stride = isPlayer
      ? Math.sin(e.step || 0) * (e.moving ? 1 : 0.25)
      : Math.sin(e.phase * 0.9) * 0.8;
    ctx.save();
    ctx.translate(e.x, e.y - size * 0.45 + bob);
    ctx.rotate(stride * 0.02);
    ctx.scale(e.face * (1 + Math.abs(stride) * 0.005), 1 - Math.abs(stride) * 0.01);
    if (isPlayer && e.dodge > 0) ctx.globalAlpha = 0.6;
    var dw = isPlayer ? size * (spr.img.width / spr.img.height) : size;
    ctx.drawImage(spr.img, -dw / 2, -size / 2, dw, size);
    if ((isPlayer && e.hurt > 0) || (!isPlayer && e.hurt > 0)) {
      ctx.globalAlpha = 0.75;
      ctx.drawImage(spr.flash, -dw / 2, -size / 2, dw, size);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // weapon
    if (isPlayer) {
      ctx.save();
      ctx.translate(e.x, e.y - 16);
      ctx.rotate(e.aim);
      if (e.cur === 'rifle') {
        ctx.fillStyle = '#1d2229'; ctx.fillRect(-4, -3, 14, 6);
        ctx.fillStyle = '#2b323d'; ctx.fillRect(8, -3, 30, 6);
        ctx.fillStyle = '#3d4652'; ctx.fillRect(8, -3, 30, 2);
        ctx.fillStyle = '#151a20'; ctx.fillRect(14, 1, 6, 7);
        ctx.fillStyle = '#4a5462'; ctx.fillRect(21, -5, 8, 2);
        ctx.fillStyle = '#0e1216'; ctx.fillRect(36, -2, 4, 4);
      } else if (e.cur === 'shotgun') {
        ctx.fillStyle = '#5a3b22'; ctx.fillRect(-8, -3, 16, 7);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-8, -3, 16, 2);
        ctx.fillStyle = '#22262e'; ctx.fillRect(6, -4, 32, 4);
        ctx.fillStyle = '#2f353f'; ctx.fillRect(6, 0, 32, 4);
        ctx.fillStyle = '#141820'; ctx.fillRect(12, 4, 6, 5);
        ctx.fillStyle = '#0e1216'; ctx.fillRect(36, -4, 3, 8);
      } else if (e.cur === 'plasma') {
        ctx.fillStyle = '#1b2b33'; ctx.fillRect(-2, -4, 20, 8);
        ctx.fillStyle = '#2e4c58'; ctx.fillRect(-2, -4, 20, 3);
        ctx.fillStyle = '#0f1d24'; ctx.fillRect(10, 2, 6, 6);
        ctx.strokeStyle = 'rgba(155,246,255,.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(18, -3); ctx.lineTo(40, -3); ctx.moveTo(18, 3); ctx.lineTo(40, 3); ctx.stroke();
        ctx.fillStyle = '#9bf6ff'; ctx.fillRect(24, -2, 8, 4);
      } else {
        ctx.fillStyle = '#22262e'; ctx.fillRect(6, -3, 22, 6);
        ctx.fillStyle = '#3b4250'; ctx.fillRect(6, -3, 22, 2);
        ctx.fillStyle = '#141820'; ctx.fillRect(10, 1, 6, 5);
        ctx.fillStyle = '#0e1216'; ctx.fillRect(26, -2, 3, 4);
      }
      var wNow = W_BY[e.cur];
      var flashT = wNow.key === 'shotgun' ? 0.09 : 0.055;
      if (e.fireCd > wNow.rate - flashT) {
        var mx = wNow.key === 'plasma' ? 44 : wNow.key === 'shotgun' ? 40 : 34;
        ctx.fillStyle = wNow.key === 'plasma' ? 'rgba(155,246,255,.95)' : 'rgba(255,220,140,.95)';
        ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx + 14, -7); ctx.lineTo(mx + 18, 0); ctx.lineTo(mx + 14, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath(); ctx.arc(mx + 2, 0, 3.5, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
    // health bar
    if (!isPlayer && e.hp < e.maxHp) {
      var w = Math.max(22, size * 0.7), hh = e.type === 'mother' ? 6 : 4;
      var bx = e.x - w / 2, by = e.y - size - 12;
      ctx.fillStyle = 'rgba(4,8,12,.8)';
      ctx.fillRect(bx, by, w, hh);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), hh);
    }
  }

  function drawDrop(d, t) {
    if (d.life < 6 && Math.floor(t * 0.008) % 2 === 0) return;
    var bob = Math.sin(t * 0.004 + d.bob) * 3;
    var col = d.kind === 'med' ? '#ff8fa8' : d.kind === 'weapon' ? '#ffd166' : '#8bff9a';
    ctx.globalAlpha = 0.32; ctx.fillStyle = '#04100a';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, 10, 4, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    var dg = glow(col + '88', 30);
    ctx.drawImage(dg, d.x - 30, d.y - 9 - 30);
    ctx.save();
    ctx.translate(d.x, d.y - 10 + bob);
    if (d.kind === 'ammo') {
      ctx.fillStyle = '#2c452a'; ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = '#3f6b39'; ctx.fillRect(-8, -6, 16, 3);
      ctx.fillStyle = '#d8c56a';
      ctx.fillRect(-5, -2, 2, 6); ctx.fillRect(-1.5, -2, 2, 6); ctx.fillRect(2, -2, 2, 6);
      ctx.strokeStyle = 'rgba(6,14,8,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-8, -6, 16, 12);
    } else if (d.kind === 'med') {
      ctx.fillStyle = '#f3f0e6'; ctx.fillRect(-8, -7, 16, 14);
      ctx.fillStyle = '#d8404f'; ctx.fillRect(-2, -5, 4, 10); ctx.fillRect(-6, -2, 12, 4);
      ctx.strokeStyle = 'rgba(6,14,8,.5)'; ctx.strokeRect(-8, -7, 16, 14);
    } else {
      var wc = d.w === 'shotgun' ? '#ffc46b' : '#9bf6ff';
      ctx.scale(1.35, 1.35);
      ctx.fillStyle = '#252a33'; ctx.fillRect(-10, -8, 20, 16);
      ctx.fillStyle = '#3a414f'; ctx.fillRect(-10, -8, 20, 4);
      ctx.fillStyle = '#151a21'; ctx.fillRect(-10, -4, 20, 2);
      ctx.fillStyle = wc; ctx.fillRect(-7, 1, 14, 3);
      ctx.fillStyle = '#0f1318'; ctx.fillRect(-5, 4, 4, 4);
      ctx.strokeStyle = wc; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4; ctx.strokeRect(-10, -8, 20, 16);
      ctx.globalAlpha = 1;
      // light beam so crates are visible across the jungle
      var bg = ctx.createLinearGradient(0, -58, 0, 0);
      bg.addColorStop(0, 'rgba(255,209,102,0)');
      bg.addColorStop(1, wc + '55');
      ctx.fillStyle = bg; ctx.fillRect(-7, -58, 14, 56);
    }
    ctx.restore();
  }

  var weather = [];
  function initWeather() {
    var km = window.KITMETA ? KITMETA.forRegion(REGION) : null;
    var kind = km ? km.weather : 'spray';
    weather = [];
    var n = kind === 'rain' ? 120 : kind === 'mist' ? 26 : 60;
    for (var i = 0; i < n; i++) {
      weather.push({
        x: Math.random() * vw, y: Math.random() * vh,
        v: kind === 'rain' ? 640 + Math.random() * 340 : 12 + Math.random() * 26,
        s: 1 + Math.random() * 2, p: Math.random() * 6.28
      });
    }
    weather.kind = kind;
  }

  function drawWeather() {
    var kind = weather.kind;
    if (!kind || kind === 'none') return;
    var i, wv, t = performance.now() * 0.001;
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(180,220,240,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i < weather.length; i++) {
        wv = weather[i];
        wv.y += wv.v * 0.016;
        wv.x -= 90 * 0.016;
        if (wv.y > vh) { wv.y = -10; wv.x = Math.random() * vw; }
        if (wv.x < -10) wv.x = vw;
        ctx.moveTo(wv.x, wv.y);
        ctx.lineTo(wv.x + 3, wv.y + 12);
      }
      ctx.stroke();
      return;
    }
    for (i = 0; i < weather.length; i++) {
      wv = weather[i];
      wv.y -= wv.v * 0.016;
      wv.x += Math.sin(t * 0.6 + wv.p) * 0.4;
      if (wv.y < -10) { wv.y = vh + 10; wv.x = Math.random() * vw; }
      ctx.globalAlpha = kind === 'mist' ? 0.07 : 0.35;
      ctx.fillStyle = kind === 'ash' ? '#d8c9e8'
        : kind === 'dust' ? '#cbb78a'
        : kind === 'spores' ? '#b8ffd0'
        : kind === 'wind' ? '#e8f2f6' : '#cdf7ff';
      if (kind === 'mist') {
        ctx.beginPath(); ctx.ellipse(wv.x, wv.y, 90, 26, 0, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillRect(wv.x, wv.y, wv.s, wv.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* a compass towards the relay so nobody has to wander to find the goal */
  function drawRelayArrow() {
    if (!window.LIB || !G.player) return;
    if (LIB.phase() === 'liberated') return;
    var n = LIB.node();
    var sxp = (n.x - cam.x) * zoom + vw / 2;
    var syp = (n.y - cam.y) * zoom + vh / 2;
    var margin = 54;
    var onScreen = sxp > margin && sxp < vw - margin && syp > margin && syp < vh - margin;
    var d = Math.hypot(n.x - G.player.x, n.y - G.player.y);
    var ang = Math.atan2(n.y - G.player.y, n.x - G.player.x);
    var cx = Math.min(vw - margin, Math.max(margin, sxp));
    var cy = Math.min(vh - margin, Math.max(margin, syp));
    if (onScreen) {
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.004) * 0.18;
      ctx.strokeStyle = '#c37dff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 40, 14, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    // clamp the marker to a ring around the player and point at the relay
    var px2 = vw / 2, py2 = vh / 2;
    var rx = Math.cos(ang) * (Math.min(vw, vh) * 0.36);
    var ry = Math.sin(ang) * (Math.min(vw, vh) * 0.36);
    ctx.save();
    ctx.translate(px2 + rx, py2 + ry);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = LIB.phase() === 'defense' ? '#ff8a5b' : '#c37dff';
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, 0); ctx.lineTo(-8, 9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#e8dcff';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(d / 10) + 'م', px2 + rx, py2 + ry + 26);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function render() {
    var sx = (Math.random() - 0.5) * G.shake;
    var sy = (Math.random() - 0.5) * G.shake;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom,
      dpr * (vw / 2 - cam.x * zoom + sx), dpr * (vh / 2 - cam.y * zoom + sy));

    // terrain
    ctx.drawImage(SCENE.bg, 0, 0);
    if (window.LIB) LIB.draw(ctx);

    // animated foam — the beach only, never on asphalt or stone
    var t = performance.now(), x;
    if (!(window.SCENE && SCENE.isKit && SCENE.isKit())) {
      ctx.strokeStyle = 'rgba(236,255,252,.55)';
      ctx.lineWidth = 2;
      for (var w = 0; w < 2; w++) {
        ctx.beginPath();
        for (x = 0; x <= SCENE.W; x += 8) {
          var yy = SCENE.shoreY(x + w * 10) + 4 + w * 7 + Math.sin(x * 0.03 + t * 0.002 + w) * 2.5;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.globalAlpha = w === 0 ? 0.5 : 0.25;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ground scars from earlier fights
    for (var dci = 0; dci < G.decals.length; dci++) {
      var dc = G.decals[dci];
      var da = Math.max(0, dc.life / dc.max);
      ctx.globalAlpha = dc.kind === 'hole' ? da * 0.6 : da * 0.45;
      ctx.fillStyle = dc.color;
      if (dc.kind === 'blood') {
        ctx.beginPath();
        ctx.ellipse(dc.x, dc.y, dc.r, dc.r * 0.55, 0, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.fillRect(dc.x - dc.r * 0.4, dc.y - dc.r * 0.25, dc.r * 0.9, dc.r * 0.5);
      }
    }
    ctx.globalAlpha = 1;

    // props are sorted once at bake time; merge the handful of moving actors
    // into that order instead of sorting the whole world every frame
    var viewL = cam.x - vw / (2 * zoom) - 90, viewR = cam.x + vw / (2 * zoom) + 90;
    var viewT = cam.y - vh / (2 * zoom) - 170, viewB = cam.y + vh / (2 * zoom) + 170;
    var dyn = G.aliens.slice().sort(function (a, b) { return a.y - b.y; });
    var i, pi = 0, di = 0;
    while (pi < SCENE.props.length || di < dyn.length) {
      var pp = pi < SCENE.props.length ? SCENE.props[pi] : null;
      var dd0 = di < dyn.length ? dyn[di] : null;
      if (pp && (!dd0 || pp.y <= dd0.y)) {
        pi++;
        if (pp.x > viewL && pp.x < viewR && pp.y > viewT && pp.y < viewB) drawProp(pp);
      } else if (dd0) {
        di++;
        if (dd0.x > viewL - 80 && dd0.x < viewR + 80 && dd0.y > viewT && dd0.y < viewB + 80) drawEntity(dd0, false);
      }
    }
    if (G.player) drawEntity(G.player, true);
    // canopy layer: leaves sit above everything, so the player walks UNDER a
    // tree while its trunk still blocks him. Nearer crowns are drawn last.
    var crowns = [];
    for (i = 0; i < SCENE.props.length; i++) {
      if (PROPS.crownKinds[SCENE.props[i].kind]) crowns.push(SCENE.props[i]);
    }
    crowns.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < crowns.length; i++) {
      var cp = crowns[i];
      ctx.globalAlpha = 0.94;
      PROPS[PROPS.crownKinds[cp.kind]](ctx, cp, t);
    }
    ctx.globalAlpha = 1;

    // aiming reticle + laser sight
    if (G.player && G.player.aiming) {
      var ap = G.player;
      var ax0 = ap.x + Math.cos(ap.aim) * 20, ay0 = ap.y - 14 + Math.sin(ap.aim) * 20;
      var ax1 = ap.x + Math.cos(ap.aim) * 250, ay1 = ap.y - 14 + Math.sin(ap.aim) * 250;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(255,64,80,.9)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1, ay1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(ax1, ay1, 11, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax1 - 18, ay1); ctx.lineTo(ax1 - 5, ay1);
      ctx.moveTo(ax1 + 5, ay1); ctx.lineTo(ax1 + 18, ay1);
      ctx.moveTo(ax1, ay1 - 18); ctx.lineTo(ax1, ay1 - 5);
      ctx.moveTo(ax1, ay1 + 5); ctx.lineTo(ax1, ay1 + 18);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // loot
    for (i = 0; i < G.drops.length; i++) drawDrop(G.drops[i], t);

    // bullets
    for (i = 0; i < G.bullets.length; i++) {
      var bl = G.bullets[i];
      if (bl.kind === 'plasma') {
        var pg = ctx.createRadialGradient(bl.x, bl.y, 1, bl.x, bl.y, 11);
        pg.addColorStop(0, 'rgba(220,255,255,.95)');
        pg.addColorStop(1, 'rgba(120,220,255,0)');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(bl.x, bl.y, 11, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(180,250,255,.85)';
      } else {
        ctx.strokeStyle = bl.color || '#ffe39a';
      }
      ctx.lineWidth = bl.kind === 'shotgun' ? 1.4 : bl.kind === 'plasma' ? 3 : 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(bl.x - bl.vx * 0.012, bl.y - bl.vy * 0.012); ctx.stroke();
    }
    for (i = 0; i < G.ebullets.length; i++) {
      var eb = G.ebullets[i];
      var g2 = ctx.createRadialGradient(eb.x, eb.y, 1, eb.x, eb.y, 12);
      g2.addColorStop(0, 'rgba(226,160,255,.95)');
      g2.addColorStop(1, 'rgba(150,80,220,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(eb.x, eb.y, 12, 0, 6.2832); ctx.fill();
    }
    // particles
    for (i = 0; i < G.parts.length; i++) {
      var p2 = G.parts[i];
      ctx.globalAlpha = Math.max(0, p2.life / p2.max);
      ctx.fillStyle = p2.color;
      ctx.fillRect(p2.x, p2.y, p2.r, p2.r);
    }
    ctx.globalAlpha = 1;

    // damage numbers
    for (i = 0; i < G.nums.length; i++) {
      var nu = G.nums[i];
      ctx.globalAlpha = Math.max(0, nu.life / nu.max);
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,14,.75)';
      ctx.fillText(nu.txt, nu.x + 1, nu.y + 1);
      ctx.fillStyle = nu.color;
      ctx.fillText(nu.txt, nu.x, nu.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // floating spores / motes
    for (i = 0; i < G.spores.length; i++) {
      var sp = G.spores[i];
      var drift = Math.sin(t * 0.0004 + sp.p) * 14;
      var spx = sp.x + drift, spy = sp.y + Math.cos(t * 0.0003 + sp.p) * 10;
      ctx.globalAlpha = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.002 + sp.p));
      ctx.fillStyle = i % 4 === 0 ? '#ffd479' : '#c8ffd8';
      ctx.fillRect(spx, spy, 2, 2);
    }
    ctx.globalAlpha = 1;

    // reticle
    if (point.active && !joy.active) {
      var rx = (point.x - vw / 2) / zoom + cam.x, ry = (point.y - vh / 2) / zoom + cam.y;
      ctx.strokeStyle = 'rgba(140,240,255,.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(rx, ry, 9, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx - 14, ry); ctx.lineTo(rx - 5, ry);
      ctx.moveTo(rx + 5, ry); ctx.lineTo(rx + 14, ry); ctx.stroke();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawWeather();
    drawRelayArrow();

    if (G.hurtT > 0) {
      var cxs = vw / 2, cys = vh / 2, hrad = Math.min(vw, vh) * 0.34;
      ctx.save();
      ctx.translate(cxs, cys);
      ctx.rotate(G.hurtAng);
      ctx.globalAlpha = Math.min(1, G.hurtT);
      ctx.fillStyle = 'rgba(255,74,92,.85)';
      ctx.beginPath();
      ctx.moveTo(hrad + 28, 0); ctx.lineTo(hrad, -13); ctx.lineTo(hrad, 13);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,40,64,' + (G.flash * 0.35) + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---------------- hud ---------------- */
  var elName = document.getElementById('hudName');
  var elClass = document.getElementById('hudClass');
  var elWave = document.getElementById('hudWave');
  var elKills = document.getElementById('hudKills');
  var elHp = document.getElementById('hpFill');
  var elHpTxt = document.getElementById('hpTxt');
  var elSt = document.getElementById('stFill');
  var elAmmo = document.getElementById('ammoTxt');
  var elRes = document.getElementById('ammoRes');
  var elWeapon = document.getElementById('weaponName');
  var slotsEl = document.getElementById('wslots');
  var mini = document.getElementById('minimap');
  var mctx = mini.getContext('2d');

  function fa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }

  function updateWeaponHud() {
    var p = G.player;
    if (!p) return;
    var w = curW(p), st = curA(p);
    if (elWeapon) elWeapon.textContent = w.name;
    if (elAmmo) elAmmo.textContent = fa(st.mag);
    if (elRes) elRes.textContent = fa(st.reserve);
    if (slotsEl && slotsEl.children.length) {
      for (var i = 0; i < slotsEl.children.length; i++) {
        var c = slotsEl.children[i];
        var key = c.getAttribute('data-k');
        if (!key) continue;
        c.classList.toggle('on', key === p.cur);
        c.classList.toggle('lock', !p.arsenal[key].unlocked);
        var am = c.querySelector('i');
        if (am) am.textContent = p.arsenal[key].unlocked ? fa(p.arsenal[key].mag) : '—';
      }
    }
  }

  function updateAbilityHud() {
    var p = G.player;
    if (!p) return;
    var ab = p.def.ab, el = document.getElementById('abilityBtn');
    if (el) {
      el.classList.toggle('ready', p.abCd <= 0);
      el.querySelector('i').style.transform = 'scaleY(' + Math.max(0, p.abCd / ab.cd) + ')';
      el.querySelector('b').textContent = p.abCd > 0.05 ? Math.ceil(p.abCd) : ab.icon;
    }
    var d = document.getElementById('abilityName');
    if (d) d.textContent = ab.name;
  }

  function buildSlots() {
    if (!slotsEl) return;
    slotsEl.innerHTML = '';
    WEAPONS.forEach(function (w, i) {
      var b = document.createElement('button');
      b.className = 'wslot';
      b.setAttribute('data-k', w.key);
      b.innerHTML = '<b>' + fa(i + 1) + '</b><span class="wn">' + w.name + '</span><i>—</i>';
      b.addEventListener('click', function () { setWeapon(w.key); });
      slotsEl.appendChild(b);
    });
    updateWeaponHud();
  }

  function updateHud() {
    var p = G.player;
    if (!p) return;
    var hp = Math.max(0, p.hp) / p.maxHp;
    elHp.style.transform = 'scaleX(' + hp + ')';
    elHpTxt.textContent = fa(Math.ceil(p.hp));
    elSt.style.transform = 'scaleX(' + (1 - p.dodgeCd / 1.4) + ')';
    elWave.textContent = fa(G.wave);
    elKills.textContent = fa(G.kills);
    if (window.LIB) {
      var _obj = document.getElementById('objective');
      if (_obj) _obj.textContent = LIB.hudText();
    }
    var gSub = document.getElementById('goalSub');
    if (gSub) {
      var libN = window.META ? META.liberatedCount() : ((window.SAVE && SAVE.get('liberatedCount', 0)) || 0);
      var tot = window.META ? META.poiTotal() : 0;
      var salv = window.META ? META.salvage() : 0;
      var gTxt = 'آزاد: ' + fa(libN) + (tot ? '/' + fa(tot) : '') + ' · قطعات: ' + fa(salv);
      if (gTxt !== updateHud._gTxt) { updateHud._gTxt = gTxt; gSub.textContent = gTxt; }
    }
    var gTitle = document.getElementById('goalText');
    if (gTitle && window.LIB) {
      var ph = LIB.phase();
      var t2 = ph === 'defense' ? 'دفاع از رله' : ph === 'liberated' ? 'منطقه آزاد است' : 'رلهٔ فضایی را نابود کن';
      if (t2 !== updateHud._gT) { updateHud._gT = t2; gTitle.textContent = 'هدف: ' + t2; }
    }
    var sig = p.cur + ':' + curA(p).mag + ':' + curA(p).reserve + ':' + (p.arsenal.shotgun.unlocked ? 1 : 0) + (p.arsenal.plasma.unlocked ? 1 : 0);
    if (sig !== updateHud._sig) { updateHud._sig = sig; updateWeaponHud(); }
    var abSig = p.def.key + ':' + (p.abCd > 0 ? Math.ceil(p.abCd) : 0);
    if (abSig !== updateHud._abSig) { updateHud._abSig = abSig; updateAbilityHud(); }
    // minimap: the region's own ground, the relay and anything that moves
    var kmm = window.KITMETA ? KITMETA.forRegion(REGION) : null;
    var mmc = (kmm && kmm.minimap) || { ground: '#2b6b3c', accent: '#c48bff', sea: '#0e6f8f' };
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = mmc.ground;
    mctx.fillRect(0, 0, mini.width, mini.height);
    if (!(window.SCENE && SCENE.isKit && SCENE.isKit())) {
      mctx.fillStyle = mmc.sea || '#0e6f8f';
      mctx.fillRect(0, mini.height * 0.74, mini.width, mini.height * 0.26);
    } else if (mmc.sea) {
      mctx.strokeStyle = mmc.sea;
      mctx.lineWidth = 3;
      mctx.beginPath();
      for (var mxp = 0; mxp <= mini.width; mxp += 4) {
        var myy = (SCENE.H * 0.68 + Math.sin((mxp / mini.width) * SCENE.W * 0.0032) * 34) * (mini.height / SCENE.H);
        if (mxp === 0) mctx.moveTo(mxp, myy); else mctx.lineTo(mxp, myy);
      }
      mctx.stroke();
    }
    var sx = mini.width / SCENE.W, sy = mini.height / SCENE.H;
    var nd = window.LIB ? LIB.node() : null;
    if (nd && LIB.phase() !== 'liberated') {
      if (LIB.phase() === 'defense') {
        mctx.strokeStyle = 'rgba(255,138,91,.75)';
        mctx.lineWidth = 1;
        mctx.beginPath();
        mctx.arc(nd.x * sx, nd.y * sy, Math.max(7, (LIB.guardRadius ? LIB.guardRadius() : 360) * sx), 0, 6.2832);
        mctx.stroke();
      }
      mctx.fillStyle = '#c37dff';
      mctx.beginPath(); mctx.arc(nd.x * sx, nd.y * sy, 3.6, 0, 6.2832); mctx.fill();
      mctx.fillStyle = '#f2e6ff';
      mctx.fillRect(nd.x * sx - 1, nd.y * sy - 5, 2, 10);
    }
    mctx.fillStyle = mmc.accent;
    for (var i = 0; i < G.aliens.length; i++) {
      mctx.fillRect(G.aliens[i].x * sx - 1, G.aliens[i].y * sy - 1, 2.4, 2.4);
    }
    mctx.fillStyle = '#ffd166';
    for (var di = 0; di < G.drops.length; di++) {
      var dd2 = G.drops[di];
      mctx.fillRect(dd2.x * sx - 1.4, dd2.y * sy - 1.4, 2.8, 2.8);
    }
    mctx.fillStyle = '#8ff0ff';
    mctx.fillRect(p.x * sx - 1.6, p.y * sy - 1.6, 3.2, 3.2);
    var miniLabel = document.getElementById('miniLabel');
    if (miniLabel && window.LIB) {
      var phL = LIB.phase();
      miniLabel.textContent = (REGION && REGION.name ? REGION.name : 'جزیره') + ' · ' +
        (phL === 'defense' ? 'دفاع' : phL === 'liberated' ? 'آزاد' : 'نفوذ');
    }
  }

  /* ---------------- flow ---------------- */
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalTxt = document.getElementById('modalTxt');
  var modalMain = document.getElementById('modalMain');
  var modalAlt = document.getElementById('modalAlt');

  function showModal(title, txt, mainLabel, onMain, altLabel, onAlt) {
    modalTitle.textContent = title;
    modalTxt.innerHTML = txt;
    modalMain.textContent = mainLabel || 'ادامه';
    modal.classList.remove('hidden');
    modalMain.onclick = function () { modal.classList.add('hidden'); if (onMain) onMain(); };
    if (modalAlt) {
      if (altLabel) {
        modalAlt.style.display = '';
        modalAlt.textContent = altLabel;
        modalAlt.onclick = function () { modal.classList.add('hidden'); if (onAlt) onAlt(); };
      } else {
        modalAlt.style.display = 'none';
        modalAlt.onclick = null;
      }
    }
  }

  function checkVictory() {
    if (G.victoryShown || G.over) return;
    if (!window.META || !META.allLiberated()) return;
    G.victoryShown = true;
    G.paused = true;
    if (SFX.victory) SFX.victory();
    showModal('جزیره آزاد شد',
      'هر رلهٔ فضایی نابود شد.<br>برمودا دوباره مال توست — <b>' + fa(META.liberatedCount()) + '</b> منطقه آزاد، ' +
      fa(META.salvage()) + ' قطعه در انبار.<br><span style="opacity:.75">می‌توانی بمانی و گشت بزنی یا به نقشه برگردی.</span>',
      'بازگشت به نقشه', function () { location.href = 'index.html'; },
      'ادامهٔ گشت', function () { G.paused = false; });
  }

  function syncPausePanel() {
    var sBtn = document.getElementById('pSound');
    if (sBtn && window.SFX) sBtn.textContent = 'صدا: ' + (SFX.isMuted() ? 'خاموش' : 'روشن');
    var qBtn = document.getElementById('pQuality');
    if (qBtn && window.META) qBtn.textContent = 'کیفیت: ' + (META.quality() === 'low' ? 'سبک' : 'کامل');
    var note = document.getElementById('pauseNote');
    if (note && window.LIB) {
      note.textContent = 'گرما: ' + Math.round(LIB.heat()) + ' — گرمای بیشتر یعنی موج سنگین‌تر و دفاع سخت‌تر. ' +
        'قطعات: ' + (window.META ? META.salvage() : 0) + ' · نسخه ' + (window.APP_VERSION || '4.0');
    }
  }

  function togglePause() {
    if (!G.running || G.over) return;
    G.paused = !G.paused;
    var pn = document.getElementById('pause');
    if (pn) pn.classList.toggle('hidden', !G.paused);
    if (G.paused) syncPausePanel();
  }

  function die() {
    G.over = true; G.paused = true;
    if (window.LIB) LIB.onDeath();
    SFX.death();
    var best = window.SAVE ? SAVE.recordRun(G.wave, G.kills) : null;
    var bestTxt = best
      ? '<br><span style="opacity:.75">رکورد تو: موج ' + fa(best.wave) + ' · ' + fa(best.kills) + ' کشته</span>'
      : '';
    showModal('تو مردی',
      'در موج ' + fa(G.wave) + ' کشته شدی.<br>' + fa(G.kills) + ' موجود فضایی نابود شد.' + bestTxt,
      'شروع دوباره', function () { restart(); },
      'بازگشت به نقشه', function () { location.href = 'index.html'; });
  }

  function seedCrates() {
    G.drops = [];
    addDrop('weapon', 1140 * SCENE.S, 660 * SCENE.S, 'shotgun');
    addDrop('weapon', 1282 * SCENE.S, 470 * SCENE.S, 'plasma');
    G.drops[0].vx = G.drops[0].vy = 0;
    G.drops[1].vx = G.drops[1].vy = 0;
  }

  function beginRun(def) {
    G.over = false; G.paused = false; G.running = true;
    G.aliens = []; G.bullets = []; G.ebullets = []; G.parts = [];
    G.wave = 0; G.kills = 0; G.nextWave = 3; G.bossSpawned = false;
    G.nums = []; G.hitStop = 0; G.hurtT = 0; G.decals = []; G.salvage = 0;
    G.shake = 0; G.flash = 0; G.victoryShown = false;
    wasFire = false; firePressed = false;
    aimStick.active = false; aimStick.len = 0; aimStick.dx = aimStick.dy = 0;
    G.player = makePlayer(def);
    seedCrates();
    buildSlots();
    updateAbilityHud();
    cam.x = G.player.x; cam.y = G.player.y - 30;
    document.getElementById('reloadTxt').textContent = '';
    var pn = document.getElementById('pause');
    if (pn) pn.classList.add('hidden');
    if (window.LIB && LIB.start) LIB.start();
  }

  function restart() {
    modal.classList.add('hidden');
    beginRun(G.player.def);
  }

  function startGame(def) {
    SFX.unlock();
    document.getElementById('start').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    var touchy = qs.get('touch') || ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
    G.touch = !!touchy;
    if (touchy) {
      document.getElementById('joystick').classList.remove('hidden');
      document.getElementById('touchBtns').classList.remove('hidden');
    }
    elName.textContent = def.name;
    elClass.textContent = (REGION ? REGION.name + ' · ' : '') + def.cls;
    if (window.SAVE) SAVE.set('char', def.key);
    if (window.META && REGION) {
      META.setLastRegion({ poi: REGION.id || '', type: qs.get('type') || '', name: REGION.name || '' });
    }
    beginRun(def);
    initWeather();
    if (window.SFX && SFX.musicStart) SFX.musicStart((REGION && REGION.kit) || 'beach');
    var tut = document.getElementById('tut');
    if (tut && window.META && !META.flag('tutorial')) {
      tut.classList.remove('hidden');
      G.paused = true;
    }
  }

  /* ---------------- loop ---------------- */
  var firePressed = false;
  var aimStick = { active: false, dx: 0, dy: 0, len: 0, id: null };
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!G.bgReady) return;
    var dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
    last = ts;
    if (G.running && !G.paused) {
      update(dt);
      updateHud();
    }
    if (G.running) render();
  }

  var muteBtn = document.getElementById('btnMute');
  function syncMute() {
    if (!muteBtn) return;
    muteBtn.textContent = SFX.isMuted() ? '✕' : '♪';
    muteBtn.classList.toggle('off', SFX.isMuted());
    muteBtn.title = SFX.isMuted() ? 'صدا خاموش — M' : 'صدا روشن — M';
  }
  if (muteBtn) muteBtn.addEventListener('click', function () { SFX.unlock(); SFX.toggle(); syncMute(); });

  document.getElementById('btnPause').addEventListener('click', togglePause);
  /* ---------------- fire stick ----------------
     Touch the fire button and drag: the survivor shoots exactly where you pull.
     A straight tap keeps firing forward (and at the nearest alien). */
  var fireBtnEl = document.getElementById('btnFire');
  var fireKnob = fireBtnEl ? fireBtnEl.querySelector('b') : null;
  function stickEnd(e) {
    if (e && aimStick.id !== null && e.pointerId !== aimStick.id) return;
    aimStick.active = false; aimStick.id = null; aimStick.len = 0;
    aimStick.dx = aimStick.dy = 0;
    firePressed = false;
    if (fireBtnEl) fireBtnEl.classList.remove('aiming');
    if (fireKnob) fireKnob.style.transform = 'translate(0,0)';
  }
  if (fireBtnEl) {
    fireBtnEl.addEventListener('pointerdown', function (e) {
      e.preventDefault(); SFX.unlock();
      aimStick.active = true; aimStick.id = e.pointerId;
      aimStick.dx = 0; aimStick.dy = 0; aimStick.len = 0;
      firePressed = true;
      fireBtnEl.classList.add('aiming');
      if (fireKnob) fireKnob.style.transform = 'translate(0,0)';
      try { fireBtnEl.setPointerCapture(e.pointerId); } catch (err) {}
    });
    fireBtnEl.addEventListener('pointermove', function (e) {
      if (!aimStick.active || e.pointerId !== aimStick.id) return;
      e.preventDefault();
      var r = fireBtnEl.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      var len = Math.hypot(dx, dy), max = r.width * 0.52, cl = Math.min(len, max);
      aimStick.dx = dx; aimStick.dy = dy; aimStick.len = len;
      if (fireKnob) {
        fireKnob.style.transform = 'translate(' + (len ? dx / len * cl : 0) + 'px,' + (len ? dy / len * cl : 0) + 'px)';
      }
    });
    fireBtnEl.addEventListener('pointerup', stickEnd);
    fireBtnEl.addEventListener('pointercancel', stickEnd);
    fireBtnEl.addEventListener('lostpointercapture', stickEnd);
  }
  document.getElementById('btnDodge').addEventListener('pointerdown', function (e) { e.preventDefault(); keys['shift'] = true; setTimeout(function () { keys['shift'] = false; }, 90); });
  var abBtn = document.getElementById('btnAbility');
  if (abBtn) abBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); ability(); });
  var rlBtn = document.getElementById('btnReload');
  if (rlBtn) rlBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); startReload(); });
  var swBtn = document.getElementById('btnSwap');
  if (swBtn) swBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); cycleWeapon(1); });

  addEventListener('blur', function () { firePressed = false; point.down = false; });

  // pause as soon as the app goes to the background (phone call, home button)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.running && !G.paused && !G.over) togglePause();
  });

  // show the personal best on the start screen
  (function showBest() {
    var el = document.getElementById('bestline');
    if (!el || !window.SAVE) return;
    var b = SAVE.best();
    var runs = SAVE.get('runs', 0);
    if (!b) { el.textContent = 'اولین نبرد تو'; return; }
    el.innerHTML = 'رکورد: موج <b>' + fa(b.wave) + '</b> · <b>' + fa(b.kills) + '</b> کشته' +
      (runs > 1 ? ' <span style="opacity:.6">(' + fa(runs) + ' نبرد)</span>' : '');
  })();

  /* ---------------- character select ---------------- */
  var picked = null;
  function buildSelect() {
    var box = document.getElementById('chars');
    var startBtn = document.getElementById('btnStart');
    CHARS.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'charcard';
      card.setAttribute('data-key', c.key);
      var svg = PIX.SURVIVORS[c.key].img;
      var cc = document.createElement('canvas');
      cc.width = svg.width; cc.height = svg.height;
      cc.getContext('2d').drawImage(svg, 0, 0);
      card.innerHTML = '<div class="spr"></div><h3>' + c.name + '</h3><p>' + c.cls +
        '</p><p class="abline">توانایی: <b>' + c.ab.name + '</b></p><div class="pips"></div>';
      card.querySelector('.spr').appendChild(cc);
      var pips = card.querySelector('.pips');
      var n = Math.round(c.hp / 30);
      for (var i = 0; i < 5; i++) {
        var d = document.createElement('i');
        d.className = 'pip' + (i < n ? ' on' : '');
        pips.appendChild(d);
      }
      card.addEventListener('click', function () {
        Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('sel'); });
        card.classList.add('sel');
        picked = c;
        startBtn.disabled = false;
      });
      box.appendChild(card);
    });
    startBtn.addEventListener('click', function () { if (picked) startGame(picked); });
  }

  /* ---------------- boot ---------------- */
  var APP_VERSION = '4.0';
  window.APP_VERSION = APP_VERSION;
  resize();
  var loadEl = document.getElementById('loading');
  var verline = document.getElementById('verline');
  if (verline) verline.textContent = 'v' + APP_VERSION;
  // let the loading veil paint before the expensive terrain bake
  setTimeout(function () {
    SCENE.bake();
    G.bgReady = true;
    if (loadEl) loadEl.classList.add('hidden');
  }, 40);

  if (window.LIB) {
    LIB.init({
      spawn: function (type, x, y, elite) { addAlien(type, x, y, elite); },
      player: function () { return G.player; },
      onLiberated: function () {
        toast('منطقه آزاد شد · ' + (window.META ? META.liberatedCount() : 0) + ' منطقه');
        checkVictory();
      },
      toast: toast, particles: spawnParticles, sfx: SFX, region: REGION
    });
    LIB.start();
  }
  initWeather();
  G.spores = [];
  for (var si = 0; si < 90; si++) {
    G.spores.push({ x: Math.random() * SCENE.W, y: Math.random() * 800, p: Math.random() * 6.28 });
  }
  buildSelect();

  /* first-run coaching, then never again */
  (function tutorial() {
    var tut = document.getElementById('tut');
    var ok = document.getElementById('tutOk');
    if (!tut || !ok) return;
    ok.addEventListener('click', function () {
      tut.classList.add('hidden');
      if (window.META) META.setFlag('tutorial', true);
      G.paused = false;
    });
  })();

  /* the pause panel's controls */
  (function pauseControls() {
    var r = document.getElementById('pResume');
    var sBtn = document.getElementById('pSound');
    var qBtn = document.getElementById('pQuality');
    var rs = document.getElementById('pRestart');
    if (r) r.addEventListener('click', function () { G.paused = false; document.getElementById('pause').classList.add('hidden'); });
    if (sBtn) sBtn.addEventListener('click', function () { SFX.unlock(); SFX.toggle(); syncMute(); syncPausePanel(); });
    if (qBtn) qBtn.addEventListener('click', function () {
      if (!window.META) return;
      META.setQuality(META.quality() === 'low' ? 'high' : 'low');
      resize();
      if (G.running) render();
      syncPausePanel();
    });
    if (rs) rs.addEventListener('click', function () { restart(); });
  })();

  /* Android back: pause first, then hand the player back to the map */
  window.__onBack = function () {
    if (!G.running || G.over) return false;
    if (G.paused) { location.href = 'index.html'; return true; }
    togglePause();
    return true;
  };

  /* the start screen can jump straight back into the last region */
  (function setupContinue() {
    var btn = document.getElementById('btnResumeRegion');
    if (!btn || !window.META) return;
    var last = META.lastRegion();
    if (!last || !last.type) { btn.style.display = 'none'; return; }
    btn.href = 'preview.html?poi=' + encodeURIComponent(last.poi || '') +
      '&type=' + encodeURIComponent(last.type) + '&name=' + encodeURIComponent(last.name || '');
    var label = btn.querySelector('span');
    if (label) label.textContent = 'ادامهٔ ' + (last.name || 'آخرین منطقه');
  })();

  // remember the survivor from the last run
  (function restorePick() {
    if (!window.SAVE) return;
    var key = SAVE.get('char', null);
    if (!key) return;
    var card = document.querySelector('.charcard[data-key="' + key + '"]');
    if (card) card.click();
  })();
  addEventListener('resize', function () { if (G.running) { render(); } });

  // deep link for testing / sharing:  ?auto=wanderer&spawn=1
  var qs = new URLSearchParams(location.search);
  G.god = !!qs.get('god') && qs.get('dev') === '1';
  if (qs.get('dev') === '1' && qs.get('auto')) {
    var pick = CHARS.filter(function (c) { return c.key === qs.get('auto'); })[0] || CHARS[0];
    startGame(pick);
    G.nextWave = 9999;
    if (qs.get('spawn')) {
      var S = SCENE.S;
      addAlien('runner', 1110 * S, 610 * S);
      addAlien('warrior', 1180 * S, 690 * S);
      addAlien('neural', 940 * S, 500 * S);
      addAlien('winged', 1060 * S, 470 * S);
      addAlien('parasite', 900 * S, 620 * S);
      addAlien('warlock', 1230 * S, 560 * S);
      addAlien('mutant', 1130 * S, 730 * S);
      addAlien('skitter', 930 * S, 640 * S);
      addAlien('skitter', 952 * S, 620 * S);
      addAlien('skitter', 908 * S, 606 * S);
      addAlien('bomber', 860 * S, 700 * S);
      addAlien('brute', 1255 * S, 640 * S);
      addAlien('brute', 1150 * S, 430 * S, true);
      addAlien('mother', 1215 * S, 420 * S);
    }
  }
  if (qs.get('dev') === '1' && qs.get('useab')) {
    setTimeout(function () { ability(); }, 900);
    setTimeout(function () { ability(); }, 1600);
  }

  if (qs.get('dev') === '1' && qs.get('debug')) {
    setTimeout(function () {
      console.log('world=' + SCENE.W + 'x' + SCENE.H + ' player=' + (G.player ? Math.round(G.player.x) + ',' + Math.round(G.player.y) : '-') +
        ' cam=' + Math.round(cam.x) + ',' + Math.round(cam.y) + ' zoom=' + zoom + ' vp=' + vw + 'x' + vh);
      ['.hud-bottom', '.vitals', '.bar.hp', '.bar.st', '.ammo', '.wslots', '#hud'].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (!el) return console.log(sel + ' = null');
        var r = el.getBoundingClientRect();
        console.log(sel + ' x=' + Math.round(r.x) + ' y=' + Math.round(r.y) +
          ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height) +
          ' vw=' + innerWidth);
      });
    }, 1800);
  }

  requestAnimationFrame(loop);
})();
