#!/usr/bin/env python3
"""
Illustrated (flat vector) map pass for the harbour slice.

Design rules: flat fills, limited palette, one soft shadow, crisp silhouettes,
no photo noise or blurry gradients. Everything is drawn at 2x for crisp edges.
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")
OUT = os.path.join(ROOT, "artifacts")

TILE = 32
SEA = 0.30

I0, J0, I1, J1 = 96, 168, 152, 222     # harbour town + bay
S = 26                                  # pixels per tile

INK = (44, 40, 34, 210)

C = {
    "deep":  (24, 62, 78),
    "mid":   (33, 96, 110),
    "shal":  (66, 152, 152),
    "reef":  (128, 196, 180),
    "foam":  (232, 242, 232),
    "sand":  (232, 214, 170),
    "wet":   (208, 188, 146),
    "grass": (150, 168, 100),
    "jung":  (86, 122, 66),
    "djung": (64, 100, 58),
    "dark":  (46, 78, 48),
    "dirt":  (176, 146, 106),
    "rock":  (146, 136, 120),
    "cliff": (118, 108, 96),
    "road":  (188, 178, 160),
    "asph":  (150, 144, 136),
    "conc":  (196, 190, 178),
    "yard":  (198, 180, 146),
    "wood":  (146, 112, 76),
}


def main():
    d = np.load(os.path.join(MAP, "_fields.npz"))
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    with open(os.path.join(MAP, "buildings.json"), encoding="utf-8") as fh:
        buildings = json.load(fh)

    W, H = (I1 - I0) * S, (J1 - J0) * S
    h = np.asarray(Image.fromarray(d["h"][J0:J1, I0:I1].astype(np.float32), "F").resize((W, H), Image.BILINEAR))
    land = np.asarray(Image.fromarray(d["land"][J0:J1, I0:I1].astype(np.float32), "F").resize((W, H), Image.BILINEAR)) > 0.5
    tiles = np.asarray(Image.fromarray(d["tiles"][J0:J1, I0:I1].astype(np.uint8), "L").resize((W, H), Image.NEAREST))

    img = Image.new("RGB", (W, H), C["deep"])
    dr = ImageDraw.Draw(img)

    # ---- flat water bands ---------------------------------------------------
    depth = np.clip(SEA - h, 0, 1)
    arr = np.empty((H, W, 3), np.uint8)
    arr[:] = C["deep"]
    arr[depth < 0.16] = C["mid"]
    arr[depth < 0.055] = C["shal"]
    arr[depth < 0.012] = C["reef"]
    img = Image.fromarray(arr, "RGB")
    dr = ImageDraw.Draw(img)

    # foam outline hugging the coast
    coast = land & (h < SEA + 0.006)
    foam = ndimage.binary_dilation(coast, iterations=1) & ~land
    fa = np.asarray(img).copy()
    fa[foam] = C["foam"]
    img = Image.fromarray(fa, "RGB")
    dr = ImageDraw.Draw(img)

    # ---- flat land bands ----------------------------------------------------
    la = np.asarray(img).copy()
    jungle = np.isin(tiles, [7, 8, 9])
    grass = tiles == 6
    sand = np.isin(tiles, [4, 5])
    rock = np.isin(tiles, [11, 12, 13])
    dirt = tiles == 10
    la[land & grass] = C["grass"]
    la[land & jungle] = C["jung"]
    la[land & (tiles == 8)] = C["djung"]
    la[land & (tiles == 9)] = C["dark"]
    la[land & dirt] = C["dirt"]
    la[land & rock] = C["rock"]
    la[land & sand] = C["sand"]
    la[land & (tiles == 5)] = C["wet"]
    la[land & (tiles == 18)] = C["conc"]
    img = Image.fromarray(la, "RGB")
    dr = ImageDraw.Draw(img)

    # ---- coastline ink ------------------------------------------------------
    edge = land & ~ndimage.binary_erosion(land, iterations=1)
    ea = np.asarray(img).copy()
    ea[edge] = (32, 40, 40)
    img = Image.fromarray(ea, "RGB")
    dr = ImageDraw.Draw(img)

    out = img.convert("RGBA")
    dr = ImageDraw.Draw(out, "RGBA")
    ox, oy = I0 * TILE, J0 * TILE

    def tp(x, y):
        return ((x - ox) / TILE * S, (y - oy) / TILE * S)

    # ---------------------------------------------------------------- roads
    for road in world["roads"]:
        pts = [tp(x, y) for (x, y) in road["points"]]
        if len(pts) < 2:
            continue
        if max(p[0] for p in pts) < -50 or min(p[0] for p in pts) > W + 50:
            continue
        main = road["kind"] == "main"
        w = (2.2 if main else 1.3) * S
        dr.line(pts, fill=(96, 88, 74, 255), width=int(w + 3), joint="curve")
        dr.line(pts, fill=C["road"], width=int(w), joint="curve")
        if main:
            dr.line(pts, fill=(206, 196, 176, 255), width=max(1, int(w * 0.22)), joint="curve")

    # ------------------------------------------------------------ buildings
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    blocks = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blocks)

    def rect(b, grow=1.0):
        rad = math.radians(b.get("rot", 0))
        cos, sin = math.cos(rad), math.sin(rad)
        pts = []
        for (sx, sy) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            wx = b["x"] + (sx * b.get("w", 64) * grow * cos - sy * b.get("h", 64) * grow * sin)
            wy = b["y"] + (sx * b.get("w", 64) * grow * sin + sy * b.get("h", 64) * grow * cos)
            pts.append(tp(wx, wy))
        return pts

    ROOF = {
        "hut": (176, 120, 78), "house": (196, 132, 88), "shop": (168, 108, 84),
        "warehouse": (124, 132, 138), "tower": (110, 118, 126),
        "temple": (182, 172, 146), "alien_pod": (104, 70, 118),
    }

    inside = []
    for b in buildings:
        if not (ox - 400 < b["x"] < (I1 * TILE) + 400 and oy - 400 < b["y"] < (J1 * TILE) + 400):
            continue
        inside.append(b)
        pts = rect(b)
        off = S * 0.5
        sd.polygon([(x + off, y + off) for (x, y) in pts], fill=(30, 26, 20, 90))
        # yard / foundation
        bd.polygon(rect(b, 1.22), fill=C["yard"] + (255,))
        bd.polygon(pts, fill=ROOF.get(b["style"], (190, 128, 86)) + (255,))
        # ridge
        a = ((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2)
        c = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)
        bd.line([a, c], fill=(255, 244, 222, 120), width=max(2, int(S * 0.10)))
        bd.line(pts + [pts[0]], fill=INK, width=max(2, int(S * 0.09)))

    shade = shade.filter(ImageFilter.GaussianBlur(3.0))
    out.alpha_composite(shade)
    out.alpha_composite(blocks)

    # ---------------------------------------------------------------- trees
    rng = np.random.default_rng(11)
    trees = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(trees)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shd = ImageDraw.Draw(shadow)

    dens = ndimage.gaussian_filter(
        np.isin(tiles, [6, 7, 8, 9]).astype(np.float32), S * 0.25)

    def tree(x, y, r, kind):
        shd.ellipse([x - r * 0.9 + r * 0.35, y - r * 0.4 + r * 0.55,
                     x + r * 1.0 + r * 0.35, y + r * 0.75 + r * 0.55],
                    fill=(20, 26, 18, 80))
        if kind == 0:      # round broadleaf
            td.ellipse([x - r, y - r, x + r, y + r], fill=(62, 96, 54, 255))
            td.ellipse([x - r * 0.72, y - r * 0.78, x + r * 0.42, y + r * 0.06],
                       fill=(86, 124, 64, 255))
            td.arc([x - r, y - r, x + r, y + r], 200, 350, fill=(46, 74, 42, 255), width=2)
        elif kind == 1:    # conifer-ish
            td.polygon([(x, y - r * 1.1), (x + r * 0.8, y + r * 0.5), (x - r * 0.8, y + r * 0.5)],
                       fill=(58, 92, 58, 255))
            td.polygon([(x, y - r * 0.5), (x + r * 0.55, y + r * 0.65), (x - r * 0.55, y + r * 0.65)],
                       fill=(74, 108, 64, 255))
        elif kind == 2:    # palm
            for a in range(6):
                th = a / 6 * math.tau + 0.3
                td.line([(x, y), (x + math.cos(th) * r * 1.05, y + math.sin(th) * r * 0.9)],
                        fill=(70, 112, 66, 255), width=max(2, int(r * 0.30)))
            td.ellipse([x - r * 0.16, y - r * 0.16, x + r * 0.16, y + r * 0.16],
                       fill=(140, 120, 74, 255))
        else:              # bush cluster
            td.ellipse([x - r * 0.8, y - r * 0.5, x + r * 0.5, y + r * 0.6], fill=(72, 108, 58, 255))
            td.ellipse([x - r * 0.1, y - r * 0.7, x + r * 0.9, y + r * 0.35], fill=(88, 124, 62, 255))

    step = max(7, int(S * 0.55))
    for py in range(0, H, step):
        for px in range(0, W, step):
            if dens[py, px] < 0.30 or rng.random() > dens[py, px] * 0.62:
                continue
            r = S * (0.42 + rng.random() * 0.42) * (0.85 + dens[py, px] * 0.35)
            tree(px + (rng.random() - 0.5) * step,
                 py + (rng.random() - 0.5) * step,
                 r, int(rng.random() * 4))

    # palms along the beach line
    beach_band = land & (h < SEA + 0.03)
    ys, xs = np.where(beach_band[::6, ::6])
    for k in range(0, len(xs), 7):
        x = xs[k] * 6 + rng.integers(-4, 4)
        y = ys[k] * 6 + rng.integers(-4, 4)
        if 0 < x < W and 0 < y < H:
            tree(x, y, S * (0.5 + rng.random() * 0.25), 2)

    shadow = shadow.filter(ImageFilter.GaussianBlur(2.2))
    out.alpha_composite(shadow)
    out.alpha_composite(trees)

    # ------------------------------------------------------- docks / boats
    dr = ImageDraw.Draw(out, "RGBA")
    for poi in world["pois"]:
        if poi["type"] not in ("harbor", "dock"):
            continue
        px, py = tp(poi["x"], poi["y"])
        if not (-200 < px < W + 200 and -200 < py < H + 200):
            continue
        for k in range(3):
            ang = -0.6 + k * 0.55
            L = S * 5.5
            ex, ey = px + math.cos(ang) * L, py + math.sin(ang) * L
            dr.line([(px, py), (ex, ey)], fill=(92, 68, 44, 255), width=int(S * 0.85))
            dr.line([(px, py), (ex, ey)], fill=C["wood"], width=int(S * 0.62))
            for t in range(1, 8):
                bx = px + (ex - px) * t / 8
                by = py + (ey - py) * t / 8
                dr.line([(bx - S * 0.28, by), (bx + S * 0.28, by)], fill=(110, 82, 52, 200), width=2)
            if k == 0:
                bx, by = px + (ex - px) * 0.78, py + (ey - py) * 0.78
                dr.ellipse([bx - S * 1.0, by - S * 0.42, bx + S * 1.0, by + S * 0.42],
                           fill=(242, 238, 228, 255), outline=(58, 50, 40, 255), width=3)
                dr.ellipse([bx - S * 0.45, by - S * 0.2, bx + S * 0.45, by + S * 0.2],
                           fill=(96, 132, 150, 255))

    # market awnings + crates near the town
    town = [p for p in world["pois"] if p["type"] in ("harbor", "town") and
            ox < p["x"] < I1 * TILE and oy < p["y"] < J1 * TILE]
    for poi in town:
        cx, cy = tp(poi["x"], poi["y"])
        for _ in range(30):
            ang = rng.random() * math.tau
            rad = rng.random() * S * 7
            x, y = cx + math.cos(ang) * rad, cy + math.sin(ang) * rad
            k = rng.random()
            if k < 0.35:
                s = S * 0.3
                dr.rectangle([x - s, y - s, x + s, y + s], fill=(146, 112, 70, 255),
                             outline=(72, 54, 36, 255), width=2)
            elif k < 0.5:
                dr.ellipse([x - S * 0.24, y - S * 0.24, x + S * 0.24, y + S * 0.24],
                           fill=(104, 96, 84, 255), outline=(52, 46, 38, 255), width=2)
            elif k < 0.62:
                # striped awning
                w2 = S * 0.7
                dr.rectangle([x - w2, y - w2 * 0.6, x + w2, y + w2 * 0.6],
                             fill=(206, 96, 78, 255))
                for i in range(4):
                    xx = x - w2 + i * (w2 * 0.5)
                    dr.rectangle([xx, y - w2 * 0.6, xx + w2 * 0.22, y + w2 * 0.6],
                                 fill=(240, 226, 196, 255))
                dr.rectangle([x - w2, y - w2 * 0.6, x + w2, y + w2 * 0.6],
                             outline=(96, 56, 44, 255), width=2)

    # ------------------------------------------------------------- labels
    from PIL import ImageFont
    fpath = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    f = ImageFont.truetype(fpath, int(S * 0.95)) if os.path.exists(fpath) else ImageFont.load_default()
    fs = ImageFont.truetype(fpath, int(S * 0.68)) if os.path.exists(fpath) else ImageFont.load_default()

    dr = ImageDraw.Draw(out, "RGBA")
    for p in world["pois"]:
        px, py = tp(p["x"], p["y"])
        if not (0 < px < W and 0 < py < H):
            continue
        if p["type"] in ("harbor", "town", "village", "dock", "airstrip", "lighthouse", "ruins"):
            txt = p["name"].upper()
            bbox = dr.textbbox((0, 0), txt, font=f)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            dr.rectangle([px - tw / 2 - 6, py - th - 12, px + tw / 2 + 6, py + 4],
                         fill=(24, 28, 26, 190))
            dr.text((px - tw / 2, py - th - 8), txt, font=f, fill=(246, 240, 226, 255))

    # region label
    for r in world["regions"]:
        rx, ry = tp(r["cx"], r["cy"])
        if 0 < rx < W and 0 < ry < H:
            txt = " ".join(r["name"].upper()[:14])
            bbox = dr.textbbox((0, 0), txt, font=fs)
            dr.text((rx - (bbox[2] - bbox[0]) / 2, ry), txt, font=fs, fill=(250, 244, 230, 120))

    out = out.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=1))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "harbor-flat.png")
    out.save(path)
    print(path, out.size, "buildings:", len(inside))


if __name__ == "__main__":
    main()
