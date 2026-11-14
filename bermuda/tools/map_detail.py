#!/usr/bin/env python3
"""
Detailed cartographic render of the Bermuda island.

Layers, bottom to top:
  terrain shading (sun + AO + cast shadow) -> water depth/reef/surf -> rivers,
  marsh, farmland parcels -> contour lines -> cloud deck -> roads and bridges ->
  settlements and structures -> alien corruption glow -> cartographic furniture
  (grid, icons, labels, legend, compass, scale bar, title block).
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")
OUT = os.path.join(ROOT, "artifacts")

TILE = 32
N = 384
SEA = 0.30
R = 3200
WORLD = N * TILE


def U(a, size=None, mode=Image.BICUBIC):
    size = size or R
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((size, size), mode))


def noise(size, res, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((max(2, int(res)), max(2, int(res)))).astype(np.float32)
    img = Image.fromarray((g * 255).astype(np.uint8), "L").resize((size, size), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0


def fbm(size, base, octaves, seed, gain=0.52, lac=2.07):
    out = np.zeros((size, size), np.float32)
    amp, res, norm = 1.0, base, 0.0
    for o in range(octaves):
        out += amp * noise(size, res, seed + 97 * o)
        norm += amp
        amp *= gain
        res *= lac
    return out / norm


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def shade(nx, ny, nz, az=318.0, alt=34.0):
    a, e = math.radians(az), math.radians(alt)
    lx, ly, lz = math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)
    return np.clip(nx * lx + ny * ly + nz * lz, 0, 1)


def cast_shadow(z, az=318.0, alt=34.0, steps=30, step_px=3.0):
    a = math.radians(az)
    dx, dy = math.cos(a), math.sin(a)
    t = math.tan(math.radians(alt))
    h, w = z.shape
    out = np.zeros_like(z)
    for k in range(1, steps + 1):
        sx, sy = int(round(dx * k * step_px)), int(round(dy * k * step_px))
        if abs(sx) >= w or abs(sy) >= h:
            break
        sh = np.roll(np.roll(z, sy, axis=0), sx, axis=1)
        out = np.maximum(out, (sh > z + k * step_px * 0.0022 * (1 / max(t, .2))).astype(np.float32)
                         * (1.0 - k / (steps + 6)))
    return ndimage.gaussian_filter(out, 1.2)


# ------------------------------------------------------------------ markers
def marker(dr, x, y, r, kind):
    col = {
        "harbor": (110, 196, 238), "dock": (110, 196, 238), "town": (242, 178, 96),
        "village": (240, 202, 120), "outpost": (230, 96, 74), "fuel_depot": (230, 96, 74),
        "radio_tower": (158, 126, 236), "radar": (158, 126, 236), "lookout": (150, 210, 220),
        "alien_camp": (186, 96, 236), "alien_spire": (186, 96, 236), "alien_crash": (186, 96, 236),
        "cache": (170, 214, 120), "cave": (150, 140, 126), "mine": (172, 150, 116),
        "waterfall": (120, 210, 220), "ruins": (206, 186, 144), "shipwreck": (198, 176, 150),
        "airstrip": (214, 218, 224), "bridge": (204, 176, 128), "beach_landing": (240, 226, 150),
    }.get(kind, (236, 96, 72))

    dr.ellipse([x - r - 3, y - r - 3, x + r + 3, y + r + 3], fill=(10, 12, 16, 165))
    dr.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,))
    dr.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 255, 235), width=max(1, r // 4))

    g = max(2, int(r * 0.55))
    ink = (16, 18, 20, 235)
    if kind in ("harbor", "dock"):
        dr.line([(x, y - g), (x, y + g * 0.8)], fill=ink, width=max(2, r // 3))
        dr.line([(x - g * 0.7, y - g * 0.3), (x + g * 0.7, y - g * 0.3)], fill=ink, width=max(2, r // 4))
        dr.arc([x - g, y + g * 0.1, x + g, y + g], 200, 340, fill=ink, width=max(2, r // 4))
    elif kind in ("town", "village", "cache"):
        dr.polygon([(x, y - g), (x + g, y + g), (x - g, y + g)], fill=ink)
        dr.rectangle([x - g * 0.45, y - g * 0.1, x + g * 0.45, y + g], fill=ink)
    elif kind in ("outpost", "fuel_depot"):
        dr.polygon([(x, y - g), (x + g, y - g * 0.4), (x + g * 0.6, y + g), (x - g * 0.6, y + g),
                    (x - g, y - g * 0.4)], fill=ink)
    elif kind in ("radio_tower", "radar"):
        dr.polygon([(x, y - g), (x + g * 0.7, y + g), (x - g * 0.7, y + g)], fill=ink)
        dr.line([(x, y - g * 0.2), (x, y + g * 0.5)], fill=(255, 255, 255, 200), width=2)
    elif kind and kind.startswith("alien"):
        dr.polygon([(x, y - g), (x + g, y), (x, y + g), (x - g, y)], fill=ink)
        dr.ellipse([x - g * 0.3, y - g * 0.3, x + g * 0.3, y + g * 0.3], fill=(240, 220, 255, 240))
    elif kind == "airstrip":
        dr.line([(x - g, y + g * 0.6), (x + g, y - g * 0.6)], fill=ink, width=max(2, r // 3))
        dr.line([(x - g * 0.3, y - g * 0.1), (x + g * 0.2, y - g * 0.8)], fill=ink, width=max(2, r // 4))
    elif kind == "waterfall":
        for k in (-1, 0, 1):
            dr.arc([x + k * g * 0.6 - g * 0.4, y - g * 0.6, x + k * g * 0.6 + g * 0.4, y + g * 0.6],
                   120, 420, fill=ink, width=2)
    else:
        dr.ellipse([x - g * 0.6, y - g * 0.6, x + g * 0.6, y + g * 0.6], fill=ink)


def spaced(dr, xy, text, font, fill, spacing=0.0):
    x, y = xy
    for ch in text:
        dr.text((x, y), ch, font=font, fill=fill)
        x += dr.textlength(ch, font=font) + spacing
    return x


def main():
    d = np.load(os.path.join(MAP, "_fields.npz"))
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    with open(os.path.join(MAP, "buildings.json"), encoding="utf-8") as fh:
        buildings = json.load(fh)

    h = U(d["h"])
    moist = U(d["moist"])
    slope = U(d["slope"])
    land = U(d["land"]) > 0.5
    river = U(d["river"])
    marsh = U(d["marsh"])
    field = U(d["field"])
    airfield = U(d["airfield"])
    corrupted = U(d["corrupted"])

    # ------------------------------------------------------------- relief
    detail = fbm(R, 130, 5, 3) - 0.5
    canopy = ss(0.38, 0.62, fbm(R, 96, 5, 11, gain=0.55))
    canopy = ndimage.gaussian_filter(canopy, 1.2)
    crowns = ndimage.gaussian_filter(fbm(R, 260, 3, 67), 1.0)
    jungle = ss(0.50, 0.66, moist) * land
    relief = h + detail * 0.005 + canopy * 0.026 * jungle

    gy, gx = np.gradient(relief)
    k = 34.0
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(relief)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / l, ny / l, nz / l
    light = shade(nx, ny, nz)
    blur = ndimage.gaussian_filter(relief, 7)
    ao = ndimage.gaussian_filter(np.clip(0.60 + (relief - blur) * 110.0, 0, 1), 2)
    shadow = cast_shadow(h)

    depth = np.clip(SEA - h, 0, 1)

    # --------------------------------------------------------------- water
    stops = [0.0, 0.004, 0.016, 0.045, 0.11, 0.26, 0.6]
    cols = [(198, 244, 226), (110, 224, 206), (52, 190, 186), (30, 148, 166),
            (20, 104, 134), (12, 56, 84), (6, 28, 50)]
    water = np.stack([np.interp(depth, stops, [c[i] for c in cols]) for i in range(3)], -1).astype(np.float32)

    swell = fbm(R, 90, 4, 23)
    water *= (0.95 + 0.10 * swell)[..., None]
    caust = (fbm(R, 210, 3, 31) ** 3) * ss(0.09, 0.005, depth)
    water += caust[..., None] * np.array([52, 74, 52])

    reef = ss(0.024, 0.008, depth) * ss(0.002, 0.008, depth)
    reef *= ss(0.40, 0.72, fbm(R, 110, 4, 41))
    water = water * (1 - reef[..., None] * 0.6) + np.array([132, 200, 178]) * (reef[..., None] * 0.6)

    surf = ss(0.010, 0.0, depth) * (~land)
    water = water * (1 - surf[..., None]) + np.array([238, 248, 240]) * (surf[..., None])
    water *= (1 - ss(0.03, 0.0, depth)[..., None] * 0.20)

    # ---------------------------------------------------------------- land
    sand = ss(SEA + 0.032, SEA + 0.005, h)
    wet = ss(SEA + 0.013, SEA + 0.002, h)
    rock = ss(0.50, 0.60, h) * land
    steep = ss(0.06, 0.13, slope) * land

    grass_c = np.array([146, 166, 88])
    jungle_c = np.array([62, 108, 52])
    deep_c = np.array([36, 80, 40])
    sand_c = np.array([234, 218, 170])
    wet_c = np.array([198, 178, 136])
    rock_c = np.array([150, 138, 120])
    dark_c = np.array([88, 82, 74])

    t1 = ss(0.50, 0.68, moist)
    t2 = ss(0.66, 0.84, moist)
    land_img = grass_c * (1 - t1)[..., None] + jungle_c * t1[..., None]
    land_img = land_img * (1 - t2)[..., None] + deep_c * t2[..., None]

    # canopy: broad clumps, then individual crowns catching light
    clump = ss(0.45, 0.70, canopy) * jungle
    land_img = land_img * (1 - clump[..., None] * 0.30) + np.array([30, 62, 34]) * (clump[..., None] * 0.30)
    crown = ss(0.52, 0.78, crowns) * jungle
    land_img = land_img * (1 - crown[..., None] * 0.14) + np.array([52, 92, 46]) * (crown[..., None] * 0.14)
    crown_hi = ss(0.84, 0.95, crowns) * jungle
    land_img += crown_hi[..., None] * np.array([18, 30, 12])

    land_img = land_img * (1 - sand[..., None]) + sand_c * sand[..., None]
    land_img = land_img * (1 - wet[..., None]) + wet_c * wet[..., None]
    land_img = land_img * (1 - rock[..., None]) + rock_c * rock[..., None]
    land_img = land_img * (1 - steep[..., None] * 0.75) + dark_c * (steep[..., None] * 0.75)

    # volcanic basalt on the high ground: ridged rock, not a flat stain
    peak = ss(0.50, 0.62, h) * land
    ridged = 1.0 - np.abs(fbm(R, 210, 4, 91) * 2 - 1)
    ridged = ndimage.gaussian_filter(ridged * ridged, 1.0)
    basalt = (np.array([52, 50, 48]) * (1 - ridged[..., None]) +
              np.array([138, 124, 108]) * (ridged[..., None]))
    land_img = land_img * (1 - peak[..., None]) + basalt * peak[..., None]
    # keep the highest summits slightly cool/dark so they read as altitude
    land_img *= (1 - ss(0.66, 0.80, h)[..., None] * 0.18)

    # farmland parcels
    parcels = (np.sin(fbm(R, 60, 3, 131) * 42.0) > 0.86).astype(np.float32)
    parcels = ndimage.gaussian_filter(parcels, 0.8) * ss(0.55, 0.85, field) * land
    land_img = land_img * (1 - parcels[..., None] * 0.5) + np.array([196, 190, 118]) * (parcels[..., None] * 0.5)

    # marsh: darker, bluer, with reed speckle
    reeds = ss(0.55, 0.75, fbm(R, 260, 3, 137))
    marsh_m = ss(0.35, 0.7, marsh) * land
    land_img = land_img * (1 - marsh_m[..., None] * 0.7) + np.array([72, 104, 82]) * (marsh_m[..., None] * 0.7)
    land_img += (reeds * marsh_m)[..., None] * np.array([14, 20, 10])

    # alien corruption: ragged violet growth with a hot core and veins
    corr = ss(0.22, 0.60, corrupted) * land
    ragged = ss(0.30, 0.70, fbm(R, 300, 4, 151))
    corr = corr * (0.45 + 0.55 * ragged)
    veins = 1.0 - np.abs(fbm(R, 170, 4, 157) * 2 - 1)
    veins = ndimage.gaussian_filter(veins ** 3, 0.8)
    land_img = land_img * (1 - corr[..., None] * 0.78) + np.array([52, 38, 58]) * (corr[..., None] * 0.78)
    land_img += (veins * corr)[..., None] * np.array([44, 20, 58])
    core = ss(0.80, 0.96, corrupted) * land
    land_img += core[..., None] * np.array([40, 16, 52])
    # desaturate the growth so it reads as blight, not neon paint
    g = land_img.mean(axis=2, keepdims=True)
    land_img = land_img * (1 - corr[..., None] * 0.25) + (g * np.array([0.9, 0.75, 1.05])) * (corr[..., None] * 0.25)

    lit = land_img * (0.70 + 0.60 * light[..., None])
    lit *= (0.80 + 0.26 * ao[..., None])
    lit *= (1.0 - 0.32 * shadow[..., None])

    # rivers carved through the shading
    river_m = ss(0.22, 0.55, river) * land
    river_col = np.array([52, 132, 148])
    lit = lit * (1 - river_m[..., None]) + river_col * river_m[..., None]
    bank = ss(0.10, 0.28, river) * (1 - river_m)
    lit *= (1 - bank[..., None] * 0.25)

    img = np.where(land[..., None], lit, water)

    # contour lines: every 0.02 of elevation, very light
    band = np.abs(((h * 50.0) % 1.0) - 0.5)
    cl = (band > 0.455) & (band < 0.475) & land
    img[cl] *= 0.82

    # ------------------------------------------------------------- clouds
    cloud = ss(0.66, 0.86, fbm(R, 26, 6, 77, gain=0.56))
    cloud = ndimage.gaussian_filter(cloud, 1.4)
    sea_mask = np.clip(ndimage.gaussian_filter((~land).astype(np.float32), 45) * 1.5, 0, 1)
    cloud *= sea_mask
    img *= (1 - np.roll(np.roll(cloud, 10, axis=0), 16, axis=1)[..., None] * 0.22)
    img = img * (1 - cloud[..., None] * 0.5) + np.array([248, 250, 252]) * (cloud[..., None] * 0.5)

    # --------------------------------------------------------------- grade
    img[..., 0] *= 1.02
    yy, xx = np.mgrid[0:R, 0:R].astype(np.float32)
    vig = np.clip(1.08 - 0.18 * (((xx / R - 0.5) * 2) ** 2 + ((yy / R - 0.5) * 2) ** 2), 0.7, 1.1)
    img *= vig[..., None]

    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    out = out.filter(ImageFilter.UnsharpMask(radius=2.0, percent=52, threshold=2)).convert("RGBA")

    draw_structures(out, world, buildings)
    draw_furniture(out, world)
    os.makedirs(OUT, exist_ok=True)
    full = os.path.join(OUT, "world-map-detail.png")
    out.convert("RGB").save(full)
    small = os.path.join(OUT, "world-map-detail-2048.png")
    out.convert("RGB").resize((2048, 2048), Image.LANCZOS).save(small)
    print(full, out.size)
    print(small)


def k():
    return R / WORLD


def draw_structures(img, world, buildings):
    dr = ImageDraw.Draw(img, "RGBA")
    s = k()

    # roads, with bridges wherever they cross water
    for road in world["roads"]:
        pts = [(x * s, y * s) for (x, y) in road["points"]]
        if len(pts) < 2:
            continue
        main = road.get("kind") == "main"
        w = max(2, int((2.4 if main else 1.5) * s * TILE * 0.5))
        dr.line(pts, fill=(44, 36, 26, 170), width=w + 3, joint="curve")
        dr.line(pts, fill=(212, 196, 162, 200), width=w, joint="curve")
        if main:
            dr.line(pts, fill=(150, 132, 100, 160), width=max(1, w // 3), joint="curve")

    # settlements
    civ = [p for p in world["pois"] if p.get("type") in
           ("town", "harbor", "village", "dock", "airstrip", "ruins", "lighthouse")]
    for b in buildings:
        near = None
        for p in civ:
            if abs(p["x"] - b["x"]) < 1000 and abs(p["y"] - b["y"]) < 1000:
                near = p
                break
        if near is None:
            continue
        rad = math.radians(b.get("rot", 0))
        cs, sn = math.cos(rad), math.sin(rad)
        hw = b.get("w", 64) * s / 2
        hh = b.get("h", 64) * s / 2
        x, y = b["x"] * s, b["y"] * s
        pts = [(x + sx * cs - sy * sn, y + sx * sn + sy * cs)
               for (sx, sy) in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
        dr.polygon([(px + 1.6, py + 1.6) for (px, py) in pts], fill=(26, 22, 16, 160))
        col = (182, 124, 86) if b.get("style") in ("house", "shop", "hut") else (132, 138, 144)
        dr.polygon(pts, fill=col + (240,), outline=(48, 38, 30, 235), width=1)
        # ridge line on larger roofs so the settlement reads as 3D
        if hw + hh > 9:
            dr.line([pts[0], pts[2]], fill=(255, 244, 224, 70), width=1)

    # airstrip from the data mask
    for p in world["pois"]:
        if p.get("type") != "airstrip":
            continue
        x, y = p["x"] * s, p["y"] * s
        L, Wd = 700 * s, 80 * s
        dr.polygon([(x - L, y - Wd), (x + L, y - Wd), (x + L, y + Wd), (x - L, y + Wd)],
                   fill=(104, 106, 104, 235), outline=(40, 42, 40, 240), width=2)
        n = 16
        for i in range(n):
            if i % 2:
                continue
            cx = x - L + (i + 0.5) * (2 * L / n)
            seg = 2 * L / n * 0.55
            dr.rectangle([cx - seg / 2, y - 2.5, cx + seg / 2, y + 2.5], fill=(240, 240, 232, 225))

    # docks
    for p in world["pois"]:
        if p.get("type") not in ("harbor", "dock"):
            continue
        x, y = p["x"] * s, p["y"] * s
        for a in range(7):
            ang = a / 7 * math.tau
            ex, ey = x + math.cos(ang) * 70 * s, y + math.sin(ang) * 70 * s
            dr.line([(x, y), (ex, ey)], fill=(158, 122, 82, 225), width=max(2, int(7 * s)))
            bx, by = x + math.cos(ang) * 80 * s, y + math.sin(ang) * 80 * s
            dr.ellipse([bx - 6 * s, by - 3 * s, bx + 6 * s, by + 3 * s],
                       fill=(240, 236, 226, 235), outline=(58, 52, 42, 225), width=1)

    # alien corruption glow
    glow = Image.new("RGB", img.size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for p in world["pois"]:
        if not str(p.get("type", "")).startswith("alien"):
            continue
        x, y = p["x"] * s, p["y"] * s
        r = 90 * s
        for i in range(12):
            rr = r * (1 - i / 12)
            t = (i / 12) ** 2
            gd.ellipse([x - rr, y - rr, x + rr, y + rr],
                       fill=(int(96 * t), int(18 * t), int(156 * t)))
    glow = glow.filter(ImageFilter.GaussianBlur(26))
    img.alpha_composite(Image.blend(Image.new("RGB", img.size, (0, 0, 0)), glow, 0.55).convert("RGBA"),
                        (0, 0)) if False else img.paste(Image.blend(img.convert("RGB"), glow, 0.30), (0, 0))


FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    try:
        return ImageFont.load_default(size)  # Pillow >= 10.1 ships a scalable default
    except TypeError:
        return ImageFont.load_default()


def draw_furniture(img, world):
    dr = ImageDraw.Draw(img, "RGBA")
    s = k()
    f_poi = font(int(R * 0.0098))
    f_small = font(int(R * 0.0078))
    f_region = font(int(R * 0.0145))

    # grid every 1 km
    step = WORLD / 12.0 * s
    for i in range(1, 12):
        x = i * step
        dr.line([(x, 0), (x, R)], fill=(255, 255, 255, 11), width=1)
        dr.line([(0, x), (R, x)], fill=(255, 255, 255, 11), width=1)
        if i % 2 == 0:
            dr.text((x + 5, 14), f"E{i}", font=f_small, fill=(240, 244, 248, 95))
            dr.text((14, x + 5), f"S{i}", font=f_small, fill=(240, 244, 248, 95))

    # region names, letter-spaced, kept clear of the POI labels
    poi_pts = [(p["x"] * s, p["y"] * s) for p in world["pois"]]
    for r in world["regions"]:
        x, y = r["cx"] * s, r["cy"] * s
        if not (60 < x < R - 320 and 60 < y < R - 60):
            continue
        name = r["name"].upper()
        tw = sum(dr.textlength(c, font=f_region) + 6 for c in name)
        best = None
        for dy in (0, -R * 0.030, R * 0.030, -R * 0.058, R * 0.058):
            cand = (x, y + dy)
            clash = sum(1 for (px, py) in poi_pts
                        if abs(px - cand[0]) < tw * 0.55 + R * 0.02 and abs(py - cand[1]) < R * 0.022)
            if clash == 0:
                best = cand
                break
        if best is None:
            continue
        spaced(dr, best, name, f_region, (252, 248, 238, 150), spacing=6)

    # sea labels
    for (tx, ty, lbl) in ((0.16, 0.86, "CORAL SEA"), (0.82, 0.18, "THE NARROWS")):
        spaced(dr, (R * tx, R * ty), lbl, f_small, (210, 236, 240, 70), spacing=5)

    # POI markers + labels with a thin leader
    for p in world["pois"]:
        x, y = p["x"] * s, p["y"] * s
        if not (24 < x < R - 24 and 24 < y < R - 24):
            continue
        r = max(6, int(R * 0.0042))
        marker(dr, x, y, r, p.get("type", "outpost"))
        name = p["name"]
        tw = dr.textlength(name, font=f_poi)
        tx, ty = x + r + 9, y - R * 0.0062
        if tx + tw > R - 10:
            tx = x - r - 9 - tw
        dr.text((tx + 1.5, ty + 1.5), name, font=f_poi, fill=(8, 10, 12, 170))
        dr.text((tx, ty), name, font=f_poi, fill=(252, 250, 244, 255))

    # ---- frame + furniture
    dr.rectangle([0, 0, R - 1, R - 1], outline=(244, 240, 230, 90), width=3)
    dr.rectangle([10, 10, R - 11, R - 11], outline=(244, 240, 230, 40), width=1)

    f_title = font(int(R * 0.031))
    f_sub = font(int(R * 0.0105))
    dr.text((R * 0.030, R * 0.026), "BERMUDA", font=f_title, fill=(255, 255, 255, 245))
    dr.text((R * 0.030, R * 0.026 + R * 0.034), "SURVIVAL", font=f_title, fill=(212, 62, 58, 248))
    dr.text((R * 0.0315, R * 0.026 + R * 0.0705), "OCCUPIED ISLAND  |  WORLD MAP  |  12 x 12 KM",
            font=f_sub, fill=(226, 232, 240, 215))

    # compass
    cx, cy, cr = R * 0.905, R * 0.105, R * 0.052
    dr.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], outline=(240, 244, 250, 150), width=3)
    dr.ellipse([cx - cr * 0.82, cy - cr * 0.82, cx + cr * 0.82, cy + cr * 0.82],
               outline=(240, 244, 250, 70), width=1)
    for a in (270, 0, 90, 180):
        rad = math.radians(a)
        tip = (cx + math.cos(rad) * cr * 0.92, cy + math.sin(rad) * cr * 0.92)
        b1 = (cx + math.cos(rad + 0.16) * cr * 0.26, cy + math.sin(rad + 0.16) * cr * 0.26)
        b2 = (cx + math.cos(rad - 0.16) * cr * 0.26, cy + math.sin(rad - 0.16) * cr * 0.26)
        dr.polygon([tip, b1, b2], fill=(246, 248, 252, 235))
    dr.text((cx - 9, cy - cr * 1.28), "N", font=font(int(R * 0.014)), fill=(250, 250, 250, 240))

    # scale bar (1 km segments)
    bx, by = R * 0.745, R * 0.947
    seg = WORLD / 12.0 * s
    for i in range(5):
        dr.rectangle([bx + i * seg, by, bx + (i + 1) * seg, by + R * 0.008],
                     fill=(246, 248, 252, 240) if i % 2 == 0 else (36, 40, 44, 240))
        dr.text((bx + i * seg - dr.textlength(str(i), font=f_small) / 2, by - R * 0.017), str(i),
                font=f_small, fill=(246, 248, 252, 240))
    dr.text((bx + 5 * seg + 10, by - R * 0.017), "km", font=f_small, fill=(246, 248, 252, 240))

    # legend
    legend = [("harbor", "Harbour / Dock"), ("town", "Settlement"), ("outpost", "Outpost"),
              ("radio_tower", "Radio / Radar"), ("cache", "Cache"), ("ruins", "Ruins"),
              ("airstrip", "Airstrip"), ("alien_camp", "Alien Activity")]
    lx, ly = R * 0.030, R * 0.80
    dr.rectangle([lx - 14, ly - 16, lx + R * 0.20, ly + len(legend) * R * 0.0265 + 8],
                 fill=(12, 14, 18, 120), outline=(240, 244, 248, 50))
    for i, (kind, label) in enumerate(legend):
        y = ly + i * R * 0.0265
        marker(dr, lx + R * 0.008, y + R * 0.006, int(R * 0.0055), kind)
        dr.text((lx + R * 0.022, y), label, font=f_small, fill=(240, 244, 248, 230))


if __name__ == "__main__":
    main()
