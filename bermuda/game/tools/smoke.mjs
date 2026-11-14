import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.GAME_URL || 'http://127.0.0.1:3003/'
const OUT = process.env.OUT_DIR || '../artifacts'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 })
await sleep(400)

fs.mkdirSync(OUT, { recursive: true })
await page.screenshot({ path: `${OUT}/game-01-title.png` })

const boot = await page.evaluate(() => ({
  state: window.__game.state,
  camps: window.__game.camps.length,
  player: [Math.round(window.__game.player.x), Math.round(window.__game.player.y)],
  zoom: +window.__renderer.zoom.toFixed(2),
  startLabel: document.getElementById('btnStart').textContent
}))

await page.click('#btnStart')
await sleep(800)
await page.screenshot({ path: `${OUT}/game-02-spawn.png` })

// walk east for a moment
await page.keyboard.down('d')
await sleep(900)
await page.keyboard.up('d')
await sleep(200)
const afterWalk = await page.evaluate(() => ({ x: Math.round(window.__game.player.x), y: Math.round(window.__game.player.y) }))

// teleport next to a camp and let the garrison spawn
const campInfo = await page.evaluate(() => {
  const g = window.__game
  const camp = g.camps.find(c => !c.def.tower)
  g.player.x = camp.def.x + 150
  g.player.y = camp.def.y + 150
  g.r.focus(g.player.x, g.player.y)
  return { name: camp.def.name, x: camp.def.x, y: camp.def.y, garrison: camp.def.garrison }
})
await sleep(1200)

// aim at the camp and fire for two seconds
await page.evaluate(() => {
  const g = window.__game
  const camp = g.camps.find(c => !c.def.tower)
  const dx = camp.def.x - g.player.x
  const dy = camp.def.y - g.player.y
  const l = Math.hypot(dx, dy) || 1
  g.input.aimX = dx / l
  g.input.aimY = dy / l
  g.input.aiming = true
  g.input.firing = true
})
await sleep(2200)
const combat = await page.evaluate(() => ({
  hp: Math.round(window.__game.player.hp),
  enemies: window.__game.enemies.length,
  spawned: window.__game.camps.filter(c => c.spawned).length,
  kills: window.__game.kills,
  ammo: window.__game.player.mag[window.__game.player.weapon]
}))
await page.evaluate(() => { window.__game.input.firing = false })
await page.screenshot({ path: `${OUT}/game-03-combat.png` })

// open the map screen
await page.click('#btnMap')
await sleep(500)
await page.screenshot({ path: `${OUT}/game-04-map.png` })
const mapVisible = await page.isVisible('#mapScreen')
await page.click('#mapClose')

// check hud state
const hud = await page.evaluate(() => ({
  hp: document.getElementById('hpFill').style.width,
  weapon: document.getElementById('weaponName').textContent,
  camps: document.getElementById('campCount').textContent,
  towers: document.getElementById('towerCount').textContent,
  clock: document.getElementById('clock').textContent
}))

console.log(JSON.stringify({ boot, afterWalk, campInfo, combat, mapVisible, hud, errors }, null, 1))
await browser.close()
