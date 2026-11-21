/* BERMUDA SIEGE 3D — relic weapons.
   Faceted violet crystal, blackened engraved metal, glowing gem cores.
   Everything is generated at runtime, no textures or models to load.
   Exposes window.RELIC3D.build(kind) -> { group, muzzle, flash, glows } */
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
    grd.addColorStop(0.16, 'rgba(238,214,255,.95)');
    grd.addColorStop(0.42, 'rgba(172,96,255,.45)');
    grd.addColorStop(1, 'rgba(70,0,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  function halo(size, color, opacity) {
    var s = new T.Sprite(new T.SpriteMaterial({
      map: glowTex, color: color === undefined ? 0xffffff : color,
      transparent: true, opacity: opacity === undefined ? 0.8 : opacity,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    s.scale.set(size, size, 1);
    return s;
  }

  function mats() {
    return {
      metal: new T.MeshPhysicalMaterial({
        color: 0x544a68, metalness: 0.82, roughness: 0.4,
        clearcoat: 0.55, clearcoatRoughness: 0.35, envMapIntensity: 1.15,
        emissive: 0x160b28, emissiveIntensity: 0.7
      }),
      dark: new T.MeshPhysicalMaterial({
        color: 0x473b60, metalness: 0.72, roughness: 0.5, envMapIntensity: 1.0,
        emissive: 0x1d0d38, emissiveIntensity: 1.0
      }),
      edge: new T.MeshStandardMaterial({
        color: 0xd3c1f2, metalness: 0.85, roughness: 0.2, envMapIntensity: 1.5,
        emissive: 0x2a1152, emissiveIntensity: 0.5
      }),
      wrap: new T.MeshStandardMaterial({ color: 0x3a2f4f, roughness: 0.95, metalness: 0.15, emissive: 0x1c1030, emissiveIntensity: 0.9 }),
      crystal: new T.MeshPhysicalMaterial({
        color: 0x8b34e6, emissive: 0xa64bff, emissiveIntensity: 1.6,
        metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1,
        flatShading: true, transparent: true, opacity: 0.96, envMapIntensity: 1.0
      }),
      core: new T.MeshBasicMaterial({ color: 0xe6ccff }),
      trim: new T.MeshStandardMaterial({
        color: 0xc79bff, emissive: 0x9b3bff, emissiveIntensity: 2.6, roughness: 0.3
      })
    };
  }

  function box(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }

  /* cylinder whose axis runs along -Z (the weapon's forward direction) */
  function tube(r1, r2, len, mat, seg) {
    var m = new T.Mesh(new T.CylinderGeometry(r1, r2, len, seg || 12), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function ring(r, t, mat) { return new T.Mesh(new T.TorusGeometry(r, t, 8, 26), mat); }

  function gem(r, mat, scale) {
    var m = new T.Mesh(new T.OctahedronGeometry(r, 0), mat);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    return m;
  }

  function shard(r, len, mat, sides) {
    var m = new T.Mesh(new T.ConeGeometry(r, len, sides || 4), mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  /* extruded flat blade: shape in XY, thickness along Z, tip toward -Z */
  function blade(build, thickness, mat) {
    var s = new T.Shape();
    build(s);
    var geo = new T.ExtrudeGeometry(s, {
      depth: thickness, bevelEnabled: true,
      bevelThickness: thickness * 0.45, bevelSize: thickness * 0.55,
      bevelSegments: 1, steps: 1
    });
    geo.translate(0, 0, -thickness * 0.5);
    var m = new T.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  /* rune strip along the spine of a weapon */
  function runes(g, mat, len, y, z, n) {
    for (var i = 0; i < n; i++) {
      var d = box(0.012, 0.008, 0.02, mat);
      d.position.set(0, y, z - (i + 0.5) * (len / n));
      g.add(d);
    }
  }

  /* --------------------------------------------------------------- reliquary
     short ornate hand-cannon: layered metal frame, gem chamber, crystal muzzle */
  function pistol(m) {
    var g = new T.Group();

    var grip = box(0.075, 0.21, 0.1, m.wrap);
    grip.position.set(0, -0.14, 0.07);
    grip.rotation.x = -0.26;
    g.add(grip);

    var frame = box(0.1, 0.085, 0.22, m.metal);
    frame.position.set(0, 0, 0.0);
    g.add(frame);

    var slide = box(0.088, 0.07, 0.3, m.dark);
    slide.position.set(0, 0.075, -0.08);
    g.add(slide);

    [-1, 1].forEach(function (s) {
      var wing = box(0.022, 0.13, 0.1, m.edge);
      wing.position.set(s * 0.058, 0.05, 0.01);
      wing.rotation.z = s * 0.22;
      g.add(wing);

      var claw = new T.Mesh(new T.ConeGeometry(0.026, 0.13, 4), m.metal);
      claw.rotation.x = -Math.PI / 2;
      claw.position.set(s * 0.075, -0.01, -0.24);
      g.add(claw);
    });

    var chamber = gem(0.062, m.crystal);
    chamber.position.set(0, 0.012, 0.062);
    g.add(chamber);
    var h = halo(0.24, 0xa964ff, 0.42);
    h.position.copy(chamber.position);
    g.add(h);

    var tip = shard(0.052, 0.26, m.crystal);
    tip.position.set(0, 0.045, -0.29);
    g.add(tip);
    var tipGlow = halo(0.2, 0xc79bff, 0.35);
    tipGlow.position.set(0, 0.045, -0.34);
    g.add(tipGlow);

    var sight = box(0.016, 0.03, 0.05, m.trim);
    sight.position.set(0, 0.118, -0.2);
    g.add(sight);

    return { group: g, muzzle: new T.Vector3(0, 0.045, -0.42), flash: 0.3, glows: [m.crystal] };
  }

  /* ------------------------------------------------------------------ spear
     long spine with a faceted crystal head, barbed collar, wrapped grip */
  function rifle(m) {
    var g = new T.Group();

    var spine = tube(0.036, 0.04, 0.86, m.metal, 10);
    spine.position.z = -0.16;
    g.add(spine);

    var inner = tube(0.012, 0.012, 0.9, m.trim, 6);
    inner.position.z = -0.16;
    g.add(inner);

    /* grip wraps */
    for (var i = 0; i < 7; i++) {
      var w = ring(0.036, 0.012, i % 2 ? m.wrap : m.dark);
      w.position.z = 0.19 - i * 0.045;
      g.add(w);
    }

    /* barbed collar behind the head */
    for (var b = 0; b < 4; b++) {
      var barb = shard(0.022, 0.19, m.edge, 3);
      var a = b * Math.PI / 2 + Math.PI / 4;
      barb.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.6);
      barb.rotation.z = a - Math.PI / 2;
      g.add(barb);
    }

    var socket = box(0.07, 0.07, 0.12, m.dark);
    socket.position.z = -0.64;
    g.add(socket);

    var head = gem(0.085, m.crystal, [0.62, 0.62, 2.1]);
    head.position.set(0, 0.005, -0.8);
    g.add(head);
    var headGlow = halo(0.26, 0xb56bff, 0.5);
    headGlow.position.set(0, 0.005, -0.78);
    g.add(headGlow);

    var fin = blade(function (s) {
      s.moveTo(0, 0);
      s.lineTo(0.06, 0.06);
      s.lineTo(0.03, 0.2);
      s.lineTo(0, 0.26);
      s.lineTo(-0.03, 0.2);
      s.lineTo(-0.06, 0.06);
      s.closePath();
    }, 0.02, m.edge);
    fin.position.set(0, 0.0, -0.9);
    g.add(fin);

    var butt = gem(0.06, m.crystal, [0.7, 0.7, 1.5]);
    butt.position.z = 0.3;
    g.add(butt);
    var buttGlow = halo(0.22, 0xb56bff, 0.5);
    buttGlow.position.z = 0.3;
    g.add(buttGlow);

    runes(g, m.trim, 0.34, 0.036, -0.02, 6);

    return { group: g, muzzle: new T.Vector3(0, 0.005, -1.02), flash: 0.32, glows: [m.crystal] };
  }

  /* ------------------------------------------------------------------- axe
     twin crescent blades around a gem core — close-range relic */
  function shotgun(m) {
    var g = new T.Group();

    var spine = tube(0.03, 0.034, 0.56, m.metal, 10);
    spine.position.z = -0.02;
    g.add(spine);

    for (var i = 0; i < 5; i++) {
      var w = ring(0.04, 0.013, m.wrap);
      w.position.z = 0.22 - i * 0.06;
      g.add(w);
    }

    var hub = new T.Mesh(new T.IcosahedronGeometry(0.075, 0), m.dark);
    hub.position.z = -0.34;
    g.add(hub);

    [-1, 1].forEach(function (s) {
      var crescent = blade(function (sh) {
        sh.moveTo(0, 0);
        sh.quadraticCurveTo(s * 0.26, 0.03, s * 0.3, 0.3);
        sh.quadraticCurveTo(s * 0.16, 0.2, 0, 0.235);
        sh.quadraticCurveTo(s * 0.13, 0.12, 0, 0.0);
      }, 0.026, m.crystal);
      crescent.position.set(s * 0.02, -0.1, -0.36);
      g.add(crescent);

      var h = halo(0.28, 0xa964ff, 0.45);
      h.position.set(s * 0.17, 0.02, -0.36);
      g.add(h);

      var prong = shard(0.024, 0.16, m.edge, 4);
      prong.position.set(s * 0.09, -0.02, -0.5);
      g.add(prong);
    });

    var core = gem(0.072, m.crystal, [1, 1, 1.2]);
    core.position.set(0, 0.01, -0.34);
    g.add(core);
    var coreGlow = halo(0.32, 0xc79bff, 0.5);
    coreGlow.position.copy(core.position);
    g.add(coreGlow);

    var trim = ring(0.1, 0.016, m.trim);
    trim.position.z = -0.3;
    g.add(trim);

    return { group: g, muzzle: new T.Vector3(0, 0.01, -0.6), flash: 0.4, glows: [m.crystal] };
  }

  /* ------------------------------------------------------------------ mace
     orb of crystal spikes — the plasma relic */
  function plasma(m) {
    var g = new T.Group();

    var spine = tube(0.036, 0.04, 0.6, m.dark, 10);
    spine.position.z = 0.12;
    g.add(spine);

    for (var i = 0; i < 4; i++) {
      var w = ring(0.036, 0.012, m.wrap);
      w.position.z = 0.34 - i * 0.06;
      g.add(w);
    }

    var collar = new T.Mesh(new T.CylinderGeometry(0.075, 0.055, 0.07, 10), m.metal);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = -0.2;
    g.add(collar);

    var orb = new T.Mesh(new T.IcosahedronGeometry(0.105, 0), m.crystal);
    orb.position.z = -0.34;
    g.add(orb);

    for (var k = 0; k < 12; k++) {
      var spike = new T.Mesh(new T.ConeGeometry(0.025, 0.15, 4), m.metal);
      var a = (k / 12) * Math.PI * 2;
      var el = (k % 3 - 1) * 0.6;
      var px = Math.cos(a) * Math.cos(el) * 0.1;
      var py = Math.sin(el) * 0.1;
      var pz = Math.sin(a) * Math.cos(el) * 0.1;
      spike.position.set(px, py, pz - 0.34);
      spike.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        new T.Vector3(px, py, pz).normalize()
      );
      g.add(spike);
    }

    var halo1 = halo(0.34, 0xb56bff, 0.55);
    halo1.position.z = -0.34;
    g.add(halo1);

    var eye = new T.Mesh(new T.SphereGeometry(0.045, 12, 10), m.core);
    eye.position.z = -0.34;
    g.add(eye);

    var ringA = ring(0.15, 0.012, m.trim);
    ringA.position.z = -0.34;
    ringA.rotation.x = Math.PI / 2;
    g.add(ringA);

    return { group: g, muzzle: new T.Vector3(0, 0, -0.5), flash: 0.38, glows: [m.crystal] };
  }

  var BUILDERS = { pistol: pistol, rifle: rifle, shotgun: shotgun, plasma: plasma };

  window.RELIC3D = {
    build: function (kind) {
      var m = mats();
      var fn = BUILDERS[kind] || pistol;
      var out = fn(m);
      out.group.traverse(function (o) {
        if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; }
      });
      return out;
    },
    glowTexture: glowTex
  };
})();
