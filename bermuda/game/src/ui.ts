import { TILE_COLORS } from './render'
import type { WorldData } from './data'

type GameLike = {
  player: { hp: number; maxHp: number; medkits: number; herbs: number; aimX: number; aimY: number; x: number; y: number; mag: number[]; reserve: number[]; weapon: number; reloading: number }
  camps: { def: { id: string; name: string; x: number; y: number; tower: boolean }; captured: boolean; cleared: boolean; hacked: boolean }[]
  fog: Uint8Array
  kills: number
  clockText(): string
  weaponLabel(): string
  campsCaptured(): number
  campsTotal(): number
  towersHacked(): number
  towersTotal(): number
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export class Ui {
  private data: WorldData
  private baseMap: HTMLCanvasElement
  private minimap: HTMLCanvasElement
  private mmCtx: CanvasRenderingContext2D
  private mapCanvas: HTMLCanvasElement
  private mapCtx: CanvasRenderingContext2D
  private toastEl = el<HTMLDivElement>('toast')
  private promptEl = el<HTMLDivElement>('prompt')
  private holdEl = el<HTMLDivElement>('holdbar')
  private holdFill = el<HTMLDivElement>('holdFill')
  private flashEl: HTMLDivElement
  private toastTimer = 0
  private lastMini = 0
  private mapImage: HTMLImageElement | null = null
  private mapRect: [number, number, number, number] = [0, 0, 1, 1]

  constructor(data: WorldData) {
    this.data = data
    this.baseMap = this.buildBaseMap()
    void this.loadMapArt()
    this.minimap = el<HTMLCanvasElement>('minimap')
    this.mmCtx = this.minimap.getContext('2d')!
    this.mapCanvas = el<HTMLCanvasElement>('mapCanvas')
    this.mapCtx = this.mapCanvas.getContext('2d')!

    this.flashEl = document.createElement('div')
    this.flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(210,69,63,0) 40%,rgba(210,69,63,0.45) 100%);opacity:0;transition:opacity .18s'
    document.body.appendChild(this.flashEl)
  }

  private async loadMapArt() {
    const base = (import.meta as any).env?.BASE_URL ?? './'
    try {
      const res = await fetch(base + 'ui/worldmap.json')
      if (res.ok) {
        const cfg = await res.json()
        if (Array.isArray(cfg.rect) && cfg.rect.length === 4) {
          this.mapRect = cfg.rect.map((v: number) => Number(v) || 0) as [number, number, number, number]
        }
      }
    } catch (e) { /* no calibration file, keep the default */ }
    const img = new Image()
    img.onload = () => { this.mapImage = img }
    img.onerror = () => { this.mapImage = null }
    img.src = base + 'ui/worldmap.jpg'
  }

  /** Painted artwork when available, otherwise the tile map. */
  private drawBase(ctx: CanvasRenderingContext2D, size: number) {
    if (this.mapImage) {
      const [rx, ry, rw, rh] = this.mapRect
      ctx.drawImage(this.mapImage, rx * this.mapImage.width, ry * this.mapImage.height,
        rw * this.mapImage.width, rh * this.mapImage.height, 0, 0, size, size)
      return
    }
    ctx.drawImage(this.baseMap, 0, 0, size, size)
  }

  private buildBaseMap(): HTMLCanvasElement {
    const n = this.data.n
    const c = document.createElement('canvas')
    c.width = n
    c.height = n
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(n, n)
    const cols = TILE_COLORS.map(hex => [
      parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)
    ])
    for (let i = 0; i < n * n; i++) {
      const t = this.data.tiles[i]
      const col = cols[t] ?? [20, 20, 20]
      img.data[i * 4] = col[0]
      img.data[i * 4 + 1] = col[1]
      img.data[i * 4 + 2] = col[2]
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c
  }

  updateHud(g: GameLike) {
    const p = g.player
    el<HTMLDivElement>('hpFill').style.width = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100)) + '%'
    el<HTMLDivElement>('hpText').textContent = String(Math.round(p.hp))
    el<HTMLSpanElement>('medkitCount').textContent = String(p.medkits)
    el<HTMLSpanElement>('herbCount').textContent = String(p.herbs)
    const wpn = g.weaponLabel()
    el<HTMLDivElement>('weaponName').textContent = wpn
    const mag = p.mag[p.weapon]
    const reserve = p.reserve[p.weapon]
    el<HTMLDivElement>('ammo').innerHTML = `${mag} <small>/ ${reserve >= 9999 ? '∞' : reserve}</small>`
    el<HTMLDivElement>('clock').textContent = g.clockText()
    el<HTMLElement>('campCount').textContent = `${g.campsCaptured()}/${g.campsTotal()}`
    el<HTMLElement>('towerCount').textContent = `${g.towersHacked()}/${g.towersTotal()}`
    if (p.reloading > 0) el<HTMLDivElement>('weaponName').textContent = wpn + ' — RELOADING'

    const now = performance.now()
    if (now - this.lastMini > 180) {
      this.lastMini = now
      this.drawMinimap(g)
    }
  }

  setPrompt(text: string | null) {
    if (!text) {
      this.promptEl.classList.add('hidden')
      return
    }
    this.promptEl.classList.remove('hidden')
    this.promptEl.innerHTML = `<span class="key">E</span> ${text}`
  }

  setHold(v: number | null) {
    if (v === null) {
      this.holdEl.classList.add('hidden')
      return
    }
    this.holdEl.classList.remove('hidden')
    this.holdFill.style.width = Math.round(v * 100) + '%'
  }

  toast(msg: string) {
    this.toastEl.textContent = msg
    this.toastEl.style.opacity = '1'
    this.toastTimer = 1.9
  }

  flash() {
    this.flashEl.style.opacity = '1'
    setTimeout(() => { this.flashEl.style.opacity = '0' }, 130)
  }

  showDead(g: GameLike) {
    const stats = document.getElementById('deadStats')!
    stats.innerHTML = `Kills: <b>${g.kills}</b> · Camps liberated: <b>${g.campsCaptured()}/${g.campsTotal()}</b> · Towers hacked: <b>${g.towersHacked()}/${g.towersTotal()}</b>`
    document.getElementById('hud')!.classList.add('hidden')
    document.getElementById('deadScreen')!.classList.remove('hidden')
  }

  showWin(g: GameLike) {
    const stats = document.getElementById('winStats')!
    stats.innerHTML = `Kills: <b>${g.kills}</b> · Every camp liberated and every tower hacked.`
    document.getElementById('hud')!.classList.add('hidden')
    document.getElementById('winScreen')!.classList.remove('hidden')
  }

  tickUi(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toastEl.style.opacity = '0'
    }
  }

  private worldToMini(x: number, y: number, size: number): [number, number] {
    return [(x / this.data.worldPx) * size, (y / this.data.worldPx) * size]
  }

  private drawFog(ctx: CanvasRenderingContext2D, g: GameLike, size: number, soft: boolean) {
    const FOG_N = 48
    const cell = size / FOG_N
    ctx.fillStyle = 'rgba(4,6,8,0.82)'
    for (let j = 0; j < FOG_N; j++) {
      for (let i = 0; i < FOG_N; i++) {
        if (g.fog[j * FOG_N + i]) continue
        ctx.fillRect(i * cell, j * cell, cell + 0.6, cell + 0.6)
      }
    }
  }

  drawMinimap(g: GameLike) {
    const ctx = this.mmCtx
    const S = this.minimap.width
    ctx.clearRect(0, 0, S, S)
    ctx.imageSmoothingEnabled = true
    this.drawBase(ctx, S)
    ctx.globalAlpha = this.mapImage ? 0.10 : 0.28
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, S, S)
    ctx.globalAlpha = 1
    this.drawFog(ctx, g, S, true)

    for (const z of this.data.json.alien_zones) {
      const [x, y] = this.worldToMini(z.x, z.y, S)
      ctx.beginPath()
      ctx.arc(x, y, (z.r / this.data.worldPx) * S, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(150,80,200,0.28)'
      ctx.fill()
    }
    for (const c of g.camps) {
      const [x, y] = this.worldToMini(c.def.x, c.def.y, S)
      const liberated = c.captured || c.hacked
      ctx.beginPath()
      ctx.arc(x, y, c.def.tower ? 3 : 3.4, 0, Math.PI * 2)
      ctx.fillStyle = liberated ? '#4fb6e8' : c.def.tower ? '#d8b878' : '#d2453f'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    // player
    const p = g.player
    const [px, py] = this.worldToMini(p.x, p.y, S)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(Math.atan2(p.aimY, p.aimX))
    ctx.beginPath()
    ctx.moveTo(6, 0)
    ctx.lineTo(-4, 4)
    ctx.lineTo(-4, -4)
    ctx.closePath()
    ctx.fillStyle = '#f4efdf'
    ctx.fill()
    ctx.restore()
    // frame
    ctx.strokeStyle = 'rgba(216,184,120,0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1)
  }

  drawMap(g: GameLike) {
    const ctx = this.mapCtx
    const S = this.mapCanvas.width
    ctx.clearRect(0, 0, S, S)
    this.drawBase(ctx, S)
    ctx.globalAlpha = this.mapImage ? 0.12 : 0.32
    ctx.fillStyle = '#05080a'
    ctx.fillRect(0, 0, S, S)
    ctx.globalAlpha = 1

    for (const z of this.data.json.alien_zones) {
      const [x, y] = this.worldToMini(z.x, z.y, S)
      const r = (z.r / this.data.worldPx) * S
      const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
      grad.addColorStop(0, 'rgba(150,80,200,0.45)')
      grad.addColorStop(1, 'rgba(90,40,120,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    this.drawFog(ctx, g, S, false)

    // region names
    ctx.font = '600 15px "Trebuchet MS", sans-serif'
    ctx.fillStyle = 'rgba(240,232,216,0.45)'
    ctx.textAlign = 'center'
    for (const r of this.data.json.regions) {
      const [x, y] = this.worldToMini(r.cx, r.cy, S)
      ctx.fillText(r.name.toUpperCase(), x, y)
    }

    for (const c of g.camps) {
      const [x, y] = this.worldToMini(c.def.x, c.def.y, S)
      const liberated = c.captured || c.hacked
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = liberated ? '#4fb6e8' : c.def.tower ? '#d8b878' : '#d2453f'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(10,12,14,0.9)'
      ctx.stroke()
      ctx.font = '600 12px "Trebuchet MS", sans-serif'
      ctx.fillStyle = 'rgba(245,240,228,0.9)'
      ctx.textAlign = 'left'
      ctx.fillText(c.def.name, x + 10, y + 4)
    }

    const p = g.player
    const [px, py] = this.worldToMini(p.x, p.y, S)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(Math.atan2(p.aimY, p.aimX))
    ctx.beginPath()
    ctx.moveTo(12, 0)
    ctx.lineTo(-8, 8)
    ctx.lineTo(-8, -8)
    ctx.closePath()
    ctx.fillStyle = '#f4efdf'
    ctx.fill()
    ctx.restore()
    ctx.textAlign = 'left'
  }
}
