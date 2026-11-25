/* Offline render of an in-game region → PNG.
   usage: node bermuda/tools/render/scene.js <kit-type> out.png             */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createCanvas, Path2D } = require(process.env.CANVAS_MODULE || '@napi-rs/canvas');
const JS = path.join(__dirname, '../../survival/js');
const type = process.argv[2] || 'town';
const out = process.argv[3] || path.join(__dirname, '../../artifacts/scene.png');
const VW = 1600, VH = 900;
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
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  document: { createElement: makeEl, getElementById: () => makeEl('div'), querySelector: () => null,
    querySelectorAll: () => [], addEventListener(){}, body: makeEl('body') }
};
win.window = win; win.self = win;
vm.createContext(win);
for (const f of ['pix.js','props.js','save.js','meta.js','regions.js','kitmeta.js','props2.js','kits.js','scene.js']) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), win, { filename: f });
}
const region = win.REGIONS.forType(type, 'r'); region.id = 'qa-' + type;
win.SCENE.configure(region); win.SCENE.bake();
const cv = createCanvas(VW, VH), ctx = cv.getContext('2d'), S = win.SCENE;
const zoom = 1.95, px = 1010 * S.S, py = 566 * S.S;
ctx.setTransform(zoom, 0, 0, zoom, VW / 2 - px * zoom, VH / 2 - py * zoom);
ctx.imageSmoothingEnabled = false;
ctx.drawImage(S.bg, 0, 0);
const props = S.props.slice().sort((a, b) => a.y - b.y);
const P1 = win.PROPS, P2 = win.PROPS2;
const CROWN = { tree: P1.treeCrown, palm: P1.palmCrown, bush: P1.bushCrown };
const BASE = { tree: P1.treeBase, palm: P1.palmBase, bush: P1.bushBase };
const near = p => p.x > px - 900 && p.x < px + 900 && p.y > py - 900 && p.y < py + 900;
for (const p of props) {
  if (!near(p)) continue;
  if (BASE[p.kind]) { BASE[p.kind](ctx, p, 1000); continue; }
  if (P1[p.kind]) { P1[p.kind](ctx, p, 1000); continue; }
  if (P2[p.kind]) { P2[p.kind](ctx, p, 1000); continue; }
}
const spr = win.PIX.SURVIVORS.warrior;
ctx.save(); ctx.translate(px, py - 46 * 0.45);
const sw = 46 * (spr.img.width / spr.img.height);
ctx.drawImage(spr.img, -sw / 2, -23, sw, 46); ctx.restore();
for (const p of props) {
  if (!CROWN[p.kind] || !near(p)) continue;
  ctx.globalAlpha = 0.94; CROWN[p.kind](ctx, p, 1000);
}
ctx.globalAlpha = 1;
fs.writeFileSync(out, cv.toBuffer('image/png'));
console.log('wrote', out, 'props=' + props.length);
