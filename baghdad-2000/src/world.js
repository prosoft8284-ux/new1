import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GRID = 9;
const CELL = 64;
const ROAD = 15;
const HALF = (GRID * CELL) / 2;
const BUILD = CELL - ROAD;

const SAND_COLORS = ['#c9b58b', '#bfa87c', '#d3c09a', '#b39b73', '#cbb894', '#af9670'];
const BILLBOARD_TEXTS = ['ورشة الميكانيك', 'مطعم بغداد', 'بنزين', 'سوق الشورجة', 'فندق الرشيد'];
const WALL_WINDOWS = '#3a3126';

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
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < 40; i++) ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
  ctx.fillStyle = 'rgba(120,90,50,0.12)';
  ctx.fillRect(0, 30, size, 3);
  ctx.fillStyle = windows;
  ctx.fillRect(9, 12, 15, 17);
  ctx.fillRect(38, 12, 16, 17);
  ctx.fillRect(9, 42, 15, 13);
  ctx.fillRect(38, 42, 16, 13);
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

function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8b286';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgba(${v + 40}, ${v + 22}, ${v - 18}, ${0.05 + Math.random() * 0.16})`;
    const s = Math.random() * 3 + 0.6;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120, 100, 70, ${0.03 + Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 26, 8 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(46, 46);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

function makeAsphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#6b655a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = 70 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 10}, ${0.08 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(40,38,34,${0.2 + Math.random() * 0.25})`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

export function createWorld(scene) {
  const colliders = [];
  const root = new THREE.Group();
  scene.add(root);

  // ---- golden hour atmosphere ----
  const fogColor = new THREE.Color('#e3c69b');
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 58, 460);

  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x6b5636, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a2, 2.6);
  sun.position.set(110, 74, 52);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(640, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#5f7d9e') },
        horizonColor: { value: new THREE.Color('#e9c88f') },
        lowColor: { value: new THREE.Color('#f6dcae') },
        sunColor: { value: new THREE.Color('#fff2cf') },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 lowColor;
        uniform vec3 sunColor;
        void main() {
          float h = clamp(vPos.y, -0.2, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(clamp(h * 1.5, 0.0, 1.0), 0.8));
          col = mix(lowColor, col, smoothstep(-0.05, 0.22, h));
          float sun = pow(max(dot(vPos, normalize(vec3(0.72, 0.34, 0.34))), 0.0), 34.0);
          float glow = pow(max(dot(vPos, normalize(vec3(0.72, 0.34, 0.34))), 0.0), 5.0);
          col = mix(col, sunColor, sun * 0.95);
          col += sunColor * glow * 0.14;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // ---- ground + roads ----
  const sandTex = makeSandTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshLambertMaterial({ map: sandTex, color: 0xffffff })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const asphalt = new THREE.MeshLambertMaterial({ map: makeAsphaltTexture() });
  asphalt.map.repeat.set(1, 10);
  const asphaltEW = new THREE.MeshLambertMaterial({ map: asphalt.map.clone() });
  asphaltEW.map.repeat.set(10, 1);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb9a87f });

  for (let i = 0; i <= GRID; i++) {
    const p = -HALF + CELL * i;
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2), asphalt);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(p, 0.02, 0);
    ns.receiveShadow = true;
    root.add(ns);

    const ew = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, ROAD), asphaltEW);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.025, p);
    ew.receiveShadow = true;
    root.add(ew);

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
  const dashGeo = new THREE.BoxGeometry(0.26, 0.04, 2.4);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 4; d < HALF - 4; d += 11) {
      const nearIntersection = Math.abs(((d + HALF) % CELL) - 0) < ROAD / 2 + 2 || Math.abs(((d + HALF) % CELL) - CELL) < ROAD / 2 + 2;
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

  // crosswalks at the central intersections
  const stripeGeo = new THREE.BoxGeometry(1.1, 0.03, 3.4);
  for (let i = 3; i <= 6; i++) {
    for (let j = 3; j <= 6; j++) {
      const cx = -HALF + CELL * i;
      const cz = -HALF + CELL * j;
      for (let s = -3; s <= 3; s++) {
        const a = new THREE.Mesh(stripeGeo, dashMat);
        a.position.set(cx + s * 1.7, 0.045, cz + ROAD / 2 + 2.4);
        root.add(a);
        const b = new THREE.Mesh(stripeGeo, dashMat);
        b.position.set(cx + s * 1.7, 0.045, cz - ROAD / 2 - 2.4);
        root.add(b);
      }
    }
  }

  // ---- building materials ----
  const wallMats = SAND_COLORS.slice(0, 4).map(
    (c) => new THREE.MeshLambertMaterial({ map: makeWindowTexture(c, WALL_WINDOWS) })
  );
  const flatMats = SAND_COLORS.slice(4).map(
    (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) })
  );
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xa9926c });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x453c31 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.6, metalness: 0.4 });
  const awningMats = ['#8d3f2f', '#3f5c4a', '#7a6a3a', '#5a4a6a'].map((c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
  // Shared prop materials: one instance each keeps the merged static city close
  // to a dozen draw calls instead of hundreds.
  const blastWallMat = new THREE.MeshLambertMaterial({ color: 0xbdb6a4 });
  const rubbleMat = new THREE.MeshLambertMaterial({ color: 0xa89b83 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1d1b18 });
  const dishMat = new THREE.MeshLambertMaterial({ color: 0xd9d4c4, side: THREE.DoubleSide });
  const sandbagMat = new THREE.MeshLambertMaterial({ color: 0xa89a76 });
  const gateMat = new THREE.MeshLambertMaterial({ color: 0xc3bca9 });
  const dumpsterMats = ['#3f5c4a', '#4a5560', '#5a4a33'].map((c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
  const shopSignMats = ['مطعم', 'بقالة', 'ورشة', 'شاي', 'فندق'].map(
    (t) => new THREE.MeshLambertMaterial({ map: makeSignTexture(t), side: THREE.DoubleSide })
  );
  const billboardMats = BILLBOARD_TEXTS.map((t) => new THREE.MeshLambertMaterial({ map: makeSignTexture(t), side: THREE.DoubleSide }));

  function addCollider(cx, cz, w, d) {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  function addBuilding(cx, cz, w, d, h, district) {
    const mat = rnd() < 0.66 ? pick(wallMats) : pick(flatMats);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(cx, h / 2, cz);
    b.castShadow = true;
    b.receiveShadow = true;
    root.add(b);

    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5), roofMat);
    parapet.position.set(cx, h + 0.35, cz);
    parapet.castShadow = true;
    root.add(parapet);

    if (rnd() < 0.65) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), darkMat);
      tank.position.set(cx + range(-w / 3, w / 3), h + 1.5, cz + range(-d / 3, d / 3));
      tank.castShadow = true;
      root.add(tank);
    }
    if (rnd() < 0.55) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), metalMat);
      ac.position.set(cx + range(-w / 3, w / 3), h + 1.1, cz + range(-d / 3, d / 3));
      root.add(ac);
    }
    if (district === 'residential' && rnd() < 0.4) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dishMat);
      dish.position.set(cx + range(-w / 3, w / 3), h + 0.9, cz + range(-d / 3, d / 3));
      dish.rotation.set(Math.PI / 2.4, 0.4, 0);
      root.add(dish);
    }

    // ground-floor shopfront in the market district
    if (district === 'market') {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.14, 1.8), pick(awningMats));
      awning.position.set(cx, 3.1, cz + d / 2 + 0.9);
      awning.rotation.x = -0.16;
      awning.castShadow = true;
      root.add(awning);
      const shop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 2.2, 0.12), darkMat);
      shop.position.set(cx, 1.2, cz + d / 2 + 0.06);
      root.add(shop);
      if (rnd() < 0.7) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 1.5),
          pick(shopSignMats)
        );
        sign.position.set(cx + range(-w / 4, w / 4), 3.9, cz + d / 2 + 0.12);
        root.add(sign);
      }
    }

    addCollider(cx, cz, w, d);
  }

  const blockBounds = (i, j) => ({
    cx: -HALF + CELL * (i + 0.5),
    cz: -HALF + CELL * (j + 0.5),
    half: BUILD / 2,
  });

  const billboards = BILLBOARD_TEXTS;
  let billboardIndex = 0;

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const { cx, cz, half } = blockBounds(i, j);
      const dist = Math.hypot(cx, cz);
      const district = dist < 95 ? 'market' : dist < 195 ? 'residential' : 'industrial';

      const wanted = district === 'market' ? 3 : district === 'industrial' ? 1 : 2;
      let placed = 0;
      let tries = 0;
      while (placed < wanted && tries < 16) {
        tries++;
        const w = range(11, Math.min(23, BUILD - 6));
        const d = range(11, Math.min(23, BUILD - 6));
        const x = cx + range(-half + w / 2, half - w / 2);
        const z = cz + range(-half + d / 2, half - d / 2);
        const overlaps = colliders.some(
          (c) => x + w / 2 > c.minX - 3 && x - w / 2 < c.maxX + 3 && z + d / 2 > c.minZ - 3 && z - d / 2 < c.maxZ + 3
        );
        if (overlaps) continue;
        const h = district === 'market' ? range(10, 25) : district === 'residential' ? range(7, 16) : range(5, 10);
        addBuilding(x, z, w, d, h, district);
        placed++;
      }

      if (rnd() < 0.35) {
        const bx = cx + (half + 2) * (rnd() < 0.5 ? 1 : -1);
        const bz = cz + range(-half, half);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 6), blastWallMat);
        wall.position.set(bx, 1.3, bz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        root.add(wall);
        addCollider(bx, bz, 0.7, 6);
      }

      // rubble + tyres + barrels give the blocks texture
      for (let k = 0; k < 3; k++) {
        if (rnd() < 0.55) {
          const rx = cx + range(-half, half);
          const rz = cz + range(-half, half);
          const rubble = new THREE.Mesh(new THREE.BoxGeometry(range(0.8, 1.8), range(0.3, 0.7), range(0.8, 1.8)), rubbleMat);
          rubble.position.set(rx, 0.2, rz);
          rubble.rotation.y = rnd() * 3;
          rubble.castShadow = true;
          root.add(rubble);
        }
      }
      if (rnd() < 0.4) {
        const tx = cx + range(-half, half);
        const tz = cz + (half + 3) * (rnd() < 0.5 ? 1 : -1);
        for (let t = 0; t < 3; t++) {
          const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 6, 12), tyreMat);
          tyre.rotation.x = Math.PI / 2;
          tyre.position.set(tx, 0.18 + t * 0.24, tz);
          root.add(tyre);
        }
        addCollider(tx, tz, 1, 1);
      }
      if (rnd() < 0.25) {
        const dx2 = cx + range(-half, half);
        const dz2 = cz + range(-half, half);
        const dumpster = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), pick(dumpsterMats));
        dumpster.position.set(dx2, 0.6, dz2);
        dumpster.castShadow = true;
        root.add(dumpster);
        addCollider(dx2, dz2, 2.2, 1.4);
      }

      if ((i + j) % 7 === 3 && billboardIndex < billboards.length) {
        const sign = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6, 8), metalMat);
        post.position.y = 3;
        sign.add(post);
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 3.4),
          billboardMats[billboardIndex++ % billboardMats.length]
        );
        panel.position.set(0, 6.2, 0);
        sign.add(panel);
        sign.position.set(cx + half - 2, 0, cz - half + 2);
        sign.rotation.y = rnd() < 0.5 ? 0 : Math.PI / 2;
        root.add(sign);
      }
    }
  }

  // ---- parked cars along the roads ----
  const parkedBodyMats = [0x7a2b25, 0x2f4a5a, 0x6d6a5f, 0x8a7b4a, 0x3d4a3a, 0x5a3a3a].map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );
  const parkedGlassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a30 });
  const parkedTyreMat = new THREE.MeshLambertMaterial({ color: 0x141312 });
  function addParkedCar(cx, cz, rot) {
    const g = new THREE.Group();
    const bodyMat = pick(parkedBodyMats);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.46, 3.9), bodyMat);
    hull.position.y = 0.62;
    hull.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.42, 1.8), bodyMat);
    cabin.position.set(0, 1.04, -0.1);
    cabin.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 1.7), parkedGlassMat);
    glass.position.set(0, 1.06, -0.1);
    g.add(hull, cabin, glass);
    const tyreGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12);
    for (const [x, z] of [[-0.82, 1.3], [0.82, 1.3], [-0.82, -1.35], [0.82, -1.35]]) {
      const w = new THREE.Mesh(tyreGeo, parkedTyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.33, z);
      g.add(w);
    }
    g.position.set(cx, 0, cz);
    g.rotation.y = rot;
    root.add(g);
    const wide = Math.abs(Math.cos(rot)) > 0.5;
    addCollider(cx, cz, wide ? 2 : 4, wide ? 4 : 2);
  }

  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 20; d < HALF - 20; d += 37) {
      if (rnd() < 0.55) {
        const side = rnd() < 0.5 ? 1 : -1;
        addParkedCar(line + side * (ROAD / 2 - 1.6), d, 0);
      }
      if (rnd() < 0.4) {
        const side = rnd() < 0.5 ? 1 : -1;
        addParkedCar(d, line + side * (ROAD / 2 - 1.6), Math.PI / 2);
      }
    }
  }

  // ---- palms ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7b6a4c });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x4e6b34 });
  const frondGeo = new THREE.ConeGeometry(0.5, 3.2, 5);
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 12; d < HALF - 12; d += 27) {
      if (rnd() < 0.4) continue;
      const axis = rnd() < 0.5;
      const side = rnd() < 0.5 ? 1 : -1;
      const px = axis ? line + side * (ROAD / 2 + 2.4) : d;
      const pz = axis ? d : line + side * (ROAD / 2 + 2.4);
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 4.6, 7), trunkMat);
      trunk.position.y = 2.3;
      trunk.castShadow = true;
      palm.add(trunk);
      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(Math.cos((f / 6) * Math.PI * 2) * 1.1, 4.7, Math.sin((f / 6) * Math.PI * 2) * 1.1);
        frond.rotation.z = Math.PI / 2.6;
        frond.rotation.y = (f / 6) * Math.PI * 2;
        palm.add(frond);
      }
      palm.position.set(px, 0, pz);
      root.add(palm);
      addCollider(px, pz, 0.8, 0.8);
    }
  }

  // ---- street lamps ----
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x44423c });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff0c0, emissive: 0xffcf7a, emissiveIntensity: 0.7 });
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

  // ---- power poles + wires ----
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x6b6152 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2f2b26, transparent: true, opacity: 0.75 });
  for (let i = 0; i <= GRID; i += 3) {
    const line = -HALF + CELL * i;
    const points = [];
    for (let d = -HALF + 24; d < HALF - 24; d += 56) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 9, 6), poleMat);
      pole.position.set(line + ROAD / 2 + 3.4, 4.5, d);
      pole.castShadow = true;
      root.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), poleMat);
      arm.position.set(line + ROAD / 2 + 3.4, 8.4, d);
      root.add(arm);
      points.push(new THREE.Vector3(line + ROAD / 2 + 3.4, 8.6, d));
    }
    if (points.length > 1) {
      const wirePts = [];
      for (let k = 0; k < points.length - 1; k++) {
        const a = points[k];
        const b = points[k + 1];
        for (let s = 0; s < 8; s++) {
          const t = s / 8;
          wirePts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y - Math.sin(t * Math.PI) * 0.9, a.z + (b.z - a.z) * t));
        }
      }
      const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
      root.add(new THREE.Line(wireGeo, wireMat));
    }
  }

  // ---- checkpoint barriers ----
  for (const [cx, cz, rot] of [[0, -HALF + CELL * 3, 0], [-HALF + CELL * 6, 0, Math.PI / 2]]) {
    for (const side of [-1, 1]) {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.9), gateMat);
      const off = 7.2 * side;
      gate.position.set(cx + (rot ? 0 : off), 1.4, cz + (rot ? off : 0));
      gate.rotation.y = rot;
      gate.castShadow = true;
      root.add(gate);
      addCollider(gate.position.x, gate.position.z, rot ? 0.9 : 2.2, rot ? 2.2 : 0.9);
      // sandbags
      for (let s = 0; s < 3; s++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.6), sandbagMat);
        bag.position.set(gate.position.x + range(-1.4, 1.4), 0.18 + s * 0.34, gate.position.z + range(-1.4, 1.4));
        bag.rotation.y = rnd();
        root.add(bag);
      }
    }
  }

  // ---- distant skyline for depth ----
  const hazeMat = new THREE.MeshLambertMaterial({ color: 0xc0a988 });
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rnd() * 0.04;
    const r = 430 + rnd() * 90;
    const w = range(16, 46);
    const h = range(16, 70);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), hazeMat);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    root.add(tower);
  }

  // ---- floating dust ----
  const DUST = 700;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = range(-140, 140);
    dustPos[i * 3 + 1] = range(0.5, 26);
    dustPos[i * 3 + 2] = range(-140, 140);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  function makeDustSprite() {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,248,232,0.95)');
    g.addColorStop(0.5, 'rgba(240,226,198,0.35)');
    g.addColorStop(1, 'rgba(240,226,198,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xe6d3ab, size: 0.42, map: makeDustSprite(), transparent: true, opacity: 0.4, depthWrite: false, alphaTest: 0.02 })
  );
  root.add(dust);

  // ---- merge static geometry: thousands of meshes -> a dozen draw calls ----
  function mergeStatics() {
    root.updateMatrixWorld(true);
    const groups = new Map();
    const originals = [];
    root.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh) return;
      const mat = obj.material;
      if (!mat || Array.isArray(mat)) return;
      let group = groups.get(mat.uuid);
      if (!group) {
        group = { mat, geos: [], cast: false, receive: false };
        groups.set(mat.uuid, group);
      }
      let geo = obj.geometry.clone();
      geo.applyMatrix4(obj.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      group.geos.push(geo);
      group.cast = group.cast || obj.castShadow;
      group.receive = group.receive || obj.receiveShadow;
      originals.push(obj);
    });
    for (const obj of originals) {
      if (obj.parent) obj.parent.remove(obj);
    }
    for (const { mat, geos, cast, receive } of groups.values()) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      root.add(mesh);
    }
  }

  mergeStatics();

  // ---- spawn points along the roads ----
  const spawnPoints = [];
  for (let i = 0; i <= GRID; i++) {
    const line = -HALF + CELL * i;
    for (let d = -HALF + 8; d < HALF - 8; d += 16) {
      spawnPoints.push(new THREE.Vector3(line + range(-4, 4), 0, d));
      spawnPoints.push(new THREE.Vector3(d, 0, line + range(-4, 4)));
    }
  }

  const carStart = new THREE.Vector3(-HALF + CELL * 4, 0, -HALF + CELL * 2);
  const headingStart = 0;

  const tmp = new THREE.Vector3();
  function update(dt, playerPos) {
    const arr = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      arr[i * 3] += dt * 1.6;
      arr[i * 3 + 1] += Math.sin(performance.now() * 0.001 + i) * dt * 0.15;
      arr[i * 3 + 2] += dt * 0.8;
      if (arr[i * 3] - playerPos.x > 140) arr[i * 3] -= 280;
      if (arr[i * 3] - playerPos.x < -140) arr[i * 3] += 280;
      if (arr[i * 3 + 2] - playerPos.z > 140) arr[i * 3 + 2] -= 280;
      if (arr[i * 3 + 2] - playerPos.z < -140) arr[i * 3 + 2] += 280;
    }
    dustGeo.attributes.position.needsUpdate = true;

    tmp.copy(playerPos);
    sun.position.set(tmp.x + 110, 74, tmp.z + 52);
    sun.target.position.copy(tmp);
    sun.target.updateMatrixWorld();
    sky.position.set(tmp.x, 0, tmp.z);
  }

  function setShadows(on) {
    sun.castShadow = on;
  }

  function isInsideBuilding(x, z, pad = 0) {
    return colliders.some((c) => x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);
  }

  return { colliders, spawnPoints, carStart, headingStart, update, isInsideBuilding, setShadows, bounds: HALF };
}
