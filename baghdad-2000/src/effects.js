import * as THREE from 'three';

// Pooled billboard particles + ground skid marks, all instanced.

let SOFT_SPRITE = null;
function softSprite() {
  if (SOFT_SPRITE) return SOFT_SPRITE;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  SOFT_SPRITE = new THREE.CanvasTexture(c);
  return SOFT_SPRITE;
}

function makeLayer(scene, max, blending) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
    alphaMap: softSprite(),
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const white = new THREE.Color(1, 1, 1);
  const d = new THREE.Object3D();
  d.position.set(0, -500, 0);
  d.scale.setScalar(0);
  d.updateMatrix();
  for (let i = 0; i < max; i++) {
    mesh.setColorAt(i, white);
    mesh.setMatrixAt(i, d.matrix);
  }
  scene.add(mesh);
  const items = [];
  for (let i = 0; i < max; i++) {
    items.push({
      active: false,
      life: 0,
      maxLife: 1,
      size: 1,
      color: new THREE.Color(),
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      gravity: 0,
      drag: 0,
      billboard: true,
    });
  }
  return { mesh, items, cursor: 0, max };
}

export function createEffects(scene) {
  const dust = makeLayer(scene, 200, THREE.NormalBlending);
  const blood = makeLayer(scene, 160, THREE.NormalBlending);
  const sparks = makeLayer(scene, 120, THREE.AdditiveBlending);
  const skids = makeLayer(scene, 140, THREE.NormalBlending);

  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  function spawn(layer, opts) {
    const p = layer.items[layer.cursor];
    layer.cursor = (layer.cursor + 1) % layer.max;
    p.active = true;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.size = opts.size;
    p.color.set(opts.color);
    p.pos.copy(opts.pos);
    p.vel.copy(opts.vel || tmp.set(0, 0, 0));
    p.gravity = opts.gravity || 0;
    p.drag = opts.drag || 0;
    p.billboard = opts.billboard !== false;
    p.spin = opts.spin || 0;
    p.rot = Math.random() * Math.PI * 2;
    return p;
  }

  function updateLayer(layer, dt, camera) {
    const { mesh, items } = layer;
    let dirty = false;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        dummy.position.set(0, -500, 0);
        dummy.scale.setScalar(0);
        dummy.quaternion.identity();
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        dirty = true;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03 && p.gravity > 0) {
        p.pos.y = 0.03;
        p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4);
        p.gravity = 0;
      }

      const lifeK = p.life / p.maxLife;
      const scale = p.size * (0.35 + 0.65 * lifeK);
      dummy.position.copy(p.pos);
      if (p.billboard) {
        dummy.quaternion.copy(camera.quaternion);
      } else {
        dummy.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, p.rot));
      }
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      tmpColor.copy(p.color).multiplyScalar(0.15 + 0.85 * lifeK);
      mesh.setColorAt(i, tmpColor);
      dirty = true;
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    dustBurst(pos, count = 3, power = 1) {
      for (let i = 0; i < count; i++) {
        spawn(dust, {
          pos: tmp.set(pos.x + (Math.random() - 0.5) * 0.8, 0.15 + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * 0.8).clone(),
          vel: new THREE.Vector3((Math.random() - 0.5) * 2 * power, 0.6 + Math.random() * 1.4 * power, (Math.random() - 0.5) * 2 * power),
          life: 0.4 + Math.random() * 0.4,
          size: 0.16 + Math.random() * 0.2,
          color: 0xc9b68e,
          gravity: -0.6,
          drag: 1.4,
        });
      }
    },

    exhaust(pos, boosting) {
      spawn(dust, {
        pos: tmp.copy(pos).clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6),
        life: boosting ? 0.28 : 0.4,
        size: boosting ? 0.11 : 0.14,
        color: boosting ? 0x9fb3c9 : 0x8d887c,
        gravity: -0.5,
        drag: 2.2,
      });
    },

    bloodBurst(pos, dir = 1, big = false) {
      const n = big ? 22 : 12;
      for (let i = 0; i < n; i++) {
        spawn(blood, {
          pos: tmp.set(pos.x, 0.7 + Math.random() * 0.7, pos.z).clone(),
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            1.5 + Math.random() * 4.5,
            (Math.random() - 0.5) * 6 + dir * 2
          ),
          life: 0.35 + Math.random() * 0.45,
          size: 0.1 + Math.random() * 0.16,
          color: 0x7a1712,
          gravity: 12,
          drag: 0.6,
        });
      }
    },

    sparkBurst(pos, power = 1) {
      for (let i = 0; i < 10 * power; i++) {
        spawn(sparks, {
          pos: tmp.set(pos.x, 0.5 + Math.random() * 0.7, pos.z).clone(),
          vel: new THREE.Vector3((Math.random() - 0.5) * 9, 1 + Math.random() * 5, (Math.random() - 0.5) * 9),
          life: 0.25 + Math.random() * 0.35,
          size: 0.12 + Math.random() * 0.12,
          color: 0xffc46b,
          gravity: 14,
          drag: 0.4,
        });
      }
    },

    smokePuff(pos) {
      spawn(dust, {
        pos: tmp.set(pos.x, 1 + Math.random() * 0.4, pos.z).clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8),
        life: 1.05,
        size: 0.32 + Math.random() * 0.3,
        color: 0x3b3833,
        gravity: -0.35,
        drag: 1.1,
      });
    },

    bloodDecal(x, z, size = 0.9) {
      const p = spawn(skids, {
        pos: tmp.set(x, 0.05, z).clone(),
        vel: new THREE.Vector3(0, 0, 0),
        life: 16,
        size,
        color: 0x4a0d0a,
        billboard: false,
      });
      p.rot = Math.random() * Math.PI * 2;
      return p;
    },

    skidMark(x, z, heading) {
      const p = spawn(skids, {
        pos: tmp.set(x, 0.055, z).clone(),
        vel: new THREE.Vector3(0, 0, 0),
        life: 9,
        size: 0.55,
        color: 0x2a2621,
        billboard: false,
      });
      p.rot = heading;
      p.spin = 0;
      return p;
    },

    update(dt, camera) {
      updateLayer(dust, dt, camera);
      updateLayer(blood, dt, camera);
      updateLayer(sparks, dt, camera);
      updateLayer(skids, dt, camera);
    },
  };
}
