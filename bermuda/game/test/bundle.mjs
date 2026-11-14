// test/pixi-stub.mjs
var Container = class {
  constructor() {
    this.children = [];
    this.x = 0;
    this.y = 0;
    this.visible = true;
    this.alpha = 1;
    this.sortableChildren = false;
    this.scale = { x: 1, y: 1, set() {
    } };
    this.position = { x: 0, y: 0, set() {
    } };
    this.anchor = { x: 0, y: 0, set() {
    } };
    this.filters = null;
    this.mask = null;
    this.parent = null;
  }
  addChild(c) {
    this.children.push(c);
    c.parent = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  removeChildren() {
    this.children = [];
  }
  destroy() {
    this.children = [];
  }
};
var Sprite = class extends Container {
  constructor(texture) {
    super();
    this.texture = texture;
    this.width = 0;
    this.height = 0;
    this.tint = 16777215;
    this.rotation = 0;
    this.zIndex = 0;
    this.eventMode = "none";
    this.cullable = false;
  }
  setFromTexture() {
  }
};
var Graphics = class extends Container {
  constructor() {
    super();
    this.geometry = {};
  }
};
for (const m of [
  "moveTo",
  "lineTo",
  "beginFill",
  "endFill",
  "drawRect",
  "drawCircle",
  "rect",
  "circle",
  "poly",
  "fill",
  "stroke",
  "clear",
  "arc",
  "closePath",
  "ellipse"
]) {
  Graphics.prototype[m] = function() {
    return this;
  };
}
var Texture = class _Texture {
  constructor(w = 1, h = 1) {
    this.width = w;
    this.height = h;
    this.frame = { width: w, height: h };
  }
  static from() {
    return new _Texture();
  }
  static fromImage() {
    return new _Texture();
  }
};
Texture.WHITE = new Texture();

// src/game.ts
var WEAPONS = [
  { id: "pistol", name: "M9 SIDEARM", dmg: 26, rate: 5, spread: 0.035, speed: 1150, mag: 12, reload: 1.1, pellets: 1 },
  { id: "rifle", name: "AK-47", dmg: 19, rate: 9, spread: 0.055, speed: 1300, mag: 30, reload: 1.9, pellets: 1 },
  { id: "shotgun", name: "M133 SHOTGUN", dmg: 13, rate: 1.6, spread: 0.15, speed: 950, mag: 6, reload: 2.2, pellets: 6 }
];
var KIND = {
  runner: { tex: "alien_runner", hp: 52, speed: 132, dmg: 9, radius: 13, ranged: false, vision: 330, scale: 0.62, score: 10 },
  brute: { tex: "alien_brute", hp: 210, speed: 64, dmg: 24, radius: 20, ranged: false, vision: 300, scale: 0.86, score: 25 },
  jelly: { tex: "alien_jelly", hp: 70, speed: 58, dmg: 12, radius: 16, ranged: true, vision: 380, scale: 0.68, score: 20 },
  mage: { tex: "alien_mage", hp: 130, speed: 70, dmg: 16, radius: 15, ranged: true, vision: 420, scale: 0.7, score: 30 }
};
var SAVE_KEY = "bermuda.save.v1";
var FOG_N = 48;
var FOG_CELL = 12288 / FOG_N;
var Game = class {
  constructor(data, r, ui, textures) {
    this.state = "idle";
    this.player = {
      x: 0,
      y: 0,
      hp: 100,
      maxHp: 100,
      radius: 11,
      speed: 168,
      aimX: 1,
      aimY: 0,
      vx: 0,
      vy: 0,
      weapon: 0,
      unlocked: 1,
      mag: [12, 30, 6],
      reserve: [60, 90, 24],
      cooldown: 0,
      reloading: 0,
      medkits: 2,
      herbs: 0,
      hitT: 0
    };
    this.input = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, moving: false, aiming: false, firing: false, use: false };
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.crates = [];
    this.particles = [];
    this.camps = [];
    this.fog = new Uint8Array(FOG_N * FOG_N);
    this.kills = 0;
    this.playTime = 0;
    this.dayT = 0.25;
    this.holdT = 0;
    this.holdKey = "";
    this.spawnTimer = 4;
    this.saveTimer = 12;
    this.fxIndex = 0;
    this.lastHud = 0;
    this.data = data;
    this.r = r;
    this.ui = ui;
    this.textures = textures;
    this.setup();
  }
  // ------------------------------------------------------------------ setup
  setup() {
    const spawn = this.data.json.spawn;
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.playerSprite = new Sprite(this.textures["player"]);
    this.playerSprite.anchor.set(0.5);
    this.playerSprite.scale.set(0.62);
    this.r.entityLayer.addChild(this.playerSprite);
    this.r.entityLayer.sortableChildren = true;
    for (const def of this.data.json.camps) {
      const tex = def.tower ? this.textures["flag"] : this.textures["flag"];
      const flag = new Sprite(tex);
      flag.anchor.set(0.5);
      flag.position.set(def.x, def.y);
      flag.scale.set(1.1);
      flag.tint = 13780287;
      flag.zIndex = def.y;
      this.r.entityLayer.addChild(flag);
      this.camps.push({
        def,
        guards: [],
        cleared: false,
        captured: false,
        hacked: false,
        spawned: false,
        flag
      });
      const crates = def.tower ? 1 : 2;
      for (let k = 0; k < crates; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = 40 + Math.random() * 90;
        this.addCrate(def.x + Math.cos(a) * d, def.y + Math.sin(a) * d);
      }
    }
    let placed = 0;
    let guard = 0;
    while (placed < 160 && guard < 4e3) {
      guard++;
      const x = Math.random() * this.data.worldPx;
      const y = Math.random() * this.data.worldPx;
      const i = Math.floor(x / this.data.tile);
      const j = Math.floor(y / this.data.tile);
      const t = this.data.tiles[j * this.data.n + i];
      if (this.data.collision[j * this.data.n + i] === 1) continue;
      if ([7, 8, 9, 6, 15].indexOf(t) < 0) continue;
      this.addPickup("herb", x, y, 1);
      placed++;
    }
    this.revealAround(this.player.x, this.player.y, 4);
    this.r.focus(this.player.x, this.player.y);
    this.r.entityLayer.addChild(this.playerSprite);
    this.r.entityLayer.sortableChildren = true;
  }
  addCrate(x, y) {
    if (this.isBlocked(x, y)) return;
    const s = new Sprite(this.textures["crate"]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.scale.set(0.55);
    s.zIndex = y;
    this.r.entityLayer.addChild(s);
    this.crates.push({ x, y, sprite: s, looted: false });
  }
  addPickup(kind, x, y, amount) {
    const tex = this.textures[kind];
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.scale.set(kind === "herb" ? 0.32 : 0.4);
    s.zIndex = y;
    this.r.entityLayer.addChild(s);
    this.pickups.push({ kind, x, y, sprite: s, amount });
  }
  spawnEnemy(kind, x, y, campId) {
    const cfg = KIND[kind];
    if (!cfg) return;
    const s = new Sprite(this.textures[cfg.tex]);
    s.anchor.set(0.5);
    s.scale.set(cfg.scale);
    s.position.set(x, y);
    s.zIndex = y;
    this.r.entityLayer.addChild(s);
    const e = {
      kind,
      x,
      y,
      hp: cfg.hp,
      maxHp: cfg.hp,
      speed: cfg.speed,
      dmg: cfg.dmg,
      radius: cfg.radius,
      vision: cfg.vision,
      ranged: cfg.ranged,
      state: "idle",
      homeX: x,
      homeY: y,
      campId,
      cd: 0.8,
      wanderT: 0,
      wx: x,
      wy: y,
      hitT: 0,
      sprite: s,
      dead: false
    };
    this.enemies.push(e);
    const camp = this.camps.find((c) => c.def.id === campId);
    if (camp) camp.guards.push(e);
  }
  // ------------------------------------------------------------- world query
  isBlocked(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const i = Math.floor(x / this.data.tile);
    const j = Math.floor(y / this.data.tile);
    if (i < 0 || j < 0 || i >= this.data.n || j >= this.data.n) return true;
    return this.data.collision[j * this.data.n + i] === 1;
  }
  moveEntity(e, dx, dy) {
    const nx = e.x + dx;
    if (!this.isBlocked(nx, e.y)) e.x = nx;
    const ny = e.y + dy;
    if (!this.isBlocked(e.x, ny)) e.y = ny;
    e.x = Math.max(16, Math.min(this.data.worldPx - 16, e.x));
    e.y = Math.max(16, Math.min(this.data.worldPx - 16, e.y));
  }
  // ------------------------------------------------------------------- frame
  frame(dt) {
    if (this.state !== "play") return;
    this.playTime += dt;
    this.dayT = (this.dayT + dt / 300) % 1;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateInteract(dt);
    this.updateSpawning(dt);
    this.updateLight(dt);
    this.updateCamera(dt);
    this.r.tick(dt);
    this.lastHud += dt;
    if (this.lastHud > 0.1) {
      this.lastHud = 0;
      this.ui.updateHud(this);
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 15;
      this.save();
    }
  }
  updatePlayer(dt) {
    const p = this.player;
    const wx = this.input.moveX;
    const wy = this.input.moveY;
    const len = Math.hypot(wx, wy);
    const targetVx = len > 0 ? wx / len * p.speed : 0;
    const targetVy = len > 0 ? wy / len * p.speed : 0;
    p.vx += (targetVx - p.vx) * Math.min(1, dt * 12);
    p.vy += (targetVy - p.vy) * Math.min(1, dt * 12);
    this.moveEntity(p, p.vx * dt, p.vy * dt);
    if (this.input.aiming) {
      const l = Math.hypot(this.input.aimX, this.input.aimY) || 1;
      p.aimX = this.input.aimX / l;
      p.aimY = this.input.aimY / l;
    } else {
      const near = this.nearestEnemy(p.x, p.y, 460);
      if (near) {
        const dx = near.x - p.x, dy = near.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        p.aimX = dx / l;
        p.aimY = dy / l;
      }
    }
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.hitT = Math.max(0, p.hitT - dt);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) this.finishReload();
    }
    if (this.input.firing) this.tryShoot();
    if (p.weapon !== void 0) {
      this.playerSprite.position.set(p.x, p.y);
      this.playerSprite.zIndex = p.y;
      this.playerSprite.scale.x = Math.abs(this.playerSprite.scale.x) * (p.aimX < 0 ? -1 : 1);
      this.playerSprite.tint = p.hitT > 0 ? 16751258 : 16777215;
    }
  }
  tryShoot() {
    const p = this.player;
    const wpn = WEAPONS[p.weapon];
    if (!wpn || p.cooldown > 0 || p.reloading > 0) return;
    if (p.mag[p.weapon] <= 0) {
      this.reload();
      return;
    }
    p.mag[p.weapon]--;
    p.cooldown = 1 / wpn.rate;
    const base = Math.atan2(p.aimY, p.aimX);
    for (let k = 0; k < wpn.pellets; k++) {
      const a = base + (Math.random() - 0.5) * wpn.spread * 2;
      this.spawnBullet(
        p.x + Math.cos(a) * 18,
        p.y + Math.sin(a) * 18,
        Math.cos(a) * wpn.speed,
        Math.sin(a) * wpn.speed,
        wpn.dmg,
        true,
        16769162,
        5
      );
    }
    this.burst(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 26, 4, 16766073, 0.12, 22, 3);
    this.r.shake(1.1);
    if (p.mag[p.weapon] === 0) this.reload();
  }
  reload() {
    const p = this.player;
    if (p.reloading > 0) return;
    const wpn = WEAPONS[p.weapon];
    if (p.mag[p.weapon] >= wpn.mag) return;
    if (p.reserve[p.weapon] <= 0) {
      this.ui.toast("Out of reserve ammo");
      return;
    }
    p.reloading = wpn.reload;
  }
  finishReload() {
    const p = this.player;
    const wpn = WEAPONS[p.weapon];
    const need = wpn.mag - p.mag[p.weapon];
    const take = Math.min(need, p.reserve[p.weapon]);
    p.mag[p.weapon] += take;
    p.reserve[p.weapon] -= take;
  }
  spawnBullet(x, y, vx, vy, dmg, friendly, color, size) {
    const s = new Sprite(Texture.WHITE);
    s.anchor.set(0.5);
    s.tint = color;
    s.width = size;
    s.height = friendly ? 2.4 : size;
    s.rotation = Math.atan2(vy, vx);
    s.position.set(x, y);
    this.r.fxLayer.addChild(s);
    this.bullets.push({ x, y, vx, vy, dmg, life: 1.4, friendly, sprite: s });
  }
  nearestEnemy(x, y, maxD) {
    let best = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  updateEnemies(dt) {
    const p = this.player;
    let alive = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      alive++;
      e.hitT = Math.max(0, e.hitT - dt);
      e.cd = Math.max(0, e.cd - dt);
      const dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const vision = e.vision * (this.isNight() ? 0.68 : 1);
      if (dist < vision) e.state = "chase";
      if (e.state === "chase" && dist > vision * 1.9) e.state = "return";
      if (e.state === "chase") {
        const stop = e.ranged ? 210 : e.radius + p.radius + 6;
        if (dist > stop) {
          const nx = dx / (dist || 1), ny = dy / (dist || 1);
          this.moveEntity(e, nx * e.speed * dt, ny * e.speed * dt);
        }
        if (e.ranged && dist < 430 && e.cd <= 0) {
          e.cd = 1.9;
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.1;
          this.spawnBullet(e.x, e.y, Math.cos(a) * 520, Math.sin(a) * 520, e.dmg, false, 12876799, 8);
        } else if (!e.ranged && dist < stop + 4 && e.cd <= 0) {
          e.cd = 0.95;
          this.hurtPlayer(e.dmg);
          const nx = dx / (dist || 1), ny = dy / (dist || 1);
          p.vx += nx * 150;
          p.vy += ny * 150;
        }
      } else if (e.state === "return") {
        const hx = e.homeX - e.x, hy = e.homeY - e.y;
        const hd = Math.hypot(hx, hy);
        if (hd < 30) e.state = "idle";
        else this.moveEntity(e, hx / hd * e.speed * 0.5 * dt, hy / hd * e.speed * 0.5 * dt);
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 2 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          e.wx = e.homeX + Math.cos(a) * (30 + Math.random() * 90);
          e.wy = e.homeY + Math.sin(a) * (30 + Math.random() * 90);
        }
        const wx = e.wx - e.x, wy = e.wy - e.y;
        const wd = Math.hypot(wx, wy);
        if (wd > 12) this.moveEntity(e, wx / wd * e.speed * 0.22 * dt, wy / wd * e.speed * 0.22 * dt);
      }
      e.sprite.position.set(e.x, e.y);
      e.sprite.zIndex = e.y;
      e.sprite.tint = e.hitT > 0 ? 16777215 : 14207216;
      e.sprite.scale.x = Math.abs(e.sprite.scale.x) * (p.x < e.x ? -1 : 1);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (alive === 0) this.refreshCampClears();
  }
  refreshCampClears() {
    for (const c of this.camps) {
      if (c.captured || c.cleared) continue;
      if (c.spawned && c.guards.every((g) => g.dead)) {
        c.cleared = true;
        this.ui.toast(c.def.name + " is clear \u2014 move in");
      }
    }
  }
  hurtPlayer(dmg) {
    const p = this.player;
    if (this.state !== "play") return;
    p.hp -= dmg;
    p.hitT = 0.2;
    this.r.shake(3.4);
    this.ui.flash();
    if (p.hp <= 0) {
      p.hp = 0;
      this.die();
    }
  }
  die() {
    this.state = "dead";
    this.ui.showDead(this);
    this.save();
  }
  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.sprite.position.set(b.x, b.y);
      if (b.life <= 0 || this.isBlocked(b.x, b.y)) {
        b.life = 0;
        this.burst(b.x, b.y, 2, 14471344, 0.1, 40, 2);
        continue;
      }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.radius + 4) ** 2) {
            e.hp -= b.dmg;
            e.hitT = 0.12;
            b.life = 0;
            this.burst(b.x, b.y, 3, 12088319, 0.2, 70, 3);
            if (e.hp <= 0) this.killEnemy(e);
            const camp = this.camps.find((c) => c.def.id === e.campId);
            if (camp && camp.spawned) this.refreshCampClears();
            break;
          }
        }
      } else {
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (p.radius + 5) ** 2) {
          b.life = 0;
          this.hurtPlayer(b.dmg);
        }
      }
    }
    for (const b of this.bullets) {
      if (b.life <= 0) b.sprite.destroy();
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }
  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    e.sprite.destroy();
    this.burst(e.x, e.y, 12, 11032055, 0.45, 120, 4);
    const cfg = KIND[e.kind];
    const r = Math.random();
    if (r < 0.5) this.addPickup("ammo", e.x + 8, e.y + 6, 8 + Math.floor(Math.random() * 10));
    else if (r < 0.72) this.addPickup("medkit", e.x - 6, e.y + 8, 1);
    else if (r < 0.92) this.addPickup("herb", e.x + 4, e.y - 6, 1);
    if (this.camps.some((c) => c.def.id === e.campId && c.spawned)) this.refreshCampClears();
  }
  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      const d2 = (it.x - p.x) ** 2 + (it.y - p.y) ** 2;
      if (d2 < 34 * 34) {
        if (it.kind === "herb") {
          p.herbs += it.amount;
        } else if (it.kind === "ammo") {
          p.reserve[p.weapon] += it.amount;
          this.ui.toast("+" + it.amount + " ammo");
        } else {
          p.medkits += it.amount;
          this.ui.toast("+" + it.amount + " medkit");
        }
        it.sprite.destroy();
        this.pickups.splice(i, 1);
      } else if (d2 < 150 * 150) {
        if (it.kind === "herb") {
          const d = Math.sqrt(d2) || 1;
          it.x += (p.x - it.x) / d * 60 * dt;
          it.y += (p.y - it.y) / d * 60 * dt;
          it.sprite.position.set(it.x, it.y);
        }
      }
    }
  }
  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.sprite.position.set(pt.x, pt.y);
      pt.sprite.alpha = Math.max(0, pt.life / pt.max);
      pt.sprite.width = pt.sprite.height = pt.size * (0.5 + pt.life / pt.max);
    }
    for (const pt of this.particles) {
      if (pt.life <= 0) pt.sprite.destroy();
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }
  burst(x, y, count, color, life, speed, size) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.tint = color;
      s.width = s.height = size;
      s.position.set(x, y);
      this.r.fxLayer.addChild(s);
      const max = life * (0.6 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: max,
        max,
        size,
        color,
        sprite: s
      });
      if (this.particles.length > 420) {
        const old = this.particles.shift();
        old?.sprite.destroy();
      }
    }
  }
  // ------------------------------------------------------------- interaction
  findInteract() {
    const p = this.player;
    for (const c of this.crates) {
      if (c.looted) continue;
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 62 * 62) {
        return { kind: "crate", label: "Search crate", x: c.x, y: c.y, need: 0.45, ref: c };
      }
    }
    for (const c of this.camps) {
      const d2 = (c.def.x - p.x) ** 2 + (c.def.y - p.y) ** 2;
      if (c.def.tower) {
        if (!c.hacked && d2 < 95 * 95) {
          return { kind: "tower", label: "Hold to hack " + c.def.name, x: c.def.x, y: c.def.y, need: 2.4, ref: c };
        }
      } else {
        if (c.cleared && !c.captured && d2 < 110 * 110) {
          return { kind: "camp", label: "Hold to liberate " + c.def.name, x: c.def.x, y: c.def.y, need: 3, ref: c };
        }
        if (c.captured) {
          if (d2 < 70 * 70) {
            return { kind: "camp", label: "Resupply (E)", x: c.def.x, y: c.def.y, need: 0.9, ref: c };
          }
        }
      }
    }
    return null;
  }
  updateInteract(dt) {
    const target = this.findInteract();
    if (!target) {
      this.holdT = 0;
      this.holdKey = "";
      this.ui.setPrompt(null);
      return;
    }
    const key = target.kind + ":" + target.label;
    if (key !== this.holdKey) {
      this.holdKey = key;
      this.holdT = 0;
    }
    this.ui.setPrompt(target.label);
    if (this.input.use) {
      this.holdT += dt;
      this.ui.setHold(Math.min(1, this.holdT / target.need));
      if (this.holdT >= target.need) {
        this.holdT = 0;
        this.completeInteract(target);
      }
    } else {
      this.holdT = Math.max(0, this.holdT - dt * 2);
      this.ui.setHold(null);
    }
  }
  completeInteract(t) {
    if (t.kind === "crate") {
      t.ref.looted = true;
      t.ref.sprite.tint = 5592405;
      const roll = Math.random();
      if (roll < 0.5) {
        const amt = 20 + Math.floor(Math.random() * 20);
        this.player.reserve[this.player.weapon] += amt;
        this.ui.toast("Found " + amt + " ammo");
      } else if (roll < 0.75) {
        this.player.medkits += 1;
        this.ui.toast("Found a medkit");
      } else {
        this.player.herbs += 2;
        this.ui.toast("Found herbs");
      }
      this.ui.setHold(0);
      return;
    }
    if (t.kind === "camp") {
      const c = t.ref;
      if (!c.captured) {
        c.captured = true;
        c.flag.tint = 5224168;
        this.burst(c.def.x, c.def.y, 22, 5224168, 0.8, 190, 5);
        this.ui.toast(c.def.name + " liberated \u2014 you can resupply here");
        this.save();
      } else {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
        const wpn = this.player.weapon;
        this.player.mag[wpn] = WEAPONS[wpn].mag;
        this.player.reserve[wpn] += 15;
        this.ui.toast("Resupplied");
      }
      this.ui.setHold(0);
      this.checkWin();
      return;
    }
    if (t.kind === "tower") {
      const c = t.ref;
      c.hacked = true;
      c.cleared = c.cleared || c.guards.every((g) => g.dead);
      c.flag.tint = 5224168;
      this.revealAround(c.def.x, c.def.y, 17);
      this.burst(c.def.x, c.def.y, 26, 14203e3, 0.9, 220, 5);
      this.ui.toast("Tower hacked \u2014 region mapped");
      this.save();
      this.checkWin();
      this.ui.setHold(0);
    }
  }
  updateSpawning(dt) {
    for (const c of this.camps) {
      if (c.spawned || c.captured) continue;
      const d2 = (c.def.x - this.player.x) ** 2 + (c.def.y - this.player.y) ** 2;
      if (d2 < (c.def.radius * 1.35) ** 2) {
        c.spawned = true;
        const total = Object.values(c.def.garrison).reduce((a, b) => a + b, 0);
        let made = 0;
        for (const [kind, n] of Object.entries(c.def.garrison)) {
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2;
            const d = 50 + Math.random() * Math.min(220, c.def.radius * 0.5);
            const x = c.def.x + Math.cos(a) * d;
            const y = c.def.y + Math.sin(a) * d;
            if (this.isBlocked(x, y)) continue;
            this.spawnEnemy(kind, x, y, c.def.id);
            made++;
          }
        }
        if (made === 0) c.cleared = true;
        else this.ui.toast("Hostiles at " + c.def.name);
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 9;
      if (this.enemies.length < 18) {
        const camp = this.camps.find((c) => !c.captured && c.spawned && (c.def.x - this.player.x) ** 2 + (c.def.y - this.player.y) ** 2 > 700 * 700);
        if (camp) {
          const kinds = Object.keys(camp.def.garrison);
          if (kinds.length) {
            const a = Math.random() * Math.PI * 2;
            const d = 240 + Math.random() * 160;
            const x = camp.def.x + Math.cos(a) * d;
            const y = camp.def.y + Math.sin(a) * d;
            if (!this.isBlocked(x, y)) {
              this.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], x, y, camp.def.id);
            }
          }
        }
      }
    }
  }
  updateCamera(dt) {
    const p = this.player;
    const k = Math.min(1, dt * 6);
    const tx = p.x + p.aimX * 46;
    const ty = p.y + p.aimY * 46;
    this.r.camX += (tx - this.r.camX) * k;
    this.r.camY += (ty - this.r.camY) * k;
  }
  isNight() {
    return this.dayT > 0.78 || this.dayT < 0.18;
  }
  updateLight(dt) {
    const t = this.dayT;
    let dark = 0;
    if (t > 0.72) dark = Math.min(0.5, (t - 0.72) / 0.16 * 0.5);
    else if (t < 0.22) dark = Math.max(0, 0.5 - t / 0.22 * 0.5);
    this.r.setNight(dark);
  }
  // ------------------------------------------------------------------- fog
  revealAround(x, y, cells) {
    const cx = Math.floor(x / FOG_CELL);
    const cy = Math.floor(y / FOG_CELL);
    for (let j = -cells; j <= cells; j++) {
      for (let i = -cells; i <= cells; i++) {
        if (i * i + j * j > cells * cells) continue;
        const gx = cx + i, gy = cy + j;
        if (gx < 0 || gy < 0 || gx >= FOG_N || gy >= FOG_N) continue;
        this.fog[gy * FOG_N + gx] = 1;
      }
    }
  }
  updateFog() {
    this.revealAround(this.player.x, this.player.y, 3);
  }
  // -------------------------------------------------------------- progression
  campsCaptured() {
    return this.camps.filter((c) => !c.def.tower && c.captured).length;
  }
  campsTotal() {
    return this.camps.filter((c) => !c.def.tower).length;
  }
  towersHacked() {
    return this.camps.filter((c) => c.def.tower && c.hacked).length;
  }
  towersTotal() {
    return this.camps.filter((c) => c.def.tower).length;
  }
  checkWin() {
    if (this.campsCaptured() >= this.campsTotal() && this.towersHacked() >= this.towersTotal()) {
      this.state = "win";
      this.ui.showWin(this);
    }
  }
  // ---------------------------------------------------------------- actions
  heal() {
    const p = this.player;
    if (p.medkits <= 0) {
      this.ui.toast("No medkits \u2014 craft one from 3 herbs");
      return;
    }
    if (p.hp >= p.maxHp) {
      this.ui.toast("Health is full");
      return;
    }
    p.medkits--;
    p.hp = Math.min(p.maxHp, p.hp + 55);
    this.ui.toast("Healed");
  }
  healCraftOrUse() {
    if (this.player.herbs >= 3) this.craft();
    else this.heal();
  }
  craft() {
    const p = this.player;
    if (p.herbs < 3) {
      this.ui.toast("Need 3 herbs (" + p.herbs + "/3)");
      return;
    }
    p.herbs -= 3;
    p.medkits++;
    this.ui.toast("Medkit crafted");
  }
  switchWeapon() {
    const p = this.player;
    p.weapon = (p.weapon + 1) % p.unlocked;
    p.reloading = 0;
    this.ui.toast(WEAPONS[p.weapon].name);
  }
  resupply() {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
  }
  respawn() {
    const captured = this.camps.filter((c) => c.captured && !c.def.tower);
    const base = captured.length ? captured[captured.length - 1].def : null;
    const p = this.player;
    if (base) {
      p.x = base.x + 40;
      p.y = base.y + 40;
    } else {
      p.x = this.data.json.spawn.x;
      p.y = this.data.json.spawn.y;
    }
    p.hp = Math.max(45, p.maxHp * 0.6);
    p.vx = 0;
    p.vy = 0;
    for (const e of this.enemies) e.sprite.destroy();
    this.enemies = [];
    for (const b of this.bullets) b.sprite.destroy();
    this.bullets = [];
    for (const c of this.camps) {
      if (!c.captured) {
        c.spawned = false;
        c.cleared = false;
        c.guards = [];
      }
    }
    this.state = "play";
    this.r.focus(p.x, p.y);
    this.revealAround(p.x, p.y, 4);
    this.save();
  }
  // ------------------------------------------------------------------ save
  save() {
    try {
      const p = this.player;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        x: p.x,
        y: p.y,
        hp: p.hp,
        mag: p.mag,
        reserve: p.reserve,
        weapon: p.weapon,
        unlocked: p.unlocked,
        medkits: p.medkits,
        herbs: p.herbs,
        kills: this.kills,
        dayT: this.dayT,
        camps: this.camps.filter((c) => c.captured).map((c) => c.def.id),
        towers: this.camps.filter((c) => c.hacked).map((c) => c.def.id),
        fog: Array.from(this.fog)
      }));
    } catch (e) {
    }
  }
  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      const p = this.player;
      p.x = s.x;
      p.y = s.y;
      p.hp = s.hp;
      p.mag = s.mag;
      p.reserve = s.reserve;
      p.weapon = s.weapon;
      p.unlocked = s.unlocked;
      p.medkits = s.medkits;
      p.herbs = s.herbs;
      this.kills = s.kills ?? 0;
      this.dayT = s.dayT ?? 0.25;
      for (const id of s.camps ?? []) {
        const c = this.camps.find((x) => x.def.id === id);
        if (c) {
          c.captured = true;
          c.cleared = true;
          c.spawned = true;
          c.flag.tint = 5224168;
        }
      }
      for (const id of s.towers ?? []) {
        const c = this.camps.find((x) => x.def.id === id);
        if (c) {
          c.hacked = true;
          c.flag.tint = 5224168;
        }
      }
      if (this.camps.some((c) => c.captured) && this.camps.filter((c) => c.captured).length >= 2) {
        p.unlocked = Math.max(p.unlocked, 3);
      }
      if (Array.isArray(s.fog)) this.fog.set(s.fog.slice(0, this.fog.length));
      this.r.focus(p.x, p.y);
      this.ui.updateHud(this);
      return true;
    } catch (e) {
      return false;
    }
  }
  // ------------------------------------------------------------------ info
  clockText() {
    const hours = (6 + this.dayT * 24) % 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const phase = this.isNight() ? "NIGHT" : hours < 11 ? "MORNING" : hours < 17 ? "DAY" : "DUSK";
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + " \xB7 " + phase;
  }
  weaponLabel() {
    return WEAPONS[this.player.weapon].name;
  }
};
export {
  Game,
  WEAPONS
};
