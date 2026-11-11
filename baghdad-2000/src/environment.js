import * as THREE from 'three';

// One full day/night cycle, then the weather director picks a new state.
const DAY_LENGTH = 300;
const WEATHER_MIN = 75;
const WEATHER_MAX = 140;

const color = (hex) => new THREE.Color(hex);

const PHASES = {
  dawn: {
    sun: color(0xffcf9a), sunI: 1.15, hemiSky: color(0xffd8b0), hemiGround: color(0x6b5636), hemiI: 0.62,
    fog: color(0xcdbfa6), near: 50, far: 380, top: color(0x4a6a8f), horizon: color(0xe6c9a6), low: color(0xf0d8b8),
    dust: 0.35, lamps: 0.85, light: 1.5,
  },
  day: {
    sun: color(0xfff3d2), sunI: 2.9, hemiSky: color(0xcfe6ff), hemiGround: color(0x7a6a4a), hemiI: 0.95,
    fog: color(0xd9d2c1), near: 80, far: 470, top: color(0x3f77b5), horizon: color(0xcfd9e0), low: color(0xe8e0cc),
    dust: 0.22, lamps: 0, light: 1,
  },
  dusk: {
    sun: color(0xffb877), sunI: 2.35, hemiSky: color(0xffd8ae), hemiGround: color(0x6b5636), hemiI: 0.7,
    fog: color(0xe3c69b), near: 58, far: 450, top: color(0x5f7d9e), horizon: color(0xe9c88f), low: color(0xf6dcae),
    dust: 0.4, lamps: 0.35, light: 1.15,
  },
  night: {
    sun: color(0x8fa8d8), sunI: 0.28, hemiSky: color(0x2b3a55), hemiGround: color(0x16130f), hemiI: 0.3,
    fog: color(0x14171f), near: 34, far: 230, top: color(0x05070f), horizon: color(0x171e2b), low: color(0x212a38),
    dust: 0.1, lamps: 1, light: 2.3,
  },
};

const STOPS = [
  { t: 0.0, key: 'dawn' },
  { t: 0.14, key: 'day' },
  { t: 0.52, key: 'day' },
  { t: 0.64, key: 'dusk' },
  { t: 0.75, key: 'night' },
  { t: 0.94, key: 'dawn' },
];

export const WEATHER = {
  clear: { icon: '☀️', name: 'صاف', fog: 1, sun: 1, dust: 1, grip: 1, rain: 0, message: 'هوا صاف است' },
  sand: { icon: '🌪️', name: 'طوفان شن', fog: 0.4, sun: 0.68, dust: 2.6, grip: 0.93, rain: 0, message: 'طوفان شن رسید — دید کم شد' },
  rain: { icon: '🌧️', name: 'باران', fog: 0.72, sun: 0.6, dust: 0.35, grip: 0.8, rain: 1, message: 'باران گرفت — چسبندگی کم شد' },
  fog: { icon: '🌫️', name: 'مه غلیظ', fog: 0.48, sun: 0.8, dust: 0.7, grip: 0.9, rain: 0, message: 'مه غلیظ آمد' },
};

const WEATHER_POOL = [
  ['clear', 46],
  ['sand', 20],
  ['rain', 20],
  ['fog', 14],
];

function mix(a, b, u) {
  return a + (b - a) * u;
}

function mixColor(out, a, b, u) {
  out.copy(a).lerp(b, u);
  return out;
}

function phaseAt(t) {
  let i = 0;
  while (i < STOPS.length - 1 && t > STOPS[i + 1].t) i += 1;
  const a = STOPS[i];
  const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const span = Math.max(0.0001, b.t - a.t);
  return { from: PHASES[a.key], to: PHASES[b.key], u: Math.min(1, (t - a.t) / span) };
}

