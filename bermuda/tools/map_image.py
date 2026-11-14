#!/usr/bin/env python3
"""
Ingest the painted world-map artwork and wire it into the game.

  assets/map-source.png        <- the artwork (any size, square works best)
  assets/map-calibration.json  <- optional {"rect":[x,y,w,h]} normalised rect
                                  of the image that covers the world bounds

Outputs
  game/public/ui/worldmap.jpg   texture used by the in-game map + minimap
  game/public/ui/worldmap.json  calibration consumed by the client
  artifacts/world-map-labeled.png  the same artwork with POI markers burned in
"""

import json
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
MAP = os.path.join(ROOT, "map")
PUB = os.path.join(ROOT, "game", "public", "ui")
OUT = os.path.join(ROOT, "artifacts")

SRC_CANDIDATES = ["map-source.png", "map-source.jpg", "map-source.jpeg", "map-source.webp"]


def load_source():
    for name in SRC_CANDIDATES:
        p = os.path.join(ASSETS, name)
        if os.path.exists(p):
            return Image.open(p).convert("RGB"), name
    raise SystemExit(
        "no artwork found: put your map image at bermuda/assets/map-source.png "
        "(or .jpg/.webp) and run this again"
    )


def main():
    src, name = load_source()
    rect = [0.0, 0.0, 1.0, 1.0]
    calib = os.path.join(ASSETS, "map-calibration.json")
    if os.path.exists(calib):
        with open(calib, encoding="utf-8") as fh:
            rect = json.load(fh).get("rect", rect)

    w, h = src.size
    # keep the map square and reasonably priced: 2048 is plenty for a 900px screen
    side = min(max(w, h), 2048)
    img = src.copy()
    if w != h:
        s = min(w, h)
        img = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    img = img.resize((side, side), Image.LANCZOS)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=48, threshold=2))

    os.makedirs(PUB, exist_ok=True)
    tex = os.path.join(PUB, "worldmap.jpg")
    img.save(tex, quality=90, optimize=True, progressive=True)
    with open(os.path.join(PUB, "worldmap.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": name, "rect": rect}, fh, indent=2)

    # labelled proof sheet
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    lab = img.copy()
    dr = ImageDraw.Draw(lab, "RGBA")
    fp = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    f = ImageFont.truetype(fp, int(side * 0.012)) if os.path.exists(fp) else ImageFont.load_default()

    rw, rh = rect[2] * side, rect[3] * side
    world_px = 384 * 32

    def to_img(x, y):
        return (rect[0] * side + x / world_px * rw, rect[1] * side + y / world_px * rh)

    for road in world["roads"]:
        pts = [to_img(x, y) for (x, y) in road["points"]]
        if len(pts) > 1:
            dr.line(pts, fill=(240, 214, 160, 90), width=max(1, int(side * 0.0016)))

    colours = {"harbor": (120, 200, 240), "town": (240, 176, 96), "camp": (236, 96, 72),
               "tower": (150, 120, 232), "alien": (176, 92, 232), "airstrip": (210, 214, 220),
               "ruins": (200, 180, 140), "village": (240, 200, 96), "dock": (120, 200, 240),
               "lighthouse": (240, 240, 200)}
    for p in world["pois"]:
        x, y = to_img(p["x"], p["y"])
        r = max(4, int(side * 0.0042))
        col = colours.get(p["type"], (236, 96, 72))
        dr.ellipse([x - r - 2, y - r - 2, x + r + 2, y + r + 2], fill=(10, 12, 16, 170))
        dr.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,), outline=(255, 255, 255, 230))
        bb = dr.textbbox((0, 0), p["name"], font=f)
        tw = bb[2] - bb[0]
        tx = x + r + 6
        if tx + tw > side:
            tx = x - r - 6 - tw
        dr.text((tx, y - bb[3] / 2 - 1), p["name"], font=f, fill=(250, 246, 236, 255))

    os.makedirs(OUT, exist_ok=True)
    proof = os.path.join(OUT, "world-map-labeled.png")
    lab.save(proof)
    print("texture :", tex, img.size)
    print("proof   :", proof)


if __name__ == "__main__":
    main()
