#!/usr/bin/env python3
"""Render the generated island: poster map, zoomed detail crops and a zoom sheet."""

import csv
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")
OUT = os.path.join(ROOT, "artifacts")

N = 384
TILE = 32
SEA = 0.30

TILE_COLORS = {
    "deep_water": (12, 32, 58), "water": (19, 72, 102), "shallow": (48, 142, 154),
    "reef": (104, 184, 172), "sand": (226, 208, 158), "wet_sand": (200, 182, 136),
    "grass": (134, 158, 90), "jungle": (66, 108, 56), "dense_jungle": (44, 86, 46),
    "jungle_dark": (31, 63, 39), "dirt": (156, 128, 90), "rock": (126, 118, 106),
    "cliff": (98, 90, 82), "mountain": (120, 114, 106), "river": (56, 134, 152),
    "marsh": (90, 108, 74), "road": (182, 154, 112), "trail": (160, 136, 98),
    "concrete": (158, 156, 150), "alien_ground": (88, 46, 106), "crater": (74, 60, 68),
    "ruins_floor": (146, 138, 124), "dock": (116, 92, 66), "bridge": (122, 100, 72),
    "volcanic": (62, 52, 50),
}
TYPES = list(TILE_COLORS.keys())
IDX = {name: i for i, name in enumerate(TYPES)}

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REG
    if os.path.exists(path):
        return ImageFont.truetype(path, max(6, int(size)))
    return ImageFont.load_default()


def resize(arr, w, h, mode=Image.BILINEAR):
    im = Image.fromarray(arr.astype(np.float32), mode="F")
    im = im.resize((w, h), mode)
    return np.asarray(im)


