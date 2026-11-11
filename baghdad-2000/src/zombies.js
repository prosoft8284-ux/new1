import * as THREE from 'three';

const MAX_ACTIVE = 48;

const SKIN = new THREE.MeshLambertMaterial({ color: 0x8b9a6b });
const SKIN_DARK = new THREE.MeshLambertMaterial({ color: 0x6f7d55 });
const RAGS = new THREE.MeshLambertMaterial({ color: 0x6b5b42 });
const RAGS_DARK = new THREE.MeshLambertMaterial({ color: 0x4a4235 });
const EYES = new THREE.MeshBasicMaterial({ color: 0xffd166 });

const VARIANTS = {
  walker: { scale: 1, speedMin: 0.9, speedMax: 1.7, points: 1, killFactor: 1, hit: 1, rise: 0.55 },
  runner: { scale: 0.9, speedMin: 2.9, speedMax: 3.9, points: 2, killFactor: 0.85, hit: 0.8, rise: 0.3 },
  brute: { scale: 1.45, speedMin: 0.75, speedMax: 1.3, points: 3, killFactor: 1.55, hit: 1.6, rise: 0.8 },
};

export class ZombieManager {
  constructor(scene, effects, isBlocked) {
    this.scene = scene;
    this.effects = effects;
    this.isBlocked = isBlocked || (() => false);
    this.zombies = [];
    this.spawnTimer = 0;
    this.active = 0;
  }

