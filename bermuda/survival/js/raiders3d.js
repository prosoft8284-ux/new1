/* BERMUDA SIEGE 3D — beach raiders.
   Hand-built low-poly humans instead of tinted stock robots: a waist pivot,
   a chest pivot, a head, two arms and two legs, dressed for the island. Every
   piece of a limb is baked into ONE geometry with per-vertex colours, so a
   whole raider is five draw calls and still reads as a person: cloth, leather,
   iron, skin and a weapon in the right hand.

   Exposes window.RAIDERS3D.build(kind, elite, def) ->
     { group, mat, mats, armL, armR, legL, legR, torso, head }
   which is exactly the procedural contract siege3d.js already animates. */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  /* ---------------------------------------------------------------- cooker */
  /* one part = one buffer geometry, coloured per vertex, flat shaded */
  function Cooker() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }
  var _m = new T.Matrix4();
  var _q = new T.Quaternion();
  var _e = new T.Euler();
  var _s = new T.Vector3();
  var _p = new T.Vector3();
  var _c = new T.Color();

  Cooker.prototype.add = function (geo, opts, hex) {
    opts = opts || {};
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    _p.set(opts.x || 0, opts.y || 0, opts.z || 0);
    _q.setFromEuler(_e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0));
    _s.set(opts.sx === undefined ? 1 : opts.sx, opts.sy === undefined ? 1 : opts.sy, opts.sz === undefined ? 1 : opts.sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    var pa = g.attributes.position, na = g.attributes.normal;
    _c.setHex(hex).convertSRGBToLinear();
    for (var i = 0; i < pa.count; i++) {
      this.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      if (na) this.nor.push(na.getX(i), na.getY(i), na.getZ(i));
      else this.nor.push(0, 1, 0);
      this.col.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
  };

  Cooker.prototype.mesh = function (mat) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    var m = new T.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  };

  /* --------------------------------------------------------------- helpers */
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, seg) { return new T.CylinderGeometry(rt, rb, h, seg || 8); }
  function sph(r, w, h) { return new T.SphereGeometry(r, w || 10, h || 8); }
  function cap(r, len) { return new T.CapsuleGeometry(r, len, 3, 8); }
  function cone(r, h, seg) { return new T.ConeGeometry(r, h, seg || 6); }
  /* a lathe turned around Y; phiStart/phiLength let a piece wrap only the
     chest instead of the whole barrel */
  function lathe(points, seg, phiStart, phiLength) {
    var pts = [];
    for (var i = 0; i < points.length; i++) pts.push(new T.Vector2(points[i][0], points[i][1]));
    return new T.LatheGeometry(pts, seg || 10, phiStart || 0, phiLength || Math.PI * 2);
  }
  function plate(w, h, d, taper) {
    var g = new T.BoxGeometry(w, h, d);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * (taper || 0.7));
        p.setZ(i, p.getZ(i) * (taper || 0.7));
      }
    }
    g.computeVertexNormals();
    return g;
  }

  /* a forged blade: a diamond cross-section lofted along +Y with a real point */
  function bladeGeo(len, wide, thick, tip) {
    tip = tip || len * 0.16;
    var half = wide * 0.5, th = thick * 0.5;
    var stations = [
      { y: 0, w: half * 0.82 },
      { y: len * 0.28, w: half },
      { y: len * 0.72, w: half * 0.94 },
      { y: len, w: half * 0.62 }
    ];
    var pos = [];
    function ring(y, w) {
      return [[0, y, th], [w, y, 0], [0, y, -th], [-w, y, 0]];
    }
    for (var s = 0; s < stations.length - 1; s++) {
      var a = ring(stations[s].y, stations[s].w);
      var b = ring(stations[s + 1].y, stations[s + 1].w);
      for (var i = 0; i < 4; i++) {
        var j = (i + 1) % 4;
        pos.push.apply(pos, a[i]); pos.push.apply(pos, b[i]); pos.push.apply(pos, b[j]);
        pos.push.apply(pos, a[i]); pos.push.apply(pos, b[j]); pos.push.apply(pos, a[j]);
      }
    }
    var top = ring(stations[stations.length - 1].y, stations[stations.length - 1].w);
    for (var k = 0; k < 4; k++) {
      pos.push.apply(pos, top[k]); pos.push.apply(pos, top[(k + 1) % 4]); pos.push(0, len + tip, 0);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /* ------------------------------------------------------------- palettes */
  var DRESS = {
    runner: { cloth: 0x8a8f63, cloth2: 0x6d7350, leather: 0x6a4a2e, skin: 0xb0855c, metal: 0x8d949c, trim: 0xb08a4a, w: 0.95, weapon: 'spear' },
    skitter: { cloth: 0x7a5c3e, cloth2: 0x5f452c, leather: 0x4a3524, skin: 0xa07450, metal: 0x8a8f96, trim: 0x8a2a22, w: 0.86, weapon: 'dagger' },
    warrior: { cloth: 0x9a3a2c, cloth2: 0x6f2a20, leather: 0x4a3624, skin: 0xb0855c, metal: 0xa8b2bc, trim: 0xc09a52, w: 1.0, weapon: 'cutlass' },
    neural: { cloth: 0xd6c8a8, cloth2: 0xb8a887, leather: 0x6a5334, skin: 0xa8825e, metal: 0x9a8a62, trim: 0x6a8a76, w: 0.93, weapon: 'staff' },
    bomber: { cloth: 0x8a7434, cloth2: 0x6a5826, leather: 0x4a3a22, skin: 0xb0855c, metal: 0x8a8f96, trim: 0xb0562a, w: 0.99, weapon: 'bomb' },
    brute: { cloth: 0x6a2620, cloth2: 0x4a1a16, leather: 0x3a2618, skin: 0xa87850, metal: 0x8d97a2, trim: 0x9a7a42, w: 1.36, weapon: 'cleaver' },
    stalker: { cloth: 0x3b424c, cloth2: 0x2a3038, leather: 0x262a30, skin: 0x96755a, metal: 0x8a929a, trim: 0x7a2a2a, w: 0.9, weapon: 'dagger' }
  };

  function newMat() {
    return new T.MeshStandardMaterial({
      vertexColors: true, flatShading: true,
      metalness: 0.16, roughness: 0.84,
      emissive: new T.Color(0x1a0d06), emissiveIntensity: 0.55
    });
  }

  /* --------------------------------------------------------------- weapons */
  function weapon(cook, kind, H, metal, trim, leather) {
    if (kind === 'cutlass') {
      for (var i = 0; i < 3; i++) {
        cook.add(bladeGeo(0.075 * H, 0.028 * H, 0.008 * H, 0.018 * H), { x: 0.004 * H, y: 0.02 * H + i * 0.072 * H, rz: 0.06 * i }, 0xc3ccd6);
      }
      cook.add(box(0.075 * H, 0.012 * H, 0.02 * H), { y: 0.014 * H }, trim);
      cook.add(cyl(0.009 * H, 0.010 * H, 0.06 * H, 8), { y: -0.02 * H }, leather);
      cook.add(sph(0.012 * H, 8, 6), { y: -0.055 * H }, trim);
    } else if (kind === 'cleaver') {
      cook.add(cyl(0.012 * H, 0.014 * H, 0.34 * H, 8), { y: 0.12 * H }, leather);
      cook.add(box(0.075 * H, 0.16 * H, 0.016 * H), { x: 0.03 * H, y: 0.29 * H }, metal);
      cook.add(box(0.08 * H, 0.02 * H, 0.02 * H), { x: 0.028 * H, y: 0.2 * H }, trim);
    } else if (kind === 'spear') {
      cook.add(cyl(0.009 * H, 0.011 * H, 0.62 * H, 7), { y: 0.24 * H }, leather);
      cook.add(cone(0.022 * H, 0.09 * H, 5), { y: 0.59 * H }, metal);
      cook.add(cyl(0.013 * H, 0.013 * H, 0.02 * H, 8), { y: 0.54 * H }, trim);
    } else if (kind === 'staff') {
      cook.add(cyl(0.011 * H, 0.013 * H, 0.58 * H, 7), { y: 0.22 * H }, leather);
      cook.add(sph(0.03 * H, 8, 6), { y: 0.52 * H }, trim);
      cook.add(cyl(0.014 * H, 0.014 * H, 0.03 * H, 8), { y: 0.49 * H }, metal);
    } else if (kind === 'dagger') {
      cook.add(bladeGeo(0.11 * H, 0.024 * H, 0.007 * H, 0.02 * H), { y: 0.02 * H }, 0xc3ccd6);
      cook.add(box(0.045 * H, 0.009 * H, 0.016 * H), { y: 0.015 * H }, trim);
      cook.add(cyl(0.008 * H, 0.009 * H, 0.05 * H, 7), { y: -0.012 * H }, leather);
    } else if (kind === 'bomb') {
      cook.add(sph(0.032 * H, 8, 6), { y: -0.01 * H }, 0x2a2622);
      cook.add(cyl(0.006 * H, 0.008 * H, 0.03 * H, 6), { y: 0.03 * H, rz: 0.3 }, 0x6a5a3a);
    }
  }

  /* --------------------------------------------------------------- a raider */
  function build(kind, elite, def) {
    var d = DRESS[kind] || DRESS.runner;
    var H = def.h;
    var WD = d.w * (elite ? 1.05 : (def.boss ? 1.18 : 1));
    var heavy = kind === 'warrior' || kind === 'brute' || kind === 'stalker';
    var mat = newMat();
    var group = new T.Group();

    /* --- torso + head ---------------------------------------------------- */
    var hips = new T.Group();
    hips.position.y = 0.47 * H;
    group.add(hips);

    var torso = new T.Group();
    hips.add(torso);

    var tc = new Cooker();
    /* the body under the armour: shoulders taper, waist pinches, cloth shows
       at the sides and back */
    tc.add(lathe([
      [0.078 * H * WD, -0.03 * H],
      [0.092 * H * WD, 0.03 * H],
      [0.098 * H * WD, 0.13 * H],
      [0.092 * H * WD, 0.22 * H],
      [0.07 * H * WD, 0.285 * H],
      [0.045 * H * WD, 0.31 * H]
    ], 12), {}, d.cloth);
    /* a front-only cuirass so the tunic still reads from the side */
    if (heavy) {
      tc.add(lathe([
        [0.088 * H * WD, 0.045 * H],
        [0.102 * H * WD, 0.13 * H],
        [0.095 * H * WD, 0.215 * H],
        [0.07 * H * WD, 0.27 * H]
      ], 10, Math.PI * 0.5 - 1.35, 2.7), {}, d.metal);
      tc.add(cyl(0.073 * H * WD, 0.073 * H * WD, 0.012 * H, 12, Math.PI * 0.5 - 1.35, 2.7), { y: 0.235 * H }, d.trim);
      tc.add(box(0.024 * H, 0.11 * H, 0.012 * H), { y: 0.15 * H, z: 0.098 * H * WD }, d.trim);
    } else {
      /* leather jerkin over the tunic */
      tc.add(lathe([
        [0.086 * H * WD, 0.05 * H],
        [0.098 * H * WD, 0.13 * H],
        [0.09 * H * WD, 0.22 * H],
        [0.064 * H * WD, 0.27 * H]
      ], 10, Math.PI * 0.5 - 1.2, 2.4), {}, d.leather);
    }
    /* belt, buckle, pouches */
    tc.add(cyl(0.083 * H * WD, 0.088 * H * WD, 0.032 * H, 12), { y: 0.0 * H }, d.leather);
    tc.add(box(0.032 * H, 0.026 * H, 0.012 * H), { y: 0.002 * H, z: 0.086 * H * WD }, d.trim);
    tc.add(box(0.05 * H, 0.05 * H, 0.028 * H), { x: -0.058 * H * WD, y: -0.012 * H, z: 0.055 * H * WD, rz: 0.1 }, d.cloth2);
    tc.add(box(0.038 * H, 0.036 * H, 0.022 * H), { x: 0.062 * H * WD, y: -0.004 * H, z: 0.05 * H * WD }, d.leather);
    /* tassets */
    for (var t = 0; t < 4; t++) {
      var ta = (t - 1.5) * 0.125;
      tc.add(plate(0.07 * H, 0.12 * H, 0.012 * H, 0.85), {
        x: Math.sin(ta) * 0.078 * H * WD, y: -0.07 * H, z: Math.cos(ta) * 0.078 * H * WD, ry: ta
      }, heavy && t % 2 === 0 ? d.metal : d.cloth2);
    }
    /* a sash across the chest, always in the accent colour */
    tc.add(box(0.03 * H, 0.31 * H, 0.012 * H), { y: 0.14 * H, z: 0.09 * H * WD, rz: 0.44 }, d.trim);
    /* collar / scarf */
    tc.add(cyl(0.05 * H, 0.042 * H, 0.045 * H, 10), { y: 0.30 * H }, d.cloth2);
    /* pauldrons: small enough to leave a neck and a head visible */
    [-1, 1].forEach(function (s) {
      tc.add(sph(0.046 * H * WD, 8, 6), { x: s * 0.112 * H * WD, y: 0.275 * H, sx: 1.1, sy: 0.75, sz: 1.0 }, heavy ? d.metal : d.leather);
      tc.add(cyl(0.047 * H * WD, 0.045 * H * WD, 0.012 * H, 10), { x: s * 0.112 * H * WD, y: 0.257 * H }, d.trim);
    });
    if (kind === 'stalker' || kind === 'neural') {
      tc.add(plate(0.17 * H * WD, 0.34 * H, 0.012 * H, 1.15), { y: 0.0 * H, z: -0.082 * H * WD, rx: 0.14 }, d.cloth);
    }

    /* head pivot: a neck, a face with a brow and bright eyes, then headgear */
    var head = new T.Group();
    head.position.y = 0.335 * H;
    torso.add(head);
    var hc = new Cooker();
    hc.add(cyl(0.032 * H, 0.036 * H, 0.05 * H, 8), { y: -0.012 * H }, d.skin);
    hc.add(sph(0.076 * H, 12, 10), { y: 0.062 * H, sx: 0.88, sy: 1.0, sz: 0.9 }, d.skin);
    /* jaw + brow give the head a direction instead of a ball */
    hc.add(box(0.062 * H, 0.028 * H, 0.05 * H), { y: 0.032 * H, z: 0.045 * H }, d.skin);
    hc.add(box(0.078 * H, 0.014 * H, 0.016 * H), { y: 0.078 * H, z: 0.055 * H }, 0x2a1e16);
    hc.add(box(0.014 * H, 0.011 * H, 0.008 * H), { x: -0.022 * H, y: 0.058 * H, z: 0.066 * H }, 0xe8dcc0);
    hc.add(box(0.014 * H, 0.011 * H, 0.008 * H), { x: 0.022 * H, y: 0.058 * H, z: 0.066 * H }, 0xe8dcc0);
    if (kind === 'warrior' || kind === 'brute') {
      hc.add(sph(0.086 * H, 10, 8), { y: 0.075 * H, sy: 0.92, sx: 0.94 }, d.metal);
      hc.add(cyl(0.098 * H, 0.1 * H, 0.014 * H, 12), { y: 0.03 * H }, d.metal);
      hc.add(box(0.016 * H, 0.05 * H, 0.014 * H), { y: 0.042 * H, z: 0.076 * H }, d.metal);
      if (kind === 'brute') {
        [-1, 1].forEach(function (s) {
          hc.add(cone(0.013 * H, 0.08 * H, 5), { x: s * 0.06 * H, y: 0.13 * H, rz: s * 0.6 }, 0xd8cdb2);
        });
      }
    } else if (kind === 'neural' || kind === 'stalker') {
      hc.add(lathe([[0.094 * H, 0.0], [0.09 * H, 0.06 * H], [0.055 * H, 0.12 * H], [0.0, 0.138 * H]], 10), { y: -0.008 * H }, d.cloth);
      hc.add(box(0.115 * H, 0.032 * H, 0.022 * H), { y: 0.03 * H, z: 0.058 * H }, d.cloth2);
      hc.add(box(0.012 * H, 0.008 * H, 0.006 * H), { x: -0.02 * H, y: 0.058 * H, z: 0.064 * H }, 0xd8b078);
      hc.add(box(0.012 * H, 0.008 * H, 0.006 * H), { x: 0.02 * H, y: 0.058 * H, z: 0.064 * H }, 0xd8b078);
    } else {
      /* bandana with a knot, hair at the back */
      hc.add(cyl(0.082 * H, 0.08 * H, 0.034 * H, 12), { y: 0.098 * H }, d.cloth2);
      hc.add(box(0.032 * H, 0.055 * H, 0.02 * H), { x: -0.066 * H, y: 0.09 * H, rz: 0.5 }, d.cloth2);
      hc.add(sph(0.032 * H, 6, 5), { y: 0.068 * H, z: -0.072 * H }, 0x2a211a);
    }
    head.add(hc.mesh(mat));
    torso.add(tc.mesh(mat));

    /* --- limbs ----------------------------------------------------------- */
    function arm(side) {
      var pivot = new T.Group();
      pivot.position.set(side * 0.125 * H * WD, 0.272 * H, 0);
      pivot.rotation.z = side * -0.08;
      torso.add(pivot);
      var c = new Cooker();
      var sleeve = kind === 'neural' ? d.cloth : d.skin;
      c.add(cap(0.032 * H, 0.105 * H), { y: -0.075 * H }, sleeve);
      c.add(cyl(0.036 * H, 0.032 * H, 0.085 * H, 8), { y: -0.08 * H }, heavy ? d.metal : d.cloth2);
      c.add(sph(0.028 * H, 8, 6), { y: -0.152 * H }, d.leather);
      c.add(cap(0.027 * H, 0.09 * H), { y: -0.205 * H, rx: -0.14 }, sleeve);
      c.add(box(0.05 * H, 0.058 * H, 0.046 * H), { y: -0.268 * H, rx: -0.2 }, d.leather);
      if (side < 0 && kind === 'warrior') {
        /* round shield strapped to the left forearm */
        c.add(cyl(0.13 * H, 0.13 * H, 0.016 * H, 14), { y: -0.2 * H, rz: Math.PI / 2, x: -0.05 * H }, d.leather);
        c.add(cyl(0.048 * H, 0.048 * H, 0.024 * H, 10), { y: -0.2 * H, rz: Math.PI / 2, x: -0.062 * H }, d.metal);
        c.add(cyl(0.132 * H, 0.132 * H, 0.01 * H, 14), { y: -0.2 * H, rz: Math.PI / 2, x: -0.043 * H }, d.trim);
      }
      pivot.add(c.mesh(mat));
      if (side > 0) {
        var wp = new Cooker();
        weapon(wp, d.weapon, H, d.metal, d.trim, d.leather);
        var wm = wp.mesh(mat);
        wm.position.set(0.005 * H, -0.285 * H, 0.04 * H);
        wm.rotation.set(d.weapon === 'spear' || d.weapon === 'staff' ? -0.85 : -0.5, 0.1, 0.1);
        pivot.add(wm);
      }
      return pivot;
    }

    function leg(side) {
      var pivot = new T.Group();
      pivot.position.set(side * 0.058 * H * WD, 0, 0);
      hips.add(pivot);
      var c = new Cooker();
      c.add(cap(0.052 * H, 0.14 * H), { y: -0.11 * H }, d.cloth);
      c.add(sph(0.043 * H, 8, 6), { y: -0.23 * H }, heavy ? d.metal : d.leather);
      c.add(cap(0.04 * H, 0.13 * H), { y: -0.315 * H }, kind === 'warrior' || kind === 'brute' ? d.metal : d.cloth2);
      c.add(cyl(0.046 * H, 0.046 * H, 0.02 * H, 10), { y: -0.39 * H }, d.leather);
      c.add(box(0.08 * H, 0.065 * H, 0.14 * H), { y: -0.435 * H, z: 0.024 * H }, d.leather);
      c.add(box(0.086 * H, 0.018 * H, 0.15 * H), { y: -0.468 * H, z: 0.024 * H }, 0x241c14);
      pivot.add(c.mesh(mat));
      return pivot;
    }

    var armL = arm(-1), armR = arm(1);
    var legL = leg(-1), legR = leg(1);

    torso.rotation.x = 0.02;

    var api = {
      group: group,
      mat: mat,
      mats: [mat],
      armL: armL, armR: armR, legL: legL, legR: legR,
      torso: torso, head: head,
      hips: hips
    };
    group.userData.raider = api;
    group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return api;
  }

  window.RAIDERS3D = { build: build, bladeGeo: bladeGeo };
})();
