#!/usr/bin/env python3
"""
Flat illustrated map + hand-authored town layout for Kestrel Harbour.

Differences from the earlier passes:
  * coastline and biomes come from the continuous height field (no tile stairs)
  * the town is a real layout: street grid, blocks, plots, yards, quay, docks
  * limited palette, flat fills, crisp outlines, one soft shadow
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
RNG = np.random.default_rng(20261114)

# ---------------------------------------------------------------- palette
P = {
    "sea_deep": (26, 68, 88),
    "sea": (34, 104, 118),
    "sea_sh": (74, 158, 156),
    "reef": (132, 200, 182),
    "foam": (232, 244, 236),
    "sand": (232, 214, 168),
    "sand_wet": (205, 185, 143),
    "grass": (150, 168, 100),
    "jungle": (84, 120, 66),
    "jungle_d": (60, 96, 56),
    "jungle_dd": (44, 76, 48),
    "dirt": (176, 146, 106),
    "rock": (146, 136, 120),
    "cliff": (114, 104, 92),
    "road": (170, 164, 152),
    "road_edge": (120, 112, 100),
    "curb": (206, 198, 182),
    "yard": (198, 176, 138),
    "yard2": (186, 164, 126),
    "plaza": (204, 190, 162),
    "wood": (150, 114, 76),
    "wood_d": (104, 78, 50),
    "roof_a": (196, 118, 84),
    "roof_b": (170, 96, 72),
    "roof_c": (150, 132, 116),
    "roof_d": (118, 128, 134),
    "thatch": (176, 142, 88),
    "ink": (46, 40, 32),
    "ink_soft": (46, 40, 32, 90),
    "text": (250, 244, 230),
}


def resize(a, w, h, mode=Image.BILINEAR):
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), mode))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ town
def build_town(center, angle, radius, h_field, land_field, step=300.0):
    """Return streets, blocks (plots), and quay info in world coordinates."""
    cx, cy = center
    ux, uy = math.cos(angle), math.sin(angle)
    vx, vy = -uy, ux
    streets = []
    blocks = []

    n = int(radius // step) + 1
    for i in range(-n, n + 1):
        # streets along v at offset i*step from the centre line
        a = (cx + ux * i * step, cy + uy * i * step)
        b = (a[0] + vx * radius * 2.2, a[1] + vy * radius * 2.2)
        streets.append(("v", a, b, i))
        a2 = (cx + vx * i * step, cy + vy * i * step)
        b2 = (a2[0] + ux * radius * 2.2, a2[1] + uy * radius * 2.2)
        streets.append(("u", a2, b2, i))

    for i in range(-n, n):
        for j in range(-n, n):
            cx0 = cx + ux * (i + 0.5) * step + vx * (j + 0.5) * step
            cy0 = cy + uy * (i + 0.5) * step + vy * (j + 0.5) * step
            d = math.hypot(cx0 - cx, cy0 - cy)
            if d > radius:
                continue
            hh = sample(h_field, cx0, cy0)
            ll = sample(land_field, cx0, cy0)
            if ll < 0.5 or hh < SEA + 0.012:
                continue
            blocks.append(dict(x=cx0, y=cy0, d=d, h=hh))
    return streets, blocks


def sample(field, x, y):
    h, w = field.shape
    i = int(np.clip(x / TILE, 0, w - 1))
    j = int(np.clip(y / TILE, 0, h - 1))
    return float(field[j, i])


def main():
    d = np.load(os.path.join(MAP, "_fields.npz"))
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    with open(os.path.join(MAP, "buildings.json"), encoding="utf-8") as fh:
        buildings = json.load(fh)

    harbour = next(p for p in world["pois"] if p["id"] == "harbor")

    # ------------------------------------------------------------- framing
    CX, CY = harbour["x"], harbour["y"]
    HALF_W_TILES, HALF_H_TILES = 34, 30
    PX = 34
    I0 = max(0, int(CX // TILE) - HALF_W_TILES)
    J0 = max(0, int(CY // TILE) - HALF_H_TILES)
    I1 = min(384, I0 + HALF_W_TILES * 2)
    J1 = min(384, J0 + HALF_H_TILES * 2)
    W = (I1 - I0) * PX
    H = (J1 - J0) * PX
    OX, OY = I0 * TILE, J0 * TILE

    def tp(x, y):
        return ((x - OX) / TILE * PX, (y - OY) / TILE * PX)

    # continuous fields at pixel resolution
    h = resize(d["h"][J0:J1, I0:I1], W, H)
    moist = resize(d["moist"][J0:J1, I0:I1], W, H)
    slope = resize(d["slope"][J0:J1, I0:I1], W, H)
    land = resize(d["land"][J0:J1, I0:I1].astype(np.float32), W, H) > 0.5

    depth = np.clip(SEA - h, 0, 1)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # coastline distance (continuous) for beaches and cliffs
    water_dist = ndimage.distance_transform_edt(land) * (TILE / PX)
    sea_dist = ndimage.distance_transform_edt(~land) * (TILE / PX)

    # ------------------------------------------------------------- water
    img = np.zeros((H, W, 3), np.float32)
    img[:] = P["sea_deep"]
    img[depth < 0.20] = P["sea"]
    img[depth < 0.070] = P["sea_sh"]
    img[depth < 0.018] = P["reef"]
    # foam ring right at the waterline (soft, not tile-aligned)
    foam = (~land) & (depth < 0.010)
    img[foam] = P["foam"]
    # gentle ripple strokes in the open water
    wave = (np.sin((xx * 0.55 + yy * 0.3) / 18.0) > 0.97) & (~land) & (depth > 0.02)
    img[wave] = np.array(img[wave]) * 0.82 + np.array([255, 255, 255]) * 0.18

    # -------------------------------------------------------------- land
    sand_band = land & (water_dist < 7)
    grass = land & (moist < 0.52) & ~sand_band
    jungle = land & (moist >= 0.52) & ~sand_band
    jungle_dark = land & (moist >= 0.68) & ~sand_band
    rock = land & (h > SEA + 0.30)
    cliff = land & (slope > 0.055) & (h > SEA + 0.10)

    img[grass] = P["grass"]
    img[jungle] = P["jungle"]
    img[jungle_dark] = P["jungle_d"]
    img[sand_band] = P["sand"]
    img[land & (water_dist < 2.2)] = P["sand_wet"]
    img[rock] = P["rock"]
    img[cliff] = P["cliff"]

    # paper-ish texture so flat fills do not look empty
    tex = RNG.normal(0, 3.2, (H, W, 1))
    img = np.clip(img + tex, 0, 255)

    base = Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")
    out = base
    dr = ImageDraw.Draw(out, "RGBA")

    # ------------------------------------------------------- town layout
    # face the grid roughly along the coast
    gy, gx = np.gradient(land.astype(np.float32))
    ang = math.atan2(-(gx[int(H * 0.5), int(W * 0.5)] if W and H else 0) + 1e-6,
                     (gy[int(H * 0.5), int(W * 0.5)] if W and H else 1) + 1e-6)
    angle = ang + math.pi / 2

    streets, blocks = build_town((CX, CY), angle, 900.0, d["h"], d["land"].astype(np.float32))

    def block_pt(b, du, dv):
        ux, uy = math.cos(angle), math.sin(angle)
        vx, vy = -uy, ux
        return (b["x"] + ux * du + vx * dv, b["y"] + uy * du + vy * dv)

    # ------------------------------------------------------------ streets
    for (kind, a, b, idx) in streets:
        if main_cell_hits_water(a, b, d["h"], SEA):
            pass
        pa, pb = tp(*a), tp(*b)
        dr.line([pa, pb], fill=P["road_edge"] + (255,), width=int(PX * 2.9), joint="curve")
        dr.line([pa, pb], fill=P["curb"] + (255,), width=int(PX * 2.35), joint="curve")
        dr.line([pa, pb], fill=P["road"] + (255,), width=int(PX * 1.75), joint="curve")

    # ------------------------------------------------------------- blocks
    shadows = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sdr = ImageDraw.Draw(shadows)
    plot_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pdr = ImageDraw.Draw(plot_layer)

    placed = 0
    for b in blocks:
        hh = b["h"]
        if hh < SEA + 0.012:
            continue
        # town density falls off away from the harbour
        dens = 1.0 - min(1.0, b["d"] / 1000.0)
        if RNG.random() > 0.35 + dens * 0.6:
            continue

        lots = 2 if RNG.random() < 0.5 else 3
        for k in range(lots):
            du = (k - (lots - 1) / 2) * 130 + RNG.integers(-14, 14)
            dv = RNG.integers(-40, 40)
            px, py = block_pt(b, du, dv)
            sx, sy = tp(px, py)
            if not (30 < sx < W - 30 and 30 < sy < H - 30):
                continue
            if not land[int(np.clip(sy, 0, H - 1)), int(np.clip(sx, 0, W - 1))]:
                continue
            if h[int(np.clip(sy, 0, H - 1)), int(np.clip(sx, 0, W - 1))] < SEA + 0.008:
                continue
            kind = RNG.random()
            if kind < 0.62:
                w = RNG.integers(70, 150)
                hgt = RNG.integers(60, 110)
                style = "house" if RNG.random() < 0.65 else "shop"
            elif kind < 0.86:
                w = RNG.integers(120, 230)
                hgt = RNG.integers(90, 160)
                style = "warehouse"
            else:
                w = RNG.integers(50, 80)
                hgt = RNG.integers(50, 80)
                style = "hut"
            rot = math.degrees(angle) + (90 if RNG.random() < 0.25 else 0)
            draw_building(pdr, sdr, sx, sy, w, hgt, rot, style, PX)
            placed += 1

    out.alpha_composite(shadows.filter(ImageFilter.GaussianBlur(3.0)))
    out.alpha_composite(plot_layer)
    dr = ImageDraw.Draw(out, "RGBA")

    # ------------------------------------------------------------- quay
    # stone edge + piers where the town meets the water
    for b in blocks:
        if b["d"] > 780:
            continue
        for k in range(8):
            px, py = block_pt(b, RNG.integers(-140, 140), RNG.integers(-140, 140))
            sx, sy = tp(px, py)
            if not (0 < sx < W and 0 < sy < H):
                continue
            if land[int(sy), int(sx)]:
                continue
            # pier reaching into the bay
            ang2 = RNG.random() * math.tau
            L = PX * (3 + RNG.random() * 4)
            ex, ey = sx + math.cos(ang2) * L, sy + math.sin(ang2) * L
            dr.line([(sx, sy), (ex, ey)], fill=P["wood_d"] + (255,), width=int(PX * 0.9))
            dr.line([(sx, sy), (ex, ey)], fill=P["wood"] + (255,), width=int(PX * 0.62))
            for t in range(1, 7):
                bx = sx + (ex - sx) * t / 7
                by = sy + (ey - sy) * t / 7
                dr.line([(bx - PX * 0.26, by), (bx + PX * 0.26, by)],
                        fill=(112, 84, 54, 210), width=2)
            break

    # ------------------------------------------------------------- props
    for b in blocks:
        if b["d"] > 760 or RNG.random() > 0.7:
            continue
        for k in range(RNG.integers(1, 5)):
            px, py = block_pt(b, RNG.integers(-130, 130), RNG.integers(-130, 130))
            sx, sy = tp(px, py)
            if not (8 < sx < W - 8 and 8 < sy < H - 8):
                continue
            if not land[int(sy), int(sx)]:
                continue
            kk = RNG.random()
            if kk < 0.4:
                s = PX * 0.26
                dr.rectangle([sx - s, sy - s, sx + s, sy + s], fill=(150, 116, 72, 255),
                             outline=(74, 56, 38, 255), width=2)
            elif kk < 0.58:
                r = PX * 0.22
                dr.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(108, 100, 88, 255),
                           outline=(54, 48, 40, 255), width=2)
            elif kk < 0.8:
                # parked car
                w2, h2 = PX * 0.72, PX * 0.34
                rot = angle + (math.pi / 2 if RNG.random() < 0.5 else 0)
                cs, sn = math.cos(rot), math.sin(rot)
                pts = [(sx + (-w2 * cs + h2 * sn), sy + (-w2 * sn - h2 * cs)),
                       (sx + (w2 * cs + h2 * sn), sy + (w2 * sn - h2 * cs)),
                       (sx + (w2 * cs - h2 * sn), sy + (w2 * sn + h2 * cs)),
                       (sx + (-w2 * cs - h2 * sn), sy + (-w2 * sn + h2 * cs))]
                dr.polygon(pts, fill=(96, 110, 120, 255), outline=(38, 44, 48, 255))
            else:
                # striped market awning
                w2 = PX * 0.75
                dr.rectangle([sx - w2, sy - w2 * 0.55, sx + w2, sy + w2 * 0.55], fill=(196, 88, 72, 255))
                for i in range(4):
                    ax = sx - w2 + i * (w2 * 0.5)
                    dr.rectangle([ax, sy - w2 * 0.55, ax + w2 * 0.2, sy + w2 * 0.55],
                                 fill=(240, 228, 200, 255))
                dr.rectangle([sx - w2, sy - w2 * 0.55, sx + w2, sy + w2 * 0.55],
                             outline=(92, 50, 40, 255), width=2)

    # ------------------------------------------------------------- trees
    trees = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tdr = ImageDraw.Draw(trees)
    tsh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tsdr = ImageDraw.Draw(tsh)

    town_mask = np.zeros((H, W), bool)
    for b in blocks:
        sx, sy = tp(b["x"], b["y"])
        r = int(PX * 3.2)
        if 0 <= sy < H and 0 <= sx < W:
            town_mask[max(0, int(sy) - r):int(sy) + r, max(0, int(sx) - r):int(sx) + r] = True

    dens = smoothstep(0.42, 0.72, moist)
    dens = ndimage.gaussian_filter(dens, PX * 0.5)
    min_dist = PX * 0.75
    grid = {}
    cell = max(4, int(min_dist))
    for py in range(0, H, cell):
        for px in range(0, W, cell):
            if town_mask[py, px] or not land[py, px]:
                continue
            if water_dist[py, px] < 1.6:
                continue
            if RNG.random() > dens[py, px] * 0.85:
                continue
            r = PX * (0.5 + RNG.random() * 0.5)
            x = px + (RNG.random() - 0.5) * cell
            y = py + (RNG.random() - 0.5) * cell
            if x < 0 or y < 0 or x >= W or y >= H:
                continue
            key = (int(x // min_dist), int(y // min_dist))
            if key in grid:
                continue
            grid[key] = True
            draw_tree(tdr, tsdr, x, y, r, int(RNG.random() * 4), PX)

    out.alpha_composite(tsh.filter(ImageFilter.GaussianBlur(2.0)))
    out.alpha_composite(trees)

    # ------------------------------------------------------------- labels
    dr = ImageDraw.Draw(out, "RGBA")
    f_big = tf(("DejaVuSans-Bold.ttf", int(PX * 1.0)))
    f_small = tf(("DejaVuSans-Bold.ttf", int(PX * 0.72)))
    for p in world["pois"]:
        sx, sy = tp(p["x"], p["y"])
        if not (20 < sx < W - 20 and 20 < sy < H - 20):
            continue
        if p["type"] in ("harbor", "town", "village", "dock", "lighthouse", "ruins", "airstrip"):
            txt = p["name"].upper()
            bb = dr.textbbox((0, 0), txt, font=f_big)
            tw = bb[2] - bb[0]
            dr.rectangle([sx - tw / 2 - 7, sy - bb[3] - 14, sx + tw / 2 + 7, sy - 2],
                         fill=(26, 30, 26, 200))
            dr.text((sx - tw / 2, sy - bb[3] - 9), txt, font=f_big, fill=P["text"] + (255,))

    out = out.convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "city-harbor.png")
    out.save(path)
    print(path, out.size, "buildings:", placed)
    crop = out.crop((int(W * 0.30), int(H * 0.25), int(W * 0.30) + 900, int(H * 0.25) + 900))
    cpath = os.path.join(OUT, "city-harbor-close.png")
    crop.save(cpath)
    print(cpath, crop.size)


def tf(args):
    name, size = args
    path = "/usr/share/fonts/truetype/dejavu/" + name
    if os.path.exists(path):
        return ImageFont.truetype(path, max(8, size))
    return ImageFont.load_default()


def main_cell_hits_water(a, b, h, sea):
    return False


def draw_building(roof_draw, shadow_draw, x, y, w, h, rot_deg, style, PX):
    rad = math.radians(rot_deg)
    cs, sn = math.cos(rad), math.sin(rad)
    hw, hh = w / TILE * PX / 2, h / TILE * PX / 2
    pts = []
    for (sx, sy) in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)):
        pts.append((x + sx * cs - sy * sn, y + sx * sn + sy * cs))

    off = PX * 0.55
    shadow_draw.polygon([(px + off, py + off) for (px, py) in pts], fill=(22, 26, 20, 95))

    # yard apron
    yard = []
    for (sx, sy) in ((-hw * 1.35, -hh * 1.35), (hw * 1.35, -hh * 1.35),
                     (hw * 1.35, hh * 1.35), (-hw * 1.35, hh * 1.35)):
        yard.append((x + sx * cs - sy * sn, y + sx * sn + sy * cs))
    roof_draw.polygon(yard, fill=P["yard"] + (255,))

    col = {"house": P["roof_a"], "shop": P["roof_b"], "warehouse": P["roof_d"],
           "hut": P["thatch"], "temple": P["roof_c"]}.get(style, P["roof_a"])
    roof_draw.polygon(pts, fill=col + (255,))

    # ridge + light side
    mid_a = ((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2)
    mid_b = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)
    roof_draw.polygon([pts[0], pts[1], mid_b, mid_a],
                      fill=(min(255, col[0] + 22), min(255, col[1] + 18), min(255, col[2] + 14), 255))
    roof_draw.line([mid_a, mid_b], fill=(255, 246, 226, 130), width=max(1, int(PX * 0.10)))
    roof_draw.line(pts + [pts[0]], fill=P["ink"] + (235,), width=max(2, int(PX * 0.09)))

    if style == "warehouse":
        # skylights
        for k in (-0.35, 0.35):
            px = x + (hw * 0.0) * cs - (hh * k) * sn
            py = y + (hw * 0.0) * sn + (hh * k) * cs
            s = PX * 0.22
            roof_draw.rectangle([px - s, py - s, px + s, py + s], fill=(196, 206, 214, 220))


def draw_tree(td, sd, x, y, r, kind, PX):
    sd.ellipse([x - r * 0.85 + r * 0.4, y - r * 0.35 + r * 0.6,
                x + r * 0.95 + r * 0.4, y + r * 0.7 + r * 0.6], fill=(22, 28, 18, 80))
    if kind == 0:
        td.ellipse([x - r, y - r, x + r, y + r], fill=P["jungle_d"] + (255,))
        td.ellipse([x - r * 0.62, y - r * 0.72, x + r * 0.34, y + r * 0.1],
                   fill=(96, 134, 70, 255))
    elif kind == 1:
        td.polygon([(x, y - r), (x + r * 0.7, y + r * 0.55), (x - r * 0.7, y + r * 0.55)],
                   fill=(58, 92, 58, 255))
        td.polygon([(x, y - r * 0.45), (x + r * 0.5, y + r * 0.7), (x - r * 0.5, y + r * 0.7)],
                   fill=(74, 108, 64, 255))
    elif kind == 2:
        for a in range(6):
            th = a / 6 * math.tau + 0.28
            td.line([(x, y), (x + math.cos(th) * r, y + math.sin(th) * r * 0.92)],
                    fill=(76, 116, 66, 255), width=max(2, int(r * 0.28)))
        td.ellipse([x - r * 0.14, y - r * 0.14, x + r * 0.14, y + r * 0.14],
                   fill=(150, 128, 78, 255))
    else:
        td.ellipse([x - r * 0.85, y - r * 0.45, x + r * 0.45, y + r * 0.55], fill=(70, 106, 58, 255))
        td.ellipse([x - r * 0.1, y - r * 0.65, x + r * 0.85, y + r * 0.3], fill=(88, 124, 62, 255))


if __name__ == "__main__":
    main()
