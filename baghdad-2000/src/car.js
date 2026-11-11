import * as THREE from 'three';

const PAINT = 0x7e1529;

export function createCar(scene) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);

  const paint = new THREE.MeshStandardMaterial({ color: PAINT, metalness: 0.45, roughness: 0.32 });
  const paintDark = new THREE.MeshStandardMaterial({ color: 0x5c0f20, metalness: 0.4, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x191715, metalness: 0.3, roughness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde1, metalness: 1, roughness: 0.14 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101b22, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.82 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6da, emissive: 0xffe6ab, emissiveIntensity: 2.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0a0a, emissive: 0xff2a14, emissiveIntensity: 0.7 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    body.add(m);
    return m;
  }

  // ---- low, wide E30-style shell ----
  box(1.8, 0.46, 4.32, paint, 0, 0.68, 0);            // main hull
  box(1.86, 0.18, 3.5, paintDark, 0, 0.47, 0);        // sills / valance
  box(1.72, 0.1, 1.4, paint, 0, 0.93, 1.42);          // hood
  box(1.72, 0.1, 1.15, paint, 0, 0.93, -1.6);         // boot
  box(1.78, 0.06, 0.14, chrome, 0, 0.99, 1.98);       // hood lip
  // greenhouse: narrower and lower than the hull
  box(1.46, 0.42, 1.9, paint, 0, 1.2, -0.16);         // cabin
  box(1.38, 0.06, 1.78, paint, 0, 1.42, -0.2);        // roof
  // glass
  const windshield = box(1.3, 0.36, 0.06, glass, 0, 1.22, 0.79);
  windshield.rotation.x = -0.34;
  const rearGlass = box(1.26, 0.32, 0.06, glass, 0, 1.22, -1.09);
  rearGlass.rotation.x = 0.32;
  box(0.05, 0.28, 1.62, glass, -0.74, 1.2, -0.18);    // side glass
  box(0.05, 0.28, 1.62, glass, 0.74, 1.2, -0.18);
  // fender flares
  box(0.1, 0.3, 1.02, paintDark, -0.9, 0.52, 1.42);
  box(0.1, 0.3, 1.02, paintDark, 0.9, 0.52, 1.42);
  box(0.1, 0.3, 1.06, paintDark, -0.9, 0.52, -1.44);
  box(0.1, 0.3, 1.06, paintDark, 0.9, 0.52, -1.44);
  // bumpers, grille, kidneys
  box(1.9, 0.16, 0.14, chrome, 0, 0.52, 2.19);
  box(1.9, 0.16, 0.14, chrome, 0, 0.52, -2.19);
  box(1.18, 0.2, 0.08, dark, 0, 0.8, 2.2);
  box(0.32, 0.17, 0.05, chrome, -0.28, 0.8, 2.24);
  box(0.32, 0.17, 0.05, chrome, 0.28, 0.8, 2.24);
  // lights
  box(0.42, 0.15, 0.06, headMat, -0.6, 0.82, 2.2);
  box(0.42, 0.15, 0.06, headMat, 0.6, 0.82, 2.2);
  const tailL = box(0.46, 0.13, 0.05, tailMat, -0.58, 0.84, -2.2);
  const tailR = box(0.46, 0.13, 0.05, tailMat, 0.58, 0.84, -2.2);
  box(0.24, 0.1, 0.04, new THREE.MeshStandardMaterial({ color: 0xd8d2c0, emissive: 0xcfc9b6, emissiveIntensity: 0.5 }), 0, 0.84, -2.21);
  // trim, mirrors, plates
  box(1.46, 0.05, 0.05, chrome, 0, 1.02, -1.0);
  box(0.14, 0.08, 0.2, paintDark, -0.86, 1.06, 0.62);
  box(0.14, 0.08, 0.2, paintDark, 0.86, 1.06, 0.62);
  box(0.56, 0.12, 0.04, chrome, 0, 0.58, 2.26);
  box(0.56, 0.12, 0.04, chrome, 0, 0.58, -2.26);
  // rear panel inset + boot lip so the back is not one flat slab
  box(1.5, 0.26, 0.05, paintDark, 0, 0.68, -2.17);
  box(1.42, 0.07, 0.09, paint, 0, 1.0, -2.05);
  box(0.1, 0.08, 0.1, new THREE.MeshStandardMaterial({ color: 0xe8c46a, metalness: 1, roughness: 0.25 }), 0.55, 0.9, 2.24);

  // ---- wheels ----
  const wheels = [];
  const frontPivots = [];
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 18);
  const hubGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 14);
  const rimGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x131211, roughness: 0.95, metalness: 0.05 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x7d848a, metalness: 0.85, roughness: 0.38 });

  function makeWheel(x, z, isFront) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.37, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    for (let s = 0; s < 4; s++) {
      const spoke = new THREE.Mesh(rimGeo, hubMat);
      spoke.rotation.x = (s / 4) * Math.PI;
      spoke.position.x = x > 0 ? 0.16 : -0.16;
      spin.add(spoke);
    }
    spin.add(tire);
    spin.add(hub);
    pivot.add(spin);
    body.add(pivot);
    wheels.push(spin);
    if (isFront) frontPivots.push(pivot);
  }
  makeWheel(-0.9, 1.4, true);
  makeWheel(0.9, 1.4, true);
  makeWheel(-0.9, -1.46, false);
  makeWheel(0.9, -1.46, false);

  // ---- headlights ----
  function addBeam(x) {
    const beam = new THREE.SpotLight(0xffe9bd, 2.4, 52, Math.PI / 5.2, 0.6, 1.1);
    beam.position.set(x, 0.86, 2.16);
    const target = new THREE.Object3D();
    target.position.set(x * 1.7, 0.05, 16);
    body.add(target);
    beam.target = target;
    body.add(beam);
  }
  addBeam(-0.6);
  addBeam(0.6);

  // ---- nitro flames ----
  const flames = [];
  [-0.42, 0.42].forEach((x) => {
    const holder = new THREE.Group();
    holder.position.set(x, 0.5, -2.3);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.15, 10, 1, true), flameMat);
    outer.rotation.x = -Math.PI / 2;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 8, 1, true), flameCoreMat);
    core.rotation.x = -Math.PI / 2;
    holder.add(outer, core);
    holder.visible = false;
    body.add(holder);
    flames.push({ holder, outer, core });
  });

  const exhaustL = new THREE.Object3D();
  exhaustL.position.set(-0.45, 0.42, -2.24);
  const exhaustR = new THREE.Object3D();
  exhaustR.position.set(0.45, 0.42, -2.24);
  body.add(exhaustL, exhaustR);

  const state = {
    pos: new THREE.Vector3(),
    heading: 0,
    speed: 0,
    lat: 0,
    health: 100,
    maxHealth: 100,
    wheelSpin: 0,
    pitch: 0,
    roll: 0,
    brakeLight: 0.7,
    boosting: false,
    time: 0,
  };

  function getStats(u) {
    const e = u.engine || 0;
    const ch = u.chassis || 0;
    const ram = u.ram || 0;
    const sp = u.spikes || 0;
    const ti = u.tires || 0;
    return {
      maxSpeed: 31 + e * 3.3,
      accel: 12 + e * 1.7,
      brake: 24 + ti * 1.2,
      turn: 1.62 + ti * 0.11,
      grip: 6.2 + ti * 0.6,
      // You must actually carry speed to flatten a walker; brutes need more.
      killSpeed: Math.max(2.6, 7.6 - ram * 0.9),
      killRadius: 2.05 + sp * 0.2,
      zombieDamage: Math.max(3, 9.5 - ch * 1.0),
      pointsPerKill: 10 + sp * 2,
      maxHealth: 100 + ch * 28,
    };
  }

  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();

  const car = {
    group: root,
    state,

    getStats,

    reset(pos, heading, stats) {
      state.pos.copy(pos);
      state.heading = heading;
      state.speed = 0;
      state.lat = 0;
      state.maxHealth = stats ? stats.maxHealth : 100;
      state.health = state.maxHealth;
      state.pitch = 0;
      state.roll = 0;
      state.time = 0;
      root.position.copy(state.pos);
      root.rotation.set(0, heading, 0);
      body.rotation.set(0, 0, 0);
      tailMat.emissiveIntensity = 0.7;
    },

    repair() {
      state.health = state.maxHealth;
    },

    damage(amount) {
      state.health = Math.max(0, state.health - amount);
      tailMat.emissiveIntensity = 3;
      return state.health <= 0;
    },

    get speed() {
      return state.speed;
    },

    forward(out = forwardVec) {
      return out.set(Math.sin(state.heading), 0, Math.cos(state.heading));
    },

    exhaustWorld(i, out) {
      const src = i === 0 ? exhaustL : exhaustR;
      return src.getWorldPosition(out);
    },

    update(dt, input, stats, boosting) {
      state.time += dt;
      state.boosting = boosting;
      const top = stats.maxSpeed * (boosting ? 1.34 : 1);
      const accel = stats.accel * (boosting ? 1.95 : 1);

      if (input.throttle) {
        state.speed = Math.min(top, state.speed + accel * dt);
      } else {
        if (state.speed > 0) state.speed = Math.max(0, state.speed - 4.5 * dt);
        else state.speed = Math.min(0, state.speed + 4.5 * dt);
      }
      if (input.brake) {
        if (state.speed > 0.3) state.speed = Math.max(0, state.speed - stats.brake * dt);
        else state.speed = Math.max(-top * 0.34, state.speed - accel * 0.8 * dt);
      }
      if (state.speed > top) state.speed = Math.max(top, state.speed - 8 * dt);
      if (input.handbrake) state.speed *= Math.exp(-1.7 * dt);

      const speedK = Math.min(1, Math.abs(state.speed) / 7);
      const reverse = state.speed < -0.4 ? -1 : 1;
      state.heading -= input.steer * stats.turn * dt * speedK * reverse;

      const slipping = input.handbrake && Math.abs(state.speed) > 6;
      if (slipping) state.lat += -input.steer * Math.abs(state.speed) * 2.3 * dt;
      state.lat *= Math.exp(-(slipping ? 1.1 : stats.grip) * dt);

      forwardVec.set(Math.sin(state.heading), 0, Math.cos(state.heading));
      rightVec.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
      state.pos.addScaledVector(forwardVec, state.speed * dt);
      state.pos.addScaledVector(rightVec, state.lat * dt);

      root.position.copy(state.pos);
      root.rotation.y = state.heading;

      // suspension feel
      const targetRoll = -input.steer * speedK * 0.075 - state.lat * 0.008;
      const targetPitch = (input.brake ? 0.028 : 0) - (input.throttle ? 0.02 : 0) - (boosting ? 0.016 : 0);
      state.roll += (targetRoll - state.roll) * Math.min(1, dt * 9);
      state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 7);
      body.rotation.z = state.roll;
      body.rotation.x = state.pitch;
      body.position.y = Math.sin(state.time * 22) * Math.min(0.012, Math.abs(state.speed) * 0.0005);

      // wheels
      state.wheelSpin -= (state.speed * dt) / 0.37;
      for (const w of wheels) w.rotation.x = state.wheelSpin;
      const steerAngle = input.steer * 0.42;
      for (const p of frontPivots) p.rotation.y += (-steerAngle - p.rotation.y) * Math.min(1, dt * 12);

      // brake lights
      const targetBrake = input.brake || input.handbrake ? 3.4 : 0.7;
      state.brakeLight += (targetBrake - state.brakeLight) * Math.min(1, dt * 8);
      tailMat.emissiveIntensity = state.brakeLight;
      tailL.visible = true;
      tailR.visible = true;

      // nitro flames
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        f.holder.visible = boosting;
        if (boosting) {
          const flick = 0.75 + Math.random() * 0.5;
          f.outer.scale.set(1, flick, 1);
          f.core.scale.set(1, 0.8 + Math.random() * 0.6, 1);
          f.outer.position.set(0, 0, -0.2 - Math.random() * 0.25);
        }
      }
    },
  };

  return car;
}
