#!/usr/bin/env node
/* BERMUDA SURVIVAL — headless logic checks.
   Runs the real game modules inside a vm sandbox with a stubbed DOM, so the
   profile economy, kit metadata, region mapping, scene queries and the
   liberation loop are exercised without a browser. */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'survival', 'js');
let pass = 0, fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

function makeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: [0, 0, 0, 0] });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function sandbox(extra) {
  const store = {};
  const win = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    devicePixelRatio: 2,
    innerWidth: 900,
    innerHeight: 420,
    addEventListener() {},
    matchMedia: () => ({ matches: false }),
    performance: { now: () => Date.now() },
    navigator: { vibrate() {} },
    setTimeout, setInterval, clearInterval, clearTimeout,
    URLSearchParams,
    console
  };
  win.window = win;
  win.document = {
    createElement() {
      const el = { width: 10, height: 10, style: {}, classList: { add() {}, remove() {}, toggle() {} },
        getContext: () => makeCtx(), appendChild() {}, querySelector: () => null };
      return el;
    },
    getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
      textContent: '', addEventListener() {}, appendChild() {}, querySelector: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }),
    querySelector: () => null,
    addEventListener() {},
    body: { appendChild() {}, classList: { add() {} } }
  };
  Object.assign(win, extra || {});
  const ctx = vm.createContext(win);
  return { win, ctx };
}

