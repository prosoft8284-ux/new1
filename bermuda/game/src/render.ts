import {
  Application, Container, Graphics, Rectangle, Sprite, Texture
} from 'pixi.js'
import type { Prop, WorldData } from './data'

export const TILE_COLORS = [
  '#0c203a', '#134866', '#308e9a', '#68b8ac', '#e2d09e', '#c8b688',
  '#869e5a', '#426c38', '#2c562e', '#1f3f27', '#9c805a', '#7e766a',
  '#625a52', '#78726a', '#388698', '#5a6c4a', '#b69a70', '#a08862',
  '#9e9c96', '#582e6a', '#4a3c44', '#928a7c', '#745c42', '#7a6448',
  '#3e3432'
]

const BASE = (import.meta as any).env?.BASE_URL ?? './'

const PROP_SIZE: Record<string, number> = {
  tree: 46, palm: 40, bush: 22, grass: 15, reed: 17,
  rock: 24, crystal: 22, debris: 20, column: 18
}

export class Renderer {
  app!: Application
  world!: Container
  entityLayer!: Container
  fxLayer!: Container
  night!: Sprite
  camX = 0
  camY = 0
  zoom = 2.2
  private ground!: TileLayer
  private props!: PropLayer
  private shakeT = 0
  private shakeAmp = 0
  private screenW = 1
  private screenH = 1

  async init(host: HTMLElement, data: WorldData, textures: Record<string, Texture>) {
    this.app = new Application()
    await this.app.init({
      background: 0x080a0c,
      resizeTo: window,
      antialias: false,
      resolution: Math.min(1.5, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl'
    })
    host.appendChild(this.app.canvas)

    this.world = new Container()
    this.app.stage.addChild(this.world)

    const tileset = textures['tileset']
    const frames: Texture[] = []
    for (let i = 0; i < 52; i++) {
      const sx = (i % 8) * 32
      const sy = Math.floor(i / 8) * 32
      frames.push(new Texture({ source: tileset.source, frame: new Rectangle(sx, sy, 32, 32) }))
    }
    this.ground = new TileLayer(frames, data)
    this.world.addChild(this.ground.container)

    this.props = new PropLayer(data, textures)
    this.world.addChild(this.props.container)

    this.world.addChild(this.buildBuildings(data))

    this.entityLayer = new Container()
    this.world.addChild(this.entityLayer)

    this.fxLayer = new Container()
    this.world.addChild(this.fxLayer)

    this.night = new Sprite(Texture.WHITE)
    this.night.tint = 0x0a1430
    this.night.alpha = 0
    this.app.stage.addChild(this.night)

    this.screenW = this.app.screen.width
    this.screenH = this.app.screen.height
    this.setZoomForView()
    window.addEventListener('resize', () => {
      this.screenW = this.app.screen.width
      this.screenH = this.app.screen.height
      this.setZoomForView()
    })
  }

  private buildBuildings(data: WorldData): Graphics {
    const g = new Graphics()
    for (const b of data.buildings) {
      const rad = (b.rot * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const pts: number[] = []
      for (const [sx, sy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        pts.push(
          b.x + (sx * b.w * cos - sy * b.h * sin),
          b.y + (sx * b.w * sin + sy * b.h * cos)
        )
      }
      g.poly(pts).fill(0x6e563c).stroke({ width: 2, color: 0x2a2118, alpha: 0.9 })
    }
    return g
  }

  setZoomForView() {
    this.zoom = Math.max(1.5, Math.min(3.4, this.screenH / 470))
  }

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount)
    this.shakeT = Math.max(this.shakeT, 0.14)
  }

  focus(x: number, y: number) {
    this.camX = x
    this.camY = y
  }

  applyCamera() {
    const z = this.zoom
    this.world.scale.set(z)
    const sx = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeAmp * 2 : 0
    const sy = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeAmp * 2 : 0
    this.world.x = this.screenW / 2 - (this.camX + sx) * z
    this.world.y = this.screenH / 2 - (this.camY + sy) * z
    this.night.width = this.screenW
    this.night.height = this.screenH
  }

  setNight(alpha: number) {
    this.night.alpha = alpha
  }

  tick(dt: number) {
    if (this.shakeT > 0) {
      this.shakeT -= dt
      if (this.shakeT <= 0) this.shakeAmp = 0
    }
    this.applyCamera()
    this.ground.update(this.camX, this.camY, this.screenW, this.screenH, this.zoom)
    this.props.update(this.camX, this.camY, this.screenW, this.screenH, this.zoom)
  }
}

class TileLayer {
  container = new Container()
  private pool: Sprite[] = []
  private frames: Texture[]
  private tiles: Uint8Array
  private n: number
  private tile: number
  private lastKey = ''

