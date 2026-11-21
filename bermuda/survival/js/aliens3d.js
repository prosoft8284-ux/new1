/* BERMUDA SIEGE 3D — alien breeds.
   Purple-skinned, glossy, armoured silhouettes matching the concept board:
   grey soldier, hulking brute, robed seer with tentacles, big-headed hatchling,
   spined raptor, spider-crab crawler and the queen.
   Exposes window.ALIEN3D.build(kind, elite, def) -> { group, mat, armL, armR, legL, legR, head, torso } */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  /* ------------------------------------------------------------ shared bits */
  var glowTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(228,196,255,.9)');
    grd.addColorStop(0.5, 'rgba(160,86,255,.36)');
    grd.addColorStop(1, 'rgba(60,0,130,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  var SKIN = {
    runner: 0x8a49d6,
    skitter: 0x6f34bd,
    warrior: 0x8639d8,
    neural: 0x8446d2,
    bomber: 0x9447d8,
    brute: 0x6f2ec2,
    mother: 0x9a3dd2
  };

  /* shared, never disposed per enemy */
  var ARMOR = new T.MeshPhysicalMaterial({
    color: 0x3a3348, metalness: 0.88, roughness: 0.36,
    clearcoat: 0.6, clearcoatRoughness: 0.3,
    emissive: 0x2a1050, emissiveIntensity: 0.75, envMapIntensity: 1.0
  });
  var ARMOR2 = new T.MeshPhysicalMaterial({
    color: 0x544a66, metalness: 0.92, roughness: 0.24,
    clearcoat: 0.8, clearcoatRoughness: 0.22, envMapIntensity: 1.15,
    emissive: 0x3a1470, emissiveIntensity: 0.6
  });
  var CLOTH = new T.MeshStandardMaterial({
    color: 0x2c1a44, roughness: 0.86, metalness: 0.12,
    emissive: 0x2a0b52, emissiveIntensity: 0.4
  });
  var TRIM = new T.MeshStandardMaterial({
    color: 0xd9b6ff, emissive: 0x9b3bff, emissiveIntensity: 2.2, roughness: 0.32
  });
  var CYAN = new T.MeshStandardMaterial({
    color: 0x9ff4ff, emissive: 0x2fd8ff, emissiveIntensity: 2.2, roughness: 0.3
  });
  var BLACK = new T.MeshPhysicalMaterial({
    color: 0x050309, roughness: 0.08, metalness: 0.2,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.4
  });
  var WHITE = new T.MeshBasicMaterial({ color: 0xf2fbff });

  function skinMat(d) {
    return new T.MeshPhysicalMaterial({
      color: SKIN.warrior,
      roughness: 0.38, metalness: 0.08,
      clearcoat: 1, clearcoatRoughness: 0.18,
      emissive: new T.Color(d.glow || 0x4a158f), emissiveIntensity: 0.5,
      envMapIntensity: 0.55
    });
  }

  function makeSkin(kind, d) {
    var m = skinMat(d);
    m.color.setHex(SKIN[kind] || 0x8f5ada);
    return m;
  }

  function halo(size, color, opacity) {
    var s = new T.Sprite(new T.SpriteMaterial({
      map: glowTex, color: color === undefined ? 0xb56bff : color,
      transparent: true, opacity: opacity === undefined ? 0.55 : opacity,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(size, size, 1);
    return s;
  }

  function box(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }
  function ico(r, mat, detail) { return new T.Mesh(new T.IcosahedronGeometry(r, detail || 0), mat); }
  function sph(r, mat, sx, sy, sz) {
    var m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat);
    if (sx) m.scale.set(sx, sy, sz);
    return m;
  }
  function cap(r, len, mat) { return new T.Mesh(new T.CapsuleGeometry(r, len, 4, 10), mat); }
  function cone(r, h, mat, seg) { return new T.Mesh(new T.ConeGeometry(r, h, seg || 6), mat); }
  function torus(r, t, mat) { return new T.Mesh(new T.TorusGeometry(r, t, 8, 22), mat); }

  /* limb pivoting from its joint so the game's swing animation looks right */
  function limb(parent, mat, r, len, x, y, z, tiltZ) {
    var pivot = new T.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = tiltZ || 0;
    var m = cap(r, len, mat);
    m.position.y = -(len * 0.5 + r * 0.8);
    m.castShadow = true;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  }

  /* three-segment limb: upper, forearm/shin, hand/foot with knuckles and toes */
  function jointedLimb(parent, skin, r, len, x, y, z, opts) {
    opts = opts || {};
    var pivot = new T.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = opts.tiltZ || 0;

    var upperLen = len * (opts.upper || 0.56);
    var lowerLen = len * (opts.lower || 0.5);
    var upper = cap(r, upperLen, skin);
    upper.position.y = -upperLen * 0.5 - r * 0.4;
    upper.castShadow = true;
    pivot.add(upper);

    var joint = new T.Group();
    joint.position.y = -upperLen - r * 0.5;
    joint.rotation.x = opts.bend || 0;
    pivot.add(joint);

    var ball = sph(r * 1.02, opts.armor || ARMOR2);
    joint.add(ball);

    var lower = cap(r * 0.84, lowerLen, skin);
    lower.position.y = -lowerLen * 0.5 - r * 0.3;
    lower.castShadow = true;
    joint.add(lower);

    var end = new T.Group();
    end.position.y = -lowerLen - r * 0.7;
    joint.add(end);

    var hand = sph(r * 0.86, skin, 1.1, 0.8, 1.2);
    hand.castShadow = true;
    end.add(hand);

    for (var f = 0; f < 3; f++) {
      var finger = cap(r * 0.22, r * 1.15, skin);
      finger.position.set((f - 1) * r * 0.5, -r * 0.95, r * opts.toeZ || 0);
      finger.rotation.x = opts.foot ? 1.35 : 0.1;
      end.add(finger);
    }

    if (opts.foot) {
      var sole = box(r * 1.5, r * 0.5, r * 2.4, ARMOR);
      sole.position.set(0, -r * 0.6, r * 0.7);
      sole.castShadow = true;
      end.add(sole);
    }

    parent.add(pivot);
    pivot.userData.joint = joint;
    return pivot;
  }

  function eye(parent, x, y, z, r, glowColor, wide) {
    var e = sph(r, BLACK, wide ? 1.15 : 1, wide ? 1.5 : 1.15, 0.55);
    e.position.set(x, y, z);
    parent.add(e);
    var glint = sph(r * 0.26, WHITE);
    glint.position.set(x - r * 0.35, y + r * 0.35, z + r * 0.28);
    parent.add(glint);
    if (glowColor) {
      var s = halo(r * 9, glowColor, 0.32);
      s.position.set(x, y, z);
      parent.add(s);
    }
    return e;
  }

  function chestCore(parent, r, y, z, mat) {
    var ring = torus(r, r * 0.22, ARMOR2);
    ring.position.set(0, y, z);
    parent.add(ring);
    var disc = new T.Mesh(new T.CircleGeometry(r * 0.85, 18), mat || CYAN);
    disc.position.set(0, y, z + 0.005);
    parent.add(disc);
    var s = halo(r * 5.5, 0x7fe6ff, 0.5);
    s.position.set(0, y, z + 0.02);
    parent.add(s);
    return disc;
  }

  /* ------------------------------------------------------------------ breeds */
  function soldier(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();
    var legLen = H * 0.46;
    var legL = jointedLimb(g, skin, R * 0.14, legLen, -R * 0.26, H * 0.47, 0, { foot: true, bend: -0.12 });
    var legR = jointedLimb(g, skin, R * 0.14, legLen, R * 0.26, H * 0.47, 0, { foot: true, bend: -0.12 });

    [-1, 1].forEach(function (s) {
      var boot = box(R * 0.3, H * 0.055, R * 0.5, ARMOR);
      boot.position.set(s * R * 0.26, H * 0.03, R * 0.06);
      g.add(boot);
      var shin = box(R * 0.26, H * 0.15, R * 0.3, ARMOR2);
      shin.position.set(s * R * 0.26, H * 0.16, R * 0.02);
      g.add(shin);
      var knee = ico(R * 0.11, ARMOR2);
      knee.position.set(s * R * 0.26, H * 0.34, R * 0.06);
      g.add(knee);
    });

    var pelvis = box(R * 0.62, H * 0.11, R * 0.42, ARMOR);
    pelvis.position.y = H * 0.47;
    g.add(pelvis);

    var torso = new T.Mesh(new T.CylinderGeometry(R * 0.32, R * 0.24, H * 0.3, 12), skin);
    torso.scale.z = 0.8;
    torso.position.y = H * 0.64;
    torso.castShadow = true;
    g.add(torso);

    var chest = box(R * 0.66, H * 0.17, R * 0.22, ARMOR2);
    chest.position.set(0, H * 0.68, R * 0.15);
    chest.rotation.x = -0.12;
    g.add(chest);

    chestCore(g, R * 0.11, H * 0.68, R * 0.28);

    /* glowing seams keep the plating readable at night */
    [-1, 1].forEach(function (s) {
      var seam = box(R * 0.035, H * 0.11, R * 0.03, TRIM);
      seam.position.set(s * R * 0.3, H * 0.68, R * 0.2);
      seam.rotation.z = -s * 0.25;
      g.add(seam);
      var legSeam = box(R * 0.03, H * 0.09, R * 0.03, TRIM);
      legSeam.position.set(s * R * 0.26, H * 0.18, R * 0.17);
      g.add(legSeam);
    });

    [-1, 1].forEach(function (s) {
      var pauldron = ico(R * 0.21, ARMOR2);
      pauldron.position.set(s * R * 0.42, H * 0.78, 0);
      pauldron.castShadow = true;
      g.add(pauldron);
      var spike = cone(R * 0.05, R * 0.28, TRIM, 4);
      spike.position.set(s * R * 0.5, H * 0.86, -R * 0.02);
      spike.rotation.z = s * 0.5;
      g.add(spike);
      var rib = box(R * 0.05, H * 0.12, R * 0.05, TRIM);
      rib.position.set(s * R * 0.2, H * 0.66, R * 0.26);
      g.add(rib);
    });

    var neck = cap(R * 0.09, H * 0.05, skin);
    neck.position.y = H * 0.82;
    g.add(neck);

    var head = sph(R * 0.27, skin, 1, 1.34, 1.04);
    head.position.y = H * 0.92;
    head.castShadow = true;
    g.add(head);

    eye(g, -R * 0.11, H * 0.945, R * 0.2, R * 0.075, 0x9ff4ff, true);
    eye(g, R * 0.11, H * 0.945, R * 0.2, R * 0.075, 0x9ff4ff, true);

    var jaw = box(R * 0.16, R * 0.06, R * 0.12, skin);
    jaw.position.set(0, H * 0.87, R * 0.19);
    g.add(jaw);

    var armL = jointedLimb(g, skin, R * 0.11, H * 0.3, -R * 0.44, H * 0.75, 0, { tiltZ: 0.12, bend: -0.35 });
    var armR = jointedLimb(g, skin, R * 0.11, H * 0.3, R * 0.44, H * 0.75, 0, { tiltZ: -0.12, bend: -0.35 });
    [armL, armR].forEach(function (a, i) {
      var s = i ? 1 : -1;
      var brace = box(R * 0.16, H * 0.1, R * 0.18, ARMOR2);
      brace.position.set(0, -H * 0.24, 0);
      a.add(brace);
      var claw = cone(R * 0.04, R * 0.16, TRIM, 4);
      claw.position.set(s * R * 0.03, -H * 0.38, 0);
      claw.rotation.x = Math.PI;
      a.add(claw);
    });

    for (var i2 = 0; i2 < 3; i2++) {
      var spineC = cone(R * 0.055, R * 0.24, TRIM, 4);
      spineC.position.set(0, H * 0.6 + i2 * H * 0.03, -R * 0.26);
      spineC.rotation.x = -1.9;
      g.add(spineC);
    }

    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.head = head; g.userData.torso = torso;
    return g;
  }

  function brute(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();
    var legL = jointedLimb(g, skin, R * 0.2, H * 0.26, -R * 0.32, H * 0.3, 0, { tiltZ: 0.04, foot: true, bend: -0.2 });
    var legR = jointedLimb(g, skin, R * 0.2, H * 0.26, R * 0.32, H * 0.3, 0, { tiltZ: -0.04, foot: true, bend: -0.2 });

    [-1, 1].forEach(function (s) {
      var boot = box(R * 0.4, H * 0.07, R * 0.5, ARMOR);
      boot.position.set(s * R * 0.32, H * 0.035, R * 0.05);
      g.add(boot);
      var greave = box(R * 0.34, H * 0.11, R * 0.36, ARMOR2);
      greave.position.set(s * R * 0.32, H * 0.13, 0);
      g.add(greave);
    });

    var pelvis = box(R * 0.8, H * 0.12, R * 0.55, ARMOR);
    pelvis.position.y = H * 0.3;
    g.add(pelvis);

    var torso = ico(R * 0.62, skin, 1);
    torso.scale.set(1.12, 0.95, 0.82);
    torso.position.y = H * 0.55;
    torso.castShadow = true;
    g.add(torso);

    var harness = box(R * 0.7, H * 0.16, R * 0.5, ARMOR2);
    harness.position.set(0, H * 0.6, R * 0.06);
    harness.rotation.x = -0.06;
    g.add(harness);

    var belt = torus(R * 0.42, R * 0.06, ARMOR2);
    belt.position.y = H * 0.35;
    belt.rotation.x = Math.PI / 2;
    g.add(belt);
    chestCore(g, R * 0.1, H * 0.33, R * 0.34);

    [-1, 1].forEach(function (s) {
      var shoulder = ico(R * 0.31, ARMOR2);
      shoulder.position.set(s * R * 0.56, H * 0.72, 0);
      g.add(shoulder);

      var plate = box(R * 0.34, H * 0.09, R * 0.34, ARMOR);
      plate.position.set(s * R * 0.56, H * 0.81, 0);
      plate.rotation.z = s * 0.2;
      g.add(plate);

      var spike = cone(R * 0.075, R * 0.36, TRIM, 4);
      spike.position.set(s * R * 0.66, H * 0.85, -R * 0.04);
      spike.rotation.z = s * 0.7;
      g.add(spike);
    });

    var head = ico(R * 0.21, skin, 1);
    head.scale.set(1, 0.9, 1.12);
    head.position.y = H * 0.84;
    g.add(head);

    var brow = box(R * 0.3, R * 0.06, R * 0.1, ARMOR2);
    brow.position.set(0, H * 0.87, R * 0.16);
    g.add(brow);

    [-1, 1].forEach(function (s) {
      eye(g, s * R * 0.09, H * 0.845, R * 0.19, R * 0.04, 0xff8ce0);
      var tusk = cone(R * 0.045, R * 0.2, ARMOR2, 5);
      tusk.position.set(s * R * 0.13, H * 0.79, R * 0.16);
      tusk.rotation.x = 0.4;
      g.add(tusk);
    });

    var armL = jointedLimb(g, skin, R * 0.18, H * 0.34, -R * 0.6, H * 0.66, 0, { tiltZ: 0.16, bend: -0.4, armor: ARMOR2 });
    var armR = jointedLimb(g, skin, R * 0.18, H * 0.34, R * 0.6, H * 0.66, 0, { tiltZ: -0.16, bend: -0.4, armor: ARMOR2 });
    [armL, armR].forEach(function (a, i) {
      var s = i ? 1 : -1;
      var bracer = box(R * 0.36, H * 0.1, R * 0.36, ARMOR2);
      bracer.position.set(0, -H * 0.3, 0);
      a.add(bracer);
      for (var k = 0; k < 3; k++) {
        var knuckle = cone(R * 0.05, R * 0.16, TRIM, 4);
        knuckle.position.set(s * R * 0.05, -H * 0.36, (k - 1) * R * 0.1);
        knuckle.rotation.x = Math.PI;
        a.add(knuckle);
      }
    });

    for (var i3 = 0; i3 < 5; i3++) {
      var backSpike = cone(R * 0.07, R * 0.42, TRIM, 4);
      backSpike.position.set(0, H * 0.6 + i3 * H * 0.04, -R * 0.42);
      backSpike.rotation.x = -2.0;
      g.add(backSpike);
    }

    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.head = head; g.userData.torso = torso;
    return g;
  }

  function seer(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();

    var robe = new T.Mesh(new T.CylinderGeometry(R * 0.24, R * 0.88, H * 0.78, 16, 1, true), CLOTH);
    robe.position.y = H * 0.39;
    g.add(robe);

    var hem = new T.Mesh(new T.CylinderGeometry(R * 0.9, R * 1.02, H * 0.05, 16), CLOTH);
    hem.position.y = H * 0.025;
    g.add(hem);

    var collar = new T.Mesh(new T.CylinderGeometry(R * 0.5, R * 0.3, H * 0.14, 14, 1, true), ARMOR);
    collar.position.y = H * 0.76;
    g.add(collar);

    var mantle = torus(R * 0.46, R * 0.07, ARMOR2);
    mantle.position.y = H * 0.7;
    mantle.rotation.x = Math.PI / 2;
    g.add(mantle);

    var torso = new T.Mesh(new T.CylinderGeometry(R * 0.3, R * 0.24, H * 0.42, 12), skin);
    torso.position.y = H * 0.6;
    torso.castShadow = true;
    g.add(torso);

    chestCore(g, R * 0.13, H * 0.62, R * 0.28);

    var head = sph(R * 0.3, skin, 1, 1.15, 1.02);
    head.position.y = H * 0.9;
    head.castShadow = true;
    g.add(head);

    eye(g, -R * 0.12, H * 0.93, R * 0.22, R * 0.055, 0xc9f6ff, true);
    eye(g, R * 0.12, H * 0.93, R * 0.22, R * 0.055, 0xc9f6ff, true);

    for (var t = 0; t < 5; t++) {
      var angle = -0.28 + t * 0.14;
      var tent = cap(R * 0.045, R * 0.34, skin);
      tent.position.set(Math.sin(angle) * R * 0.18, H * 0.8, R * 0.16);
      tent.rotation.x = 0.25;
      tent.rotation.z = angle * 0.6;
      g.add(tent);
    }

    var hood = cone(R * 0.38, H * 0.2, CLOTH, 10);
    hood.position.set(0, H * 0.99, -R * 0.04);
    hood.rotation.x = -0.2;
    g.add(hood);

    var armL = limb(g, skin, R * 0.085, H * 0.26, -R * 0.44, H * 0.68, 0, 0.22);
    var armR = limb(g, skin, R * 0.085, H * 0.26, R * 0.44, H * 0.68, 0, -0.22);
    [armL, armR].forEach(function (a, i) {
      var s = i ? 1 : -1;
      var cuff = new T.Mesh(new T.CylinderGeometry(R * 0.13, R * 0.09, H * 0.1, 8), CLOTH);
      cuff.position.y = -H * 0.26;
      a.add(cuff);
      for (var f = 0; f < 3; f++) {
        var claw = cone(R * 0.03, R * 0.14, TRIM, 4);
        claw.position.set(s * R * 0.02, -H * 0.4, (f - 1) * R * 0.07);
        claw.rotation.x = Math.PI;
        a.add(claw);
      }
    });

    g.userData.legL = null; g.userData.legR = null;
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.head = head; g.userData.torso = torso;
    return g;
  }

  function hatchling(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();

    var legL = limb(g, skin, R * 0.09, H * 0.18, -R * 0.16, H * 0.32, 0, 0);
    var legR = limb(g, skin, R * 0.09, H * 0.18, R * 0.16, H * 0.32, 0, 0);
    [-1, 1].forEach(function (s) {
      var boot = box(R * 0.2, H * 0.05, R * 0.32, ARMOR);
      boot.position.set(s * R * 0.16, H * 0.025, R * 0.05);
      g.add(boot);
    });

    var body = new T.Mesh(new T.CylinderGeometry(R * 0.24, R * 0.2, H * 0.26, 12), ARMOR2);
    body.position.y = H * 0.36;
    body.castShadow = true;
    g.add(body);

    chestCore(g, R * 0.1, H * 0.37, R * 0.24);

    var head = sph(R * 0.46, skin, 1, 1.02, 0.95);
    head.position.y = H * 0.73;
    head.castShadow = true;
    g.add(head);

    eye(g, -R * 0.17, H * 0.76, R * 0.32, R * 0.13, 0xb7e9ff, true);
    eye(g, R * 0.17, H * 0.76, R * 0.32, R * 0.13, 0xb7e9ff, true);

    var mouth = box(R * 0.14, R * 0.03, R * 0.05, BLACK);
    mouth.position.set(0, H * 0.62, R * 0.42);
    g.add(mouth);

    [-1, 1].forEach(function (s) {
      var ant = cap(R * 0.018, H * 0.12, skin);
      ant.position.set(s * R * 0.2, H * 0.94, 0);
      ant.rotation.z = s * 0.4;
      g.add(ant);
      var tip = sph(R * 0.03, TRIM);
      tip.position.set(s * R * 0.26, H * 1.0, 0);
      g.add(tip);

      var arm = limb(g, skin, R * 0.06, H * 0.14, s * R * 0.26, H * 0.44, 0, s * 0.2);
      if (s < 0) g.userData.armL = arm; else g.userData.armR = arm;
      var glove = box(R * 0.16, H * 0.06, R * 0.16, ARMOR2);
      glove.position.y = -H * 0.16;
      arm.add(glove);
    });

    /* volatile canister on the back */
    var can = new T.Mesh(new T.CylinderGeometry(R * 0.12, R * 0.12, H * 0.22, 10), ARMOR);
    can.position.set(0, H * 0.44, -R * 0.3);
    g.add(can);
    var boom = sph(R * 0.1, TRIM);
    boom.position.set(0, H * 0.44, -R * 0.3);
    g.add(boom);
    var boomGlow = halo(R * 1.5, 0xffb35a, 0.6);
    boomGlow.position.copy(boom.position);
    g.add(boomGlow);

    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.head = head; g.userData.torso = body;
    return g;
  }

  function raptor(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();

    var legL = limb(g, skin, R * 0.12, H * 0.28, -R * 0.24, H * 0.46, 0, 0.1);
    var legR = limb(g, skin, R * 0.12, H * 0.28, R * 0.24, H * 0.46, 0, -0.1);
    [legL, legR].forEach(function (a, i) {
      var s = i ? 1 : -1;
      var foot = box(R * 0.18, H * 0.05, R * 0.42, ARMOR);
      foot.position.set(0, -H * 0.31, R * 0.1);
      a.add(foot);
      var spur = cone(R * 0.03, R * 0.16, TRIM, 4);
      spur.position.set(s * R * 0.05, -H * 0.3, -R * 0.08);
      spur.rotation.x = 1.4;
      a.add(spur);
    });

    var body = ico(R * 0.52, skin, 1);
    body.scale.set(0.8, 0.92, 1.05);
    body.position.y = H * 0.55;
    body.rotation.x = 0.18;
    body.castShadow = true;
    g.add(body);

    var plates = box(R * 0.4, H * 0.1, R * 0.5, ARMOR2);
    plates.position.set(0, H * 0.62, R * 0.02);
    plates.rotation.x = 0.18;
    g.add(plates);

    var neck = cap(R * 0.13, H * 0.14, skin);
    neck.position.set(0, H * 0.74, R * 0.16);
    neck.rotation.x = -0.4;
    g.add(neck);

    var head = sph(R * 0.24, skin, 0.9, 0.85, 1.5);
    head.position.set(0, H * 0.83, R * 0.36);
    head.castShadow = true;
    g.add(head);

    eye(g, -R * 0.13, H * 0.86, R * 0.42, R * 0.045, 0xffb0f0);
    eye(g, R * 0.13, H * 0.86, R * 0.42, R * 0.045, 0xffb0f0);

    var snout = cone(R * 0.11, R * 0.34, skin, 6);
    snout.position.set(0, H * 0.8, R * 0.68);
    snout.rotation.x = Math.PI / 2;
    g.add(snout);

    for (var c = 0; c < 5; c++) {
      var crest = cone(R * 0.05, R * 0.34, TRIM, 4);
      crest.position.set((c - 2) * R * 0.07, H * 0.92, R * 0.26);
      crest.rotation.x = -0.5;
      crest.rotation.z = (c - 2) * 0.12;
      g.add(crest);
    }

    var armL = limb(g, skin, R * 0.07, H * 0.12, -R * 0.34, H * 0.62, R * 0.1, 0.35);
    var armR = limb(g, skin, R * 0.07, H * 0.12, R * 0.34, H * 0.62, R * 0.1, -0.35);

    var tail = new T.Group();
    tail.position.set(0, H * 0.5, -R * 0.4);
    var seg = cone(R * 0.16, R * 0.8, skin, 6);
    seg.rotation.x = -1.9;
    seg.position.z = -R * 0.35;
    tail.add(seg);
    var tailTip = cone(R * 0.06, R * 0.34, TRIM, 4);
    tailTip.rotation.x = -1.9;
    tailTip.position.set(0, R * 0.18, -R * 0.86);
    tail.add(tailTip);
    g.add(tail);

    for (var sp = 0; sp < 5; sp++) {
      var spine = cone(R * 0.06, R * 0.4, TRIM, 4);
      spine.position.set(0, H * 0.68 - sp * H * 0.035, -R * 0.22 - sp * R * 0.05);
      spine.rotation.x = -2.2;
      g.add(spine);
    }

    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.head = head; g.userData.torso = body;
    return g;
  }

  function crawler(skin, d) {
    var H = d.h, R = d.r;
    var g = new T.Group();

    var shell = sph(R * 1.05, skin, 1, 0.62, 1.2);
    shell.position.y = H * 0.62;
    shell.castShadow = true;
    g.add(shell);

    var armorShell = sph(R * 0.95, ARMOR2, 1, 0.4, 1.1);
    armorShell.position.y = H * 0.72;
    g.add(armorShell);

    for (var r = 0; r < 3; r++) {
      var ridge = cone(R * 0.09, R * 0.34, TRIM, 4);
      ridge.position.set(0, H * 0.88, (r - 1) * R * 0.45);
      ridge.rotation.x = -0.15;
      g.add(ridge);
    }

    var belly = sph(R * 0.5, TRIM, 1, 0.6, 1);
    belly.position.y = H * 0.42;
    g.add(belly);
    var bellyGlow = halo(R * 1.6, 0xb56bff, 0.5);
    bellyGlow.position.y = H * 0.42;
    g.add(bellyGlow);

    /* six bent legs */
    var legs = [];
    for (var s = -1; s <= 1; s += 2) {
      for (var i = 0; i < 3; i++) {
        var hip = new T.Group();
        hip.position.set(s * R * 0.7, H * 0.6, (i - 1) * R * 0.45);
        var upper = cap(R * 0.06, R * 0.5, skin);
        upper.position.set(s * R * 0.28, R * 0.12, 0);
        upper.rotation.z = s * -1.1;
        hip.add(upper);
        var lower = cap(R * 0.045, R * 0.5, ARMOR);
        lower.position.set(s * R * 0.62, -R * 0.18, 0);
        lower.rotation.z = s * 0.45;
        hip.add(lower);
        g.add(hip);
        legs.push(hip);
      }
    }

    var head = sph(R * 0.4, skin, 0.9, 0.8, 0.9);
    head.position.set(0, H * 0.55, R * 0.95);
    g.add(head);

    eye(g, -R * 0.15, H * 0.65, R * 1.2, R * 0.06, 0xe08cff);
    eye(g, R * 0.15, H * 0.65, R * 1.2, R * 0.06, 0xe08cff);
    eye(g, -R * 0.07, H * 0.52, R * 1.24, R * 0.04, 0xe08cff);
    eye(g, R * 0.07, H * 0.52, R * 1.24, R * 0.04, 0xe08cff);

    [-1, 1].forEach(function (s2) {
      var mand = cone(R * 0.05, R * 0.3, ARMOR2, 5);
      mand.position.set(s2 * R * 0.2, H * 0.4, R * 1.15);
      mand.rotation.x = 1.9;
      g.add(mand);
    });

    g.userData.legL = legs[0]; g.userData.legR = legs[1];
    g.userData.armL = null; g.userData.armR = null;
    g.userData.head = head; g.userData.torso = shell;
    return g;
  }

  function queen(skin, d) {
    var g = brute(skin, d);

    var crown = new T.Group();
    crown.position.y = d.h * 0.95;
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Math.PI * 2;
      var spike = cone(d.r * 0.08, d.r * 0.55, TRIM, 4);
      spike.position.set(Math.cos(a) * d.r * 0.24, 0, Math.sin(a) * d.r * 0.24);
      spike.rotation.z = Math.cos(a) * 0.5;
      spike.rotation.x = -Math.sin(a) * 0.5;
      crown.add(spike);
    }
    g.add(crown);

    var ringCrown = torus(d.r * 0.26, d.r * 0.03, ARMOR2);
    ringCrown.position.y = d.h * 0.9;
    ringCrown.rotation.x = Math.PI / 2;
    g.add(ringCrown);

    var heart = sph(d.r * 0.16, TRIM);
    heart.position.set(0, d.h * 0.62, d.r * 0.4);
    g.add(heart);
    var heartGlow = halo(d.r * 1.6, 0xff7bdc, 0.7);
    heartGlow.position.copy(heart.position);
    g.add(heartGlow);

    for (var k = 0; k < 4; k++) {
      var skirt = cone(d.r * 0.09, d.r * 0.6, TRIM, 4);
      var ang = -0.6 + k * 0.4;
      skirt.position.set(Math.sin(ang) * d.r * 0.8, d.r * 0.7, Math.cos(ang) * d.r * 0.5);
      skirt.rotation.x = Math.PI;
      g.add(skirt);
    }

    /* two extra claw arms for the boss silhouette */
    [-1, 1].forEach(function (s) {
      var extra = limb(g, skin, d.r * 0.1, d.h * 0.2, s * d.r * 0.42, d.h * 0.5, -d.r * 0.3, s * 0.5);
      var claw = cone(d.r * 0.05, d.r * 0.3, TRIM, 4);
      claw.position.set(0, -d.h * 0.3, 0);
      claw.rotation.x = Math.PI;
      extra.add(claw);
    });

    return g;
  }

  var BUILDERS = {
    warrior: soldier,
    brute: brute,
    neural: seer,
    bomber: hatchling,
    runner: raptor,
    skitter: crawler,
    mother: queen
  };

  window.ALIEN3D = {
    build: function (kind, elite, d) {
      var skin = makeSkin(kind, d);
      var fn = BUILDERS[kind] || soldier;
      var g;
      try {
        g = fn(skin, d);
      } catch (err) {
        g = soldier(skin, d);
      }
      var refs = {
        group: g, mat: skin,
        armL: g.userData.armL || null,
        armR: g.userData.armR || null,
        legL: g.userData.legL || null,
        legR: g.userData.legR || null,
        head: g.userData.head || null,
        torso: g.userData.torso || null
      };
      /* shared geometry and non-skin materials must survive a single enemy's death */
      g.traverse(function (o) {
        if (!o.isMesh && !o.isSprite) return;
        if (o.geometry) o.geometry.userDataShared = true;
        if (o.material && o.material !== skin) o.material.userDataShared = true;
      });
      return refs;
    },
    glowTexture: glowTex
  };
})();
