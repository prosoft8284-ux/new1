/* BERMUDA SIEGE 3D — beach raiders, on a real skeleton.
   Every raider is a THREE.SkinnedMesh over a 19-bone humanoid rig: hips, spine,
   chest, neck, head, two clavicles, upper arm / forearm / hand, and thigh /
   shin / foot. Geometry is baked with per-vertex colours and blended weights
   around every joint, so elbows and knees bend instead of pivoting like toys.

   window.RAIDERS3D.build(kind, elite, def) returns
     { group, mat, mats, rig, pose(e, dt), bones }
   and siege3d.js animates it by calling pose() each frame. */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  /* ---------------------------------------------------------------- cooker */
  function Cooker() {
    this.pos = []; this.nor = []; this.col = [];
    this.idx = []; this.wt = [];
  }
  var _m = new T.Matrix4();
  var _q = new T.Quaternion();
  var _e = new T.Euler();
  var _s = new T.Vector3();
  var _p = new T.Vector3();
  var _c = new T.Color();
  var _v = new T.Vector3();

  /* one piece = one bone (or a blend into its parent across the joint) */
  Cooker.prototype.add = function (geo, opts, hex, A, B) {
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
      var y = pa.getY(i);
      this.pos.push(pa.getX(i), y, pa.getZ(i));
      if (na) this.nor.push(na.getX(i), na.getY(i), na.getZ(i));
      else this.nor.push(0, 1, 0);
      this.col.push(_c.r, _c.g, _c.b);
      var w = B ? B(y) : [[A, 1]];
      var si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      for (var k = 0; k < w.length && k < 4; k++) { si[k] = w[k][0]; sw[k] = w[k][1]; }
      this.idx.push(si[0], si[1], si[2], si[3]);
      this.wt.push(sw[0], sw[1], sw[2], sw[3]);
    }
    g.dispose();
  };

  Cooker.prototype.geometry = function (skinned) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    if (skinned) {
      g.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.idx, 4));
      g.setAttribute('skinWeight', new T.Float32BufferAttribute(this.wt, 4));
    }
    g.computeBoundingSphere();
    return g;
  };

  Cooker.prototype.mesh = function (mat, bones) {
    var g = this.geometry(true);
    var m = new T.SkinnedMesh(g, mat);
    m.add(bones[0]);
    /* the bone hierarchy must be in its bind pose before the inverses exist */
    m.updateMatrixWorld(true);
    m.bind(new T.Skeleton(bones));
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  };

  Cooker.prototype.plain = function (mat) {
    var m = new T.Mesh(this.geometry(false), mat);
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  };

  /* --------------------------------------------------------------- helpers */
  function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
  function cyl(rt, rb, h, seg) { return new T.CylinderGeometry(rt, rb, h, seg || 8); }
  function sph(r, w, h) { return new T.SphereGeometry(r, w || 10, h || 8); }
  function cap(r, len) { return new T.CapsuleGeometry(r, len, 3, 8); }
  function cone(r, h, seg) { return new T.ConeGeometry(r, h, seg || 6); }
  function lathe(points, seg, phiStart, phiLength) {
    var pts = [];
    for (var i = 0; i < points.length; i++) pts.push(new T.Vector2(points[i][0], points[i][1]));
    return new T.LatheGeometry(pts, seg || 10, phiStart || 0, phiLength === undefined ? Math.PI * 2 : phiLength);
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
  function smooth(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
    return t * t * (3 - 2 * t);
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
    function ring(y, w) { return [[0, y, th], [w, y, 0], [0, y, -th], [-w, y, 0]]; }
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
    stalker: { cloth: 0x3b424c, cloth2: 0x2a3038, leather: 0x262a30, skin: 0x96755a, metal: 0x8a929a, trim: 0x7a2a2a, w: 0.9, weapon: 'dagger' },
    /* the blood-avenger: a hooded duelist in the dead hunter's colours */
    avenger: { cloth: 0x2a2530, cloth2: 0x17151c, leather: 0x1e1a17, skin: 0x9a7d63, metal: 0xb9c2cc, trim: 0xff5b6e, w: 1.02, weapon: 'greatsword' }
  };

  function newMat() {
    return new T.MeshStandardMaterial({
      vertexColors: true, flatShading: true,
      metalness: 0.16, roughness: 0.84,
      emissive: new T.Color(0x1a0d06), emissiveIntensity: 0.5
    });
  }

  /* --------------------------------------------------------------- weapons */
  function weapon(cook, kind, H, metal, trim, leather, B) {
    if (kind === 'cutlass') {
      for (var i = 0; i < 2; i++) {
        cook.add(bladeGeo(0.075 * H, 0.026 * H, 0.008 * H, 0.018 * H), { x: 0.004 * H, y: i * 0.072 * H, rz: 0.05 * i }, 0xc3ccd6, B);
      }
      cook.add(box(0.07 * H, 0.012 * H, 0.02 * H), {}, trim, B);
      cook.add(cyl(0.009 * H, 0.010 * H, 0.06 * H, 8), { y: -0.035 * H }, leather, B);
      cook.add(sph(0.012 * H, 8, 6), { y: -0.07 * H }, trim, B);
    } else if (kind === 'greatsword') {
      cook.add(bladeGeo(0.4 * H, 0.034 * H, 0.009 * H, 0.07 * H), { y: 0.05 * H }, 0xd2dbe4, B);
      cook.add(box(0.13 * H, 0.014 * H, 0.024 * H), { y: 0.045 * H }, trim, B);
      cook.add(cyl(0.011 * H, 0.012 * H, 0.12 * H, 8), { y: -0.02 * H }, leather, B);
      cook.add(sph(0.016 * H, 8, 6), { y: -0.085 * H }, trim, B);
    } else if (kind === 'cleaver') {
      cook.add(cyl(0.012 * H, 0.014 * H, 0.3 * H, 8), { y: 0.08 * H }, leather, B);
      cook.add(box(0.07 * H, 0.15 * H, 0.016 * H), { x: 0.03 * H, y: 0.24 * H }, metal, B);
      cook.add(box(0.075 * H, 0.02 * H, 0.02 * H), { x: 0.026 * H, y: 0.16 * H }, trim, B);
    } else if (kind === 'spear') {
      cook.add(cyl(0.009 * H, 0.011 * H, 0.55 * H, 7), { y: 0.2 * H }, leather, B);
      cook.add(cone(0.022 * H, 0.09 * H, 5), { y: 0.51 * H }, metal, B);
      cook.add(cyl(0.013 * H, 0.013 * H, 0.02 * H, 8), { y: 0.47 * H }, trim, B);
    } else if (kind === 'staff') {
      cook.add(cyl(0.011 * H, 0.013 * H, 0.54 * H, 7), { y: 0.19 * H }, leather, B);
      cook.add(sph(0.03 * H, 8, 6), { y: 0.48 * H }, trim, B);
    } else if (kind === 'bomb') {
      cook.add(sph(0.032 * H, 8, 6), { y: -0.01 * H }, 0x2a2622, B);
      cook.add(cyl(0.006 * H, 0.008 * H, 0.03 * H, 6), { y: 0.03 * H, rz: 0.3 }, 0x6a5a3a, B);
    } else {
      cook.add(bladeGeo(0.1 * H, 0.022 * H, 0.007 * H, 0.018 * H), { y: 0.02 * H }, 0xc3ccd6, B);
      cook.add(box(0.042 * H, 0.009 * H, 0.016 * H), { y: 0.014 * H }, trim, B);
      cook.add(cyl(0.008 * H, 0.009 * H, 0.05 * H, 7), { y: -0.015 * H }, leather, B);
    }
  }

  /* ------------------------------------------------------------------ rig */
  function build(kind, elite, def) {
    var d = DRESS[kind] || DRESS.runner;
    var H = def.h;
    var WD = d.w * (elite ? 1.05 : (def.boss ? 1.18 : 1));
    var heavy = kind === 'warrior' || kind === 'brute' || kind === 'stalker' || kind === 'avenger';
    var hooded = kind === 'neural' || kind === 'stalker' || kind === 'avenger';

    var hipY = 0.47 * H;
    var spineY = hipY + 0.085 * H;
    var chestY = spineY + 0.095 * H;
    var neckY = chestY + 0.125 * H;
    var headY = neckY + 0.05 * H;
    var shY = chestY + 0.072 * H;
    var shX = 0.1 * H * WD;
    var upperLen = 0.115 * H, foreLen = 0.105 * H, handLen = 0.05 * H;
    var thighLen = 0.215 * H, shinLen = 0.2 * H;
    var hipX = 0.057 * H * WD;

    /* bones, parented into a real hierarchy */
    var B = [];
    function bone(name, parent, x, y, z) {
      var b = new T.Bone();
      b.name = name;
      b.position.set(x, y, z);
      if (parent) parent.add(b);
      else b.userData.root = true;
      B.push(b);
      return b;
    }
    var hip = bone('hips', null, 0, hipY, 0);
    var spine = bone('spine', hip, 0, spineY - hipY, 0);
    var chest = bone('chest', spine, 0, chestY - spineY, 0);
    var neck = bone('neck', chest, 0, neckY - chestY, 0);
    var head = bone('head', neck, 0, headY - neckY, 0);
    var clavL = bone('clavL', chest, -shX * 0.9, shY - chestY, 0);
    var armL = bone('upperArmL', clavL, -shX * 0.1, 0, 0);
    var foreL = bone('forearmL', armL, 0, -upperLen, 0);
    var handL = bone('handL', foreL, 0, -foreLen, 0);
    var clavR = bone('clavR', chest, shX * 0.9, shY - chestY, 0);
    var armR = bone('upperArmR', clavR, shX * 0.1, 0, 0);
    var foreR = bone('forearmR', armR, 0, -upperLen, 0);
    var handR = bone('handR', foreR, 0, -foreLen, 0);
    var thighL = bone('thighL', hip, -hipX, -0.02 * H, 0);
    var shinL = bone('shinL', thighL, 0, -thighLen, 0);
    var footL = bone('footL', shinL, 0, -shinLen, 0);
    var thighR = bone('thighR', hip, hipX, -0.02 * H, 0);
    var shinR = bone('shinR', thighR, 0, -thighLen, 0);
    var footR = bone('footR', shinR, 0, -shinLen, 0);
    var idx = {};
    for (var bi = 0; bi < B.length; bi++) idx[B[bi].name] = bi;

    var group = new T.Group();
    /* bones are added to the mesh by Cooker.mesh (bone 0), so update the
       hierarchy before the skeleton is built */
    var mat = newMat();
    var cook = new Cooker();

    /* --- torso: one column, blended through hips / spine / chest --------- */
    var torsoW = function (y) {
      var wc = smooth(chestY - 0.16 * H, chestY - 0.02 * H, y);
      var wh = 1 - smooth(hipY - 0.02 * H, hipY + 0.07 * H, y);
      var ws = Math.max(0, 1 - wc - wh);
      return [[idx.chest, wc], [idx.spine, ws], [idx.hips, wh]];
    };
    cook.add(lathe([
      [0.076 * H * WD, hipY - 0.03 * H],
      [0.086 * H * WD, hipY + 0.03 * H],
      [0.092 * H * WD, hipY + 0.12 * H],
      [0.088 * H * WD, hipY + 0.2 * H],
      [0.068 * H * WD, hipY + 0.25 * H],
      [0.044 * H * WD, chestY + 0.02 * H]
    ], 12), {}, d.cloth, 0, torsoW);
    if (heavy) {
      cook.add(lathe([
        [0.082 * H * WD, hipY + 0.03 * H],
        [0.096 * H * WD, hipY + 0.11 * H],
        [0.091 * H * WD, hipY + 0.19 * H],
        [0.068 * H * WD, hipY + 0.24 * H]
      ], 10, Math.PI * 0.5 - 1.35, 2.7), {}, d.metal, 0, torsoW);
      cook.add(cyl(0.074 * H * WD, 0.074 * H * WD, 0.012 * H, 12), { y: hipY + 0.215 * H }, d.trim, idx.spine);
      cook.add(box(0.024 * H, 0.12 * H, 0.012 * H), { y: hipY + 0.14 * H, z: 0.1 * H * WD }, d.trim, idx.spine);
    } else {
      cook.add(lathe([
        [0.08 * H * WD, hipY + 0.04 * H],
        [0.092 * H * WD, hipY + 0.12 * H],
        [0.086 * H * WD, hipY + 0.2 * H],
        [0.062 * H * WD, hipY + 0.25 * H]
      ], 10, Math.PI * 0.5 - 1.2, 2.4), {}, d.leather, 0, torsoW);
    }
    cook.add(cyl(0.084 * H * WD, 0.089 * H * WD, 0.034 * H, 12), { y: hipY - 0.005 * H }, d.leather, idx.hips);
    cook.add(box(0.032 * H, 0.026 * H, 0.012 * H), { y: hipY, z: 0.088 * H * WD }, d.trim, idx.hips);
    cook.add(box(0.05 * H, 0.05 * H, 0.028 * H), { x: -0.06 * H * WD, y: hipY - 0.03 * H, z: 0.05 * H * WD, rz: 0.1 }, d.cloth2, idx.hips);
    cook.add(box(0.038 * H, 0.036 * H, 0.022 * H), { x: 0.064 * H * WD, y: hipY - 0.02 * H, z: 0.045 * H * WD }, d.leather, idx.hips);
    for (var t = 0; t < 4; t++) {
      var ta = (t - 1.5) * 0.13;
      cook.add(plate(0.07 * H, 0.12 * H, 0.012 * H, 0.85), {
        x: Math.sin(ta) * 0.08 * H * WD, y: hipY - 0.075 * H, z: Math.cos(ta) * 0.08 * H * WD, ry: ta
      }, heavy && (t === 1 || t === 2) ? d.metal : d.cloth2, idx.hips);
    }
    cook.add(box(0.03 * H, 0.3 * H, 0.012 * H), { y: hipY + 0.13 * H, z: 0.095 * H * WD, rz: 0.44 }, d.trim, idx.spine);
    cook.add(cyl(0.052 * H, 0.044 * H, 0.05 * H, 10), { y: chestY + 0.008 * H }, d.cloth2, idx.chest);
    [-1, 1].forEach(function (s) {
      cook.add(sph(0.046 * H * WD, 8, 6), { x: s * 0.104 * H * WD, y: shY - 0.005 * H, sx: 1.1, sy: 0.78 }, heavy ? d.metal : d.leather, idx['clav' + (s < 0 ? 'L' : 'R')]);
      cook.add(cyl(0.047 * H * WD, 0.045 * H * WD, 0.012 * H, 10), { x: s * 0.104 * H * WD, y: shY - 0.03 * H }, d.trim, idx['clav' + (s < 0 ? 'L' : 'R')]);
    });
    if (hooded) {
      cook.add(plate(0.17 * H * WD, 0.32 * H, 0.012 * H, 1.15), { y: hipY + 0.06 * H, z: -0.084 * H * WD, rx: 0.12 }, d.cloth, idx.spine);
    }

    /* --- head ------------------------------------------------------------ */
    var headW = function (y) { return [[idx.head, smooth(neckY - 0.03 * H, neckY + 0.02 * H, y)], [idx.neck, 1 - smooth(neckY - 0.03 * H, neckY + 0.02 * H, y)]]; };
    cook.add(cyl(0.032 * H, 0.036 * H, 0.055 * H, 8), { y: neckY + 0.005 * H }, d.skin, 0, headW);
    cook.add(sph(0.082 * H, 12, 10), { y: headY + 0.062 * H, sx: 0.88, sy: 1.0, sz: 0.9 }, d.skin, idx.head);
    cook.add(box(0.062 * H, 0.028 * H, 0.05 * H), { y: headY + 0.03 * H, z: 0.045 * H }, d.skin, idx.head);
    cook.add(box(0.078 * H, 0.014 * H, 0.016 * H), { y: headY + 0.076 * H, z: 0.055 * H }, 0x2a1e16, idx.head);
    cook.add(box(0.014 * H, 0.011 * H, 0.008 * H), { x: -0.022 * H, y: headY + 0.056 * H, z: 0.066 * H }, 0xe8dcc0, idx.head);
    cook.add(box(0.014 * H, 0.011 * H, 0.008 * H), { x: 0.022 * H, y: headY + 0.056 * H, z: 0.066 * H }, 0xe8dcc0, idx.head);
    if (kind === 'warrior' || kind === 'brute') {
      cook.add(sph(0.086 * H, 10, 8), { y: headY + 0.072 * H, sy: 0.92, sx: 0.94 }, d.metal, idx.head);
      cook.add(cyl(0.098 * H, 0.1 * H, 0.014 * H, 12), { y: headY + 0.028 * H }, d.metal, idx.head);
      cook.add(box(0.016 * H, 0.05 * H, 0.014 * H), { y: headY + 0.04 * H, z: 0.076 * H }, d.metal, idx.head);
      if (kind === 'brute') {
        [-1, 1].forEach(function (s) {
          cook.add(cone(0.013 * H, 0.08 * H, 5), { x: s * 0.06 * H, y: headY + 0.128 * H, rz: s * 0.6 }, 0xd8cdb2, idx.head);
        });
      }
    } else if (hooded) {
      cook.add(lathe([[0.096 * H, 0], [0.091 * H, 0.06 * H], [0.056 * H, 0.12 * H], [0.0, 0.14 * H]], 10), { y: headY - 0.006 * H }, d.cloth, idx.head);
      cook.add(box(0.115 * H, 0.032 * H, 0.022 * H), { y: headY + 0.026 * H, z: 0.058 * H }, d.cloth2, idx.head);
      if (kind === 'avenger') {
        /* a bone mask and a torn veil: the face is the last thing you see */
        cook.add(box(0.086 * H, 0.062 * H, 0.02 * H), { y: headY + 0.05 * H, z: 0.052 * H }, 0xe4dcc8, idx.head);
        cook.add(box(0.018 * H, 0.01 * H, 0.008 * H), { x: -0.02 * H, y: headY + 0.058 * H, z: 0.063 * H }, 0x1a1418, idx.head);
        cook.add(box(0.018 * H, 0.01 * H, 0.008 * H), { x: 0.02 * H, y: headY + 0.058 * H, z: 0.063 * H }, 0x1a1418, idx.head);
        cook.add(plate(0.09 * H, 0.2 * H, 0.01 * H, 1.1), { y: headY - 0.11 * H, z: -0.05 * H, rx: -0.1 }, d.cloth2, idx.neck);
      }
    } else {
      cook.add(cyl(0.082 * H, 0.08 * H, 0.034 * H, 12), { y: headY + 0.096 * H }, d.cloth2, idx.head);
      cook.add(box(0.032 * H, 0.055 * H, 0.02 * H), { x: -0.066 * H, y: headY + 0.088 * H, rz: 0.5 }, d.cloth2, idx.head);
      cook.add(sph(0.032 * H, 6, 5), { y: headY + 0.066 * H, z: -0.072 * H }, 0x2a211a, idx.head);
    }

    /* --- arms ------------------------------------------------------------ */
    function arm(side) {
      var L = side < 0;
      var S = L ? 'L' : 'R';
      var ax = side * shX;
      var armW = function (y) {
        var k = smooth(shY - upperLen - 0.03 * H, shY - 0.01 * H, y);
        return [[idx['upperArm' + S], k], [idx['clav' + S], 1 - k]];
      };
      var foreW = function (y) {
        var k = smooth(shY - upperLen - foreLen - 0.02 * H, shY - upperLen + 0.015 * H, y);
        return [[idx['forearm' + S], k], [idx['upperArm' + S], 1 - k]];
      };
      cook.add(cap(0.033 * H, upperLen * 0.8), { x: ax, y: shY - upperLen * 0.5 }, kind === 'neural' ? d.cloth : d.skin, 0, armW);
      cook.add(cyl(0.038 * H, 0.032 * H, upperLen * 0.62, 8), { x: ax, y: shY - upperLen * 0.62 }, heavy ? d.metal : d.cloth2, 0, armW);
      cook.add(sph(0.029 * H, 8, 6), { x: ax, y: shY - upperLen }, d.leather, idx['upperArm' + S]);
      cook.add(cap(0.028 * H, foreLen * 0.8), { x: ax, y: shY - upperLen - foreLen * 0.5 }, kind === 'neural' ? d.cloth : d.skin, 0, foreW);
      cook.add(cyl(0.032 * H, 0.028 * H, foreLen * 0.5, 8), { x: ax, y: shY - upperLen - foreLen * 0.68 }, d.leather, 0, foreW);
      cook.add(box(0.05 * H, 0.058 * H, 0.046 * H), { x: ax, y: shY - upperLen - foreLen - 0.012 * H }, d.leather, idx['hand' + S]);
      if (L && kind === 'warrior') {
        cook.add(cyl(0.13 * H, 0.13 * H, 0.016 * H, 14), { x: ax - 0.05 * H, y: shY - upperLen - foreLen * 0.6, rz: Math.PI / 2 }, d.leather, idx['forearmL']);
        cook.add(cyl(0.048 * H, 0.048 * H, 0.024 * H, 10), { x: ax - 0.062 * H, y: shY - upperLen - foreLen * 0.6, rz: Math.PI / 2 }, d.metal, idx['forearmL']);
        cook.add(cyl(0.132 * H, 0.132 * H, 0.01 * H, 14), { x: ax - 0.043 * H, y: shY - upperLen - foreLen * 0.6, rz: Math.PI / 2 }, d.trim, idx['forearmL']);
      }
    }
    arm(-1); arm(1);

    /* --- legs ------------------------------------------------------------ */
    function leg(side) {
      var S = side < 0 ? 'L' : 'R';
      var lx = side * hipX;
      var thighW = function (y) {
        var k = smooth(hipY - 0.03 * H, hipY + 0.04 * H, y);
        return [[idx['thigh' + S], 1 - k], [idx.hips, k]];
      };
      var shinW = function (y) {
        var k = smooth(hipY - 0.03 * H - thighLen - 0.02 * H, hipY - 0.03 * H - thighLen + 0.02 * H, y);
        return [[idx['shin' + S], k], [idx['thigh' + S], 1 - k]];
      };
      cook.add(cap(0.054 * H, thighLen * 0.78), { x: lx, y: hipY - 0.03 * H - thighLen * 0.5 }, d.cloth, 0, thighW);
      cook.add(sph(0.043 * H, 8, 6), { x: lx, y: hipY - 0.03 * H - thighLen }, heavy ? d.metal : d.leather, idx['thigh' + S]);
      cook.add(cap(0.041 * H, shinLen * 0.75), { x: lx, y: hipY - 0.03 * H - thighLen - shinLen * 0.5 }, (kind === 'warrior' || kind === 'brute') ? d.metal : d.cloth2, 0, shinW);
      cook.add(cyl(0.047 * H, 0.047 * H, 0.02 * H, 10), { x: lx, y: hipY - 0.03 * H - thighLen - shinLen * 0.92 }, d.leather, idx['shin' + S]);
      cook.add(box(0.082 * H, 0.062 * H, 0.14 * H), { x: lx, y: hipY - 0.03 * H - thighLen - shinLen - 0.018 * H, z: 0.024 * H }, d.leather, idx['foot' + S]);
      cook.add(box(0.088 * H, 0.016 * H, 0.15 * H), { x: lx, y: hipY - 0.03 * H - thighLen - shinLen - 0.05 * H, z: 0.024 * H }, 0x241c14, idx['foot' + S]);
    }
    leg(-1); leg(1);

    var skinned = cook.mesh(mat, B);
    group.add(skinned);

    /* --- weapon in the right hand ---------------------------------------- */
    var wp = new Cooker();
    weapon(wp, d.weapon, H, d.metal, d.trim, d.leather, idx.handR);
    var plain = wp.plain(mat);
    plain.position.set(0.008 * H, -handLen * 0.35, 0.03 * H);
    plain.rotation.set(d.weapon === 'spear' || d.weapon === 'staff' ? -0.85 : -0.45, 0.12, 0.1);
    handR.add(plain);

    /* --------------------------------------------------------------- pose */
    var cur = {};
    function setBone(name, x, y, z) {
      var b = B[idx[name]];
      if (!b) return;
      var c = cur[name];
      if (!c) c = cur[name] = { x: 0, y: 0, z: 0 };
      c.x = x; c.y = y; c.z = z;
      b.rotation.set(x, y, z);
    }

    function pose(e, dt) {
      var sp = 0;
      if (dt > 0) {
        var vx = e.pos.x - e.px, vz = e.pos.z - e.pz;
        sp = Math.min(1.25, Math.hypot(vx, vz) / Math.max(dt, 0.0001) / 4);
      }
      if (e._spd === undefined) e._spd = sp;
      e._spd = e._spd + (sp - e._spd) * Math.min(1, dt * 8);
      sp = e._spd;
      var run = Math.max(0, sp - 0.35) / 0.9;
      var t = e.t || 0;
      var phase = e._phase || 0;
      phase += dt * (2.6 + sp * 7.4);
      if (phase > 6.283) phase -= 6.283;
      e._phase = phase;
      var stride = Math.min(1, 0.16 + sp * 1.05);
      var swing = Math.sin(phase) * 0.72 * stride;
      var bounce = Math.abs(Math.sin(phase)) * 0.025 * stride * H;

      /* walk / run: legs swing at the hip, knees only ever bend backwards,
         arms counter-swing, the chest counter-rotates and the head stays level */
      var thighL = swing, thighR = -swing;
      var kneeL = -Math.max(0, -Math.sin(phase + 0.5)) * 1.15 * stride;
      var kneeR = -Math.max(0, Math.sin(phase + 0.5)) * 1.15 * stride;
      var armAmp = 0.5 * stride + run * 0.35;
      var armLx = -swing * armAmp - 0.08;
      var armRx = swing * armAmp - 0.08;
      var elbowL = -0.25 - Math.max(0, swing) * 0.6 - run * 0.5;
      var elbowR = -0.25 - Math.max(0, -swing) * 0.6 - run * 0.5;
      var chestTwist = -swing * 0.14;
      var lean = 0.03 + run * 0.16;
      var breath = Math.sin(t * 1.6) * 0.018;
      var wind = 0, cut = 0, recoil = 0;
      if (e.state === 'wind') {
        wind = 1 - Math.max(0, Math.min(1, (e.stateT || 0) / (e.pro ? 0.3 : 0.45)));
        wind = Math.min(1, wind * 1.25);
      }
      if (e.lunge > 0) cut = Math.sin(Math.max(0, Math.min(1, 1 - e.lunge / 0.5)) * Math.PI);
      if (e.stagger > 0) recoil = Math.min(1, e.stagger * 1.6);

      /* windup: the shoulder rolls back and the chest turns away */
      armRx += wind * -1.25;
      elbowR += wind * -0.9;
      chestTwist += wind * 0.42;
      armLx += wind * -0.25;
      /* the cut: hips and chest lead, the arm follows through across the body */
      armRx += cut * 1.45;
      elbowR += cut * 1.05;
      chestTwist += cut * -0.55;
      lean += cut * 0.09;
      /* taking a hit: shoulders back, head down, knees soft */
      lean -= recoil * 0.22;
      armRx += recoil * 0.5;
      armLx += recoil * 0.45;
      thighL += recoil * 0.25;
      thighR -= recoil * 0.18;

      setBone('hips', 0, -chestTwist * 0.35, 0);
      hip.position.y = hipY + bounce;
      setBone('spine', lean * 0.5 + breath, chestTwist * 0.5, 0);
      setBone('chest', lean * 0.5 - breath, chestTwist * 0.5, 0);
      setBone('neck', -lean * 0.6, -chestTwist * 0.6, 0);
      setBone('head', -lean * 0.5 + Math.sin(t * 2.3) * 0.03, -chestTwist * 0.4, 0);
      setBone('clavL', 0, 0, -0.06 - wind * 0.12);
      setBone('clavR', 0, 0, 0.06 + wind * 0.18);
      setBone('upperArmL', armLx, 0, 0.13 + run * 0.05);
      setBone('forearmL', elbowL, 0, 0.04);
      setBone('upperArmR', armRx, 0, -0.13 - run * 0.05);
      setBone('forearmR', elbowR, 0, -0.04);
      setBone('thighL', thighL, 0, 0.02);
      setBone('thighR', thighR, 0, -0.02);
      setBone('shinL', kneeL, 0, 0);
      setBone('shinR', kneeR, 0, 0);
      setBone('footL', -kneeL * 0.45, 0, 0);
      setBone('footR', -kneeR * 0.45, 0, 0);
    }

    var api = {
      group: group, mat: mat, mats: [mat], bones: B, skinned: skinned,
      pose: pose, hips: hip, torso: chest, head: head,
      armL: armL, armR: armR, legL: thighL, legR: thighR
    };
    group.userData.raider = api;
    group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return api;
  }

  window.RAIDERS3D = { build: build, bladeGeo: bladeGeo, DRESS: DRESS };
})();
