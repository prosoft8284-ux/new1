#!/usr/bin/env python3
"""
Satellite-style painted island render (target look: concept-art survival map).

Technique, in the order it is applied:
  1. continuous fields upsampled from the world generator
  2. multi-octave value noise added to height + a canopy "bump" field
  3. per-pixel shading: sun normal lighting, curvature AO, ray-marched cast shadows
  4. water: depth ramp, reef mask, surf ring, caustics, swell texture
  5. vegetation painted as shaded canopy bumps (not flat dots)
  6. cloud layer with offset shadows, atmospheric haze on the horizon
  7. labels / legend / compass / scale bar
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
SEA = 0.30


# ----------------------------------------------------------------- noise
def value_noise(shape, res, seed):
    rng = np.random.default_rng(seed)
    h, w = shape
    gh = max(2, int(res) + 1)
    gw = max(2, int(res * w / h) + 1)
    g = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((g * 255).astype(np.uint8), "L").resize((w, h), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0


def fbm(shape, base=4, octaves=5, seed=0, gain=0.5, lac=2.0):
    out = np.zeros(shape, np.float32)
    amp, res, norm = 1.0, base, 0.0
    for o in range(octaves):
        out += amp * value_noise(shape, res, seed + o * 17)
        norm += amp
        amp *= gain
        res *= lac
    return out / norm


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- shading
def normals(z, strength):
    gy, gx = np.gradient(z)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(z)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / ln, ny / ln, nz / ln


def sun_shade(nx, ny, nz, az=315.0, alt=38.0):
    a = math.radians(az)
    e = math.radians(alt)
    lx, ly, lz = math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)
    return np.clip(nx * lx + ny * ly + nz * lz, 0, 1)


def cast_shadow(z, az=315.0, alt=38.0, steps=28, step_px=3.0):
    a = math.radians(az)
    dx, dy = math.cos(a), math.sin(a)
    tan_e = math.tan(math.radians(alt))
    h, w = z.shape
    shadow = np.zeros_like(z)
    for k in range(1, steps + 1):
        sx = int(round(dx * k * step_px))
        sy = int(round(dy * k * step_px))
        if abs(sx) >= w or abs(sy) >= h:
            break
        shifted = np.roll(np.roll(z, sy, axis=0), sx, axis=1)
        need = z + (k * step_px / max(tan_e, 0.2)) * 0.0016
        shadow = np.maximum(shadow, (shifted > need).astype(np.float32) * (1.0 - k / (steps + 4)))
    return shadow


def main():
    fields_name = os.environ.get("BF_FIELDS", "_fields.npz")
    world_name = os.environ.get("BF_WORLD", "world.json")
    blds_name = os.environ.get("BF_BUILDINGS", "buildings.json")
    out_name = os.environ.get("BF_OUT", "island-satellite.png")
    d = np.load(os.path.join(MAP, fields_name))
    with open(os.path.join(MAP, world_name), encoding="utf-8") as fh:
        world = json.load(fh)

    R = 2600
    h0 = d["h"].astype(np.float32)
    n = h0.shape[0]
    def up(a):
        return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((R, R), Image.BICUBIC))
    h = up(h0)
    moist = up(d["moist"].astype(np.float32))
    land = up(d["land"].astype(np.float32)) > 0.5
    slope = up(d.get("slope", np.zeros_like(h0)).astype(np.float32))

    # ---- micro relief + canopy bumps
    detail = fbm((R, R), 96, 5, seed=3) - 0.5
    canopy = fbm((R, R), 40, 6, seed=11, gain=0.55)
    canopy = smoothstep(0.42, 0.62, canopy)
    jungle = smoothstep(0.50, 0.66, moist) * land
    bumps = canopy * jungle

    relief = h + detail * 0.010 + bumps * 0.028
    nx, ny, nz = normals(relief, strength=26.0)
    light = sun_shade(nx, ny, nz)

    # curvature AO
    blur = ndimage.gaussian_filter(relief, 6)
    ao = np.clip(0.62 + (relief - blur) * 90.0, 0.0, 1.0)
    ao = ndimage.gaussian_filter(ao, 2.0)

    shadow = cast_shadow(h, steps=26, step_px=3.0)

    depth = np.clip(SEA - h, 0, 1)
    yy, xx = np.mgrid[0:R, 0:R].astype(np.float32)

    # ---------------------------------------------------------- water
    stops = [0.0, 0.004, 0.014, 0.040, 0.110, 0.300]
    cols = [(178, 236, 216), (98, 214, 200), (44, 172, 176), (22, 126, 152),
            (14, 78, 112), (7, 34, 58)]
    water = np.stack([np.interp(depth, stops, [c[i] for c in cols]) for i in range(3)], -1).astype(np.float32)

    swell = fbm((R, R), 60, 4, seed=23)
    water *= (0.94 + 0.12 * swell)[..., None]

    # caustics in the shallows
    caust = (fbm((R, R), 150, 3, seed=31) ** 3) * smoothstep(0.10, 0.01, depth)
    water += caust[..., None] * np.array([60, 80, 60])

    # reef ring just outside the surf
    reef = smoothstep(0.026, 0.010, depth) * smoothstep(0.003, 0.009, depth)
    patchy = smoothstep(0.45, 0.70, fbm((R, R), 90, 4, seed=41))
    water = water * (1 - (reef * patchy)[..., None] * 0.55) + \
        (reef * patchy)[..., None] * np.array([120, 190, 170])

    surf = smoothstep(0.012, 0.0, depth) * (~land)
    water = water * (1 - surf[..., None]) + surf[..., None] * np.array([236, 248, 240])

    # island reflection / darkening at the waterline
    shore_dark = smoothstep(0.03, 0.0, depth) * 0.18
    water *= (1 - shore_dark[..., None])

    # deep ocean currents
    cur = smoothstep(0.55, 0.85, fbm((R, R), 12, 4, seed=53)) * smoothstep(0.20, 0.6, depth)
    water += cur[..., None] * np.array([6, 12, 16])

    # ---------------------------------------------------------- land
    sand_h = smoothstep(SEA + 0.034, SEA + 0.006, h)
    wet = smoothstep(SEA + 0.014, SEA + 0.002, h)
    rock_h = smoothstep(0.50, 0.60, h) * land
    steep = smoothstep(0.06, 0.14, slope) * land

    land_img = np.zeros((R, R, 3), np.float32)
    land_img[:] = (74, 104, 58)

    sand_c = np.array([232, 214, 166])
    wet_c = np.array([196, 176, 134])
    grass_c = np.array([140, 164, 84])
    jungle_c = np.array([58, 104, 50])
    deep_jungle_c = np.array([34, 74, 38])
    rock_c = np.array([146, 134, 116])
    dark_rock_c = np.array([92, 84, 74])

    t = smoothstep(0.50, 0.70, moist)
    land_img = (grass_c * (1 - t)[..., None] + jungle_c * t[..., None])
    t2 = smoothstep(0.68, 0.85, moist)
    land_img = land_img * (1 - t2)[..., None] + deep_jungle_c * t2[..., None]
    land_img = land_img * (1 - sand_h[..., None]) + sand_c * sand_h[..., None]
    land_img = land_img * (1 - wet[..., None]) + wet_c * wet[..., None]
    land_img = land_img * (1 - rock_h[..., None]) + rock_c * rock_h[..., None]
    land_img = land_img * (1 - steep[..., None] * 0.8) + dark_rock_c * (steep[..., None] * 0.8)

    # canopy texture: patchy colour + tiny gaps so the forest reads as trees
    gap = smoothstep(0.30, 0.55, canopy) * jungle
    land_img *= (1 - gap[..., None] * 0.40)
    hue = (fbm((R, R), 220, 3, seed=61) - 0.5) * 34
    land_img += hue[..., None] * np.array([0.4, 0.9, 0.3])
    # canopy gaps show the dark floor: reads as individual crowns from above
    crown = smoothstep(0.58, 0.78, fbm((R, R), 300, 4, seed=67)) * jungle
    land_img = land_img * (1 - crown[..., None] * 0.45) + np.array([22, 46, 28]) * (crown[..., None] * 0.45)

    # volcanic rock on the high ground: dark basalt with pale ridges, no snow
    peak = smoothstep(0.52, 0.64, h) * land
    basalt = np.array([66, 62, 58])
    scoria = np.array([96, 84, 76])
    ridge_n = smoothstep(0.45, 0.75, fbm((R, R), 120, 4, seed=91))
    rock_mix = basalt * (1 - ridge_n[..., None]) + scoria * ridge_n[..., None]
    land_img = land_img * (1 - peak[..., None]) + rock_mix * peak[..., None]

    # apply lighting to land only
    lit = land_img * (0.70 + 0.62 * light[..., None])
    lit *= (0.80 + 0.28 * ao[..., None])
    lit *= (1.0 - 0.30 * shadow[..., None])
    lit += bump_spec(bumps, light)

    img = np.where(land[..., None], lit, water)

    # ---------------------------------------------------------- clouds
    cl = fbm((R, R), 22, 6, seed=77, gain=0.56)
    cl = smoothstep(0.66, 0.86, cl)
    cl = ndimage.gaussian_filter(cl, 1.4)
    # keep the cloud deck over open water so the island stays readable
    sea_mask = ndimage.gaussian_filter((~land).astype(np.float32), 40)
    cl *= np.clip(sea_mask * 1.5, 0, 1)
    cl_sh = np.roll(np.roll(cl, 9, axis=0), 14, axis=1) * 0.30
    img *= (1 - cl_sh[..., None] * 0.30)
    img = img * (1 - cl[..., None] * 0.60) + np.array([248, 250, 252]) * (cl[..., None] * 0.60)

    # ---------------------------------------------------------- grade
    img[..., 0] *= 1.03
    img[..., 2] *= 1.02
    vx = (xx / R - 0.5) * 2
    vy = (yy / R - 0.5) * 2
    vig = np.clip(1.10 - 0.22 * (vx ** 2 + vy ** 2), 0.6, 1.12)
    img *= vig[..., None]

    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    out = out.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))

    with open(os.path.join(MAP, blds_name), encoding="utf-8") as fh:
        buildings = json.load(fh)
    draw_structures(out, world, buildings, R)
    draw_labels(out, world, R, TILE)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out_name)
    out.save(path)
    print(path, out.size)


def bump_spec(bumps, light):
    return (bumps * (0.10 * light))[..., None] * np.array([26, 34, 18])


# --------------------------------------------------------------- structures
def draw_structures(img, world, buildings, R):
    """Roads, settlements, docks and the airstrip, drawn from the game data."""
    k = R / (384 * TILE)
    dr = ImageDraw.Draw(img, "RGBA")

    # roads
    for road in world["roads"]:
        pts = [(x * k, y * k) for (x, y) in road["points"]]
        if len(pts) < 2:
            continue
        w = max(1, int((2.2 if road["kind"] == "main" else 1.4) * k * TILE * 0.5))
        dr.line(pts, fill=(58, 48, 34, 150), width=w + 2, joint="curve")
        dr.line(pts, fill=(206, 190, 156, 170), width=w, joint="curve")

    # settlements: buildings clustered around civilian POIs
    civ = [p for p in world["pois"] if p.get("type") in
           ("town", "harbor", "village", "airstrip", "lighthouse", "ruins", "camp")]
    for b in buildings:
        near = None
        for p in civ:
            if abs(p["x"] - b["x"]) < 900 and abs(p["y"] - b["y"]) < 900:
                near = p
                break
        if near is None:
            continue
        rad = math.radians(b.get("rot", 0))
        cs, sn = math.cos(rad), math.sin(rad)
        hw = b.get("w", 64) * k / 2
        hh = b.get("h", 64) * k / 2
        x, y = b["x"] * k, b["y"] * k
        pts = [(x + sx * cs - sy * sn, y + sx * sn + sy * cs)
               for (sx, sy) in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]
        dr.polygon([(px + 1, py + 1) for (px, py) in pts], fill=(24, 22, 18, 150))
        col = (176, 120, 84) if b.get("style") in ("house", "shop", "hut") else (128, 134, 140)
        dr.polygon(pts, fill=col + (235,), outline=(52, 42, 32, 220))

    # airstrip
    for p in world["pois"]:
        if p.get("type") != "airstrip":
            continue
        x, y = p["x"] * k, p["y"] * k
        L, Wd = 640 * k, 70 * k
        box = [(x - L, y - Wd), (x + L, y - Wd), (x + L, y + Wd), (x - L, y + Wd)]
        dr.polygon([(px + 2, py + 2) for (px, py) in box], fill=(20, 20, 18, 130))
        dr.polygon(box, fill=(96, 98, 96, 235), outline=(40, 42, 40, 240))
        n = 14
        for i in range(n):
            if i % 2:
                continue
            cx = x - L + (i + 0.5) * (2 * L / n)
            seg = 2 * L / n * 0.55
            dr.rectangle([cx - seg / 2, y - 2, cx + seg / 2, y + 2], fill=(238, 238, 232, 220))

    # docks along the coast near the harbour
    for p in world["pois"]:
        if p.get("type") not in ("harbor", "dock"):
            continue
        x, y = p["x"] * k, p["y"] * k
        for a in range(6):
            ang = a / 6 * math.tau
            ex, ey = x + math.cos(ang) * 55 * k, y + math.sin(ang) * 55 * k
            dr.line([(x, y), (ex, ey)], fill=(150, 116, 78, 220), width=max(2, int(6 * k)))
            bx, by = x + math.cos(ang) * 62 * k, y + math.sin(ang) * 62 * k
            dr.ellipse([bx - 5 * k, by - 2.5 * k, bx + 5 * k, by + 2.5 * k],
                       fill=(238, 234, 224, 230), outline=(60, 54, 44, 220))

    # alien cores glow neon purple
    glow = Image.new("RGB", img.size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for p in world["pois"]:
        if p.get("type") not in ("alien", "spire"):
            continue
        x, y = p["x"] * k, p["y"] * k
        r = 60 * k
        for i in range(10):
            rr = r * (1 - i / 10)
            gd.ellipse([x - rr, y - rr, x + rr, y + rr],
                       fill=(int(90 * (i / 10) ** 2), 0, int(150 * (i / 10) ** 2)))
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    img_blob = Image.blend(img, Image.composite(img, glow, Image.new("L", img.size, 120)), 0.0)
    img.alpha_composite(glow.convert("RGBA")) if img.mode == "RGBA" else img.paste(
        Image.blend(img.convert("RGB"), glow, 0.35), (0, 0))


# ------------------------------------------------------------------ labels
ICON = {
    "main": (232, 78, 62), "side": (232, 176, 60), "safe": (240, 200, 96),
    "shop": (94, 196, 232), "tower": (150, 120, 232), "alien": (176, 92, 232),
    "danger": (214, 64, 64), "player": (90, 210, 230), "vehicle": (210, 214, 220),
    "harbor": (120, 200, 240), "town": (240, 176, 96), "camp": (236, 96, 72),
}


def draw_labels(img, world, R, tile):
    dr = ImageDraw.Draw(img, "RGBA")
    def font(sz):
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()
    f = font(int(R * 0.0115))
    fs = font(int(R * 0.009))

    scale = R / (384 * tile)
    for p in world["pois"]:
        x = p["x"] * scale
        y = p["y"] * scale
        if not (30 < x < R - 30 and 30 < y < R - 30):
            continue
        kind = p.get("type", "camp")
        col = ICON.get(kind, ICON["camp"])
        r = max(5, int(R * 0.0042))
        dr.ellipse([x - r - 3, y - r - 3, x + r + 3, y + r + 3], fill=(12, 14, 18, 140))
        if kind in ("camp", "alien"):
            dr.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,), outline=(255, 255, 255, 230))
        elif kind in ("town", "harbor"):
            dr.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)],
                       fill=col + (255,), outline=(255, 255, 255, 230))
        elif kind == "airstrip":
            dr.polygon([(x, y - r), (x + r * 0.9, y + r * 0.7), (x - r * 0.9, y + r * 0.7)],
                       fill=col + (255,), outline=(255, 255, 255, 230))
        else:
            dr.rectangle([x - r, y - r, x + r, y + r], fill=col + (255,), outline=(255, 255, 255, 230))
        txt = p["name"]
        bb = dr.textbbox((0, 0), txt, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        tx, ty = x + r + 7, y - th / 2 - 2
        dr.text((tx + 1, ty + 1), txt, font=f, fill=(10, 12, 14, 190))
        dr.text((tx, ty), txt, font=f, fill=(252, 250, 244, 255))

    # title
    t1 = font(int(R * 0.030))
    dr.text((int(R * 0.035), int(R * 0.028)), "BERMUDA", font=t1, fill=(255, 255, 255, 240))
    dr.text((int(R * 0.035), int(R * 0.028) + int(R * 0.034)), "SURVIVAL", font=t1, fill=(214, 64, 64, 245))
    t2 = font(int(R * 0.0105))
    dr.text((int(R * 0.037), int(R * 0.028) + int(R * 0.068)), "OCCUPIED ISLAND  ·  WORLD MAP",
            font=t2, fill=(222, 228, 236, 210))

    # compass
    cx, cy, cr = int(R * 0.915), int(R * 0.10), int(R * 0.048)
    dr.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], outline=(240, 244, 250, 150), width=3)
    for a, lab in ((270, "N"), (0, "E"), (90, "S"), (180, "W")):
        rad = math.radians(a)
        ex, ey = cx + math.cos(rad) * cr * 0.86, cy + math.sin(rad) * cr * 0.86
        dr.polygon([(ex, ey), (cx + math.cos(rad + 0.12) * cr * 0.28,
                              cy + math.sin(rad + 0.12) * cr * 0.28),
                    (cx + math.cos(rad - 0.12) * cr * 0.28,
                     cy + math.sin(rad - 0.12) * cr * 0.28)], fill=(244, 246, 250, 235))
        dr.text((cx + math.cos(rad - math.pi / 2) * cr * 1.25 - 6,
                 cy + math.sin(rad - math.pi / 2) * cr * 1.25 - 8), lab,
                font=fs, fill=(250, 250, 250, 235))

    # scale bar
    bx, by = int(R * 0.80), int(R - R * 0.045)
    seg = int(R * 0.045)
    for i in range(5):
        dr.rectangle([bx + i * seg, by, bx + (i + 1) * seg, by + int(R * 0.007)],
                     fill=(245, 247, 250, 235) if i % 2 == 0 else (40, 44, 48, 235))
    for i, lab in enumerate(("0", "1", "2", "3", "4", "5")):
        dr.text((bx + i * seg - 4, by - int(R * 0.016)), lab, font=fs, fill=(245, 248, 252, 240))
    dr.text((bx + 5 * seg + 8, by - int(R * 0.016)), "km", font=fs, fill=(245, 248, 252, 240))

    # legend
    lx, ly = int(R * 0.022), int(R * 0.18)
    items = [("player", "Player"), ("main", "Main Mission"), ("side", "Side Mission"),
             ("safe", "Safe House"), ("shop", "Shop / Workbench"), ("tower", "Radio Tower"),
             ("alien", "Alien Facility"), ("danger", "Danger Zone")]
    for i, (k, lab) in enumerate(items):
        y = ly + i * int(R * 0.024)
        col = ICON.get(k, ICON["main"])
        dr.ellipse([lx, y, lx + int(R * 0.011), y + int(R * 0.011)], fill=col + (240,),
                   outline=(255, 255, 255, 160))
        dr.text((lx + int(R * 0.017), y - 2), lab, font=fs, fill=(236, 240, 246, 225))


if __name__ == "__main__":
    main()
