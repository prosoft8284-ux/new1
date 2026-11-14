#!/usr/bin/env python3
"""
Painted-style art pass for one hand-picked region (Kestrel Harbour).

This is a different renderer from render_map.py: instead of per-tile colours it
composites smooth terrain shading, contour bands, layered jungle canopy,
cast shadows, a street network, detailed roofs, docks, boats and props.
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
N = 384
SEA = 0.30

# region in tiles (harbour town + bay + jungle edge)
I0, J0, I1, J1 = 92, 162, 158, 228
PX = 40  # pixels per tile

PAL = {
    "deep_water": (18, 44, 62), "water": (24, 78, 96), "shallow": (48, 138, 140),
    "reef": (96, 176, 160), "sand": (231, 214, 166), "wet_sand": (204, 186, 140),
    "grass": (139, 158, 92), "jungle": (72, 108, 58), "dense_jungle": (52, 86, 48),
    "jungle_dark": (38, 68, 42), "dirt": (162, 136, 98), "rock": (128, 118, 104),
    "cliff": (96, 88, 80), "mountain": (122, 116, 108), "river": (60, 132, 146),
    "marsh": (92, 110, 76), "road": (150, 142, 130), "trail": (166, 142, 106),
    "concrete": (168, 163, 152), "alien_ground": (74, 44, 84), "crater": (62, 50, 58),
    "ruins_floor": (150, 142, 128), "dock": (126, 96, 66), "bridge": (132, 104, 74),
    "volcanic": (58, 50, 48),
}
NAMES = list(PAL.keys())


def resize(arr, w, h, mode=Image.BILINEAR):
    return np.asarray(Image.fromarray(arr.astype(np.float32), "F").resize((w, h), mode))


def main():
    d = np.load(os.path.join(MAP, "_fields.npz"))
    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    with open(os.path.join(MAP, "buildings.json"), encoding="utf-8") as fh:
        buildings = json.load(fh)

    W = (I1 - I0) * PX
    H = (J1 - J0) * PX
    sub_tiles = d["tiles"][J0:J1, I0:I1]
    sub_h = d["h"][J0:J1, I0:I1]
    sub_moist = d["moist"][J0:J1, I0:I1]
    sub_land = d["land"][J0:J1, I0:I1]

    # ---- base terrain colour ------------------------------------------------
    t_img = Image.fromarray(sub_tiles.astype(np.uint8), "L").resize((W, H), Image.NEAREST)
    t_arr = np.asarray(t_img)
    pal = np.zeros((len(NAMES), 3), np.float32)
    for i, n in enumerate(NAMES):
        pal[i] = PAL[n]
    base = pal[t_arr].copy()

    # soften tile edges so the ground reads as painted, not as blocks
    soft = np.asarray(Image.fromarray(base.astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(PX * 0.28)))
    base = base * 0.35 + soft.astype(np.float32) * 0.65

    h = resize(sub_h, W, H)
    moist = resize(sub_moist, W, H)
    land = resize(sub_land.astype(np.float32), W, H) > 0.5

    # ---- hillshade + ambient occlusion -------------------------------------
    gy, gx = np.gradient(resize(sub_h, W, H))
    shade = np.clip(0.86 + (-gx * 0.9 - gy * 0.9) * PX * 5.0, 0.45, 1.35)
    shade = ndimage.gaussian_filter(shade, 2.0)

    # cliff ambient occlusion: blur the land mask and darken near the coast
    cliff = np.zeros_like(h)
    gy0, gx0 = np.gradient(h)
    slope = np.hypot(gx0, gy0) * PX
    cliff = np.clip((slope - 0.35) / 1.2, 0, 1)

    base *= shade[..., None]
    base *= (1.0 - 0.35 * cliff[..., None])

    # ---- contour bands ------------------------------------------------------
    band = np.abs(((h * 48.0) % 1.0) - 0.5)
    line = (band > 0.44) & (band < 0.47) & land
    base[line] = base[line] * 0.80 + np.array([70, 60, 48]) * 0.20

    # ---- water --------------------------------------------------------------
    depth = np.clip(SEA - h, 0, 1)
    stops = [0.0, 0.008, 0.035, 0.10, 0.26]
    cols = [(120, 206, 190), (66, 172, 176), (34, 120, 148), (18, 66, 104), (8, 22, 46)]
    oc = np.stack([np.interp(depth, stops, [c[i] for c in cols]) for i in range(3)], -1)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rip = (np.sin((xx * 0.9 + yy * 0.4) / 22.0 + depth * 30.0) * 0.5 +
           np.sin((xx * 0.4 - yy * 0.8) / 13.0 + depth * 12.0) * 0.5)
    oc *= (1.0 + 0.045 * rip)[..., None]

    surf = np.exp(-((depth - 0.0055) / 0.0060) ** 2)
    oc = oc * (1 - 0.85 * surf[..., None]) + np.array([232, 244, 236]) * (0.85 * surf[..., None])

    # darker water right against the land, gives a painterly edge
    near = np.exp(-((depth + 0.004) / 0.012) ** 2)
    oc *= (1.0 - 0.25 * near[..., None])

    img_rgb = np.where(land[..., None], base, oc)

    # ---- beach: wet sand gradient ------------------------------------------
    beach = land & (h < SEA + 0.020)
    wet = np.clip((h - SEA) / 0.020, 0, 1)
    sand_col = np.array([204, 186, 140]) * (1 - wet[..., None]) + np.array([236, 220, 174]) * wet[..., None]
    img_rgb[beach] = img_rgb[beach] * 0.25 + sand_col[beach] * 0.75

    out = Image.fromarray(np.clip(img_rgb, 0, 255).astype(np.uint8), "RGB")

    # ------------------------------------------------------------------ jungle
    # canopy density from jungle tiles, clustered, drawn as soft layered blobs
    jungle_mask = np.isin(sub_tiles, [7, 8, 9, 6]).astype(np.float32)
    dens = resize(jungle_mask, W, H)
    dens = ndimage.gaussian_filter(dens, PX * 0.35)
    rng = np.random.default_rng(7)

    canopy = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(canopy)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)

    step = max(6, int(PX * 0.42))
    for py in range(0, H, step):
        for px in range(0, W, step):
            if dens[py, px] < 0.28:
                continue
            if rng.random() > dens[py, px] * 0.9:
                continue
            rr = (PX * 0.55) * (0.7 + rng.random() * 0.9) * (0.85 + dens[py, px] * 0.4)
            cx = px + (rng.random() - 0.5) * step
            cy = py + (rng.random() - 0.5) * step
            tone = rng.random()
            if tone < 0.45:
                col = (34, 62, 34)
            elif tone < 0.8:
                col = (48, 82, 42)
            else:
                col = (64, 104, 50)
            sd.ellipse([cx - rr * 1.05 + rr * 0.45, cy - rr * 0.55 + rr * 0.75,
                        cx + rr * 1.05 + rr * 0.45, cy + rr * 0.85 + rr * 0.75],
                       fill=(12, 20, 14, 90))
            cd.ellipse([cx - rr, cy - rr * 0.85, cx + rr, cy + rr * 0.85], fill=col + (255,))
            cd.ellipse([cx - rr * 0.55, cy - rr * 0.6, cx + rr * 0.35, cy + rr * 0.15],
                       fill=(min(255, col[0] + 26), min(255, col[1] + 34), min(255, col[2] + 18), 235))

    canopy = canopy.filter(ImageFilter.GaussianBlur(0.7))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.4))
    out = out.convert("RGBA")
    out.alpha_composite(shadow)
    out.alpha_composite(canopy)

    # -------------------------------------------------------------------- town
    dr = ImageDraw.Draw(out, "RGBA")
    ox, oy = I0 * TILE, J0 * TILE

    def to_px(x, y):
        return ((x - ox) / TILE * PX, (y - oy) / TILE * PX)

    # streets from the routed roads
    for road in world["roads"]:
        pts = [to_px(x, y) for (x, y) in road["points"]]
        if not pts:
            continue
        if pts[0][0] < -500 and pts[-1][0] < -500:
            continue
        main = road["kind"] == "main"
        w = (2.6 if main else 1.5) * PX
        dr.line(pts, fill=(146, 132, 110, 255), width=int(w + PX * 0.9), joint="curve")
        dr.line(pts, fill=(122, 116, 108, 255), width=int(w), joint="curve")
        dr.line(pts, fill=(150, 142, 132, 120), width=max(1, int(w * 0.18)), joint="curve")

    # building shadows first
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shd = ImageDraw.Draw(shadow_layer)
    roofs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(roofs)

    def corners(b, scale=1.0):
        rad = math.radians(b["rot"])
        cos, sin = math.cos(rad), math.sin(rad)
        pts = []
        for (sx, sy) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            px = b["x"] + (sx * b["w"] * scale * cos - sy * b["h"] * scale * sin)
            py = b["y"] + (sx * b["w"] * scale * sin + sy * b["h"] * scale * cos)
            pts.append(to_px(px, py))
        return pts

    ROOFS = {
        "hut": (150, 106, 72), "house": (168, 120, 82), "shop": (138, 104, 88),
        "warehouse": (126, 126, 128), "tower": (110, 112, 118),
        "temple": (166, 156, 134), "alien_pod": (92, 60, 110),
    }

    for b in buildings:
        if not (I0 * TILE - 200 < b["x"] < I1 * TILE + 200 and J0 * TILE - 200 < b["y"] < J1 * TILE + 200):
            continue
        pts = corners(b)
        off = PX * 0.45
        shd.polygon([(x + off, y + off * 1.15) for (x, y) in pts], fill=(14, 18, 16, 120))
        col = ROOFS.get(b["style"], (160, 116, 84))
        rd.polygon(pts, fill=col + (255,))
        # roof ridge gives a pitched read
        a = ((pts[0][0] + pts[3][0]) / 2, (pts[0][1] + pts[3][1]) / 2)
        c = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)
        rd.line([a, c], fill=(min(255, col[0] + 26), min(255, col[1] + 20), min(255, col[2] + 14), 220),
                width=max(2, int(PX * 0.22)))
        rd.line(pts + [pts[0]], fill=(58, 44, 32, 255), width=max(2, int(PX * 0.14)))
        # eave highlight
        rd.line([pts[0], pts[1]], fill=(255, 240, 214, 90), width=max(1, int(PX * 0.12)))

    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(3.0))
    out.alpha_composite(shadow_layer)
    out.alpha_composite(roofs)

    # ------------------------------------------------------- docks and props
    for poi in world["pois"]:
        if poi["type"] not in ("harbor", "dock"):
            continue
        px, py = to_px(poi["x"], poi["y"])
        if not (-200 < px < W + 200 and -200 < py < H + 200):
            continue
        # wooden jetty into the water
        for k in range(3):
            ang = -0.5 + k * 0.55
            L = PX * 6.5
            ex, ey = px + math.cos(ang) * L, py + math.sin(ang) * L
            dr.line([(px, py), (ex, ey)], fill=(74, 56, 38, 255), width=int(PX * 0.85))
            dr.line([(px, py), (ex, ey)], fill=(132, 100, 66, 255), width=int(PX * 0.6))
            for t in range(1, 7):
                bx = px + (ex - px) * t / 7
                by = py + (ey - py) * t / 7
                dr.line([(bx - PX * 0.3, by), (bx + PX * 0.3, by)], fill=(88, 66, 44, 200), width=2)
            # moored boat
            if k == 0:
                bx, by = px + (ex - px) * 0.8, py + (ey - py) * 0.8
                dr.ellipse([bx - PX * 0.9, by - PX * 0.45, bx + PX * 0.9, by + PX * 0.45],
                           fill=(236, 232, 220, 255), outline=(70, 60, 46, 255), width=3)
                dr.ellipse([bx - PX * 0.4, by - PX * 0.22, bx + PX * 0.4, by + PX * 0.22],
                           fill=(120, 150, 168, 255))

    # scattered props around the town (crates, barrels, cars)
    town_poi = [p for p in world["pois"] if p["type"] in ("harbor", "town") and
                I0 * TILE < p["x"] < I1 * TILE and J0 * TILE < p["y"] < J1 * TILE]
    for poi in town_poi:
        for _ in range(26):
            ang = rng.random() * math.tau
            rad = rng.random() * PX * 9
            px, py = to_px(poi["x"] + math.cos(ang) * rad * TILE / PX,
                           poi["y"] + math.sin(ang) * rad * TILE / PX)
            kind = rng.random()
            if kind < 0.4:
                s = PX * 0.35
                dr.rectangle([px - s, py - s, px + s, py + s], fill=(122, 96, 62, 255),
                             outline=(58, 44, 30, 255), width=2)
            elif kind < 0.6:
                s = PX * 0.28
                dr.ellipse([px - s, py - s, px + s, py + s], fill=(96, 88, 78, 255),
                           outline=(50, 44, 38, 255), width=2)
            elif kind < 0.75:
                # car
                w2, h2 = PX * 0.9, PX * 0.45
                rot = rng.random() * math.pi
                cs, sn = math.cos(rot), math.sin(rot)
                pts = [(px + (-w2 * cs - -h2 * sn), py + (-w2 * sn + -h2 * cs)),
                       (px + (w2 * cs - -h2 * sn), py + (w2 * sn + -h2 * cs)),
                       (px + (w2 * cs - h2 * sn), py + (w2 * sn + h2 * cs)),
                       (px + (-w2 * cs - h2 * sn), py + (-w2 * sn + h2 * cs))]
                dr.polygon(pts, fill=(84, 96, 104, 255), outline=(34, 40, 44, 255))
            # palms near the waterfront
            if rng.random() < 0.25:
                rr = PX * 0.55
                dr.ellipse([px - rr * 0.4, py - rr * 0.2, px + rr * 0.4, py + rr * 0.4],
                           fill=(26, 20, 14, 110))
                for a in range(7):
                    th = a / 7 * math.tau + rng.random() * 0.3
                    dr.line([(px, py), (px + math.cos(th) * rr, py + math.sin(th) * rr)],
                            fill=(48, 86, 44, 255), width=max(2, int(PX * 0.16)))

    # ------------------------------------------------------------ grade
    arr = np.asarray(out.convert("RGB")).astype(np.float32)
    arr[..., 0] *= 1.045
    arr[..., 1] *= 1.005
    arr[..., 2] *= 0.955
    # warm sunlight from the north-west
    arr += np.array([12, 8, 0]) * (1 - np.clip((xx / W + yy / H) / 2, 0, 1))[..., None]
    # vignette
    vx = (xx / W - 0.5) * 2
    vy = (yy / H - 0.5) * 2
    vign = np.clip(1.12 - 0.30 * (vx ** 2 + vy ** 2), 0.55, 1.12)
    arr *= vign[..., None]
    # paper grain
    grain = (rng.random((H, W, 1)) - 0.5) * 6.0
    arr += grain
    final = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    final = final.filter(ImageFilter.UnsharpMask(radius=2.0, percent=45, threshold=2))

    os.makedirs(OUT, exist_ok=True)
    big = os.path.join(OUT, "harbor-art.png")
    final.save(big)
    print("harbour art ->", big, final.size)

    # close crop for judging surface detail
    cw = min(1200, W // 2)
    crop = final.crop((int(W * 0.18), int(H * 0.42), int(W * 0.18) + cw, int(H * 0.42) + cw))
    cpath = os.path.join(OUT, "harbor-art-close.png")
    crop.save(cpath)
    print("close crop ->", cpath, crop.size)


if __name__ == "__main__":
    main()
