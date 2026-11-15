#!/usr/bin/env python3
"""v2.3 — canopy overlay (walk under trees) + aim-down-sights shooting."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")
PJ = "js/props.js"
GJ = "js/game.js"

PALM_OLD = """  function palm(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0016 + x) * 2.4 * s;
    // shadow
    c.globalAlpha = 0.22; c.fillStyle = '#08180c';
    c.beginPath(); c.ellipse(x + 6 * s, y + 2, 20 * s, 6 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    // trunk
    c.strokeStyle = '#6b4d2c'; c.lineWidth = 4.5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + p.lean * 18 * s, y - 28 * s, x + p.lean * 26 * s + sway, y - 52 * s); c.stroke();
    c.strokeStyle = 'rgba(150,112,66,.7)'; c.lineWidth = 1.6 * s; c.stroke();
    var tx = x + p.lean * 26 * s + sway, ty = y - 52 * s;
    // fronds
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * 6.2832 + 0.4;
      var len = 22 * s + (i % 2) * 6 * s;
      c.strokeStyle = i % 2 ? '#2f6b34' : '#3f8a41';
      c.lineWidth = 3.4 * s;
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 5,
        tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.8);
      c.stroke();
    }
    circ(c, tx, ty, 3 * s, '#28522b');
  }"""

PALM_NEW = """  function palmBase(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0016 + x) * 2.4 * s;
    c.globalAlpha = 0.22; c.fillStyle = '#08180c';
    c.beginPath(); c.ellipse(x + 6 * s, y + 2, 20 * s, 6 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = '#6b4d2c'; c.lineWidth = 4.5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + p.lean * 18 * s, y - 28 * s, x + p.lean * 26 * s + sway, y - 52 * s); c.stroke();
    c.strokeStyle = 'rgba(150,112,66,.7)'; c.lineWidth = 1.6 * s; c.stroke();
  }

  // the fronds live on their own layer so the player can walk beneath them
  function palmCrown(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0016 + x) * 2.4 * s;
    var tx = x + p.lean * 26 * s + sway, ty = y - 52 * s;
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * 6.2832 + 0.4;
      var len = 22 * s + (i % 2) * 6 * s;
      c.strokeStyle = i % 2 ? '#2f6b34' : '#3f8a41';
      c.lineWidth = 3.4 * s;
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 5,
        tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.8);
      c.stroke();
    }
    circ(c, tx, ty, 3 * s, '#28522b');
  }

  function palm(c, p, t) { palmBase(c, p, t); palmCrown(c, p, t); }"""

TREE_OLD = """  function tree(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    c.globalAlpha = 0.25; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(x + 5 * s, y + 3, 26 * s, 9 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#3b2a1c'; c.fillRect(x - 4 * s, y - 20 * s, 8 * s, 22 * s);
    c.fillStyle = '#4d3826'; c.fillRect(x - 4 * s, y - 20 * s, 3 * s, 22 * s);
    var sway = Math.sin(t * 0.0012 + x * 0.1) * 1.6;
    circ(c, x + sway, y - 40 * s, 26 * s, '#1b4527');"""

TREE_NEW = """  function treeBase(c, p) {
    var s = p.s, x = p.x, y = p.y;
    c.globalAlpha = 0.25; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(x + 5 * s, y + 3, 26 * s, 9 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#3b2a1c'; c.fillRect(x - 4 * s, y - 20 * s, 8 * s, 22 * s);
    c.fillStyle = '#4d3826'; c.fillRect(x - 4 * s, y - 20 * s, 3 * s, 22 * s);
  }

  function treeCrown(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0012 + x * 0.1) * 1.6;
    circ(c, x + sway, y - 40 * s, 26 * s, '#1b4527');"""

BUSH_OLD = """  function bush(c, p) {
    var s = p.s;
    circ(c, p.x, p.y - 6 * s, 12 * s, '#24552e');"""

BUSH_NEW = """  function bushBase(c, p) {
    var s = p.s;
    c.globalAlpha = 0.2; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(p.x + 3 * s, p.y + 2, 13 * s, 5 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
  }

  function bushCrown(c, p) {
    var s = p.s;
    circ(c, p.x, p.y - 6 * s, 12 * s, '#24552e');"""

EDITS = [
    (PJ, PALM_OLD, PALM_NEW),
    (PJ, TREE_OLD, TREE_NEW),
    (PJ, BUSH_OLD, BUSH_NEW),
    # close the split functions and export them
    (PJ,
     "  function rock(c, p) {",
     "  function tree(c, p, t) { treeBase(c, p, t); treeCrown(c, p, t); }\n  function bush(c, p) { bushBase(c, p); bushCrown(c, p); }\n\n  function rock(c, p) {"),
    (PJ,
     "  return {\n    palm: palm, tree: tree, bush: bush, rock: rock, circ: circ, tent: tent, fire: fire,",
     "  return {\n    palm: palm, tree: tree, bush: bush, rock: rock, circ: circ, tent: tent, fire: fire,\n    palmBase: palmBase, palmCrown: palmCrown,\n    treeBase: treeBase, treeCrown: treeCrown,\n    bushBase: bushBase, bushCrown: bushCrown,\n    crownKinds: { tree: 'treeCrown', palm: 'palmCrown', bush: 'bushCrown' },"),

    # --- game.js: base pass + crown overlay
    (GJ,
     "      case 'palm': PROPS.palm(ctx, p, t); break;\n      case 'tree': PROPS.tree(ctx, p, t); break;\n      case 'bush': PROPS.bush(ctx, p, t); break;",
     "      case 'palm': PROPS.palmBase(ctx, p, t); break;\n      case 'tree': PROPS.treeBase(ctx, p, t); break;\n      case 'bush': PROPS.bushBase(ctx, p, t); break;"),

    (GJ,
     "    // when the canopy swallows the player, leave a faint silhouette so he is\n    // never lost behind the leaves\n    if (G.player) {\n      var occluded = false;\n      for (i = 0; i < SCENE.props.length; i++) {\n        var pp = SCENE.props[i];\n        if (pp.kind !== 'tree' && pp.kind !== 'palm' && pp.kind !== 'bush') continue;\n        if (pp.y > G.player.y + 4 && pp.y - G.player.y < 96 && Math.abs(pp.x - G.player.x) < 42) {\n          occluded = true; break;\n        }\n      }\n      if (occluded) {\n        ctx.globalAlpha = 0.22;\n        drawEntity(G.player, true);\n        ctx.globalAlpha = 1;\n      }\n    }",
     "    // canopy layer: leaves sit above everything, so the player walks UNDER a\n    // tree while its trunk still blocks him. Nearer crowns are drawn last.\n    var crowns = [];\n    for (i = 0; i < SCENE.props.length; i++) {\n      if (PROPS.crownKinds[SCENE.props[i].kind]) crowns.push(SCENE.props[i]);\n    }\n    crowns.sort(function (a, b) { return a.y - b.y; });\n    for (i = 0; i < crowns.length; i++) {\n      var cp = crowns[i];\n      ctx.globalAlpha = 0.94;\n      PROPS[PROPS.crownKinds[cp.kind]](ctx, cp, t);\n    }\n    ctx.globalAlpha = 1;"),

    # --- aiming
    (GJ,
     "      sprite: PIX.SURVIVORS[def.key], radius: 13",
     "      sprite: PIX.SURVIVORS[def.key], radius: 13, aiming: false"),

    (GJ,
     "    var fireNow = point.down || keys['j'] || firePressed;\n    if (fireNow && (!wasFire || curW(p).auto)) shoot();\n    wasFire = fireNow;",
     "    var fireNow = point.down || keys['j'] || firePressed;\n    p.aiming = !!fireNow;\n    if (fireNow && (!wasFire || curW(p).auto)) shoot();\n    wasFire = fireNow;"),

    (GJ,
     "      p.x += mx * p.speed * spdMul * dt;\n      p.y += my * p.speed * spdMul * dt;",
     "      var aimMul = p.aiming ? 0.62 : 1;\n      p.x += mx * p.speed * spdMul * aimMul * dt;\n      p.y += my * p.speed * spdMul * aimMul * dt;"),

    (GJ,
     "      var a = p.aim + (Math.random() - 0.5) * w.spread * 2;",
     "      var a = p.aim + (Math.random() - 0.5) * w.spread * 2 * (p.aiming ? 0.45 : 1);"),

    # reticle + laser while aiming
    (GJ,
     "    // loot\n    for (i = 0; i < G.drops.length; i++) drawDrop(G.drops[i], t);",
     "    // aiming reticle + laser sight\n    if (G.player && G.player.aiming) {\n      var ap = G.player;\n      var ax0 = ap.x + Math.cos(ap.aim) * 20, ay0 = ap.y - 14 + Math.sin(ap.aim) * 20;\n      var ax1 = ap.x + Math.cos(ap.aim) * 250, ay1 = ap.y - 14 + Math.sin(ap.aim) * 250;\n      ctx.globalAlpha = 0.5;\n      ctx.strokeStyle = 'rgba(255,64,80,.9)';\n      ctx.lineWidth = 1.2;\n      ctx.setLineDash([6, 7]);\n      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax1, ay1); ctx.stroke();\n      ctx.setLineDash([]);\n      ctx.globalAlpha = 0.95;\n      ctx.beginPath(); ctx.arc(ax1, ay1, 11, 0, 6.2832); ctx.stroke();\n      ctx.beginPath();\n      ctx.moveTo(ax1 - 18, ay1); ctx.lineTo(ax1 - 5, ay1);\n      ctx.moveTo(ax1 + 5, ay1); ctx.lineTo(ax1 + 18, ay1);\n      ctx.moveTo(ax1, ay1 - 18); ctx.lineTo(ax1, ay1 - 5);\n      ctx.moveTo(ax1, ay1 + 5); ctx.lineTo(ax1, ay1 + 18);\n      ctx.stroke();\n      ctx.globalAlpha = 1;\n    }\n\n    // loot\n    for (i = 0; i < G.drops.length; i++) drawDrop(G.drops[i], t);"),
]


def main():
    ok = 0
    for rel, old, new in EDITS:
        path = os.path.join(ROOT, rel)
        with io.open(path, encoding="utf-8") as fh:
            src = fh.read()
        if old not in src:
            print("MISS", rel, "->", old.splitlines()[0][:70])
            continue
        src = src.replace(old, new, 1)
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(src)
        ok += 1
        print("ok  ", rel, "->", old.splitlines()[0][:60])
    print("\n%d/%d edits applied" % (ok, len(EDITS)))
    return 0 if ok == len(EDITS) else 1


if __name__ == "__main__":
    sys.exit(main())
