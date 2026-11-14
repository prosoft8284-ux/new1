import { Assets } from 'pixi.js'
import './style.css'
import { loadWorld } from './data'
import { Renderer } from './render'
import { Game, WEAPONS } from './game'
import { Ui } from './ui'

const SPRITES = [
  'player', 'alien_runner', 'alien_brute', 'alien_jelly', 'alien_mage',
  'crate', 'herb', 'medkit', 'ammo', 'flag',
  'p_tree', 'p_palm', 'p_bush', 'p_grass', 'p_reed', 'p_rock', 'p_crystal',
  'p_debris', 'p_column'
]

const BASE = (import.meta as any).env?.BASE_URL ?? './'
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function setLoading(p: number) {
  el<HTMLDivElement>('loadBar').style.width = Math.round(p * 100) + '%'
}

const log = (m: string) => { console.log('[boot] ' + m); document.title = 'boot: ' + m }

async function boot() {
  setLoading(0.02)
  log('load world')
  const data = await loadWorld(setLoading)
  log('world ok ' + data.props.length + ' props')
  setLoading(0.92)

  const urls = SPRITES.map(n => BASE + 'sprites/' + n + '.png')
  urls.push(BASE + 'world/tileset.png')
  log('load textures')
  const loaded = await Assets.load(urls)
  log('textures ok')
  const textures: Record<string, any> = {}
  for (const n of SPRITES) textures[n] = loaded[BASE + 'sprites/' + n + '.png']
  textures['tileset'] = loaded[BASE + 'world/tileset.png']

  log('build ui')
  const ui = new Ui(data)
  log('init renderer')
  const renderer = new Renderer()
  await renderer.init(document.getElementById('app')!, data, textures)
  log('create game')
  const game = new Game(data, renderer, ui, textures)
  log('ready')
  setLoading(1)

  let started = false

  // ---------------------------------------------------------------- screens
  function startGame(loadSave: boolean) {
    el('titleScreen').classList.add('hidden')
    el('deadScreen').classList.add('hidden')
    el('winScreen').classList.add('hidden')
    el('hud').classList.remove('hidden')
    if (loadSave && game.hasSave()) game.load()
    game.state = 'play'
    game.r.focus(game.player.x, game.player.y)
    ui.updateHud(game)
    started = true
  }

  const startBtn = el<HTMLButtonElement>('btnStart')
  startBtn.textContent = game.hasSave() ? 'CONTINUE' : 'DEPLOY'
  startBtn.addEventListener('click', () => startGame(true))

  el<HTMLButtonElement>('btnRespawn').addEventListener('click', () => {
    el('deadScreen').classList.add('hidden')
    game.respawn()
  })
  el<HTMLButtonElement>('btnAgain').addEventListener('click', () => {
    try { localStorage.removeItem('bermuda.save.v1') } catch (e) { /* ignore */ }
    location.reload()
  })

  // ------------------------------------------------------------------- map
  const mapScreen = el('mapScreen')
  function openMap() {
    if (game.state !== 'play') return
    ui.drawMap(game)
    mapScreen.classList.remove('hidden')
  }
  function closeMap() { mapScreen.classList.add('hidden') }
  el('btnMap').addEventListener('click', openMap)
  el('mapClose').addEventListener('click', closeMap)

  // ------------------------------------------------------------------- HUD
  el('btnHeal').addEventListener('click', () => game.heal())
  el('btnReload').addEventListener('click', () => { game.input.firing = false; game.reload() })
  el('btnSwitch').addEventListener('click', () => game.switchWeapon())
  el('btnUse').addEventListener('click', () => game.healCraftOrUse())

  // --------------------------------------------------------------- keyboard
  const keys = new Set<string>()
  const syncKeys = () => {
    let mx = 0, my = 0
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1
    if (keys.has('d') || keys.has('arrowright')) mx += 1
    if (keys.has('w') || keys.has('arrowup')) my -= 1
    if (keys.has('s') || keys.has('arrowdown')) my += 1
    game.input.moveX = mx
    game.input.moveY = my
  }
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    keys.add(k)
    syncKeys()
    if (k === 'r') game.reload()
    if (k === 'h') game.heal()
    if (k === 'e') game.input.use = true
    if (k === 'm') { mapScreen.classList.contains('hidden') ? openMap() : closeMap() }
    if (k === 'f') game.switchWeapon()
    if (k === '1' || k === '2' || k === '3') {
      const idx = parseInt(k) - 1
      if (idx < game.player.unlocked) game.player.weapon = idx
    }
    if (k === 'escape') closeMap()
  })
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase()
    keys.delete(k)
    syncKeys()
    if (k === 'e') game.input.use = false
  })

  // -------------------------------------------------------- pointer control
  const stickBase = el<HTMLDivElement>('stickBase')
  const stickKnob = el<HTMLDivElement>('stickKnob')
  let moveId = -1, aimId = -1
  let moveOx = 0, moveOy = 0, aimOx = 0, aimOy = 0

  const isUiTarget = (t: EventTarget | null) =>
    !!(t as HTMLElement)?.closest?.('.btn, button, #mapScreen, #titleScreen, #deadScreen, #winScreen, #actions')

  function aimFromWorld(sx: number, sy: number) {
    const wx = (sx - renderer.world.x) / renderer.zoom
    const wy = (sy - renderer.world.y) / renderer.zoom
    const dx = wx - game.player.x
    const dy = wy - game.player.y
    const l = Math.hypot(dx, dy) || 1
    game.input.aimX = dx / l
    game.input.aimY = dy / l
    game.input.aiming = true
  }

  window.addEventListener('pointerdown', (e) => {
    if (!started || game.state !== 'play' || isUiTarget(e.target)) return
    if (e.pointerType === 'mouse') {
      aimFromWorld(e.clientX, e.clientY)
      game.input.firing = true
      return
    }
    if (e.clientX < window.innerWidth * 0.45) {
      moveId = e.pointerId
      moveOx = e.clientX
      moveOy = e.clientY
      stickBase.style.display = 'block'
      stickKnob.style.display = 'block'
      stickBase.style.left = moveOx + 'px'
      stickBase.style.top = moveOy + 'px'
      stickKnob.style.left = moveOx + 'px'
      stickKnob.style.top = moveOy + 'px'
    } else {
      aimId = e.pointerId
      aimOx = e.clientX
      aimOy = e.clientY
      game.input.firing = true
    }
  }, { passive: true })

  window.addEventListener('pointermove', (e) => {
    if (!started || game.state !== 'play') return
    if (e.pointerType === 'mouse') {
      aimFromWorld(e.clientX, e.clientY)
      return
    }
    if (e.pointerId === moveId) {
      const dx = e.clientX - moveOx
      const dy = e.clientY - moveOy
      const d = Math.hypot(dx, dy) || 1
      const max = 58
      const k = Math.min(1, max / d)
      game.input.moveX = (dx / d) * Math.min(1, d / max)
      game.input.moveY = (dy / d) * Math.min(1, d / max)
      stickKnob.style.left = (moveOx + dx * k) + 'px'
      stickKnob.style.top = (moveOy + dy * k) + 'px'
    } else if (e.pointerId === aimId) {
      const dx = e.clientX - aimOx
      const dy = e.clientY - aimOy
      if (Math.hypot(dx, dy) > 8) {
        const l = Math.hypot(dx, dy) || 1
        game.input.aimX = dx / l
        game.input.aimY = dy / l
        game.input.aiming = true
      }
      game.input.firing = true
    }
  }, { passive: true })

  const release = (e: PointerEvent) => {
    if (e.pointerId === moveId) {
      moveId = -1
      game.input.moveX = 0
      game.input.moveY = 0
      stickBase.style.display = 'none'
      stickKnob.style.display = 'none'
    }
    if (e.pointerId === aimId) {
      aimId = -1
      game.input.firing = false
      game.input.aiming = false
    }
    if (e.pointerType === 'mouse') game.input.firing = false
  }
  window.addEventListener('pointerup', release, { passive: true })
  window.addEventListener('pointercancel', release, { passive: true })

  // ---------------------------------------------------------------- game loop
  let last = performance.now()
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (game.state === 'play') {
      game.frame(dt)
    } else if (game.state === 'dead' || game.state === 'win') {
      renderer.tick(dt)
    }
    ui.tickUi(dt)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  // expose for debugging / tests
  ;(window as any).__game = game
  ;(window as any).__renderer = renderer
}

boot().catch((err) => {
  console.error(err)
  const bar = document.getElementById('loadBar')
  if (bar) bar.style.background = '#d2453f'
  const btn = document.getElementById('btnStart') as HTMLButtonElement | null
  if (btn) btn.textContent = 'LOAD FAILED — SEE CONSOLE'
})
