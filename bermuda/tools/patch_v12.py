#!/usr/bin/env python3
"""One-shot patch: wiring the save layer, haptics, visibility pause and camera
restore into the vanilla Bermude Survival client. Every edit asserts its anchor
so a changed file fails loudly instead of silently skipping."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")

EDITS = [
    # ---------------------------------------------------------------- preview.html
    ("preview.html",
     '<script src="js/sfx.js"></script>',
     '<script src="js/save.js"></script>\n<script src="js/sfx.js"></script>'),
    ("preview.html",
     '<button id="btnStart" class="go" disabled>آماده برای بقا</button>',
     '<div class="bestline" id="bestline"></div>\n      <button id="btnStart" class="go" disabled>آماده برای بقا</button>'),
    # ------------------------------------------------------------------ index.html
    ("index.html",
     '<script src="js/app.js"></script>',
     '<script src="js/save.js"></script>\n<script src="js/app.js"></script>'),
    # --------------------------------------------------------------------- sfx.js
    ("js/sfx.js",
     "var ready = false, muted = false;",
     "var ready = false, muted = !!(window.SAVE && window.SAVE.get('muted', false));"),
    ("js/sfx.js",
     "    toggle: function () {\n      muted = !muted;\n      if (master) master.gain.value = muted ? 0 : 0.75;\n      return muted;\n    },",
     "    toggle: function () {\n      muted = !muted;\n      if (window.SAVE) window.SAVE.set('muted', muted);\n      if (master) master.gain.value = muted ? 0 : 0.75;\n      return muted;\n    },"),
    # -------------------------------------------------------------------- game.js
    ("js/game.js",
     "    SFX.hurt();\n    if (p.hp <= 0) { p.hp = 0; die(); }",
     "    SFX.hurt();\n    if (navigator.vibrate) { try { navigator.vibrate(35); } catch (e) {} }\n    if (p.hp <= 0) { p.hp = 0; die(); }"),
    ("js/game.js",
     "  function die() {\n    G.over = true; G.paused = true;\n    SFX.death();\n    showModal('تو مردی',\n      'در موج ' + fa(G.wave) + ' کشته شدی.<br>' + fa(G.kills) + ' موجود فضایی نابود شد.',\n      'شروع دوباره', function () { restart(); });\n  }",
     "  function die() {\n    G.over = true; G.paused = true;\n    SFX.death();\n    var best = window.SAVE ? SAVE.recordRun(G.wave, G.kills) : null;\n    var bestTxt = best\n      ? '<br><span style=\"opacity:.75\">رکورد تو: موج ' + fa(best.wave) + ' · ' + fa(best.kills) + ' کشته</span>'\n      : '';\n    showModal('تو مردی',\n      'در موج ' + fa(G.wave) + ' کشته شدی.<br>' + fa(G.kills) + ' موجود فضایی نابود شد.' + bestTxt,\n      'شروع دوباره', function () { restart(); });\n  }"),
    ("js/game.js",
     "    G.player = makePlayer(def);\n    G.running = true; G.paused = false; G.over = false;",
     "    if (window.SAVE) SAVE.set('char', def.key);\n    G.player = makePlayer(def);\n    G.running = true; G.paused = false; G.over = false;"),
    ("js/game.js",
     "  addEventListener('blur', function () { firePressed = false; point.down = false; });",
     "  addEventListener('blur', function () { firePressed = false; point.down = false; });\n\n  // pause as soon as the app goes to the background (phone call, home button)\n  document.addEventListener('visibilitychange', function () {\n    if (document.hidden && G.running && !G.paused && !G.over) togglePause();\n  });\n\n  // show the personal best on the start screen\n  (function showBest() {\n    var el = document.getElementById('bestline');\n    if (!el || !window.SAVE) return;\n    var b = SAVE.best();\n    var runs = SAVE.get('runs', 0);\n    if (!b) { el.textContent = 'اولین نبرد تو'; return; }\n    el.innerHTML = 'رکورد: موج <b>' + fa(b.wave) + '</b> · <b>' + fa(b.kills) + '</b> کشته' +\n      (runs > 1 ? ' <span style=\"opacity:.6\">(' + fa(runs) + ' نبرد)</span>' : '');\n  })();"),
    # --------------------------------------------------------------------- app.js
    ("js/app.js",
     "    if (cam.z < minZoom) cam.z = minZoom;\n    clampCam();\n    dirty = true;\n  }",
     "    if (cam.z < minZoom) cam.z = minZoom;\n    clampCam();\n    dirty = true;\n  }\n\n  // remember where the player was looking on the island map\n  var camSaved = null;\n  function restoreCam() {\n    if (!window.SAVE) return;\n    var c = SAVE.get('cam', null);\n    if (!c) return;\n    cam.x = Number(c.x) || cam.x;\n    cam.y = Number(c.y) || cam.y;\n    cam.z = Number(c.z) || cam.z;\n    camSaved = { x: cam.x, y: cam.y, z: cam.z };\n    clampCam();\n  }\n  function persistCam() {\n    if (!window.SAVE) return;\n    var c = { x: Math.round(cam.x), y: Math.round(cam.y), z: Math.round(cam.z * 100) / 100 };\n    if (camSaved && camSaved.x === c.x && camSaved.y === c.y && camSaved.z === c.z) return;\n    camSaved = c;\n    SAVE.set('cam', c);\n  }\n  setInterval(persistCam, 2500);\n  window.addEventListener('pagehide', persistCam);"),
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
