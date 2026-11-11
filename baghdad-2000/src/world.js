import * as THREE from 'three';

const GRID = 9;            // blocks per side
const CELL = 64;           // block pitch (includes road)
const ROAD = 15;           // road width
const HALF = (GRID * CELL) / 2;   // 288 -> world spans -288..288
const BUILD = CELL - ROAD; // buildable width inside a block

const SAND_COLORS = ['#c9b58b', '#bfa87c', '#d3c09a', '#b39b73', '#cbb894', '#af9670'];
const WALL_WINDOWS = '#4a4032';

let seed = 2000;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function range(a, b) {
  return a + rnd() * (b - a);
}

function makeWindowTexture(base, windows) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // subtle plaster noise
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
  }
  ctx.fillStyle = windows;
  ctx.fillRect(10, 14, 14, 18);
  ctx.fillRect(38, 14, 16, 18);
  ctx.fillRect(10, 44, 14, 12);
  ctx.fillRect(38, 44, 16, 12);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.5, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSignTexture(text, bg = '#1d2a24', fg = '#f2e3bf') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(242,227,191,0.5)';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = fg;
  ctx.font = 'bold 84px Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(text, 256, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(scene) {
  const colliders = [];
  const root = new THREE.Group();
  scene.add(root);

  scene.background = new THREE.Color('#cbb489');
  scene.fog = new THREE.Fog('#cbb489', 70, 430);

  // lights
  const hemi = new THREE.HemisphereLight(0xe8d6b4, 0x7d6b4e, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b0, 2.1);
  sun.position.set(90, 130, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // roads
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x6d675c, roughness: 0.95 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb8a67f, roughness: 1 });
  for (let i = 0; i <= GRID; i++) {
    const p = -HALF + CELL * i;
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2), asphalt);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(p, 0.02, 0);
    ns.receiveShadow = true;
    root.add(ns);

    const ew = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, ROAD), asphalt);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.025, p);
    ew.receiveShadow = true;
    root.add(ew);

    // sidewalk strips along the roads
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.4, HALF * 2), sidewalkMat);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(p + side * (ROAD / 2 + 1.2), 0.035, 0);
      root.add(sw);

      const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 2.4), sidewalkMat);
      sw2.rotation.x = -Math.PI / 2;
      sw2.position.set(0, 0.04, p + side * (ROAD / 2 + 1.2));
      root.add(sw2);
    }
  }

  // lane dashes
  const dashGeo = new THREE.BoxGeometry(0.28, 0.04, 2.6);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 4; d < HALF - 4; d += 10) {
      const nearIntersection = Math.abs(((d + HALF) % CELL) - 0) < ROAD / 2 + 2 ||
        Math.abs(((d + HALF) % CELL) - CELL) < ROAD / 2 + 2;
      if (nearIntersection) continue;
      const a = new THREE.Mesh(dashGeo, dashMat);
      a.position.set(line, 0.05, d);
      root.add(a);
      const b = new THREE.Mesh(dashGeo, dashMat);
      b.rotation.y = Math.PI / 2;
      b.position.set(d, 0.05, line);
      root.add(b);
    }
  }

  // shared wall materials
  const wallMats = SAND_COLORS.slice(0, 4).map(
    (c) => new THREE.MeshStandardMaterial({ map: makeWindowTexture(c, WALL_WINDOWS), roughness: 0.9 })
  );
  const flatMats = SAND_COLORS.slice(4).map(
    (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.95 })
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xa9926c, roughness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a4136, roughness: 0.9 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.6, metalness: 0.4 });

  function addCollider(cx, cz, w, d) {
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  function addBuilding(cx, cz, w, d, h, district) {
    const mat = rnd() < 0.62 ? pick(wallMats) : pick(flatMats);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(cx, h / 2, cz);
    b.castShadow = true;
    b.receiveShadow = true;
    root.add(b);

    // parapet
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5),
      roofMat
    );
    parapet.position.set(cx, h + 0.35, cz);
    parapet.castShadow = true;
    root.add(parapet);

    // roof clutter: water tank, AC units, satellite dish
    if (rnd() < 0.6) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), darkMat);
      tank.position.set(cx + range(-w / 3, w / 3), h + 1.5, cz + range(-d / 3, d / 3));
      tank.castShadow = true;
      root.add(tank);
    }
    if (rnd() < 0.5) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), metalMat);
      ac.position.set(cx + range(-w / 3, w / 3), h + 1.1, cz + range(-d / 3, d / 3));
      root.add(ac);
    }
    if (district === 'residential' && rnd() < 0.35) {
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd9d4c4, roughness: 0.7, side: THREE.DoubleSide })
      );
      dish.position.set(cx + range(-w / 3, w / 3), h + 0.9, cz + range(-d / 3, d / 3));
      dish.rotation.set(Math.PI / 2.4, 0.4, 0);
      root.add(dish);
    }

    addCollider(cx, cz, w, d);
  }

  function blockBounds(i, j) {
    const cx = -HALF + CELL * (i + 0.5);
    const cz = -HALF + CELL * (j + 0.5);
    return { cx, cz, half: BUILD / 2 };
  }

  const billboards = ['ورشة الميكانيك', 'مطعم بغداد', 'بنزين', 'سوق الشورجة', 'فندق الرشيد'];
  let billboardIndex = 0;

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const { cx, cz, half } = blockBounds(i, j);
      const distFromCenter = Math.hypot(cx, cz);
      const district = distFromCenter < 90 ? 'market' : distFromCenter < 190 ? 'residential' : 'industrial';

      // 1-3 buildings per block using simple rejection sampling
      const wanted = district === 'market' ? 3 : district === 'industrial' ? 1 : 2;
      let placed = 0;
      let tries = 0;
      while (placed < wanted && tries < 14) {
        tries++;
        const w = range(12, Math.min(24, BUILD - 6));
        const d = range(12, Math.min(24, BUILD - 6));
        const x = cx + range(-half + w / 2, half - w / 2);
        const z = cz + range(-half + d / 2, half - d / 2);

        const overlaps = colliders.some(
          (c) =>
            x + w / 2 > c.minX - 3 &&
            x - w / 2 < c.maxX + 3 &&
            z + d / 2 > c.minZ - 3 &&
            z - d / 2 < c.maxZ + 3
        );
        if (overlaps) continue;

        const h =
          district === 'market'
            ? range(10, 26)
            : district === 'residential'
              ? range(7, 17)
              : range(5, 10);
        addBuilding(x, z, w, d, h, district);
        placed++;
      }

      // street props
      if (district === 'market' && rnd() < 0.5) {
        const kx = cx + range(-half, half);
        const kz = cz + (half + 4) * (rnd() < 0.5 ? 1 : -1);
        const kiosk = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 2.6, 2.4),
          new THREE.MeshStandardMaterial({ color: 0x9c7a52, roughness: 0.9 })
        );
        box.position.y = 1.3;
        box.castShadow = true;
        kiosk.add(box);
        const awning = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 0.12, 3),
          new THREE.MeshStandardMaterial({ color: pick(['#8d3f2f', '#3f5c4a', '#7a6a3a']), roughness: 0.9 })
        );
        awning.position.set(0, 2.7, 0.2);
        awning.rotation.x = -0.12;
        kiosk.add(awning);
        kiosk.position.set(kx, 0, kz);
        root.add(kiosk);
        addCollider(kx, kz, 3.2, 2.4);
      }

      if (rnd() < 0.35) {
        // concrete blast wall (T-wall)
        const bx = cx + (half + 2) * (rnd() < 0.5 ? 1 : -1);
        const bz = cz + range(-half, half);
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 2.6, 6),
          new THREE.MeshStandardMaterial({ color: 0xbdb6a4, roughness: 0.95 })
        );
        wall.position.set(bx, 1.3, bz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        root.add(wall);
        addCollider(bx, bz, 0.7, 6);
      }

      if (rnd() < 0.3) {
        // barrel cluster
        for (let b = 0; b < 3; b++) {
          const bxx = cx + range(-half, half);
          const bzz = cz + range(-half, half);
          const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10),
            new THREE.MeshStandardMaterial({ color: b % 2 ? 0x8a4b2a : 0x4f6a55, roughness: 0.85 })
          );
          barrel.position.set(bxx, 0.48, bzz);
          barrel.castShadow = true;
          root.add(barrel);
        }
      }

      // billboards at block corners facing the main roads
      if ((i + j) % 7 === 3 && billboardIndex < billboards.length) {
        const sign = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6, 8), metalMat);
        post.position.y = 3;
        sign.add(post);
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 3.4),
          new THREE.MeshStandardMaterial({ map: makeSignTexture(billboards[billboardIndex++]), roughness: 0.9, side: THREE.DoubleSide })
        );
        panel.position.set(0, 6.2, 0);
        sign.add(panel);
        sign.position.set(cx + half - 2, 0, cz - half + 2);
        sign.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
        root.add(sign);
      }
    }
  }

  // palms along the roads
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b6a4c, roughness: 0.95 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x4e6b34, roughness: 0.9 });
  const frondGeo = new THREE.ConeGeometry(0.55, 3.4, 5);
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 10; d < HALF - 10; d += 26) {
      if (rnd() < 0.35) continue;
      for (const axis of ['x', 'z']) {
        if (rnd() < 0.5) continue;
        const px = axis === 'x' ? line + (ROAD / 2 + 2.2) * (rnd() < 0.5 ? 1 : -1) : d;
        const pz = axis === 'x' ? d : line + (ROAD / 2 + 2.2) * (rnd() < 0.5 ? 1 : -1);
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 4.6, 7), trunkMat);
        trunk.position.y = 2.3;
        trunk.castShadow = true;
        palm.add(trunk);
        for (let f = 0; f < 6; f++) {
          const frond = new THREE.Mesh(frondGeo, frondMat);
          frond.position.y = 4.7;
          frond.rotation.z = Math.PI / 2.6;
          frond.rotation.y = (f / 6) * Math.PI * 2;
          frond.position.x = Math.cos((f / 6) * Math.PI * 2) * 1.1;
          frond.position.z = Math.sin((f / 6) * Math.PI * 2) * 1.1;
          palm.add(frond);
        }
        palm.position.set(px, 0, pz);
        root.add(palm);
        addCollider(px, pz, 0.8, 0.8);
      }
    }
  }

  // street lamps
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x4c4a44, roughness: 0.7, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffcf7a, emissiveIntensity: 0.6 });
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 18; d < HALF - 18; d += 48) {
      const x = line + ROAD / 2 + 1.6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), lampMat);
      pole.position.set(x, 3.5, d);
      root.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), lampMat);
      arm.position.set(x - 0.7, 7, d);
      root.add(arm);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), bulbMat);
      bulb.position.set(x - 1.4, 6.9, d);
      root.add(bulb);
    }
  }

  // checkpoints on two main roads
  for (const [cx, cz, rot] of [
    [0, -HALF + CELL * 3, 0],
    [-HALF + CELL * 6, 0, Math.PI / 2],
  ]) {
    for (const side of [-1, 1]) {
      const gate = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.8, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xc3bca9, roughness: 0.95 })
      );
      const off = 7.2 * side;
      gate.position.set(cx + (rot ? 0 : off), 1.4, cz + (rot ? off : 0));
      gate.rotation.y = rot;
      gate.castShadow = true;
      root.add(gate);
      addCollider(gate.position.x, gate.position.z, rot ? 0.9 : 2.2, rot ? 2.2 : 0.9);
    }
  }

  // drifting dust
  const DUST = 700;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = range(-140, 140);
    dustPos[i * 3 + 1] = range(0.5, 26);
    dustPos[i * 3 + 2] = range(-140, 140);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xe6d3ab, size: 0.5, transparent: true, opacity: 0.45, depthWrite: false })
  );
  root.add(dust);

  // spawn points along the roads
  const spawnPoints = [];
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 8; d < HALF - 8; d += 16) {
      spawnPoints.push(new THREE.Vector3(line + range(-4, 4), 0, d));
      spawnPoints.push(new THREE.Vector3(d, 0, line + range(-4, 4)));
    }
  }

  // start on a north-south road (x = -32) at an intersection, facing +z
  const carStart = new THREE.Vector3(-HALF + CELL * 4, 0, -HALF + CELL * 2);
  let headingStart = 0;

  const tmp = new THREE.Vector3();
  function update(dt, playerPos) {
    const arr = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      arr[i * 3] += dt * 1.6;
      arr[i * 3 + 1] += Math.sin(performance.now() * 0.001 + i) * dt * 0.15;
      arr[i * 3 + 2] += dt * 0.8;
      // wrap into a box around the player
      if (arr[i * 3] - playerPos.x > 140) arr[i * 3] -= 280;
      if (arr[i * 3] - playerPos.x < -140) arr[i * 3] += 280;
      if (arr[i * 3 + 2] - playerPos.z > 140) arr[i * 3 + 2] -= 280;
      if (arr[i * 3 + 2] - playerPos.z < -140) arr[i * 3 + 2] += 280;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // keep shadows crisp around the car
    tmp.copy(playerPos);
    sun.position.set(tmp.x + 90, 130, tmp.z + 60);
    sun.target.position.copy(tmp);
    sun.target.updateMatrixWorld();
  }

  function isInsideBuilding(x, z, pad = 0) {
    return colliders.some(
      (c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad
    );
  }

  return {
    colliders,
    spawnPoints,
    carStart,
    headingStart,
    update,
    isInsideBuilding,
    bounds: HALF,
  };
}
