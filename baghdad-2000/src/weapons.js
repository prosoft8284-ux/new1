import * as THREE from 'three';

export const WEAPON_MAX = 3;

export const WEAPONS = [
  {
    key: 'mg',
    name: 'مسلسل سقفی',
    icon: '🔫',
    tag: 'خودکار',
    desc: 'رگبار خودکار از سقف؛ هر زامبی جلوی ماشین را می‌دوزد. گرم می‌شود، رها کن تا خنک شود.',
    cost: (level) => 150 + level * 130,
  },
  {
    key: 'flame',
    name: 'شعل‌افکن',
    icon: '🔥',
    tag: 'مخروط آتش',
    desc: 'شعله‌ی نزدیک و پیوسته؛ جمعیت را یک‌جا می‌سوزاند ولی سوختش کم است.',
    cost: (level) => 190 + level * 150,
  },
  {
    key: 'harpoon',
    name: 'هارپون فولادی',
    icon: '🪝',
    tag: 'نافذ',
    desc: 'نیزه‌ی سنگین و کم‌تیر؛ بروت را از پا درمی‌آورد و از میان صف رد می‌شود.',
    cost: (level) => 240 + level * 170,
  },
];

export function weaponByKey(key) {
  return WEAPONS.find((w) => w.key === key) || WEAPONS[0];
}

export function weaponCost(weapon, level) {
  return weapon.cost(level);
}

const tracerGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5);

