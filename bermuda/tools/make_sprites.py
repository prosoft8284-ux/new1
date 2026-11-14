#!/usr/bin/env python3
"""
Build game sprites.

If sheet crops exist in assets/sheets/ (sheet_alien.png, sheet_characters.png),
they are cut into transparent character/enemy sprites. Otherwise stylised
stand-in sprites are generated so the game is playable until the sheets land.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "game", "public", "sprites")
SHEETS = os.path.join(ROOT, "assets", "sheets")

S = 96


def new_sprite():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def glow(img, color, center, radius):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
              fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.5))
    img.alpha_composite(layer)


# ---------------------------------------------------------------------------
# stand-in art (used only when the design sheets are absent)
# ---------------------------------------------------------------------------

def make_player(path):
    img, d = new_sprite()
    cx, cy = S // 2, S // 2
    # shadow
    d.ellipse([cx - 26, cy + 20, cx + 26, cy + 36], fill=(0, 0, 0, 80))
    # legs
    d.rounded_rectangle([cx - 15, cy + 8, cx - 4, cy + 30], 5, fill=(24, 30, 42))
    d.rounded_rectangle([cx + 4, cy + 8, cx + 15, cy + 30], 5, fill=(24, 30, 42))
    # coat / body
    d.rounded_rectangle([cx - 20, cy - 16, cx + 20, cy + 14], 12, fill=(30, 44, 66))
    d.rounded_rectangle([cx - 14, cy - 14, cx + 14, cy + 10], 10, fill=(38, 58, 86))
    # tech pack
    d.rounded_rectangle([cx - 10, cy - 6, cx + 10, cy + 6], 5, fill=(26, 34, 48))
    d.ellipse([cx - 5, cy - 4, cx + 2, cy + 3], fill=(70, 220, 255))
    glow(img, (60, 200, 255, 120), (cx - 2, cy), 8)
    # shoulders
    d.ellipse([cx - 26, cy - 12, cx - 12, cy + 4], fill=(34, 50, 76))
    d.ellipse([cx + 12, cy - 12, cx + 26, cy + 4], fill=(34, 50, 76))
    # head + visor
    d.ellipse([cx - 9, cy - 26, cx + 9, cy - 8], fill=(22, 28, 38))
    d.rounded_rectangle([cx - 7, cy - 22, cx + 7, cy - 14], 3, fill=(90, 225, 255))
    glow(img, (90, 225, 255, 130), (cx, cy - 18), 9)
    img.save(path)


def make_alien(path, body, accent, kind):
    img, d = new_sprite()
    cx, cy = S // 2, S // 2
    d.ellipse([cx - 24, cy + 22, cx + 24, cy + 34], fill=(0, 0, 0, 90))

    if kind == "runner":
        d.polygon([(cx - 20, cy + 24), (cx - 6, cy - 22), (cx + 12, cy + 2), (cx + 24, cy + 26)],
                  fill=body)
        d.polygon([(cx - 12, cy - 6), (cx + 2, cy - 26), (cx + 10, cy - 2)], fill=body)
        d.line([(cx - 14, cy - 22), (cx - 26, cy - 34)], fill=accent, width=4)
        d.line([(cx + 8, cy - 18), (cx + 22, cy - 30)], fill=accent, width=4)
        eyes = [(cx - 2, cy - 6), (cx + 8, cy - 4)]
    elif kind == "brute":
        d.ellipse([cx - 26, cy - 12, cx + 26, cy + 30], fill=body)
        d.ellipse([cx - 20, cy - 24, cx + 20, cy + 6], fill=body)
        d.polygon([(cx - 18, cy - 20), (cx - 30, cy - 34), (cx - 10, cy - 26)], fill=accent)
        d.polygon([(cx + 18, cy - 20), (cx + 30, cy - 34), (cx + 10, cy - 26)], fill=accent)
        d.rounded_rectangle([cx - 34, cy - 6, cx - 22, cy + 20], 6, fill=body)
        d.rounded_rectangle([cx + 22, cy - 6, cx + 34, cy + 20], 6, fill=body)
        eyes = [(cx - 10, cy - 14), (cx + 10, cy - 14)]
    elif kind == "jelly":
        glow(img, (150, 90, 220, 110), (cx, cy - 6), 30)
        d.ellipse([cx - 26, cy - 30, cx + 26, cy + 10], fill=body)
        d.ellipse([cx - 18, cy - 22, cx + 18, cy + 4], fill=accent)
        for i in range(-3, 4):
            d.line([(cx + i * 7, cy + 6), (cx + i * 6, cy + 34)], fill=body, width=3)
        eyes = []
    else:  # mage
        d.polygon([(cx, cy - 34), (cx + 20, cy + 26), (cx - 20, cy + 26)], fill=body)
        d.ellipse([cx - 12, cy - 30, cx + 12, cy - 8], fill=accent)
        for sx in (-1, 1):
            glow(img, (190, 120, 255, 120), (cx + sx * 26, cy + 2), 12)
            d.ellipse([cx + sx * 26 - 6, cy - 4, cx + sx * 26 + 6, cy + 8], fill=accent)
        eyes = [(cx - 4, cy - 20), (cx + 4, cy - 20)]

    for (ex, ey) in eyes:
        d.ellipse([ex - 4, ey - 4, ex + 4, ey + 4], fill=(255, 240, 120))
        glow(img, (255, 210, 90, 150), (ex, ey), 6)
    img.save(path)


def make_icons():
    def icon(name, draw_fn):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(img))
        img.save(os.path.join(OUT, name))

    def crate(d):
        d.rounded_rectangle([8, 10, 56, 54], 4, fill=(120, 92, 58), outline=(58, 42, 26), width=3)
        d.line([(12, 14), (52, 50)], fill=(66, 48, 30), width=3)
        d.line([(52, 14), (12, 50)], fill=(66, 48, 30), width=3)

    def herb(d):
        d.line([(32, 58), (32, 30)], fill=(70, 120, 60), width=4)
        for (dx, dy) in ((-12, -6), (12, -12), (-10, -22), (10, -26)):
            d.ellipse([32 + dx - 9, 32 + dy - 6, 32 + dx + 9, 32 + dy + 6], fill=(96, 190, 96))

    def medkit(d):
        d.rounded_rectangle([10, 16, 54, 52], 6, fill=(232, 232, 224), outline=(60, 70, 80), width=3)
        d.rectangle([27, 22, 37, 46], fill=(214, 66, 66))
        d.rectangle([19, 30, 45, 38], fill=(214, 66, 66))

    def ammo(d):
        d.rounded_rectangle([14, 14, 50, 50], 4, fill=(96, 108, 88), outline=(40, 46, 38), width=3)
        for i in range(3):
            d.rectangle([21 + i * 9, 20, 25 + i * 9, 44], fill=(226, 190, 96))

    def flag(d):
        d.line([(26, 12), (26, 54)], fill=(210, 210, 200), width=4)
        d.polygon([(28, 14), (52, 20), (28, 30)], fill=(214, 74, 64))

    icon("crate.png", crate)
    icon("herb.png", herb)
    icon("medkit.png", medkit)
    icon("ammo.png", ammo)
    icon("flag.png", flag)


PROP_ART = {
    "tree": ((28, 62, 34), (48, 92, 48)),
    "palm": ((40, 70, 36), (92, 128, 62)),
    "bush": ((34, 66, 38), (58, 100, 50)),
    "grass": ((104, 126, 70), (150, 172, 96)),
    "reed": ((88, 108, 62), (128, 148, 84)),
    "rock": ((78, 74, 68), (122, 116, 106)),
    "crystal": ((104, 44, 138), (182, 110, 228)),
    "debris": ((56, 48, 54), (96, 84, 92)),
    "column": ((112, 106, 96), (162, 154, 138)),
}


def make_props(out_dir):
    """Small top-down prop sprites used by the renderer's prop layer."""
    for name, (dark, light) in PROP_ART.items():
        for size in (48,):
            img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            c = size // 2
            if name in ("tree", "palm", "bush"):
                d.ellipse([c - 20, c - 6, c + 20, c + 14], fill=(0, 0, 0, 70))
                for (dx, dy, rr) in ((-9, -2, 14), (7, 4, 13), (0, -10, 15), (-4, 8, 12)):
                    d.ellipse([c + dx - rr, c + dy - rr, c + dx + rr, c + dy + rr], fill=dark)
                d.ellipse([c - 12, c - 16, c + 6, c + 2], fill=light)
                d.ellipse([c + 2, c - 4, c + 16, c + 10], fill=light)
            elif name == "rock":
                d.ellipse([c - 16, c + 2, c + 16, c + 14], fill=(0, 0, 0, 70))
                d.polygon([(c - 16, c + 8), (c - 10, c - 12), (c + 4, c - 16), (c + 16, c + 2), (c + 10, c + 12)],
                          fill=dark)
                d.polygon([(c - 10, c - 12), (c + 4, c - 16), (c + 6, c - 4), (c - 6, c)], fill=light)
            elif name == "crystal":
                d.polygon([(c, c - 20), (c + 12, c), (c + 4, c + 16), (c - 8, c + 10), (c - 10, c - 8)], fill=dark)
                d.polygon([(c, c - 18), (c + 5, c - 2), (c, c + 6)], fill=light)
            elif name == "column":
                d.rectangle([c - 7, c - 18, c + 7, c + 16], fill=dark)
                d.rectangle([c - 4, c - 18, c + 2, c + 16], fill=light)
            elif name == "debris":
                d.polygon([(c - 16, c + 8), (c - 4, c - 12), (c + 14, c + 2), (c + 6, c + 14)], fill=dark)
                d.polygon([(c - 4, c - 12), (c + 8, c - 4), (c + 2, c + 6)], fill=light)
            elif name == "grass":
                for i in range(-2, 3):
                    d.line([(c + i * 5, c + 16), (c + i * 6, c - 12)], fill=dark, width=2)
                    d.line([(c + i * 5, c + 12), (c + i * 6 - 3, c - 6)], fill=light, width=1)
            else:  # reed
                for i in range(-2, 3):
                    d.line([(c + i * 5, c + 18), (c + i * 4, c - 16)], fill=dark, width=2)
            img.save(os.path.join(out_dir, f"p_{name}.png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SHEETS, exist_ok=True)
    sheets = [f for f in os.listdir(SHEETS) if f.lower().endswith((".png", ".jpg", ".webp"))]
    if sheets:
        print("sheets found:", ", ".join(sheets))
        print("NOTE: sprite cutter is a placeholder; add crop rules before relying on it.")
    else:
        print("no design sheets in assets/sheets -> generating stand-in sprites")

    make_player(os.path.join(OUT, "player.png"))
    make_alien(os.path.join(OUT, "alien_runner.png"), (62, 44, 96), (186, 120, 228), "runner")
    make_alien(os.path.join(OUT, "alien_brute.png"), (58, 62, 92), (162, 108, 210), "brute")
    make_alien(os.path.join(OUT, "alien_jelly.png"), (86, 58, 138), (168, 128, 240), "jelly")
    make_alien(os.path.join(OUT, "alien_mage.png"), (54, 38, 84), (196, 138, 255), "mage")
    make_icons()
    make_props(OUT)
    print("->", OUT)


if __name__ == "__main__":
    main()
