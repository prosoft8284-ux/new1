#!/usr/bin/env python3
"""v2.1 — combat feel + role squads."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")
G = "js/game.js"

EDITS = [
    # state
    (G,
     "    wave: 0, kills: 0, waveTimer: 0, nextWave: 2.5, shake: 0, flash: 0, bossSpawned: false\n  };",
     "    wave: 0, kills: 0, waveTimer: 0, nextWave: 2.5, shake: 0, flash: 0, bossSpawned: false,\n    hitStop: 0, nums: [], hurtAng: 0, hurtT: 0, touch: false\n  };"),

    # reset on start / restart
    (G,
     "    G.wave = 0; G.kills = 0; G.nextWave = 3; G.bossSpawned = false;",
     "    G.wave = 0; G.kills = 0; G.nextWave = 3; G.bossSpawned = false;\n    G.nums = []; G.hitStop = 0; G.hurtT = 0;"),
    (G,
     "    G.wave = 0; G.kills = 0; G.nextWave = 3.5; G.bossSpawned = false;",
     "    G.wave = 0; G.kills = 0; G.nextWave = 3.5; G.bossSpawned = false;\n    G.nums = []; G.hitStop = 0; G.hurtT = 0;"),

    # hit-stop + floating numbers clock
    (G,
     "  function update(dt) {\n    var p = G.player;\n    if (!p) return;\n    G.t += dt;",
     "  function update(dt) {\n    var p = G.player;\n    if (!p) return;\n    if (G.hitStop > 0) { G.hitStop = Math.max(0, G.hitStop - dt); dt *= 0.15; }\n    G.hurtT = Math.max(0, G.hurtT - dt);\n    for (var ni = G.nums.length - 1; ni >= 0; ni--) {\n      var nm = G.nums[ni];\n      nm.y -= 26 * dt; nm.life -= dt;\n      if (nm.life <= 0) G.nums.splice(ni, 1);\n    }\n    G.t += dt;"),

    # damage numbers on hit
    (G,
     "          tgt.hp -= bl.dmg; tgt.hurt = 0.14;",
     "          tgt.hp -= bl.dmg; tgt.hurt = 0.14;\n          G.nums.push({ x: tgt.x + rand(-5, 5), y: tgt.y - tgt.r - 6, txt: Math.round(bl.dmg),\n            life: 0.62, max: 0.62, color: tgt.elite ? '#ffd479' : '#ffeec2' });"),

    # kill punch
    (G,
     "  function killAlien(idx) {\n    if (window.LIB) LIB.noise(6);",
     "  function killAlien(idx) {\n    if (window.LIB) LIB.noise(6);\n    G.hitStop = Math.max(G.hitStop, 0.055);"),

    # damage source for the direction arrow
    (G,
     "  function hurtPlayer(dmg) {\n    var p = G.player;\n    if (!p || p.hurt > 0 || p.dodge > 0 || p.inv > 0) return;\n    if (G.god) return;                       // ?god=1 — screenshot / demo mode\n    p.hp -= dmg; p.hurt = 0.32; G.flash = 0.5; G.shake = 7;",
     "  function hurtPlayer(dmg, sx, sy) {\n    var p = G.player;\n    if (!p || p.hurt > 0 || p.dodge > 0 || p.inv > 0) return;\n    if (G.god) return;                       // ?god=1 — screenshot / demo mode\n    p.hp -= dmg; p.hurt = 0.32; G.flash = 0.5; G.shake = 7;\n    if (sx != null && sy != null) { G.hurtAng = Math.atan2(sy - p.y, sx - p.x); G.hurtT = 0.95; }\n    G.nums.push({ x: p.x + rand(-4, 4), y: p.y - 30, txt: '-' + Math.round(dmg),\n      life: 0.7, max: 0.7, color: '#ff7b8b' });"),

    # touch flag
    (G,
     "    var touchy = qs.get('touch') || ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);",
     "    var touchy = qs.get('touch') || ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);\n    G.touch = !!touchy;"),

    # aim assist (touch / stick)
    (G,
     "    if (Math.cos(p.aim) > 0.15) p.face = 1;",
     "    if ((G.touch || joy.active) && G.aliens.length) {\n      var aBest = null, aDist = 1e9, aAng = 0;\n      for (var ai = 0; ai < G.aliens.length; ai++) {\n        var ao = G.aliens[ai], ad = dist(ao, p);\n        if (ad > 300 || ad > aDist) continue;\n        var a2 = Math.atan2(ao.y - p.y, ao.x - p.x);\n        var diff = Math.abs(((a2 - p.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);\n        if (diff < 0.26) { aDist = ad; aBest = ao; aAng = a2; }\n      }\n      if (aBest) p.aim += (((aAng - p.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.5;\n    }\n    if (Math.cos(p.aim) > 0.15) p.face = 1;"),

    # role squads
    (G,
     "    var eliteChance = Math.min(0.24, 0.05 + G.wave * 0.02);",
     "    // role squads: a shield up front, a caster behind, a bomber to flush you out\n    if (G.wave >= 2 && n >= 3 && Math.random() < 0.55) {\n      var sa = Math.random() * 6.2832, sr = rand(110, 180) * SCENE.S;\n      var sqx = cx + Math.cos(sa) * sr * 1.2, sqy = cy + Math.sin(sa) * sr;\n      var squad = ['brute', 'neural', 'bomber'];\n      for (var si = 0; si < squad.length; si++) {\n        addAlien(squad[si], sqx + rand(-24, 24), sqy + rand(-20, 20), si === 0 && Math.random() < 0.25);\n      }\n      n -= 3;\n    }\n    var eliteChance = Math.min(0.24, 0.05 + G.wave * 0.02);"),

    # draw floating numbers (world space)
    (G,
     "    // floating spores / motes",
     "    // damage numbers\n    for (i = 0; i < G.nums.length; i++) {\n      var nu = G.nums[i];\n      ctx.globalAlpha = Math.max(0, nu.life / nu.max);\n      ctx.font = 'bold 13px \"Trebuchet MS\", sans-serif';\n      ctx.textAlign = 'center';\n      ctx.fillStyle = 'rgba(8,10,14,.75)';\n      ctx.fillText(nu.txt, nu.x + 1, nu.y + 1);\n      ctx.fillStyle = nu.color;\n      ctx.fillText(nu.txt, nu.x, nu.y);\n    }\n    ctx.globalAlpha = 1;\n    ctx.textAlign = 'left';\n\n    // floating spores / motes"),

    # damage direction arrow (screen space)
    (G,
     "    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n    if (G.flash > 0) {",
     "    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n    if (G.hurtT > 0) {\n      var cxs = vw / 2, cys = vh / 2, hrad = Math.min(vw, vh) * 0.34;\n      ctx.save();\n      ctx.translate(cxs, cys);\n      ctx.rotate(G.hurtAng);\n      ctx.globalAlpha = Math.min(1, G.hurtT);\n      ctx.fillStyle = 'rgba(255,74,92,.85)';\n      ctx.beginPath();\n      ctx.moveTo(hrad + 28, 0); ctx.lineTo(hrad, -13); ctx.lineTo(hrad, 13);\n      ctx.closePath(); ctx.fill();\n      ctx.restore();\n      ctx.globalAlpha = 1;\n    }\n    if (G.flash > 0) {"),
]

# callers that should pass a source position
GLOBAL_REPLACE = [
    (G, "hurtPlayer(e.dmg);", "hurtPlayer(e.dmg, e.x, e.y);"),
    (G, "hurtPlayer(a.def.dmg);", "hurtPlayer(a.def.dmg, a.x, a.y);"),
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

    for rel, old, new in GLOBAL_REPLACE:
        path = os.path.join(ROOT, rel)
        with io.open(path, encoding="utf-8") as fh:
            src = fh.read()
        n = src.count(old)
        if not n:
            print("MISS (all)", rel, old)
            continue
        src = src.replace(old, new)
        with io.open(path, "w", encoding="utf-8") as fh:
            fh.write(src)
        ok += 1
        print("ok  ", rel, "->", old, "x%d" % n)

    print("\n%d edits applied" % ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
