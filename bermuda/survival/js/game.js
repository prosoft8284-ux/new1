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
  var G = {
    running: false, paused: false, over: false, t: 0, last: 0,
    player: null, aliens: [], bullets: [], ebullets: [], parts: [], drops: [],
    wave: 0, kills: 0, waveTimer: 0, nextWave: 2.5, shake: 0, flash: 0, bossSpawned: false,
    hitStop: 0, nums: [], hurtAng: 0, hurtT: 0, touch: false
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
    dpr = Math.min(2, window.devicePixelRatio || 1);
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

  function spawnWave() {
    G.wave++;
    var n = Math.round((3 + Math.floor(G.wave * 1.6)) * (window.LIB ? LIB.heatMul() : 1));
    var cx = 1205 * SCENE.S, cy = 425 * SCENE.S;
    var pool = ['parasite', 'runner', 'skitter'];
    if (G.wave >= 1 && REGION && REGION.aliens) {
      REGION.aliens.forEach(function (k) { if (pool.indexOf(k) < 0) pool.push(k); });
    }
    if (G.wave >= 2) pool.push('winged', 'runner', 'bomber');
    if (G.wave >= 3) pool.push('neural', 'warrior', 'brute');
    if (G.wave >= 4) pool.push('warlock', 'mutant', 'brute');
    // role squads: a shield up front, a caster behind, a bomber to flush you out
    if (G.wave >= 2 && n >= 3 && Math.random() < 0.55) {
      var sa = Math.random() * 6.2832, sr = rand(110, 180) * SCENE.S;
      var sqx = cx + Math.cos(sa) * sr * 1.2, sqy = cy + Math.sin(sa) * sr;
      var squad = ['brute', 'neural', 'bomber'];
      for (var si = 0; si < squad.length; si++) {
        addAlien(squad[si], sqx + rand(-24, 24), sqy + rand(-20, 20), si === 0 && Math.random() < 0.25);
      }
      n -= 3;
    }
    var eliteChance = Math.min(0.24, 0.05 + G.wave * 0.02);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, rr = rand(70, 190) * SCENE.S;
      var t = pool[(Math.random() * pool.length) | 0];
      var ax = cx + Math.cos(a) * rr * 1.2, ay = cy + Math.sin(a) * rr;
      var elite = Math.random() < eliteChance;
      addAlien(t, ax, ay, elite);
      // skitters arrive as a small pack
      if (t === 'skitter') {
        addAlien('skitter', ax + rand(-22, 22), ay + rand(-16, 16));
        addAlien('skitter', ax + rand(-22, 22), ay + rand(-16, 16));
      }
    }
    if (G.wave >= 3 && !G.bossSpawned) {
      G.bossSpawned = true;
      setTimeout(function () {
        if (!G.player || G.over) return;
        addAlien('mother', 1205, 405);
        toast('موجود مادر بیدار شد!');
      }, 4000);
    }
    SFX.wave();
    toast('موج ' + G.wave + ' از راه رسید');
    G.nextWave = 26;
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
      arsenal[w.key] = { mag: w.mag, reserve: w.reserve, unlocked: w.key === 'pistol' || w.key === 'rifle' };
    });
    return {
      def: def, x: 1010 * SCENE.S, y: 566 * SCENE.S, vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp, speed: def.spd,
      aim: 0, face: 1, cur: 'pistol', arsenal: arsenal, reloading: 0,
      fireCd: 0, dodge: 0, dodgeCd: 0, hurt: 0, moving: 0,
      knockX: 0, knockY: 0, dmgMul: def.dmg / 22,
      abCd: 0, abT: 0, invis: 0, buff: 0,
      sprite: PIX.SURVIVORS[def.key], radius: 13
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
      var a = p.aim + (Math.random() - 0.5) * w.spread * 2;
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

  function killAlien(idx) {
    if (window.LIB) LIB.noise(6);
    G.hitStop = Math.max(G.hitStop, 0.055);
    var a = G.aliens[idx];
    if (!a) return;
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
    if (point.active && !joy.active) {
      p.aim = Math.atan2((point.y - camScreenY) / zoom, (point.x - camScreenX) / zoom);
    } else {
      var best = null, bd = 1e9;
      for (var i = 0; i < G.aliens.length; i++) {
        var al = G.aliens[i], d = dist(al, p);
        if (d < 420 && d < bd) { bd = d; best = al; }
      }
      if (best) p.aim = Math.atan2(best.y - p.y, best.x - p.x);
    }
    if ((G.touch || joy.active) && G.aliens.length) {
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
    if ((keys['shift'] || keys[' ']) && p.dodgeCd <= 0 && ml > 0.1) {
      p.dodge = 0.22; p.dodgeCd = 1.4;
      SFX.dodge();
      p.vx = mx * 520; p.vy = my * 520;
      spawnParticles(p.x, p.y, 8, '#8ff0ff', 90, 0.3);
    }
    p.abCd = Math.max(0, p.abCd - dt);
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
      p.x += mx * p.speed * spdMul * dt;
      p.y += my * p.speed * spdMul * dt;
    }
    p.x += p.knockX * dt; p.y += p.knockY * dt;
    p.knockX *= 0.86; p.knockY *= 0.86;
    var beforeX = p.x, beforeY = p.y;
    p.x = clamp(p.x, 30, SCENE.W - 30);
    p.y = clamp(p.y, 40, SCENE.H - 40);
    if (SCENE.blocked(p.x, p.y)) { p.x = beforeX; p.y = beforeY; }

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
      }
    }
    var fireNow = point.down || keys['j'] || firePressed;
    if (fireNow && (!wasFire || curW(p).auto)) shoot();
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
        if (a.cd <= 0 && d < 380) {
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
        hurtPlayer(a.def.dmg, a.x, a.y);
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
    if (!(window.LIB && LIB.controlsWaves()) && G.nextWave <= 0 && G.aliens.length < 26) spawnWave();

    // camera
    cam.x += (p.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (p.y - 30 - cam.y) * Math.min(1, dt * 6);
    var halfW = vw / (2 * zoom), halfH = vh / (2 * zoom);
    cam.x = clamp(cam.x, halfW, SCENE.W - halfW);
    cam.y = clamp(cam.y, halfH, SCENE.H - halfH);

    G.shake = Math.max(0, G.shake - dt * 14);
    G.flash = Math.max(0, G.flash - dt * 1.8);
  }

  /* ---------------- render ---------------- */
  function drawProp(p) {
    var t = performance.now();
    switch (p.kind) {
      case 'palm': PROPS.palm(ctx, p, t); break;
      case 'tree': PROPS.tree(ctx, p, t); break;
      case 'bush': PROPS.bush(ctx, p, t); break;
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
    // glow for alien cores
    if (!isPlayer) {
      var gl = ctx.createRadialGradient(e.x, e.y - size * 0.4, 2, e.x, e.y - size * 0.4, size * 0.7);
      gl.addColorStop(0, e.def.color + '33');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(e.x, e.y - size * 0.4, size * 0.7, 0, 6.2832); ctx.fill();
    }
    if (!isPlayer && e.elite) {
      ctx.strokeStyle = 'rgba(255,209,102,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, size * 0.36, size * 0.16, 0, 0, 6.2832); ctx.stroke();
    }
    ctx.save();
    ctx.translate(e.x, e.y - size * 0.45 + bob);
    ctx.scale(isPlayer ? e.face : e.face, 1);
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
    var g = ctx.createRadialGradient(d.x, d.y - 9, 1, d.x, d.y - 9, 30);
    g.addColorStop(0, col + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y - 9, 30, 0, 6.2832); ctx.fill();
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

    // animated foam
    var t = performance.now(), x;
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

    // sorted world objects
    // one y-sorted pass: props, aliens and the player interleave by their base
    // line, so a canopy above the player really covers him
    var list = SCENE.props.slice();
    for (var i = 0; i < G.aliens.length; i++) list.push({ kind: '_alien', y: G.aliens[i].y, e: G.aliens[i] });
    if (G.player) list.push({ kind: '_player', y: G.player.y, e: G.player });
    list.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === '_alien') drawEntity(o.e, false);
      else if (o.kind === '_player') drawEntity(o.e, true);
      else drawProp(o);
    }
    // when the canopy swallows the player, leave a faint silhouette so he is
    // never lost behind the leaves
    if (G.player) {
      var occluded = false;
      for (i = 0; i < SCENE.props.length; i++) {
        var pp = SCENE.props[i];
        if (pp.kind !== 'tree' && pp.kind !== 'palm' && pp.kind !== 'bush') continue;
        if (pp.y > G.player.y + 4 && pp.y - G.player.y < 96 && Math.abs(pp.x - G.player.x) < 42) {
          occluded = true; break;
        }
      }
      if (occluded) {
        ctx.globalAlpha = 0.22;
        drawEntity(G.player, true);
        ctx.globalAlpha = 1;
      }
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
    var sig = p.cur + ':' + curA(p).mag + ':' + curA(p).reserve + ':' + (p.arsenal.shotgun.unlocked ? 1 : 0) + (p.arsenal.plasma.unlocked ? 1 : 0);
    if (sig !== updateHud._sig) { updateHud._sig = sig; updateWeaponHud(); }
    var abSig = p.def.key + ':' + (p.abCd > 0 ? Math.ceil(p.abCd) : 0);
    if (abSig !== updateHud._abSig) { updateHud._abSig = abSig; updateAbilityHud(); }
    // minimap
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = '#0a1c26';
    mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = '#2b6b3c';
    mctx.fillRect(0, 0, mini.width, mini.height * 0.74);
    mctx.fillStyle = '#0e6f8f';
    mctx.fillRect(0, mini.height * 0.74, mini.width, mini.height * 0.26);
    var sx = mini.width / SCENE.W, sy = mini.height / SCENE.H;
    mctx.fillStyle = '#c48bff';
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
  }

  /* ---------------- flow ---------------- */
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalTxt = document.getElementById('modalTxt');
  var modalMain = document.getElementById('modalMain');
  var modalAlt = document.getElementById('modalAlt');

  function showModal(title, txt, mainLabel, onMain) {
    modalTitle.textContent = title;
    modalTxt.innerHTML = txt;
    modalMain.textContent = mainLabel || 'ادامه';
    modal.classList.remove('hidden');
    modalMain.onclick = function () { modal.classList.add('hidden'); onMain(); };
  }

  function togglePause() {
    if (!G.running || G.over) return;
    G.paused = !G.paused;
    if (G.paused) {
      showModal('توقف', 'بازی متوقف شد. برای ادامه دکمه را بزن.', 'ادامه', function () { G.paused = false; });
    } else {
      modal.classList.add('hidden');
    }
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
      'شروع دوباره', function () { restart(); });
  }

  function seedCrates() {
    G.drops = [];
    addDrop('weapon', 1140 * SCENE.S, 660 * SCENE.S, 'shotgun');
    addDrop('weapon', 1282 * SCENE.S, 470 * SCENE.S, 'plasma');
    G.drops[0].vx = G.drops[0].vy = 0;
    G.drops[1].vx = G.drops[1].vy = 0;
  }

  function restart() {
    modal.classList.add('hidden');
    G.over = false; G.paused = false; G.running = true;
    G.aliens = []; G.bullets = []; G.ebullets = []; G.parts = [];
    G.wave = 0; G.kills = 0; G.nextWave = 3; G.bossSpawned = false;
    G.nums = []; G.hitStop = 0; G.hurtT = 0;
    G.shake = 0; G.flash = 0; wasFire = false;
    G.player = makePlayer(G.player.def);
    seedCrates();
    buildSlots();
    updateAbilityHud();
    cam.x = G.player.x; cam.y = G.player.y - 30;


    document.getElementById('reloadTxt').textContent = '';
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
    G.player = makePlayer(def);
    G.running = true; G.paused = false; G.over = false;
    G.aliens = []; G.bullets = []; G.ebullets = []; G.parts = [];
    G.wave = 0; G.kills = 0; G.nextWave = 3.5; G.bossSpawned = false;
    G.nums = []; G.hitStop = 0; G.hurtT = 0;
    wasFire = false;
    seedCrates();
    buildSlots();
    updateAbilityHud();
    cam.x = G.player.x; cam.y = G.player.y - 30;


  }

  /* ---------------- loop ---------------- */
  var firePressed = false;
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
  document.getElementById('btnFire').addEventListener('pointerdown', function (e) { e.preventDefault(); firePressed = true; });
  document.getElementById('btnFire').addEventListener('pointerup', function () { firePressed = false; });
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
  resize();
  SCENE.bake();
  G.bgReady = true;

  if (window.LIB) {
    LIB.init({
      spawn: function (type, x, y, elite) { addAlien(type, x, y, elite); },
      toast: toast, particles: spawnParticles, sfx: SFX, region: REGION
    });
    LIB.start();
  }
  G.spores = [];
  for (var si = 0; si < 90; si++) {
    G.spores.push({ x: Math.random() * SCENE.W, y: Math.random() * 800, p: Math.random() * 6.28 });
  }
  buildSelect();

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
  G.god = !!qs.get('god');
  if (qs.get('auto')) {
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
  if (qs.get('useab')) {
    setTimeout(function () { ability(); }, 900);
    setTimeout(function () { ability(); }, 1600);
  }

  if (qs.get('debug')) {
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
