import * as THREE from 'three';
import { createWorld } from './world.js';
import { createCar } from './car.js';
import { ZombieManager } from './zombies.js';
import { loadProgress, saveProgress, UPGRADES, MAX_LEVEL, upgradeCost } from './upgrades.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const REPAIR_COST = 45;

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const isCoarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.4 : 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

// A tiny generated environment map gives the maroon paint and chrome real
// reflections; without it PBR metal reads almost black.
function makeEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#a9c0d4');
  g.addColorStop(0.5, '#e6d0aa');
  g.addColorStop(0.72, '#d9bd90');
  g.addColorStop(1, '#7d6a4c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = 'rgba(255,244,214,0.95)';
  ctx.beginPath();
  ctx.arc(46, 11, 4.5, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(makeEnvTexture()).texture;
scene.environmentIntensity = 0.6;

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const car = createCar(scene);
const zombies = new ZombieManager(scene, effects, (x, z) => world.isInsideBuilding(x, z, 1.2));

let progress = loadProgress();
let stats = car.getStats(progress.upgrades);

const game = {
  mode: 'menu', // menu | playing | paused | garage | over
  returnTo: 'racing',
  runPoints: 0,
  kills: 0,
  combo: 1,
  comboTimer: 0,
  comboKills: 0,
  rampage: 0,
  nitro: 1,
  boosting: false,
  shake: 0,
  slowmo: 0,
  timeScale: 1,
  crashCooldown: 0,
  spawnTimer: 0,
  dustTimer: 0,
  exhaustTimer: 0,
  skidTimer: 0,
  smokeTimer: 0,
  saveTimer: 0,
  best: progress.best,
};

// ---------- input ----------
const keys = new Set();
const input = { throttle: false, brake: false, steer: 0, handbrake: false, boost: false };
const touchState = { throttle: false, brake: false, steer: 0, boost: false };

function readKeys() {
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const keySteer = (right ? 1 : 0) + (left ? -1 : 0);
  input.throttle = up || touchState.throttle;
  input.brake = down || touchState.brake;
  input.steer = keySteer !== 0 ? keySteer : touchState.steer;
  input.handbrake = keys.has(' ');
  input.boost = keys.has('shift') || touchState.boost;
}

function handleTouch(move, down) {
  if (move === 'gas') touchState.throttle = down;
  else if (move === 'brake') touchState.brake = down;
  else if (move === 'boost') touchState.boost = down;
  else if (move === 'left') touchState.steer = down ? -1 : touchState.steer === -1 ? 0 : touchState.steer;
  else if (move === 'right') touchState.steer = down ? 1 : touchState.steer === 1 ? 0 : touchState.steer;
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  if (k === 'escape') togglePause();
  else if (k === 'g') {
    if (game.mode === 'garage') closeGarage();
    else if (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'over') openGarage();
  } else if (k === 'm') {
    const muted = audio.toggleMuted();
    ui.setMuted(muted);
  } else if (k === 'r' && game.mode === 'over') {
    ui.hideGameOver();
    startRun();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  touchState.throttle = false;
  touchState.brake = false;
  touchState.steer = 0;
  if (game.mode === 'playing') togglePause();
});

// ---------- UI ----------
const ui = createUI({
  onStart: () => {
    audio.start();
    audio.ui();
    startRun();
  },
  onBuy: (key) => buyUpgrade(key),
  onRepair: () => repairCar(),
  onCloseGarage: () => closeGarage(),
  onResume: () => togglePause(),
  onGarage: () => openGarage(),
  onRestart: () => {
    ui.hideGameOver();
    audio.ui();
    startRun();
  },
  onTouch: (move, down) => handleTouch(move, down),
  onPause: () => togglePause(),
  onMute: () => {
    const muted = audio.toggleMuted();
    ui.setMuted(muted);
  },
});

const coarse = isCoarse;
ui.showTouch(coarse);
ui.setMuted(audio.isMuted());
ui.showHud(false);

// ---------- run control ----------
function startRun() {
  stats = car.getStats(progress.upgrades);
  car.reset(world.carStart, world.headingStart, stats);
  zombies.reset();
  zombies.spawnNear(world.carStart, 26, 15, 72, 0);
  game.mode = 'playing';
  game.runPoints = 0;
  game.kills = 0;
  game.combo = 1;
  game.comboKills = 0;
  game.comboTimer = 0;
  game.rampage = 0;
  game.nitro = 1;
  game.boosting = false;
  game.slowmo = 0;
  game.timeScale = 1;
  game.crashCooldown = 0;
  game.spawnTimer = 0.5;
  game.shake = 0;
  ui.showStart(false);
  ui.showPause(false);
  ui.hideGarage();
  ui.hideGameOver();
  ui.showHud(true);
  ui.message('گاز بده و زیرشان بگیر', 'up');
  audio.start();
}

function endRun() {
  game.mode = 'over';
  if (game.runPoints > progress.best) progress.best = game.runPoints;
  game.best = progress.best;
  saveProgress(progress);
  audio.gameOver();
  ui.showGameOver({ points: game.runPoints, kills: game.kills, best: progress.best });
}

function togglePause() {
  if (game.mode === 'playing') {
    game.mode = 'paused';
    ui.showPause(true);
  } else if (game.mode === 'paused') {
    game.mode = 'playing';
    ui.showPause(false);
  }
}

function openGarage() {
  if (game.mode === 'garage') return;
  game.returnTo = game.mode === 'over' ? 'over' : 'racing';
  game.mode = 'garage';
  ui.showPause(false);
  ui.hideGameOver();
  ui.showGarage(progress, car.state.health, car.state.maxHealth);
  audio.ui();
}

function closeGarage() {
  ui.hideGarage();
  if (game.returnTo === 'over') {
    game.mode = 'over';
    ui.showGameOver({ points: game.runPoints, kills: game.kills, best: progress.best });
  } else {
    game.mode = 'playing';
  }
}

function buyUpgrade(key) {
  const upgrade = UPGRADES.find((u) => u.key === key);
  if (!upgrade) return;
  const level = progress.upgrades[key] || 0;
  if (level >= MAX_LEVEL) return;
  const cost = upgradeCost(upgrade, level);
  if (progress.points < cost) return;
  const oldMax = stats.maxHealth;
  progress.points -= cost;
  progress.upgrades[key] = level + 1;
  stats = car.getStats(progress.upgrades);
  car.state.maxHealth = stats.maxHealth;
  if (key === 'chassis') car.state.health = Math.min(stats.maxHealth, car.state.health + (stats.maxHealth - oldMax));
  saveProgress(progress);
  audio.levelUp();
  ui.renderGarage(progress, car.state.health, car.state.maxHealth);
  ui.message(upgrade.name + ' ارتقا یافت · سطح ' + (level + 1), 'up');
}

function repairCar() {
  if (progress.points < REPAIR_COST) return;
  if (car.state.health >= car.state.maxHealth) return;
  progress.points -= REPAIR_COST;
  car.repair();
  saveProgress(progress);
  audio.ui();
  ui.renderGarage(progress, car.state.health, car.state.maxHealth);
  ui.message('ماشین تعمیر شد', 'up');
}

// ---------- collision ----------
const CAR_RADIUS = 1.35;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const tmpF = new THREE.Vector3();

function resolveCollisions() {
  const p = car.state.pos;
  let applied = false;
  const limit = world.bounds - 3;
  if (p.x > limit) p.x = limit;
  if (p.x < -limit) p.x = -limit;
  if (p.z > limit) p.z = limit;
  if (p.z < -limit) p.z = -limit;

  for (const c of world.colliders) {
    if (p.x + CAR_RADIUS < c.minX || p.x - CAR_RADIUS > c.maxX) continue;
    if (p.z + CAR_RADIUS < c.minZ || p.z - CAR_RADIUS > c.maxZ) continue;

    const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    let dx = p.x - nx;
    let dz = p.z - nz;
    let d = Math.hypot(dx, dz);

    if (d < 1e-4) {
      const left = p.x - c.minX;
      const right = c.maxX - p.x;
      const back = p.z - c.minZ;
      const front = c.maxZ - p.z;
      const m = Math.min(left, right, back, front);
      if (m === left) {
        dx = -1;
        dz = 0;
      } else if (m === right) {
        dx = 1;
        dz = 0;
      } else if (m === back) {
        dx = 0;
        dz = -1;
      } else {
        dx = 0;
        dz = 1;
      }
      d = 0;
    }

    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    p.x = nx + ux * CAR_RADIUS;
    p.z = nz + uz * CAR_RADIUS;

    const speed = Math.abs(car.state.speed);
    if (speed > 9 && !applied) {
      applied = true;
      const strength = Math.min(1, (speed - 9) / 18);
      car.state.speed *= 0.32;
      car.state.lat *= -0.25;
      game.shake = Math.max(game.shake, 0.2 + strength * 0.45);
      effects.sparkBurst(tmpF.copy(p), 1 + strength * 2);
      audio.impact(0.55 + strength);
      ui.flashDamage(0.35 + strength * 0.5);
      if (car.damage(5 + strength * 15)) endRun();
    } else if (speed > 2) {
      car.state.speed *= 0.82;
    }
  }
}

// ---------- camera ----------
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const fwd = new THREE.Vector3();

function updateCamera(dt) {
  const speedK = Math.min(1, Math.abs(car.state.speed) / 30);
  car.forward(fwd);
  const back = 9.4 + speedK * 2.5 + (game.boosting ? 1.5 : 0);
  const height = 4.2 + speedK * 0.7;
  camPos.copy(car.state.pos).addScaledVector(fwd, -back);
  camPos.y = height;
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 6.5));

  camTarget.copy(car.state.pos).addScaledVector(fwd, 7 + speedK * 5);
  camTarget.y = 1.8;
  camera.lookAt(camTarget);

  if (game.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * game.shake;
    camera.position.y += (Math.random() - 0.5) * game.shake;
    camera.rotation.z += (Math.random() - 0.5) * game.shake * 0.06;
    game.shake *= Math.exp(-dt * 6);
  }

  const targetFov = 62 + speedK * 11 + (game.boosting ? 7 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------- gameplay ----------
function stepGameplay(dt) {
  // nitro
  const wantsBoost = input.boost && game.nitro > 0.02;
  if (wantsBoost) {
    if (!game.boosting) audio.boost();
    game.boosting = true;
    game.nitro = Math.max(0, game.nitro - 0.27 * dt);
  } else {
    game.boosting = false;
    game.nitro = Math.min(1, game.nitro + 0.08 * dt);
  }

  const eff = {
    ...stats,
    killSpeed: game.rampage > 0 ? stats.killSpeed * 0.55 : stats.killSpeed,
    pointsPerKill: game.rampage > 0 ? stats.pointsPerKill * 2 : stats.pointsPerKill,
  };

  car.update(dt, input, stats, game.boosting);
  resolveCollisions();

  const events = zombies.update(dt, car.state.pos, car.state.speed, eff);

  for (const hit of events.hits) {
    const dead = car.damage(hit.damage);
    game.shake = Math.max(game.shake, 0.3);
    audio.impact(0.7);
    ui.flashDamage(0.7);
    effects.bloodBurst(tmpF.set(hit.x, 0.9, hit.z), 1, false);
    if (dead) {
      endRun();
      return;
    }
  }

  if (events.kills.length) {
    let gainedTotal = 0;
    for (const kill of events.kills) {
      game.comboKills += 1;
      game.comboTimer = 3;
      const nextCombo = Math.min(5, 1 + Math.floor(game.comboKills / 2));
      if (nextCombo !== game.combo) {
        game.combo = nextCombo;
        ui.popCombo();
      }
      const typeMult = kill.type === 'brute' ? 3 : kill.type === 'runner' ? 2 : 1;
      const gained = Math.round(eff.pointsPerKill * typeMult * game.combo);
      gainedTotal += gained;
      game.runPoints += gained;
      progress.points += gained;
      progress.kills += 1;
      game.kills += 1;
      game.nitro = Math.min(1, game.nitro + 0.06);
      audio.kill(1 + Math.min(0.9, game.combo * 0.13));
      audio.squelch();
    }
    if (events.kills.length >= 3) {
      game.slowmo = 0.5;
      ui.message('ضربه‌ی گروهی! +' + gainedTotal, 'kill');
    } else if (events.kills.length === 1) {
      const k = events.kills[0];
      ui.message(k.type === 'brute' ? 'بروت خرد شد! +' + gainedTotal : '×' + game.combo + ' +' + gainedTotal, 'kill');
    } else {
      ui.message('+' + gainedTotal, 'kill');
    }
  }

  if (game.combo >= 5 && game.rampage <= 0) {
    game.rampage = 7;
    audio.rampage();
    ui.message('دیوانه‌وار! همه را خرد کن', 'up');
  }
  if (game.rampage > 0) {
    game.rampage = Math.max(0, game.rampage - dt);
    if (game.rampage === 0) game.combo = 1;
  }

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.comboKills = 0;
      game.combo = 1;
    }
  }

  // spawning
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = 0.45;
    if (zombies.active < 38) {
      zombies.spawnNear(car.state.pos, 1 + (Math.random() < 0.35 ? 1 : 0), 42, 92, game.kills);
    }
  }

  // effects
  const speedAbs = Math.abs(car.state.speed);
  car.forward(fwd);
  const rightX = fwd.z;
  const rightZ = -fwd.x;

  game.dustTimer -= dt;
  if (game.dustTimer <= 0 && speedAbs > 4) {
    game.dustTimer = 0.13;
    const base = tmpC.copy(car.state.pos).addScaledVector(fwd, -1.5);
    const side = Math.random() < 0.5 ? 1 : -1;
    effects.dustBurst(tmpD.set(base.x + rightX * 0.9 * side, 0.1, base.z + rightZ * 0.9 * side), 1, 0.4 + speedAbs * 0.02);
  }

  game.exhaustTimer -= dt;
  if (game.exhaustTimer <= 0 && (input.throttle || game.boosting)) {
    game.exhaustTimer = 0.1;
    effects.exhaust(car.exhaustWorld(0, tmpE), game.boosting);
  }

  if (input.handbrake && speedAbs > 7) {
    game.skidTimer -= dt;
    if (game.skidTimer <= 0) {
      game.skidTimer = 0.05;
      const base = tmpC.copy(car.state.pos).addScaledVector(fwd, -1.45);
      effects.skidMark(base.x + rightX * 0.9, base.z + rightZ * 0.9, -car.state.heading);
      effects.skidMark(base.x - rightX * 0.9, base.z - rightZ * 0.9, -car.state.heading);
    }
  }

  if (car.state.health / car.state.maxHealth < 0.4) {
    game.smokeTimer -= dt;
    if (game.smokeTimer <= 0) {
      game.smokeTimer = 0.22;
      car.forward(fwd);
      effects.smokePuff(tmpC.copy(car.state.pos).addScaledVector(fwd, 1.4));
    }
  }

  // slow motion
  if (game.slowmo > 0) {
    game.slowmo = Math.max(0, game.slowmo - dt);
    game.timeScale = 0.42;
  } else {
    game.timeScale += (1 - game.timeScale) * Math.min(1, dt * 6);
  }

  game.saveTimer += dt;
  if (game.saveTimer > 5) {
    game.saveTimer = 0;
    saveProgress(progress);
  }
}

