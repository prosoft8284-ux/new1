/* BERMUDA SURVIVAL — synthesized sound effects (no audio files) */
window.SFX = (function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, noiseBuf = null;
  var ready = false, muted = !!(window.SAVE && window.SAVE.get('muted', false));
  var lx = 0, ly = 0, voices = 0;

  function init() {
    if (ready || !AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 18; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.75;
    master.connect(comp); comp.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function spatial(x, y) {
    if (x === undefined || x === null) return { pan: 0, gain: 1 };
    var dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy);
    var g = Math.max(0, Math.min(1, 1 - d / 950));
    return { pan: Math.max(-0.85, Math.min(0.85, dx / 640)), gain: 0.06 + g * g * 0.94 };
  }

  function voice(x, y, fn) {
    if (!ready || muted || !ctx || ctx.state !== 'running') return;
    if (voices > 24) return;
    var sp = spatial(x, y);
    if (sp.gain < 0.04) return;
    var out = ctx.createGain(); out.gain.value = sp.gain;
    var pan = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
      out.connect(pan); pan.connect(master);
    } else out.connect(master);
    voices++;
    fn(out, ctx.currentTime + 0.001);
    setTimeout(function () {
      voices--;
      try { out.disconnect(); if (pan) pan.disconnect(); } catch (e) {}
    }, 2400);
  }

  function noise(out, t, dur, type, f0, f1, q, peak) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.03);
  }

  function tone(out, t, type, f0, f1, dur, peak) {
    var o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var SHOT = {
    pistol: function (o, t) {
      noise(o, t, 0.10, 'bandpass', 2200, 720, 0.9, 0.55);
      tone(o, t, 'square', 330, 95, 0.08, 0.20);
      tone(o, t, 'sine', 150, 62, 0.12, 0.34);
    },
    rifle: function (o, t) {
      noise(o, t, 0.07, 'highpass', 1500, 900, 0.7, 0.44);
      tone(o, t, 'sawtooth', 470, 150, 0.06, 0.18);
      tone(o, t, 'sine', 190, 70, 0.09, 0.22);
    },
    shotgun: function (o, t) {
      noise(o, t, 0.34, 'lowpass', 1700, 250, 0.8, 0.80);
      noise(o, t, 0.11, 'highpass', 2700, 1500, 0.6, 0.30);
      tone(o, t, 'sine', 132, 38, 0.30, 0.55);
      noise(o, t + 0.27, 0.07, 'bandpass', 1800, 1600, 3, 0.20);
      noise(o, t + 0.37, 0.06, 'bandpass', 2400, 2200, 3, 0.16);
    },
    plasma: function (o, t) {
      tone(o, t, 'sine', 1500, 250, 0.22, 0.30);
      tone(o, t, 'sawtooth', 720, 165, 0.15, 0.12);
      tone(o, t + 0.02, 'sine', 2900, 2300, 0.12, 0.09);
      noise(o, t, 0.16, 'highpass', 1900, 1200, 1.2, 0.15);
    }
  };

  /* ---------------- music + ambience ----------------
     A small procedural score: a slow pad, a sparse arpeggio and a noise bed
     that changes character with the region. No audio files. */
  var musicOn = false, musicKit = '', musicTimer = 0, musicNodes = null;
  var SCALES = {
    beach: [0, 3, 5, 7, 10], jungle: [0, 2, 5, 7, 9], city: [0, 1, 4, 7, 8],
    military: [0, 2, 3, 7, 10], alien: [0, 1, 5, 6, 10], temple: [0, 3, 5, 8, 10],
    airport: [0, 2, 4, 7, 9]
  };

  function musicStart(kit) {
    init();
    if (!ready || !ctx) return;
    if (musicOn && musicKit === kit) return;
    musicStop();
    musicKit = kit || 'beach';
    musicOn = true;
    var pad = ctx.createGain();
    pad.gain.value = 0.0001;
    pad.connect(master);
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 520; filt.Q.value = 0.7;
    filt.connect(pad);
    var oscs = [];
    [55, 82.5, 110].forEach(function (fr, i) {
      var o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = fr * (1 + (i - 1) * 0.004);
      var g = ctx.createGain(); g.gain.value = 0.16;
      o.connect(g); g.connect(filt);
      o.start();
      oscs.push(o);
    });
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    var lg = ctx.createGain(); lg.gain.value = 170;
    lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
    oscs.push(lfo);
    pad.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 2.4);
    musicNodes = { pad: pad, oscs: oscs };
    var scale = SCALES[musicKit] || SCALES.beach;
    var step = 0;
    musicTimer = setInterval(function () {
      if (!ready || muted || !ctx || ctx.state !== 'running' || !musicOn) return;
      var deg = scale[(step * 3) % scale.length];
      var oct = (step % 4 === 0) ? 3 : 2;
      var fr = 110 * Math.pow(2, (deg + (oct - 2) * 12) / 12);
      var t = ctx.currentTime + 0.05;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(fr, t);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 1.7);
      step++;
    }, 900);
  }

  function musicStop() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = 0; }
    if (musicNodes && ctx) {
      try {
        musicNodes.pad.gain.cancelScheduledValues(ctx.currentTime);
        musicNodes.pad.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        musicNodes.oscs.forEach(function (o) { try { o.stop(ctx.currentTime + 0.7); } catch (e) {} });
      } catch (e) {}
    }
    musicNodes = null;
  }

  function setVolume(v) {
    if (master) master.gain.value = muted ? 0 : Math.max(0, Math.min(1, v));
  }

  return {
    init: init,
    unlock: unlock,
    listener: function (x, y) { lx = x; ly = y; },
    isReady: function () { return ready && !muted; },
    isMuted: function () { return muted; },
    toggle: function () {
      muted = !muted;
      if (window.SAVE) window.SAVE.set('muted', muted);
      if (master) master.gain.value = muted ? 0 : 0.75;
      return muted;
    },
    shot: function (kind) { voice(null, null, function (o, t) { (SHOT[kind] || SHOT.pistol)(o, t); }); },
    eShot: function (x, y, heavy) {
      voice(x, y, function (o, t) {
        tone(o, t, 'sawtooth', heavy ? 620 : 850, heavy ? 130 : 200, 0.22, 0.17);
        tone(o, t, 'sine', 300, 115, 0.17, 0.12);
        noise(o, t, 0.10, 'bandpass', 1500, 600, 1.6, 0.12);
      });
    },
    hit: function (x, y) {
      voice(x, y, function (o, t) {
        noise(o, t, 0.05, 'bandpass', 2800, 2200, 2, 0.28);
        tone(o, t, 'square', 520, 300, 0.04, 0.06);
      });
    },
    kill: function (x, y) {
      voice(x, y, function (o, t) {
        noise(o, t, 0.30, 'lowpass', 1100, 220, 0.9, 0.42);
        tone(o, t, 'sawtooth', 260, 60, 0.26, 0.14);
      });
    },
    explosion: function (x, y, big) {
      voice(x, y, function (o, t) {
        noise(o, t, big ? 0.95 : 0.6, 'lowpass', 1500, 90, 0.9, 0.85);
        noise(o, t, 0.12, 'highpass', 3000, 1800, 0.6, 0.25);
        tone(o, t, 'sine', big ? 80 : 110, 30, big ? 0.7 : 0.45, 0.6);
      });
    },
    hurt: function () {
      voice(null, null, function (o, t) {
        tone(o, t, 'sine', 180, 62, 0.22, 0.36);
        noise(o, t, 0.18, 'lowpass', 700, 200, 1, 0.26);
      });
    },
    dodge: function () {
      voice(null, null, function (o, t) {
        noise(o, t, 0.20, 'bandpass', 500, 2400, 1.4, 0.18);
      });
    },
    empty: function () {
      voice(null, null, function (o, t) {
        noise(o, t, 0.03, 'highpass', 3200, 2600, 4, 0.22);
      });
    },
    reload: function () {
      voice(null, null, function (o, t) {
        noise(o, t, 0.05, 'bandpass', 1500, 1200, 4, 0.22);
        noise(o, t + 0.30, 0.06, 'bandpass', 2100, 1700, 4, 0.24);
        tone(o, t + 0.30, 'square', 240, 180, 0.05, 0.06);
      });
    },
    equip: function () {
      voice(null, null, function (o, t) {
        noise(o, t, 0.05, 'bandpass', 2600, 2000, 3, 0.18);
        tone(o, t, 'triangle', 620, 900, 0.07, 0.08);
      });
    },
    pickup: function (kind) {
      voice(null, null, function (o, t) {
        if (kind === 'weapon') {
          [520, 700, 940].forEach(function (f, i) {
            tone(o, t + i * 0.07, 'triangle', f, f * 1.02, 0.14, 0.16);
          });
        } else if (kind === 'med') {
          tone(o, t, 'triangle', 460, 780, 0.20, 0.16);
        } else {
          tone(o, t, 'square', 820, 900, 0.06, 0.09);
          tone(o, t + 0.08, 'square', 1080, 1180, 0.06, 0.08);
        }
      });
    },
    charge: function (x, y) {
      voice(x, y, function (o, t) {
        tone(o, t, 'sawtooth', 110, 420, 0.5, 0.14);
        noise(o, t, 0.5, 'bandpass', 320, 900, 2, 0.12);
      });
    },
    fuse: function (x, y) {
      voice(x, y, function (o, t) {
        for (var i = 0; i < 4; i++) tone(o, t + i * 0.16, 'square', 1250, 1250, 0.05, 0.10);
      });
    },
    ability: function (kind) {
      voice(null, null, function (o, t) {
        if (kind === 'warrior') {
          tone(o, t, 'sine', 120, 40, 0.5, 0.5);
          noise(o, t, 0.4, 'lowpass', 900, 120, 1, 0.5);
        } else if (kind === 'ronin') {
          noise(o, t, 0.22, 'bandpass', 700, 3200, 1.6, 0.3);
          tone(o, t, 'sawtooth', 300, 900, 0.18, 0.16);
        } else if (kind === 'tech') {
          tone(o, t, 'square', 1400, 300, 0.3, 0.16);
          tone(o, t + 0.05, 'sine', 600, 1600, 0.2, 0.1);
          noise(o, t, 0.3, 'highpass', 2200, 800, 1, 0.2);
        } else if (kind === 'mutant') {
          [520, 660, 790].forEach(function (f, i) { tone(o, t + i * 0.09, 'triangle', f, f * 1.1, 0.2, 0.16); });
        } else if (kind === 'drifter') {
          noise(o, t, 0.5, 'bandpass', 500, 1800, 1.2, 0.24);
        } else {
          tone(o, t, 'sine', 300, 1300, 0.2, 0.2);
          noise(o, t, 0.25, 'highpass', 1200, 2600, 1.4, 0.2);
        }
      });
    },
    wave: function () {
      voice(null, null, function (o, t) {
        tone(o, t, 'sawtooth', 92, 70, 0.9, 0.20);
        tone(o, t, 'sine', 46, 38, 1.1, 0.22);
        noise(o, t, 0.9, 'lowpass', 420, 160, 0.8, 0.14);
      });
    },
    death: function () {
      voice(null, null, function (o, t) {
        tone(o, t, 'sawtooth', 320, 40, 1.1, 0.26);
        noise(o, t, 0.9, 'lowpass', 900, 120, 0.9, 0.4);
      });
    },
    ready: function () {
      voice(null, null, function (o, t) {
        [660, 880].forEach(function (f, i) { tone(o, t + i * 0.08, 'triangle', f, f * 1.02, 0.16, 0.12); });
      });
    },
    victory: function () {
      voice(null, null, function (o, t) {
        [523, 659, 784, 1046].forEach(function (f, i) { tone(o, t + i * 0.14, 'triangle', f, f, 0.55, 0.16); });
      });
    },
    musicStart: musicStart, musicStop: musicStop, setVolume: setVolume,
    click: function () { voice(null, null, function (o, t) { noise(o, t, 0.03, 'bandpass', 2400, 2200, 3, 0.14); }); }
  };
})();
