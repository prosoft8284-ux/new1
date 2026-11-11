import * as THREE from 'three';
import { createWorld } from './world.js';
import { createCar } from './car.js';
import { ZombieManager } from './zombies.js';
import { loadProgress, saveProgress, UPGRADES, MAX_LEVEL, upgradeCost } from './upgrades.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createWeapons, WEAPONS, weaponCost } from './weapons.js';

const REPAIR_COST = 60;

// Difficulty presets: pressure comes from zombie pace, spawn rate, damage and waves.
const DIFFICULTY = {
  easy: { zombieSpeed: 0.85, spawnEvery: 0.8, maxActive: 30, damage: 0.7, points: 1.25, initial: 14, waveEvery: 55, chase: 52 },
  normal: { zombieSpeed: 1, spawnEvery: 0.5, maxActive: 42, damage: 1, points: 1, initial: 22, waveEvery: 42, chase: 70 },
  hard: { zombieSpeed: 1.18, spawnEvery: 0.34, maxActive: 54, damage: 1.4, points: 0.85, initial: 30, waveEvery: 32, chase: 90 },
};

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const isCoarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const renderer = new THREE.WebGLRenderer({
  canvas,
  // MSAA is the most expensive thing a phone can do; skip it there.
  antialias: !isCoarse,
  powerPreference: 'high-performance',
  stencil: false,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.25 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isCoarse ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
// Shadows are refreshed on a schedule instead of every frame.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
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
const weapons = createWeapons(scene, car, effects);

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
  wave: 1,
  waveTimer: 0,
  difficulty: progress.difficulty || 'normal',
};
let mouseDown = false;

// ---------- input ----------
const keys = new Set();
const input = { throttle: false, brake: false, steer: 0, handbrake: false, boost: false, fire: false };
const touchState = { throttle: false, brake: false, steer: 0, boost: false, handbrake: false, fire: false };

function readKeys() {
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const keySteer = (right ? 1 : 0) + (left ? -1 : 0);
  input.throttle = up || touchState.throttle;
  input.brake = down || touchState.brake;
  input.steer = keySteer !== 0 ? keySteer : touchState.steer;
  input.handbrake = keys.has(' ') || touchState.handbrake;
  input.boost = keys.has('shift') || touchState.boost;
  input.fire = keys.has('f') || keys.has('j') || mouseDown || touchState.fire;
}

function handleTouch(move, down) {
  if (move === 'gas') touchState.throttle = down;
  else if (move === 'brake') touchState.brake = down;
  else if (move === 'boost') touchState.boost = down;
  else if (move === 'drift') touchState.handbrake = down;
  else if (move === 'fire') touchState.fire = down;
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
  } else if (k === 'q' || k === 'e') {
    weapons.next();
    progress.weapon = weapons.state.selected;
    ui.setWeapons(progress.weapons, weapons.state.selected);
    saveProgress(progress);
  } else if (k === '1' || k === '2' || k === '3') {
    selectWeapon(WEAPONS[Number(k) - 1].key);
  } else if (k === 'r' && game.mode === 'over') {
    ui.hideGameOver();
    startRun();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && game.mode === 'playing') mouseDown = true;
});
window.addEventListener('pointerup', () => {
  mouseDown = false;
});
window.addEventListener('blur', () => {
  mouseDown = false;
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
  onMenu: () => {
    audio.ui();
    goMenu();
  },
  onDifficulty: (diff) => {
    game.difficulty = diff;
    progress.difficulty = diff;
    saveProgress(progress);
    ui.setDifficulty(diff);
    audio.ui();
  },
  onMute: () => {
    const muted = audio.toggleMuted();
    ui.setMuted(muted);
  },
  onSwitchWeapon: () => {
    weapons.next();
    progress.weapon = weapons.state.selected;
    saveProgress(progress);
    ui.setWeapons(progress.weapons, weapons.state.selected);
    audio.ui();
  },
  onSelectWeapon: (key) => selectWeapon(key),
  onBuyWeapon: (key) => buyWeapon(key),
  onQuality: (mode) => setQualityMode(mode),
});

