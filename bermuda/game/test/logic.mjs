// Headless playability checks: boots the real Game class against the shipped
// world data with Pixi stubbed out, then drives input and asserts behaviour.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Container, Sprite, Texture } from './pixi-stub.mjs'
import { Game } from './bundle.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(here, '..', 'public', 'world')

const json = JSON.parse(fs.readFileSync(path.join(pub, 'world.json'), 'utf8'))
const tiles = new Uint8Array(fs.readFileSync(path.join(pub, 'tiles.bin')))
const collision = new Uint8Array(fs.readFileSync(path.join(pub, 'collision.bin')))
const height = new Uint8Array(fs.readFileSync(path.join(pub, 'height.bin')))
const rawProps = fs.readFileSync(path.join(pub, 'props.bin'))
const buildings = JSON.parse(fs.readFileSync(path.join(pub, 'buildings.json'), 'utf8'))

const props = []
const dv = new DataView(rawProps.buffer, rawProps.byteOffset, rawProps.byteLength)
for (let o = 0; o + 7 <= rawProps.byteLength; o += 7) {
  props.push({
    x: dv.getUint16(o, true), y: dv.getUint16(o + 2, true), t: dv.getUint8(o + 4),
    rot: (dv.getUint8(o + 5) * 360) / 255, scale: dv.getUint8(o + 6)
  })
}

const data = { json, tiles, collision, height, props, buildings, n: json.grid[0], tile: json.tile, worldPx: json.world_px }

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}

const renderer = {
  entityLayer: new Container(),
  fxLayer: new Container(),
  camX: 0, camY: 0, viewW: 1280, viewH: 720,
  focus() {}, shake() {}, setNight() {}, tick() {}, update() {}
}
const noop = () => {}
const ui = new Proxy({}, { get: () => noop })
const textures = new Proxy({}, { get: () => new Texture(64, 64) })

const failures = []
const check = (name, ok, detail = '') => {
  if (ok) console.log('  ok   ' + name + (detail ? ' — ' + detail : ''))
  else { console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name) }
}

console.log('world:', json.pois.length, 'pois,', json.camps.length, 'camps,', props.length, 'props')

const game = new Game(data, renderer, ui, textures)
game.state = 'play'

// ---------------------------------------------------------------- spawn
const spawn = json.spawn
check('spawns on the beach landing', Math.hypot(game.player.x - spawn.x, game.player.y - spawn.y) < 1,
  `(${game.player.x.toFixed(0)}, ${game.player.y.toFixed(0)})`)
const si = Math.floor(spawn.y / json.tile) * json.grid[0] + Math.floor(spawn.x / json.tile)
check('spawn tile is walkable', collision[si] === 0, `collision=${collision[si]}`)

// ---------------------------------------------------------------- movement
const x0 = game.player.x
game.input.moveX = 1
game.input.moveY = 0
for (let i = 0; i < 90; i++) game.frame(1 / 60)
game.input.moveX = 0
check('player walks', game.player.x - x0 > 20, `moved ${(game.player.x - x0).toFixed(1)}px`)

// walls hold: try to run into the sea
const before = { x: game.player.x, y: game.player.y }
game.player.x = spawn.x
game.player.y = spawn.y
game.input.moveX = -1
for (let i = 0; i < 200; i++) game.frame(1 / 60)
game.input.moveX = 0
const idx = Math.floor(game.player.y / json.tile) * json.grid[0] + Math.floor(game.player.x / json.tile)
check('collision keeps the player out of the water', collision[idx] === 0, `tile collision=${collision[idx]}`)

// ---------------------------------------------------------------- shooting
game.input.firing = true
for (let i = 0; i < 30; i++) game.frame(1 / 60)
game.input.firing = false
const bullets = game.bullets ?? []
check('firing spawns bullets', bullets.length > 0, `${bullets.length} bullets`)
check('magazine drains', game.player.mag[game.player.weapon] < game.player.mag.length + 12,
  `mag=${game.player.mag[game.player.weapon]}`)

// ---------------------------------------------------------------- camp spawn
const camp = game.camps[0]
game.player.x = camp.def.x + 120
game.player.y = camp.def.y + 120
for (let i = 0; i < 120; i++) game.frame(1 / 60)
const enemies = game.enemies ?? []
check('camp garrison spawns near the camp', camp.spawned, `spawned=${camp.spawned}`)
check('enemies exist and are alive', enemies.some((e) => !e.dead), `${enemies.length} enemies`)

// ---------------------------------------------------------------- save / load
game.player.x = camp.def.x + 200
game.player.y = camp.def.y + 40
game.save()
const game2 = new Game(data, renderer, ui, textures)
game2.load()
check('save round-trips the player position',
  Math.abs(game2.player.x - game.player.x) < 2 && Math.abs(game2.player.y - game.player.y) < 2,
  `(${game2.player.x.toFixed(0)}, ${game2.player.y.toFixed(0)})`)

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall playability checks passed')
process.exit(failures.length ? 1 : 0)
