/* BERMUDA SIEGE 3D — real rigged character models.
   Wraps GLB assets (armoured trooper, alien hound, combat mech) in a tiny
   factory: one template per source file, then a skinned clone per enemy with
   its own tinted material set and animation mixer.

   Loading goes through XMLHttpRequest + GLTFLoader.parse instead of a fetch,
   so the same code works from an http server and from file:/// inside the
   Android WebView. */
(function () {
  'use strict';

  var T = window.THREE;
  if (!T) return;

  var SOURCES = {
    vanguard: 'models/vanguard.glb',
    mech: 'models/mech.glb'
  };

  /* breed -> which rig, how tall it should be in metres, facing correction,
     and the palette that turns a stock model into this island's fauna */
  var BREEDS = {
    warrior: { src: 'vanguard', h: 2.10, yaw: Math.PI, tint: 0xb6c4e0, glow: 0x2a4a7a, metal: 0.62, rough: 0.46, emis: 0.20 },
    neural: { src: 'vanguard', h: 1.92, yaw: Math.PI, tint: 0x8fe0ff, glow: 0x1d6a92, metal: 0.6, rough: 0.5, emis: 0.22 },
    brute: { src: 'mech', h: 2.75, yaw: 0, tint: 0xb78cff, glow: 0x46228a, metal: 0.68, rough: 0.42, emis: 0.26 },
    mother: { src: 'mech', h: 4.30, yaw: 0, tint: 0xffa2e6, glow: 0x8a1a6a, metal: 0.6, rough: 0.44, emis: 0.30 },
    runner: { src: 'mech', h: 1.58, yaw: 0, tint: 0x77cf74, glow: 0x2f7a2a, metal: 0.5, rough: 0.5, emis: 0.22 },
    skitter: { src: 'mech', h: 1.14, yaw: 0, tint: 0xb98cff, glow: 0x5a2a9a, metal: 0.55, rough: 0.46, emis: 0.26 },
    bomber: { src: 'mech', h: 1.46, yaw: 0, tint: 0xffab52, glow: 0x8a4a10, metal: 0.45, rough: 0.52, emis: 0.3 }
  };

  var templates = {};
  var keys = Object.keys(SOURCES);
  var total = keys.length, loaded = 0, failed = 0, started = false, doneCb = null;

  function pickClip(anims, re) {
    for (var i = 0; i < anims.length; i++) if (re.test(anims[i].name || '')) return anims[i];
    return null;
  }

  function normalizeScene(scene) {
    scene.updateMatrixWorld(true);
    var box = new T.Box3().setFromObject(scene);
    var size = box.getSize(new T.Vector3());
    var s = 1 / (size.y || 1);
    scene.scale.setScalar(s);
    scene.position.y = -box.min.y * s;
    var cx = (box.min.x + box.max.x) * 0.5 * s;
    var cz = (box.min.z + box.max.z) * 0.5 * s;
    scene.position.x = -cx;
    scene.position.z = -cz;
  }

  /* the hound's own texture is warm orange fur; flattening it first lets the
     per-breed tint actually read as an alien hide instead of muddy brown */
  function desaturate(m) {
    if (!m.map || !m.map.image || !m.map.image.width) return;
    var img = m.map.image;
    var cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, cv.width, cv.height);
    var px = d.data;
    for (var i = 0; i < px.length; i += 4) {
      var l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      /* keep a little warmth so the hide still has depth */
      px[i] = l * 1.04;
      px[i + 1] = l;
      px[i + 2] = l * 1.04;
    }
    ctx.putImageData(d, 0, 0);
    var tex = new T.CanvasTexture(cv);
    tex.wrapS = m.map.wrapS;
    tex.wrapT = m.map.wrapT;
    tex.flipY = m.map.flipY;
    tex.anisotropy = 4;
    if (T.sRGBEncoding !== undefined) tex.encoding = T.sRGBEncoding;
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    m.map = tex;
    m.needsUpdate = true;
  }

  function prepare(gltf, key) {
    var scene = gltf.scene;
    normalizeScene(scene);
    scene.traverse(function (o) {
      if (key === 'hound' && (o.isMesh || o.isSkinnedMesh)) {
        var list0 = Array.isArray(o.material) ? o.material : [o.material];
        for (var j = 0; j < list0.length; j++) if (list0[j]) desaturate(list0[j]);
      }
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) continue;
        m.envMapIntensity = 0.9;
        /* the GLB rigs are shared by every clone; geometry stays shared */
        o.geometry.userDataShared = true;
        m.userDataShared = true;
      }
    });

    var anims = gltf.animations || [];
    return {
      scene: scene,
      clips: {
        idle: pickClip(anims, /idle|survey|sitting|standing|pose/i) || anims[0] || null,
        /* "Walking" before "WalkJump", "Running" before any other run clip */
        walk: pickClip(anims, /^walk(ing)?$/i) || pickClip(anims, /walk/i) || null,
        run: pickClip(anims, /^run(ning)?$/i) || pickClip(anims, /run|sprint|gallop/i) || null,
        /* the mech's melee clip is Punch, not Jump: order the match by intent */
        attack: pickClip(anims, /punch|attack|bite|kick|slash|swing/i) || null,
        death: pickClip(anims, /death|die|fall/i) || null
      }
    };
  }

  function xhr(url, onOk, onErr) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.responseType = 'arraybuffer';
    req.onload = function () {
      if (req.status === 200 || req.status === 0) {
        if (req.response && req.response.byteLength) onOk(req.response);
        else onErr('empty');
      } else onErr('http ' + req.status);
    };
    req.onerror = function () { onErr('network'); };
    try { req.send(); } catch (e) { onErr(String(e)); }
  }

  function finish() {
    if (!started) return;
    if (loaded + failed < total) return;
    if (doneCb) { var cb = doneCb; doneCb = null; cb(loaded, failed); }
  }

  function load(key) {
    var loader = new T.GLTFLoader();
    xhr(SOURCES[key], function (buf) {
      try {
        loader.parse(buf, '', function (gltf) {
          try { templates[key] = prepare(gltf, key); } catch (e) { failed++; }
          loaded++;
          finish();
        }, function () { failed++; finish(); });
      } catch (e) { failed++; finish(); }
    }, function () { failed++; finish(); });
  }

  function cloneSkinned(src) {
    if (T.SkeletonUtils && T.SkeletonUtils.clone) return T.SkeletonUtils.clone(src);
    return src.clone(true);
  }

  function tint(m, cfg) {
    var c = m.clone();
    if (c.color) {
      /* textured assets keep their detail through a multiply; untextured
         rigs are recoloured outright so they do not read as dark mud */
      if (c.map) c.color.multiply(new T.Color(cfg.tint));
      else c.color.set(cfg.tint).multiplyScalar(1.15);
    }
    if (c.emissive) {
      c.emissive.setHex(cfg.glow);
      c.emissiveIntensity = cfg.emis;
    }
    if ('metalness' in c) c.metalness = Math.max(c.metalness || 0, cfg.metal);
    if ('roughness' in c) c.roughness = Math.min(c.roughness || 1, cfg.rough);
    c.userDataShared = false;
    return c;
  }

  /* bone lookup that works for both rigs: Mixamo (vanguard) and the
     robot armature (mech). Everything is optional - a missing bone just
     means that limb of the overlay is skipped. */
  function findBones(body) {
    var bones = {};
    /* the mech's bones arrive sanitised ("UpperArm.R" -> "UpperArmR", and
       duplicate "Head" nodes become "Head_1"), so the dots and suffixes are
       optional on every pattern */
    var want = {
      hips: /hips$/i,
      spine: /spine2$|torso(_\d+)?$/i,
      torso: /torso(_\d+)?$|abdomen$/i,
      head: /^head(_\d+)?$/i,
      armR: /rightarm$|upperarm\.?r$/i,
      foreR: /rightforearm$|lowerarm\.?r$/i,
      handR: /righthand$|^hand\.?r$|^palm2\.?r$/i,
      armL: /leftarm$|upperarm\.?l$/i,
      foreL: /leftforearm$|lowerarm\.?l$/i,
      handL: /lefthand$|^hand\.?l$|^palm2\.?l$/i,
      thighR: /rightupleg$|upperleg\.?r$/i,
      shinR: /rightleg$|lowerleg\.?r$/i,
      thighL: /leftupleg$|upperleg\.?l$/i,
      shinL: /leftleg$|lowerleg\.?l$/i
    };
    body.traverse(function (o) {
      if (!o.isBone) return;
      var n = o.name || '';
      for (var key in want) if (!bones[key] && want[key].test(n)) bones[key] = o;
    });
    if (!bones.spine) bones.spine = bones.torso;
    if (!bones.torso) bones.torso = bones.spine;
    return bones;
  }

  /* post-mixer overlay: multiply a small local rotation on top of whatever
     the clip just wrote, which is how a walk cycle gets a punch, a flinch or
     a death topple without authoring a new clip */
  var tmpE = new T.Euler();
  var tmpQ = new T.Quaternion();
  function addRot(bone, x, y, z) {
    if (!bone) return;
    tmpE.set(x || 0, y || 0, z || 0);
    tmpQ.setFromEuler(tmpE);
    bone.quaternion.multiply(tmpQ);
  }

  function build(cfg) {
    var tpl = templates[cfg.src];
    if (!tpl) return null;

    var root = new T.Group();
    var facing = new T.Group();
    facing.rotation.y = cfg.yaw;
    root.add(facing);

    var body = cloneSkinned(tpl.scene);
    /* the template is already normalised to one metre tall — scale a holder
       instead of overwriting the template's own scale */
    var holder = new T.Group();
    holder.scale.setScalar(cfg.h);
    holder.add(body);
    facing.add(holder);

    var mats = [];
    body.traverse(function (o) {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      var src = Array.isArray(o.material) ? o.material : [o.material];
      var out = [];
      for (var i = 0; i < src.length; i++) {
        var t = tint(src[i], cfg);
        out.push(t);
        mats.push(t);
      }
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = cfg.h > 1.2;
      o.receiveShadow = false;
    });

    var mixer = new T.AnimationMixer(body);
    var actions = {};
    var names = ['idle', 'walk', 'run', 'attack', 'death'];
    for (var k = 0; k < names.length; k++) {
      var clip = tpl.clips[names[k]];
      if (!clip) continue;
      var act = mixer.clipAction(clip);
      act.enabled = true;
      if (names[k] === 'attack' || names[k] === 'death') {
        act.setLoop(T.LoopOnce, 1);
        act.clampWhenFinished = true;
      }
      actions[names[k]] = act;
    }

    var bones = findBones(body);
    var hasDeathClip = !!actions.death;
    var extra = { wind: -1, attack: -1, hit: -1, die: -1, lean: 0 };
    var lock = 0;   /* seconds during which a one-shot clip owns the body */

    var cur = null;
    function setState(name, fade) {
      if (name === cur) return;
      /* a punch or a death must not be cut off by the next walk frame */
      if (lock > 0 && name !== 'attack' && name !== 'death') return;
      var next = actions[name] || actions.idle;
      if (!next) return;
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(fade === undefined ? 0.16 : fade).play();
      if (cur && actions[cur]) actions[cur].fadeOut(fade === undefined ? 0.16 : fade);
      cur = name;
    }
    if (actions.idle) { actions.idle.play(); cur = 'idle'; }
    else if (actions.walk) { actions.walk.play(); cur = 'walk'; }

    var api = {
      root: root,
      body: facing,
      mats: mats,
      height: cfg.h,
      clips: tpl.clips,
      bones: bones,
      has: function (n) { return !!actions[n]; },
      setState: setState,
      /* raises the weapon arm before a strike, so the blow is telegraphed */
      wind: function () { extra.wind = 0; },
      attack: function () {
        extra.attack = 0;
        if (!actions.attack) { lock = Math.max(lock, 0.42); return; }
        actions.attack.reset();
        actions.attack.setEffectiveWeight(1);
        actions.attack.fadeIn(0.08).play();
        if (cur && actions[cur] && cur !== 'attack') actions[cur].fadeOut(0.1);
        cur = 'attack';
        lock = Math.max(lock, 0.55);
      },
      flinch: function () { extra.hit = 0; },
      die: function () {
        extra.die = 0;
        if (actions.death) {
          actions.death.reset();
          actions.death.setEffectiveWeight(1);
          actions.death.fadeIn(0.1).play();
          if (cur && actions[cur]) actions[cur].fadeOut(0.12);
          cur = 'death';
        }
        lock = 999;
      },
      lean: function (v) { extra.lean = v; },
      /* local-space position of the weapon hand, for a held blade */
      handPos: function (out) {
        var hand = bones.handR || bones.foreR || bones.armR;
        if (!hand) return null;
        root.updateWorldMatrix(true, false);
        hand.getWorldPosition(out);
        root.worldToLocal(out);
        return out;
      },
      tick: function (dt) {
        if (lock > 0 && lock < 900) lock -= dt;
        mixer.update(dt);
        var b = bones;
        if (extra.lean) addRot(b.spine, 0, 0, -extra.lean * 0.16);
        if (extra.wind >= 0) {
          extra.wind += dt;
          var w = Math.min(1, extra.wind / 0.45);
          addRot(b.armR, -1.45 * w, 0.3 * w, 0);
          addRot(b.foreR, -1.05 * w, 0, 0);
          addRot(b.spine, -0.16 * w, 0.22 * w, 0);
          if (extra.wind > 0.5) extra.wind = -1;
        }
        if (extra.attack >= 0) {
          extra.attack += dt;
          var a = Math.min(1, extra.attack / 0.42);
          var s = Math.sin(a * Math.PI);
          addRot(b.armR, 1.6 * s - 0.2 * a, -0.55 * s, 0);
          addRot(b.foreR, 0.85 * s, 0, 0);
          addRot(b.spine, 0.24 * s, -0.28 * s, 0);
          if (a >= 1) extra.attack = -1;
        }
        if (extra.hit >= 0) {
          extra.hit += dt;
          var f = Math.max(0, 1 - extra.hit / 0.32);
          addRot(b.spine, -0.42 * f, 0, 0.24 * f);
          addRot(b.head, -0.3 * f, 0, 0);
          addRot(b.armL, 0.5 * f, 0, 0);
          if (extra.hit > 0.32) extra.hit = -1;
        }
        /* rigs without a death clip topple over instead of fading out */
        if (extra.die >= 0) {
          extra.die += dt;
          if (!hasDeathClip) {
            var d = Math.min(1, extra.die / 0.85);
            var e = 1 - Math.pow(1 - d, 3);
            facing.rotation.z = -e * 1.32;
            facing.position.y = -e * 0.18;
            addRot(b.spine, 0.5 * e, 0, 0);
            addRot(b.head, 0.35 * e, 0, 0);
          }
        }
      },
      speed: function (v) {
        if (actions.walk) actions.walk.setEffectiveTimeScale(Math.min(2.1, Math.max(0.55, v / 1.35)));
        if (actions.run) actions.run.setEffectiveTimeScale(Math.min(2.2, Math.max(0.6, v / 3.6)));
      },
      dispose: function () {
        for (var i = 0; i < mats.length; i++) if (mats[i].dispose) mats[i].dispose();
        mixer.stopAllAction();
        mixer.uncacheRoot(body);
      }
    };
    return api;
  }

  window.MODELS3D = {
    start: function (cb) {
      if (started) { if (loaded + failed >= total && cb) cb(loaded, failed); return; }
      started = true;
      doneCb = cb || null;
      for (var i = 0; i < keys.length; i++) load(keys[i]);
      if (total === 0) finish();
    },
    progress: function () { return total ? (loaded + failed) / total : 1; },
    count: function () { return loaded; },
    failed: function () { return failed; },
    ready: function (kind) {
      var cfg = BREEDS[kind];
      return !!(cfg && templates[cfg.src]);
    },
    breeds: BREEDS,
    view: function (kind) {
      var cfg = BREEDS[kind];
      if (!cfg || !templates[cfg.src]) return null;
      try { return build(cfg); } catch (e) { return null; }
    }
  };
})();