function load(ctx, file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

console.log('\n— profile economy (meta.js) —');
{
  const { win, ctx } = sandbox();
  load(ctx, 'save.js');
  load(ctx, 'meta.js');
  const M = win.META;
  ok('starts with no salvage', M.salvage() === 0);
  M.addSalvage(200);
  ok('salvage accumulates', M.salvage() === 200, String(M.salvage()));
  ok('rifle is owned from the start', M.isUnlocked('rifle'));
  ok('shotgun is locked', !M.isUnlocked('shotgun'));
  ok('cannot overdraw', M.spend(999) === false && M.salvage() === 200);
  ok('buy shotgun (140)', M.unlockWeapon('shotgun') && M.isUnlocked('shotgun'));
  ok('salvage debited once', M.salvage() === 60, String(M.salvage()));
  ok('cannot re-buy an owned weapon', M.unlockWeapon('shotgun') && M.salvage() === 60);
  ok('upgrade blocked without funds', M.buyUpgrade('dmg') === false);
  M.addSalvage(400);
  const cost = M.upgradeCost('dmg');
  ok('upgrade purchase', M.buyUpgrade('dmg') && M.upgradeLevel('dmg') === 1);
  ok('upgrade cost rises', M.upgradeCost('dmg') > cost);
  ok('damage bonus applied', Math.abs(M.upgradeBonus().dmg - 1.08) < 1e-9);
  ok('cache pays once', M.claimCache('poi-1') === 45 && M.claimCache('poi-1') === 0);
  ok('poi total + victory gate', (M.setPoiTotal(3), M.liberatedCount() === 0 && !M.allLiberated()));
  if (win.SAVE) win.SAVE.set('liberatedCount', 3);
  ok('victory when every region is free', M.allLiberated());
  M.setQuality('low');
  ok('quality persists', M.quality() === 'low');
}

console.log('\n— kit metadata (kitmeta.js) —');
{
  const { win, ctx } = sandbox();
  load(ctx, 'kitmeta.js');
  const kits = win.KITMETA.kits;
  ok('six kits are described', kits.length === 6, kits.join(','));
  let allValid = true;
  kits.forEach(k => {
    const m = win.KITMETA.forKit(k);
    if (!m || !m.relay || !m.spawns.length || !m.enemies.length || !m.weather) allValid = false;
    if (m.relay.fx <= 0 || m.relay.fx >= 1 || m.relay.fy <= 0 || m.relay.fy >= 1) allValid = false;
    m.spawns.forEach(s => {
      if (s.fx < 0 || s.fx > 1 || s.fy < 0 || s.fy > 1) allValid = false;
    });
  });
  ok('every kit has a relay, entrances, enemies and weather', allValid);
  ok('unknown kit falls back to the beach', win.KITMETA.forRegion({ kit: 'nope' }) === win.KITMETA.beach);
  ok('kits do not share relay positions',
    new Set(kits.map(k => win.KITMETA.forKit(k).relay.fx + ',' + win.KITMETA.forKit(k).relay.fy)).size === 6);
}

console.log('\n— region → kit mapping (regions.js) —');
{
  const { win, ctx } = sandbox();
  load(ctx, 'regions.js');
  const R = win.REGIONS;
  const expect = {
    town: 'city', village: 'city', safehouse: 'city',
    outpost: 'military', fuel_depot: 'military', radar: 'military',
    alien: 'alien', danger: 'alien',
    airport: 'airport', ruins: 'temple', cache: 'jungle', cave: 'jungle',
    harbor: 'beach', beach: 'beach'
  };
  let good = true, bad = [];
  Object.keys(expect).forEach(t => {
    const got = R.forType(t, 'x').kit;
    if (got !== expect[t]) { good = false; bad.push(t + '→' + got); }
  });
  ok('all region types map to their kit', good, bad.join(', '));
  ok('unknown type gets the beach', R.forType('harbor', 'x').kit === 'beach');
}

console.log('\n— scene queries (scene.js + kits.js) —');
{
  const { win, ctx } = sandbox();
  load(ctx, 'save.js');
  load(ctx, 'meta.js');
  load(ctx, 'props.js');
  load(ctx, 'kitmeta.js');
  load(ctx, 'props2.js');
  load(ctx, 'kits.js');
  load(ctx, 'regions.js');
  load(ctx, 'scene.js');
  const S = win.SCENE;
  const region = win.REGIONS.forType('town', 'شهر مرکزی');
  region.id = 'central-city';
  S.configure(region);
  S.bake();
  ok('city builds a background', !!S.bg);
  ok('city is a kit scene', S.isKit() === true);
  const relay = S.relay();
  ok('relay sits inside the world', relay.x > 0 && relay.x < S.W && relay.y > 0 && relay.y < S.H);
  ok('relay pad is walkable', !S.blocked(relay.x, relay.y));
  const sp = S.spawnPoints();
  ok('city has several entrances', sp.length >= 6, String(sp.length));
  ok('at least one entrance is walkable', sp.some(p => !S.blocked(p.x, p.y)));
  const safe = S.safeSpawn(0, 0);
  ok('safeSpawn keeps points on the map', safe.x > 0 && safe.y > 0 && safe.x < S.W && safe.y < S.H);
  const b = S.props.filter(p => p.box)[0];
  ok('buildings expose rectangular colliders', !!b && !!b.box);
  if (b) ok('a building blocks its own footprint', S.blocked(b.box.x, b.box.y));
  ok('a bullet stops on a building', !!b && !!S.propAt(b.box.x, b.box.y));
  ok('flat scenery was baked out of the draw list',
    !S.props.some(p => p.kind === 'fence' || p.kind === 'rubble'));
  ok('baked scenery still blocks movement', S.solids.length > 0);

  const beach = win.REGIONS.forType('harbor', 'بندر');
  S.configure(beach);
  S.bake();
  ok('beach stays the beach', S.isKit() === false);
  ok('beach has a shoreline', S.shoreY(100) > 0);
}

console.log('\n— liberation loop (liberation.js) —');
{
  const { win, ctx } = sandbox();
  load(ctx, 'save.js');
  load(ctx, 'liberation.js');
  const toasts = [];
  let player = { x: 0, y: 0 };
  win.SCENE = { relay: () => ({ x: 500, y: 500 }), S: 1.6 };
  win.LIB.init({
    spawn() {}, toast: m => toasts.push(m), particles() {},
    player: () => player, region: { id: 'central-city', kind: 'town' }
  });
  ok('starts in infiltration', win.LIB.start() === 'infiltrate');
  const node = win.LIB.node();
  ok('relay uses the scene position', node.x === 500 && node.y === 500);
  ok('bullets register on the relay', win.LIB.hitTest(505, 505) === true);
  ok('bullets miss away from it', win.LIB.hitTest(900, 900) === false);

  let guard = 0;
  while (win.LIB.phase() === 'infiltrate' && guard++ < 100) win.LIB.hitNode(100);
  ok('relay breaks into the defence phase', win.LIB.phase() === 'defense');
  ok('breaking the relay raises heat', win.LIB.heat() > 0);

  player = { x: 5000, y: 5000 };            // far away: the clock must freeze
  for (let i = 0; i < 60; i++) win.LIB.update(0.5);
  ok('kiting does not liberate the region', win.LIB.phase() === 'defense');
  ok('hud warns about leaving the ring', /برگرد/.test(win.LIB.hudText()));

  player = { x: 520, y: 510 };              // back inside the guard ring
  let spins = 0;
  while (win.LIB.phase() === 'defense' && spins++ < 400) win.LIB.update(0.5);
  ok('holding the ring liberates the region', win.LIB.phase() === 'liberated');
  ok('liberation is saved', (win.SAVE.get('lib:central-city', null) || {}).liberated === true);
  ok('liberated HUD text is final', /آزاد شد/.test(win.LIB.hudText()));
  ok('liberated regions do not control waves', win.LIB.controlsWaves() === false);

  win.LIB.init({ spawn() {}, toast() {}, particles() {}, region: { id: 'central-city', kind: 'town' } });
  ok('a saved region starts liberated', win.LIB.start() === 'liberated');

  win.LIB.init({ spawn() {}, toast() {}, particles() {}, region: { id: 'other', kind: 'town' } });
  win.LIB.start();
  while (win.LIB.phase() === 'infiltrate') win.LIB.hitNode(100);
  win.LIB.onDeath();
  ok('dying during the defence resets to infiltration', win.LIB.phase() === 'infiltrate');
  ok('the relay survives with partial hp', win.LIB.node().hp > 0 && win.LIB.node().hp < win.LIB.node().maxHp);
}

console.log('\n— game.js guard rails (source checks) —');
{
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  ok('foam is beach-only', /SCENE\.isKit && SCENE\.isKit\(\)/.test(src));
  ok('no per-frame world sort', !/SCENE\.props\.slice\(\)\.sort/.test(src));
  ok('props are merged with actors', /while \(pi < SCENE\.props\.length/.test(src));
  ok('bullets test scenery', /SCENE\.propAt\(bl\.x, bl\.y\)/.test(src));
  ok('enemy bullets test scenery', /SCENE\.propAt\(e\.x, e\.y\)/.test(src));
  ok('walls slide instead of sticking', /slide along walls/.test(src));
  ok('aliens slide and sidestep', /cornered: sidestep/.test(src));
  ok('relay compass exists', /drawRelayArrow/.test(src));
  ok('weather overlay exists', /drawWeather/.test(src));
  ok('victory check exists', /function checkVictory/.test(src));
  ok('pause panel replaces the old modal pause', /id="pause"|pauseNote/.test(src));
  ok('debug cheats need ?dev=1', /qs\.get\('dev'\) === '1'/.test(src));
  ok('liberated regions stop spawning', /liberatedHere/.test(src));
  ok('goal chip reads the profile', /META\.liberatedCount\(\)/.test(src));
  ok('aim stick steers the shot', /Math\.atan2\(aimStick\.dy, aimStick\.dx\)/.test(src));
  ok('decode errors are surfaced', /addEventListener\('error'/.test(src));
  ok('one place builds a run',
    /function beginRun/.test(src) &&
    /function restart\(\) \{[\s\S]{0,120}beginRun\(G\.player\.def\)/.test(src) &&
    /beginRun\(def\);/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