// ---------- loop ----------
let last = performance.now();
const speedLinesTarget = { value: 0 };

// Adaptive quality: if the device cannot hold a playable frame rate, drop
// pixel ratio and shadows once rather than stuttering through the run.
let fpsSmooth = 60;
let qualityTimer = 0;
let lowQuality = false;
function trackPerformance(dt) {
  fpsSmooth = fpsSmooth * 0.94 + (1 / Math.max(dt, 0.001)) * 0.06;
  qualityTimer += dt;
  if (lowQuality || qualityTimer < 5) return;
  if (fpsSmooth < 30) {
    lowQuality = true;
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    world.setShadows(false);
    ui.message('کیفیت گرافیک کم شد تا بازی روان بماند', 'up');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;

  readKeys();

  const scale = Number.isFinite(game.timeScale) ? game.timeScale : 1;
  const dt = realDt * (game.mode === 'playing' ? scale : 1);
  if (game.mode === 'playing') stepGameplay(dt);
  if (game.mode === 'playing') trackPerformance(realDt);

  world.update(realDt, car.state.pos);
  effects.update(realDt, camera);
  updateCamera(realDt);
  ui.tick(realDt);

  const speedK = Math.min(1, Math.abs(car.state.speed) / 30);
  speedLinesTarget.value = game.mode === 'playing' ? Math.max(speedK * 0.7, game.boosting ? 0.85 : 0) : 0;

  ui.update({
    points: progress.points,
    kills: game.kills,
    best: Math.max(progress.best, game.runPoints),
    health: car.state.health,
    maxHealth: car.state.maxHealth,
    speedKmh: Math.abs(car.state.speed) * 3.6,
    combo: game.mode === 'playing' ? game.combo : 1,
    comboTime: game.comboTimer / 3,
    nitro: game.nitro,
    boosting: game.boosting,
    rampage: game.rampage > 0,
    speedLines: speedLinesTarget.value,
  });

  audio.update(realDt, {
    speedNorm: speedK,
    throttle: input.throttle && game.mode === 'playing',
    boosting: game.boosting,
    intensity: game.rampage > 0 ? 3 : game.combo > 2 ? 2 : 1,
  });

  renderer.render(scene, camera);
}

// ---------- misc ----------
// Surface runtime errors on screen instead of a silent blank canvas.
function showFatal(text) {
  let box = document.getElementById('fatal');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'fatal';
    box.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;margin:0;padding:10px 12px;max-height:42vh;overflow:auto;' +
      'background:rgba(60,10,10,.94);color:#ffd7d7;font:12px/1.6 monospace;white-space:pre-wrap;direction:ltr;text-align:left';
    document.body.appendChild(box);
  }
  box.textContent = (box.textContent + '\n' + text).trim();
}
window.addEventListener('error', (e) => {
  showFatal('ERR: ' + (e.message || e.error) + ' @ ' + (e.filename || '?') + ':' + (e.lineno || 0));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  showFatal('REJ: ' + ((r && (r.stack || r.message)) || r));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'playing') togglePause();
});

// Debug handle for headless checks (draw calls, fps, positions).
window.__b2k = { scene, renderer, camera, car, game, world, zombies, get stats() { return stats; } };

car.reset(world.carStart, world.headingStart, stats);
camera.position.set(world.carStart.x, 5, world.carStart.z - 11);
camera.lookAt(world.carStart.x, 1.6, world.carStart.z + 6);
world.update(0.016, car.state.pos);
requestAnimationFrame(frame);
