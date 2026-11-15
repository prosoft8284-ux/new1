#!/usr/bin/env python3
"""Second pass: hook restoreCam(), remember the chosen survivor, style the
record line. Anchors are asserted like the first pass."""

import io
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survival")

EDITS = [
    ("js/app.js",
     "          ready = true;",
     "          ready = true;\n          restoreCam();"),
    ("js/game.js",
     "      card.className = 'charcard';",
     "      card.className = 'charcard';\n      card.setAttribute('data-key', c.key);"),
    ("js/game.js",
     "  buildSelect();",
     "  buildSelect();\n\n  // remember the survivor from the last run\n  (function restorePick() {\n    if (!window.SAVE) return;\n    var key = SAVE.get('char', null);\n    if (!key) return;\n    var card = document.querySelector('.charcard[data-key=\"' + key + '\"]');\n    if (card) card.click();\n  })();"),
    ("css/preview.css",
     ".hints{display:flex;",
     ".bestline{font-size:11.5px;color:#9fc4d6;letter-spacing:.3px;margin:2px 0 10px}\n.bestline b{color:#e8d9a8;font-weight:700}\n.hints{display:flex;"),
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
