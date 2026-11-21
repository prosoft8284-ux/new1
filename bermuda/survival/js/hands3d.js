/* BERMUDA SIEGE 3D — first-person gloved hands.
   Every weapon gets a pair of arms holding it: right hand on the grip, left
   hand on the foregrip, forearms running off the bottom of the screen. The
   hands are parented to the view-model so they follow sway and recoil, and are
   counter-scaled so they stay life-sized while the weapon stays small. */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) return;

  var gloveMat = new T.MeshStandardMaterial({ color: 0x0e0d12, roughness: 0.98, metalness: 0.0, envMapIntensity: 0.15 });
  var plateMat = new T.MeshStandardMaterial({ color: 0x18141f, roughness: 0.8, metalness: 0.15, envMapIntensity: 0.2 });
  var trimMat = new T.MeshStandardMaterial({ color: 0x1b1630, emissive: 0x4a2ab0, emissiveIntensity: 0.14, roughness: 0.7 });
  var sleeveMat = new T.MeshStandardMaterial({ color: 0x0c1018, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.1 });

  function box(w, h, d, mat) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    return m;
  }
  function tube(r1, r2, len, mat, seg) {
    return new T.Mesh(new T.CylinderGeometry(r1, r2, len, seg || 8), mat);
  }

  /* one gloved hand: palm, four wrapped fingers, thumb, wrist cuff */
  function hand(mirror) {
    var g = new T.Group();
    var s = mirror ? -1 : 1;

    var palm = box(0.05, 0.068, 0.05, gloveMat);
    palm.rotation.z = -0.12 * s;
    g.add(palm);

    var back = box(0.042, 0.042, 0.018, plateMat);
    back.position.set(0, 0.006, 0.036);
    g.add(back);

    var trim = box(0.044, 0.009, 0.011, trimMat);
    trim.position.set(0, 0.03, 0.04);
    g.add(trim);

    for (var i = 0; i < 4; i++) {
      var f = new T.Group();
      var seg1 = tube(0.008, 0.0072, 0.03, gloveMat, 6);
      seg1.rotation.x = Math.PI / 2;
      seg1.position.z = 0.018;
      var seg2 = tube(0.0072, 0.0064, 0.026, gloveMat, 6);
      seg2.rotation.x = Math.PI / 2 + 0.55;
      seg2.position.set(0, -0.014, 0.048);
      f.add(seg1, seg2);
      f.position.set((i - 1.5) * 0.014, 0.018, -0.022);
      f.rotation.x = -0.12;
      g.add(f);
    }

    var thumb = tube(0.0095, 0.008, 0.036, gloveMat, 6);
    thumb.rotation.z = Math.PI / 2 * 0.8 * s;
    thumb.rotation.y = 0.5 * s;
    thumb.position.set(-0.027 * s, -0.012, 0.005);
    g.add(thumb);

    var wrist = tube(0.027, 0.03, 0.026, plateMat, 8);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, -0.008, 0.048);
    g.add(wrist);

    return g;
  }

  /* forearm + sleeve, pointing away from the wrist toward the screen edge */
  function arm(mirror) {
    var g = new T.Group();
    var fore = tube(0.023, 0.031, 0.15, sleeveMat, 8);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = 0.09;
    g.add(fore);

    var cuff = tube(0.028, 0.028, 0.03, plateMat, 8);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.012;
    g.add(cuff);

    var band = tube(0.03, 0.03, 0.01, trimMat, 8);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.055;
    g.add(band);

    if (mirror) g.scale.x = -1;
    return g;
  }

  /* hand anchors in view-model space (same units the weapon is modelled in) */
  var GRIPS = {
    pistol: { r: [-0.05, -0.09, 0.05], l: [-0.09, -0.07, -0.02] },
    rifle: { r: [-0.05, -0.10, 0.07], l: [-0.09, -0.06, -0.10] },
    shotgun: { r: [-0.05, -0.10, 0.06], l: [-0.09, -0.06, -0.13] },
    plasma: { r: [-0.02, -0.13, 0.07], l: [-0.06, -0.09, -0.13] }
  };

  window.HANDS3D = {
    build: function (kind) {
      var grip = GRIPS[kind] || GRIPS.rifle;
      var g = new T.Group();
      g.matrixAutoUpdate = true;

      var right = new T.Group();
      right.add(hand(false));
      var rArm = arm(false);
      rArm.rotation.set(0.5, -0.45, 0);
      rArm.position.set(0.03, -0.05, 0.04);
      right.add(rArm);
      right.position.set(grip.r[0], grip.r[1], grip.r[2]);
      right.rotation.set(0.3, 0.18, 0.2);

      var left = new T.Group();
      left.add(hand(true));
      var lArm = arm(true);
      lArm.rotation.set(0.52, 0.5, 0);
      lArm.position.set(-0.03, -0.05, 0.04);
      left.add(lArm);
      left.position.set(grip.l[0], grip.l[1], grip.l[2]);
      left.rotation.set(0.12, -0.22, -0.3);

      g.add(right, left);
      left.userData.baseY = left.position.y;
      left.userData.baseZ = left.position.z;
      g.userData.handL = left;
      g.userData.handR = right;
      g.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.frustumCulled = false;
        }
      });
      return g;
    }
  };
})();
