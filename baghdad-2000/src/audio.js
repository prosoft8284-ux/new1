// Procedural audio: engine, action SFX and an adaptive Middle-Eastern loop.
// Everything is synthesised with WebAudio, so the game ships with no audio files.

const HIJAZ = [0, 1, 4, 5, 7, 8, 10, 12]; // D Hijaz scale, semitones
const BPM = 100;
const STEP = 60 / BPM / 2; // eighth notes
const D3 = 146.83;

function semis(base, n) {
  return base * Math.pow(2, n / 12);
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let engine = null;
  let noiseBuffer = null;
  let started = false;
  let muted = false;
  let step = 0;
  let nextNoteTime = 0;
  let intensity = 1;
  let musicLevel = 0;

  function makeNoise(seconds = 2) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function connectNoise(filter, gain, dest) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    return src;
  }

  function kick(t, gain = 0.5) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.18);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(musicBus);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  function tek(t, gain = 0.22) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const src = connectNoise(f, g, musicBus);
    src.start(t);
    src.stop(t + 0.14);
  }

  function hat(t, gain = 0.08) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const src = connectNoise(f, g, musicBus);
    src.start(t);
    src.stop(t + 0.08);
  }

  function pluck(freq, t, dur = 0.42, gain = 0.16) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 1.005;
    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(musicBus);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }

  function bassNote(t, gain = 0.3) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc.type = 'triangle';
    osc.frequency.value = semis(D3, -12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(filter).connect(g).connect(musicBus);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  // 32-step loop. Melody enters at intensity 2, hats at 3.
  const MELODY = [
    [0, 0, 2], [2, 2, 2], [4, 1, 2], [7, 0, 3],
    [10, 4, 2], [12, 3, 2], [14, 2, 4],
    [18, 0, 2], [20, 2, 2], [22, 4, 2], [25, 5, 3],
    [28, 4, 2], [30, 3, 2],
  ];

  function playStep(s, t) {
    const bar = s % 32;
    if (bar === 0 || bar === 6 || bar === 10 || bar === 14) kick(t, bar === 0 ? 0.55 : 0.4);
    if (bar === 4 || bar === 12 || bar === 20 || bar === 28) tek(t);
    if (intensity >= 2 && bar % 2 === 1) hat(t, 0.05);
    if (bar === 0 || bar === 16) bassNote(t, 0.28);
    if (intensity >= 2) {
      for (const [at, deg, len] of MELODY) {
        if (at === bar) pluck(semis(D3, HIJAZ[deg]), t, 0.18 + len * 0.06, 0.11);
      }
    }
    if (intensity >= 3 && (bar === 30)) pluck(semis(D3, 12), t, 0.3, 0.1);
  }

  function schedule() {
    if (!ctx || !started) return;
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 12) {
      playStep(step, Math.max(nextNoteTime, ctx.currentTime + 0.01));
      step = (step + 1) % 32;
      nextNoteTime += STEP;
    }
  }

  const api = {
    start() {
      if (started) {
        if (ctx && ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.8;
      sfxBus.connect(master);
      noiseBuffer = makeNoise();

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.value = 60;
      const oscB = ctx.createOscillator();
      oscB.type = 'square';
      oscB.frequency.value = 45;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 7;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain).connect(master);
      oscA.start();
      oscB.start();

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 520;
      windFilter.Q.value = 0.7;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.015;
      const wind = connectNoise(windFilter, windGain, master);
      wind.loop = true;
      wind.start();

      engine = { oscA, oscB, filter, gain, windGain };
      started = true;
      step = 0;
      nextNoteTime = ctx.currentTime + 0.08;
      ctx.resume?.();
    },

    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.85;
    },

    isMuted() {
      return muted;
    },

    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },

    /** called every frame */
    update(dt, s = {}) {
      if (!ctx || !started) return;
      const speed = Math.max(0, Math.min(1, s.speedNorm || 0));
      const thr = s.throttle ? 1 : 0;
      const boost = s.boosting ? 1 : 0;
      const t = ctx.currentTime;

      if (engine) {
        const base = 52 + speed * 190 + thr * 22 + boost * 65;
        engine.oscA.frequency.setTargetAtTime(base, t, 0.08);
        engine.oscB.frequency.setTargetAtTime(base * 0.5, t, 0.12);
        engine.filter.frequency.setTargetAtTime(380 + speed * 1500 + boost * 700, t, 0.1);
        engine.gain.gain.setTargetAtTime(0.05 + speed * 0.11 + thr * 0.05 + boost * 0.05, t, 0.12);
        engine.windGain.gain.setTargetAtTime(0.012 + speed * 0.05, t, 0.2);
      }

      const targetIntensity = s.intensity || 1;
      if (targetIntensity !== intensity) {
        intensity = targetIntensity;
        musicBus.gain.setTargetAtTime(0.26 + intensity * 0.05, t, 0.4);
      }
      musicLevel = musicBus.gain.value;
      schedule();
    },

    impact(strength = 1) {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 * strength, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      g.gain.setValueAtTime(0.5 * Math.min(1, strength), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.32);

      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.35 * Math.min(1, strength), t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      const src = connectNoise(f, ng, sfxBus);
      src.start(t);
      src.stop(t + 0.2);
    },

    squelch() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 0.14);
      f.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      const src = connectNoise(f, g, sfxBus);
      src.start(t);
      src.stop(t + 0.18);
    },

    kill(pitch = 1) {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(1180 * pitch, t + 0.1);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.18);
    },

    boost() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(4200, t + 0.45);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(f).connect(g).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.55);
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      const src = connectNoise(nf, ng, sfxBus);
      src.start(t);
      src.stop(t + 0.42);
    },

    ui() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 660;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.1);
    },

    levelUp() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime + 0.02;
      [0, 4, 7, 12].forEach((semi, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = semis(D3, semi + 12);
        const at = t + i * 0.075;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.14, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        osc.connect(g).connect(sfxBus);
        osc.start(at);
        osc.stop(at + 0.24);
      });
    },

    rampage() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(g).connect(sfxBus);
      osc.start(t);
      osc.stop(t + 0.72);
    },

    gameOver() {
      if (!ctx || !started || muted) return;
      const t = ctx.currentTime + 0.02;
      [7, 4, 1, 0].forEach((semi, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = semis(D3, semi);
        const at = t + i * 0.16;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
        osc.connect(g).connect(sfxBus);
        osc.start(at);
        osc.stop(at + 0.52);
      });
    },
  };

  return api;
}