def load():
    d = dict(np.load(os.path.join(MAP, "_fields.npz")))
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    props = []
    with open(os.path.join(MAP, "props.csv"), encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            props.append((int(row["x"]), int(row["y"]), row["type"],
                          int(row["rot"]), int(row["scale"])))
    with open(os.path.join(MAP, "buildings.json"), encoding="utf-8") as fh:
        buildings = json.load(fh)
    return d, world, props, buildings


# ---------------------------------------------------------------------------
# terrain shading
# ---------------------------------------------------------------------------


def shade(h, moist, land, tiles, w, h_px):
    p = w / tiles.shape[1]
    H = resize(h, w, h_px, Image.BILINEAR)
    L = resize(land.astype(np.float32), w, h_px, Image.BILINEAR) > 0.5
    T = np.asarray(Image.fromarray(tiles.astype(np.uint8), "L").resize((w, h_px), Image.NEAREST))

    pal = np.zeros((len(TYPES), 3), np.float32)
    for i, name in enumerate(TYPES):
        pal[i] = TILE_COLORS[name]
    rgb = pal[T].copy()
    yy, xx = np.mgrid[0:h_px, 0:w]

    # ---- land light -----------------------------------------------------
    gy, gx = np.gradient(h)
    light = np.clip(0.88 + (-gx - gy) * 6.2, 0.55, 1.45)
    light = resize(light, w, h_px, Image.BILINEAR)
    r = np.random.default_rng(21)
    macro = resize(r.random(h.shape).astype(np.float32), w, h_px, Image.BICUBIC)
    micro = resize(r.random((h.shape[0] * 2, h.shape[1] * 2)).astype(np.float32), w, h_px, Image.BICUBIC)
    tex = 0.96 + 0.14 * (macro - 0.5) + 0.06 * (micro - 0.5)
    rgb = np.clip(rgb * light[..., None] * tex[..., None], 0, 255)

    # ---- biome accents --------------------------------------------------
    alien = T == IDX["alien_ground"]
    rgb[alien] = rgb[alien] * 0.30 + np.array([52, 26, 64], np.float32) * 0.70
    vein = alien & (np.abs(micro - 0.5) < 0.022) & (macro > 0.52)
    rgb[vein] = rgb[vein] * 0.55 + np.array([150, 88, 190], np.float32) * 0.45

    crater = T == IDX["crater"]
    rgb[crater] = rgb[crater] * 0.52 + np.array([42, 28, 42], np.float32) * 0.48
    rimcr = crater & (micro > 0.68)
    rgb[rimcr] = rgb[rimcr] * 0.7 + np.array([120, 96, 130], np.float32) * 0.3

    riv = T == IDX["river"]
    rgb[riv] = rgb[riv] * 0.72 + np.array([92, 176, 194], np.float32) * 0.35

    # road tiles are only the collision/gameplay footprint: let dirt shoulders show
    roadm = (T == IDX["road"]) | (T == IDX["trail"]) | (T == IDX["bridge"])
    rgb[roadm] = rgb[roadm] * 0.45 + np.array([146, 126, 94], np.float32) * 0.55

    rock = (T == IDX["rock"]) | (T == IDX["cliff"]) | (T == IDX["mountain"])
    if rock.any():
        stri = np.sin((xx * 0.55 + yy * 1.7) / max(1.5, p) + macro * 7.0)
        rgb[rock] = np.clip(rgb[rock] * (1.0 + 0.075 * stri[rock])[:, None], 0, 255)

    rim = np.exp(-((H - (SEA + 0.004)) / 0.009) ** 2) * L
    rgb = rgb * (1 - 0.30 * rim[..., None]) + np.array([242, 228, 182], np.float32) * (0.30 * rim[..., None])

    # ---- ocean ----------------------------------------------------------
    depth = np.clip(SEA - H, 0.0, 1.0)
    stops = [0.0, 0.010, 0.045, 0.125, 0.30]
    cols = [(104, 202, 188), (56, 164, 172), (27, 108, 140), (13, 58, 98), (6, 18, 44)]
    oc = np.stack([np.interp(depth, stops, [c[i] for c in cols]) for i in range(3)], -1)
    swell = np.sin((xx * 0.85 + yy * 0.5) / max(3.0, 9.0) + depth * 26.0)
    oc *= (1.0 + 0.030 * swell)[..., None]
    surf = np.exp(-((depth - 0.007) / 0.007) ** 2)
    oc = oc * (1 - 0.82 * surf[..., None]) + np.array([224, 242, 232], np.float32) * (0.82 * surf[..., None])

    rgb = np.where(L[..., None], rgb, oc)

    # ---- coastline outline ---------------------------------------------
    edge = L & ~ndimage.binary_erosion(L, iterations=1)
    rgb[edge] = np.array([26, 32, 32], np.float32)

    return np.clip(rgb, 0, 255)


# ---------------------------------------------------------------------------
# props / buildings / roads
# ---------------------------------------------------------------------------

PROP_LOOK = {
    "tree":      (2.6, (26, 50, 28), (46, 82, 42)),
    "palm":      (2.1, (38, 66, 36), (86, 120, 58)),
    "bush":      (1.3, (36, 68, 38), (58, 96, 48)),
    "grass":     (0.8, (112, 132, 76), (156, 176, 100)),
    "reed":      (1.0, (84, 104, 60), (122, 142, 82)),
    "rock":      (1.4, (82, 76, 68), (124, 116, 106)),
    "crystal":   (1.5, (104, 44, 138), (176, 104, 224)),
    "debris":    (1.2, (58, 48, 56), (96, 82, 92)),
    "column":    (1.0, (110, 104, 94), (158, 150, 136)),
}


def tint(col, f):
    return (int(min(255, col[0] * f)), int(min(255, col[1] * f)), int(min(255, col[2] * f)))
ROOF = {
    "hut": (126, 92, 62), "house": (152, 108, 72), "shop": (122, 92, 80),
    "warehouse": (112, 112, 112), "tower": (94, 96, 102), "temple": (148, 140, 122),
    "alien_pod": (84, 52, 102),
}
LANDMARK_COL = {
    "tower": (98, 98, 104), "radar": (116, 126, 136), "lighthouse": (236, 232, 216),
    "spire": (176, 96, 214), "wreck": (86, 72, 90), "shipwreck": (86, 76, 70),
    "mine_head": (84, 76, 68), "falls": (198, 226, 232),
}


def in_view(tx, ty, ox, oy, w, h_px, p, pad=4.0):
    return (-pad < tx - ox < w / p + pad) and (-pad < ty - oy < h_px / p + pad)


def draw_roads(img, world, ox, oy, p):
    dr = ImageDraw.Draw(img, "RGBA")
    for road in world["roads"]:
        pts = [((x / TILE - ox) * p, (y / TILE - oy) * p) for (x, y) in road["points"]]
        if len(pts) < 2:
            continue
        main = road["kind"] == "main"
        w = max(1.6, (2.6 if main else 1.7) * p)
        dr.line(pts, fill=(64, 48, 34, 210), width=int(w + max(2, p * 0.55)), joint="curve")
        dr.line(pts, fill=(198, 172, 126, 255), width=int(w), joint="curve")
        if main and p >= 8:
            dr.line(pts, fill=(224, 204, 164, 150), width=max(1, int(w * 0.18)), joint="curve")


def draw_buildings(img, buildings, ox, oy, p):
    dr = ImageDraw.Draw(img, "RGBA")
    for b in buildings:
        cx, cy = b["x"] / TILE, b["y"] / TILE
        if not in_view(cx, cy, ox, oy, img.width, img.height, p, pad=6):
            continue
        w, hh = b["w"] / TILE, b["h"] / TILE
        rot = math.radians(b["rot"])
        pts = []
        for (sx, sy) in ((-w / 2, -hh / 2), (w / 2, -hh / 2), (w / 2, hh / 2), (-w / 2, hh / 2)):
            rx = sx * math.cos(rot) - sy * math.sin(rot)
            ry = sx * math.sin(rot) + sy * math.cos(rot)
            pts.append(((cx + rx - ox) * p, (cy + ry - oy) * p))
        off = max(1.0, p * 0.16)
        dr.polygon([(x + off, y + off * 1.3) for (x, y) in pts], fill=(26, 22, 18, 120))
        base = ROOF.get(b["style"], (140, 110, 80))
        dr.polygon(pts, fill=base + (255,))
        dr.line(pts + [pts[0]], fill=(52, 40, 30, 255), width=max(1, int(p * 0.08)))
        if p >= 6:
            # roof ridge + shading
            mid_a = ((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2)
            mid_b = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)
            dr.line([mid_a, mid_b], fill=(min(255, base[0] + 26), min(255, base[1] + 22),
                                          min(255, base[2] + 18), 220), width=max(1, int(p * 0.12)))
            dr.polygon([pts[1], pts[2], (pts[2][0] + off, pts[2][1] + off)],
                       fill=(0, 0, 0, 40))


def draw_props(img, props, ox, oy, p):
    dr = ImageDraw.Draw(img, "RGBA")
    for (x, y, ttype, rot, scale) in props:
        tx, ty = x / TILE, y / TILE
        if not in_view(tx, ty, ox, oy, img.width, img.height, p, pad=3):
            continue
        px, py = (tx - ox) * p, (ty - oy) * p
        if ttype in PROP_LOOK:
            d, dark, light = PROP_LOOK[ttype]
            rad = d * 0.5 * p * (scale / 100.0)
            if rad < 0.55:
                continue
            # per-prop tint so the canopy is not a flat carpet
            hsh = ((x * 73856093) ^ (y * 19349663)) & 0xFFFF
            f = 0.82 + 0.36 * (hsh / 65535.0)
            dark, light = tint(dark, f), tint(light, f)
            if rad > 2.2:
                dr.ellipse([px - rad * 0.95 + rad * 0.35, py - rad * 0.45 + rad * 0.5,
                            px + rad * 1.05 + rad * 0.35, py + rad * 0.75 + rad * 0.5],
                           fill=(0, 0, 0, 70))
            dr.ellipse([px - rad, py - rad, px + rad, py + rad], fill=dark + (255,))
            dr.ellipse([px - rad * 0.52, py - rad * 0.72, px + rad * 0.34, py + rad * 0.12],
                       fill=light + (255,))
            if ttype == "crystal" and rad > 1.6:
                dr.ellipse([px - rad * 0.25, py - rad * 0.55, px + rad * 0.1, py - rad * 0.1],
                           fill=(238, 200, 255, 230))
        else:
            rad = max(1.8, p * 0.5)
            col = LANDMARK_COL.get(ttype, (140, 130, 120))
            dr.ellipse([px - rad + rad * 0.4, py - rad + rad * 0.5, px + rad + rad * 0.4, py + rad + rad * 0.5],
                       fill=(0, 0, 0, 90))
            dr.ellipse([px - rad, py - rad, px + rad, py + rad], fill=col + (255,))
            dr.ellipse([px - rad, py - rad, px + rad, py + rad], outline=(30, 24, 20, 255),
                       width=max(1, int(p * 0.06)))


CATEGORY = {
    "harbor": "settle", "town": "settle", "village": "settle", "dock": "settle",
    "airstrip": "mil", "outpost": "mil", "fuel_depot": "mil", "radar": "mil",
    "radio_tower": "mil", "mine": "mil",
    "alien_spire": "alien", "alien_camp": "alien", "alien_crash": "alien",
    "cache": "cache", "ruins": "ruin", "shipwreck": "ruin",
    "cave": "nature", "waterfall": "nature", "lighthouse": "nature", "lookout": "nature",
    "beach_landing": "player", "bridge": "road",
}
POI_COLORS = {
    "settle": (128, 192, 232), "mil": (232, 148, 96), "alien": (190, 110, 228),
    "cache": (238, 210, 112), "ruin": (208, 184, 136), "nature": (150, 214, 178),
    "player": (246, 240, 214), "road": (206, 196, 156),
}


def marker(dr, cat, px, py, r):
    col = POI_COLORS[cat]
    if cat == "settle":
        dr.ellipse([px - r - 2, py - r - 2, px + r + 2, py + r + 2], fill=(16, 18, 20, 215))
        dr.ellipse([px - r, py - r, px + r, py + r], fill=col + (255,))
        dr.ellipse([px - r * 0.35, py - r * 0.35, px + r * 0.35, py + r * 0.35], fill=(20, 22, 24, 235))
    elif cat == "mil":
        dr.rectangle([px - r - 2, py - r - 2, px + r + 2, py + r + 2], fill=(16, 18, 20, 215))
        dr.rectangle([px - r, py - r, px + r, py + r], fill=col + (255,))
        dr.rectangle([px - r * 0.35, py - r * 0.35, px + r * 0.35, py + r * 0.35], fill=(20, 22, 24, 235))
    elif cat == "alien":
        dr.polygon([(px, py - r - 3), (px + r + 3, py), (px, py + r + 3), (px - r - 3, py)],
                   fill=(16, 12, 20, 220))
        dr.polygon([(px, py - r), (px + r, py), (px, py + r), (px - r, py)], fill=col + (255,))
        dr.polygon([(px, py - r * 0.35), (px + r * 0.35, py), (px, py + r * 0.35), (px - r * 0.35, py)],
                   fill=(20, 14, 24, 240))
    elif cat == "cache":
        dr.rectangle([px - r, py - r, px + r, py + r], fill=(16, 16, 14, 200),
                     outline=col + (255,), width=max(1, int(r * 0.45)))
        dr.line([(px - r * 0.45, py), (px + r * 0.45, py)], fill=col + (255,), width=1)
    elif cat == "ruin":
        dr.ellipse([px - r - 2, py - r - 2, px + r + 2, py + r + 2], fill=(16, 18, 20, 200))
        dr.ellipse([px - r, py - r, px + r, py + r], outline=col + (255,), width=max(1, int(r * 0.4)))
    elif cat == "player":
        dr.polygon([(px, py - r - 3), (px + r + 2, py + r), (px - r - 2, py + r)], fill=(16, 16, 14, 220))
        dr.polygon([(px, py - r), (px + r, py + r * 0.7), (px - r, py + r * 0.7)], fill=col + (255,))
    else:
        dr.ellipse([px - r - 2, py - r - 2, px + r + 2, py + r + 2], fill=(16, 18, 20, 200))
        dr.ellipse([px - r, py - r, px + r, py + r], fill=col + (255,))
        dr.ellipse([px - r * 0.3, py - r * 0.3, px + r * 0.3, py + r * 0.3], fill=(18, 20, 18, 235))


def draw_pois(img, pois, ox, oy, p, label_scale=1.0, small=False):
    dr = ImageDraw.Draw(img, "RGBA")
    f = font(max(9, p * 1.05 * label_scale))
    for poi in pois:
        tx, ty = poi["x"] / TILE, poi["y"] / TILE
        px, py = (tx - ox) * p, (ty - oy) * p
        if not (-80 < px < img.width + 80 and -80 < py < img.height + 80):
            continue
        cat = CATEGORY.get(poi["type"], "nature")
        r = max(3.0, p * (0.30 if small else 0.38))
        marker(dr, cat, px, py, r)
        txt = poi["name"]
        bbox = dr.textbbox((0, 0), txt, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        lx, ly = px + r + 4, py - th * 0.5
        if lx + tw > img.width - 8:
            lx = px - r - 4 - tw
        dr.rectangle([lx - 3, ly - 3, lx + tw + 3, ly + th + 5], fill=(12, 14, 16, 185))
        dr.text((lx, ly), txt, font=f, fill=(238, 234, 224, 255))


def draw_region_labels(img, world, p):
    dr = ImageDraw.Draw(img, "RGBA")
    f = font(max(12, p * 1.22))
    for reg in world["regions"]:
        cx, cy = reg["cx"] / TILE * p, reg["cy"] / TILE * p
        txt = " ".join(reg["name"].upper())
        bbox = dr.textbbox((0, 0), txt, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        lx, ly = cx - tw / 2, cy
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2)):
            dr.text((lx + dx, ly + dy), txt, font=f, fill=(0, 0, 0, 160))
        dr.text((lx, ly), txt, font=f, fill=(246, 240, 226, 205))


# ---------------------------------------------------------------------------
# map furniture
# ---------------------------------------------------------------------------


def draw_furniture(img, world, p):
    dr = ImageDraw.Draw(img, "RGBA")
    W, H = img.size
    ink = (232, 222, 200, 255)
    dim = (168, 186, 180, 235)

    # frame
    m = max(3, W // 400)
    dr.rectangle([0, 0, W - 1, H - 1], outline=(214, 198, 168, 255), width=m)
    dr.rectangle([m * 2, m * 2, W - m * 2 - 1, H - m * 2 - 1], outline=(214, 198, 168, 70), width=1)

    # title
    tf = font(W // 34)
    sf = font(W // 82, bold=False)
    title = "BERMUDA  //  OCCUPIED ISLAND"
    sub = "open-world survival sector  ·  grid 384 x 384 tiles  ·  v1"
    tb = dr.textbbox((0, 0), title, font=tf)
    sb = dr.textbbox((0, 0), sub, font=sf)
    pad = W * 0.012
    box_w = max(tb[2] - tb[0], sb[2] - sb[0]) + pad * 2
    box_h = (tb[3] - tb[1]) + (sb[3] - sb[1]) + pad * 2.2
    x0, y0 = W * 0.028, H * 0.028
    dr.rectangle([x0, y0, x0 + box_w, y0 + box_h], fill=(12, 14, 18, 215),
                 outline=(200, 180, 140, 220), width=2)
    dr.text((x0 + pad, y0 + pad * 0.8), title, font=tf, fill=ink)
    dr.text((x0 + pad, y0 + pad * 0.8 + (tb[3] - tb[1]) + pad * 0.5), sub, font=sf, fill=dim)

    # compass
    cx, cy, r = W * 0.925, H * 0.085, W * 0.034
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(12, 14, 18, 200),
               outline=(200, 180, 140, 210), width=2)
    dr.polygon([(cx, cy - r * 0.8), (cx - r * 0.2, cy + r * 0.08), (cx, cy - r * 0.06)],
               fill=(224, 92, 72, 255))
    dr.polygon([(cx, cy - r * 0.8), (cx + r * 0.2, cy + r * 0.08), (cx, cy - r * 0.06)], fill=ink)
    dr.polygon([(cx, cy + r * 0.8), (cx - r * 0.2, cy - r * 0.08), (cx, cy + r * 0.06)],
               fill=(176, 172, 164, 255))
    dr.polygon([(cx, cy + r * 0.8), (cx + r * 0.2, cy - r * 0.08), (cx, cy + r * 0.06)],
               fill=(146, 142, 136, 255))
    dr.text((cx - W * 0.004, cy - r - W * 0.019), "N", font=font(W // 88), fill=ink)

    # scale bar (1 tile ~ 4 m)
    bar_tiles, mpt = 40, 4.0
    bar = bar_tiles * p
    x0, y0 = W * 0.034, H * 0.945
    dr.rectangle([x0 - 8, y0 - H * 0.032, x0 + bar + 10, y0 + H * 0.012], fill=(12, 14, 18, 200))
    dr.line([(x0, y0), (x0 + bar, y0)], fill=ink, width=3)
    for k in range(5):
        xx = x0 + bar * k / 4
        dr.line([(xx, y0 - 6), (xx, y0 + 5)], fill=ink, width=2)
    dr.text((x0, y0 - H * 0.022), f"{int(bar_tiles * mpt)} m", font=font(W // 96, False), fill=ink)

    # legend
    items = [("settle", "Town / village"), ("mil", "Military outpost"),
             ("alien", "Alien presence"), ("cache", "Supply cache"),
             ("ruin", "Ruin / wreck"), ("nature", "Landmark")]
    lf = font(W // 104, False)
    lx, ly = W * 0.034, H * 0.905
    for i, (cat, label) in enumerate(items):
        y = ly - i * H * 0.022
        marker(dr, cat, lx + 7, y, max(3.0, W * 0.0045))
        bbox = dr.textbbox((0, 0), label, font=lf)
        dr.rectangle([lx + 16, y - (bbox[3] - bbox[1]) * 0.6, lx + 20 + bbox[2], y + (bbox[3] - bbox[1]) * 0.7],
                     fill=(12, 14, 18, 150))
        dr.text((lx + 18, y - 6), label, font=lf, fill=(226, 220, 206, 255))


# ---------------------------------------------------------------------------
# public render entry points
# ---------------------------------------------------------------------------


def render_poster(size=2048):
    d, world, props, buildings = load()
    p = size / N
    rgb = shade(d["h"], d["moist"], d["land"], d["tiles"], size, size)
    img = Image.fromarray(rgb.astype(np.uint8), "RGB")
    draw_roads(img, world, 0, 0, p)
    draw_props(img, props, 0, 0, p)
    draw_buildings(img, buildings, 0, 0, p)
    draw_region_labels(img, world, p)
    draw_pois(img, world["pois"], 0, 0, p)
    draw_furniture(img, world, p)
    return img


def render_crop(i0, j0, i1, j1, p=16):
    d, world, props, buildings = load()
    sub = {k: d[k][j0:j1, i0:i1] for k in ("h", "moist", "land", "tiles")}
    w = int((i1 - i0) * p)
    h = int((j1 - j0) * p)
    rgb = shade(sub["h"], sub["moist"], sub["land"], sub["tiles"], w, h)
    img = Image.fromarray(rgb.astype(np.uint8), "RGB")
    draw_roads(img, world, i0, j0, p)
    draw_props(img, props, i0, j0, p)
    draw_buildings(img, buildings, i0, j0, p)
    draw_pois(img, world["pois"], i0, j0, p, label_scale=0.85, small=True)
    return img


CROPS = {
    "harbor":   (92, 168, 152, 228),
    "jungle":   (128, 108, 188, 168),
    "alien":    (204, 96, 264, 156),
    "airstrip": (146, 66, 226, 146),
    "spire":    (216, 104, 264, 152),
    "south":    (108, 250, 168, 310),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    print("poster")
    img = render_poster(2048)
    path = os.path.join(OUT, "bermuda-island-map.png")
    img.save(path, optimize=True)
    print("  ", path, img.size)

    for name, crop in CROPS.items():
        c = render_crop(*crop, p=16)
        pth = os.path.join(OUT, f"bermuda-detail-{name}.png")
        c.save(pth)
        print("  ", pth, c.size)


if __name__ == "__main__":
    main()
