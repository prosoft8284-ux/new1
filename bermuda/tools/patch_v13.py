#!/usr/bin/env python3
"""v1.3 — map to scene: region profiles drive the playable slice."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")

EDITS = [
    # ------------------------------------------------------------------ preview.html
    ("preview.html",
     '<script src="js/scene.js"></script>',
     '<script src="js/regions.js"></script>\n<script src="js/scene.js"></script>'),
    # -------------------------------------------------------------------- scene.js
    ("js/scene.js",
     "  var rnd = mulberry(20261115);",
     "  var rnd = mulberry(20261115);\n\n  // region profile (set by configure() before bake)\n  var P = {\n    name: '', jungle: 1, palms: 1, camp: true, crash: true,\n    shoreShift: 0, tint: null\n  };\n\n  function configure(profile) {\n    if (!profile) return P;\n    P = {\n      name: profile.name || '',\n      jungle: profile.jungle == null ? 1 : profile.jungle,\n      palms: profile.palms == null ? 1 : profile.palms,\n      camp: !!profile.camp,\n      crash: !!profile.crash,\n      shoreShift: profile.shoreShift || 0,\n      tint: profile.tint || null\n    };\n    return P;\n  }"),
    ("js/scene.js",
     "    return (772 + Math.sin(d * 0.0052) * 20",
     "    return (772 + P.shoreShift + Math.sin(d * 0.0052) * 20"),
    ("js/scene.js",
     "    // crash crater\n",
     "    if (P.crash) {\n    // crash crater\n"),
    ("js/scene.js",
     "    // camp clearing\n",
     "    }\n    // camp clearing\n"),
    ("js/scene.js",
     "    for (i = 0; i < 34 * S * S; i++) {",
     "    for (i = 0; i < 34 * S * S * P.palms; i++) {"),
    ("js/scene.js",
     "    for (i = 0; i < 210 * S * S; i++) {",
     "    for (i = 0; i < 210 * S * S * P.jungle; i++) {"),
    ("js/scene.js",
     "    // main camp\n",
     "    if (P.camp) {\n    // main camp\n"),
    ("js/scene.js",
     "    // second camp: ranger post on the eastern shore\n",
     "    }\n    // second camp: ranger post on the eastern shore\n"),
    ("js/scene.js",
     "    // alien crash site\n",
     "    if (P.crash) {\n    // alien crash site\n"),
    ("js/scene.js",
     "    props.sort(function (a, b) { return a.y - b.y; });",
     "    }\n    props.sort(function (a, b) { return a.y - b.y; });"),
    ("js/scene.js",
     "    bg = cv;\n    buildProps();",
     "    if (P.tint) { c.fillStyle = P.tint; c.fillRect(0, 0, W, H); }\n    bg = cv;\n    buildProps();"),
    ("js/scene.js",
     "  return {\n    W: W, H: H, S: S, props: props, bake: bake, shoreY: shoreY, blocked: blocked,",
     "  return {\n    configure: configure, profile: function () { return P; },\n    W: W, H: H, S: S, props: props, bake: bake, shoreY: shoreY, blocked: blocked,"),
    # --------------------------------------------------------------------- game.js
    ("js/game.js",
     "    elName.textContent = def.name;\n    elClass.textContent = def.cls;",
     "    elName.textContent = def.name;\n    elClass.textContent = (REGION ? REGION.name + ' · ' : '') + def.cls;"),
    ("js/game.js",
     "    if (G.wave >= 2) pool.push('winged', 'runner', 'bomber');",
     "    if (G.wave >= 1 && REGION && REGION.aliens) {\n      REGION.aliens.forEach(function (k) { if (pool.indexOf(k) < 0) pool.push(k); });\n    }\n    if (G.wave >= 2) pool.push('winged', 'runner', 'bomber');"),
    # ---------------------------------------------------------------------- app.js
    ("js/app.js",
     "    card.classList.remove('hidden');\n    dirty = true;\n  }",
     "    var enter = document.getElementById('cardEnter');\n    if (!enter) {\n      enter = document.createElement('a');\n      enter.id = 'cardEnter';\n      enter.className = 'go';\n      enter.style.cssText = 'display:block;margin-top:10px;text-align:center;text-decoration:none';\n      card.appendChild(enter);\n    }\n    enter.textContent = 'ورود به این منطقه';\n    enter.href = 'preview.html?poi=' + encodeURIComponent(poi.id || '') +\n      '&type=' + encodeURIComponent(poi.type || '') +\n      '&name=' + encodeURIComponent(poi.name || '');\n    card.classList.remove('hidden');\n    dirty = true;\n  }"),
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
