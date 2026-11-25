/* Offline render of the island map page → PNG, for visual QA without a browser.
   usage: node bermuda/tools/render/map.js out.png            */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createCanvas, Path2D } = require(process.env.CANVAS_MODULE || '@napi-rs/canvas');
const JS = path.join(__dirname, '../../survival/js');
const OUT = process.argv[2] || path.join(__dirname, '../../artifacts/map.png');
const VW = 1700, VH = 1500;
function makeEl(tag) {
  if (tag === 'canvas') { const c = createCanvas(1, 1); c.style = {}; return c; }
  return { style: {}, classList: { add(){}, remove(){}, toggle(){} }, appendChild(){},
    addEventListener(){}, querySelector: () => null, getContext: () => null };
}
const win = {
  Path2D, devicePixelRatio: 1, innerWidth: VW, innerHeight: VH,
  addEventListener(){}, removeEventListener(){}, requestAnimationFrame(){ return 0; },
  performance: { now: () => Date.now() }, navigator: { vibrate(){} },
  setTimeout, clearTimeout, setInterval, clearInterval, console, Math, Date, JSON, URLSearchParams,
  document: { createElement: makeEl, getElementById: () => makeEl('div'), querySelector: () => null,
    querySelectorAll: () => [], addEventListener(){}, body: makeEl('body') }
};
win.window = win; win.self = win;
vm.createContext(win);
for (const f of ['core.js', 'tiles.js', 'map.js']) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), win, { filename: f });
}
win.BS.build(() => {}, () => {
  win.BS.buildBase();
  if (win.BS.Painter.buildSprites) win.BS.Painter.buildSprites();
  const cv = createCanvas(VW, VH), ctx = cv.getContext('2d');
  const z = Math.min(VW / win.BS.W, VH / win.BS.H);
  const cam = { x: win.BS.W / 2, y: win.BS.H / 2, z, w: VW, h: VH };
  ctx.fillStyle = '#04203a'; ctx.fillRect(0, 0, VW, VH);
  win.BS.Painter.drawWorld(ctx, cam, { grid: false, labels: false });
  for (const p of win.BS.world.pois) {
    const sx = (p.x - cam.x) * z + VW / 2, sy = (p.y - cam.y) * z + VH / 2;
    if (sx < -40 || sy < -40 || sx > VW + 40 || sy > VH + 40) continue;
    win.BS.Painter.drawMarker(ctx, p, sx, sy, false);
  }
  win.BS.Painter.fadeEdges(ctx, cam, VW, VH);
  fs.writeFileSync(OUT, cv.toBuffer('image/png'));
  console.log('wrote', OUT);
});