  build(variant) {
    const cfg = VARIANTS[variant];
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.92, 0.4), variant === 'brute' ? RAGS_DARK : RAGS);
    torso.position.y = 1.12;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), SKIN);
    head.position.y = 1.78;
    head.castShadow = true;
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), EYES);
    eyeL.position.set(-0.09, 1.82, 0.18);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.09;
    const armGeo = new THREE.BoxGeometry(0.16, 0.78, 0.16);
    const armL = new THREE.Mesh(armGeo, SKIN_DARK);
    armL.position.set(-0.42, 1.2, 0.12);
    armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, SKIN_DARK);
    armR.position.set(0.42, 1.2, 0.12);
    armR.castShadow = true;
    const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
    const legL = new THREE.Mesh(legGeo, RAGS_DARK);
    legL.position.set(-0.17, 0.4, 0);
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, RAGS_DARK);
    legR.position.set(0.17, 0.4, 0);
    legR.castShadow = true;

    group.add(torso, head, eyeL, eyeR, armL, armR, legL, legR);
    group.scale.setScalar(cfg.scale);
    return { group, parts: { torso, head, armL, armR, legL, legR } };
  }

  spawnAt(x, z, variant = 'walker') {
    let z0 = this.zombies.find((zz) => !zz.active);
    if (!z0) {
      if (this.zombies.length >= MAX_ACTIVE) return null;
      z0 = {
        active: false,
        pos: new THREE.Vector3(),
        speed: 1,
        heading: 0,
        phase: Math.random() * Math.PI * 2,
        dying: false,
        deathT: 0,
        tumbleAxis: new THREE.Vector3(),
        spin: 0,
        type: 'walker',
        points: 1,
        killFactor: 1,
        hit: 1,
        scale: 1,
        riseT: 0,
        group: null,
        parts: null,
        variantCfg: VARIANTS.walker,
      };
      this.zombies.push(z0);
    }
    const cfg = VARIANTS[variant] || VARIANTS.walker;
    if (z0.group) {
      this.scene.remove(z0.group);
      z0.group.clear();
    }
    const built = this.build(variant);
    z0.group = built.group;
    z0.parts = built.parts;
    z0.variantCfg = cfg;
    z0.type = variant;
    z0.scale = cfg.scale;
    z0.points = cfg.points;
    z0.killFactor = cfg.killFactor;
    z0.hit = cfg.hit;
    z0.speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    z0.heading = Math.random() * Math.PI * 2;
    z0.pos.set(x, 0, z);
    z0.group.position.copy(z0.pos);
    z0.group.rotation.y = z0.heading;
    z0.dying = false;
    z0.deathT = 0;
    z0.riseT = cfg.rise;
    z0.active = true;
    z0.group.scale.y = 0.15;
    this.scene.add(z0.group);
    return z0;
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
      const bruteChance = 0.06 + Math.min(0.14, difficulty * 0.012);
      const runnerChance = 0.24 + Math.min(0.2, difficulty * 0.02);
      const variant = roll < bruteChance ? 'brute' : roll < bruteChance + runnerChance ? 'runner' : 'walker';
      this.spawnAt(x, z, variant);
    }
    this.active = this.zombies.filter((z) => z.active).length;
  }

  reset() {
    for (const z of this.zombies) {
      if (z.group) {
        this.scene.remove(z.group);
        z.group.clear();
      }
      z.active = false;
    }
    this.zombies.length = 0;
    this.active = 0;
    this.spawnTimer = 0;
  }

  update(dt, playerPos, playerSpeed, stats) {
    const kills = [];
    const hits = [];
    const playerRadius = 1.35;
    const killR = stats.killRadius + 0.55;

    for (const z of this.zombies) {
      if (!z.active) continue;

      if (z.dying) {
        z.deathT += dt;
        const t = z.deathT;
        z.group.rotation.x += z.spin * dt;
        z.group.rotation.z += z.spin * 0.6 * dt;
        z.group.position.y = Math.max(-1.2, -t * 1.35);
        if (t > 1.9) {
          this.scene.remove(z.group);
          z.group.clear();
          z.active = false;
          this.active = Math.max(0, this.active - 1);
        }
        continue;
      }

      if (z.riseT > 0) {
        z.riseT = Math.max(0, z.riseT - dt);
        const k = 1 - z.riseT / z.variantCfg.rise;
        z.group.scale.y = 0.15 + 0.85 * Math.min(1, k * 1.3);
        z.group.rotation.z = Math.sin(k * Math.PI) * 0.18;
      }

      const dx = playerPos.x - z.pos.x;
      const dz = playerPos.z - z.pos.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;

      if (dist < 30 && dist > 0.01) {
        z.heading = Math.atan2(dx, dz);
        moving = true;
        const chaseBoost = z.type === 'runner' ? 1.15 : 1;
        z.pos.x += (dx / dist) * z.speed * chaseBoost * dt;
        z.pos.z += (dz / dist) * z.speed * chaseBoost * dt;
      }

      z.group.position.x = z.pos.x;
      z.group.position.z = z.pos.z;
      z.group.rotation.y += (z.heading - z.group.rotation.y) * Math.min(1, dt * 6);

      // walk cycle
      z.phase += dt * (moving ? 6 + z.speed * 1.6 : 1.4);
      const swing = Math.sin(z.phase);
      const amp = moving ? 0.62 : 0.18;
      z.parts.legL.rotation.x = swing * amp;
      z.parts.legR.rotation.x = -swing * amp;
      z.parts.armL.rotation.x = -1.15 + Math.sin(z.phase + 0.4) * 0.16 * (moving ? 1 : 0.3);
      z.parts.armR.rotation.x = -1.05 + Math.sin(z.phase + 2.1) * 0.16 * (moving ? 1 : 0.3);
      z.parts.armL.rotation.z = 0.12;
      z.parts.armR.rotation.z = -0.12;
      z.parts.head.rotation.z = Math.sin(z.phase * 0.7) * 0.12;
      z.parts.torso.rotation.z = swing * 0.05;

      const hitDist = playerRadius + 1.05;
      if (dist < killR) {
        const killSpeed = stats.killSpeed * z.killFactor;
        if (playerSpeed >= killSpeed) {
          z.dying = true;
          z.deathT = 0;
          z.spin = (Math.random() - 0.5) * 7;
          const dir = Math.sign(playerSpeed) || 1;
          this.effects.bloodBurst(new THREE.Vector3(z.pos.x, 0.8, z.pos.z), dir, z.type === 'brute');
          kills.push({ points: Math.round(stats.pointsPerKill * z.points), type: z.type, x: z.pos.x, z: z.pos.z });
          continue;
        }
      }

      if (dist < hitDist + 0.35 && Math.abs(playerSpeed) < 2.2) {
        z.dying = true;
        z.deathT = 0;
        z.spin = (Math.random() - 0.5) * 5;
        this.effects.bloodBurst(new THREE.Vector3(z.pos.x, 0.8, z.pos.z), 1, false);
        hits.push({ damage: stats.zombieDamage * z.hit, x: z.pos.x, z: z.pos.z });
      }
    }

    this.active = this.zombies.filter((z) => z.active).length;
    return { kills, hits };
  }
}
