/* BERMUDA SIEGE 3D — first-person survival on the occupied island.
   Self-contained: Three.js is vendored in js/vendor/three.min.js, all geometry,
   enemies, weapons and effects are generated at runtime. No build step. */
(function () {
  'use strict';

  var T = window.THREE;
  /* r147 still ships the legacy colour pipeline; the palette and the PBR
     lighting were authored against managed sRGB, so switch it on */
  if (T.ColorManagement && T.ColorManagement.legacyMode !== undefined) T.ColorManagement.legacyMode = false;
  var IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    /[?&]touch=1/.test(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view');

  /* ------------------------------------------------------------------ errors */
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 6500);
  }
  window.addEventListener('error', function (e) {
    try { if (window.SAVE) SAVE.set('lastError3d', String(e.message || e)); } catch (err) {}
    toast('خطای اجرا: ' + ((e && e.message) || 'نامشخص'));
  });

  if (!T) {
    var lt = $('loadTxt');
    if (lt) lt.textContent = 'کتابخانهٔ سه‌بعدی بارگذاری نشد.';
    toast('فایل js/vendor/three.min.js پیدا نشد.');
    return;
  }

  /* ------------------------------------------------------------------- math */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function fa(n) { return String(n).replace(/[0-9]/g, function (d) { return FA[+d]; }); }

  function hash2(x, y) {
    var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < 4; i++) { s += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
    return s;
  }

  /* ----------------------------------------------------------------- world */
  /* The whole island is authored at x2.4 linear (about 5.8x the old area).
     Props, zones, ranges and the terrain mesh scale with WS so the bigger map
     stays as dense as the small one instead of turning into an empty field. */
  var WS = 3.4;   /* 3.4^2 / 2.4^2 ≈ 2.0 — the land area is now twice as big */
  /* Scenery budget. Counts follow the area so the doubled island keeps its
     density, and phones take two thirds of it plus a coarser terrain grid. */
  var DENS = IS_TOUCH ? 0.66 : 1;
  function scenery(n) { return Math.max(1, Math.round(n * 2.15 * DENS)); }
  var N_PALM = scenery(560), N_ROCK = scenery(620), N_BUSH = scenery(1000),
    N_PILLAR = scenery(90), N_DEAD = scenery(180), N_POD = scenery(120),
    N_CRATE = scenery(70), N_STASH = scenery(16),
    N_PATROL = IS_TOUCH ? 10 : 12, N_FROND = IS_TOUCH ? 7 : 9;
  var ISLE_R = 100 * WS;
  /* enemies farther than this (and not hunting you) are not drawn at all */
  var CULL_R = IS_TOUCH ? 95 : 125;
  var BEACON = { x: 0, z: -10 * WS };
  /* spawned between the coastal camp and the dunes: the first fight is a short
     walk, not a cross-island hike */
  var SPAWN = { x: 8, z: 104 };
  var BEACON_H = null;

  function shapeAt(x, z) {
    var r = Math.hypot(x, z), a = Math.atan2(z, x);
    var wob = 1 + 0.16 * Math.sin(a * 2.7 + 1.3) + 0.10 * Math.sin(a * 5.1 + 0.4) + 0.06 * Math.sin(a * 9.3 + 2.1);
    var rn = r / (ISLE_R * wob);
    return 1 - smoothstep(0.58, 1.05, rn);
  }
  function rawHeight(x, z) {
    var s = shapeAt(x, z);
    var f = 1 / WS;
    var n = fbm(x * 0.045 * f + 11.2, z * 0.045 * f + 7.7);
    var ridge = Math.abs(fbm(x * 0.018 * f + 3.1, z * 0.018 * f + 9.4) - 0.5) * 2;
    return -7.5 + s * (10 + 19 * n + 8 * ridge);
  }
  function heightAt(x, z) {
    var h = rawHeight(x, z);
    if (BEACON_H === null) return h;
    var d = Math.hypot(x - BEACON.x, z - BEACON.z);
    if (d < 44) {
      var k = smoothstep(44, 18, d);
      h = h * (1 - k) + BEACON_H * k;
    }
    return h;
  }
  BEACON_H = rawHeight(BEACON.x, BEACON.z);

  /* ------------------------------------------------------------------ state */
  /* ------------------------------------------------------------------ swords
     Bermuda is a blade island now. Four swords, weakest first: the broken
     coastal sword is what you wake up with - and exactly what you come back
     with when the sky gives you another chance. Reach, arc and damage climb
     with the tier; stamina (نفس) is the only ammunition a blade needs. */
  var WEAPONS = [
    { key: 'broken', name: 'شمشیر شکسته', short: 'شکسته', tier: 1, dmg: 32, rate: 0.46, reach: 2.6, arc: 1.0, kick: 0.02, color: 0xffe6a6, owned: true, look: 'broken' },
    { key: 'iron', name: 'شمشیر آهنی', short: 'آهنی', tier: 2, dmg: 48, rate: 0.42, reach: 2.9, arc: 1.1, kick: 0.025, color: 0xbfe9ff, owned: false, look: 'iron' },
    { key: 'silver', name: 'تیغهٔ نقره', short: 'نقره', tier: 3, dmg: 68, rate: 0.38, reach: 3.1, arc: 1.15, kick: 0.03, color: 0xd8e9ff, owned: false, look: 'silver' },
    { key: 'gale', name: 'شمشیر باد', short: 'باد', tier: 3, dmg: 56, rate: 0.29, reach: 3.5, arc: 1.3, kick: 0.018, color: 0x9dffe0, owned: false, look: 'gale' },
    { key: 'frost', name: 'تیغهٔ یخ', short: 'یخ', tier: 3, dmg: 62, rate: 0.4, reach: 3.0, arc: 1.12, kick: 0.03, color: 0x8ff0ff, owned: false, look: 'frost', trait: 'chill' },
    { key: 'ember', name: 'شمشیر کهربا', short: 'کهربا', tier: 4, dmg: 92, rate: 0.34, reach: 3.3, arc: 1.25, kick: 0.035, color: 0xffb35c, owned: false, look: 'ember', trait: 'burn' },
    { key: 'blood', name: 'تیغهٔ خون', short: 'خون', tier: 4, dmg: 76, rate: 0.36, reach: 3.1, arc: 1.18, kick: 0.03, color: 0xff5b6e, owned: false, look: 'blood', trait: 'leech' },
    { key: 'hammer', name: 'پتک جنگی', short: 'پتک', tier: 4, dmg: 118, rate: 0.62, reach: 3.0, arc: 0.9, kick: 0.07, color: 0xffd166, owned: false, look: 'hammer', trait: 'crush' },
    { key: 'sun', name: 'تیغهٔ خورشید', short: 'خورشید', tier: 5, dmg: 96, rate: 0.33, reach: 3.4, arc: 1.28, kick: 0.04, color: 0xffe08a, owned: false, look: 'sun', trait: 'burn' },
    { key: 'legend', name: 'شمشیر افسانه', short: 'افسانه', tier: 6, dmg: 112, rate: 0.31, reach: 3.6, arc: 1.3, kick: 0.04, color: 0xffffff, owned: false, look: 'legend', trait: 'leech' }
  ];

  /* old checkpoints and zone caches still name the firearms: every one of them
     now points at the blade that replaced it */
  var LOOT_ALIAS = { ammo: 'stam', rifle: 'iron', shotgun: 'silver', plasma: 'ember', pistol: 'broken' };
  function lootAlias(k) { return LOOT_ALIAS[k] || k; }

  function weaponByKey(k) {
    for (var i = 0; i < WEAPONS.length; i++) if (WEAPONS[i].key === k) return i;
    return -1;
  }

  var ENEMY = {
    runner: { hp: 38, spd: 4.4, dmg: 9, r: 0.5, h: 1.5, color: 0x8ce07a, glow: 0x2f7a2a, name: 'خاردار رانده' },
    skitter: { hp: 24, spd: 6.0, dmg: 6, r: 0.42, h: 1.05, color: 0xd0a4ff, glow: 0x5a2a9a, name: 'جهندهٔ تیزپا' },
    warrior: { hp: 105, spd: 2.8, dmg: 17, r: 0.78, h: 2.0, color: 0x93a9c9, glow: 0x2a4a7a, name: 'جنگجوی زره‌پوش' },
    neural: { hp: 62, spd: 2.5, dmg: 10, r: 0.66, h: 1.85, color: 0x6fd8ff, glow: 0x1d6a92, ranged: true, name: 'عصب‌زن' },
    bomber: { hp: 46, spd: 3.6, dmg: 30, r: 0.66, h: 1.5, color: 0xffc46a, glow: 0x8a4a10, explode: true, name: 'بمب‌گذار انتحاری' },
    brute: { hp: 190, spd: 2.3, dmg: 22, r: 1.0, h: 2.6, color: 0xa87cff, glow: 0x46228a, charge: true, name: 'غول زره‌پوش' },
    stalker: { hp: 82, spd: 3.6, dmg: 24, r: 0.55, h: 2.0, color: 0x3b2c56, glow: 0x1a0e30, name: 'شکارچی شب' }
  };

  var WAVES = 6;
  var EYE = 1.72;
  var G = {
    running: false, paused: false, over: false, won: false,
    t: 0, last: 0, frame: 0,
    wave: 0, kills: 0, hp: 100, maxHp: 100, lastHurt: -99,
    state: 'fight', queue: [], spawnT: 1.2, breakT: 0, pending: 0,
    hpScale: 1, spdScale: 1, aiSkill: 1, spawnGap: 0.5, maxAlive: 8,
    widx: 0, reloading: 0, reloadTime: 0, firing: false, aim: false,
    combo: 0, comboT: 0, comboBest: 0, dmgMul: 1, wlvl: 1,
    squadT: 0.6, squadId: 0, squadN: 0, arrowT: 0, arrowA: 0, emptyT: -9,
    feudT: 0.9, nearest: 9999, nearestName: '',
    /* approved expansion: economy, upgrades, hazards, sky cycle, save */
    parts: 0, upg: { dmg: 0, mag: 0, reload: 0 }, diff: 'soldier', dmgTaken: 1,
    props: [],
    meleeT: 0, benchOpen: false, benchHint: false,
    /* blade combat, contracts and the sky-return penalty */
    stam: 5, stamMax: 5, swingT: 9, swingHeavy: false, lastSwing: -9,
    down: false, downT: 0, falling: false, invuln: 0, deaths: 0,
    bounty: null, bountyNo: 0, bountyKills: 0, bountyT: 0, bountyDelay: 0, looted: 0,
    roster: [], hunterKills: 0,
    hunters: [], hunterTick: 0, youRing: null, lastHitBy: null, lastHitByAt: -99,
    cmpT: 0,
    barrels: [], traps: [], cycle: 0.12, nightK: 0, storm: 0, stormT: 70, phase: 'روز',
    dmgSrc: null, threat: 0, threatT: 0, diffExtra: 0,
    shake: 0, recoil: 0, bloom: 0, recoverPitch: 0, roll: 0, hitT: 0, bannerT: 0, stepT: 0,
    swingKind: 0, comboStep: 0, waves: [],
    hitstop: 0, punch: 0, rageT: 0, shieldT: 0, items: { bomb: 0, shield: 0, rage: 0 },
    enemies: [], bolts: [], ebolts: [], pickups: [], tracers: [],
    parts: [], locked: false, hadLock: false, dragging: false, dragSX: 0, dragSY: 0,
    quality: 'high', started: false
  };

  var P = {
    pos: new T.Vector3(SPAWN.x, 0, SPAWN.z),
    vel: new T.Vector3(),
    yaw: 0, pitch: 0, radius: 0.42, onGround: true,
    bobT: 0, sprint: false
  };
  P.yaw = Math.atan2(-(BEACON.x - P.pos.x), -(BEACON.z - P.pos.z));
  P.pos.y = heightAt(P.pos.x, P.pos.z);

  var keys = {};
  var pointer = { down: false, right: false };
  var joyVec = { x: 0, y: 0 };
  var colliders = [];   // {x,z,r} — blocks the player's feet
  /* Solid silhouettes that stop bullets: rocks, trunks, pillars, crates and
     the relay base. {x,z,r,y0,y1} is a vertical cylinder, which is all the
     shot tracer needs and is far cheaper than per-triangle ray tests. */
  var blockers = [];

  /* --------------------------------------------------------------- renderer */
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
  } catch (e) {
    toast('مرورگر از WebGL پشتیبانی نمی‌کند.');
    if ($('loading')) $('loading').classList.add('done');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.15 : 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if ('outputColorSpace' in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
  if ('outputEncoding' in renderer && T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !IS_TOUCH;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();
  scene.fog = new T.Fog(0x151029, 60, 520);
  var camera = new T.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 1900);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  /* --------------------------------------- environment reflections (PMREM)
     A small procedural studio gives the crystal facets and the metal trim
     something to reflect, which is what sells the concept-art look. */
  (function buildEnvironment() {
    var pm = new T.PMREMGenerator(renderer);
    var envScene = new T.Scene();
    var envMat = new T.ShaderMaterial({
      side: T.BackSide,
      uniforms: {
        top: { value: new T.Color(0x1d1140) },
        mid: { value: new T.Color(0x40206e) },
        bot: { value: new T.Color(0x07060d) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y;' +
        ' vec3 c = mix(bot, mid, smoothstep(-0.55, 0.15, h));' +
        ' c = mix(c, top, smoothstep(0.05, 0.9, h));' +
        ' gl_FragColor = vec4(c, 1.0); }'
    });
    envScene.add(new T.Mesh(new T.SphereGeometry(60, 24, 16), envMat));

    function panel(w, h, color, px, py, pz, ry, rx) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: color, side: T.DoubleSide }));
      m.position.set(px, py, pz);
      m.rotation.set(rx || 0, ry || 0, 0);
      envScene.add(m);
    }
    panel(28, 44, 0xd9c2ff, -34, 14, 0, Math.PI / 2);
    panel(20, 28, 0x8f5cff, 32, 8, 14, -Math.PI / 2.4);
    panel(14, 14, 0xfff4e2, 10, 36, -26, 0);
    panel(44, 3, 0xb56bff, 0, 4, 34, Math.PI);

    var target = pm.fromScene(envScene, 0.03);
    scene.environment = target.texture;
    pm.dispose();
  })();

  /* --------------------------------------------------------- post-processing
     A hand-rolled bloom: bright pass, separable gaussian blur, additive
     composite. This is what makes the crystal cores and the alien eyes glow
     like the concept art instead of reading as flat emissive paint. */
  var post = (function () {
    var base = {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      type: T.HalfFloatType, format: T.RGBAFormat,
      depthBuffer: true, stencilBuffer: false, samples: IS_TOUCH ? 0 : 4
    };
    var sceneRT = new T.WebGLRenderTarget(2, 2, base);
    var half = {
      minFilter: T.LinearFilter, magFilter: T.LinearFilter,
      type: T.HalfFloatType, format: T.RGBAFormat,
      depthBuffer: false, stencilBuffer: false
    };
    var bloomA = new T.WebGLRenderTarget(2, 2, half);
    var bloomB = new T.WebGLRenderTarget(2, 2, half);

    var quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quadScene = new T.Scene();
    var quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial());
    quad.frustumCulled = false;
    quadScene.add(quad);

    var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

    var brightMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.86 }, knee: { value: 0.22 } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float threshold; uniform float knee; varying vec2 vUv;' +
        'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;' +
        ' float l = max(c.r, max(c.g, c.b));' +
        ' float w = smoothstep(threshold - knee, threshold + knee, l);' +
        ' gl_FragColor = vec4(c * w, 1.0); }'
    });

    var blurMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new T.Vector2(1, 0) } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;' +
        'void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270;' +
        ' s += texture2D(tDiffuse, vUv + dir * 1.3846154).rgb * 0.3162162;' +
        ' s += texture2D(tDiffuse, vUv - dir * 1.3846154).rgb * 0.3162162;' +
        ' s += texture2D(tDiffuse, vUv + dir * 3.2307692).rgb * 0.0702703;' +
        ' s += texture2D(tDiffuse, vUv - dir * 3.2307692).rgb * 0.0702703;' +
        ' gl_FragColor = vec4(s, 1.0); }'
    });

    var compMat = new T.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: 1.05 } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength; varying vec2 vUv;' +
        'vec3 lin2srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }' +
        'void main(){ vec3 c = texture2D(tScene, vUv).rgb;' +
        ' c += texture2D(tBloom, vUv).rgb * strength;' +
        ' gl_FragColor = vec4(lin2srgb(clamp(c, 0.0, 1.0)), 1.0); }'
    });

    [brightMat, blurMat, compMat].forEach(function (m) { m.depthTest = false; m.depthWrite = false; });

    var size = new T.Vector2();
    function setSize() {
      renderer.getDrawingBufferSize(size);
      sceneRT.setSize(size.x, size.y);
      var div = IS_TOUCH ? 3 : 2;
      var bw = Math.max(1, Math.floor(size.x / div));
      var bh = Math.max(1, Math.floor(size.y / div));
      bloomA.setSize(bw, bh);
      bloomB.setSize(bw, bh);
    }
    setSize();

    function blit(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, quadCam);
    }

    return {
      setSize: setSize,
      bloom: compMat.uniforms.strength,
      render: function () {
        renderer.setRenderTarget(sceneRT);
        renderer.render(scene, camera);

        brightMat.uniforms.tDiffuse.value = sceneRT.texture;
        blit(brightMat, bloomA);

        blurMat.uniforms.tDiffuse.value = bloomA.texture;
        blurMat.uniforms.dir.value.set(1.7 / bloomA.width, 0);
        blit(blurMat, bloomB);

        blurMat.uniforms.tDiffuse.value = bloomB.texture;
        blurMat.uniforms.dir.value.set(0, 1.7 / bloomA.height);
        blit(blurMat, bloomA);

        compMat.uniforms.tScene.value = sceneRT.texture;
        compMat.uniforms.tBloom.value = bloomA.texture;
        blit(compMat, null);
      }
    };
  })();

  /* ------------------------------------------------------------------ lights */
  var hemi = new T.HemisphereLight(0xa9b6ff, 0x351a58, 0.78);
  scene.add(hemi);

  var moon = new T.DirectionalLight(0xe4ddff, 1.95);
  moon.position.set(-70, 95, 55);
  moon.castShadow = true;
  moon.shadow.mapSize.width = 1536;
  moon.shadow.mapSize.height = 1536;
  moon.shadow.camera.left = -90;
  moon.shadow.camera.right = 90;
  moon.shadow.camera.top = 90;
  moon.shadow.camera.bottom = -90;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 320;
  moon.shadow.bias = -0.0009;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);
  scene.add(moon.target);

  var rim = new T.DirectionalLight(0x7a4bff, 0.8);
  rim.position.set(60, 30, -80);
  scene.add(rim);

  /* two extra lights would read better but each one costs a full lit pass on
     mobile, so the violet fill is folded into the hemisphere + rim instead */
  hemi.intensity = 0.76;
  rim.intensity = 0.9;

  /* --------------------------------------------------------------- quality
     Mobile starts light and can be raised; desktop starts high. The game also
     drops a tier on its own if the frame rate sags. */
  var QUAL = { low: IS_TOUCH };
  function applyQuality(low) {
    QUAL.low = !!low;
    var dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(QUAL.low ? Math.min(dpr, 1.0) : Math.min(dpr, 1.6));
    renderer.shadowMap.enabled = !QUAL.low;
    moon.castShadow = !QUAL.low;
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
    moon.shadow.mapSize.set(QUAL.low ? 512 : 1024, QUAL.low ? 512 : 1024);
    post.bloom.value = QUAL.low ? 0.5 : 0.68;
    G.maxAlive = QUAL.low ? 7 : 13;
    var q = $('pQuality');
    if (q) q.textContent = 'کیفیت: ' + (QUAL.low ? 'سبک' : 'بالا');
    if (post.setSize) post.setSize();
  }

  /* --------------------------------------------------------------------- sky */
  var skyMat = null, starField = null, moonSprite = null;
  (function buildSky() {
    skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        cTop: { value: new T.Color(0x05030f) },
        cMid: { value: new T.Color(0x160f33) },
        cBot: { value: new T.Color(0x301a55) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y;' +
        ' vec3 c = mix(cMid, cTop, smoothstep(0.0, 0.7, h));' +
        ' c = mix(cBot, c, smoothstep(-0.04, 0.30, h));' +
        ' gl_FragColor = vec4(c, 1.0); }'
    });
    scene.add(new T.Mesh(new T.SphereGeometry(1500, 32, 20), skyMat));

    var starGeo = new T.BufferGeometry();
    var sp = new Float32Array(1400 * 3);
    for (var i = 0; i < 1400; i++) {
      var u = Math.random() * Math.PI * 2;
      var v = Math.random();
      var r = 1300;
      var y = v;
      var rad = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(u) * rad * r;
      sp[i * 3 + 1] = y * r * 0.9 + 20;
      sp[i * 3 + 2] = Math.sin(u) * rad * r;
    }
    starGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
    starField = new T.Points(starGeo, new T.PointsMaterial({
      color: 0xcfe2ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false
    }));
    scene.add(starField);

    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g2 = c.getContext('2d');
    var grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(220,236,255,.95)');
    grd.addColorStop(0.5, 'rgba(150,190,255,.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 128, 128);
    var moonTex = new T.CanvasTexture(c);
    moonSprite = new T.Sprite(new T.SpriteMaterial({
      map: moonTex, color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false
    }));
    moonSprite.position.set(-520, 360, -740);
    moonSprite.scale.set(230, 230, 1);
    scene.add(moonSprite);
  })();

  /* ----------------------------------------------------------------- terrain */
  var terrain;
  (function buildTerrain() {
    var seg = IS_TOUCH ? 180 : 320, size = 250 * WS;
    var geo = new T.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    var norm = geo.attributes.normal;
    var colors = new Float32Array(pos.count * 3);
    var cSandWet = new T.Color(0x7d6c48);
    var cSand = new T.Color(0xcbb684);
    var cGrass = new T.Color(0x2e6038);
    var cGrass2 = new T.Color(0x163a24);
    var cRock = new T.Color(0x66645f);
    var tmp = new T.Color();
    for (var j = 0; j < pos.count; j++) {
      var x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j), ny = norm.getY(j);
      var n = fbm(x * 0.11 + 4, z * 0.11 + 8);
      var n2 = fbm(x * 0.42 + 21, z * 0.42 + 13);
      if (y < 0.6) tmp.copy(cSandWet).lerp(cSand, smoothstep(-1.4, 0.6, y));
      else if (y < 2.8) tmp.copy(cSand).lerp(cGrass, smoothstep(1.0, 2.8, y));
      else tmp.copy(cGrass).lerp(cGrass2, n);
      var rockMix = clamp(smoothstep(13, 20, y) + (1 - smoothstep(0.62, 0.86, ny)), 0, 1);
      tmp.lerp(cRock, rockMix * 0.82);
      tmp.multiplyScalar(0.82 + n * 0.24 + n2 * 0.16);
      colors[j * 3] = tmp.r;
      colors[j * 3 + 1] = tmp.g;
      colors[j * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    var mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.03 });
    terrain = new T.Mesh(geo, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    /* photoscanned CC0 ground detail (diffuse + normal) multiplied over the
       vertex-coloured biomes, so sand, grass and rock all get real grain */
    (function groundDetail() {
      var loader = new T.TextureLoader();
      function tune(tex) {
        tex.wrapS = tex.wrapT = T.RepeatWrapping;
        tex.repeat.set(64 * WS, 64 * WS);
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return tex;
      }
      function gained(src, k) {
        var img = src.image;
        if (!img || !img.width) return src;
        var cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var d = ctx.getImageData(0, 0, cv.width, cv.height);
        var px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          px[i] = Math.min(255, px[i] * k);
          px[i + 1] = Math.min(255, px[i + 1] * k);
          px[i + 2] = Math.min(255, px[i + 2] * k);
        }
        ctx.putImageData(d, 0, 0);
        var out = new T.CanvasTexture(cv);
        out.wrapS = out.wrapT = T.RepeatWrapping;
        out.repeat.copy(src.repeat);
        out.anisotropy = src.anisotropy;
        if (T.sRGBEncoding !== undefined) out.encoding = T.sRGBEncoding;
        if (T.SRGBColorSpace) out.colorSpace = T.SRGBColorSpace;
        return out;
      }
      loader.load('textures/ground_diff.jpg', function (tex) {
        tune(tex);
        mat.map = gained(tex, 1.12);
        mat.needsUpdate = true;
      });
      loader.load('textures/ground_nor.jpg', function (tex) {
        tune(tex);
        mat.normalMap = tex;
        mat.normalScale.set(0.55, 0.55);
        mat.needsUpdate = true;
      });
    })();

    var floor = new T.Mesh(
      new T.PlaneGeometry(2600, 2600),
      new T.MeshStandardMaterial({ color: 0x07171f, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -9.5;
    scene.add(floor);

    var water = new T.Mesh(
      new T.PlaneGeometry(2600, 2600, 1, 1),
      new T.MeshStandardMaterial({
        color: 0x11607b, transparent: true, opacity: 0.9,
        roughness: 0.14, metalness: 0.6
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.06;
    scene.add(water);
  })();

  /* ------------------------------------------------------------------- props */
  (function buildProps() {
    /* palms ------------------------------------------------------------- */
    var spots = [];
    var guard = 0;
    while (spots.length < N_PALM && guard++ < 32000) {
      var a = rand(0, Math.PI * 2);
      var r = Math.sqrt(Math.random()) * ISLE_R * 0.94;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      var h = heightAt(x, z);
      if (h < 1.3 || h > 26) continue;
      if (Math.hypot(x - BEACON.x, z - BEACON.z) < 28) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9) continue;
      spots.push({ x: x, z: z, h: h, H: rand(3.8, 6.4), ry: rand(0, 6.283), tilt: rand(-0.09, 0.09) });
    }

    var trunkGeo = new T.CylinderGeometry(0.13, 0.3, 1, 7, 1);
    trunkGeo.translate(0, 0.5, 0);
    var trunkMat = new T.MeshStandardMaterial({ color: 0x6d5539, roughness: 0.95, flatShading: true });
    var trunks = new T.InstancedMesh(trunkGeo, trunkMat, spots.length);
    trunks.castShadow = true;

    /* an arched, tapered palm frond: a drooping ribbon that keeps a readable
       silhouette from below, above and the side, unlike a flat box */
    var frondGeo = (function () {
      var N = 7, L = 3.3, pos = [], idx = [];
      for (var i = 0; i <= N; i++) {
        var t = i / N, x = t * L;
        var w = 0.5 * (1 - t * 0.9);
        var y = -0.8 * t * t;
        pos.push(x, y, -w, x, y + 0.015, w);
      }
      for (var s = 0; s < N; s++) {
        var a = s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    })();
    var frondMat = new T.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.86, side: T.DoubleSide,
      emissive: 0x0a2410, emissiveIntensity: 0.2
    });
    var fronds = new T.InstancedMesh(frondGeo, frondMat, spots.length * N_FROND);
    var frondCol = new T.Color();
    fronds.castShadow = true;

    var dummy = new T.Object3D();
    var q = new T.Quaternion();
    var qa = new T.Quaternion();
    var qb = new T.Quaternion();
    var eul = new T.Euler();
    var top = new T.Vector3();
    var mtmp = new T.Matrix4();
    var fIdx = 0;

    spots.forEach(function (s, i) {
      dummy.position.set(s.x, s.h - 0.1, s.z);
      dummy.rotation.set(s.tilt, s.ry, s.tilt * 0.8);
      dummy.scale.set(0.9 + s.H * 0.035, s.H, 0.9 + s.H * 0.035);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      q.setFromEuler(new T.Euler(s.tilt, s.ry, s.tilt * 0.8));

      top.set(0, 1, 0).applyMatrix4(dummy.matrix);
      for (var f = 0; f < N_FROND; f++) {
        eul.set(rand(-0.1, 0.1), s.ry + f * (Math.PI * 2 / N_FROND) + rand(-0.12, 0.12), rand(-0.06, 0.12));
        qb.setFromEuler(eul);
        dummy.position.copy(top);
        dummy.quaternion.copy(qb);
        var fs2 = rand(0.82, 1.12);
        dummy.scale.set(fs2, 1, rand(0.85, 1.15));
        dummy.updateMatrix();
        fronds.setMatrixAt(fIdx, dummy.matrix);
        frondCol.setHSL(0.29 + rand(-0.03, 0.03), 0.45 + rand(0, 0.12), 0.3 + rand(0, 0.09));
        fronds.setColorAt(fIdx, frondCol);
        fIdx++;
      }
      var trunkR = 0.3 * (0.9 + s.H * 0.035);
      colliders.push({ x: s.x, z: s.z, r: trunkR + 0.08 });
      blockers.push({ x: s.x, z: s.z, r: trunkR, y0: s.h - 0.4, y1: s.h + s.H * 0.94 });
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
    scene.add(trunks, fronds);

    /* rocks ------------------------------------------------------------- */
    var rockGeo = new T.IcosahedronGeometry(1, 0);
    var rockMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    var tmpCol = new T.Color();
    var rocks = new T.InstancedMesh(rockGeo, rockMat, N_ROCK);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    var ri = 0, rg = 0;
    while (ri < N_ROCK && rg++ < 32000) {
      var ra = rand(0, 6.283), rr = Math.sqrt(Math.random()) * ISLE_R * 0.96;
      var rx = Math.cos(ra) * rr, rz = Math.sin(ra) * rr;
      var rh = heightAt(rx, rz);
      if (rh < -0.6) continue;
      if (Math.hypot(rx - BEACON.x, rz - BEACON.z) < 16) continue;
      if (Math.hypot(rx - SPAWN.x, rz - SPAWN.z) < 10) continue;
      var sc = rand(0.35, 1.7);
      dummy.position.set(rx, rh + sc * 0.32, rz);
      dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      dummy.scale.set(sc, sc * rand(0.6, 1.1), sc);
      dummy.updateMatrix();
      rocks.setMatrixAt(ri, dummy.matrix);
      tmpCol.setHSL(0.09 + rand(-0.03, 0.03), 0.07 + rand(0, 0.06), 0.17 + rand(0, 0.11));
      rocks.setColorAt(ri, tmpCol);
      if (sc > 0.8) {
        colliders.push({ x: rx, z: rz, r: sc * 0.75 });
        blockers.push({ x: rx, z: rz, r: sc * 0.86, y0: rh + sc * 0.1, y1: rh + sc * 1.05 });
      }
      ri++;
    }
    rocks.count = ri;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    scene.add(rocks);

    /* bushes ------------------------------------------------------------ */
    var bushGeo = new T.IcosahedronGeometry(1, 0);
    var bushMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    var bushes = new T.InstancedMesh(bushGeo, bushMat, N_BUSH);
    bushes.castShadow = true;
    var bi = 0, bg = 0;
    while (bi < N_BUSH && bg++ < 44000) {
      var ba = rand(0, 6.283), br = Math.sqrt(Math.random()) * ISLE_R * 0.95;
      var bx = Math.cos(ba) * br, bz = Math.sin(ba) * br;
      var bh = heightAt(bx, bz);
      if (bh < 0.9) continue;
      if (Math.hypot(bx - BEACON.x, bz - BEACON.z) < 12) continue;
      if (Math.hypot(bx - SPAWN.x, bz - SPAWN.z) < 12) continue;
      var bs = rand(0.32, 0.9);
      dummy.position.set(bx, bh + bs * 0.28, bz);
      dummy.rotation.set(0, rand(0, 6.28), 0);
      dummy.scale.set(bs * 1.3, bs * 0.8, bs * 1.3);
      dummy.updateMatrix();
      bushes.setMatrixAt(bi, dummy.matrix);
      tmpCol.setHSL(0.3 + rand(-0.04, 0.02), 0.34 + rand(0, 0.14), 0.09 + rand(0, 0.07));
      bushes.setColorAt(bi, tmpCol);
      bi++;
    }
    bushes.count = bi;
    bushes.instanceMatrix.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    scene.add(bushes);

    /* alien crystals ---------------------------------------------------- */
    var crysGeo = new T.OctahedronGeometry(1, 0);
    var crysMat = new T.MeshStandardMaterial({
      color: 0xa46bff, emissive: 0x7a2bff, emissiveIntensity: 2.1,
      roughness: 0.3, metalness: 0.1, flatShading: true
    });
    var crys = new T.InstancedMesh(crysGeo, crysMat, 54);
    var ci = 0;
    for (var cc = 0; cc < 54; cc++) {
      var ca = rand(0, 6.283), cr = rand(6, 16);
      var cx = BEACON.x + Math.cos(ca) * cr;
      var cz = BEACON.z + Math.sin(ca) * cr;
      var ch = heightAt(cx, cz);
      var cs = rand(0.22, 0.85);
      dummy.position.set(cx, ch + cs * 0.6, cz);
      dummy.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
      dummy.scale.set(cs * 0.6, cs * 1.6, cs * 0.6);
      dummy.updateMatrix();
      crys.setMatrixAt(ci++, dummy.matrix);
    }
    crys.instanceMatrix.needsUpdate = true;
    scene.add(crys);

    /* crates + wreck near the crash site --------------------------------
       one instanced draw call instead of seventy separate boxes; on a phone
       the saved calls are worth more than the two original materials */
    var crateGeo = new T.BoxGeometry(1, 1, 1);
    var crateMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.28 });
    var crates = new T.InstancedMesh(crateGeo, crateMat, N_CRATE);
    crates.castShadow = true;
    crates.receiveShadow = true;
    var cA = new T.Color(0x5c5648), cB = new T.Color(0x2f4a52);
    var cCol = new T.Color();
    var cri = 0;
    for (var k = 0; k < N_CRATE; k++) {
      var ka = rand(0, 6.283), kr = rand(22, 118 * WS / 2.4);
      var kx = BEACON.x + Math.cos(ka) * kr, kz = BEACON.z + Math.sin(ka) * kr;
      var kh = heightAt(kx, kz);
      if (kh < 1) continue;
      var size = rand(1.0, 2.3);
      dummy.position.set(kx, kh + size * 0.5, kz);
      dummy.rotation.set(0, rand(0, 3.14), 0);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      crates.setMatrixAt(cri, dummy.matrix);
      cCol.copy(k % 3 === 0 ? cB : cA).multiplyScalar(rand(0.85, 1.15));
      crates.setColorAt(cri, cCol);
      cri++;
      colliders.push({ x: kx, z: kz, r: size * 0.7 });
      blockers.push({ x: kx, z: kz, r: size * 0.66, y0: kh, y1: kh + size });
    }
    crates.count = cri;
    crates.instanceMatrix.needsUpdate = true;
    if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
    scene.add(crates);

    /* broken basalt pillars -------------------------------------------- */
    var ruinMat = new T.MeshStandardMaterial({ color: 0x5b5766, roughness: 0.96, flatShading: true });
    var pillarGeo = new T.CylinderGeometry(0.62, 0.88, 1, 7, 1);
    pillarGeo.translate(0, 0.5, 0);
    var pillars = new T.InstancedMesh(pillarGeo, ruinMat, N_PILLAR);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    var rpi = 0, rpg = 0;
    while (rpi < N_PILLAR && rpg++ < 24000) {
      var rpa = rand(0, 6.283), rpr = Math.sqrt(Math.random()) * ISLE_R * 0.78;
      var rpx = Math.cos(rpa) * rpr, rpz = Math.sin(rpa) * rpr;
      var rph = heightAt(rpx, rpz);
      if (rph < 1.4) continue;
      if (Math.hypot(rpx - BEACON.x, rpz - BEACON.z) < 20) continue;
      var phgt = rand(2.4, 6.0);
      dummy.position.set(rpx, rph - 0.15, rpz);
      dummy.rotation.set(rand(-0.05, 0.05), rand(0, 6.28), rand(-0.07, 0.07));
      dummy.scale.set(rand(0.9, 1.6), phgt, rand(0.9, 1.6));
      dummy.updateMatrix();
      pillars.setMatrixAt(rpi++, dummy.matrix);
      colliders.push({ x: rpx, z: rpz, r: 1.0 });
      blockers.push({ x: rpx, z: rpz, r: 0.95, y0: rph - 0.2, y1: rph + phgt });
    }
    pillars.count = rpi;
    pillars.instanceMatrix.needsUpdate = true;
    scene.add(pillars);

    /* dead pines: thin cover with a real trunk ------------------------ */
    var deadMat = new T.MeshStandardMaterial({ color: 0x6d5b47, roughness: 1, flatShading: true });
    var deadGeo = new T.CylinderGeometry(0.13, 0.42, 5.2, 6, 1);
    deadGeo.translate(0, 2.6, 0);
    var deads = new T.InstancedMesh(deadGeo, deadMat, N_DEAD);
    deads.castShadow = true;
    var dti = 0, dtg = 0;
    while (dti < N_DEAD && dtg++ < 24000) {
      var dta = rand(0, 6.283), dtr = Math.sqrt(Math.random()) * ISLE_R * 0.9;
      var dtx = Math.cos(dta) * dtr, dtz = Math.sin(dta) * dtr;
      var dth = heightAt(dtx, dtz);
      if (dth < 1.2) continue;
      if (Math.hypot(dtx - BEACON.x, dtz - BEACON.z) < 16) continue;
      if (Math.hypot(dtx - SPAWN.x, dtz - SPAWN.z) < 6) continue;
      var dsc = rand(0.8, 1.5);
      dummy.position.set(dtx, dth - 0.1, dtz);
      dummy.rotation.set(rand(-0.09, 0.09), rand(0, 6.28), rand(-0.09, 0.09));
      dummy.scale.set(dsc, rand(0.8, 1.4), dsc);
      dummy.updateMatrix();
      deads.setMatrixAt(dti++, dummy.matrix);
      colliders.push({ x: dtx, z: dtz, r: 0.42 });
      blockers.push({ x: dtx, z: dtz, r: 0.36, y0: dth, y1: dth + 5.2 });
    }
    deads.count = dti;
    deads.instanceMatrix.needsUpdate = true;
    scene.add(deads);

    /* alien spore pods: glowing markers of the infestation -------------- */
    var podMat = new T.MeshStandardMaterial({ color: 0x8a5cff, emissive: 0x5a1fd6, emissiveIntensity: 1.5, roughness: 0.35, flatShading: true });
    var podGeo = new T.SphereGeometry(1, 7, 6);
    var pods = new T.InstancedMesh(podGeo, podMat, N_POD);
    var poi = 0;
    for (var pc = 0; pc < N_POD; pc++) {
      var poa = rand(0, 6.283), por = Math.sqrt(Math.random()) * ISLE_R * 0.86;
      var pox = Math.cos(poa) * por, poz = Math.sin(poa) * por;
      var poh = heightAt(pox, poz);
      if (poh < 0.6) continue;
      var pos = rand(0.35, 1.0);
      dummy.position.set(pox, poh + pos * 0.55, poz);
      dummy.rotation.set(rand(0, 3), rand(0, 6.28), rand(0, 3));
      dummy.scale.set(pos, pos * 1.25, pos);
      dummy.updateMatrix();
      pods.setMatrixAt(poi++, dummy.matrix);
    }
    pods.count = poi;
    pods.instanceMatrix.needsUpdate = true;
    scene.add(pods);

    /* alien relay (the objective landmark) ------------------------------ */
    var beacon = new T.Group();
    beacon.position.set(BEACON.x, BEACON_H, BEACON.z);
    var dark = new T.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.65 });
    var glowMat = new T.MeshStandardMaterial({ color: 0xc07bff, emissive: 0x9b3bff, emissiveIntensity: 2.6, roughness: 0.28, metalness: 0.1 });

    var base = new T.Mesh(new T.CylinderGeometry(3.1, 4.0, 1.1, 8), dark);
    base.position.y = 0.5;
    base.receiveShadow = true;
    beacon.add(base);

    for (var l = 0; l < 3; l++) {
      var ang = l * (Math.PI * 2 / 3);
      var leg = new T.Mesh(new T.BoxGeometry(0.42, 5.6, 0.42), dark);
      leg.position.set(Math.cos(ang) * 1.5, 3.1, Math.sin(ang) * 1.5);
      leg.rotation.z = Math.cos(ang) * 0.16;
      leg.rotation.x = -Math.sin(ang) * 0.16;
      leg.castShadow = true;
      beacon.add(leg);
    }

    var ring = new T.Mesh(new T.TorusGeometry(2.0, 0.16, 8, 40), glowMat);
    ring.position.y = 4.4;
    ring.rotation.x = Math.PI / 2;
    beacon.add(ring);

    var ring2 = new T.Mesh(new T.TorusGeometry(2.6, 0.09, 6, 40), glowMat);
    ring2.position.y = 5.6;
    ring2.rotation.x = Math.PI / 2.6;
    beacon.add(ring2);

    var core = new T.Mesh(new T.SphereGeometry(0.92, 16, 12), glowMat);
    core.position.y = 5.1;
    beacon.add(core);

    var beam = new T.Mesh(
      new T.CylinderGeometry(0.9, 2.6, 26, 12, 1, true),
      new T.MeshBasicMaterial({ color: 0x9b4bff, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })
    );
    beam.position.y = 15;
    beacon.add(beam);

    var bl = new T.PointLight(0xb46bff, 3.2, 34, 2);
    bl.position.y = 5.2;
    beacon.add(bl);

    scene.add(beacon);
    G.beacon = beacon;
    G.beaconRing = ring;
    G.beaconRing2 = ring2;
    G.beaconCore = core;
    G.beaconLight = bl;
    colliders.push({ x: BEACON.x, z: BEACON.z, r: 4.0 });
    blockers.push({ x: BEACON.x, z: BEACON.z, r: 3.4, y0: BEACON_H - 1, y1: BEACON_H + 7.5 });
  })();

  /* --------------------------------------------------------------- particles */
  var MAXP = 420;
  var parts = [];
  var pGeo = new T.BufferGeometry();
  var pPos = new Float32Array(MAXP * 3);
  var pCol = new Float32Array(MAXP * 3);
  for (var pi = 0; pi < MAXP; pi++) {
    parts.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, g: 0, r: 1, g2: 1, b: 1, size: 1 });
    pPos[pi * 3 + 1] = -999;
  }
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
  var points = new T.Points(pGeo, new T.PointsMaterial({
    size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true
  }));
  points.frustumCulled = false;
  scene.add(points);
  var pCursor = 0;

  function emit(x, y, z, n, color, speed, life, gravity) {
    var col = new T.Color(color);
    for (var i = 0; i < n; i++) {
      var p = parts[pCursor];
      pCursor = (pCursor + 1) % MAXP;
      var a = rand(0, 6.283), b = rand(-1, 1), s = rand(speed * 0.3, speed);
      var rr = Math.sqrt(1 - b * b);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * rr * s;
      p.vy = b * s + speed * 0.25;
      p.vz = Math.sin(a) * rr * s;
      p.life = p.max = life * rand(0.7, 1.25);
      p.g = gravity === undefined ? 9 : gravity;
      p.r = col.r; p.g2 = col.g; p.b = col.b;
      p.size = rand(0.6, 1.4);
    }
  }

  /* A cleave leaves a ring of light running along the ground: the visual proof
     that the cut covered a circle instead of a line. */
  function slashWave(color, at, radius) {
    var m = new T.Mesh(
      new T.RingGeometry(0.42, 0.62, 40),
      new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false, depthTest: false, blending: T.AdditiveBlending })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, at.y + 0.12, at.z);
    m.renderOrder = 995;
    scene.add(m);
    G.waves.push({ mesh: m, t: 0, r: radius });
  }

  function updateWaves(dt) {
    for (var i = G.waves.length - 1; i >= 0; i--) {
      var wv = G.waves[i];
      wv.t += dt;
      var k = wv.t / 0.34;
      wv.mesh.scale.setScalar(0.7 + k * wv.r);
      wv.mesh.material.opacity = Math.max(0, 0.6 * (1 - k));
      if (k >= 1) {
        scene.remove(wv.mesh);
        wv.mesh.geometry.dispose();
        wv.mesh.material.dispose();
        G.waves.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (var i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        pPos[i * 3 + 1] = -999;
        pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.985; p.vz *= 0.985;
      var f = p.life / p.max;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = p.r * f;
      pCol[i * 3 + 1] = p.g2 * f;
      pCol[i * 3 + 2] = p.b * f;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- weapons */
  var gunMaterial = {
    dark: new T.MeshStandardMaterial({ color: 0x39434f, roughness: 0.55, metalness: 0.55 }),
    mid: new T.MeshStandardMaterial({ color: 0x606d7d, roughness: 0.45, metalness: 0.7 }),
    metal: new T.MeshStandardMaterial({ color: 0xa2aebe, roughness: 0.3, metalness: 0.9 }),
    grip: new T.MeshStandardMaterial({ color: 0x1c232c, roughness: 0.9, metalness: 0.1 }),
    glow: new T.MeshStandardMaterial({ color: 0x9bf6ff, emissive: 0x38d6ff, emissiveIntensity: 2.2, roughness: 0.3 })
  };

  var flashTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g2 = c.getContext('2d');
    var grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,250,255,1)');
    grd.addColorStop(0.22, 'rgba(230,192,255,.95)');
    grd.addColorStop(0.55, 'rgba(150,70,255,.4)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();

  function mkBox(w, h, d, mat) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    return m;
  }
  function mkCyl(r1, r2, len, mat) {
    var m = new T.Mesh(new T.CylinderGeometry(r1, r2, len, 8), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function buildGun(kind) {
    /* ornate relic viewmodels come from relics3d.js; the block below stays as
       a plain fallback if that module ever fails to load. */
    if (window.RELIC3D) {
      var relic = RELIC3D.build(kind);
      var rg = relic.group;
      var mzPos = relic.muzzle.clone();
      var mzNode = new T.Object3D();
      mzNode.position.copy(mzPos);
      rg.add(mzNode);
      rg.userData.muzzle = mzNode;
      var fs = relic.flash || 0.34;
      var fl = new T.Mesh(
        new T.PlaneGeometry(fs, fs),
        new T.MeshBasicMaterial({ map: flashTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false })
      );
      fl.position.copy(mzPos);
      fl.visible = false;
      fl.renderOrder = 999;
      rg.add(fl);
      rg.userData.flash = fl;
      rg.userData.glows = relic.glows || [];
      /* bare weapon: the old gloved forearms read as two glowing tubes in the
         middle of the screen at this scale, so the relic is shown on its own */
      return rg;
    }
    var g = new T.Group();
    var muzzle = new T.Object3D();
    var mz = 0;

    if (kind === 'pistol') {
      var body = mkBox(0.075, 0.1, 0.3, gunMaterial.dark); body.position.set(0, 0, -0.06); g.add(body);
      var slide = mkBox(0.07, 0.045, 0.28, gunMaterial.mid); slide.position.set(0, 0.068, -0.06); g.add(slide);
      var grip = mkBox(0.068, 0.16, 0.085, gunMaterial.grip); grip.position.set(0, -0.115, 0.055); grip.rotation.x = -0.2; g.add(grip);
      var bar = mkCyl(0.017, 0.017, 0.1, gunMaterial.metal); bar.position.set(0, 0.068, -0.22); g.add(bar);
      mz = -0.27;
    } else if (kind === 'rifle') {
      var rBody = mkBox(0.085, 0.11, 0.72, gunMaterial.dark); rBody.position.set(0, 0, -0.1); g.add(rBody);
      var rRail = mkBox(0.06, 0.035, 0.5, gunMaterial.mid); rRail.position.set(0, 0.075, -0.1); g.add(rRail);
      var rMag = mkBox(0.055, 0.17, 0.11, gunMaterial.grip); rMag.position.set(0, -0.12, -0.03); rMag.rotation.x = 0.16; g.add(rMag);
      var rStock = mkBox(0.07, 0.1, 0.22, gunMaterial.mid); rStock.position.set(0, -0.02, 0.3); g.add(rStock);
      var rGrip = mkBox(0.06, 0.14, 0.08, gunMaterial.grip); rGrip.position.set(0, -0.1, 0.12); rGrip.rotation.x = -0.22; g.add(rGrip);
      var rBar = mkCyl(0.02, 0.02, 0.32, gunMaterial.metal); rBar.position.set(0, 0.005, -0.52); g.add(rBar);
      var rScope = mkBox(0.05, 0.05, 0.16, gunMaterial.mid); rScope.position.set(0, 0.105, -0.1); g.add(rScope);
      mz = -0.7;
    } else if (kind === 'shotgun') {
      var sBody = mkBox(0.095, 0.12, 0.6, gunMaterial.dark); sBody.position.set(0, 0, -0.02); g.add(sBody);
      var sB1 = mkCyl(0.028, 0.028, 0.66, gunMaterial.metal); sB1.position.set(-0.032, 0.045, -0.4); g.add(sB1);
      var sB2 = mkCyl(0.028, 0.028, 0.66, gunMaterial.metal); sB2.position.set(0.032, 0.045, -0.4); g.add(sB2);
      var sPump = mkBox(0.1, 0.075, 0.18, gunMaterial.grip); sPump.position.set(0, -0.03, -0.3); g.add(sPump);
      var sStock = mkBox(0.08, 0.11, 0.26, gunMaterial.mid); sStock.position.set(0, -0.02, 0.38); sStock.rotation.x = 0.08; g.add(sStock);
      mz = -0.72;
    } else {
      var pBody = mkBox(0.09, 0.1, 0.56, gunMaterial.dark); pBody.position.set(0, 0, -0.06); g.add(pBody);
      var tube = mkCyl(0.038, 0.038, 0.44, gunMaterial.glow); tube.position.set(0, 0.05, -0.34); g.add(tube);
      for (var i = 0; i < 3; i++) {
        var coil = new T.Mesh(new T.TorusGeometry(0.085, 0.018, 6, 14), gunMaterial.metal);
        coil.position.set(0, 0.05, -0.22 - i * 0.11);
        g.add(coil);
      }
      var pGrip = mkBox(0.06, 0.15, 0.08, gunMaterial.grip); pGrip.position.set(0, -0.1, 0.09); pGrip.rotation.x = -0.2; g.add(pGrip);
      var pStock = mkBox(0.07, 0.1, 0.2, gunMaterial.mid); pStock.position.set(0, 0, 0.28); g.add(pStock);
      mz = -0.6;
    }

    muzzle.position.set(0, kind === 'rifle' ? 0.005 : 0.05, mz);
    g.add(muzzle);
    g.userData.muzzle = muzzle;

    var flash = new T.Mesh(
      new T.PlaneGeometry(0.34, 0.34),
      new T.MeshBasicMaterial({ map: flashTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, depthTest: false })
    );
    flash.position.copy(muzzle.position);
    flash.visible = false;
    flash.renderOrder = 999;
    g.add(flash);
    g.userData.flash = flash;

    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return g;
  }

  /* the blade view-model: forged steel, a notched edge on the broken tier and
     a rune-lit fuller on the top two. Built once per tier and shown one at a
     time, exactly the way the guns used to be swapped. */
  /* Ten blades with their own silhouettes: a chipped starter sword, four
     straight tiers, a winged wind blade, a jagged ice edge, a war hammer and
     two glowing endgame pieces. Colour, thickness and ornaments carry the
     identity; the stats carry the feel. */
  function buildSword(kind) {
    var w = null;
    for (var i = 0; i < WEAPONS.length; i++) if (WEAPONS[i].key === kind) w = WEAPONS[i];
    var tier = w ? w.tier : 1;
    var look = (w && w.look) || 'iron';
    var g = new T.Group();

    var steelCol = 0xc9d2df, glowCol = 0x000000, glowK = 0, guardCol = 0xf0b94a;
    if (look === 'broken') { steelCol = 0x8f959e; guardCol = 0x6b6047; }
    else if (look === 'gale') { steelCol = 0xd8fff4; guardCol = 0x6ac9b0; glowCol = 0x2affc4; glowK = 0.4; }
    else if (look === 'frost') { steelCol = 0xcaf6ff; guardCol = 0x7ab8d8; glowCol = 0x2ad4ff; glowK = 0.55; }
    else if (look === 'ember') { steelCol = 0xffd0a0; guardCol = 0xffa040; glowCol = 0xff6a10; glowK = 0.8; }
    else if (look === 'blood') { steelCol = 0xe0b0b8; guardCol = 0x8a2030; glowCol = 0xff1a3a; glowK = 0.6; }
    else if (look === 'sun') { steelCol = 0xfff0c0; guardCol = 0xffd166; glowCol = 0xffa000; glowK = 0.95; }
    else if (look === 'legend') { steelCol = 0xe8eeff; guardCol = 0xffe9a8; glowCol = 0xfff6d8; glowK = 0.45; }
    else if (look === 'silver') { steelCol = 0xe8f2ff; guardCol = 0xd8c79a; glowCol = 0x4a7ac0; glowK = 0.4; }
    else if (look === 'iron') { steelCol = 0xbfc9d6; guardCol = 0x8a7a5a; glowCol = 0x2a4a6a; glowK = 0.12; }
    else if (look === 'hammer') { steelCol = 0xaab6c6; guardCol = 0xc9914a; glowCol = 0xffa040; glowK = 0.22; }

    var steel = new T.MeshStandardMaterial({ color: steelCol, metalness: 0.6, roughness: look === 'broken' ? 0.62 : 0.26, envMapIntensity: 1.35 });
    if (glowK) { steel.emissive = new T.Color(glowCol); steel.emissiveIntensity = glowK; }
    var brass = new T.MeshStandardMaterial({ color: guardCol, metalness: 0.55, roughness: 0.42, emissive: new T.Color(glowCol), emissiveIntensity: glowK * 0.45 });
    var leather = new T.MeshStandardMaterial({ color: 0x2a1e18, roughness: 0.95 });

    if (look === 'hammer') {
      var haft = new T.Mesh(new T.CylinderGeometry(0.03, 0.036, 0.96, 8), leather);
      haft.position.y = 0.36;
      g.add(haft);
      var head = new T.Mesh(new T.BoxGeometry(0.3, 0.22, 0.24), steel);
      head.position.y = 0.88;
      g.add(head);
      [-0.085, 0.085].forEach(function (x) {
        var band = new T.Mesh(new T.BoxGeometry(0.045, 0.245, 0.26), brass);
        band.position.set(x, 0.88, 0);
        g.add(band);
      });
      var spike = new T.Mesh(new T.ConeGeometry(0.075, 0.24, 4), steel);
      spike.position.y = 1.1;
      g.add(spike);
      var cap = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), brass);
      cap.position.y = -0.16;
      g.add(cap);
      var hammerTip = new T.Object3D();
      hammerTip.position.y = 1.1;
      g.add(hammerTip);
      g.userData.muzzle = hammerTip;
      g.userData.glows = [];
      g.userData.tier = tier;
      g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      return g;
    }

    var len = look === 'gale' ? 0.74 : look === 'legend' ? 0.8 : look === 'frost' ? 0.68 : (look === 'sun' ? 0.78 : (look === 'silver' ? 0.72 : (look === 'ember' ? 0.74 : 0.6 + tier * 0.04)));
    var wide = look === 'gale' ? 0.048 : (look === 'sun' || look === 'legend') ? 0.088 : 0.072;
    var blade = new T.Mesh(new T.BoxGeometry(wide, len, 0.018), steel);
    blade.position.y = len * 0.5 + 0.1;
    g.add(blade);
    var tip = new T.Mesh(new T.ConeGeometry(wide * 0.64, 0.2, 4), steel);
    tip.position.y = len + 0.19;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
    var fuller = new T.Mesh(new T.BoxGeometry(0.012, len * 0.8, 0.02), new T.MeshStandardMaterial({ color: look === 'blood' ? 0x4a0810 : 0x6f7a8a, metalness: 0.7, roughness: 0.5 }));
    fuller.position.y = len * 0.5 + 0.08;
    g.add(fuller);
    var edge = new T.Mesh(
      new T.BoxGeometry(0.016, len * 0.98, 0.012),
      new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.1, emissive: new T.Color(glowK ? glowCol : 0x9fb6cc), emissiveIntensity: glowK ? glowK * 0.9 : 0.15 })
    );
    edge.position.set(wide * 0.4, len * 0.5 + 0.1, 0);
    g.add(edge);

    if (look === 'broken') {
      var chip = new T.Mesh(new T.BoxGeometry(0.056, 0.035, 0.018), new T.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 }));
      chip.position.set(0, len * 0.62, 0);
      g.add(chip);
    }
    if (look === 'frost') {
      for (var f = 0; f < 4; f++) {
        var icicle = new T.Mesh(new T.ConeGeometry(0.026, 0.14 - f * 0.02, 5), new T.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x2ad4ff, emissiveIntensity: 1.2, roughness: 0.2 }));
        icicle.position.set(-wide * 0.6, len * (0.25 + f * 0.16), 0);
        icicle.rotation.z = 1.1;
        g.add(icicle);
      }
    }
    if (look === 'gale') {
      [-1, 1].forEach(function (s) {
        var wing = new T.Mesh(new T.BoxGeometry(0.11, 0.02, 0.06), brass);
        wing.position.set(s * 0.12, 0.1, 0);
        wing.rotation.z = s * 0.5;
        g.add(wing);
      });
    }
    if (look === 'sun' || look === 'legend') {
      for (var r = 0; r < 3; r++) {
        var rune = new T.Mesh(new T.BoxGeometry(0.03, 0.016, 0.021), new T.MeshBasicMaterial({ color: glowCol }));
        rune.position.set(0, len * (0.3 + r * 0.2), 0.011);
        g.add(rune);
      }
      var crown = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshBasicMaterial({ color: glowCol }));
      crown.position.y = len + 0.3;
      g.add(crown);
    }
    var guardW = look === 'legend' ? 0.34 : look === 'gale' ? 0.3 : 0.22 + tier * 0.012;
    var guard = new T.Mesh(new T.BoxGeometry(guardW, 0.038, 0.055), brass);
    guard.position.y = 0.095;
    g.add(guard);
    var grip = new T.Mesh(new T.CylinderGeometry(0.024, 0.028, 0.18, 8), leather);
    grip.position.y = -0.005;
    g.add(grip);
    var pommel = new T.Mesh(new T.SphereGeometry(0.036, 8, 6), brass);
    pommel.position.y = -0.105;
    g.add(pommel);
    var gem = new T.Mesh(new T.IcosahedronGeometry(0.028, 0), new T.MeshBasicMaterial({ color: glowK ? glowCol : 0x9be8ff }));
    gem.position.set(0, 0.095, 0.04);
    g.add(gem);
    var tipNode = new T.Object3D();
    tipNode.position.y = len + 0.26;
    g.add(tipNode);
    g.userData.muzzle = tipNode;
    g.userData.glows = [];
    g.userData.tier = tier;
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return g;
  }

  var guns = WEAPONS.map(function (w) { return buildSword(w.key); });
  guns.forEach(function (g, i) {
    g.position.set(IS_TOUCH ? -0.04 : 0.24, IS_TOUCH ? -0.56 : -0.5, IS_TOUCH ? -0.54 : -0.62);
    g.scale.setScalar(IS_TOUCH ? 0.32 : 0.44);
    g.rotation.set(-0.06, IS_TOUCH ? 0.95 : 0.3, IS_TOUCH ? 0.28 : 0.42);
    g.visible = i === 0;
    camera.add(g);
  });
  /* held poses: idle low-left, guard (right-click / aim) raised, sprint tucked */
  /* on a phone the right third is the button pad, so the blade waits in the
     gap between the thumbstick and the trigger, low enough to stay clear */
  var SWORD_HIP = IS_TOUCH ? new T.Vector3(-0.04, -0.56, -0.54) : new T.Vector3(0.24, -0.5, -0.62);
  var SWORD_GUARD = IS_TOUCH ? new T.Vector3(-0.02, -0.44, -0.5) : new T.Vector3(0.08, -0.34, -0.5);
  var SWORD_SPRINT = IS_TOUCH ? new T.Vector3(0.06, -0.6, -0.52) : new T.Vector3(0.34, -0.56, -0.54);
  var SWORD_RZ = IS_TOUCH ? 0.28 : 0.42;
  var SWORD_RZ_AIM = IS_TOUCH ? 0.02 : 0.2;

  /* the white arc that follows a swing: a cheap additive ring sector that is
     only visible for a quarter of a second */
  var slashMat = new T.MeshBasicMaterial({
    color: 0xe8f8ff, transparent: true, opacity: 0,
    blending: T.AdditiveBlending, depthWrite: false, depthTest: false, side: T.DoubleSide
  });
  var slashMesh = new T.Mesh(new T.RingGeometry(0.38, 0.72, 26, 1, -0.6, 2.4), slashMat);
  slashMesh.position.set(-0.02, -0.1, -0.78);
  slashMesh.renderOrder = 998;
  slashMesh.visible = false;
  camera.add(slashMesh);

  /* lamps on the viewmodel so the blackened metal still shows its engraving */
  var viewLight = new T.PointLight(0xdccaff, 0.7, 2.6, 2);
  viewLight.position.set(0.36, 0.24, -0.62);
  camera.add(viewLight);
  var viewFill = new T.PointLight(0xa06bff, 0.18, 2.4, 2);
  viewFill.position.set(-0.26, 0.1, -0.55);
  camera.add(viewFill);

  /* a real flash that lights the world for a frame or two — the single
     biggest reason a shot reads as powerful instead of decorative */
  var muzzleLight = new T.PointLight(0xffd9a0, 0, 11, 2);
  muzzleLight.position.set(0.1, -0.02, -0.75);
  camera.add(muzzleLight);

  /* a warm headlamp that wakes up at dusk: night on a dark island needs one */
  var torch = new T.PointLight(0xffe6c8, 0, 30, 2);
  torch.position.set(0.25, -0.05, -0.5);
  camera.add(torch);

  /* ----------------------------------------------------------------- enemies */
  var eboltGeo = new T.SphereGeometry(0.16, 8, 6);
  var eboltMat = new T.MeshBasicMaterial({ color: 0xff5b8a });
  var boltGeo = new T.SphereGeometry(0.18, 10, 8);
  var boltMat = new T.MeshBasicMaterial({ color: 0x9bf6ff });

  function buildAlienLegacy(kind, elite, d) {
    var group = new T.Group();
    var mat = new T.MeshStandardMaterial({
      color: d.color, roughness: 0.72, metalness: 0.2,
      emissive: new T.Color(d.glow), emissiveIntensity: 0.55, flatShading: true
    });
    var eyeMat = new T.MeshBasicMaterial({ color: 0xffc46b });

    var torso = new T.Mesh(new T.IcosahedronGeometry(d.r * 0.82, 0), mat);
    torso.scale.set(1, 1.22, 0.92);
    torso.position.y = d.h * 0.56;
    torso.castShadow = true;
    group.add(torso);

    var head = new T.Mesh(new T.IcosahedronGeometry(d.r * 0.44, 0), mat);
    head.position.y = d.h * 0.9;
    head.castShadow = true;
    group.add(head);

    var e1 = new T.Mesh(new T.SphereGeometry(d.r * 0.11, 6, 5), eyeMat);
    e1.position.set(-d.r * 0.17, d.h * 0.92, d.r * 0.36);
    group.add(e1);
    var e2 = e1.clone();
    e2.position.x = d.r * 0.17;
    group.add(e2);

    var armGeo = new T.CapsuleGeometry(d.r * 0.15, d.h * 0.34, 3, 6);
    var armL = new T.Mesh(armGeo, mat);
    armL.position.set(-d.r * 0.76, d.h * 0.6, 0);
    armL.rotation.z = 0.14;
    armL.castShadow = true;
    group.add(armL);
    var armR = new T.Mesh(armGeo, mat);
    armR.position.set(d.r * 0.76, d.h * 0.6, 0);
    armR.rotation.z = -0.14;
    armR.castShadow = true;
    group.add(armR);

    /* dark carapace plates read as armour on the heavier breeds */
    if (d.r >= 0.66 || d.boss) {
      var plateMat = new T.MeshStandardMaterial({
        color: 0x2b3040, roughness: 0.5, metalness: 0.45, flatShading: true,
        emissive: new T.Color(d.glow), emissiveIntensity: 0.25
      });
      for (var pl = 0; pl < 3; pl++) {
        var plate = new T.Mesh(new T.BoxGeometry(d.r * 1.15, d.r * 0.22, d.r * 0.24), plateMat);
        plate.position.set(0, d.h * (0.4 + pl * 0.16), d.r * (0.5 + pl * 0.03));
        plate.rotation.x = -0.25;
        plate.castShadow = true;
        group.add(plate);
      }
    }

    var legGeo = new T.CapsuleGeometry(d.r * 0.18, d.h * 0.34, 3, 6);
    var legL = new T.Mesh(legGeo, mat);
    legL.position.set(-d.r * 0.34, d.h * 0.24, 0);
    legL.castShadow = true;
    group.add(legL);
    var legR = new T.Mesh(legGeo, mat);
    legR.position.set(d.r * 0.34, d.h * 0.24, 0);
    legR.castShadow = true;
    group.add(legR);

    if (d.charge) {
      for (var s = 0; s < 5; s++) {
        var spike = new T.Mesh(new T.ConeGeometry(d.r * 0.14, d.r * 0.6, 4), mat);
        spike.position.set(rand(-0.8, 0.8) * d.r, d.h * (0.5 + s * 0.09), -d.r * 0.55);
        spike.rotation.x = -1.3;
        group.add(spike);
      }
    }
    if (d.boss) {
      var crown = new T.Mesh(new T.TorusGeometry(d.r * 0.9, d.r * 0.07, 6, 24), mat);
      crown.position.y = d.h * 0.72;
      crown.rotation.x = Math.PI / 2;
      group.add(crown);
      var bossCore = new T.Mesh(new T.SphereGeometry(d.r * 0.3, 10, 8), new T.MeshBasicMaterial({ color: 0xffd0ff }));
      bossCore.position.set(0, d.h * 0.6, d.r * 0.5);
      group.add(bossCore);
    }
    if (elite) {
      var aura = new T.Mesh(
        new T.TorusGeometry(d.r * 1.05, 0.035, 6, 28),
        new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })
      );
      aura.position.y = d.h * 0.5;
      aura.rotation.x = Math.PI / 2;
      group.add(aura);
      group.userData.aura = aura;
      mat.emissive.setHex(0x8a6a10);
      mat.emissiveIntensity = 0.9;
    }

    group.userData.mat = mat;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.head = head;
    group.userData.torso = torso;

    /* health bar */
    if (!d.boss) {
      var bar = new T.Group();
      var bgGeo = new T.PlaneGeometry(1, 0.06);
      var bg = new T.Mesh(bgGeo, new T.MeshBasicMaterial({ color: 0x0a1118, transparent: true, opacity: 0.7, depthWrite: false }));
      var fillGeo = new T.PlaneGeometry(1, 0.06);
      fillGeo.translate(0.5, 0, 0);
      var fill = new T.Mesh(fillGeo, new T.MeshBasicMaterial({ color: 0xff5b6e, depthWrite: false, transparent: true }));
      fill.position.x = -0.5;
      bar.add(bg, fill);
      bar.position.y = d.h + 0.32;
      bar.visible = false;
      group.add(bar);
      group.userData.bar = bar;
      group.userData.barFill = fill;
    }

    return group;
  }

  /* the breeds themselves are modelled in aliens3d.js; this wraps them with the
     health bar and the elite aura the simulation expects */
  function buildAlien(kind, elite, d) {
    /* real rigged GLB actors when the model pack has finished loading */
    var view = (window.MODELS3D && MODELS3D.ready(kind)) ? MODELS3D.view(kind) : null;
    if (view) return buildAlienModel(view, elite, d);

    var built = (window.ALIEN3D && ALIEN3D.build) ? ALIEN3D.build(kind, elite, d) : null;
    if (!built) return buildAlienLegacy(kind, elite, d);

    var group = built.group;
    var mat = built.mat;

    if (elite) {
      var aura = new T.Mesh(
        new T.TorusGeometry(d.r * 1.05, 0.035, 6, 28),
        new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })
      );
      aura.position.y = d.h * 0.5;
      aura.rotation.x = Math.PI / 2;
      group.add(aura);
      group.userData.aura = aura;
      mat.emissive.setHex(0x8a6a10);
      mat.emissiveIntensity = 0.9;
    }

    group.userData.mat = mat;
    group.userData.armL = built.armL;
    group.userData.armR = built.armR;
    group.userData.legL = built.legL;
    group.userData.legR = built.legR;
    group.userData.head = built.head;
    group.userData.torso = built.torso;

    if (!d.boss) {
      var bar = new T.Group();
      var bg = new T.Mesh(new T.PlaneGeometry(1, 0.06), new T.MeshBasicMaterial({ color: 0x0a1118, transparent: true, opacity: 0.7, depthWrite: false }));
      var fillGeo = new T.PlaneGeometry(1, 0.06);
      fillGeo.translate(0.5, 0, 0);
      var fill = new T.Mesh(fillGeo, new T.MeshBasicMaterial({ color: 0xff5b6e, depthWrite: false, transparent: true }));
      fill.position.x = -0.5;
      bar.add(bg, fill);
      bar.position.y = d.h + 0.32;
      bar.visible = false;
      group.add(bar);
      group.userData.bar = bar;
      group.userData.barFill = fill;
    }

    return group;
  }

  function buildAlienModel(view, elite, d) {
    var group = view.root;
    var mats = view.mats;
    group.userData.mat = mats[0];
    group.userData.mats = mats;
    group.userData.view = view;
    group.userData.armL = group.userData.armR = null;
    group.userData.legL = group.userData.legR = null;
    group.userData.head = group.userData.torso = null;

    if (elite) {
      var aura = new T.Mesh(
        new T.TorusGeometry(d.r * 1.15, 0.04, 6, 30),
        new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })
      );
      aura.position.y = d.h * 0.5;
      aura.rotation.x = Math.PI / 2;
      group.add(aura);
      group.userData.aura = aura;
      for (var i = 0; i < mats.length; i++) {
        mats[i].emissive.setHex(0x8a6a10);
        mats[i].emissiveIntensity = 0.85;
      }
    }

    if (!d.boss) {
      var bar = new T.Group();
      var bg = new T.Mesh(new T.PlaneGeometry(1, 0.06), new T.MeshBasicMaterial({ color: 0x0a1118, transparent: true, opacity: 0.7, depthWrite: false }));
      var fillGeo = new T.PlaneGeometry(1, 0.06);
      fillGeo.translate(0.5, 0, 0);
      var fill = new T.Mesh(fillGeo, new T.MeshBasicMaterial({ color: 0xff5b6e, depthWrite: false, transparent: true }));
      fill.position.x = -0.5;
      bar.add(bg, fill);
      bar.position.y = d.h + 0.34;
      bar.visible = false;
      group.add(bar);
      group.userData.bar = bar;
      group.userData.barFill = fill;
    }
    return group;
  }

  function spawnEnemy(kind, x, z, elite, leader) {
    var d = ENEMY[kind];
    var g = buildAlien(kind, elite || leader, d);
    var y = heightAt(x, z);
    g.position.set(x, y, z);
    if (elite) g.scale.setScalar(1.13);
    if (leader) g.scale.setScalar(1.32);
    scene.add(g);
    var mul = leader ? 2.2 : (elite ? 1.9 : 1);
    var hp = Math.round(d.hp * mul * (G.hpScale || 1));
    var e = {
      kind: kind, def: d, group: g, elite: !!elite, leader: !!leader,
      invis: !!d.invis, name: leader ? 'سرگروه' : d.name,
      pos: new T.Vector3(x, y, z), px: x, pz: z,
      hp: hp, maxHp: hp,
      cd: rand(0.7, 1.9), t: rand(0, 6.28), flash: 0,
      state: 'walk', stateT: 0, dead: false, dying: 0,
      age: 0, stagger: 0, flank: rand(-1, 1), flankT: rand(1.2, 3.2),
      burst: 0, burstT: 0, alarm: 0,
      bob: rand(0, 6.28), hitT: 0,
      home: { x: x, z: z }, zone: null,
      aggro: false, aggroT: 0, noticeT: 0, backoff: 0, tr: rand(0, 6.28),
      /* sky: -1 grounded, >0 still falling in; pro: one of the twenty */
      sky: -1, pro: false, poise: false, combo: 0, lunge: 0, guardT: 0, slot: null
    };
    g.userData.enemy = e;
    G.enemies.push(e);
    return e;
  }

  function aliveCount() {
    var n = 0;
    for (var i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead) n++;
    return n;
  }

  function removeEnemy(e) {
    scene.remove(e.group);
    if (e.group.userData.view) e.group.userData.view.dispose();
    e.group.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry && !o.geometry.userDataShared) o.geometry.dispose();
        if (o.material && o.material.userDataShared !== true && o.material.dispose) o.material.dispose();
      }
    });
  }

  /* `by` is the enemy that swung. Player hits leave it undefined, and the
     only difference between the two is who collects the reward - the island
     does not care whether a blade is held by a human or a bot. */
  function damageEnemy(e, dmg, hitPoint, head, by) {
    if (e.dead) return;
    if (!by) dmg *= (G.dmgMul || 1) * (1 + 0.12 * (G.upg.dmg || 0));
    if (by && by !== e && !by.dead) {
      /* the duel is mutual: the victim turns on whoever cut it */
      e.foe = by;
      e.foeT = 5;
      emit(e.pos.x, e.pos.y + e.def.h * 0.5, e.pos.z, 3, 0xffd166, 3, 0.3, 6);
    }
    /* a hunter with its blade up eats part of the cut */
    if (e.guardT > 0) dmg *= 0.45;
    e.hp -= dmg;
    e.flash = 1;
    e.hitT = 0.12;
    if (e.group.userData.view && e.group.userData.view.flinch) e.group.userData.view.flinch();
    /* cut by the player is a good reason to fight back; a bot cutting a bot is
       their own quarrel, and must not drag the whole camp onto the player */
    if (!by && !e.aggro) aggroEnemy(e);
    /* heavy hits shove the target back and interrupt a wind-up */
    if (!e.def.boss) e.stagger = Math.max(e.stagger, Math.min(0.42, dmg / 150) * (e.poise ? 0.35 : 1));
    if (e.state === 'wind') { e.state = 'walk'; e.cd = 0.7; }
    SFX3D.play(head ? 'headshot' : 'hit', e.pos);
    if (hitPoint) {
      emit(hitPoint.x, hitPoint.y, hitPoint.z, head ? 9 : 5, head ? 0xffd166 : 0xff7a5b, head ? 7 : 5, 0.45, 8);
      emit(hitPoint.x, hitPoint.y, hitPoint.z, head ? 3 : 2, 0xffffff, 2.5, 0.25, 4);
    }
    if (e.hp <= 0) killEnemy(e, by);
  }

  function killEnemy(e, by) {
    if (e.dead) return;
    e.dead = true;
    e.dying = e.group.userData.view ? 1.5 : 0.9;
    if (e.group.userData.view) {
      e.group.userData.view.die();
      e.group.userData.view.tick(0.02);
    }
    if (e.bountyCrown) e.bountyCrown.visible = false;
    var botKill = !!(by && by !== e && !by.dead);
    if (botKill) {
      /* a bot collected: money in its pocket, a better blade in its hand */
      by.gold = (by.gold || 0) + (e.bounty ? (G.bounty ? G.bounty.pay : 3) : 1);
      if (e.bounty) botCleared(by, e);
      else if (by.gold % 3 === 0) upgradeBot(by, 0);   /* three ordinary kills buy a blade too */
    } else {
      G.kills++;
      /* kill chain: staying on the trigger makes every shot hurt more */
      G.combo = G.comboT > 0 ? G.combo + 1 : 1;
      G.comboT = 2.6;
      G.dmgMul = 1 + Math.min(0.7, (G.combo - 1) * 0.09);
      if (G.combo > G.comboBest) G.comboBest = G.combo;
      if (e.bounty) bountyCleared(e);
      if (G.kills % 15 === 0) {
        G.stamMax = Math.min(9, G.stamMax + 1);
        G.stam = G.stamMax;
        showBanner('نفسِ بلندتر', 'ظرفیت ضربه‌ها شد ' + fa(G.stamMax), 1700);
        SFX3D.play('wave');
      }
    }
    var color = e.def.color;
    emit(e.pos.x, e.pos.y + e.def.h * 0.5, e.pos.z, 22, color, 9, 0.75, 10);
    emit(e.pos.x, e.pos.y + e.def.h * 0.5, e.pos.z, 8, 0xffffff, 6, 0.4, 6);
    SFX3D.play('kill', e.pos);
    if (e.group.userData.bar) e.group.userData.bar.visible = false;
    /* a named hunter is not gone: the sky owes us ten seconds */
    if (e.hunterDef && e.slot) {
      e.slot.e = null;
      e.slot.timer = HUNTER_RESPAWN;
      e.slot.deaths++;
      if (!botKill) {
        G.parts += 2;
        G.hunterKills = (G.hunterKills || 0) + 1;
        showBanner('شکارچی افتاد · ' + e.name, 'ده ثانیه بعد از آسمان برمی‌گردد · قطعه +۲', 2000);
      }
    }
    dropLoot(e);
    if (e.def.boss) {
      SFX3D.play('explode', e.pos);
      G.shake = 1.4;
    }
  }

  /* Every corpse can be looted. A body always leaves breath (نفس) - the blade
     economy's fuel - and sergeants and bosses leave parts and kits as well.
     Walk over the pile and it is yours; that is the "غارت" loop. */
  function dropLoot(e) {
    spawnPickup('stam', e.pos.x, e.pos.z);
    if (e.leader || e.def.boss) spawnPickup('part', e.pos.x + 1.0, e.pos.z + 0.5);
    if (e.def.boss) {
      spawnPickup('stam', e.pos.x - 2, e.pos.z + 1.2);
      spawnPickup('med', e.pos.x + 2, e.pos.z + 1.2);
      return;
    }
    if (Math.random() < (e.elite ? 0.7 : 0.4)) spawnPickup('med', e.pos.x - 1.0, e.pos.z + 0.5);
    if (Math.random() < 0.35) spawnPickup('part', e.pos.x + 0.5, e.pos.z - 1.1);
    /* hunters carry the good stuff: a body worth cutting down twice */
    if (Math.random() < (e.hunterDef ? 0.9 : e.leader ? 0.5 : 0.14)) {
      spawnPickup(pick(['bomb', 'shield', 'rage']), e.pos.x + rand(-1, 1), e.pos.z + rand(-1, 1));
    }
    /* a named hunter occasionally carries the next blade in the chain */
    if (e.hunterDef && Math.random() < 0.22) {
      var nl = nextLockedSword();
      if (nl) spawnPickup(nl.key, e.pos.x + rand(-1.4, 1.4), e.pos.z + rand(-1.4, 1.4));
    }
  }

  /* ---------------------------------------------------------------- pickups */
  var pickupGeoAmmo = new T.BoxGeometry(0.5, 0.28, 0.4);
  var pickupGeoMed = new T.BoxGeometry(0.46, 0.3, 0.36);
  var pickupGeoGun = new T.BoxGeometry(0.78, 0.24, 0.3);
  var     PICKUP_COL = {
    med: [0x7dffb0, 0x1fa85c], ammo: [0xffd479, 0xa8741a], part: [0xc9b3ff, 0x6a3ec9],
    stam: [0x9dffe0, 0x1f9a7a], broken: [0xa8b4c2, 0x3a4450], iron: [0xbfe9ff, 0x2a6a9a],
    silver: [0xdceaff, 0x4a6aa8], ember: [0xffb35c, 0xa8541a],
    gale: [0x9dffe0, 0x1f8a6a], frost: [0x8ff0ff, 0x1a7aa8], blood: [0xff8a9a, 0x8a0a1a],
    hammer: [0xffd166, 0x8a6414], sun: [0xffe08a, 0xa86a00], legend: [0xffffff, 0x8a8aa8],
    bomb: [0xffb35c, 0x8a2a00], shield: [0x8ff0ff, 0x1a6a9a], rage: [0xff5b6e, 0x8a0a1a],
    rifle: [0x9fe8ff, 0x2a7ea8], shotgun: [0xffb27a, 0xa85a1a], plasma: [0xc9a6ff, 0x5a2aa8]
  };

  var pickupMat = {
    med: new T.MeshStandardMaterial({ color: 0xe9fff4, roughness: 0.5, metalness: 0.12, emissive: 0x1fa85c, emissiveIntensity: 0.22 }),
    medCross: new T.MeshStandardMaterial({ color: 0x3dffa0, emissive: 0x2dff8a, emissiveIntensity: 1.7, roughness: 0.35 }),
    ammo: new T.MeshStandardMaterial({ color: 0x4d4f3c, roughness: 0.68, metalness: 0.6 }),
    ammoBand: new T.MeshStandardMaterial({ color: 0xffcf6a, emissive: 0x8a6414, emissiveIntensity: 0.9, metalness: 0.65, roughness: 0.32 }),
    brass: new T.MeshStandardMaterial({ color: 0xd9b04a, metalness: 0.9, roughness: 0.26, emissive: 0x5a3b06, emissiveIntensity: 0.45 }),
    partGlow: new T.MeshStandardMaterial({ color: 0xd9c8ff, emissive: 0x8a4bff, emissiveIntensity: 2.1, roughness: 0.3, metalness: 0.3 })
  };
  var gunPickupMat = {};

  /* Crates you can read across the island: a white case with a glowing green
     cross for health, a banded metal box with brass rounds for ammo. */
  function buildPickupMesh(kind) {
    var g = new T.Group();
    if (kind === 'med') {
      var body = new T.Mesh(pickupGeoMed, pickupMat.med);
      body.castShadow = true;
      g.add(body);
      var c1 = new T.Mesh(new T.BoxGeometry(0.3, 0.05, 0.09), pickupMat.medCross);
      c1.position.y = 0.165;
      g.add(c1);
      var c2 = new T.Mesh(new T.BoxGeometry(0.09, 0.05, 0.25), pickupMat.medCross);
      c2.position.y = 0.165;
      g.add(c2);
      return g;
    }
    if (kind === 'ammo') {
      var box = new T.Mesh(pickupGeoAmmo, pickupMat.ammo);
      box.castShadow = true;
      g.add(box);
      var band = new T.Mesh(new T.BoxGeometry(0.52, 0.07, 0.42), pickupMat.ammoBand);
      band.position.y = 0.08;
      g.add(band);
      for (var i = 0; i < 3; i++) {
        var round = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.22, 6), pickupMat.brass);
        round.position.set(-0.15 + i * 0.15, 0.2, 0.08);
        g.add(round);
      }
      return g;
    }
    if (kind === 'part') {
      var shell = new T.Mesh(new T.BoxGeometry(0.4, 0.26, 0.4), pickupMat.ammo);
      shell.castShadow = true;
      g.add(shell);
      var core = new T.Mesh(new T.BoxGeometry(0.22, 0.22, 0.22), pickupMat.partGlow);
      core.position.y = 0.2;
      core.rotation.y = Math.PI / 4;
      g.add(core);
      var bolt1 = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.44, 5), pickupMat.brass);
      bolt1.rotation.z = Math.PI / 2;
      bolt1.position.y = 0.14;
      g.add(bolt1);
      return g;
    }
    if (kind === 'stam') {
      /* a breath flask: the common drop from a cut-down body */
      var flask = new T.Mesh(
        new T.CylinderGeometry(0.12, 0.16, 0.34, 10),
        new T.MeshStandardMaterial({ color: 0x0e3a34, roughness: 0.35, metalness: 0.35 })
      );
      flask.position.y = 0.04;
      g.add(flask);
      var brew = new T.Mesh(
        new T.SphereGeometry(0.13, 10, 8),
        new T.MeshStandardMaterial({ color: 0x9dffe0, emissive: 0x2affc4, emissiveIntensity: 1.6, roughness: 0.25 })
      );
      brew.position.y = 0.24;
      g.add(brew);
      var cork = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.08, 8), pickupMat.brass);
      cork.position.y = 0.36;
      g.add(cork);
      return g;
    }
    /* ---------- consumables: a bomb, a ward, a rage draught ---------- */
    if (kind === 'bomb') {
      var orb = new T.Mesh(new T.SphereGeometry(0.26, 12, 10), new T.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.55, metalness: 0.4 }));
      orb.position.y = 0.22;
      orb.castShadow = true;
      g.add(orb);
      var fuse = new T.Mesh(new T.CylinderGeometry(0.026, 0.03, 0.22, 6), pickupMat.brass);
      fuse.position.set(0, 0.46, 0);
      fuse.rotation.z = 0.3;
      g.add(fuse);
      var spark = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({ color: 0xffb03a }));
      spark.position.set(0.06, 0.56, 0);
      g.add(spark);
      return g;
    }
    if (kind === 'shield') {
      var disc = new T.Mesh(
        new T.CylinderGeometry(0.3, 0.3, 0.07, 14),
        new T.MeshStandardMaterial({ color: 0x9be8ff, emissive: 0x1a6a9a, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.25 })
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.y = 0.28;
      g.add(disc);
      var boss = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), pickupMat.brass);
      boss.position.set(0.05, 0.28, 0);
      g.add(boss);
      return g;
    }
    if (kind === 'rage') {
      var vial = new T.Mesh(new T.CylinderGeometry(0.1, 0.13, 0.32, 10), new T.MeshStandardMaterial({ color: 0x30060c, roughness: 0.4, metalness: 0.3 }));
      vial.position.y = 0.1;
      g.add(vial);
      var juice = new T.Mesh(
        new T.SphereGeometry(0.11, 10, 8),
        new T.MeshStandardMaterial({ color: 0xff5b6e, emissive: 0x8a0a1a, emissiveIntensity: 1.5, roughness: 0.3 })
      );
      juice.position.y = 0.3;
      g.add(juice);
      return g;
    }

    var col = PICKUP_COL[kind] || PICKUP_COL.stam;
    /* a dropped blade lies across the ground, glowing at its tier */
    if (!gunPickupMat[kind]) {
      gunPickupMat[kind] = new T.MeshStandardMaterial({ color: col[0], emissive: col[1], emissiveIntensity: 1.35, roughness: 0.28, metalness: 0.75 });
    }
    var bladeDrop = new T.Mesh(new T.BoxGeometry(0.86, 0.05, 0.1), gunPickupMat[kind]);
    g.add(bladeDrop);
    var hiltDrop = new T.Mesh(new T.BoxGeometry(0.09, 0.07, 0.3), pickupMat.brass);
    hiltDrop.position.x = -0.46;
    g.add(hiltDrop);
    var pomDrop = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), pickupMat.brass);
    pomDrop.position.x = -0.56;
    g.add(pomDrop);
    return g;
  }

  function spawnPickup(kind, x, z) {
    kind = lootAlias(kind);
    var col = PICKUP_COL[kind] || PICKUP_COL.stam;
    var mesh = buildPickupMesh(kind);
    var y = heightAt(x, z);
    mesh.position.set(x, y + 0.55, z);
    scene.add(mesh);
    var halo = new T.Mesh(
      new T.RingGeometry(0.34, 0.52, 18),
      new T.MeshBasicMaterial({ color: col[0], transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.5;
    mesh.add(halo);
    var icon = makeMark(mesh, 0.95, col[0]);
    G.pickups.push({ kind: kind, mesh: mesh, x: x, z: z, y: y, t: rand(0, 6.28), icon: icon });
  }

  /* ------------------------------------------------------------------ input */
  function look(dx, dy, sens) {
    P.yaw -= dx * sens;
    P.pitch -= dy * sens;
    P.pitch = clamp(P.pitch, -1.45, 1.45);
  }

  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'Digit4') switchWeapon(3);
    if (e.code === 'Digit5') switchWeapon(4);
    if (e.code === 'Digit6') switchWeapon(5);
    if (e.code === 'Digit7') switchWeapon(6);
    if (e.code === 'Digit8') switchWeapon(7);
    if (e.code === 'Digit9') switchWeapon(8);
    if (e.code === 'Digit0') switchWeapon(9);
    if (e.code === 'KeyZ') useItem('bomb');
    if (e.code === 'KeyX') useItem('shield');
    if (e.code === 'KeyC') useItem('rage');
    if (e.code === 'KeyF') tryMelee();
    if (e.code === 'KeyE') { if (G.benchOpen) closeBench(); else openBench(); }
    if (e.code === 'Escape') { if (G.running && !G.paused) pauseGame(); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; G.firing = false; });

  canvas.addEventListener('mousedown', function (e) {
    if (IS_TOUCH) return;
    if (!G.running || G.paused || G.over) return;
    if (e.button === 2) { G.aim = true; return; }
    if (e.button !== 0) return;
    G.firing = true;
    if (!G.locked) {
      G.dragging = true;
      G.dragSX = e.clientX;
      G.dragSY = e.clientY;
      lockPointer();
    }
    tryFire();
  });
  canvas.addEventListener('mouseup', function (e) {
    if (e.button === 2) G.aim = false;
    if (e.button === 0) { G.firing = false; G.dragging = false; }
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('mousemove', function (e) {
    if (!G.running || G.paused || G.over) return;
    var dx = e.movementX || 0, dy = e.movementY || 0;
    if (G.locked) look(dx, dy, 0.0023);
    else if (G.dragging) {
      dx = e.clientX - G.dragSX;
      dy = e.clientY - G.dragSY;
      G.dragSX = e.clientX;
      G.dragSY = e.clientY;
      look(dx, dy, 0.0034);
    }
  });

  function lockPointer() {
    if (IS_TOUCH) return;
    try {
      var r = canvas.requestPointerLock && canvas.requestPointerLock();
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('pointerlockchange', function () {
    var locked = document.pointerLockElement === canvas;
    if (G.locked && !locked && G.running && !G.paused && !G.over) pauseGame();
    G.locked = locked;
    if (locked) G.hadLock = true;
  });

  /* touch controls */
  (function bindTouch() {
    if (!IS_TOUCH) return;
    document.body.classList.add('touch-mode');
    $('touch').classList.remove('hidden');
    var joy = $('joy'), knob = joy.querySelector('i');
    var joyId = null, joyX = 0, joyY = 0;
    joy.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      joyId = e.pointerId;
      joyX = e.clientX; joyY = e.clientY;
      try { joy.setPointerCapture(e.pointerId); } catch (err) {}
    });
    joy.addEventListener('pointermove', function (e) {
      if (e.pointerId !== joyId) return;
      var dx = e.clientX - joyX, dy = e.clientY - joyY;
      /* R follows the real pad size so the bigger thumbstick keeps the same
         throw instead of capping drag at the old 44 px */
      var m = Math.hypot(dx, dy), R = Math.max(44, joy.clientWidth * 0.42);
      if (m > R) { dx *= R / m; dy *= R / m; }
      joyVec.x = dx / R;
      joyVec.y = dy / R;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    function endJoy(e) {
      if (e.pointerId !== joyId) return;
      joyId = null;
      joyVec.x = joyVec.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);

    var lookId = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch' || !G.running || G.paused) return;
      lookId = e.pointerId;
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== lookId) return;
      look((e.clientX - lx) * 1.5, (e.clientY - ly) * 1.5, 0.0032);
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (e.pointerId === lookId) lookId = null;
    });

    /* one tap, one cut: the strike button is the only thing under the thumb */
    var strike = $('tStrike');
    if (strike) {
      strike.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        strike.classList.add('hit');
        setTimeout(function () { strike.classList.remove('hit'); }, 105);
        tryFire();
      });
      strike.addEventListener('pointerup', function (e) { e.preventDefault(); e.stopPropagation(); });
      strike.addEventListener('pointercancel', function (e) { e.stopPropagation(); });
      strike.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    var spin = $('tSpin');
    if (spin) spin.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); tryMelee(); });
    var swap = $('tSwap');
    if (swap) swap.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); startReload(); });
    var benchBtn = $('tBench');
    if (benchBtn) benchBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); openBench(); });
    /* the item bar: one tap, one use, nothing to open first */
    var itemBar = $('items');
    if (itemBar) {
      var iBtns = itemBar.children;
      for (var ii = 0; ii < iBtns.length; ii++) {
        iBtns[ii].addEventListener('pointerdown', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          useItem(this.getAttribute('data-it'));
        });
      }
    }

    var sp = $('tSprint');
    if (sp) {
      sp.addEventListener('pointerdown', function (e) { e.preventDefault(); keys['ShiftLeft'] = true; sp.classList.add('on'); });
      var endSprint = function () { keys['ShiftLeft'] = false; sp.classList.remove('on'); };
      sp.addEventListener('pointerup', endSprint);
      sp.addEventListener('pointercancel', endSprint);
      sp.addEventListener('pointerleave', endSprint);
    }
  })();

  /* ------------------------------------------------------------- shooting */
  var raycasterOrigin = new T.Vector3();
  var raycasterDir = new T.Vector3();
  var tmpV = new T.Vector3();
  var tmpA = new T.Vector3();
  var tmpB = new T.Vector3();

  function raySphere(origin, dir, center, radius) {
    var ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
    var b = ox * dir.x + oy * dir.y + oz * dir.z;
    var c = ox * ox + oy * oy + oz * oz - radius * radius;
    var h = b * b - c;
    if (h < 0) return -1;
    h = Math.sqrt(h);
    var t = -b - h;
    if (t < 0) t = -b + h;
    return t < 0 ? -1 : t;
  }

  function terrainRayT(origin, dir, maxT) {
    var step = 0.9;
    for (var t = 0.7; t < maxT; t += step) {
      if (origin.y + dir.y * t < heightAt(origin.x + dir.x * t, origin.z + dir.z * t)) return t;
    }
    return maxT;
  }

  /* Solid cover: every trunk, boulder, pillar, crate and the relay base is a
     vertical cylinder. A shot (or an alien bolt) dies on the first one it
     enters, so rocks and trees actually protect you - and them. */
  function blockerRayT(origin, dir, maxT) {
    var best = maxT;
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      var px = b.x - origin.x, pz = b.z - origin.z;
      var along = px * dir.x + pz * dir.z;
      if (along < -b.r || along > best + b.r) continue;
      var a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-5) continue;
      var fx = origin.x - b.x, fz = origin.z - b.z;
      var bq = 2 * (fx * dir.x + fz * dir.z);
      var c = fx * fx + fz * fz - b.r * b.r;
      var disc = bq * bq - 4 * a * c;
      if (disc < 0) continue;
      var t = (-bq - Math.sqrt(disc)) / (2 * a);
      if (t < 0.12 || t >= best) continue;
      var y = origin.y + dir.y * t;
      if (y >= b.y0 && y <= b.y1) best = t;
    }
    return best;
  }

  function insideBlocker(p) {
    for (var i = 0; i < blockers.length; i++) {
      var b = blockers[i];
      if (p.y < b.y0 || p.y > b.y1) continue;
      var dx = p.x - b.x, dz = p.z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return b;
    }
    return null;
  }

  function clearLine(a, dir, span) {
    return terrainRayT(a, dir, span) >= span - 1.2 && blockerRayT(a, dir, span) >= span - 0.5;
  }

  function traceT(origin, dir, maxT) {
    var t = terrainRayT(origin, dir, maxT);
    return Math.min(t, blockerRayT(origin, dir, t));
  }

  function tracer(a, b) {
    if (G.tracers.length > 26) return;
    var geo = new T.BufferGeometry().setFromPoints([a, b]);
    var mat = new T.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    var line = new T.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    G.tracers.push({ line: line, life: 0.07 });
  }

  function shootRay(dir, dmg, pierce) {
    raycasterOrigin.copy(camera.position);
    var tTer = terrainRayT(raycasterOrigin, dir, 190);
    var tBlk = blockerRayT(raycasterOrigin, dir, tTer);
    var tMax = Math.min(tTer, tBlk);
    /* barrels are shootable spheres; a hit ends the round there */
    var barrel = null, barrelT = tMax;
    for (var bi = 0; bi < G.barrels.length; bi++) {
      var bb = G.barrels[bi];
      if (bb.dead) continue;
      var bt = raySphere(raycasterOrigin, dir, tmpV.set(bb.x, bb.y + 0.85, bb.z), 0.82);
      if (bt > 0 && bt < barrelT) { barrelT = bt; barrel = bb; }
    }
    if (barrel) tMax = Math.min(tMax, barrelT);
    var hits = [];
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      var center = tmpV.set(e.pos.x, e.pos.y + e.def.h * 0.52, e.pos.z);
      var rad = e.def.r * 0.95 + 0.18;
      var t = raySphere(raycasterOrigin, dir, center, rad);
      if (t > 0 && t < tMax) hits.push({ e: e, t: t });
    }
    hits.sort(function (a, b) { return a.t - b.t; });
    var endT = tMax;
    var maxHits = pierce + 1;
    for (var h = 0; h < hits.length && h < maxHits; h++) {
      var hit = hits[h];
      var pt = new T.Vector3().copy(raycasterOrigin).addScaledVector(dir, hit.t);
      var head = pt.y > hit.e.pos.y + hit.e.def.h * 0.74;
      damageEnemy(hit.e, dmg * (head ? 2.3 : 1), pt, head);
      endT = Math.min(endT, hit.t);
      if (h === 0) showHitmark(head);
    }
    if (barrel && barrelT <= endT + 0.001) {
      var bpt = new T.Vector3().copy(raycasterOrigin).addScaledVector(dir, barrelT);
      damageBarrel(barrel, dmg, bpt);
      endT = Math.min(endT, barrelT);
    }
    var end = new T.Vector3().copy(raycasterOrigin).addScaledVector(dir, endT);
    if (hits.length === 0 && !barrel) {
      if (tBlk < tTer) {
        /* stone chips when the round slams into cover */
        emit(end.x, end.y, end.z, 6, 0xd8d2c4, 4.5, 0.32, 9);
        emit(end.x, end.y, end.z, 3, 0xffe9c0, 3, 0.18, 7);
      } else {
        emit(end.x, end.y, end.z, 4, 0xa9c7d4, 3.5, 0.3, 9);
        emit(end.x, end.y, end.z, 2, 0xffe0a8, 2.2, 0.18, 7);
      }
    }
    var mzPos = new T.Vector3();
    var gun = guns[G.widx];
    gun.userData.muzzle.getWorldPosition(mzPos);
    tracer(mzPos, end);
  }

  function showHitmark(head) {
    var el = $('hitmark');
    el.classList.add('on');
    if (head) el.classList.add('head');
    else el.classList.remove('head');
    G.hitT = head ? 0.2 : 0.11;
  }

  /* ---------------------------------------------------------------- blade
     One swing is one decision: it spends stamina, commits the arm for ~0.3 s
     and cuts everything inside a frontal arc. A heavy strike trades two
     stamina for a narrower, much harder cut that staggers whatever survives. */
  function bladeStats(heavy) {
    var w = WEAPONS[G.widx];
    return {
      w: w,
      reach: w.reach + 0.12 * (G.upg.reach || 0) + (heavy ? 0.3 : 0),
      arc: Math.cos(heavy ? 0.5 : w.arc),
      dmg: w.dmg * (heavy ? 2.1 : 1),
      cost: heavy ? 2 : 1
    };
  }

  /* ------------------------------------------------------------- blade combo
     Three taps in rhythm become a chain: the second cut is faster and longer,
     the third is a shoulder-to-hip cleave that shoves bodies off their feet.
     The spin (F) has no front at all - it takes the whole circle. */
  var COMBO_WINDOW = 1.05;
  function swingBlade(heavy) {
    if (!G.running || G.paused || G.over || G.down) return;
    var w = WEAPONS[G.widx];
    var chain = !heavy && (G.t - (G.lastSwing || -9)) < COMBO_WINDOW ? (G.comboStep + 1) % 3 : 0;
    var rate = w.rate * Math.pow(0.93, G.upg.speed || 0) * (heavy ? 1.5 : (chain === 2 ? 1.12 : 1 - chain * 0.07));
    if (G.t - G.lastSwing < rate) return;
    var st = bladeStats(heavy);
    if (G.stam < st.cost) {
      if (G.t - (G.emptyT || -9) > 0.4) { SFX3D.play('empty'); G.emptyT = G.t; toast('نفس کم است — یک لحظه صبر کن یا غارت کن'); }
      return;
    }
    /* a rage draught turns three cuts into a sentence the island remembers */
    if (G.rageT > 0) st.dmg *= 1.5;
    var finisher = !heavy && chain === 2;
    if (!heavy) {
      st.dmg *= 1 + chain * 0.2;
      st.reach += chain * 0.18;
      if (finisher) { st.arc = Math.cos(Math.PI * 0.7); st.dmg *= 1.1; }
    } else {
      st.arc = -1;         /* a spin covers the whole circle */
      st.reach += 0.35;
      st.dmg *= 1.15;
    }
    G.comboStep = heavy ? 0 : chain;
    G.lastSwing = G.t;
    G.swingT = 0;
    G.swingHeavy = !!heavy;
    G.swingKind = heavy ? 3 : chain;
    /* alternate the cut: left-right-left keeps a long fight from looking
       like the same animation on a loop */
    G.swingSide = -(G.swingSide || 1);
    G.stam -= st.cost;
    G.recoil = heavy ? 1.7 : (finisher ? 1.35 : 1);
    G.shake = Math.min(1.4, G.shake + (heavy ? 0.55 : (finisher ? 0.4 : 0.2)));
    P.pitch = clamp(P.pitch + w.kick * (heavy ? 1.6 : 1), -1.45, 1.45);
    G.roll += rand(-1, 1) * w.kick * 0.8;
    muzzleLight.color.setHex(w.color);
    muzzleLight.intensity = heavy ? 4.5 : 2.2;
    SFX3D.play(heavy || finisher ? 'swingBig' : 'swing');

    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    var hits = [];
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      var dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      var d = Math.hypot(dx, dz);
      if (d > st.reach + e.def.r) continue;
      if (Math.abs(e.pos.y - P.pos.y) > 2.6) continue;
      if ((dx * fx + dz * fz) / Math.max(0.01, d) < st.arc) continue;
      hits.push({ e: e, d: d });
    }
    hits.sort(function (a, b) { return a.d - b.d; });
    var maxHits = heavy ? 7 : (finisher ? 5 : 3);
    for (var h = 0; h < hits.length && h < maxHits; h++) {
      var he = hits[h].e;
      var pt = new T.Vector3(he.pos.x, he.pos.y + he.def.h * 0.58, he.pos.z);
      damageEnemy(he, st.dmg, pt, false);
      /* the blade's own temperament, not just its numbers */
      var tr = w.trait;
      if (!he.dead && tr === 'chill') he.slowT = Math.max(he.slowT || 0, 2.4);
      if (!he.dead && tr === 'burn') he.burnT = Math.max(he.burnT || 0, 2.8);
      if (tr === 'leech') G.hp = Math.min(G.maxHp, G.hp + st.dmg * 0.05);
      /* impact weight: a short freeze of the world, then a camera punch */
      G.hitstop = Math.max(G.hitstop, heavy ? 0.11 : (finisher ? 0.08 : (tr === 'crush' ? 0.09 : 0.045)));
      G.punch = Math.max(G.punch, heavy ? 0.5 : (finisher ? 0.38 : 0.22));
      if ((heavy || finisher || tr === 'crush') && !he.dead) {
        he.stagger = Math.max(he.stagger, heavy ? 0.75 : 0.5);
        var push = heavy ? 1.0 : (tr === 'crush' ? 1.3 : 0.6);
        he.pos.x += (he.pos.x - P.pos.x) / Math.max(0.01, hits[h].d) * push;
        he.pos.z += (he.pos.z - P.pos.z) / Math.max(0.01, hits[h].d) * push;
      }
      emit(pt.x, pt.y, pt.z, heavy ? 12 : 8, 0xff3b52, 5.5, 0.42, 9);
      showHitmark(false);
    }
    /* the ground answers a cleave: a ring of light where the circle closed */
    if (heavy || finisher) slashWave(heavy ? 0xffd166 : w.color, P.pos, heavy ? 3.6 : 2.7);
    /* barrels are still a blade problem: one good cut sets them off */
    for (var b = 0; b < G.barrels.length; b++) {
      var bb = G.barrels[b];
      if (bb.dead) continue;
      var bdx = bb.x - P.pos.x, bdz = bb.z - P.pos.z;
      var bd = Math.hypot(bdx, bdz);
      if (bd > st.reach + 0.6) continue;
      if ((bdx * fx + bdz * fz) / Math.max(0.01, bd) < st.arc) continue;
      damageBarrel(bb, st.dmg, new T.Vector3(bb.x, bb.y + 0.9, bb.z));
    }
    if (!hits.length) {
      /* a miss still shoves air and dust: the swing has to read as a swing */
      emit(P.pos.x + fx * 1.6, P.pos.y + 1.1, P.pos.z + fz * 1.6, 3, 0xcbd8e6, 2.2, 0.22, 3);
    }
    updateAmmoHUD();
  }

  function tryFire() { swingBlade(false); }

  /* ------------------------------------------------------------- hazards */
  function damageBarrel(b, dmg, pt) {
    if (b.dead) return;
    b.hp -= dmg;
    b.stripe.material.emissiveIntensity = 2.6;
    if (pt) emit(pt.x, pt.y, pt.z, 5, 0xffc46a, 4, 0.25, 6);
    if (b.hp <= 0) explodeBarrel(b);
  }

  function explodeBarrel(b) {
    if (b.dead) return;
    b.dead = true;
    scene.remove(b.mesh);
    var idx = G.barrels.indexOf(b);
    if (idx >= 0) G.barrels.splice(idx, 1);
    var radius = 8;
    emit(b.x, b.y + 0.9, b.z, 34, 0xffb03a, 13, 0.8, 12);
    emit(b.x, b.y + 0.9, b.z, 16, 0xfff0c0, 8, 0.45, 9);
    SFX3D.play('explode', { x: b.x, y: b.y, z: b.z });
    G.shake = Math.min(1.6, G.shake + 1.2);
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      var d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
      if (d < radius) damageEnemy(e, 180 * (1 - d / radius), null, false);
    }
    var pd = Math.hypot(P.pos.x - b.x, P.pos.z - b.z);
    if (pd < radius) hurtPlayer(38 * (1 - pd / radius), { x: b.x, y: b.y, z: b.z });
    /* chain reaction */
    for (var k = G.barrels.length - 1; k >= 0; k--) {
      var o = G.barrels[k];
      if (o.dead) continue;
      if (Math.hypot(o.x - b.x, o.z - b.z) < 9.5) {
        setTimeout(function (bb) { return function () { explodeBarrel(bb); }; }(o), 110 + Math.random() * 120);
      }
    }
  }

  function updateHazards(dt) {
    for (var i = 0; i < G.barrels.length; i++) {
      var b = G.barrels[i];
      if (b.dead) continue;
      b.stripe.material.emissiveIntensity = 1.1 + Math.sin(G.t * 4 + i) * 0.35;
    }
    for (var k = 0; k < G.traps.length; k++) {
      var t = G.traps[k];
      if (!t.armed) {
        t.cool -= dt;
        if (t.cool <= 0) { t.armed = true; t.mat.emissiveIntensity = 1; }
        continue;
      }
      t.mat.emissiveIntensity = 1 + Math.sin(G.t * 3.4) * 0.4;
      var d = Math.hypot(P.pos.x - t.x, P.pos.z - t.z);
      if (d < 1.45 && Math.abs(P.pos.y - t.y) < 1.3) {
        t.armed = false;
        t.cool = 6;
        t.mat.emissiveIntensity = 0.3;
        hurtPlayer(22, { x: t.x, y: t.y, z: t.z });
        emit(t.x, t.y + 0.6, t.z, 14, 0xff5b6e, 7, 0.4, 8);
        SFX3D.play('hit', { x: t.x, y: t.y, z: t.z });
      }
    }
  }

  /* ------------------------------------------------------- heavy strike (F)
     Two stamina for a narrow, doubled cut. From behind it still lands as a
     silent kill, so sneaking a camp remains a real option. */
  function tryMelee() {
    if (!G.running || G.paused || G.over || G.down) return;
    if (G.meleeT > 0) return;
    G.meleeT = 1.05;
    var before = G.kills;
    swingBlade(true);
    if (G.kills > before) saveRun();
  }

  /* ------------------------------------------------------- bounty contracts
     Every round the island picks one living thing as the contract: it is
     marked in gold, it grows tougher and it hunts you instead of holding its
     post. Cut it down and the island pays, then names the next one. */
  /* --------------------------------------------------------------- items
     Three consumables ride in a small bar above the thumbs: a fire bomb for
     the pack that closed in, a ward for the second before a contract swings,
     and a rage draught for the moment the chain has to break something. */
  var ITEM_NAME = { bomb: 'بمب آتش‌زا', shield: 'سپر نور', rage: 'معجون خشم' };

  function updateItemsHUD() {
    var bar = $('items');
    if (!bar) return;
    var btns = bar.children;
    for (var i = 0; i < btns.length; i++) {
      var k = btns[i].getAttribute('data-it');
      var n = G.items[k] || 0;
      setText(btns[i].querySelector('b'), fa(n));
      btns[i].classList.toggle('off', n <= 0);
      btns[i].classList.toggle('on', k === 'shield' ? G.shieldT > 0 : (k === 'rage' ? G.rageT > 0 : false));
    }
  }

  function throwBomb() {
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    var bx = P.pos.x + fx * 8.5, bz = P.pos.z + fz * 8.5;
    /* land it on the first pawn in the path, otherwise where the eye lands */
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      var dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      var d = Math.hypot(dx, dz);
      if (d > 13 || d < 1) continue;
      if ((dx * fx + dz * fz) / d < 0.8) continue;
      bx = e.pos.x; bz = e.pos.z;
      break;
    }
    var by = heightAt(bx, bz) + 0.9;
    emit(bx, by, bz, 34, 0xffb03a, 11, 0.7, 9);
    emit(bx, by, bz, 16, 0xfff0c0, 6, 0.45, 7);
    emit(bx, by, bz, 12, 0x2a2a2e, 4, 0.8, 4);
    SFX3D.play('explode', { x: bx, y: by, z: bz });
    G.shake = Math.min(1.5, G.shake + 0.9);
    G.hitstop = Math.max(G.hitstop, 0.06);
    slashWave(0xffb03a, { x: bx, y: by, z: bz }, 6);
    var rad = 5.2;
    for (var k = 0; k < G.enemies.length; k++) {
      var en = G.enemies[k];
      if (en.dead) continue;
      var ed = Math.hypot(en.pos.x - bx, en.pos.z - bz);
      if (ed > rad) continue;
      damageEnemy(en, 95 * (1 - (ed / rad) * 0.5), null, false);
      if (!en.dead) en.burnT = Math.max(en.burnT || 0, 2.2);
    }
    if (Math.hypot(P.pos.x - bx, P.pos.z - bz) < rad) hurtPlayer(14, { x: bx, y: by, z: bz });
    if (G.barrels) {
      for (var b = 0; b < G.barrels.length; b++) {
        var bb = G.barrels[b];
        if (!bb.dead && Math.hypot(bb.x - bx, bb.z - bz) < rad) damageBarrel(bb, 999, null);
      }
    }
  }

  function useItem(k) {
    if (!G.running || G.paused || G.over || G.down) return;
    if (!(G.items[k] > 0)) { toast(ITEM_NAME[k] + ' نداری — از شکارچی‌ها یا میز کار بگیر'); return; }
    G.items[k]--;
    if (k === 'bomb') throwBomb();
    else if (k === 'shield') {
      G.shieldT = 8;
      showBanner('سپر نور', '۸ ثانیه آسیب دریافتی کمتر از نصف', 1600);
      emit(P.pos.x, P.pos.y + 1.2, P.pos.z, 24, 0x8ff0ff, 4.5, 0.6, 3);
      SFX3D.play('equip');
    } else if (k === 'rage') {
      G.rageT = 10;
      showBanner('معجون خشم', '۱۰ ثانیه آسیب شمشیر ۵۰٪ بیشتر', 1600);
      emit(P.pos.x, P.pos.y + 1.2, P.pos.z, 24, 0xff5b6e, 5, 0.6, 3);
      SFX3D.play('wave');
    }
    updateItemsHUD();
    updateHUD(true);
  }

  function bountySquad() {
    var a = rand(0, 6.283), r = rand(34, 56);
    var x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (heightAt(x, z) < 1.2 || Math.hypot(x, z) > ISLE_R * 0.9) { x = SPAWN.x; z = SPAWN.z; }
    var kinds = ['runner', 'skitter', 'warrior', 'neural'];
    for (var i = 0; i < 3; i++) {
      var e = spawnEnemy(kinds[i % kinds.length], x + rand(-4, 4), z + rand(-4, 4), false, i === 0);
      if (e) e.zone = null;
    }
  }

  function nextLockedSword() {
    for (var i = 0; i < WEAPONS.length; i++) if (!WEAPONS[i].owned) return WEAPONS[i];
    return null;
  }

  /* ------------------------------------------------------- contract helpers
     One pawn is named at a time, and a pawn is a pawn: the player is in the
     same draw as every bot, bots hunt the target, and a bot that takes it
     keeps the money and spends it on a heavier blade - exactly the loop the
     player has at the bench. */
  function greatBlade() {
    var gold = new T.MeshStandardMaterial({ color: 0xf0b94a, metalness: 0.55, roughness: 0.32, emissive: 0x6a3c08, emissiveIntensity: 0.45 });
    var steel = new T.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 0.25, roughness: 0.42, emissive: 0x2a2e38, emissiveIntensity: 0.22 });
    var dark = new T.MeshStandardMaterial({ color: 0x241820, metalness: 0.4, roughness: 0.6, emissive: 0x2a0c04, emissiveIntensity: 0.3 });
    var g = new T.Group();
    var bl = new T.Mesh(new T.BoxGeometry(0.1, 1.0, 0.03), steel);
    bl.position.y = 0.5;
    g.add(bl);
    var tip = new T.Mesh(new T.ConeGeometry(0.075, 0.24, 4), steel);
    tip.position.y = 1.12;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
    g.add(new T.Mesh(new T.BoxGeometry(0.36, 0.06, 0.09), gold));
    var grip = new T.Mesh(new T.CylinderGeometry(0.035, 0.042, 0.3, 8), dark);
    grip.position.y = -0.17;
    g.add(grip);
    return g;
  }

  /* a bot's payday: heavier hits, a gold ring at its feet and a blade */
  function upgradeBot(e, n) {
    if (!e || e.dead) return;
    e.rank = Math.min(4, (e.rank || 0) + (n || 1));
    e.dmgMul = 1 + 0.22 * e.rank;
    if (!e.rankRing) {
      var ring = new T.Mesh(
        new T.TorusGeometry(e.def.r * 1.2, 0.05, 6, 22),
        new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.12;
      e.group.add(ring);
      e.rankRing = ring;
    }
    if (!e.rankBlade) {
      var b = greatBlade();
      b.position.set(e.def.r * 1.05, e.def.h * 0.4, e.def.r * 0.42);
      b.rotation.set(-0.22, 0, -0.42);
      e.group.add(b);
      e.rankBlade = b;
      e.bladeT = null;
    }
    e.rankRing.visible = true;
    e.rankBlade.visible = true;
    var ud = e.group.userData;
    if (ud.mats) {
      for (var i = 0; i < ud.mats.length; i++) if (ud.mats[i].emissive) ud.mats[i].emissive.setHex(0x6a3c08);
    } else if (ud.mat && ud.mat.emissive) ud.mat.emissive.setHex(0x6a3c08);
  }

  function botCleared(by, e) {
    var b = G.bounty;
    if (!b || b.e !== e) return;
    var no = b.no;
    var pay = b.pay || 3;
    G.bounty = null;
    G.bountyDelay = 3.5;
    clearHunters();
    youRingShow(false);
    upgradeBot(by, 1);
    SFX3D.play('victory');
    showBanner(by.name + ' قرارداد №' + fa(no) + ' را زد',
      fa(pay) + ' قطعه برداشت و تیغهٔ بهتری خرید — هدف بعدی انتخاب می‌شود', 3200);
  }

  function clearHunters() {
    var old = G.hunters || [];
    for (var i = 0; i < old.length; i++) {
      if (!old[i]) continue;
      old[i].hunter = false;
      if (old[i].hunterRing) old[i].hunterRing.visible = false;
    }
    G.hunters = [];
  }

  /* a former target keeps its crown, but stops being the contract */
  function clearBountyFlags() {
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (!o.bounty) continue;
      o.bounty = false;
      o.maxHp = Math.max(1, Math.round(o.maxHp / 1.7));
      o.hp = Math.min(o.hp, o.maxHp);
      if (o.bountyMark) o.bountyMark.visible = false;
      if (o.bountyRing) o.bountyRing.visible = false;
    }
  }

  function bountyAlive() {
    return !!(G.bounty && (G.bounty.you || (G.bounty.e && !G.bounty.e.dead)));
  }

  /* the red ring under the player's feet while the island wants them dead */
  function youRingShow(on) {
    if (!G.youRing) {
      if (!on) return;
      /* drawn over the ground: a mark the player must be able to see under
         their own feet, even when the sand rises */
      var m = new T.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.62, blending: T.AdditiveBlending, depthWrite: false, depthTest: false });
      G.youRing = new T.Mesh(new T.TorusGeometry(1.15, 0.07, 6, 30), m);
      G.youRing.rotation.x = Math.PI / 2;
      G.youRing.renderOrder = 6;
      scene.add(G.youRing);
    }
    G.youRing.visible = !!on;
  }

  /* the player holds one slot in the draw - nothing more, nothing less */
  function pickPlayerBounty() {
    clearBountyFlags();
    clearHunters();
    G.bounty = { you: true, no: ++G.bountyNo, name: 'تو', dist: 0, hp: 1, life: 72, pay: 3 };
    G.bountyDelay = 0;
    G.shake = Math.max(G.shake, 0.5);
    youRingShow(true);
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o.dead || o.def.boss) continue;
      if (Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z) < 58) { o.hunter = true; aggroEnemy(o); }
    }
    showBanner('قرارداد №' + fa(G.bounty.no) + ' — تو هدفی',
      'هر شکارچی نزدیک پولِ کشتن تو را می‌خواهد · ' + fa(72) + ' ثانیه دوام بیار', 3400);
    SFX3D.play('growl');
    updateHUD(true);
  }

  /* four rivals go for the named pawn, so the hunt is not only yours */
  function assignHunters(target) {
    clearHunters();
    var list = [];
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o === target || o.dead || o.def.boss || o.aggro) continue;
      var d = Math.hypot(o.pos.x - target.pos.x, o.pos.z - target.pos.z);
      if (d > 95 || d < 3) continue;
      list.push({ e: o, d: d });
    }
    list.sort(function (a, b) { return a.d - b.d; });
    /* a lone target in the wilderness still deserves rivals: without them
       the hunt would only ever be the player's business */
    if (!list.length && !target.rivalsSpawned) {
      target.rivalsSpawned = true;
      var kinds = ['runner', 'skitter'];
      for (var r = 0; r < 2; r++) {
        var ra = rand(0, 6.283), rr = rand(18, 30);
        var rx = target.pos.x + Math.cos(ra) * rr, rz = target.pos.z + Math.sin(ra) * rr;
        if (heightAt(rx, rz) < 1.3) continue;
        var riv = spawnEnemy(kinds[r], rx, rz, false, false);
        if (riv) { riv.zone = null; riv.hunter = true; list.push({ e: riv, d: rr }); }
      }
    }
    for (var k = 0; k < list.length && k < 4; k++) {
      var h = list[k].e;
      h.hunter = true;
      if (!h.hunterRing) {
        var ring = new T.Mesh(
          new T.TorusGeometry(h.def.r * 1.1, 0.04, 6, 18),
          new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.1;
        h.group.add(ring);
        h.hunterRing = ring;
      }
      h.hunterRing.visible = true;
      G.hunters.push(h);
    }
  }

  /* A contract is dressed like a boss: gold crown, shoulder plates, a belt,
     a tattered cape and a greatsword in the right hand. All of it is plain
     meshes parented to the enemy group, so it falls over with the body. */
  function dressBounty(e) {
    e.group.scale.multiplyScalar(1.12);
    var h = e.def.h, r = e.def.r;
    /* metalness stays moderate: there is no env map in the scene, so a mirror
       finish reads as flat lavender instead of gold */
    var gold = new T.MeshStandardMaterial({ color: 0xf0b94a, metalness: 0.55, roughness: 0.32, emissive: 0x6a3c08, emissiveIntensity: 0.45 });
    var steel = new T.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 0.25, roughness: 0.42, emissive: 0x2a2e38, emissiveIntensity: 0.22 });
    var dark = new T.MeshStandardMaterial({ color: 0x241820, metalness: 0.4, roughness: 0.6, emissive: 0x2a0c04, emissiveIntensity: 0.3 });
    var cloth = new T.MeshStandardMaterial({ color: 0x3a0812, roughness: 0.96, metalness: 0.04, emissive: 0x180204, emissiveIntensity: 0.25, side: T.DoubleSide });

    var crown = new T.Group();
    var band = new T.Mesh(new T.TorusGeometry(r * 0.31, 0.038, 6, 20), gold);
    band.rotation.x = Math.PI / 2;
    crown.add(band);
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2;
      var spike = new T.Mesh(new T.ConeGeometry(0.04, 0.2, 4), gold);
      spike.position.set(Math.cos(a) * r * 0.3, 0.12, Math.sin(a) * r * 0.3);
      crown.add(spike);
    }
    crown.position.y = h + 0.02;
    e.group.add(crown);
    e.bountyCrown = crown;

    [-1, 1].forEach(function (s) {
      var pad = new T.Mesh(new T.BoxGeometry(r * 0.4, 0.11, r * 0.52), gold);
      pad.position.set(s * r * 0.58, h * 0.72, 0);
      pad.rotation.z = -s * 0.34;
      e.group.add(pad);
    });
    var belt = new T.Mesh(new T.TorusGeometry(r * 0.62, 0.06, 6, 20), gold);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = h * 0.46;
    belt.scale.set(1, 1, 0.7);
    e.group.add(belt);

    var cape = new T.Mesh(new T.PlaneGeometry(r * 1.3, h * 1.0, 3, 5), cloth);
    cape.position.set(0, h * 0.5, -r * 0.62);
    cape.rotation.x = 0.34;
    e.group.add(cape);
    e.bountyCape = cape;

    var blade = greatBlade();
    blade.position.set(r * 1.05, h * 0.4, r * 0.42);
    blade.rotation.set(-0.22, 0, -0.42);
    e.group.add(blade);
    e.bountyBlade = blade;

    /* the armour itself glows gold so a bounty reads from across a ridge */
    var ud = e.group.userData;
    if (ud.mats) {
      for (var m = 0; m < ud.mats.length; m++) if (ud.mats[m].emissive) ud.mats[m].emissive.setHex(0x6a3c08);
    } else if (ud.mat && ud.mat.emissive) ud.mat.emissive.setHex(0x6a3c08);
  }

  function pickBounty() {
    if (!G.running || G.over) return;
    /* The island names one pawn - and a pawn is a pawn: the player holds the
       same single slot in the draw as every bot. Only the local
       neighbourhood is eligible, so a contract can always be walked to. */
    var pool = [];
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o.dead || o.bounty || o.def.boss) continue;
      var od = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
      if (od < 14 || od > 150) continue;
      pool.push(o);
    }
    if (!pool.length) {
      bountySquad();
      for (var s = 0; s < G.enemies.length; s++) {
        var q = G.enemies[s];
        if (q.dead || q.bounty) continue;
        if (Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < 14) continue;
        pool.push(q);
      }
    }
    if (!pool.length) { G.bountyDelay = 2.5; return; }
    /* the draw is local: the nearest handful of pawns, so the player's single
       slot is a real one in nine rather than one in forty */
    if (pool.length > 10) {
      pool.sort(function (a, b) {
        return Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
      });
      pool.length = 10;
    }
    var meIn = G.hp > 0 && !G.down && !G.falling;
    var roll = (Math.random() * (pool.length + (meIn ? 1 : 0))) | 0;
    if (meIn && roll === 0) { pickPlayerBounty(); return; }
    var e = pool[roll - (meIn ? 1 : 0)];
    clearBountyFlags();
    clearHunters();
    youRingShow(false);

    e.bounty = true;
    e.maxHp = Math.round(e.maxHp * 1.7);
    e.hp = e.maxHp;
    /* the named pawn is the prey, not a missile aimed at the player: it keeps
       its post and defends itself against whoever comes for the money */
    e.aggro = false;
    e.aggroT = 0;
    e.noticeT = 0;
    e.home = { x: e.pos.x, z: e.pos.z };
    if (!e.bountyMark) e.bountyMark = makeMark(e.group, e.def.h + 1.05, 0xffd166);
    e.bountyMark.visible = true;
    if (!e.bountyRing) {
      var ring = new T.Mesh(
        new T.TorusGeometry(e.def.r * 1.35, 0.05, 6, 26),
        new T.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = e.def.h * 0.55;
      e.group.add(ring);
      e.bountyRing = ring;
    }
    var d = Math.round(Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z));
    if (!e.bountyDressed) { e.bountyDressed = true; dressBounty(e); }
    G.bounty = { e: e, no: ++G.bountyNo, name: (e.leader ? e.name : e.def.name) + (e.elite ? ' · زره‌پوش' : ''), dist: d, hp: 1, pay: 3 + (e.leader ? 2 : 0) };
    G.bountyDelay = 0;
    showBanner('قرارداد شکار №' + fa(G.bountyNo), 'هدف: ' + G.bounty.name + ' · ' + fa(d) + ' متر — شکارش کن', 2800);
    SFX3D.play('wave');
    updateHUD(true);
  }

  function bountyCleared(e) {
    var b = G.bounty;
    if (!b || b.you || b.e !== e) { G.bounty = null; G.bountyDelay = 3; return; }
    var no = b.no;
    clearHunters();
    var parts = 2 + (e.def.boss ? 5 : e.leader ? 2 : 0);
    G.bountyKills++;
    G.parts += parts;
    G.stam = G.stamMax;
    G.hp = Math.min(G.maxHp, G.hp + 22);
    G.shake = Math.max(G.shake, 0.75);
    G.bounty = null;
    G.bountyDelay = 3.5;
    spawnPickup('part', e.pos.x + 1.2, e.pos.z + 0.4);
    spawnPickup('med', e.pos.x - 1.2, e.pos.z + 0.4);
    G.items[pick(['bomb', 'shield', 'rage'])]++;
    updateItemsHUD();
    var next = nextLockedSword();
    if (next) spawnPickup(next.key, e.pos.x, e.pos.z + 1.6);
    SFX3D.play('victory');
    showBanner('قرارداد №' + fa(no) + ' انجام شد',
      'غارت: ' + fa(parts) + ' قطعه · نفس کامل · جان +۲۲' + (next ? ' · ' + next.name + ' افتاد' : ''), 3000);
    saveRun();
  }

  function updateBounty(dt) {
    var b = G.bounty;
    /* --- the player is the contract: the neighbourhood is coming --- */
    if (b && b.you) {
      if (G.down || G.over) return;   /* losing it is settled in playerDown() */
      b.hp = clamp(G.hp / G.maxHp, 0, 1);
      b.dist = 0;
      b.life -= dt;
      if (G.youRing) {
        G.youRing.position.set(P.pos.x, P.pos.y + 0.06, P.pos.z);
        G.youRing.rotation.z = G.t * 1.4;
        G.youRing.material.opacity = 0.45 + Math.sin(G.t * 4) * 0.18;
      }
      G.hunterTick -= dt;
      if (G.hunterTick <= 0) {
        G.hunterTick = 0.8;
        var hn = 0;
        for (var hi = 0; hi < G.enemies.length; hi++) {
          var ho = G.enemies[hi];
          if (ho.dead || ho.def.boss) continue;
          if (Math.hypot(ho.pos.x - P.pos.x, ho.pos.z - P.pos.z) > 62) continue;
          if (hn++ > 14) break;
          ho.aggroT = Math.max(ho.aggroT, 4);
          if (!ho.aggro) aggroEnemy(ho);
        }
      }
      if (b.life <= 0) {
        var pay = b.pay || 3;
        G.parts += pay;
        G.bounty = null;
        G.bountyDelay = 2.5;
        youRingShow(false);
        showBanner('قرارداد را زنده گذاشتی', '+' + fa(pay) + ' قطعه · هدف بعدی انتخاب می‌شود', 2800);
        SFX3D.play('wave');
        saveRun();
      }
      return;
    }
    if (b && (!b.e || b.e.dead || G.enemies.indexOf(b.e) < 0)) {
      if (b.e && !b.e.dead) { G.bounty = null; G.bountyDelay = 1.5; clearHunters(); }
      b = G.bounty;
    }
    if (!b) {
      if (!G.running || G.over) return;
      if (G.bountyDelay > 0) G.bountyDelay -= dt;
      else pickBounty();
      return;
    }
    var e = b.e;
    b.dist = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    b.hp = clamp(e.hp / e.maxHp, 0, 1);
    /* rivals hunt it too: the bounty is not a private duel */
    G.hunterTick -= dt;
    if (G.hunterTick <= 0) { G.hunterTick = 1.5; assignHunters(e); }
    if (e.bountyMark) {
      e.bountyMark.visible = !e.dead && b.dist < 160;
      e.bountyMark.material.opacity = 0.7 + Math.sin(G.t * 5) * 0.25;
    }
    if (e.bountyRing) e.bountyRing.rotation.z += dt * 1.9;
    /* the greatsword follows the same strike the arm does */
    if (e.bountyBlade) {
      if (e.bladeT != null) {
        e.bladeT += dt;
        var bk = Math.min(1, e.bladeT / 0.42);
        e.bountyBlade.rotation.x = -0.25 + Math.sin(bk * Math.PI) * 1.8;
        if (bk >= 1) { e.bladeT = null; e.bountyBlade.rotation.x = -0.25; }
      } else {
        e.bountyBlade.rotation.x = -0.25 + Math.sin(G.t * 1.6) * 0.05;
      }
    }
    if (e.bountyCape) {
      e.bountyCape.rotation.x = 0.34 + Math.sin(G.t * 2.3) * 0.07;
      e.bountyCape.rotation.z = Math.sin(G.t * 1.7) * 0.05;
    }
    if (e.bountyCrown) e.bountyCrown.rotation.y += dt * 0.55;
  }

  /* ---------------------------------------------------- death: sky return
     Going down no longer ends the run. The island waits ten seconds, then
     drops you out of the sky with nothing but the broken sword. */
  function playerDown() {
    if (G.down || G.over) return;
    G.down = true;
    G.downT = 10;
    G.hp = 0;
    G.firing = false;
    G.aim = false;
    G.swingT = 9;
    document.body.classList.add('down');
    var box = $('downBox');
    if (box) box.classList.remove('hidden');
    if (IS_TOUCH && navigator.vibrate) { try { navigator.vibrate([120, 60, 160]); } catch (e) {} }
    SFX3D.play('death');
    G.shake = 1.4;
    /* if the island had named you, whoever took you down collects */
    if (G.bounty && G.bounty.you) {
      var no = G.bounty.no;
      var killer = (G.lastHitBy && !G.lastHitBy.dead && G.t - (G.lastHitByAt || -99) < 8) ? G.lastHitBy : null;
      G.bounty = null;
      G.bountyDelay = 8;
      clearHunters();
      youRingShow(false);
      if (killer) {
        upgradeBot(killer, 1);
        showBanner(killer.name + ' تو را زد', 'قرارداد №' + fa(no) + ' را برداشت و تیغهٔ بهتری خرید', 3200);
      } else {
        showBanner('قرارداد №' + fa(no) + ' از دست رفت', 'کسی تو را نزد — هدف بعدی انتخاب می‌شود', 2600);
      }
    }
    updateHUD(true);
  }

  function updateDown(dt) {
    G.downT -= dt;
    var k = clamp(1 - G.downT / 10, 0, 1);
    var drop = smoothstep(0, 0.35, k);
    var sh = G.shake * 0.05;
    camera.position.set(P.pos.x + rand(-sh, sh), P.pos.y + lerp(EYE, 0.34, drop), P.pos.z + rand(-sh, sh));
    camera.rotation.set(lerp(P.pitch, -0.16, drop), P.yaw, lerp(0, 0.62, drop));
    camera.fov = lerp(camera.fov, 82, Math.min(1, dt * 3));
    camera.updateProjectionMatrix();
    G.shake = Math.max(0, G.shake - dt * 1.6);
    setText($('downTxt'), fa(Math.max(0, Math.ceil(G.downT))));
    if (G.downT <= 0) skyRespawn();
  }

  function skyRespawn() {
    G.down = false;
    document.body.classList.remove('down');
    var box = $('downBox');
    if (box) box.classList.add('hidden');
    /* land on open ground near the beacon, never inside a garrison */
    var lx = SPAWN.x, lz = SPAWN.z;
    for (var i = 0; i < 12; i++) {
      var a = rand(0, 6.283), r = rand(18, 52);
      var tx = P.pos.x + Math.cos(a) * r, tz = P.pos.z + Math.sin(a) * r;
      if (heightAt(tx, tz) < 1.4 || Math.hypot(tx, tz) > ISLE_R * 0.86) continue;
      var enemyNear = false;
      for (var k = 0; k < G.enemies.length; k++) {
        if (!G.enemies[k].dead && Math.hypot(G.enemies[k].pos.x - tx, G.enemies[k].pos.z - tz) < 14) { enemyNear = true; break; }
      }
      if (!enemyNear) { lx = tx; lz = tz; break; }
    }
    P.pos.set(lx, heightAt(lx, lz) + 46, lz);
    P.vel.set(0, 0, 0);
    P.onGround = false;
    G.falling = true;
    G.invuln = 3.2;
    G.deaths++;
    G.hp = Math.max(30, Math.round(G.maxHp * 0.6));
    G.stam = G.stamMax;
    /* the sky hands you the weakest blade in the game, whatever you carried */
    G.widx = 0;
    G.wlvl = WEAPONS[0].tier;
    guns.forEach(function (g, idx) { g.visible = idx === 0; });
    G.falling = true;
    G.downT = 0;
    showBanner('از آسمان سقوط کردی', 'شمشیر شکسته در دستت است — دشمن‌ها جای تو را گرفته‌اند', 3000);
    updateAmmoHUD();
    updateHUD(true);
    saveRun();
  }

  function spawnBolt(origin, dir, w) {
    var mesh = new T.Mesh(boltGeo, boltMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    G.bolts.push({ mesh: mesh, pos: origin.clone(), dir: dir.clone(), dmg: w.dmg, pierce: w.piercing, life: 2.4, hit: [] });
  }

  /* R and the ⟳ pad used to feed a magazine; now they draw the next blade you
     own, which is the closest thing a sword has to a reload. */
  function cycleSword(dir) {
    if (!G.running || G.paused || G.over) return;
    var n = WEAPONS.length, start = G.widx;
    for (var k = 1; k <= n; k++) {
      var i = (start + k * (dir || 1) + n * 2) % n;
      if (WEAPONS[i].owned) { switchWeapon(i); return; }
    }
    toast('هنوز شمشیر دیگری نداری — قراردادها و جعبهٔ مناطق شمشیر می‌دهند');
  }
  function startReload() { cycleSword(1); }
  function finishReload() {}

  function switchWeapon(i) {
    if (i === G.widx || !WEAPONS[i]) return;
    if (!WEAPONS[i].owned) { toast('این شمشیر را هنوز پیدا نکردی — قرارداد شکار و شکارچی‌ها'); return; }
    G.widx = i;
    G.wlvl = WEAPONS[i].tier;
    G.reloading = 0;
    $('reloadTxt').textContent = '';
    guns.forEach(function (g, k) { g.visible = k === i; });
    SFX3D.play('equip');
    updateAmmoHUD();
    updateSlots();
  }

  /* -------------------------------------------------------------------- camps
     The island is a field of pawns, not a checklist of zones. Every camp is a
     handful of bots holding ground: they patrol it, they quarrel with whoever
     is standing nearby, and they only turn on the player when he is the named
     contract, when he cuts one of them, or when he walks into their face. */
  var ZONES = [
    { id: 'camp', name: 'اردوگاه ساحلی', x: 72, z: 62, r: 30, tier: 1, lead: 'runner',
      mix: ['runner', 'skitter', 'runner'], loot: ['rifle', 'ammo'] },
    { id: 'wreck', name: 'لاشهٔ سفینه', x: -76, z: 58, r: 30, tier: 2, lead: 'warrior',
      mix: ['runner', 'skitter', 'neural', 'runner'], loot: ['ammo', 'med'] },
    { id: 'dock', name: 'اسکلهٔ زنگ‌زده', x: -112, z: 4, r: 28, tier: 2, lead: 'warrior',
      mix: ['skitter', 'runner', 'neural', 'warrior'], loot: ['shotgun', 'ammo'] },
    { id: 'relay', name: 'رلهٔ بنفش', x: 0, z: -46, r: 32, tier: 3, lead: 'neural',
      mix: ['warrior', 'neural', 'runner', 'skitter'], loot: ['med', 'ammo'] },
    { id: 'quarry', name: 'معدن سنگی', x: 96, z: -50, r: 30, tier: 3, lead: 'warrior',
      mix: ['warrior', 'runner', 'bomber', 'neural', 'stalker'], loot: ['ammo', 'med'] },
    { id: 'ridge', name: 'یال شمالی', x: 34, z: -108, r: 30, tier: 4, lead: 'brute',
      mix: ['warrior', 'neural', 'brute', 'runner', 'skitter', 'stalker'], loot: ['ammo', 'med'] },
    { id: 'nest', name: 'لانهٔ شمالی', x: -72, z: -88, r: 34, tier: 5, lead: 'warrior',
      mix: ['brute', 'neural', 'warrior', 'runner', 'stalker'], loot: ['amber', 'ammo', 'med'] },
    /* the crater sits on the empty south-east shoulder: far from the coastal
       camp (88 m), off the spawn (171 m) and clear of the quarry, so the
       tier-4 garrison never overlaps the starter fight */
    { id: 'crater', name: 'دهانهٔ شهاب', x: 140, z: 6, r: 28, tier: 4, lead: 'brute',
      mix: ['brute', 'runner', 'bomber', 'neural', 'warrior', 'stalker'], loot: ['ammo', 'med', 'ammo'] },
    /* ---- the outer ring: the second half of the island ----
       These camps only reachable after the inner eight; they sit between 190
       and 260 m from the beacon, where the old coastline used to be, so the
       doubled land is not empty ground between the same eight fights. */
    { id: 'marsh', name: 'تالاب خاکستری', x: 174, z: 63, r: 32, tier: 3, lead: 'warrior',
      mix: ['runner', 'bomber', 'warrior', 'neural', 'skitter'], loot: ['ammo', 'med'] },
    { id: 'gate', name: 'دروازهٔ سنگی', x: 181, z: -96, r: 32, tier: 4, lead: 'brute',
      mix: ['warrior', 'brute', 'neural', 'runner'], loot: ['ammo', 'med', 'ammo'] },
    { id: 'trench', name: 'خاکریز شمالی', x: 34, z: -192, r: 34, tier: 5, lead: 'brute',
      mix: ['brute', 'warrior', 'neural', 'runner', 'stalker'], loot: ['amber', 'ammo', 'med'] },
    { id: 'harbor', name: 'بندر گمشده', x: -140, z: -160, r: 32, tier: 4, lead: 'warrior',
      mix: ['warrior', 'neural', 'bomber', 'runner', 'stalker'], loot: ['shotgun', 'ammo'] },
    { id: 'sink', name: 'چالهٔ غربی', x: -199, z: 14, r: 32, tier: 4, lead: 'brute',
      mix: ['brute', 'warrior', 'runner', 'bomber'], loot: ['ammo', 'med'] },
    { id: 'dunes', name: 'تلماسهٔ جنوبی', x: 60, z: 185, r: 32, tier: 3, lead: 'warrior',
      mix: ['runner', 'skitter', 'warrior', 'neural'], loot: ['ammo', 'med'] },
    { id: 'bones', name: 'استخوانگاه', x: -100, z: 149, r: 30, tier: 2, lead: 'warrior',
      mix: ['runner', 'skitter', 'neural', 'warrior'], loot: ['rifle', 'ammo'] }
  ];

  function zoneSpot(z, spread) {
    for (var i = 0; i < 50; i++) {
      var a = rand(0, Math.PI * 2), rr = rand(0.1, spread) * z.r;
      var x = z.x + Math.cos(a) * rr, zz = z.z + Math.sin(a) * rr;
      if (heightAt(x, zz) < 1.6) continue;
      if (Math.hypot(x, zz) > ISLE_R * 0.86) continue;
      if (Math.hypot(x - BEACON.x, zz - BEACON.z) < 4) continue;
      return { x: x, z: zz };
    }
    return { x: z.x, z: z.z };
  }

  /* field stashes: a handful of supply cases left in the wild, far from the
     camps, so exploring the bigger island pays in bullets and bandages */
  function seedStashes() {
    var kinds = ['med', 'ammo'];
    for (var i = 0; i < N_STASH; i++) {
      var a = rand(0, 6.283), r = rand(0.34, 0.84) * ISLE_R;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 1.2) continue;
      var near = false;
      for (var k = 0; k < ZONES.length; k++) {
        if (Math.hypot(x - ZONES[k].x, z - ZONES[k].z) < 16) { near = true; break; }
      }
      if (near) continue;
      spawnPickup(kinds[i % 2], x, z);
    }
  }

  /* ------------------------------------------------------------ forge props
     models/props/manifest.json is written by tools/asset_pipeline.py, which runs
     whatever the 3D Asset Forge skill produced through its post-process and
     validator. The game only reads the manifest: file, radius, size, tint and
     the zones that should hold one. A missing GLB falls back to a procedural
     wreck, so the map never loses its cover. */
  var propManifest = null;
  var propTemplates = {};

  function propTint(hex) { return new T.Color(hex || 0x6d7178); }

  function paintProp(root, p) {
    var tint = propTint(p.tint);
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      var mat = o.material;
      if (!mat || Array.isArray(mat)) return;
      var c = mat.clone();
      if (!c.map) {
        c.color = tint.clone();
        c.roughness = 0.78;
        c.metalness = 0.55;
        c.emissive = new T.Color(0x000000);
        c.emissiveIntensity = 0;
      } else if (c.color) {
        c.color.multiply(tint);
      }
      o.material = c;
    });
  }

  function fallbackProp(p) {
    var g = new T.Group();
    var h = Math.max(1.1, (p.size && p.size[1]) || 1.6);
    var r = Math.max(0.7, p.radius || 1.2);
    var mat = new T.MeshStandardMaterial({ color: propTint(p.tint), roughness: 0.92, metalness: 0.34, flatShading: true });
    var hull = new T.Mesh(new T.BoxGeometry(r * 1.5, h * 0.55, r * 1.25), mat);
    hull.position.y = h * 0.28;
    hull.rotation.set(0.12, 0.35, 0.06);
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);
    var rib = new T.Mesh(new T.BoxGeometry(r * 0.35, h * 0.9, r * 0.3), mat);
    rib.position.set(r * 0.35, h * 0.45, -r * 0.2);
    rib.rotation.z = -0.25;
    rib.castShadow = true;
    g.add(rib);
    return g;
  }

  function propSpot(z, name, idx) {
    var base = name.length * 1.31 + idx * 2.17 + z.id.charCodeAt(0) * 0.37 + z.id.length;
    for (var k = 0; k < 14; k++) {
      var a = base + k * 2.399;
      var reach = z.r * (0.42 + 0.09 * ((k + idx) % 3));
      var x = z.x + Math.cos(a) * reach;
      var zz = z.z + Math.sin(a) * reach;
      if (heightAt(x, zz) < 1.6) continue;
      if (Math.hypot(x - BEACON.x, zz - BEACON.z) < 15) continue;
      if (Math.hypot(x - SPAWN.x, zz - SPAWN.z) < 10) continue;
      return { x: x, z: zz };
    }
    return null;
  }

  function spawnProps() {
    for (var i = 0; i < G.props.length; i++) scene.remove(G.props[i].mesh);
    G.props.length = 0;
    if (!propManifest) return;
    for (var m = 0; m < propManifest.length; m++) {
      var p = propManifest[m];
      var spots = p.spots || [];
      for (var s = 0; s < spots.length; s++) {
        var z = null;
        for (var zi = 0; zi < ZONES.length; zi++) if (ZONES[zi].id === spots[s]) z = ZONES[zi];
        if (!z || !z.cx) continue;
        var at = propSpot(z, p.name, s);
        if (!at) continue;
        var mesh;
        var tpl = propTemplates[p.name];
        if (tpl) {
          mesh = tpl.clone(true);
          paintProp(mesh, p);
        } else {
          mesh = fallbackProp(p);
        }
        /* forged wrecks are heavy debris: sink them into the sand a little so
           they read as part of the terrain, not as a model dropped on top */
        mesh.position.set(at.x, heightAt(at.x, at.z) - 0.22, at.z);
        mesh.rotation.y = (p.name.length * 0.73 + s * 1.91 + z.id.length) % 6.283;
        mesh.rotation.x = 0.03;
        mesh.rotation.z = -0.035;
        scene.add(mesh);
        var rr = Math.max(0.55, Math.min(2.6, p.radius || 1.2));
        colliders.push({ x: at.x, z: at.z, r: rr });
        if (p.cover !== false) {
          var hh = Math.max(1.3, (p.size && p.size[1]) || 2);
          var gy = heightAt(at.x, at.z);
          blockers.push({ x: at.x, z: at.z, r: rr * 0.9, y0: gy + 0.1, y1: gy + hh });
        }
        G.props.push({ mesh: mesh, name: p.name });
      }
    }
  }

  function loadPropManifest() {
    var req = new XMLHttpRequest();
    req.open('GET', 'models/props/manifest.json', true);
    req.responseType = 'text';
    req.onload = function () {
      try {
        var data = JSON.parse(req.responseText);
        propManifest = data && data.props && data.props.length ? data.props : null;
      } catch (e) { propManifest = null; }
      if (!propManifest) return;
      for (var i = 0; i < propManifest.length; i++) loadPropModel(propManifest[i]);
      if (G.running) spawnProps();
    };
    req.onerror = function () {};
    try { req.send(); } catch (e) {}
  }

  function loadPropModel(p) {
    var loader = new T.GLTFLoader();
    var req = new XMLHttpRequest();
    req.open('GET', p.file, true);
    req.responseType = 'arraybuffer';
    req.onload = function () {
      try {
        loader.parse(req.response, '', function (gltf) {
          propTemplates[p.name] = gltf.scene;
          if (G.running) spawnProps();
        }, function () {});
      } catch (e) {}
    };
    req.onerror = function () {};
    try { req.send(); } catch (e) {}
  }

  /* Free-roaming patrols: the open ground between camps is not a nature walk.
     They are not tied to a zone, so clearing a camp still means clearing the
     camp, but the island itself keeps a few fights in it. */
  function seedPatrols() {
    var kinds = ['runner', 'skitter', 'runner', 'warrior', 'neural'];
    for (var i = 0; i < N_PATROL; i++) {
      var a = rand(0, 6.283), r = rand(0.22, 0.82) * ISLE_R;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) < 1.2) continue;
      var nearZone = false;
      for (var k = 0; k < ZONES.length; k++) {
        if (Math.hypot(x - ZONES[k].x, z - ZONES[k].z) < 34) { nearZone = true; break; }
      }
      if (nearZone || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 26) continue;
      var kind = kinds[i % kinds.length];
      for (var n = 0; n < 2; n++) {
        var px = x + rand(-3.5, 3.5), pz = z + rand(-3.5, 3.5);
        if (heightAt(px, pz) < 1) continue;
        var e = spawnEnemy(kind, px, pz, false, false);
        e.home = { x: px, z: pz };
      }
    }
  }

  /* Camp dressing: a garrison that only fields invisible patrols on a bare hill
     reads as empty ground. Tents and sandbag lines give every zone a silhouette
     you can spot from a ridge and real cover to fight around. */
  /* Camp dressing is instanced across the whole island: with fifteen camps, a
     tent-per-mesh alone would cost more than a hundred draw calls. */
  var tentMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  var bagMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  var tentGeo = new T.ConeGeometry(2.0, 2.3, 4);
  var bagGeo = new T.BoxGeometry(1.05, 0.44, 0.58);
  var tentColA = new T.Color(0x4a4a3a), tentColB = new T.Color(0x3a4550);
  var bagColA = new T.Color(0x6b6146), bagColB = new T.Color(0x7a7052);
  var campCol = new T.Color();
  var campObj = new T.Object3D();
  var campTents = null, campBags = null, campTi = 0, campBi = 0;

  function ensureCampMeshes() {
    if (campTents) return;
    campTents = new T.InstancedMesh(tentGeo, tentMat, ZONES.length * 5);
    campTents.castShadow = true;
    campTents.receiveShadow = true;
    campBags = new T.InstancedMesh(bagGeo, bagMat, ZONES.length * 7);
    campBags.castShadow = true;
    campBags.receiveShadow = true;
    scene.add(campTents, campBags);
  }

  function flushCampMeshes() {
    if (!campTents) return;
    campTents.count = campTi;
    campTents.instanceMatrix.needsUpdate = true;
    if (campTents.instanceColor) campTents.instanceColor.needsUpdate = true;
    campBags.count = campBi;
    campBags.instanceMatrix.needsUpdate = true;
    if (campBags.instanceColor) campBags.instanceColor.needsUpdate = true;
  }

  function seedCampDressing(z) {
    ensureCampMeshes();
    var count = 3 + (z.tier > 2 ? 1 : 0);
    for (var t = 0; t < count; t++) {
      var p = zoneSpot(z, 0.55);
      var ty = heightAt(p.x, p.z);
      campObj.position.set(p.x, ty + 1.05, p.z);
      campObj.rotation.set(0, rand(0, 6.283), 0);
      campObj.scale.setScalar(rand(0.9, 1.2));
      campObj.updateMatrix();
      campTents.setMatrixAt(campTi, campObj.matrix);
      campTents.setColorAt(campTi, campCol.copy(t % 3 === 0 ? tentColB : tentColA));
      campTi++;
      colliders.push({ x: p.x, z: p.z, r: 1.5 });
      blockers.push({ x: p.x, z: p.z, r: 1.5, y0: ty, y1: ty + 2.1 });
    }
    var bp = zoneSpot(z, 0.72);
    var ba = rand(0, 6.283);
    for (var b = 0; b < 5; b++) {
      var bx = bp.x + Math.cos(ba) * (b - 2) * 1.08;
      var bz = bp.z + Math.sin(ba) * (b - 2) * 1.08;
      var by = heightAt(bx, bz);
      campObj.position.set(bx, by + 0.22, bz);
      campObj.rotation.set(0, -ba, 0);
      campObj.scale.setScalar(1);
      campObj.updateMatrix();
      campBags.setMatrixAt(campBi, campObj.matrix);
      campBags.setColorAt(campBi, campCol.copy(b % 2 === 0 ? bagColA : bagColB));
      campBi++;
    }
    colliders.push({ x: bp.x, z: bp.z, r: 1.1 });
    blockers.push({ x: bp.x, z: bp.z, r: 1.4, y0: heightAt(bp.x, bp.z), y1: heightAt(bp.x, bp.z) + 0.7 });
  }

  /* --------------------------------------------- the twenty bounty hunters
     Twenty named hunters live on the island. Each one is a pawn like any
     other - a contract can name one, a rival can cut one down, the player can
     loot one - but they carry a trained blade, they keep a grudge, and when
     they fall the sky hands them back ten seconds later, exactly like the
     player. Their home is a camp; their accent is their signature. */
  var HUNTER_DEFS = [
    { name: 'کاوهٔ تیغهٔ سرخ', kind: 'warrior', rank: 3, accent: 0xff5b6e, home: [72, 62] },
    { name: 'سایهٔ دوتیغه', kind: 'stalker', rank: 2, accent: 0x9b7bff, home: [-76, 58] },
    { name: 'گرگ تلماسه', kind: 'runner', rank: 2, accent: 0x8ce07a, home: [60, 185] },
    { name: 'عصب‌زن سپیده', kind: 'neural', rank: 2, accent: 0x6fd8ff, home: [0, -46] },
    { name: 'مشت آهنین', kind: 'brute', rank: 3, accent: 0xffa64d, home: [96, -50] },
    { name: 'جهندهٔ بی‌صدا', kind: 'skitter', rank: 2, accent: 0xd0a4ff, home: [-112, 4] },
    { name: 'بمب‌گذار دیوانه', kind: 'bomber', rank: 2, accent: 0xffc46a, home: [140, 6] },
    { name: 'بانوی زره‌پوش', kind: 'warrior', rank: 4, accent: 0xffd166, home: [34, -108] },
    { name: 'شمشیر سرد', kind: 'warrior', rank: 3, accent: 0xbfe9ff, home: [-72, -88] },
    { name: 'زخم کهربا', kind: 'stalker', rank: 3, accent: 0xffb35c, home: [174, 63] },
    { name: 'سنگ‌شکن', kind: 'brute', rank: 3, accent: 0xd8d2c4, home: [181, -96] },
    { name: 'کماندار بنفش', kind: 'neural', rank: 3, accent: 0xb56bff, home: [34, -192] },
    { name: 'باد غربی', kind: 'runner', rank: 3, accent: 0x7dffb0, home: [-199, 14] },
    { name: 'دزد بندر', kind: 'skitter', rank: 3, accent: 0x8ff0ff, home: [-140, -160] },
    { name: 'استخوان‌خوار', kind: 'brute', rank: 4, accent: 0xe9fff4, home: [-100, 149] },
    { name: 'تیغهٔ نقره', kind: 'warrior', rank: 2, accent: 0xdceaff, home: [110, -52] },
    { name: 'پرچم‌دار سرخ', kind: 'bomber', rank: 3, accent: 0xff845c, home: [150, 20] },
    { name: 'گراز زخمی', kind: 'brute', rank: 2, accent: 0xa87cff, home: [64, 70] },
    { name: 'سایهٔ شمال', kind: 'stalker', rank: 4, accent: 0x8a4bff, home: [20, -180] },
    { name: 'آخرین شکارچی', kind: 'neural', rank: 4, accent: 0xff7bdc, home: [-30, -40] }
  ];
  var HUNTER_RESPAWN = 10;
  var HUNTER_SKY = 46;

  function spawnHunter(slot, x, z, sky) {
    var def = slot.def;
    var e = spawnEnemy(def.kind, x, z, false, false);
    if (!e) return null;
    e.hunterDef = def;
    e.slot = slot;
    e.pro = true;
    e.name = def.name;
    e.zone = null;
    e.poise = true;
    e.combo = def.rank >= 3 ? 2 : 1;
    e.maxHp = Math.round(e.maxHp * (1 + 0.25 * def.rank));
    e.hp = e.maxHp;
    upgradeBot(e, Math.min(4, def.rank));
    if (e.rankRing) {
      e.rankRing.material.color.setHex(def.accent);
      e.rankRing.material.opacity = 0.66;
    }
    if (e.rankBlade) {
      e.rankBlade.traverse(function (o) {
        if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(def.accent);
      });
    }
    /* a signature ring under the feet: a hunter reads from a distance */
    var ring = new T.Mesh(
      new T.TorusGeometry(e.def.r * 1.35, 0.045, 6, 24),
      new T.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    e.group.add(ring);
    e.proRing = ring;
    if (sky) {
      e.sky = HUNTER_SKY;
      e.pos.y = heightAt(x, z) + HUNTER_SKY;
      e.group.position.y = e.pos.y;
      e.group.rotation.y = rand(0, 6.283);
    }
    return e;
  }

  function seedHunters() {
    G.roster = [];
    for (var i = 0; i < HUNTER_DEFS.length; i++) {
      var def = HUNTER_DEFS[i];
      var slot = { def: def, e: null, timer: 0, deaths: 0 };
      G.roster.push(slot);
      var hx = def.home[0] + rand(-7, 7), hz = def.home[1] + rand(-7, 7);
      if (heightAt(hx, hz) < 1.3) { hx = def.home[0]; hz = def.home[1]; }
      slot.e = spawnHunter(slot, hx, hz, 0);
      if (slot.e) slot.e.home = { x: hx, z: hz };
    }
  }

  /* ten seconds after a hunter falls, the sky gives them back */
  function updateHunters(dt) {
    for (var i = 0; i < G.roster.length; i++) {
      var s = G.roster[i];
      if (s.e) continue;
      s.timer -= dt;
      if (s.timer > 0) continue;
      var a = rand(0, 6.283), r = rand(52, 92);
      var hx = P.pos.x + Math.cos(a) * r, hz = P.pos.z + Math.sin(a) * r;
      if (heightAt(hx, hz) < 1.3) { hx = s.def.home[0]; hz = s.def.home[1]; }
      s.timer = 0;
      s.e = spawnHunter(s, hx, hz, true);
      if (s.e) {
        s.e.home = { x: hx, z: hz };
        if (s.deaths > 1) toast(s.def.name + ' از آسمان برگشت');
      }
    }
  }

  function seedZones() {
    /* camp props are instanced: restart their counters so a resume rebuild
       does not leave stale tents standing */
    ensureCampMeshes();
    campTi = 0;
    campBi = 0;
    /* hazards from a previous run (resume) are rebuilt from scratch */
    for (var hz = 0; hz < G.barrels.length; hz++) scene.remove(G.barrels[hz].mesh);
    for (var hz2 = 0; hz2 < G.traps.length; hz2++) scene.remove(G.traps[hz2].mesh);
    G.barrels.length = 0;
    G.traps.length = 0;
    for (var zi = 0; zi < ZONES.length; zi++) {
      var z = ZONES[zi];
      z.leader = null;
      var spot = zoneSpot(z, 0.22);
      z.cx = spot.x; z.cz = spot.z;
      var mix = z.mix.slice();
      if (G.diffExtra > 0) mix.push(z.mix[z.mix.length - 1]);
      else if (G.diffExtra < 0) mix.pop();
      /* a big island needs camps worth walking to: the garrison grows with
         tier, but a phone keeps the lean version so fifteen camps stay playable */
      if (z.tier >= 2 && !IS_TOUCH) mix.push(z.mix[0]);
      if (z.tier >= 4 && !IS_TOUCH) mix.push(z.mix[1] || z.mix[0]);
      for (var i = 0; i < mix.length; i++) {
        var pt = zoneSpot(z, 0.75);
        var e = spawnEnemy(mix[i], pt.x, pt.z, false);
        e.zone = z;
        e.home = { x: pt.x, z: pt.z };
        z.alive++;
      }
      /* every garrison keeps one hardened sergeant: the fight now has a peak */
      var lp = zoneSpot(z, 0.4);
      var lb = spawnEnemy(z.lead || mix[mix.length - 1], lp.x, lp.z, false, true);
      lb.zone = z;
      lb.home = { x: lp.x, z: lp.z };
      lb.name = 'سرگروه ' + z.name;
      z.alive++;
      z.leader = lb;
      seedCampDressing(z);
      seedHazards(z);
    }
    seedPatrols();
    spawnProps();
    flushCampMeshes();
  }

  /* Explosive barrels and spike plates: a third answer to a garrison besides
     bullets and sneaking. Barrels chain, traps punish careless footwork. */
  function seedHazards(z) {
    for (var b = 0; b < 2; b++) {
      var ba = rand(0, 6.283);
      var bx = z.x + Math.cos(ba) * z.r * rand(0.35, 0.6);
      var bz = z.z + Math.sin(ba) * z.r * rand(0.35, 0.6);
      if (heightAt(bx, bz) < 1.4) continue;
      var by = heightAt(bx, bz);
      var grp = new T.Group();
      var drum = new T.Mesh(
        new T.CylinderGeometry(0.52, 0.58, 1.45, 12),
        new T.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.72, metalness: 0.45 })
      );
      drum.position.y = 0.74;
      drum.castShadow = true;
      grp.add(drum);
      var stripe = new T.Mesh(
        new T.CylinderGeometry(0.545, 0.56, 0.24, 12, 1, true),
        new T.MeshStandardMaterial({ color: 0xffc46a, emissive: 0xff7a1a, emissiveIntensity: 1.3, roughness: 0.4 })
      );
      stripe.position.y = 0.9;
      grp.add(stripe);
      grp.position.set(bx, by, bz);
      scene.add(grp);
      colliders.push({ x: bx, z: bz, r: 0.55 });
      /* soft enough that one pistol round sets it off: a barrel you have to
         shoot twice reads as scenery, not as a tool */
      G.barrels.push({ mesh: grp, x: bx, z: bz, y: by, hp: 28, dead: false, zone: z, stripe: stripe });
    }

    var ta = rand(0, 6.283);
    var tx = z.x + Math.cos(ta) * z.r * rand(0.18, 0.42);
    var tz = z.z + Math.sin(ta) * z.r * rand(0.18, 0.42);
    if (heightAt(tx, tz) > 1.2) {
      var ty = heightAt(tx, tz);
      var tg = new T.Group();
      var plate = new T.Mesh(
        new T.CylinderGeometry(1.15, 1.15, 0.14, 14),
        new T.MeshStandardMaterial({ color: 0x3a3844, roughness: 0.8, metalness: 0.5 })
      );
      plate.position.y = 0.07;
      tg.add(plate);
      var spikeMat = new T.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.5, metalness: 0.7, emissive: 0x2a0d0d, emissiveIntensity: 1 });
      for (var s = 0; s < 7; s++) {
        var sa = s / 7 * Math.PI * 2;
        var spike = new T.Mesh(new T.ConeGeometry(0.09, 0.62, 5), spikeMat);
        spike.position.set(Math.cos(sa) * 0.62, 0.42, Math.sin(sa) * 0.62);
        tg.add(spike);
      }
      tg.position.set(tx, ty, tz);
      scene.add(tg);
      G.traps.push({ mesh: tg, x: tx, z: tz, y: ty, armed: true, cool: 0, mat: spikeMat });
    }
  }

  /* --------------------------------------------------------------- bio scan
     New for the bigger island: three charges of a biological ping that paints
     every living thing and every cache near you straight through rock for
     seven seconds. It costs a decision instead of turning the map into a
     compass you never have to think about. Clearing a zone adds a charge. */
  var markTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g2 = c.getContext('2d');
    g2.translate(32, 32);
    g2.rotate(Math.PI / 4);
    g2.fillStyle = 'rgba(255,255,255,.30)';
    g2.fillRect(-17, -17, 34, 34);
    g2.fillStyle = 'rgba(255,255,255,.95)';
    g2.fillRect(-11, -11, 22, 22);
    return new T.CanvasTexture(c);
  })();

  function makeMark(obj, y, color) {
    var s = new T.Sprite(new T.SpriteMaterial({
      map: markTex, color: color, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, sizeAttenuation: false, blending: T.AdditiveBlending
    }));
    s.scale.setScalar(0.048);
    s.position.y = y;
    s.renderOrder = 997;
    s.visible = false;
    obj.add(s);
    return s;
  }

  /* ----------------------------------------------------------------- enemies */
  function aggroEnemy(e) {
    if (e.aggro || e.dead) return;
    e.aggro = true;
    e.aggroT = 5.2;
    e.noticeT = 0;
    e.state = 'walk';
    e.stateT = 0;
    e.backoff = 0;
    e.cd = Math.min(e.cd, 0.9);
    SFX3D.play('growl', e.pos);
    /* only the two closest friends of the camp wake up with it */
    var n = 0;
    for (var i = 0; i < G.enemies.length && n < 2; i++) {
      var o = G.enemies[i];
      if (o === e || o.dead || o.aggro) continue;
      if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 9) {
        o.aggro = true; o.aggroT = 4; o.noticeT = 0; o.state = 'walk'; o.cd = Math.min(o.cd, 1.2);
        n++;
      }
    }
  }

  /* A swing is a swing: the same cut lands on a bot or on the player, and the
     only difference is who gets paid for it. */
  function hitPawn(e, foe, amount) {
    if (foe && !foe.dead) damageEnemy(foe, amount, null, false, e);
    else hurtPlayer(amount, e.pos, e);
  }

  /* ------------------------------------------------------------ bot quarrels
     The island does not revolve around the player. Every few seconds two pawns
     close enough to each other get a reason to hate one another, and that
     fight resolves whether or not anyone is watching. A bot that wins takes
     the contract pay like anybody else, because a pawn is a pawn. */
  function updateFeuds(dt) {
    G.feudT -= dt;
    if (G.feudT > 0) return;
    G.feudT = rand(2.4, 5.0);
    var pool = [], duels = 0;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      if (e.foe) { duels++; continue; }
      if (e.hunter || e.bounty || e.def.boss || e.age < 0.6) continue;
      if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > 110) continue;
      pool.push(e);
    }
    if (pool.length < 2 || duels > 7) return;
    var a = pool[(Math.random() * pool.length) | 0];
    var best = null, bd = 26;
    for (var k = 0; k < pool.length; k++) {
      var o = pool[k];
      if (o === a) continue;
      var d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    var t = rand(10, 18);
    a.foe = best; a.foeT = t;
    best.foe = a; best.foeT = t;
    /* a growl across the sand is the only announcement a feud gets */
    if (Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 40) SFX3D.play('growl', a.pos);
  }

  function calmEnemy(e) {
    e.aggro = false;
    e.aggroT = 0;
    e.noticeT = 0;
    e.state = 'walk';
    e.stateT = 0;
    e.backoff = 0;
    e.burst = 0;
    e.cd = rand(1.4, 2.4);
  }

  function updateEnemies(dt) {
    var p = P.pos;
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var e = G.enemies[i];
      var ud = e.group.userData;

      if (e.dead) {
        e.dying -= dt;
        if (ud.view) {
          /* the rig topples and sinks into the sand - no cartoon shrink */
          ud.view.tick(dt);
          e.group.position.y -= dt * (e.dying > 0.6 ? 0.8 : 0.3);
        } else {
          e.group.rotation.z += dt * 2.4;
          e.group.position.y -= dt * 1.1;
          e.group.scale.multiplyScalar(1 - Math.min(0.9, dt * 1.6));
        }
        if (e.dying <= 0) {
          removeEnemy(e);
          G.enemies.splice(i, 1);
        }
        continue;
      }

      /* a hunter falling back in: no AI, no damage, just the drop */
      if (e.sky >= 0) {
        e.sky -= dt * 16;
        var sgy = heightAt(e.pos.x, e.pos.z);
        if (e.sky > 0) {
          e.pos.y = sgy + e.sky;
          e.group.position.set(e.pos.x, e.pos.y, e.pos.z);
          e.group.rotation.y += dt * 2.2;
          e.px = e.pos.x; e.pz = e.pos.z;
          continue;
        }
        e.sky = -1;
        e.pos.y = sgy;
        e.group.position.y = sgy;
        emit(e.pos.x, sgy + 0.2, e.pos.z, 18, 0xd8e6ff, 7, 0.6, 10);
        emit(e.pos.x, sgy + 0.2, e.pos.z, 8, 0xffd166, 4, 0.5, 8);
        SFX3D.play('explode', e.pos);
        G.shake = Math.min(1.4, G.shake + 0.3);
      }

      e.t += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
      if (e.hitT > 0) e.hitT -= dt;
      if (e.guardT > 0) e.guardT -= dt;
      var glowBase = e.bounty ? 0.34 : e.rank ? 0.3 : (e.elite || e.leader) ? 0.5 : 0.07;
      if (ud.mats) {
        for (var mi = 0; mi < ud.mats.length; mi++) ud.mats[mi].emissiveIntensity = glowBase + e.flash * 2.4;
      } else {
        ud.mat.emissiveIntensity = 0.55 + e.flash * 3;
      }

      var dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      var dist = Math.hypot(dx, dz) || 0.001;
      /* a huge island on a phone: garrisons nobody is near keep their post
         without paying for animation, pathing or separation. A phone culls
         sooner than the desktop, at a range the fog already hides. */
      /* hunters and duellists keep fighting off-screen: the contract moves
         without the player, so a far hunt must still resolve */
      if (!e.aggro && !e.hunter && !e.foe && !e.pro && dist > CULL_R) {
        e.group.visible = false;
        e.px = e.pos.x; e.pz = e.pos.z;
        if (ud.bar) ud.bar.visible = false;
        continue;
      }
      if (!e.group.visible) e.group.visible = true;
      var nx = dx / dist, nz = dz / dist;
      var spd = e.def.spd * (e.elite ? 1.07 : 1) * (e.leader ? 1.08 : 1) * (1 + 0.1 * (G.nightK || 0));
      if (e.slowT > 0) { e.slowT -= dt; spd *= 0.5; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= dt * 7;
        if (Math.random() < dt * 9) emit(e.pos.x + rand(-0.4, 0.4), e.pos.y + rand(0.4, e.def.h), e.pos.z + rand(-0.4, 0.4), 1, 0xff8a2a, 1.2, 0.5, -2);
        if (e.hp <= 0) { killEnemy(e, null); continue; }
      }
      if (e.routed > 0) { e.routed -= dt; spd *= 0.4; e.cd = Math.max(e.cd, 1.1); }
      if (e.stagger > 0) { e.stagger -= dt; spd *= 0.12; }
      e.age += dt;
      if (e.age < 0.45) spd = 0;   /* brief spawn beat */

      if (e.flankT > 0) e.flankT -= dt;
      else { e.flank = rand(-1, 1); e.flankT = rand(1.8, 4.2); }

      /* --- awareness. No garrison homes in on the player just for seeing
         him: the island's business is its own. A bot turns on you only when
         the contract names you, when you cut it first, or when you walk into
         its face - everyone else fights whoever it was already fighting. --- */
      var losP = false;
      if (dist < 60) {
        var eyeY = e.pos.y + e.def.h * 0.8;
        tmpA.set(p.x - e.pos.x, (p.y + 1.15) - eyeY, p.z - e.pos.z);
        var span = tmpA.length();
        if (span > 0.3) {
          tmpA.divideScalar(span);
          tmpB.set(e.pos.x, eyeY, e.pos.z);
          losP = clearLine(tmpB, tmpA, span);
        }
      }
      var sense = (e.def.boss ? 58 : (e.def.ranged ? 46 : 30)) * (1 + 0.3 * (G.nightK || 0) - (G.storm > 0 ? 0.22 : 0));
      if (sense < 13) sense = 13;
      if (!e.aggro) {
        if (G.bounty && G.bounty.you && !G.down && dist < 62) {
          aggroEnemy(e);                         /* the island named the player */
        } else if (losP && dist < 8) {
          e.noticeT += dt;
          if (e.noticeT > 0.45) aggroEnemy(e);   /* walked into its face */
        } else {
          e.noticeT = Math.max(0, e.noticeT - dt * 1.4);
        }
      } else {
        if (losP && dist < sense * 1.5) e.aggroT = 5.2;
        e.aggroT -= dt;
        /* the contract keeps its hunters; everyone else lets the player go */
        if (!e.bounty && !(G.bounty && G.bounty.you) && (dist > 34 || (e.aggroT <= 0 && !losP))) calmEnemy(e);
      }

      var reach = e.def.r + 1.1;
      var faceA = Math.atan2(dx, dz);

      /* --- bots fight each other. A hunter goes for the named pawn, a
         duellist keeps its grudge, and the player is one more pawn. --- */
      var foe = null;
      if (e.foe) {
        e.foeT -= dt;
        if (e.foe.dead || e.foe === e || e.foeT <= 0 || G.enemies.indexOf(e.foe) < 0) e.foe = null;
        else foe = e.foe;
      }
      if (!foe && e.hunter && G.bounty && G.bounty.e && !G.bounty.you && !G.bounty.e.dead && G.bounty.e !== e) {
        foe = G.bounty.e;
      }
      if (foe) {
        dx = foe.pos.x - e.pos.x;
        dz = foe.pos.z - e.pos.z;
        dist = Math.hypot(dx, dz) || 0.001;
        nx = dx / dist;
        nz = dz / dist;
        faceA = Math.atan2(dx, dz);
      }

      /* line of sight to whoever this pawn is actually fighting */
      var los = false;
      if (dist < 60) {
        var tx2 = foe ? foe.pos.x : p.x, tz2 = foe ? foe.pos.z : p.z;
        var ty2 = foe ? foe.pos.y + foe.def.h * 0.75 : p.y + 1.15;
        tmpA.set(tx2 - e.pos.x, ty2 - (e.pos.y + e.def.h * 0.8), tz2 - e.pos.z);
        var span2 = tmpA.length();
        if (span2 > 0.3) {
          tmpA.divideScalar(span2);
          tmpB.set(e.pos.x, e.pos.y + e.def.h * 0.8, e.pos.z);
          los = clearLine(tmpB, tmpA, span2);
        }
      }

      if (foe) {
        if (dist > reach) {
          e.pos.x += nx * spd * 0.9 * dt;
          e.pos.z += nz * spd * 0.9 * dt;
        } else {
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = rand(1.2, 1.9);
            if (ud.view) ud.view.attack();
            e.bladeT = 0;
            damageEnemy(foe, e.def.dmg * 0.8 * (e.dmgMul || 1), null, false, e);
          }
        }
      } else if (!e.aggro) {
        /* patrol the camp on a slow loop, eyes down; no pursuit */
        e.tr += dt * 0.24;
        var hx = e.home.x + Math.cos(e.tr) * 3.6;
        var hz = e.home.z + Math.sin(e.tr) * 3.6;
        var hd = Math.hypot(hx - e.pos.x, hz - e.pos.z);
        if (hd > 0.7) {
          e.pos.x += (hx - e.pos.x) / hd * spd * 0.34 * dt;
          e.pos.z += (hz - e.pos.z) / hd * spd * 0.34 * dt;
        }
        faceA = e.tr + Math.PI / 2;
      } else if (e.def.boss) {
        if (dist > 13) { e.pos.x += nx * spd * dt; e.pos.z += nz * spd * dt; }
        else { e.pos.x += -nz * e.flank * spd * 0.5 * dt; e.pos.z += nx * e.flank * spd * 0.5 * dt; }
        e.cd -= dt;
        if (e.cd <= 0 && dist < 40 && los) {
          e.cd = 2.6;
          var fan = 1 + (e.zone ? e.zone.tier : 1);
          for (var s = 0; s < fan; s++) {
            var ang = Math.atan2(nx, nz) + (s - (fan - 1) / 2) * 0.18;
            fireEnemyBolt(e, Math.sin(ang), Math.cos(ang), 12, 13, 0.5, foe);
          }
        }
      } else if (e.def.ranged) {
        var want = 13 + e.flank * 3;
        if (dist > want + 4) { e.pos.x += nx * spd * dt; e.pos.z += nz * spd * dt; }
        else if (dist < want - 5) { e.pos.x -= nx * spd * 0.9 * dt; e.pos.z -= nz * spd * 0.9 * dt; }
        else { e.pos.x += -nz * e.flank * spd * 0.7 * dt; e.pos.z += nx * e.flank * spd * 0.7 * dt; }
        e.cd -= dt;
        if (e.burst > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burst--;
            e.burstT = 0.2;
            if (los) fireEnemyBolt(e, nx, nz, 9, 21, 0.8, foe);
            if (ud.view) ud.view.attack();
          }
        } else if (e.cd <= 0 && dist < 30 && los) {
          e.cd = rand(2.6, 3.6);
          e.burst = 3;
          e.burstT = 0.08;
        }
      } else if (e.def.explode) {
        e.pos.x += nx * spd * dt;
        e.pos.z += nz * spd * dt;
        if (dist < 2.9) {
          e.stateT += dt;
          var blink = 1.6 + Math.sin(e.t * 30) * 1.2;
          if (ud.mats) { for (var bi = 0; bi < ud.mats.length; bi++) ud.mats[bi].emissiveIntensity = blink; }
          else ud.mat.emissiveIntensity = blink;
          if (e.stateT === dt) SFX3D.play('growl', e.pos);
          if (e.stateT > 0.9) {
            explodeEnemy(e);
            continue;
          }
        }
      } else if (e.def.charge) {
        if (e.state === 'charge') {
          e.pos.x += e.cx * 12 * dt;
          e.pos.z += e.cz * 12 * dt;
          e.stateT -= dt;
          if (dist < e.def.r + 1.2) {
            hitPawn(e, foe, e.def.dmg * (e.dmgMul || 1));
            e.state = 'walk';
            e.stateT = 0;
            e.cd = 3.6;
          }
          if (e.stateT <= 0) { e.state = 'walk'; e.cd = 4; }
        } else if (e.state === 'wind') {
          e.stateT -= dt;
          var wind = 1.2 + Math.sin(e.t * 22) * 0.7;
          if (ud.mats) { for (var wi = 0; wi < ud.mats.length; wi++) ud.mats[wi].emissiveIntensity = wind; }
          else ud.mat.emissiveIntensity = wind;
          if (e.stateT <= 0) {
            e.state = 'charge';
            e.stateT = 0.8;
            e.cx = nx; e.cz = nz;
            SFX3D.play('growl', e.pos);
          }
        } else {
          e.pos.x += nx * spd * dt;
          e.pos.z += nz * spd * dt;
          e.cd -= dt;
          if (dist < 11 && e.cd <= 0) { e.state = 'wind'; e.stateT = 0.55; if (ud.view) ud.view.wind(); }
          if (dist < e.def.r + 1.0 && e.cd <= 0) {
            hitPawn(e, foe, e.def.dmg * 0.6 * (e.dmgMul || 1));
            e.cd = 1.9;
          }
        }
      } else {
        /* melee. A trained hunter fights in a rhythm: close the gap with a
           lunge, cut twice, step out on the arc, and raise its blade when the
           player winds up. A camp bot just presses in and swings. */
        if (e.state === 'wind') {
          e.stateT -= dt;
          e.pos.x += nx * (e.pro ? 1.7 : 0.8) * dt;
          e.pos.z += nz * (e.pro ? 1.7 : 0.8) * dt;
          if (e.stateT <= 0) {
            e.state = 'walk';
            e.cd = e.pro ? rand(0.75, 1.15) : rand(1.5, 2.1);
            e.backoff = e.pro ? rand(0.35, 0.9) : rand(1.6, 2.6);
            if (dist < reach * (e.pro ? 1.9 : 1.6)) {
              hitPawn(e, foe, e.def.dmg * (e.dmgMul || 1));
              if (ud.view) ud.view.attack();
              e.bladeT = 0;
              /* a hunter chains the second cut before stepping back */
              if (e.pro && e.combo > 0) {
                e.combo--;
                e.state = 'wind';
                e.stateT = 0.24;
                e.backoff = 0;
              }
            }
          }
        } else if (e.lunge > 0) {
          /* a committed dash with the blade already coming down */
          e.lunge -= dt;
          e.pos.x += nx * spd * 2.4 * dt;
          e.pos.z += nz * spd * 2.4 * dt;
          if (dist < reach * 1.2) {
            e.lunge = 0;
            e.state = 'wind';
            e.stateT = 0.22;
            e.cd = rand(0.9, 1.4);
            if (ud.view) ud.view.attack();
            e.bladeT = 0;
            hitPawn(e, foe, e.def.dmg * 0.85 * (e.dmgMul || 1));
          }
        } else if (e.backoff > 0) {
          e.backoff -= dt;
          if (e.backoff <= 0 && e.pro) e.combo = Math.max(e.combo, 1);
          if (dist < 4.4) {
            e.pos.x -= nx * spd * 0.6 * dt;
            e.pos.z -= nz * spd * 0.6 * dt;
          } else if (dist > 7.5) {
            e.pos.x += nx * spd * 0.45 * dt;
            e.pos.z += nz * spd * 0.45 * dt;
          } else {
            e.pos.x += -nz * e.flank * spd * 0.4 * dt;
            e.pos.z += nx * e.flank * spd * 0.4 * dt;
          }
        } else if (e.pro && e.cd <= 0.35 && dist > 5.5 && dist < 12 && los) {
          /* too far to cut and too close to ignore: dash in */
          e.lunge = 0.5;
          e.cd = rand(1.4, 2.1);
          if (ud.view) ud.view.wind();
        } else if (dist > reach) {
          e.pos.x += nx * spd * dt;
          e.pos.z += nz * spd * dt;
          /* a hunter's next cut is always loading while it closes in */
          if (e.pro) e.cd -= dt * 0.75;
        } else {
          e.cd -= dt;
          /* read the wind-up and guard: a hunter is not a sandbag */
          if (e.pro && dist < reach * 1.35 && G.swingT < 0.09) e.guardT = 0.4;
          if (e.cd <= 0) { e.state = 'wind'; e.stateT = e.pro ? 0.3 : 0.45; if (ud.view) ud.view.wind(); }
        }
      }

      /* separation so a squad does not stack into one silhouette */
      for (var k = 0; k < G.enemies.length; k++) {
        var o = G.enemies[k];
        if (o === e || o.dead) continue;
        var odx = e.pos.x - o.pos.x, odz = e.pos.z - o.pos.z;
        var od = Math.hypot(odx, odz);
        var minD = e.def.r + o.def.r;
        if (od > 0.001 && od < minD) {
          var push = (minD - od) / od * 0.7;
          e.pos.x += odx * push;
          e.pos.z += odz * push;
        }
      }

      /* keep them on the island */
      if (heightAt(e.pos.x, e.pos.z) < 0.25) {
        e.pos.x -= nx * spd * dt * 1.4;
        e.pos.z -= nz * spd * dt * 1.4;
      }

      e.pos.y = heightAt(e.pos.x, e.pos.z);
      var walkBob = Math.sin(e.t * (4 + spd * 0.7)) * (e.def.boss ? 0.06 : 0.05);
      e.group.position.set(e.pos.x, e.pos.y + Math.abs(walkBob), e.pos.z);
      /* turn instead of snapping: the body banks into the corner and the
         GLB rig leans with it, which is most of what reads as "alive" */
      var dyaw = ((faceA - e.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      e.group.rotation.y += dyaw * Math.min(1, dt * 7);
      if (ud.view && ud.view.lean) ud.view.lean(clamp(dyaw * 6, -1, 1));
      if (dist < 44 && e.def.spd > 3) {
        var stepSpd = Math.hypot(e.pos.x - e.px, e.pos.z - e.pz) / Math.max(dt, 0.0001);
        if (stepSpd > 2.4 && Math.random() < dt * 7) {
          emit(e.pos.x, e.pos.y + 0.06, e.pos.z, 1, 0x8a7a66, 0.7, 0.45, 2);
        }
      }

      /* skeletal playback for the GLB actors, procedural swing for fallbacks */
      if (ud.view) {
        var rate = Math.hypot(e.pos.x - e.px, e.pos.z - e.pz) / Math.max(dt, 0.0001);
        var st = e.state === 'wind' ? 'idle' : (rate > 3.5 ? 'run' : (rate > 0.35 ? 'walk' : 'idle'));
        ud.view.setState(st, 0.15);
        ud.view.speed(rate);
        ud.view.tick(dt);
      } else {
        /* procedural rig: a real walk cycle instead of two legs on one sine */
        var sp = clamp(Math.hypot(e.pos.x - e.px, e.pos.z - e.pz) / Math.max(dt, 0.0001) / 4, 0, 1.2);
        var stride = clamp(sp, 0.12, 1);
        var swing = Math.sin(e.t * (4.4 + spd * 1.1)) * 0.62 * stride;
        if (ud.legL) { ud.legL.rotation.x = swing; ud.legR.rotation.x = -swing; }
        if (ud.armL) {
          ud.armL.rotation.x = -swing * 0.75 - 0.06;
          ud.armR.rotation.x = swing * 0.75 - 0.06;
          ud.armL.rotation.z = 0.16 + Math.sin(e.t * 2.1) * 0.03;
          ud.armR.rotation.z = -0.16 - Math.sin(e.t * 2.1) * 0.03;
        }
        if (ud.torso) {
          ud.torso.rotation.y = swing * 0.12;
          ud.torso.rotation.x = -0.04 - sp * 0.08 + Math.sin(e.t * 3.4) * 0.012;
        }
        if (ud.head) {
          ud.head.rotation.x = sp * 0.12;
          ud.head.rotation.z = Math.sin(e.t * 1.7) * 0.06;
        }
      }
      e.px = e.pos.x;
      e.pz = e.pos.z;
      if (ud.aura) ud.aura.rotation.z += dt * 1.6;
      if (ud.leaderRing) ud.leaderRing.rotation.z += dt * 2.2;

      /* health bar */
      if (ud.bar) {
        var ratio = clamp(e.hp / e.maxHp, 0, 1);
        ud.bar.visible = ratio < 0.999;
        ud.barFill.scale.x = Math.max(0.001, ratio);
        ud.bar.lookAt(camera.position);
      }
    }
  }

  function fireEnemyBolt(e, nx, nz, dmg, speed, lead, foe) {
    var mesh = new T.Mesh(eboltGeo, eboltMat);
    var y = e.pos.y + e.def.h * 0.62;
    mesh.position.set(e.pos.x, y, e.pos.z);
    scene.add(mesh);
    /* a bolt flies at whoever the shooter is fighting: the player or another
       bot. Leading the target only applies to the player, who is the only one
       whose velocity the island bothers to read. */
    var tier = e.zone ? e.zone.tier : 1;
    var px = foe ? foe.pos.x : P.pos.x;
    var pz = foe ? foe.pos.z : P.pos.z;
    var py = foe ? foe.pos.y + foe.def.h * 0.6 : P.pos.y + 1.1;
    var tFly = Math.hypot(px - e.pos.x, pz - e.pos.z) / Math.max(1, speed);
    var k = foe ? 0 : (lead || 0) * (0.45 + tier * 0.12);
    var tx = px + (foe ? 0 : P.vel.x * tFly * k);
    var tz = pz + (foe ? 0 : P.vel.z * tFly * k);
    var err = Math.max(0.35, 1.9 - tier * 0.28) + (e.elite ? 0 : 0.4);
    tx += rand(-err, err);
    tz += rand(-err, err);
    var target = new T.Vector3(tx, py, tz);
    var dir = target.sub(new T.Vector3(e.pos.x, y, e.pos.z)).normalize();
    G.ebolts.push({
      mesh: mesh, pos: new T.Vector3(e.pos.x, y, e.pos.z),
      dir: dir, speed: speed, dmg: dmg, life: 4, foe: foe || null, by: e
    });
    SFX3D.play('eShot', e.pos);
  }

  function explodeEnemy(e) {
    var radius = 4.2;
    emit(e.pos.x, e.pos.y + 0.8, e.pos.z, 30, 0xffb03a, 11, 0.7, 10);
    emit(e.pos.x, e.pos.y + 0.8, e.pos.z, 14, 0xfff0c0, 7, 0.4, 8);
    SFX3D.play('explode', e.pos);
    G.shake = Math.min(1.5, G.shake + 1.1);
    if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < radius) {
      hurtPlayer(e.def.dmg, e.pos, e);
    }
    /* the blast does not care whose side it is on */
    if (e.foe && !e.foe.dead && Math.hypot(e.foe.pos.x - e.pos.x, e.foe.pos.z - e.pos.z) < radius) {
      damageEnemy(e.foe, e.def.dmg, null, false, e);
    }
    e.dead = true;
    e.dying = 0.12;
    G.kills++;
    if (e.group.userData.bar) e.group.userData.bar.visible = false;
    dropLoot(e);
  }

  function updateBolts(dt) {
    var i;
    for (i = G.bolts.length - 1; i >= 0; i--) {
      var b = G.bolts[i];
      b.life -= dt;
      b.pos.addScaledVector(b.dir, 78 * dt);
      b.mesh.position.copy(b.pos);
      if (insideBlocker(b.pos)) {
        emit(b.pos.x, b.pos.y, b.pos.z, 9, 0x9bf6ff, 6, 0.4, 6);
        scene.remove(b.mesh);
        G.bolts.splice(i, 1);
        continue;
      }
      var hitSomething = false;
      for (var k = 0; k < G.enemies.length; k++) {
        var e = G.enemies[k];
        if (e.dead) continue;
        if (b.hit.indexOf(e) >= 0) continue;
        var d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
        if (d < e.def.r + 0.35 && Math.abs(b.pos.y - (e.pos.y + e.def.h * 0.5)) < e.def.h * 0.75) {
          damageEnemy(e, b.dmg, b.pos);
          b.hit.push(e);
          hitSomething = true;
          if (b.hit.length > b.pierce) break;
        }
      }
      if (b.pos.y < heightAt(b.pos.x, b.pos.z) || b.life <= 0 || hitSomething) {
        emit(b.pos.x, b.pos.y, b.pos.z, 9, 0x9bf6ff, 6, 0.4, 6);
        scene.remove(b.mesh);
        G.bolts.splice(i, 1);
      }
    }

    for (i = G.ebolts.length - 1; i >= 0; i--) {
      var eb = G.ebolts[i];
      eb.life -= dt;
      eb.pos.addScaledVector(eb.dir, eb.speed * dt);
      eb.mesh.position.copy(eb.pos);
      if (eb.foe) {
        if (eb.foe.dead || G.enemies.indexOf(eb.foe) < 0) {
          scene.remove(eb.mesh);
          G.ebolts.splice(i, 1);
          continue;
        }
        var fd = Math.hypot(eb.foe.pos.x - eb.pos.x, eb.foe.pos.z - eb.pos.z);
        if (fd < eb.foe.def.r + 0.45 && Math.abs(eb.pos.y - (eb.foe.pos.y + eb.foe.def.h * 0.55)) < eb.foe.def.h * 0.8) {
          damageEnemy(eb.foe, eb.dmg, eb.pos, false, eb.by);
          emit(eb.pos.x, eb.pos.y, eb.pos.z, 8, 0xff5b8a, 5, 0.35, 5);
          scene.remove(eb.mesh);
          G.ebolts.splice(i, 1);
          continue;
        }
      }
      var pd = Math.hypot(P.pos.x - eb.pos.x, P.pos.z - eb.pos.z);
      if (!eb.foe && pd < 0.85 && Math.abs(eb.pos.y - (P.pos.y + 1.0)) < 1.3) {
        hurtPlayer(eb.dmg, eb.pos);
        emit(eb.pos.x, eb.pos.y, eb.pos.z, 8, 0xff5b8a, 5, 0.35, 5);
        scene.remove(eb.mesh);
        G.ebolts.splice(i, 1);
        continue;
      }
      if (insideBlocker(eb.pos)) {
        emit(eb.pos.x, eb.pos.y, eb.pos.z, 6, 0xff5b8a, 4, 0.3, 5);
        scene.remove(eb.mesh);
        G.ebolts.splice(i, 1);
        continue;
      }
      if (eb.pos.y < heightAt(eb.pos.x, eb.pos.z) || eb.life <= 0) {
        emit(eb.pos.x, eb.pos.y, eb.pos.z, 5, 0xff5b8a, 4, 0.3, 5);
        scene.remove(eb.mesh);
        G.ebolts.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------------ player */
  function hurtPlayer(amount, from, by) {
    if (G.over || !G.running || G.down || G.falling || G.invuln > 0) return;
    amount *= (G.dmgTaken || 1);
    if (G.shieldT > 0) amount *= 0.45;   /* a ward eats more than half of it */
    /* remembered so the pawn that finishes the contract is paid for it */
    if (by && !by.dead) { G.lastHitBy = by; G.lastHitByAt = G.t; }
    G.hp -= amount;
    G.lastHurt = G.t;
    G.shake = Math.min(1.6, G.shake + 0.5);
    if (from) G.dmgSrc = { x: from.x, z: from.z, t: 1.8 };
    if (IS_TOUCH && navigator.vibrate) { try { navigator.vibrate(amount > 18 ? 65 : 35); } catch (e) {} }
    $('dmg').classList.add('on');
    setTimeout(function () { $('dmg').classList.remove('on'); }, 280);
    SFX3D.play('hurt');
    if (from) {
      emit(P.pos.x, P.pos.y + 1.2, P.pos.z, 6, 0xff3355, 4, 0.3, 6);
    }
    if (G.hp <= 0) {
      G.hp = 0;
      playerDown();
    }
    updateHUD(true);
  }

  function updatePlayer(dt) {
    var mx = 0, mz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    mx += joyVec.x;
    mz += joyVec.y;

    var mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }

    var joyMag = Math.hypot(joyVec.x, joyVec.y);
    P.sprint = (!!(keys['ShiftLeft'] || keys['ShiftRight']) || joyMag > 0.92) && mz <= 0.1;
    /* a blade has to close the gap: a touch more foot speed than the gun pass */
    var speed = (P.sprint ? 12.0 : 7.2) * (G.aim ? 0.62 : 1);

    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    var rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    var wishX = fx * (-mz) + rx * mx;
    var wishZ = fz * (-mz) + rz * mx;
    var wl = Math.hypot(wishX, wishZ);
    if (wl > 1) { wishX /= wl; wishZ /= wl; }

    var k = Math.min(1, dt * (P.onGround ? 13 : 3.2));
    P.vel.x += (wishX * speed - P.vel.x) * k;
    P.vel.z += (wishZ * speed - P.vel.z) * k;

    P.vel.y -= 17 * dt;

    var nx = P.pos.x + P.vel.x * dt;
    var nz = P.pos.z + P.vel.z * dt;

    /* water line */
    if (heightAt(nx, nz) < -0.55) {
      if (heightAt(nx, P.pos.z) >= -0.55) nz = P.pos.z;
      else if (heightAt(P.pos.x, nz) >= -0.55) nx = P.pos.x;
      else { nx = P.pos.x; nz = P.pos.z; }
    }

    /* props */
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var ddx = nx - c.x, ddz = nz - c.z;
      var d2 = ddx * ddx + ddz * ddz;
      var rr = c.r + P.radius;
      if (d2 < rr * rr && d2 > 0.0001) {
        var d = Math.sqrt(d2);
        nx = c.x + (ddx / d) * rr;
        nz = c.z + (ddz / d) * rr;
      }
    }

    P.pos.x = nx; P.pos.z = nz;
    P.pos.y += P.vel.y * dt;

    var ground = heightAt(P.pos.x, P.pos.z);
    if (P.pos.y <= ground) {
      var impact = -P.vel.y;
      P.pos.y = ground;
      P.vel.y = 0;
      P.onGround = true;
      if (G.falling && impact > 6) {
        /* the sky return lands hard: dust, a crater-ring of light, a shudder */
        G.falling = false;
        G.shake = 1.2;
        emit(P.pos.x, ground + 0.2, P.pos.z, 26, 0xd8e6ff, 8, 0.7, 11);
        emit(P.pos.x, ground + 0.2, P.pos.z, 12, 0xffd166, 5, 0.5, 8);
        SFX3D.play('explode', { x: P.pos.x, y: ground, z: P.pos.z });
        showBanner('فرود از آسمان', 'شمشیر شکسته به دستت است', 1600);
      }
    } else if (P.pos.y > ground + 0.05) {
      P.onGround = false;
    }

    /* head bob + footsteps */
    var hs = Math.hypot(P.vel.x, P.vel.z);
    P.bobT += dt * hs * 1.55;
    if (P.onGround && hs > 0.6) {
      G.stepT -= dt * hs / 5.3;
      if (G.stepT <= 0) { G.stepT = 0.5; SFX3D.play('step'); }
    }

    /* survival: the island only patches you up to a point, and only in peace */
    var safe = true;
    for (var si = 0; si < G.enemies.length; si++) {
      var se = G.enemies[si];
      if (!se.dead && se.aggro && Math.hypot(se.pos.x - P.pos.x, se.pos.z - P.pos.z) < 30) { safe = false; break; }
    }
    if (safe && G.t - G.lastHurt > 12 && G.hp < 45) {
      G.hp = Math.min(45, G.hp + 2.5 * dt);
    }

    var bob = P.onGround ? Math.sin(P.bobT * 2) * 0.035 * Math.min(1, hs / 6) : 0;
    camera.position.set(P.pos.x, P.pos.y + EYE + bob, P.pos.z);
    var sh = G.shake * 0.09;
    camera.position.x += rand(-sh, sh);
    camera.position.y += rand(-sh, sh);
    camera.rotation.y = P.yaw;
    camera.rotation.x = P.pitch;
    camera.rotation.z = Math.sin(P.bobT) * 0.008 * Math.min(1, hs / 6) + G.roll;
    /* punch: the camera takes the hit with you, forward and up a hair */
    if (G.punch > 0) {
      G.punch = Math.max(0, G.punch - dt * 3.2);
      var pf = G.punch * 0.35;
      camera.position.x += -Math.sin(P.yaw) * pf;
      camera.position.z += -Math.cos(P.yaw) * pf;
      camera.position.y += pf * 0.3;
      camera.rotation.x += pf * 0.35;
      camera.rotation.z += rand(-1, 1) * pf * 0.06;
    }

    var targetFov = G.aim ? 48 : 74 - G.punch * 9;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 12));
      camera.updateProjectionMatrix();
    }
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }

  function updateWeapons(dt) {
    var w = WEAPONS[G.widx];
    var gun = guns[G.widx];

    /* breath comes back only between swings: spam is punished, patience pays */
    if (G.swingT < 2) G.swingT += dt;
    if (G.t - G.lastSwing > 0.62 && G.stam < G.stamMax) {
      G.stam = Math.min(G.stamMax, G.stam + dt * 1.6);
    }
    setText($('reloadTxt'), G.stam < 1 ? 'نفس کم است — یک لحظه صبر کن' : (w.tier >= 3 ? 'تیغهٔ ارتقا‌یافته' : ''));

    G.recoil = Math.max(0, G.recoil - dt * 7);
    G.bloom = Math.max(0, G.bloom - dt * 3.6);
    G.roll *= Math.max(0, 1 - dt * 6);
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 26);

    var hs = Math.hypot(P.vel.x, P.vel.z);
    var swayX = Math.sin(P.bobT) * 0.014 * Math.min(1, hs / 6);
    var swayY = Math.abs(Math.cos(P.bobT)) * 0.014 * Math.min(1, hs / 6);
    var sprinting = P.sprint && hs > 3.5;
    var base = G.aim ? SWORD_GUARD : (sprinting ? SWORD_SPRINT : SWORD_HIP);

    /* --- swing keyframes: wind up, cut across, settle back --- */
    var t = G.swingT;
    var baseZ = G.aim ? SWORD_RZ_AIM : SWORD_RZ;
    var baseX = G.aim ? -0.02 : -0.08;
    var z = baseZ, rx = baseX, pxo = 0, pyo = 0;
    if (t < 0.08) {
      var k1 = t / 0.08;
      z = lerp(baseZ, baseZ + 0.62, k1);
      rx = lerp(baseX, baseX - 0.42, k1);
      pxo = -0.06 * k1;
    } else if (t < 0.26) {
      var k2 = (t - 0.08) / 0.18;
      z = lerp(baseZ + 0.62, baseZ - 1.7, k2);
      rx = lerp(baseX - 0.42, baseX + 0.75, k2);
      pxo = lerp(-0.06, 0.2, k2);
      pyo = 0.06 * k2;
    } else {
      var k3 = clamp((t - 0.26) / 0.26, 0, 1);
      var ease = 1 - Math.pow(1 - k3, 3);
      z = lerp(baseZ - 1.7, baseZ, ease);
      rx = lerp(baseX + 0.75, baseX, ease);
      pxo = lerp(0.2, 0, ease);
      pyo = lerp(0.06, 0, ease);
    }

    var side = G.swingSide || 1;
    var kind = G.swingKind || 0;
    var breathe = Math.sin(G.t * 1.55) * 0.004;
    gun.position.x = lerp(gun.position.x, base.x + pxo * side + swayX, Math.min(1, dt * 16));
    gun.position.y = lerp(gun.position.y, base.y - swayY + pyo + breathe, Math.min(1, dt * 16));
    gun.position.z = lerp(gun.position.z, base.z + G.recoil * 0.03, Math.min(1, dt * 18));
    gun.rotation.x = lerp(gun.rotation.x, rx, Math.min(1, dt * 26));
    gun.rotation.y = lerp(gun.rotation.y, G.aim ? (IS_TOUCH ? 0.5 : 0.16) : (IS_TOUCH ? 0.72 : 0.3), Math.min(1, dt * 12));
    gun.rotation.z = lerp(gun.rotation.z, baseZ + (z - baseZ) * side + swayX * 0.5, Math.min(1, dt * 30));
    /* each link of the chain moves differently, and the spin (F) leaves the
       hand entirely: one full turn around the body, like a musou cleave */
    if (kind === 3) {
      var sp = clamp(t / 0.36, 0, 1);
      var ang = sp * Math.PI * 2;
      gun.position.x += Math.cos(ang) * 0.26 * (1 - sp * 0.35);
      gun.position.z += Math.sin(ang) * 0.12;
      gun.rotation.z += Math.sin(ang) * 0.9;
    } else if (kind === 2) {
      gun.position.y -= Math.sin(clamp(t / 0.3, 0, 1) * Math.PI) * 0.08;
    } else if (kind === 1) {
      gun.position.x -= Math.sin(clamp(t / 0.26, 0, 1) * Math.PI) * 0.05;
    }

    /* the cut trail: a bright arc that only exists during the swing */
    var cutK = t > 0.06 && t < 0.42 ? (t - 0.06) / 0.36 : -1;
    if (cutK >= 0) {
      slashMesh.visible = true;
      slashMat.opacity = 0.62 * Math.sin(cutK * Math.PI);
      slashMesh.rotation.z = z * 1.15 - 0.25;
      slashMesh.scale.setScalar(0.82 + (w.tier - 1) * 0.08 + (kind === 3 ? 0.4 : kind === 2 ? 0.24 : 0));
    } else if (slashMesh.visible) {
      slashMesh.visible = false;
    }

    var cross = $('cross');
    var spread = 5 + G.recoil * 5 + (hs > 4 ? 2 : 0);
    cross.style.setProperty('--sp', spread.toFixed(1) + 'px');

    if (G.hitT > 0) {
      G.hitT -= dt;
      if (G.hitT <= 0) $('hitmark').classList.remove('on');
    }
  }

  /* ------------------------------------------------------------------ pickups */
  function updatePickups(dt) {
    for (var i = G.pickups.length - 1; i >= 0; i--) {
      var p = G.pickups[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 1.7;
      p.mesh.position.y = p.y + 0.55 + Math.sin(p.t * 2.2) * 0.09;
      var d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
      if (p.icon) p.icon.visible = d < 34 && !(p.kind === 'med' && G.hp >= G.maxHp - 1);
      if (d < 2.1 && Math.abs(P.pos.y - p.y) < 2.8) {
        if (takePickup(p) === false) continue;
        scene.remove(p.mesh);
        G.pickups.splice(i, 1);
      }
    }
  }

  function takePickup(p) {
    if (p.kind === 'med') {
      /* never waste a kit at full health - leave it on the ground */
      if (G.hp >= G.maxHp - 1) { toast('جان‌ت پُر است — کیت را برای بعد بگذار'); return false; }
      var healed = Math.min(40, Math.round(G.maxHp - G.hp));
      G.hp = Math.min(G.maxHp, G.hp + 40);
      G.looted++;
      SFX3D.play('med');
      showBanner('غارت · کیت درمان', '+' + fa(healed) + ' جان', 1100);
      updateHUD(true);
      return true;
    }
    if (p.kind === 'part') {
      G.parts++;
      G.looted++;
      SFX3D.play('pickup');
      showBanner('غارت · قطعهٔ فنی', 'در میز کار بِیکن خرجش کن · ' + fa(G.parts) + ' قطعه', 1200);
      updateHUD(true);
      saveRun();
      return true;
    }
    if (p.kind === 'stam' || p.kind === 'ammo') {
      /* breath is the blade's ammunition: never waste it at a full tank */
      if (G.stam >= G.stamMax - 0.01) { toast('نفس‌ت پُر است — برای بعد بگذار'); return false; }
      var gain = Math.min(G.stamMax, G.stam + 3);
      var got = Math.round((gain - G.stam) * 10) / 10;
      G.stam = gain;
      G.looted++;
      SFX3D.play('pickup');
      showBanner('غارت · نفس', '+' + fa(Math.round(got)) + ' نفس · ' + fa(Math.round(G.stam * 10) / 10) + '/' + fa(G.stamMax), 1000);
      updateAmmoHUD();
      return true;
    }
    if (p.kind === 'bomb' || p.kind === 'shield' || p.kind === 'rage') {
      var cap = 9;
      if ((G.items[p.kind] || 0) >= cap) { toast(ITEM_NAME[p.kind] + ' پُر است'); return false; }
      G.items[p.kind] = (G.items[p.kind] || 0) + 1;
      G.looted++;
      SFX3D.play('pickup');
      showBanner('شیء برداشته شد', ITEM_NAME[p.kind] + ' · ' + fa(G.items[p.kind]), 1200);
      updateItemsHUD();
      return true;
    }
    var wi = weaponByKey(p.kind);
    if (wi >= 0) {
      var nw = WEAPONS[wi];
      G.looted++;
      if (nw.owned) {
        G.parts++;
        SFX3D.play('pickup');
        showBanner('غارت · تیغهٔ تکراری', 'شمشیر داری — قطعه +۱', 1300);
        return true;
      }
      nw.owned = true;
      G.widx = wi;
      G.wlvl = nw.tier;
      guns.forEach(function (g, k) { g.visible = k === wi; });
      SFX3D.play('pickup');
      updateAmmoHUD();
      showBanner('شمشیر پیدا شد · ' + nw.name, 'با اعداد یا اسلات‌های پایین عوضش کن', 1900);
      saveRun();
      return true;
    }
    /* unknown crate (an old save): it still feeds the blade */
    if (G.stam >= G.stamMax - 0.01) return false;
    G.stam = Math.min(G.stamMax, G.stam + 3);
    G.looted++;
    SFX3D.play('pickup');
    updateAmmoHUD();
    return true;
  }

  /* --------------------------------------------------------------------- HUD */
  function setText(el, v) {
    if (!el) return;
    if (el._v !== v) { el._v = v; el.textContent = v; }
  }

  function updateAmmoHUD() {
    var w = WEAPONS[G.widx];
    var stam = Math.round(G.stam * 10) / 10;
    var stamTxt = Math.abs(stam - Math.round(stam)) < 0.05 ? String(Math.round(stam)) : stam.toFixed(1);
    setText($('ammoTxt'), fa(stamTxt));
    setText($('ammoRes'), fa(G.stamMax));
    setText($('wName'), w.name);
    var box = $('ammoTxt');
    if (G.stam < 1) box.style.color = '#ff5b6e';
    else if (G.stam < 2) box.style.color = '#ffcf6a';
    else box.style.color = '';
    updateSlots();
  }

  function updateSlots() {
    var slots = $('wslots').children;
    for (var i = 0; i < slots.length; i++) {
      if (i === G.widx) slots[i].classList.add('on');
      else slots[i].classList.remove('on');
      if (!WEAPONS[i].owned) slots[i].classList.add('locked');
      else slots[i].classList.remove('locked');
    }
  }

  function updateHUD(force) {
    var hp = Math.max(0, Math.round(G.hp));
    setText($('hpTxt'), fa(hp));
    var fill = $('hpFill');
    fill.style.width = clamp(G.hp / G.maxHp * 100, 0, 100) + '%';
    var bar = fill.parentNode;
    if (G.hp / G.maxHp < 0.3) bar.classList.add('low');
    else bar.classList.remove('low');

    setText($('killNum'), fa(G.kills));
    /* the red edge of the screen while the island wants the player dead */
    document.body.classList.toggle('hunted', !!(G.bounty && G.bounty.you) && !G.over && !G.down);

    /* closest living pawn: the only distance readout the HUD still needs */
    var near = 1e9, nearName = '';
    for (var i = 0; i < G.enemies.length; i++) {
      var be = G.enemies[i];
      if (be.dead) continue;
      var bd = Math.hypot(be.pos.x - P.pos.x, be.pos.z - P.pos.z);
      if (bd < near) { near = bd; nearName = be.name || be.def.name; }
    }
    G.nearest = near;
    G.nearestName = nearName;
    setText($('threatTxt'), nearName ? ('نزدیک‌ترین: ' + fa(Math.round(near)) + ' م') : 'جزیره آرام');
    setText($('wLvlTxt'), fa(G.wlvl || 1));

    var combo = $('combo');
    if (combo) {
      if (G.combo > 1) { combo.classList.add('on'); setText($('comboNum'), '×' + fa(G.combo)); }
      else combo.classList.remove('on');
    }
    /* contract tracker: who the island wants dead, how far, how hurt */
    var bc = $('bountyCard');
    if (bc) {
      if (bountyAlive() && !G.over) {
        var cb = G.bounty;
        bc.classList.remove('hidden');
        bc.classList.toggle('mine', !!cb.you);
        var ct = cb.you ? { hp: G.hp, maxHp: G.maxHp } : cb.e;
        setText($('bountyNo'), '№ ' + fa(cb.no));
        setText($('bountyName'), cb.you ? 'تو — هدف قرارداد' : cb.name);
        setText($('bountyDist'), cb.you ? 'همه دنبال تو' : fa(Math.round(cb.dist || 0)) + ' متر');
        setText($('bountyHp'), fa(Math.max(0, Math.round(ct.hp))));
        $('bountyFill').style.width = clamp((ct.hp / ct.maxHp) * 100, 0, 100) + '%';
        setText($('lootNum'), fa(G.looted));
      } else bc.classList.add('hidden');
    }

    setText($('phaseTxt'), G.phase);

    /* compass strip: nearest camp + the beacon, with distance in metres */
    if (!G.cmpT || G.t - G.cmpT > 0.22) {
      G.cmpT = G.t;
      var row = $('compassRow');
      if (row) {
        var html = '';
        if (G.bounty && G.bounty.e && !G.bounty.e.dead) {
          var qx = G.bounty.e.pos.x - P.pos.x, qz = G.bounty.e.pos.z - P.pos.z;
          var rq = (Math.atan2(qx, qz) - (P.yaw + Math.PI)) * 180 / Math.PI;
          html += '<span class="bty"><i style="transform:rotate(' + rq.toFixed(0) + 'deg)">◆</i><em>شکار ' + fa(Math.round(Math.hypot(qx, qz))) + ' م</em></span>';
        }
        var bdx = BEACON.x - P.pos.x, bdz = BEACON.z - P.pos.z;
        var bdist = Math.hypot(bdx, bdz);
        var r2 = (Math.atan2(bdx, bdz) - (P.yaw + Math.PI)) * 180 / Math.PI;
        html += '<span class="bcn"><i style="transform:rotate(' + r2.toFixed(0) + 'deg)">◆</i><em>بِیکن ' + fa(Math.round(bdist)) + ' م</em></span>';
        row.innerHTML = html;
      }
    }

    /* direction of the last hit */
    var dd = $('dmgDir');
    if (dd) {
      if (G.dmgSrc && G.running && !G.over) {
        dd.classList.remove('hidden');
        var da = Math.atan2(G.dmgSrc.x - P.pos.x, G.dmgSrc.z - P.pos.z) - (P.yaw + Math.PI);
        dd.querySelector('i').style.transform = 'rotate(' + (da * 180 / Math.PI).toFixed(0) + 'deg)';
      } else dd.classList.add('hidden');
    }

    updateItemsHUD();

    var bh = $('benchHint');
    if (bh) {
      var nearB = G.running && !G.over && Math.hypot(P.pos.x - BEACON.x, P.pos.z - BEACON.z) < 8;
      bh.classList.toggle('hidden', !nearB);
    }
  }

  function showBanner(title, sub, ms) {
    setText($('bannerTitle'), title);
    setText($('bannerSub'), sub || '');
    $('banner').classList.add('show');
    G.bannerT = (ms || 2400) / 1000;
  }

  /* ------------------------------------------------------------------ waves UI */
  function gameOver(won) {
    if (G.over) return;
    G.over = true;
    G.running = false;
    G.won = won;
    try { SAVE.set('run', null); } catch (e) {}
    G.firing = false;
    G.aim = false;
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
    SFX3D.play(won ? 'victory' : 'death');
    var contracts = G.bountyKills;
    var best = null;
    try { best = SAVE.recordRun(contracts, G.kills); } catch (e) {}

    $('modalTitle').textContent = won ? 'قراردادها بسته شد' : 'در جزیره جا ماندی';
    $('modalTxt').textContent = won
      ? 'قرارداد آخر هم بسته شد و توانستی زنده بیرون بیایی.'
      : 'با ' + fa(G.kills) + ' کشته و ' + fa(contracts) + ' قرارداد از پا افتادی.';
    $('modalStats').innerHTML =
      '<span>کشته <b>' + fa(G.kills) + '</b></span>' +
      '<span>قرارداد <b>' + fa(contracts) + '</b></span>' +
      '<span>زمان <b>' + fa(Math.floor(G.t)) + ' ثانیه</b></span>' +
      (best ? '<span>بهترین رکورد <b>' + fa(best.wave) + ' قرارداد</b></span>' : '');
    $('modal').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
  }

  /* ------------------------------------------------------------------ pause */
  function pauseGame() {
    if (!G.running || G.over || G.paused) return;
    saveRun();
    G.paused = true;
    G.firing = false;
    G.aim = false;
    $('pause').classList.remove('hidden');
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
  }
  function resumeGame() {
    if (!G.running || G.over) return;
    if (G.benchOpen) { G.benchOpen = false; $('bench').classList.add('hidden'); }
    G.paused = false;
    $('pause').classList.add('hidden');
    G.last = performance.now();
    lockPointer();
  }

  /* ------------------------------------------------------------------- start */
  /* Three honest difficulty profiles instead of one universal wall: the
     explorer can finish the story, hell makes every magazine count. */
  var DIFF = {
    explorer: { hp: 0.8, dmg: 0.68, extra: -1, res: 1.5 },
    soldier: { hp: 1, dmg: 1, extra: 0, res: 1 },
    hell: { hp: 1.3, dmg: 1.35, extra: 1, res: 0.6 }
  };
  function setDifficulty(k) {
    var d = DIFF[k] || DIFF.soldier;
    G.diff = DIFF[k] ? k : 'soldier';
    G.hpScale = d.hp;
    G.dmgTaken = d.dmg;
    G.diffExtra = d.extra;
    WEAPONS[0].owned = true;
    G.stamMax = Math.max(4, Math.round(5 * d.res));
    G.stam = G.stamMax;
    try { SAVE.set('diff', G.diff); } catch (e) {}
    var btns = document.querySelectorAll('#diffRow button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-d') === G.diff);
    }
  }

  /* ----------------------------------------------------- run checkpoint save
     Closing the phone should not erase twenty minutes of island. The run is
     saved when a zone falls, on pickups, on pause and every 20 seconds; death
     still clears it, so the rogue-like stake is intact. */
  function readRun() {
    try {
      var o = SAVE.get('run', null);
      return (o && o.v === 1) ? o : null;
    } catch (e) { return null; }
  }

  function saveRun() {
    if (!G.running || G.over || G.started === false) return;
    var o = {
      v: 1, t: G.t, hp: G.hp, kills: G.kills, parts: G.parts,
      widx: G.widx, diff: G.diff, upg: G.upg, cycle: G.cycle,
      stam: G.stam, stamMax: G.stamMax, dth: G.deaths, ct: G.bountyNo, lk: G.looted,
      px: P.pos.x, pz: P.pos.z, yaw: P.yaw,
      /* crates still on the ground survive a resume; without this, closing
         the tab before picking up a zone's rifle lost it for good */
      picks: G.pickups.map(function (p) { return { k: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; }),
      wp: WEAPONS.map(function (w) {
        return { k: w.key, owned: w.owned };
      })
    };
    try { SAVE.set('run', o); } catch (e) {}
  }

  function restoreWeapons(o) {
    if (!o.wp) return;
    for (var i = 0; i < o.wp.length; i++) {
      var s = o.wp[i];
      var wi = weaponByKey(s.k);
      if (wi < 0) continue;
      var w = WEAPONS[wi];
      w.owned = !!s.owned;
    }
    WEAPONS[0].owned = true;
    G.widx = o.widx || 0;
    if (!WEAPONS[G.widx] || !WEAPONS[G.widx].owned) G.widx = 0;
    G.wlvl = WEAPONS[G.widx].tier;
    guns.forEach(function (g, k) { g.visible = k === G.widx; });
  }

  function applyRunState(o) {
    G.maxHp = 100;
    G.hp = clamp(o.hp || 100, 1, G.maxHp);
    G.kills = o.kills || 0;
    G.parts = o.parts || 0;
    G.upg = o.upg || { dmg: 0, mag: 0, reload: 0 };
    G.cycle = o.cycle || 0.12;
    G.stamMax = o.stamMax || G.stamMax;
    G.stam = o.stam == null ? G.stamMax : clamp(o.stam, 0, G.stamMax);
    G.deaths = o.dth || 0;
    G.bountyNo = o.ct || 0;
    G.looted = o.lk || 0;
    G.bountyDelay = 1.5;
    if (o.px && heightAt(o.px, o.pz) > 0.5 && Math.hypot(o.px, o.pz) < ISLE_R * 0.94) {
      var px = o.px, pz = o.pz;
      /* never resume inside the relay's collision cylinder */
      var bd = Math.hypot(px - BEACON.x, pz - BEACON.z);
      if (bd < 5.6) {
        var ba = Math.atan2(pz - BEACON.z, px - BEACON.x) || 0.7;
        px = BEACON.x + Math.cos(ba) * 5.6;
        pz = BEACON.z + Math.sin(ba) * 5.6;
      }
      P.pos.set(px, heightAt(px, pz), pz);
      P.vel.set(0, 0, 0);
    }
    if (typeof o.yaw === 'number') P.yaw = o.yaw;
    /* restore the exact ground loot instead of a fresh scatter of stashes */
    if (o.picks) {
      for (var pd = G.pickups.length - 1; pd >= 0; pd--) scene.remove(G.pickups[pd].mesh);
      G.pickups.length = 0;
      for (var pr = 0; pr < o.picks.length; pr++) {
        var pk = o.picks[pr];
        if (pk && pk.k) spawnPickup(pk.k, pk.x, pk.z);
      }
    }
    camera.position.set(P.pos.x, P.pos.y + EYE, P.pos.z);
    camera.rotation.y = P.yaw;
    showBanner('ادامهٔ مأموریت', fa(G.parts) + ' قطعه · ' + fa(G.kills) + ' کشته', 3000);
  }

  function startGame(resume) {
    if (G.started) return;
    G.started = true;
    var run = resume ? readRun() : null;
    try { SFX3D.unlock(); SFX3D.ambient(); } catch (e) {}
    $('start').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (IS_TOUCH) $('touch').classList.remove('hidden');
    G.running = true;
    G.paused = false;
    G.last = performance.now();
    G.t = 0;
    G.hp = G.maxHp;
    G.kills = 0;
    G.parts = 0;
    G.items = { bomb: 0, shield: 0, rage: 0 };
    G.shieldT = 0;
    G.rageT = 0;
    G.upg = { dmg: 0, reach: 0, speed: 0 };
    G.down = false;
    G.falling = false;
    G.deaths = 0;
    G.bounty = null;
    G.bountyNo = 0;
    G.bountyKills = 0;
    G.hunterKills = 0;
    G.looted = 0;
    G.bountyDelay = 0;
    G.swingT = 9;
    G.lastSwing = -9;
    G.widx = 0;
    G.wlvl = 1;
    document.body.classList.remove('down');
    if ($('downBox')) $('downBox').classList.add('hidden');
    setDifficulty(run ? run.diff : G.diff);
    if (run) restoreWeapons(run);
    seedZones();
    seedHunters();
    seedStashes();
    if (run) applyRunState(run);
    else {
      showBanner('قرارداد اول باز شد', 'شمشیر شکسته در دستت است — هدف را شکار کن', 3200);
      G.bountyDelay = 2.5;
    }
    updateAmmoHUD();
    updateHUD(true);
    lockPointer();
    setTimeout(function () { $('tip').classList.add('off'); }, 11000);
  }

  /* ------------------------------------------------------------- bench (shop) */
  var UPGRADES = [
    { id: 'dmg', name: 'تیزی همهٔ شمشیرها +۱۴٪', cost: 3, max: 5 },
    { id: 'reach', name: 'برد ضربه +۱۲ سانتی‌متر', cost: 3, max: 4 },
    { id: 'speed', name: 'ضربه‌های سریع‌تر', cost: 2, max: 4 },
    { id: 'heal', name: 'درمان کامل', cost: 2, max: 99 }
  ];
  function benchNear() {
    return Math.hypot(P.pos.x - BEACON.x, P.pos.z - BEACON.z) < 8;
  }
  function openBench() {
    if (!G.running || G.over) return;
    if (!benchNear()) { toast('میز کار کنار بِیکن است — به ستون بنفش برگرد'); return; }
    G.benchOpen = true;
    G.paused = true;
    G.firing = false;
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }
    updateBenchUI();
    $('bench').classList.remove('hidden');
  }
  function closeBench() {
    if (!G.benchOpen) return;
    G.benchOpen = false;
    $('bench').classList.add('hidden');
    if (G.running && !G.over) resumeGame();
  }
  function updateBenchUI() {
    setText($('partNum'), fa(G.parts));
    setText($('benchHp'), fa(Math.max(0, Math.round(G.hp))) + ' / ' + fa(G.maxHp));
    var rows = document.querySelectorAll('#bench [data-buy]');
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute('data-buy');
      if (id === 'close') continue;
      if (id === 'kit') { rows[i].classList.toggle('off', G.parts < 3); continue; }
      var u = null;
      for (var k = 0; k < UPGRADES.length; k++) if (UPGRADES[k].id === id) u = UPGRADES[k];
      if (!u) continue;
      var lvlEl = rows[i].querySelector('em');
      if (lvlEl) lvlEl.textContent = id === 'heal' ? '۲ قطعه' : fa(G.upg[id] || 0) + '/' + fa(u.max) + ' · ' + fa(u.cost) + ' قطعه';
      var maxed = id !== 'heal' && (G.upg[id] || 0) >= u.max;
      rows[i].classList.toggle('off', maxed || G.parts < u.cost);
    }
  }
  function benchBuy(id) {
    if (!G.benchOpen) return;
    if (id === 'kit') {
      if (G.parts < 3) { toast('قطعه کافی نیست · ' + fa(G.parts) + '/۳'); return; }
      G.parts -= 3;
      var kk = pick(['bomb', 'shield', 'rage']);
      G.items[kk] = Math.min(9, (G.items[kk] || 0) + 1);
      showBanner('بستهٔ تجهیزات', ITEM_NAME[kk] + ' · ' + fa(G.items[kk]), 1500);
      SFX3D.play('equip');
      updateItemsHUD();
      updateBenchUI();
      updateHUD(true);
      saveRun();
      return;
    }
    if (id === 'heal') {
      if (G.hp >= G.maxHp) { toast('جان‌ت پُر است'); return; }
      if (G.parts < 2) { toast('قطعه کافی نیست · ' + fa(G.parts) + '/۲'); return; }
      G.parts -= 2;
      G.hp = G.maxHp;
      showBanner('ترمیم در بِیکن', 'جان کامل شد', 1200);
      SFX3D.play('med');
    } else {
      var u = null;
      for (var k = 0; k < UPGRADES.length; k++) if (UPGRADES[k].id === id) u = UPGRADES[k];
      if (!u) return;
      if ((G.upg[id] || 0) >= u.max) { toast('این ارتقا به سقف رسیده'); return; }
      if (G.parts < u.cost) { toast('قطعه کافی نیست · ' + fa(G.parts) + '/' + fa(u.cost)); return; }
      G.parts -= u.cost;
      G.upg[id] = (G.upg[id] || 0) + 1;
      showBanner('ارتقا نصب شد', u.name, 1500);
      SFX3D.play('equip');
    }
    updateAmmoHUD();
    updateBenchUI();
    updateHUD(true);
    saveRun();
  }

  /* ------------------------------------------------------------------ wiring */
  function wireUI() {
    /* arsenal list on the start screen */
    var arse = $('arse');
    WEAPONS.forEach(function (w, i) {
      var d = document.createElement('div');
      d.innerHTML = '<b>' + w.name + '</b><small>' + (w.owned ? 'همراه · تیغهٔ ' + fa(w.tier) : 'پاداش قرارداد شکار') + '</small><i>' + fa(i + 1) + '</i>';
      arse.appendChild(d);
    });
    /* the twenty named hunters, so the island has faces before the first cut */
    var roster = $('roster');
    if (roster) {
      HUNTER_DEFS.forEach(function (d) {
        var s = document.createElement('span');
        var hex = ('000000' + d.accent.toString(16)).slice(-6);
        s.innerHTML = '<i style="background:#' + hex + '"></i>' + d.name;
        roster.appendChild(s);
      });
    }
    /* weapon slots */
    var slots = $('wslots');
    WEAPONS.forEach(function (w, i) {
      var s = document.createElement('div');
      s.className = 'wslot' + (i === 0 ? ' on' : '');
      s.innerHTML = '<b>' + fa(i + 1) + '</b><span>' + w.short + '</span>';
      s.addEventListener('pointerdown', function (ev) { ev.preventDefault(); ev.stopPropagation(); switchWeapon(i); });
      slots.appendChild(s);
    });

    $('btnStart').addEventListener('click', function () { startGame(false); });

    /* difficulty picker */
    setDifficulty(G.diff);
    var diffRow = $('diffRow');
    if (diffRow) {
      var dbtns = diffRow.querySelectorAll('button');
      for (var di = 0; di < dbtns.length; di++) {
        dbtns[di].addEventListener('click', function (ev) {
          ev.preventDefault();
          setDifficulty(this.getAttribute('data-d'));
          SFX3D.play('click');
        });
      }
    }

    /* resume a saved checkpoint, if one exists */
    var rb = $('btnResume');
    if (rb) {
      var rr = readRun();
      if (rr) {
        rb.classList.remove('hidden');
        rb.textContent = 'ادامهٔ مأموریت · ' + fa(rr.parts || 0) + ' قطعه · ' + fa(rr.kills || 0) + ' کشته';
        rb.addEventListener('click', function () { startGame(true); });
      }
    }

    /* bench shop buttons */
    var benchBox = $('bench');
    if (benchBox) {
      var bbtns = benchBox.querySelectorAll('[data-buy]');
      for (var bi = 0; bi < bbtns.length; bi++) {
        bbtns[bi].addEventListener('click', function (ev) {
          ev.preventDefault();
          var id = this.getAttribute('data-buy');
          if (id === 'close') closeBench();
          else benchBuy(id);
        });
      }
    }

    $('btnPause').addEventListener('click', pauseGame);
    $('pResume').addEventListener('click', resumeGame);
    $('pRestart').addEventListener('click', function () { location.reload(); });
    $('modalMain').addEventListener('click', function () { location.reload(); });

    $('pQuality').addEventListener('click', function () {
      applyQuality(!QUAL.low);
    });

    function soundLabel() {
      var m = SFX3D.isMuted();
      $('pSound').textContent = 'صدا: ' + (m ? 'خاموش' : 'روشن');
      $('btnMute').textContent = m ? '×' : '♪';
      $('btnMute').style.color = m ? '#7c9dae' : '';
    }
    $('pSound').addEventListener('click', function () { SFX3D.toggle(); soundLabel(); });
    $('btnMute').addEventListener('click', function (e) { e.stopPropagation(); SFX3D.toggle(); soundLabel(); });
    soundLabel();

    var best = null;
    try { best = SAVE.best(); } catch (e) {}
    $('bestline').textContent = best
      ? 'بهترین رکورد تو: موج ' + fa(best.wave) + ' · ' + fa(best.kills) + ' کشته'
      : 'اولین عملیات تو در جزیره — موفق باشی.';

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      post.setSize();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.running && !G.over) pauseGame();
    });
  }

  /* -------------------------------------------------------------------- loop */
  function animateWorld(dt) {
    G.frame++;
    if (G.beaconRing) G.beaconRing.rotation.z += dt * 0.6;
    if (G.beaconRing2) {
      G.beaconRing2.rotation.z -= dt * 0.9;
      G.beaconRing2.position.y = 5.6 + Math.sin(G.t * 1.1) * 0.12;
    }
    if (G.beaconCore) {
      var pulse = 1 + Math.sin(G.t * 2.4) * 0.09;
      G.beaconCore.scale.setScalar(pulse);
    }
    if (G.beaconLight) G.beaconLight.intensity = 3.0 + Math.sin(G.t * 2.4) * 0.7;

    /* tracers fade */
    for (var i = G.tracers.length - 1; i >= 0; i--) {
      var tr = G.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.85;
      if (tr.life <= 0) {
        scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        G.tracers.splice(i, 1);
      }
    }
  }

  /* Sky cycle and weather: 165 s day -> dusk -> night -> dawn, with violet
     storms that cut visibility for both sides. Night raises alien senses. */
  function atmosphere(dt) {
    G.cycle = (G.cycle + dt / 165) % 1;
    var c = G.cycle, k;
    if (c < 0.42) k = 0;
    else if (c < 0.54) k = smoothstep(0.42, 0.54, c);
    else if (c < 0.86) k = 1;
    else k = 1 - smoothstep(0.86, 1, c);
    G.nightK = k;
    G.stormT -= dt;
    if (G.stormT <= 0) {
      G.storm = 18;
      G.stormT = rand(70, 115);
      showBanner('طوفان بنفش', 'دید کم شد — هر دو طرف کورتر می‌بینند', 1800);
    }
    var stormK = 0;
    if (G.storm > 0) {
      G.storm -= dt;
      stormK = clamp(Math.min(G.storm, 18 - G.storm) / 2.2, 0, 1);
    }
    hemi.intensity = 0.92 - k * 0.56 - stormK * 0.08;
    moon.intensity = 2.0 - k * 1.1;
    rim.intensity = 0.95 + stormK * 0.4;
    renderer.toneMappingExposure = 1.06 - k * 0.2;
    /* the island used to sit under a night sky at high noon: the dome, the
       stars and the sun now actually follow the cycle */
    var day = 1 - k * 0.94;
    if (skyMat) {
      skyMat.uniforms.cTop.value.setRGB(0.05 + day * 0.12, 0.03 + day * 0.34, 0.09 + day * 0.52);
      skyMat.uniforms.cMid.value.setRGB(0.09 + day * 0.42, 0.06 + day * 0.58, 0.20 + day * 0.55);
      skyMat.uniforms.cBot.value.setRGB(0.19 + day * 0.62, 0.10 + day * 0.58, 0.33 + day * 0.32);
    }
    if (starField) starField.material.opacity = clamp(k * 0.95, 0, 0.9);
    if (moonSprite) moonSprite.material.opacity = clamp(0.35 + k * 0.65, 0, 1);
    moon.color.setRGB(0.9 + day * 0.1, 0.86 + day * 0.12, 0.99 - day * 0.13);
    hemi.color.setRGB(0.66 + day * 0.14, 0.71 + day * 0.1, 0.99 - day * 0.16);
    /* purple ground bounce used to dye every trunk and rock magenta at noon */
    hemi.groundColor.setRGB(0.2 + day * 0.16, 0.11 + day * 0.19, 0.3 - day * 0.12);
    scene.fog.color.setRGB(0.10 + day * 0.52 + stormK * 0.05, 0.07 + day * 0.58, 0.18 + day * 0.52);
    scene.fog.near = 78 - stormK * 30;
    scene.fog.far = Math.max(80, 620 - k * 280 - stormK * 340);
    torch.intensity = k * 2.4 + stormK * 0.5;
    var ph = 'روز';
    if (k > 0.7) ph = 'شب';
    else if (k > 0.22) ph = c < 0.55 ? 'غروب' : 'سپیده';
    else if (stormK > 0.4) ph = 'طوفان';
    G.phase = ph;
  }

  function update(dt) {
    /* hit-stop: for a few hundredths of a second the whole island slows down
       around the impact. This is most of what makes a cut feel heavy. */
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.14; }
    G.t += dt;
    if (G.down) updateDown(dt);
    else updatePlayer(dt);
    if (!G.down) updateWeapons(dt);
    updateBounty(dt);
    updateEnemies(dt);
    updateBolts(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateWaves(dt);
    updateFeuds(dt);
    updateHunters(dt);
    updateHazards(dt);
    atmosphere(dt);
    if (G.meleeT > 0) G.meleeT -= dt;
    if (G.dmgSrc) { G.dmgSrc.t -= dt; if (G.dmgSrc.t <= 0) G.dmgSrc = null; }
    G.threatT -= dt;
    if (G.threatT <= 0) {
      G.threatT = 0.45;
      var agg = 0;
      for (var ai = 0; ai < G.enemies.length; ai++) {
        var ae = G.enemies[ai];
        if (ae.dead || !ae.aggro) continue;
        if (Math.hypot(ae.pos.x - P.pos.x, ae.pos.z - P.pos.z) < 46) agg++;
      }
      G.threat = clamp(agg / 4, 0, 1);
      try { SFX3D.threat(G.threat); } catch (e) {}
    }
    if (G.comboT > 0) {
      G.comboT -= dt;
      if (G.comboT <= 0) { G.combo = 0; G.dmgMul = 1; }
    }
    if (G.bannerT > 0) {
      G.bannerT -= dt;
      if (G.bannerT <= 0) $('banner').classList.remove('show');
    }
    if (G.invuln > 0) G.invuln -= dt;
    if (G.shieldT > 0) G.shieldT -= dt;
    if (G.rageT > 0) G.rageT -= dt;
    updateHUD();
    SFX3D.listener(camera);
    moon.position.set(P.pos.x - 70, P.pos.y + 95, P.pos.z + 55);
    moon.target.position.set(P.pos.x, P.pos.y, P.pos.z);
  }

  var acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = (now - (G.last || now)) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    G.last = now;
    if (G.running && !G.paused && !G.over) {
      update(dt);
    } else {
      G.t += dt;
    }
    animateWorld(dt);
    post.render();
    monitorPerf(dt);
  }

  /* if the device cannot hold the target frame rate, drop a tier on its own */
  var perfAcc = 0, perfFrames = 0, perfDrops = 0;
  function monitorPerf(dt) {
    if (!G.running || G.paused) return;
    perfAcc += dt; perfFrames++;
    if (perfAcc < 2.5) return;
    var fps = perfFrames / perfAcc;
    perfAcc = 0; perfFrames = 0;
    if (fps < 44 && !QUAL.low) { applyQuality(true); perfDrops++; }
    else if (fps < 30 && QUAL.low && perfDrops < 3) {
      perfDrops++;
      renderer.setPixelRatio(Math.max(0.72, (window.devicePixelRatio || 1) * 0.7));
      G.maxAlive = 5;
    }
  }

  /* -------------------------------------------------------------------- boot */
  function boot() {
    try {
      var sd = SAVE.get('diff', 'soldier');
      if (DIFF[sd]) G.diff = sd;
    } catch (e) {}
    wireUI();
    loadPropManifest();
    applyQuality(QUAL.low);
    /* a phone can be closed at any moment: keep a rolling checkpoint */
    setInterval(function () {
      if (G.running && !G.paused && !G.over) saveRun();
    }, 20000);
    camera.position.set(P.pos.x, P.pos.y + EYE, P.pos.z);
    camera.rotation.y = P.yaw;
    updateAmmoHUD();
    updateItemsHUD();
    updateHUD(true);
    G.last = performance.now();
    requestAnimationFrame(loop);

    /* real rigged models stream in before the island opens for business */
    var startBtn = $('btnStart');
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'در حال بارگذاری مدل‌ها…'; }
    var opened = false;
    function openIsland() {
      if (opened) return;
      opened = true;
      if ($('loading')) $('loading').classList.add('done');
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'شروع عملیات'; }
    }
    var poll = setInterval(function () {
      var p = window.MODELS3D ? MODELS3D.progress() : 1;
      if ($('loadTxt')) $('loadTxt').textContent = 'بارگذاری مدل‌های سه‌بعدی… ' + fa(Math.round(p * 100)) + '٪';
      if (p >= 1) { clearInterval(poll); openIsland(); }
    }, 120);
    if (window.MODELS3D) {
      MODELS3D.start(function (ok, bad) {
        clearInterval(poll);
        openIsland();
        if (bad) toast('برخی مدل‌های سه‌بعدی بارگذاری نشد — مدل‌های جایگزین استفاده می‌شوند');
      });
    }
    setTimeout(openIsland, 6000);
  }

  window.SIEGE = {
    state: G, player: P, weapons: WEAPONS, enemies: ENEMY,
    start: startGame, pause: pauseGame, resume: resumeGame,
    heightAt: heightAt, spawn: spawnEnemy, fire: tryFire,
    traceT: traceT, blockers: blockers, zones: ZONES,
    melee: tryMelee, bench: openBench, closeBench: closeBench, buy: benchBuy,
    difficulty: setDifficulty, saveRun: saveRun, readRun: readRun,
    explode: explodeBarrel, hazards: { barrels: G.barrels, traps: G.traps },
    hurt: hurtPlayer, damage: damageEnemy, kill: killEnemy, step: update, hud: updateHUD, props: G.props,
    camera: camera, scene: scene, renderer: renderer
  };

  requestAnimationFrame(function () { setTimeout(boot, 40); });
})();
