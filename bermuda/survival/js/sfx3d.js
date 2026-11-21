/* BERMUDA SIEGE 3D — positional WebAudio synth (no audio files).
   Every effect is generated at runtime. Positional voices use a PannerNode so
   shots, growls and explosions come from the right side of the island. */
window.SFX3D = (function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, noiseBuf = null, ready = false, muted = false;
  var voices = 0, ambience = null;

  function init() {
    if (ready || !AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp);
    comp.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ---------------- helpers ---------------- */
  function panner(pos) {
    var p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 5;
    p.maxDistance = 240;
    p.rolloffFactor = 1.15;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else if (p.setPosition) {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(master);
    return p;
  }

  function voice(pos, fn) {
    if (!ready || muted || !ctx || ctx.state !== 'running') return;
    if (voices > 26) return;
    var out;
    if (pos) out = panner(pos);
    else { out = ctx.createGain(); out.gain.value = 1; out.connect(master); }
    voices++;
    var t = ctx.currentTime + 0.001;
    try { fn(out, t); } catch (e) {}
    setTimeout(function () {
      voices--;
      try { out.disconnect(); } catch (e) {}
    }, 2800);
  }

  function noise(out, t, dur, type, f0, f1, q, peak) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.03);
  }

  function tone(out, t, type, f0, f1, dur, peak) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.01, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ---------------- effect bank ---------------- */
  var FX = {
    pistol: function (o, t) {
      noise(o, t, 0.11, 'bandpass', 2100, 700, 0.9, 0.55);
      tone(o, t, 'square', 320, 90, 0.08, 0.18);
      tone(o, t, 'sine', 155, 60, 0.13, 0.34);
    },
    rifle: function (o, t) {
      noise(o, t, 0.07, 'highpass', 1600, 950, 0.7, 0.42);
      tone(o, t, 'sawtooth', 480, 150, 0.06, 0.16);
      tone(o, t, 'sine', 195, 70, 0.09, 0.22);
    },
    shotgun: function (o, t) {
      noise(o, t, 0.32, 'lowpass', 1800, 250, 0.8, 0.8);
      noise(o, t, 0.1, 'highpass', 2700, 1500, 0.6, 0.3);
      tone(o, t, 'sine', 135, 38, 0.3, 0.5);
      noise(o, t + 0.26, 0.07, 'bandpass', 1800, 1500, 3, 0.18);
      noise(o, t + 0.36, 0.06, 'bandpass', 2400, 2100, 3, 0.15);
    },
    plasma: function (o, t) {
      tone(o, t, 'sine', 1450, 240, 0.22, 0.28);
      tone(o, t, 'sawtooth', 700, 160, 0.15, 0.1);
      tone(o, t + 0.02, 'sine', 2800, 2200, 0.12, 0.08);
      noise(o, t, 0.16, 'highpass', 1900, 1100, 1.2, 0.13);
    },
    eShot: function (o, t) {
      tone(o, t, 'sawtooth', 820, 190, 0.24, 0.15);
      tone(o, t, 'sine', 300, 110, 0.2, 0.1);
      noise(o, t, 0.1, 'bandpass', 1500, 600, 1.6, 0.11);
    },
    hit: function (o, t) {
      noise(o, t, 0.05, 'bandpass', 2800, 2100, 2, 0.26);
      tone(o, t, 'square', 520, 320, 0.04, 0.06);
    },
    headshot: function (o, t) {
      noise(o, t, 0.06, 'bandpass', 3400, 2400, 3, 0.3);
      tone(o, t, 'triangle', 1480, 2100, 0.1, 0.16);
      tone(o, t + 0.03, 'sine', 920, 640, 0.14, 0.1);
    },
    hurt: function (o, t) {
      tone(o, t, 'sine', 180, 62, 0.24, 0.36);
      noise(o, t, 0.18, 'lowpass', 700, 200, 1, 0.24);
    },
    kill: function (o, t) {
      noise(o, t, 0.3, 'lowpass', 1100, 220, 0.9, 0.4);
      tone(o, t, 'sawtooth', 260, 60, 0.26, 0.13);
    },
    explode: function (o, t) {
      noise(o, t, 0.9, 'lowpass', 1500, 90, 0.9, 0.85);
      noise(o, t, 0.12, 'highpass', 3000, 1700, 0.6, 0.24);
      tone(o, t, 'sine', 84, 30, 0.7, 0.55);
    },
    reload: function (o, t) {
      noise(o, t, 0.05, 'bandpass', 1500, 1200, 4, 0.2);
      noise(o, t + 0.3, 0.06, 'bandpass', 2100, 1700, 4, 0.22);
      tone(o, t + 0.3, 'square', 240, 180, 0.05, 0.06);
    },
    equip: function (o, t) {
      noise(o, t, 0.05, 'bandpass', 2600, 2000, 3, 0.17);
      tone(o, t, 'triangle', 620, 900, 0.07, 0.07);
    },
    empty: function (o, t) {
      noise(o, t, 0.03, 'highpass', 3200, 2600, 4, 0.2);
    },
    pickup: function (o, t) {
      [520, 700, 940].forEach(function (f, i) {
        tone(o, t + i * 0.07, 'triangle', f, f * 1.02, 0.14, 0.13);
      });
    },
    med: function (o, t) {
      tone(o, t, 'triangle', 460, 780, 0.2, 0.14);
    },
    growl: function (o, t) {
      tone(o, t, 'sawtooth', 120, 62, 0.36, 0.13);
      noise(o, t, 0.34, 'lowpass', 700, 180, 1.4, 0.16);
    },
    wave: function (o, t) {
      tone(o, t, 'sawtooth', 92, 70, 0.9, 0.18);
      tone(o, t, 'sine', 46, 38, 1.1, 0.2);
      noise(o, t, 0.9, 'lowpass', 420, 160, 0.8, 0.12);
    },
    step: function (o, t) {
      noise(o, t, 0.06, 'lowpass', 900, 400, 1.2, 0.08);
      tone(o, t, 'sine', 90, 60, 0.06, 0.05);
    },
    /* boots on three different grounds. Each variant is a different grain:
       dry sand crunches, rock clicks, wet planks squelch. */
    foot: function (o, t, surface) {
      var s = surface || 'sand';
      var v = Math.random();
      if (s === 'wood') {
        noise(o, t, 0.07, 'lowpass', v < 0.5 ? 1100 : 820, 260, 1.1, 0.1);
        tone(o, t, 'sine', v < 0.5 ? 128 : 104, 62, 0.09, 0.07);
        noise(o, t + 0.02, 0.03, 'bandpass', 2600, 1800, 3, 0.035);
      } else if (s === 'stone') {
        noise(o, t, 0.045, 'bandpass', v < 0.5 ? 2200 : 1700, 900, 2.2, 0.085);
        noise(o, t, 0.02, 'highpass', 4200, 3200, 2, 0.05);
        tone(o, t, 'triangle', 320, 170, 0.035, 0.03);
      } else {
        noise(o, t, 0.09, 'bandpass', v < 0.5 ? 1500 : 1150, 420, 0.9, 0.075);
        noise(o, t + 0.012, 0.06, 'lowpass', 700, 240, 0.8, 0.05);
      }
    },
    /* a blade turned aside: a short bell that dies fast, no pitch sweep */
    parry: function (o, t) {
      tone(o, t, 'triangle', 2480, 2320, 0.5, 0.055);
      tone(o, t + 0.004, 'sine', 3720, 3600, 0.34, 0.035);
      tone(o, t + 0.002, 'sine', 1180, 1100, 0.42, 0.03);
      noise(o, t, 0.05, 'highpass', 5200, 3400, 2, 0.16);
    },
    /* winded, hurt: an inhale that catches, then a short exhale */
    breath: function (o, t) {
      noise(o, t, 0.34, 'bandpass', 620, 340, 1.6, 0.09);
      noise(o, t + 0.06, 0.18, 'bandpass', 1500, 900, 2.4, 0.05);
      noise(o, t + 0.42, 0.4, 'bandpass', 420, 260, 1.2, 0.075);
      tone(o, t + 0.44, 'sine', 118, 96, 0.3, 0.035);
    },
    victory: function (o, t) {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone(o, t + i * 0.14, 'triangle', f, f, 0.55, 0.14);
      });
    },
    death: function (o, t) {
      tone(o, t, 'sawtooth', 320, 40, 1.1, 0.24);
      noise(o, t, 0.9, 'lowpass', 900, 120, 0.9, 0.36);
    },
    scan: function (o, t) {
      [1560, 1040, 690].forEach(function (f, i) {
        tone(o, t + i * 0.1, 'sine', f, f * 0.62, 0.3, 0.11);
      });
      noise(o, t, 0.55, 'highpass', 3400, 1200, 2, 0.055);
    },
    click: function (o, t) { noise(o, t, 0.03, 'bandpass', 2400, 2200, 3, 0.12); },
    /* steel through air: a short band-passed whoosh, no tonal pitch */
    swing: function (o, t) {
      noise(o, t, 0.17, 'bandpass', 1100, 260, 1.6, 0.24);
      noise(o, t + 0.03, 0.09, 'highpass', 3400, 1500, 1.2, 0.09);
    },
    /* the same air, but a whole body behind it: slower, lower, longer */
    swingBig: function (o, t) {
      noise(o, t, 0.28, 'bandpass', 760, 170, 1.1, 0.34);
      noise(o, t + 0.02, 0.14, 'highpass', 3000, 1100, 1, 0.13);
      tone(o, t, 'sine', 118, 58, 0.24, 0.15);
    },
  };

  /* ---------------- ambient bed ---------------- */
  function startAmbient() {
    init();
    if (!ready || ambience) return;
    try {
      var bed = ctx.createBufferSource();
      bed.buffer = noiseBuf;
      bed.loop = true;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      lp.Q.value = 0.6;
      var g = ctx.createGain();
      g.gain.value = 0.0001;
      bed.connect(lp); lp.connect(g); g.connect(master);
      bed.start();
      g.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 3);

      var droneGain = ctx.createGain();
      droneGain.gain.value = 0.0001;
      droneGain.connect(master);
      var droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 320;
      droneFilter.connect(droneGain);
      var oscs = [55, 82.5].map(function (f) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        var og = ctx.createGain();
        og.gain.value = 0.2;
        o.connect(og); og.connect(droneFilter);
        o.start();
        return o;
      });
      droneGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);

      /* a threat layer: the bed tightens as aliens wake up around you */
      var threatGain = ctx.createGain();
      threatGain.gain.value = 0.0001;
      threatGain.connect(master);
      var tFilter = ctx.createBiquadFilter();
      tFilter.type = 'lowpass';
      tFilter.frequency.value = 760;
      tFilter.Q.value = 4;
      tFilter.connect(threatGain);
      var tOsc = ctx.createOscillator();
      tOsc.type = 'sawtooth';
      tOsc.frequency.value = 41.2;
      var tOscGain = ctx.createGain();
      tOscGain.gain.value = 0.55;
      tOsc.connect(tOscGain);
      tOscGain.connect(tFilter);
      tOsc.start();

      /* wind: band-passed noise with a filter that wanders, so the gust has
         a shape instead of a hiss */
      var wind = ctx.createBufferSource();
      wind.buffer = noiseBuf; wind.loop = true; wind.playbackRate.value = 0.8;
      var wbp = ctx.createBiquadFilter();
      wbp.type = 'bandpass'; wbp.frequency.value = 430; wbp.Q.value = 0.75;
      var wg = ctx.createGain(); wg.gain.value = 0.0001;
      wind.connect(wbp); wbp.connect(wg); wg.connect(master); wind.start();
      wg.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 5);
      var wLfo = ctx.createOscillator();
      wLfo.frequency.value = 0.063;
      var wLfoGain = ctx.createGain(); wLfoGain.gain.value = 240;
      wLfo.connect(wLfoGain); wLfoGain.connect(wbp.frequency); wLfo.start();

      /* surf: very low noise, gain swung by a slow swell */
      var surf = ctx.createBufferSource();
      surf.buffer = noiseBuf; surf.loop = true; surf.playbackRate.value = 0.55;
      var slp = ctx.createBiquadFilter();
      slp.type = 'lowpass'; slp.frequency.value = 520; slp.Q.value = 0.5;
      var sg = ctx.createGain(); sg.gain.value = 0.0001;
      surf.connect(slp); slp.connect(sg); sg.connect(master); surf.start();
      sg.gain.linearRampToValueAtTime(0.026, ctx.currentTime + 4);
      var swell = ctx.createOscillator();
      swell.frequency.value = 0.093;
      var swellGain = ctx.createGain(); swellGain.gain.value = 0.017;
      swell.connect(swellGain); swellGain.connect(sg.gain); swell.start();

      /* a camp's murmur: voices too far away to make out, pulsing */
      var mur = ctx.createBufferSource();
      mur.buffer = noiseBuf; mur.loop = true; mur.playbackRate.value = 1.4;
      var mbp = ctx.createBiquadFilter();
      mbp.type = 'bandpass'; mbp.frequency.value = 760; mbp.Q.value = 1.1;
      var mg = ctx.createGain(); mg.gain.value = 0.0001;
      mur.connect(mbp); mbp.connect(mg); mg.connect(master); mur.start();
      var mAm = ctx.createOscillator();
      mAm.frequency.value = 4.1;
      var mAmGain = ctx.createGain(); mAmGain.gain.value = 0.014;
      mAm.connect(mAmGain); mAmGain.connect(mg.gain); mAm.start();

      ambience = {
        bed: bed, gain: g, droneGain: droneGain, oscs: oscs,
        threatGain: threatGain, threatOsc: tOsc,
        windGain: wg, surfGain: sg, murGain: mg, swallow: sg
      };
    } catch (e) {}
  }

  /* ---------------- public ---------------- */
  return {
    init: init,
    unlock: unlock,
    ambient: startAmbient,
    /* 0 = open shoreline, 1 = standing in the middle of a camp */
    camp: function (v) {
      if (!ready || !ambience || !ambience.murGain) return;
      try {
        ambience.murGain.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1, v || 0)) * 0.05, ctx.currentTime, 0.6);
      } catch (e) {}
    },
    /* the ocean and the wind answer the weather and the time of day */
    weather: function (wind, surf) {
      if (!ready || !ambience) return;
      try {
        if (ambience.windGain) ambience.windGain.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1.5, wind)) * 0.03, ctx.currentTime, 1.2);
        if (ambience.surfGain) ambience.surfGain.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1.5, surf)) * 0.03, ctx.currentTime, 1.6);
      } catch (e) {}
    },
    /* 0 = calm island, 1 = a whole camp on your heels */
    threat: function (v) {
      if (!ready || !ambience || !ambience.threatGain) return;
      var k = Math.max(0, Math.min(1, v || 0));
      try {
        ambience.threatGain.gain.setTargetAtTime(0.0001 + k * 0.085, ctx.currentTime, 0.7);
        if (ambience.threatOsc) ambience.threatOsc.frequency.setTargetAtTime(41.2 + k * 14, ctx.currentTime, 0.9);
      } catch (e) {}
    },
    isMuted: function () { return muted; },
    /* used by the test harness: proves the ambient graph really exists */
    debug: function () {
      return {
        ready: ready, state: ctx ? ctx.state : null,
        layers: ambience ? Object.keys(ambience) : [],
        wind: ambience && ambience.windGain ? +ambience.windGain.gain.value.toFixed(4) : null,
        surf: ambience && ambience.surfGain ? +ambience.surfGain.gain.value.toFixed(4) : null,
        murmur: ambience && ambience.murGain ? +ambience.murGain.gain.value.toFixed(4) : null
      };
    },
    toggle: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    listener: function (camera) {
      if (!ready || !ctx) return;
      var l = ctx.listener;
      if (!l) return;
      var p = camera.position;
      var f = new window.THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      var u = new window.THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
        l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
      } else if (l.setPosition) {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      }
    },
    play: function (kind, pos, variant) {
      init();
      var fn = FX[kind];
      if (!fn) return;
      voice(pos || null, function (o, t) { fn(o, t, variant); });
    }
  };
})();