const coarse = isCoarse;
ui.showTouch(coarse);
ui.setMuted(audio.isMuted());
ui.setDifficulty(game.difficulty);
ui.refreshMenu(progress);
ui.showHud(false);
ui.setQuality(qualityMode, qualityLevel, fpsSmooth);
applyQuality(qualityLevel, false);

// ---------- run control ----------
function startRun() {
  const cfg = DIFFICULTY[game.difficulty] || DIFFICULTY.normal;
  stats = car.getStats(progress.upgrades);
  car.reset(world.carStart, world.headingStart, stats);
  zonesetup();
  zombies.speedMul = cfg.zombieSpeed;
  zombies.chaseRange = cfg.chase;
  zombies.reset();
  zombies.spawnNear(world.carStart, cfg.initial, 13, 64, 0);
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
  game.spawnTimer = 0.6;
  game.shake = 0;
  game.wave = 1;
  game.waveTimer = 0;
  ui.showStart(false);
  ui.showPause(false);
  ui.hideGarage();
  ui.hideGameOver();
  ui.showHud(true);
  ui.setWeapons(progress.weapons, weapons.state.selected);
  ui.setWeaponState(weapons.getState());
  ui.message('موج 1 — گاز بده', 'up');
  audio.start();
}

function zonesetup() {
  weapons.setLevels(progress.weapons);
  weapons.select(progress.weapon || 'mg');
  weapons.reset();
}

function selectWeapon(key) {
  if (!weapons.owns(key)) return;
  weapons.select(key);
  progress.weapon = key;
  saveProgress(progress);
  ui.setWeapons(progress.weapons, key);
  ui.setWeaponState(weapons.getState());
  ui.renderGarage(progress, car.state.health, car.state.maxHealth, key);
  audio.ui();
}

function buyWeapon(key) {
  const w = WEAPONS.find((x) => x.key === key);
  if (!w) return;
  const level = progress.weapons[key] || 0;
  if (level >= 3) return;
  const cost = weaponCost(w, level);
  if (progress.points < cost) return;
  progress.points -= cost;
  progress.weapons[key] = level + 1;
  progress.weapon = key;
  weapons.setLevels(progress.weapons);
  weapons.select(key);
  weapons.reset();
  saveProgress(progress);
  audio.levelUp();
  ui.setWeapons(progress.weapons, key);
  ui.renderGarage(progress, car.state.health, car.state.maxHealth, key);
  ui.message(w.name + ' نصب شد · سطح ' + (level + 1), 'up');
}

function endRun() {
  game.mode = 'over';
  if (game.runPoints > progress.best) progress.best = game.runPoints;
  game.best = progress.best;
  saveProgress(progress);
  audio.gameOver();
  ui.refreshMenu(progress);
  ui.showGameOver({ points: game.runPoints, kills: game.kills, best: progress.best, wave: game.wave });
}

function goMenu() {
  game.mode = 'menu';
  game.boosting = false;
  ui.showHud(false);
  ui.showPause(false);
  ui.hideGarage();
  ui.hideGameOver();
  ui.showStart(true);
  ui.refreshMenu(progress);
  zonesetup();
  zombies.reset();
  stats = car.getStats(progress.upgrades);
  car.reset(world.carStart, world.headingStart, stats);
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
  game.returnTo = game.mode === 'over' ? 'over' : game.mode === 'menu' ? 'menu' : 'racing';
  game.mode = 'garage';
  ui.showPause(false);
  ui.hideGameOver();
  ui.showGarage(progress, car.state.health, car.state.maxHealth, game.returnTo === 'menu' ? 'بازگشت' : 'برگرد به جاده', weapons.state.selected);
  audio.ui();
}