  constructor(frames: Texture[], data: WorldData) {
    this.frames = frames
    this.tiles = data.tiles
    this.n = data.n
    this.tile = data.tile
  }

  update(camX: number, camY: number, sw: number, sh: number, zoom: number) {
    const halfW = sw / (2 * zoom) + this.tile * 2
    const halfH = sh / (2 * zoom) + this.tile * 2
    const i0 = Math.max(0, Math.floor((camX - halfW) / this.tile))
    const i1 = Math.min(this.n - 1, Math.ceil((camX + halfW) / this.tile))
    const j0 = Math.max(0, Math.floor((camY - halfH) / this.tile))
    const j1 = Math.min(this.n - 1, Math.ceil((camY + halfH) / this.tile))
    const key = `${i0},${j0},${i1},${j1}`
    if (key === this.lastKey) return
    this.lastKey = key

    let idx = 0
    for (let j = j0; j <= j1; j++) {
      const row = j * this.n
      for (let i = i0; i <= i1; i++) {
        const t = this.tiles[row + i]
        let s = this.pool[idx]
        if (!s) {
          s = new Sprite(this.frames[t])
          s.width = this.tile
          s.height = this.tile
          this.container.addChild(s)
          this.pool[idx] = s
        }
        s.texture = this.frames[t]
        s.position.set(i * this.tile, j * this.tile)
        s.visible = true
        idx++
      }
    }
    for (let k = idx; k < this.pool.length; k++) this.pool[k].visible = false
  }
}

class PropLayer {
  container = new Container()
  private buckets = new Map<number, Prop[]>()
  private pool: Sprite[] = []
  private textures: Record<string, Texture>
  private tile: number
  private bs: number
  private lastKey = ''

  constructor(data: WorldData, textures: Record<string, Texture>) {
    this.textures = textures
    this.tile = data.tile
    this.names = data.json.prop_types
    this.bs = 8 * data.tile
    for (const p of data.props) {
      const name = data.json.prop_types[p.t]
      const tex = textures['p_' + name]
      if (!tex) continue
      const key = Math.floor(p.x / this.bs) * 4096 + Math.floor(p.y / this.bs)
      let arr = this.buckets.get(key)
      if (!arr) { arr = []; this.buckets.set(key, arr) }
      arr.push(p)
    }
  }

  update(camX: number, camY: number, sw: number, sh: number, zoom: number) {
    const pad = 260
    const x0 = camX - sw / (2 * zoom) - pad
    const x1 = camX + sw / (2 * zoom) + pad
    const y0 = camY - sh / (2 * zoom) - pad
    const y1 = camY + sh / (2 * zoom) + pad
    const cx0 = Math.max(0, Math.floor(x0 / this.bs)), cx1 = Math.floor(x1 / this.bs)
    const cy0 = Math.max(0, Math.floor(y0 / this.bs)), cy1 = Math.floor(y1 / this.bs)
    const key = `${cx0},${cy0},${cx1},${cy1}`
    if (key === this.lastKey) return
    this.lastKey = key

    let idx = 0
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.buckets.get(cx * 4096 + cy)
        if (!arr) continue
        for (const p of arr) {
          if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue
          const name = (this.buckets as any).__names?.[p.t]
          let s = this.pool[idx]
          if (!s) {
            s = new Sprite(Texture.WHITE)
            s.anchor.set(0.5)
            this.container.addChild(s)
            this.pool[idx] = s
          }
          if (!s.texture || s.texture === Texture.WHITE) {
            // resolved on first use
          }
          s.texture = this.pickTexture(p)
          const size = (PROP_SIZE[this.nameOf(p)] ?? 20) * (p.scale / 100)
          s.width = size
          s.height = size
          s.rotation = (p.rot * Math.PI) / 180
          s.position.set(p.x, p.y)
          s.visible = true
          idx++
        }
      }
    }
    for (let k = idx; k < this.pool.length; k++) this.pool[k].visible = false
  }

  private names: string[] = []
  private pickTexture(p: Prop): Texture {
    return this.textures['p_' + this.nameOf(p)] ?? Texture.WHITE
  }
  private nameOf(p: Prop): string {
    return this.names[p.t] ?? ''
  }
  setNames(names: string[]) { this.names = names }
}
