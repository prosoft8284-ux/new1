import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_ACTIVE = 46;

function boxGeo(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// Part geometries are built once and reused by every zombie through InstancedMesh.
const HEAD_GEO = mergeGeometries([
  boxGeo(0.34, 0.34, 0.32),
  boxGeo(0.26, 0.1, 0.12, 0, -0.2, 0.1),   // jaw
  boxGeo(0.1, 0.06, 0.08, 0, -0.1, 0.17),  // nose
  boxGeo(0.36, 0.1, 0.34, 0, 0.19, -0.01), // hair patch
]);
const TORSO_GEO = mergeGeometries([
  boxGeo(0.6, 0.82, 0.36),
  boxGeo(0.7, 0.2, 0.4, 0, 0.36, 0),      // shoulders
  boxGeo(0.18, 0.4, 0.36, 0, -0.5, 0),    // hips
  boxGeo(0.22, 0.16, 0.05, -0.12, -0.1, 0.19), // blood stain
  boxGeo(0.12, 0.1, 0.05, 0.16, 0.12, 0.19),
]);
const ARM_GEO = mergeGeometries([
  boxGeo(0.15, 0.44, 0.15, 0, -0.2, 0),
  boxGeo(0.13, 0.4, 0.13, 0, -0.58, 0.08),
  boxGeo(0.14, 0.12, 0.2, 0, -0.8, 0.12), // hand
]);
const LEG_GEO = mergeGeometries([
  boxGeo(0.18, 0.42, 0.19, 0, -0.2, 0),
  boxGeo(0.16, 0.38, 0.17, 0, -0.58, 0.02),
  boxGeo(0.17, 0.1, 0.26, 0, -0.8, 0.06), // foot
]);

const VARIANTS = {
  walker: { scale: 1, speedMin: 1.0, speedMax: 1.8, points: 1, killFactor: 1, hit: 1, shirt: 0x6b5b42, skin: 0x8b9a6b, pants: 0x4a4235 },
  runner: { scale: 0.92, speedMin: 3.1, speedMax: 4.3, points: 2, killFactor: 0.85, hit: 0.8, shirt: 0x8c3a33, skin: 0x9aa47a, pants: 0x33302b },
  brute: { scale: 1.5, speedMin: 0.8, speedMax: 1.35, points: 3, killFactor: 1.55, hit: 1.7, shirt: 0x3f4650, skin: 0x767f5c, pants: 0x2a2723 },
  crawler: { scale: 0.85, speedMin: 2.4, speedMax: 3.2, points: 2, killFactor: 0.8, hit: 0.6, shirt: 0x5a5344, skin: 0x93a075, pants: 0x3b3630 },
  screamer: { scale: 1.05, speedMin: 1.4, speedMax: 2.0, points: 2, killFactor: 1, hit: 1, shirt: 0xb9b2a2, skin: 0xa8b18a, pants: 0x4d463c },
};

const rootDummy = new THREE.Object3D();
const partDummy = new THREE.Object3D();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

export class ZombieManager {
  constructor(scene, effects, isBlocked) {
    this.scene = scene;
    this.effects = effects;
    this.isBlocked = isBlocked || (() => false);
    this.zombies = [];
    this.active = 0;
    this.time = 0;

    const make = (geo, castShadow = true) => {
      const mesh = new THREE.InstancedMesh(
        geo,
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        MAX_ACTIVE
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = castShadow;
      mesh.frustumCulled = false;
      const white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < MAX_ACTIVE; i++) {
        mesh.setColorAt(i, white);
        mesh.setMatrixAt(i, zeroMat);
      }
      scene.add(mesh);
      return mesh;
    };

    this.parts = {
      torso: make(TORSO_GEO),
      head: make(HEAD_GEO),
      armL: make(ARM_GEO),
      armR: make(ARM_GEO),
      legL: make(LEG_GEO),
      legR: make(LEG_GEO),
    };

    // glowing eyes: two tiny emissive boxes per zombie, one instanced mesh
    const eyeGeo = mergeGeometries([boxGeo(0.07, 0.06, 0.03, -0.09, 0, 0.17), boxGeo(0.07, 0.06, 0.03, 0.09, 0, 0.17)]);
    this.eyes = new THREE.InstancedMesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffc85a }), MAX_ACTIVE);
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyes.frustumCulled = false;
    for (let i = 0; i < MAX_ACTIVE; i++) this.eyes.setMatrixAt(i, zeroMat);
    scene.add(this.eyes);
  }

  spawnAt(x, z, variant = 'walker') {
    let slot = this.zombies.findIndex((zz) => !zz.active);
    if (slot === -1) {
      if (this.zombies.length >= MAX_ACTIVE) return null;
      slot = this.zombies.length;
      this.zombies.push({
        active: false,
        index: slot,
        pos: new THREE.Vector3(),
        heading: 0,
        speed: 1,
        phase: 0,
        dying: false,
        deathT: 0,
        deathSpin: 0,
        riseT: 0,
        type: 'walker',
        points: 1,
        killFactor: 1,
        hit: 1,
        scale: 1,
        color: new THREE.Color(),
        shirt: new THREE.Color(),
        pants: new THREE.Color(),
      });
    }
    const cfg = VARIANTS[variant] || VARIANTS.walker;
    const zb = this.zombies[slot];
    zb.active = true;
    zb.index = slot;
    zb.type = variant;
    zb.variantCfg = cfg;
    zb.scale = cfg.scale * (0.94 + Math.random() * 0.12);
    zb.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    zb.points = cfg.points;
    zb.killFactor = cfg.killFactor;
    zb.hit = cfg.hit;
    zb.heading = Math.random() * Math.PI * 2;
    zb.pos.set(x, 0, z);
    zb.phase = Math.random() * Math.PI * 2;
    zb.dying = false;
    zb.deathT = 0;
    zb.deathSpin = 0;
    zb.riseT = 0.55;
    zb.color.setHex(cfg.skin);
    zb.shirt.setHex(cfg.shirt);
    zb.pants.setHex(cfg.pants);
    // slight per-zombie tint variation
    const v = 0.86 + Math.random() * 0.26;
    zb.color.multiplyScalar(v);
    zb.shirt.multiplyScalar(v);
    zb.pants.multiplyScalar(v);
    this.active = this.zombies.filter((zz) => zz.active).length;
    return zb;
  }

  spawnNear(pos, count, minRadius = 26, maxRadius = 74, difficulty = 0) {
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = minRadius + Math.random() * (maxRadius - minRadius);
        x = pos.x + Math.cos(a) * r;
        z = pos.z + Math.sin(a) * r;
        if (!this.isBlocked(x, z)) break;
      }
      const roll = Math.random();
      const bruteChance = 0.05 + Math.min(0.1, difficulty * 0.01);
      const runnerChance = 0.2 + Math.min(0.18, difficulty * 0.018);
      const crawlerChance = 0.08;
      const screamerChance = 0.05;
      let variant = 'walker';
      if (roll < bruteChance) variant = 'brute';
      else if (roll < bruteChance + runnerChance) variant = 'runner';
      else if (roll < bruteChance + runnerChance + crawlerChance) variant = 'crawler';
      else if (roll < bruteChance + runnerChance + crawlerChance + screamerChance) variant = 'screamer';
      this.spawnAt(x, z, variant);
    }
    this.active = this.zombies.filter((z) => z.active).length;
  }

  reset() {
    for (const z of this.zombies) z.active = false;
    this.zombies.length = 0;
    this.active = 0;
    this.writeInstances();
  }

  writeInstances() {
    const parts = this.parts;
    for (const zb of this.zombies) {
      const i = zb.index;
      if (!zb.active) {
        parts.torso.setMatrixAt(i, zeroMat);
        parts.head.setMatrixAt(i, zeroMat);
        parts.armL.setMatrixAt(i, zeroMat);
        parts.armR.setMatrixAt(i, zeroMat);
        parts.legL.setMatrixAt(i, zeroMat);
        parts.legR.setMatrixAt(i, zeroMat);
        this.eyes.setMatrixAt(i, zeroMat);
        continue;
      }

      const t = this.time;
      const dying = zb.dying;
      const rise = zb.riseT > 0 ? 1 - zb.riseT / 0.55 : 1;
      const scale = zb.scale * (dying ? 1 : 0.9 + rise * 0.1);

      rootDummy.position.set(zb.pos.x, zb.pos.y, zb.pos.z);
      rootDummy.rotation.set(
        dying ? Math.min(1.45, zb.deathT * 2.2) * (zb.deathSpin > 0 ? 1 : -1) : 0,
        zb.heading,
        dying ? zb.deathT * zb.deathSpin * 0.6 : Math.sin(zb.phase * 0.5) * 0.05
      );
      rootDummy.scale.set(scale, scale * (dying ? 1 : 0.25 + 0.75 * Math.min(1, rise)), scale);
      rootDummy.updateMatrix();

      const swing = Math.sin(zb.phase);
      const swing2 = Math.sin(zb.phase + Math.PI);
      const lurch = Math.sin(zb.phase * 2) * 0.08;
      const armBase = zb.type === 'crawler' ? -1.9 : -1.25;
      const bob = Math.sin(zb.phase * 2) * 0.03;

      const put = (mesh, geoHeight, px, py, pz, rx, ry, rz, color) => {
        partDummy.position.set(px, py + bob, pz);
        partDummy.rotation.set(rx, ry, rz);
        partDummy.scale.set(1, 1, 1);
        partDummy.updateMatrix();
        tmpMat.multiplyMatrices(rootDummy.matrix, partDummy.matrix);
        mesh.setMatrixAt(i, tmpMat);
        mesh.setColorAt(i, color);
      };

      put(parts.torso, 1, 0, 1.1, 0, lurch * 0.4, 0, lurch, zb.shirt);
      put(parts.head, 1, 0, 1.66, 0.08, -lurch * 0.6, Math.sin(zb.phase * 0.7) * 0.25, Math.sin(zb.phase) * 0.08, zb.color);
      put(parts.armL, 1, -0.38, 1.42, 0.02, armBase + Math.sin(zb.phase + 0.3) * 0.22, 0, -0.1 + swing * 0.06, zb.color);
      put(parts.armR, 1, 0.38, 1.42, 0.02, armBase + Math.sin(zb.phase + 2.2) * 0.22, 0, 0.1 + swing2 * 0.06, zb.color);
      put(parts.legL, 1, -0.16, 0.95, 0, swing * 0.55, 0, 0.05, zb.pants);
      put(parts.legR, 1, 0.16, 0.95, 0, swing2 * 0.55, 0, -0.05, zb.pants);

      // eyes follow the head
      partDummy.position.set(0, 1.74 + bob, 0.2);
      partDummy.rotation.set(-lurch * 0.6, Math.sin(zb.phase * 0.7) * 0.25, 0);
      partDummy.updateMatrix();
      tmpMat.multiplyMatrices(rootDummy.matrix, partDummy.matrix);
      this.eyes.setMatrixAt(i, tmpMat);
    }

    for (const mesh of Object.values(this.parts)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  update(dt, playerPos, playerSpeed, stats) {
    this.time += dt;
    const kills = [];
    const hits = [];
    const playerRadius = 1.35;
    const killR = stats.killRadius + 0.55;
    const hitDist = playerRadius + 1.05;

    for (const zb of this.zombies) {
      if (!zb.active) continue;

      if (zb.dying) {
        zb.deathT += dt;
        zb.pos.y = Math.max(-1.4, zb.pos.y - dt * 1.1);
        zb.heading += zb.deathSpin * dt * 0.4;
        if (zb.deathT > 1.6) {
          zb.active = false;
          this.active = Math.max(0, this.active - 1);
        }
        continue;
      }

      if (zb.riseT > 0) zb.riseT = Math.max(0, zb.riseT - dt);

      const dx = playerPos.x - zb.pos.x;
      const dz = playerPos.z - zb.pos.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;

      if (dist < 34 && dist > 0.01) {
        zb.heading = Math.atan2(dx, dz);
        moving = true;
        const chase = zb.type === 'runner' ? 1.2 : zb.type === 'crawler' ? 1.1 : 1;
        zb.pos.x += (dx / dist) * zb.speed * chase * dt;
        zb.pos.z += (dz / dist) * zb.speed * chase * dt;
      }

      const speedWalk = zb.type === 'crawler' ? 9 : 6 + zb.speed * 1.8;
      zb.phase += dt * (moving ? speedWalk : 1.6);

      if (dist < killR) {
        const killSpeed = stats.killSpeed * zb.killFactor;
        if (playerSpeed >= killSpeed) {
          zb.dying = true;
          zb.deathT = 0;
          zb.riseT = 0;
          zb.deathSpin = (Math.random() - 0.5) * 9;
          const dir = Math.sign(playerSpeed) || 1;
          this.effects.bloodBurst(tmpVec.set(zb.pos.x, 0.9, zb.pos.z), dir, zb.type === 'brute');
          this.effects.bloodDecal(zb.pos.x, zb.pos.z, 0.9 + Math.random() * 0.8);
          kills.push({ points: Math.round(stats.pointsPerKill * zb.points), type: zb.type, x: zb.pos.x, z: zb.pos.z });
          continue;
        }
      }

      if (dist < hitDist + 0.35 && Math.abs(playerSpeed) < 2.2) {
        zb.dying = true;
        zb.deathT = 0;
        zb.riseT = 0;
        zb.deathSpin = (Math.random() - 0.5) * 6;
        this.effects.bloodBurst(tmpVec.set(zb.pos.x, 0.9, zb.pos.z), 1, false);
        hits.push({ damage: stats.zombieDamage * zb.hit, x: zb.pos.x, z: zb.pos.z });
      }
    }

    this.active = this.zombies.filter((z) => z.active).length;
    this.writeInstances();
    return { kills, hits };
  }
}
