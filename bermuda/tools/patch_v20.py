#!/usr/bin/env python3
"""v2.0 — liberation spine hooks."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")

EDITS = [
    ("preview.html",
     '<script src="js/game.js"></script>',
     '<script src="js/liberation.js"></script>\n<script src="js/game.js"></script>'),

    # shooting makes noise
    ("js/game.js",
     "      G.bullets.push({",
     "      if (window.LIB) LIB.noise(1.2);\n      G.bullets.push({"),

    # killing makes more noise
    ("js/game.js",
     "  function killAlien(idx) {",
     "  function killAlien(idx) {\n    if (window.LIB) LIB.noise(6);"),

    # bullets can hit the relay
    ("js/game.js",
     "      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;\n      if (bl.life <= 0) { G.bullets.splice(b, 1); continue; }",
     "      bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;\n      if (bl.life <= 0) { G.bullets.splice(b, 1); continue; }\n      if (window.LIB && LIB.hitTest(bl.x, bl.y)) {\n        LIB.hitNode(bl.dmg);\n        spawnParticles(bl.x, bl.y, 6, '#c37dff', 150, 0.3);\n        G.bullets.splice(b, 1);\n        continue;\n      }"),

    # liberation owns the wave clock while defending, and heat decays every frame
    ("js/game.js",
     "    // waves\n    G.nextWave -= dt;\n    if (G.nextWave <= 0 && G.aliens.length < 26) spawnWave();",
     "    // waves — the liberation loop takes over while the relay is under siege\n    if (window.LIB) LIB.update(dt);\n    G.nextWave -= dt;\n    if (!(window.LIB && LIB.controlsWaves()) && G.nextWave <= 0 && G.aliens.length < 26) spawnWave();"),

    # draw the relay with the world
    ("js/game.js",
     "    ctx.drawImage(SCENE.bg, 0, 0);",
     "    ctx.drawImage(SCENE.bg, 0, 0);\n    if (window.LIB) LIB.draw(ctx);"),

    # boot the loop after the terrain is baked
    ("js/game.js",
     "  SCENE.bake();\n  G.bgReady = true;",
     "  SCENE.bake();\n  G.bgReady = true;\n\n  if (window.LIB) {\n    LIB.init({\n      spawn: function (type, x, y, elite) { addAlien(type, x, y, elite); },\n      toast: toast, particles: spawnParticles, sfx: SFX, region: REGION\n    });\n    LIB.start();\n  }"),

    # HUD objective line follows the loop
    ("js/game.js",
     "    elWave.textContent = fa(G.wave);\n    elKills.textContent = fa(G.kills);",
     "    elWave.textContent = fa(G.wave);\n    elKills.textContent = fa(G.kills);\n    if (window.LIB) {\n      var _obj = document.getElementById('objective');\n      if (_obj) _obj.textContent = LIB.hudText();\n    }"),

    # dying during the siege falls back to a wounded relay instead of a full reset
    ("js/game.js",
     "  function die() {\n    G.over = true; G.paused = true;",
     "  function die() {\n    G.over = true; G.paused = true;\n    if (window.LIB) LIB.onDeath();"),
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