function closeGarage() {
  ui.hideGarage();
  if (game.returnTo === 'over') {
    game.mode = 'over';
    ui.showGameOver({ points: game.runPoints, kills: game.kills, best: progress.best, wave: game.wave });
  } else if (game.returnTo === 'menu') {
    goMenu();
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
  ui.renderGarage(progress, car.state.health, car.state.maxHealth, weapons.state.selected);
  ui.message(upgrade.name + ' ارتقا یافت · سطح ' + (level + 1), 'up');
}

function repairCar() {
  if (progress.points < REPAIR_COST) return;
  if (car.state.health >= car.state.maxHealth) return;
  progress.points -= REPAIR_COST;
  car.repair();
  saveProgress(progress);
  audio.ui();
  ui.renderGarage(progress, car.state.health, car.state.maxHealth, weapons.state.selected);
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
const carVel = new THREE.Vector3();
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

  const cfg = DIFFICULTY[game.difficulty] || DIFFICULTY.normal;
  const eff = {
    ...stats,
    killSpeed: game.rampage > 0 ? stats.killSpeed * 0.55 : stats.killSpeed,
    pointsPerKill: game.rampage > 0 ? stats.pointsPerKill * 2 : stats.pointsPerKill,
  };

  car.update(dt, input, stats, game.boosting);
  resolveCollisions();

  car.forward(fwd);
  carVel.copy(fwd).multiplyScalar(car.state.speed);
  weapons.update(dt, { firing: input.fire, pos: car.state.pos, forward: fwd, running: true }, zombies);
  const events = zombies.update(dt, car.state.pos, car.state.speed, eff, carVel);

  for (const hit of events.hits) {
    const dead = car.damage(hit.damage * cfg.damage);
    car.state.speed *= 0.6;
    car.state.lat *= 0.5;
    game.shake = Math.max(game.shake, 0.3);
    audio.impact(0.7);
    ui.flashDamage(0.7);
    effects.bloodBurst(tmpF.set(hit.x, 0.9, hit.z), 1, false);
    if (dead) {
      endRun();
      return;
    }
  }

  if (zombies.killQueue.length) {
    let weaponPoints = 0;
    for (const kill of zombies.killQueue) {
      const typeMult = kill.type === 'brute' ? 3 : kill.type === 'walker' ? 1 : 2;
      const gained = Math.round(stats.pointsPerKill * 0.8 * typeMult * cfg.points);
      weaponPoints += gained;
      game.runPoints += gained;
      progress.points += gained;
      progress.kills += 1;
      game.kills += 1;
      audio.kill(1);
    }
    zombies.killQueue.length = 0;
    if (weaponPoints > 0) ui.message('+' + weaponPoints, 'kill');
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
      const typeMult = kill.type === 'brute' ? 3 : kill.type === 'walker' ? 1 : 2;
      const gained = Math.round(eff.pointsPerKill * typeMult * game.combo * cfg.points);
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
      game.shake = Math.max(game.shake, 0.35);
      ui.message('ضربه‌ی گروهی! +' + gainedTotal, 'kill');
    } else if (events.kills.length === 2) {
      game.slowmo = 0.22;
      ui.message('دو‌تایی! +' + gainedTotal, 'kill');
    } else if (events.kills.length === 1) {
      const k = events.kills[0];
      ui.message(k.type === 'brute' ? 'بروت خرد شد! +' + gainedTotal : 'کمبو ×' + game.combo + ' · +' + gainedTotal, 'kill');
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

  // waves: each surge is announced and dumps a pack around you
  game.waveTimer += dt;
  if (game.waveTimer >= cfg.waveEvery) {
    game.waveTimer = 0;
    game.wave += 1;
    zombies.spawnNear(car.state.pos, 4 + game.wave * 2, 26, 72, game.kills + game.wave * 6);
    game.shake = Math.max(game.shake, 0.3);
    audio.rampage();
    ui.message('موج ' + game.wave + ' رسید', 'up');
  }

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = cfg.spawnEvery;
    if (zombies.active < cfg.maxActive) {
      zombies.spawnNear(car.state.pos, 1 + (Math.random() < 0.3 ? 1 : 0), 44, 96, game.kills + game.wave * 5);
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

// ---------- quality ----------
const QUALITY = {
  high: { dpr: isCoarse ? 1.25 : 1.5, shadows: true, shadowEvery: 1 },
  medium: { dpr: 1.0, shadows: true, shadowEvery: 2 },
  low: { dpr: 0.8, shadows: false, shadowEvery: 0 },
};
let qualityMode = progress.quality || 'auto';
let qualityLevel = qualityMode === 'auto' ? 'high' : qualityMode;
let fpsSmooth = 60;
let qualityTimer = 0;
let frameCount = 0;
let hudTimer = 0;
let renderOnce = true;

function applyQuality(level, announce) {
  qualityLevel = level;
  const q = QUALITY[level];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  world.setShadows(q.shadows);
  if (q.shadows) renderer.shadowMap.needsUpdate = true;
  ui.setQuality(qualityMode, qualityLevel, fpsSmooth);
  if (announce) ui.message('کیفیت: ' + (level === 'high' ? 'بالا' : level === 'medium' ? 'متوسط' : 'کم'), 'up');
}

function setQualityMode(mode) {
  qualityMode = mode;
  progress.quality = mode;
  saveProgress(progress);
  applyQuality(mode === 'auto' ? (fpsSmooth < 42 ? 'medium' : 'high') : mode, false);
}

function trackPerformance(dt) {
  fpsSmooth = fpsSmooth * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;
  qualityTimer += dt;
  if (qualityTimer < 1.5) return;
  qualityTimer = 0;
  ui.setQuality(qualityMode, qualityLevel, fpsSmooth);
  if (qualityMode !== 'auto') return;
  if (fpsSmooth < 34 && qualityLevel !== 'low') {
    applyQuality(qualityLevel === 'high' ? 'medium' : 'low', true);
  } else if (fpsSmooth > 52 && qualityLevel === 'medium') {
    applyQuality('high', false);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;

  readKeys();

  const playing = game.mode === 'playing';
  const scale = Number.isFinite(game.timeScale) ? game.timeScale : 1;
  const dt = realDt * (playing ? scale : 1);
  if (playing) stepGameplay(dt);
  trackPerformance(realDt);

  // While a menu is up the scene is frozen: no simulation, no full-screen
  // re-render, so menus and buttons stay responsive even on weak devices.
  if (playing || game.mode === 'over') {
    world.update(realDt, car.state.pos);
    effects.update(realDt, camera);
  }
  updateCamera(realDt);
  ui.tick(realDt);

  const speedK = Math.min(1, Math.abs(car.state.speed) / 30);
  speedLinesTarget.value = game.mode === 'playing' ? Math.max(speedK * 0.7, game.boosting ? 0.85 : 0) : 0;

  // HUD text and bars do not need 60 writes a second; 13 Hz is invisible
  // to the eye but leaves the frame budget to the renderer.
  hudTimer += realDt;
  if (hudTimer >= 0.075 || !playing) {
    hudTimer = 0;
    ui.update({
      points: progress.points,
      kills: game.kills,
      best: Math.max(progress.best, game.runPoints),
      health: car.state.health,
      maxHealth: car.state.maxHealth,
      speedKmh: Math.abs(car.state.speed) * 3.6,
      combo: playing ? game.combo : 1,
      comboTime: game.comboTimer / 3,
      nitro: game.nitro,
      boosting: game.boosting,
      rampage: game.rampage > 0,
      speedLines: speedLinesTarget.value,
      wave: game.wave,
      weapon: weapons.getState(),
    });
  }

  audio.update(realDt, {
    speedNorm: speedK,
    throttle: input.throttle && game.mode === 'playing',
    boosting: game.boosting,
    intensity: game.rampage > 0 ? 3 : game.combo > 2 ? 2 : 1,
  });

  frameCount += 1;
  const q = QUALITY[qualityLevel];
  if (q.shadows && frameCount % q.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;

  if (playing || game.mode === 'over' || renderOnce) {
    renderer.render(scene, camera);
    renderOnce = false;
  }
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
window.__b2k = {
  scene,
  renderer,
  camera,
  car,
  game,
  world,
  zombies,
  weapons,
  get stats() { return stats; },
  get fps() { return fpsSmooth; },
  get quality() { return { mode: qualityMode, level: qualityLevel }; },
  setQuality: setQualityMode,
};

car.reset(world.carStart, world.headingStart, stats);
camera.position.set(world.carStart.x, 5, world.carStart.z - 11);
camera.lookAt(world.carStart.x, 1.6, world.carStart.z + 6);
world.update(0.016, car.state.pos);
requestAnimationFrame(frame);