export function createEnvironment(scene, world, opts = {}) {
  const announce = opts.onChange || (() => {});
  let elapsed = 0;
  let phaseName = 'dusk';
  let weatherKey = 'clear';
  let weatherTimer = 40 + Math.random() * 25;
  let applyTimer = 0;

  // rain: one recycled point cloud, only visible while it rains
  const RAIN = 900;
  const rainPos = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 70;
    rainPos[i * 3 + 1] = Math.random() * 26;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0xa9c6dd, size: 0.16, transparent: true, opacity: 0.55, depthWrite: false })
  );
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  const tmpTop = new THREE.Color();
  const tmpHorizon = new THREE.Color();
  const tmpLow = new THREE.Color();
  const tmpSun = new THREE.Color();
  const tmpFog = new THREE.Color();
  const tmpHemi = new THREE.Color();
  const tmpGround = new THREE.Color();

  function apply(force) {
    const { from, to, u } = phaseAt((elapsed / DAY_LENGTH) % 1);
    const w = WEATHER[weatherKey];
    const phaseLabel = u > 0.5 ? to : from;

    const sunI = mix(from.sunI, to.sunI, u) * w.sun;
    const hemiI = mix(from.hemiI, to.hemiI, u);
    const fogNear = mix(from.near, to.near, u);
    const fogFar = mix(from.far, to.far, u) * w.fog;
    const dust = mix(from.dust, to.dust, u) * w.dust;
    const lamps = Math.max(mix(from.lamps, to.lamps, u), weatherKey === 'sand' ? 0.5 : 0);

    world.setAtmosphere({
      sunColor: mixColor(tmpSun, from.sun, to.sun, u),
      sunIntensity: sunI,
      hemiColor: mixColor(tmpHemi, from.hemiSky, to.hemiSky, u),
      hemiGround: mixColor(tmpGround, from.hemiGround, to.hemiGround, u),
      hemiIntensity: hemiI,
      fogColor: mixColor(tmpFog, from.fog, to.fog, u),
      fogNear: Math.max(18, fogNear * (weatherKey === 'sand' ? 0.7 : 1)),
      fogFar: Math.max(90, fogFar),
      sky: {
        top: mixColor(tmpTop, from.top, to.top, u),
        horizon: mixColor(tmpHorizon, from.horizon, to.horizon, u),
        low: mixColor(tmpLow, from.low, to.low, u),
        sun: tmpSun,
      },
      dust,
      lamps,
    });

    if (force) phaseLabel;
    return phaseLabel;
  }

  function pickWeather() {
    const total = WEATHER_POOL.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    for (const [key, weight] of WEATHER_POOL) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return 'clear';
  }

  function setWeather(key, quiet) {
    if (!WEATHER[key]) return;
    weatherKey = key;
    weatherTimer = WEATHER_MIN + Math.random() * (WEATHER_MAX - WEATHER_MIN);
    rain.visible = WEATHER[key].rain > 0;
    if (!quiet) announce({ key, icon: WEATHER[key].icon, name: WEATHER[key].name, message: WEATHER[key].message });
    apply(true);
  }

  function update(dt, playerPos) {
    elapsed += dt;

    const { from, to, u } = phaseAt((elapsed / DAY_LENGTH) % 1);
    const name = u > 0.5 ? STOPS.find((s) => PHASES[s.key] === to)?.key : STOPS.find((s) => PHASES[s.key] === from)?.key;
    if (name && name !== phaseName && (name === 'night' || name === 'dawn')) {
      phaseName = name;
      if (!opts.onPhase) {
        announce({
          key: weatherKey,
          icon: WEATHER[weatherKey].icon,
          name: WEATHER[weatherKey].name,
          message: name === 'night' ? 'شب شد — چراغ‌ها روشن' : 'سپیده دمید',
        });
      } else {
        opts.onPhase(name);
      }
    }
    if (name) phaseName = name;

    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      let next = pickWeather();
      if (next === weatherKey) next = weatherKey === 'clear' ? 'sand' : 'clear';
      setWeather(next);
    }

    applyTimer += dt;
    if (applyTimer > 0.25) {
      applyTimer = 0;
      apply(false);
    }

    if (rain.visible && playerPos) {
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN; i++) {
        arr[i * 3 + 1] -= dt * (16 + (i % 7));
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 24;
          arr[i * 3] = (Math.random() - 0.5) * 70;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.set(playerPos.x, 0, playerPos.z);
    }
  }

  function surge() {
    // a new wave nudges the sky: sometimes the weather turns with it
    if (Math.random() < 0.55) weatherTimer = Math.min(weatherTimer, 3 + Math.random() * 6);
  }

  // start a third of the way in: late afternoon, matching the old golden look
  elapsed = DAY_LENGTH * 0.44;
  apply(true);

  return {
    update,
    surge,
    setWeather,
    get weather() {
      return weatherKey;
    },
    get info() {
      const w = WEATHER[weatherKey];
      return { key: weatherKey, icon: w.icon, name: w.name, message: w.message };
    },
    get grip() {
      return WEATHER[weatherKey].grip;
    },
    get lightLevel() {
      const { from, to, u } = phaseAt((elapsed / DAY_LENGTH) % 1);
      return mix(from.light, to.light, u);
    },
    get phase() {
      return phaseName;
    },
  };
}