export function createWeapons(scene, car, effects) {
  const mount = car.bodyGroup || car.group;

  const metal = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.75, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ba2a8, metalness: 0.9, roughness: 0.24 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb98a3a, metalness: 0.85, roughness: 0.32 });
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // ---------- roof machine gun ----------
  const mg = new THREE.Group();
  mg.position.set(0, 1.5, 0.1);
  const mgBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.18, 10), metal);
  const mgYaw = new THREE.Group();
  mgYaw.position.y = 0.14;
  const mgBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.42), metal);
  mgBody.position.z = 0.08;
  const mgBarrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.78, 8), steel);
  mgBarrelL.rotation.x = Math.PI / 2;
  mgBarrelL.position.set(-0.045, 0.03, 0.55);
  const mgBarrelR = mgBarrelL.clone();
  mgBarrelR.position.x = 0.045;
  const mgMag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.16), brass);
  mgMag.position.set(0.05, -0.16, 0.0);
  const mgFlash = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6, 1, true), flashMat.clone());
  mgFlash.rotation.x = -Math.PI / 2;
  mgFlash.position.set(0, 0.03, 1.0);
  mgFlash.visible = false;
  mgYaw.add(mgBody, mgBarrelL, mgBarrelR, mgMag, mgFlash);
  mg.add(mgBase, mgYaw);
  mg.visible = false;
  mount.add(mg);

  // ---------- flamethrower ----------
  const flame = new THREE.Group();
  flame.position.set(0, 0.8, 2.05);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.54, 10), metal);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.55, 0.18, -0.2);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.095, 0.5, 8), steel);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.18, 0.28);
  const flameCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 7, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff7a22,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 5.2, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  for (const cone of [flameCone, flameCore]) {
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.18, 2.9);
    cone.visible = false;
  }
  flame.add(tank, nozzle, flameCone, flameCore);
  flame.visible = false;
  mount.add(flame);

  // ---------- harpoon launcher ----------
  const harpoon = new THREE.Group();
  harpoon.position.set(0, 1.46, -0.4);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.15, 10), metal);
  tube.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 6, 12), brass);
  ring.position.z = 0.56;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), steel);
  valve.rotation.z = Math.PI / 2;
  valve.position.set(0.14, 0.12, -0.2);
  harpoon.add(tube, ring, valve);
  harpoon.visible = false;
  mount.add(harpoon);

  const bolt = new THREE.Group();
  const boltShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), steel);
  boltShaft.rotation.x = Math.PI / 2;
  const boltTip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), steel);
  boltTip.rotation.x = Math.PI / 2;
  boltTip.position.z = 0.9;
  bolt.add(boltShaft, boltTip);
  bolt.visible = false;
  scene.add(bolt);

  // ---------- tracers ----------
  const tracers = [];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Mesh(
      tracerGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const state = {
    levels: { mg: 0, flame: 0, harpoon: 0 },
    selected: 'mg',
    heat: 0,
    fuel: 1,
    ammo: WEAPON_MAX,
    cooldown: 0,
    ammoTimer: 0,
    flameTick: 0,
    bolt: null, // { pos, dir, left, damage }
    recoil: 0,
    mgTarget: null,
  };

  const tmpDir = new THREE.Vector3();
  const tmpOrigin = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();

  function addTracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const len = from.distanceTo(to);
    if (len < 0.01) return;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(1, len, 1);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpDir.copy(to).sub(from).normalize());
    t.mesh.visible = true;
    t.life = 0.07;
  }

  function setLevels(levels) {
    state.levels = { mg: 0, flame: 0, harpoon: 0, ...(levels || {}) };
    if (!state.levels[state.selected]) {
      const firstOwned = WEAPONS.find((w) => state.levels[w.key] > 0);
      state.selected = firstOwned ? firstOwned.key : 'mg';
    }
    mg.visible = state.levels.mg > 0;
    flame.visible = state.levels.flame > 0;
    harpoon.visible = state.levels.harpoon > 0;
  }

  function select(key) {
    if (state.levels[key] > 0) state.selected = key;
  }

  function next() {
    const owned = WEAPONS.filter((w) => state.levels[w.key] > 0);
    if (owned.length < 2) return;
    const i = owned.findIndex((w) => w.key === state.selected);
    state.selected = owned[(i + 1) % owned.length].key;
  }

  function reset() {
    state.heat = 0;
    state.fuel = 1;
    state.ammo = WEAPON_MAX;
    state.cooldown = 0;
    state.ammoTimer = 0;
    state.flameTick = 0;
    state.bolt = null;
    state.recoil = 0;
    bolt.visible = false;
    mgFlash.visible = false;
    flameCone.visible = false;
    flameCore.visible = false;
    for (const t of tracers) {
      t.mesh.visible = false;
      t.life = 0;
    }
  }

  function getState() {
    const w = weaponByKey(state.selected);
    const level = state.levels[w.key] || 0;
    let ratio = 1;
    let ready = level > 0;
    let note = w.tag;
    if (w.key === 'mg') {
      ratio = 1 - state.heat;
      ready = ready && state.heat < 0.999;
      note = state.heat > 0.999 ? 'داغ' : level > 0 ? 'آماده' : 'قفل';
    } else if (w.key === 'flame') {
      ratio = state.fuel;
      ready = ready && state.fuel > 0.02;
      note = level > 0 ? 'سوخت' : 'قفل';
    } else {
      ratio = state.ammo / WEAPON_MAX;
      ready = ready && state.ammo > 0;
      note = level > 0 ? 'نیزه' : 'قفل';
    }
    return { key: w.key, name: w.name, icon: w.icon, level, ratio, ready, note, overheat: w.key === 'mg' && state.heat > 0.999 };
  }

  function update(dt, ctx, zombies) {
    const running = ctx.running !== false;
    const forward = ctx.forward;
    const pos = ctx.pos;
    const firing = !!ctx.firing && running;

    // cooldowns and regen
    if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
    state.heat = Math.max(0, state.heat - dt * (firing && state.selected === 'mg' ? 0.06 : 0.34));
    if (!(firing && state.selected === 'flame')) state.fuel = Math.min(1, state.fuel + dt * 0.19);
    if (state.ammo < WEAPON_MAX) {
      state.ammoTimer += dt;
      if (state.ammoTimer > 3.2) {
        state.ammoTimer = 0;
        state.ammo += 1;
      }
    }
    state.recoil *= Math.exp(-dt * 12);

    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }

    if (!running) return { shots: 0, kills: 0 };

    // keep only the selected weapon visible on the car
    mg.visible = state.levels.mg > 0;
    flame.visible = state.levels.flame > 0;
    harpoon.visible = state.levels.harpoon > 0;

    let shots = 0;

    // ---------- MG ----------
    if (state.levels.mg > 0 && state.selected === 'mg') {
      if (firing && state.heat < 0.999 && state.cooldown <= 0) {
        state.cooldown = 0.085;
        state.heat = Math.min(1, state.heat + 0.05);
        state.recoil = 1;
        const origin = tmpOrigin.copy(pos);
        const target = zombies.nearestInFront(origin, forward, 36, 0.45);
        mgYaw.getWorldPosition(tmpMuzzle);
        mgFlash.visible = true;
        mgFlash.scale.set(1, 0.7 + Math.random() * 0.8, 1);
        mgFlash.rotation.z = Math.random() * 2;
        if (target) {
          mgYaw.lookAt(target.pos.x, 1.1, target.pos.z);
          addTracer(tmpMuzzle, tmpDir.set(target.pos.x, 1.15, target.pos.z));
          zombies.damageInCone(
            tmpOrigin.copy(pos).addScaledVector(forward, 3),
            forward,
            10,
            0.5,
            0.25,
            'mg'
          );
          zombies.damageZombie(target, 0.4 + state.levels.mg * 0.12, 'mg');
          effects.sparkBurst(tmpDir.copy(target.pos).setY(1.0), 1);
        } else {
          mgYaw.rotation.y = 0;
          addTracer(tmpMuzzle, tmpDir.copy(pos).addScaledVector(forward, 30).setY(1.2));
        }
        shots++;
      }
      if (state.cooldown > 0.03) mgFlash.visible = false;
      mgYaw.position.z = -state.recoil * 0.04;
    } else {
      mgFlash.visible = false;
    }

    // ---------- flamethrower ----------
    if (state.levels.flame > 0 && state.selected === 'flame' && firing && state.fuel > 0.01) {
      state.fuel = Math.max(0, state.fuel - dt * 0.34);
      state.flameTick += dt;
      flameCone.visible = true;
      flameCore.visible = true;
      const flick = 0.85 + Math.random() * 0.3;
      flameCone.scale.set(flick, 1 + state.levels.flame * 0.12, flick);
      flameCore.scale.set(flick, 1 + state.levels.flame * 0.1, flick);
      if (state.flameTick > 0.11) {
        state.flameTick = 0;
        const hits = zombies.damageInCone(
          tmpOrigin.copy(pos).addScaledVector(forward, 2.2),
          forward,
          11 + state.levels.flame * 1.6,
          0.5,
          0.4,
          'flame'
        );
        if (hits > 0) {
          effects.sparkBurst(tmpDir.copy(pos).addScaledVector(forward, 5).setY(0.9), 2);
          shots += hits;
        }
      }
    } else {
      flameCone.visible = false;
      flameCore.visible = false;
    }

    // ---------- harpoon ----------
    if (state.levels.harpoon > 0 && state.selected === 'harpoon') {
      if (firing && state.cooldown <= 0 && state.ammo > 0 && !state.bolt) {
        state.cooldown = 1.25;
        state.ammo -= 1;
        state.recoil = 1.4;
        state.bolt = {
          pos: pos.clone().addScaledVector(forward, 2.3).setY(1.15),
          dir: forward.clone(),
          left: 0.55,
          damage: 5 + state.levels.harpoon * 2,
        };
        bolt.visible = true;
        bolt.position.copy(state.bolt.pos);
        bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
        effects.sparkBurst(tmpDir.copy(state.bolt.pos), 1);
        shots++;
      }
      if (state.bolt) {
        const b = state.bolt;
        const step = 65 * dt;
        b.pos.addScaledVector(b.dir, step);
        b.left -= dt;
        bolt.position.copy(b.pos);
        // hit the first zombie along the path
        const hit = zombies.nearestInFront(
          tmpOrigin.copy(b.pos).addScaledVector(b.dir, -2),
          b.dir,
          2.4,
          0.2
        );
        if (hit) {
          zombies.damageZombie(hit, b.damage, 'harpoon');
          effects.bloodBurst(tmpDir.copy(hit.pos).setY(1.1), 1, true);
          state.bolt = null;
          bolt.visible = false;
          state.cooldown = 0.35;
        } else if (b.left <= 0) {
          state.bolt = null;
          bolt.visible = false;
        }
      }
    } else if (state.bolt) {
      state.bolt = null;
      bolt.visible = false;
    }

    harpoon.position.z = -0.4 - state.recoil * 0.05;

    return { shots, kills: 0 };
  }

  return {
    state,
    setLevels,
    select,
    next,
    reset,
    getState,
    update,
    owns: (key) => (state.levels[key] || 0) > 0,
  };
}
