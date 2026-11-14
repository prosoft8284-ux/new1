#!/usr/bin/env python3
"""
Art-directed terrain v2.

The old map grew out of noise, so it had no readable silhouette. This one is
built the way a level designer blocks out an island:

  * polar silhouette with authored bays and peninsulas
  * one volcanic massif + a NE-SW ridge spine + two secondary peaks
  * rivers that run from the peaks to the sea and carve valleys
  * an inland lagoon, a few offshore keys and a reef ring
  * roads: minimum spanning tree over the settlements, plus coastal spurs

Outputs fields + world json in the same shape the renderer and the game use.
"""

import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import minimum_spanning_tree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")

G = 768                    # field resolution
KM = 12.0                  # island world size in km
SEA = 0.30
PX_PER_TILE = 32
TILE_M = 27.5              # metres per tile (12 km / 384 tiles)


def value_noise(res, seed, shape=(G, G)):
    rng = np.random.default_rng(seed)
    gw = max(2, int(res * shape[1] / shape[0]))
    g = rng.random((int(res), gw)).astype(np.float32)
    img = Image.fromarray((g * 255).astype(np.uint8), "L").resize((shape[1], shape[0]), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0


def fbm(base, octaves, seed, gain=0.5, lac=2.0):
    out = np.zeros((G, G), np.float32)
    amp, res, norm = 1.0, base, 0.0
    for o in range(octaves):
        out += amp * value_noise(res, seed + 31 * o)
        norm += amp
        amp *= gain
        res *= lac
    return out / norm


def ridged(base, octaves, seed):
    out = np.zeros((G, G), np.float32)
    amp, res, norm = 1.0, base, 0.0
    for o in range(octaves):
        n = value_noise(res, seed + 71 * o)
        n = 1.0 - np.abs(n * 2 - 1)
        out += amp * n * n
        norm += amp
        amp *= 0.52
        res *= 2.1
    return out / norm


def main():
    yy, xx = np.mgrid[0:G, 0:G].astype(np.float32)
    cx, cy = G * 0.5, G * 0.5
    dx, dy = (xx - cx) / (G * 0.5), (yy - cy) / (G * 0.5)
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)

    # ---------------------------------------------------------- silhouette
    # radius per angle: authored bays (negative lobes) and peninsulas
    shape = (1.00
             + 0.20 * np.cos(2 * th + 0.6)
             + 0.13 * np.cos(3 * th - 1.4)
             + 0.09 * np.cos(5 * th + 2.2)
             + 0.05 * np.cos(7 * th - 0.7))
    warp = (fbm(3, 4, 5) - 0.5) * 0.22
    R = 0.80 * shape * (1.0 + warp)
    edge = r - R                       # <0 inside
    land_mask = edge < 0

    # soften the coast for beaches
    coast_t = np.clip(-edge / 0.06, 0, 1)

    # ------------------------------------------------------------- massif
    # central volcano with a crater, a NE-SW ridge and two side peaks
    def peak(px, py, radius, height):
        d = np.hypot(dx - px, dy - py) / radius
        return height * np.exp(-d * d * 2.2)

    massif = peak(-0.05, -0.10, 0.42, 0.620)
    massif += peak(0.28, -0.30, 0.24, 0.330)
    massif += peak(-0.34, 0.16, 0.22, 0.300)
    massif += peak(0.10, 0.34, 0.18, 0.230)

    # ridge along NE-SW
    ang = math.radians(38)
    ux, uy = math.cos(ang), math.sin(ang)
    along = dx * ux + dy * uy
    across = -dx * uy + dy * ux
    ridge = 0.36 * np.exp(-(across / 0.115) ** 2) * np.exp(-(along / 0.72) ** 2)
    massif = np.maximum(massif, ridge * (1.0 - np.clip(np.abs(along) / 0.9, 0, 1) * 0.4))

    rug = ridged(6, 5, 17)
    hills = 0.075 * (fbm(5, 4, 23) - 0.4) + 0.05 * (rug - 0.4)

    h = massif + hills * coast_t
    # coastal shelf: gentle slope into the sea
    h = h * coast_t
    h = h - (1.0 - coast_t) * 0.34

    # crater lake on the volcano
    crater_d = np.hypot(dx + 0.05, dy + 0.10) / 0.055
    crater = crater_d < 1.0
    h[crater] = SEA + 0.02

    # ------------------------------------------------------------- rivers
    # steepest descent from a handful of high sources to the sea
    rivers = np.zeros((G, G), np.float32)
    srcs = [(0.15, -0.28), (-0.22, -0.05), (0.02, 0.22), (-0.30, 0.24), (0.22, 0.10)]
    for (sx, sy) in srcs:
        x, y = int((sx * 0.5 + 0.5) * G), int((sy * 0.5 + 0.5) * G)
        for _ in range(1400):
            if not (0 <= x < G and 0 <= y < G) or h[y, x] < SEA + 0.002:
                break
            rivers[y, x] = 1.0
            best, bx, by = h[y, x], x, y
            for ax in (-1, 0, 1):
                for ay in (-1, 0, 1):
                    nx, ny = x + ax, y + ay
                    if 0 <= nx < G and 0 <= ny < G and h[ny, nx] < best:
                        best, bx, by = h[ny, nx], nx, ny
            if (bx, by) == (x, y):
                bx = x + (1 if math.cos(math.atan2(y - G / 2, x - G / 2)) > 0 else -1)
            x, y = bx, by

    rivers = ndimage.gaussian_filter(rivers, 1.2)
    river_wide = ndimage.maximum_filter(rivers, size=5)
    h = h - river_wide * 0.012
    moisture_boost = ndimage.gaussian_filter(river_wide, 22)

    # inland lagoon: a shallow basin near the south-east coast
    lag_d = np.hypot((dx - 0.30) / 0.20, (dy - 0.26) / 0.15)
    lagoon = lag_d < 1.0
    h[lagoon] = np.minimum(h[lagoon], SEA + 0.004)

    # --------------------------------------------------------------- keys
    for (kx, ky, kr) in ((1.06, -0.52, 0.15), (0.86, 0.42, 0.11), (-0.62, -0.86, 0.10),
                         (0.72, -0.78, 0.08)):
        d = np.hypot((dx - kx) / kr, (dy - ky) / kr)
        isl = d < 1.0
        bump = (1.0 - d) * 0.09 * isl
        h = np.maximum(h, bump + (SEA + 0.010) * isl)

    # ------------------------------------------------------------ biomes
    moist = (0.55 * fbm(4, 4, 41) + 0.25 * moisture_boost * 6.0
             + 0.20 * np.clip(1.0 - h * 2.2, 0, 1))
    moist = np.clip(moist + 0.10, 0, 1)
    land = h > SEA

    slope = np.hypot(*np.gradient(h)) * G / 12.0

    # tiles: 0 deep,1 water,2 shallow,3 reef,4 sand,5 wet sand,6 grass,7 jungle,
    #        8 dense jungle,9 dark jungle,10 dirt,11 rock,12 cliff,13 mountain,
    #        14 river,15 lake
    tiles = np.zeros((G, G), np.uint8)
    depth = SEA - h
    tiles[:] = 0
    tiles[depth < 0.16] = 1
    tiles[depth < 0.045] = 2
    tiles[depth < 0.014] = 3
    tiles[land] = 6
    tiles[land & (moist > 0.56)] = 7
    tiles[land & (moist > 0.68)] = 8
    tiles[land & (moist > 0.78)] = 9
    tiles[land & (h < SEA + 0.016)] = 4
    tiles[land & (h < SEA + 0.006)] = 5
    tiles[land & (slope > 0.9)] = 12
    tiles[land & (h > 0.50)] = 13
    tiles[land & (h > 0.40) & (h <= 0.50)] = 11
    tiles[river_wide > 0.25] = 14
    tiles[lagoon & ~land] = 15

    np.savez(os.path.join(MAP, "_fields_v2.npz"),
             h=h.astype(np.float32), moist=moist.astype(np.float32),
             land=land.astype(np.float32), slope=slope.astype(np.float32),
             tiles=tiles, rivers=river_wide.astype(np.float32))

    # ------------------------------------------------------------ POIs
    rng = np.random.default_rng(4242)
    names = [
        ("Kestrel Harbour", "harbor"), ("New Rutsu Town", "town"), ("Landing Beach", "village"),
        ("Rook Airstrip", "airstrip"), ("North Fuel Depot", "camp"), ("Signal Nest", "camp"),
        ("Ash Radio Tower", "tower"), ("Gull Point Light", "lighthouse"),
        ("Temple of the Tide", "ruins"), ("Alien Core", "alien"), ("Crashing Specter", "alien"),
        ("Wraith Gate", "alien"), ("Compound 12", "camp"), ("Mangrove Docks", "dock"),
        ("Twin Falls", "camp"), ("Ridge Radar", "tower"), ("Broken Tale", "ruins"),
        ("Elder Grove", "village"), ("Salt Marsh Camp", "camp"), ("Cache Ridge Trail", "camp"),
    ]
    pois = []
    used = []
    for i, (nm, typ) in enumerate(names):
        for _ in range(4000):
            x, y = rng.random() * G, rng.random() * G
            if not land[int(y), int(x)]:
                continue
            if typ in ("harbor", "town", "village", "dock") and h[int(y), int(x)] > SEA + 0.05:
                continue
            if typ == "alien" and h[int(y), int(x)] < 0.45:
                continue
            if typ in ("tower",) and h[int(y), int(x)] < 0.34:
                continue
            if any((x - ux) ** 2 + (y - uy) ** 2 < (G * 0.09) ** 2 for ux, uy in used):
                continue
            used.append((x, y))
            pois.append(dict(id=nm.lower().replace(" ", "_"), name=nm, type=typ,
                             x=float(x / G * 384 * PX_PER_TILE),
                             y=float(y / G * 384 * PX_PER_TILE)))
            break

    # roads: MST over settlements, plus spurs to camps
    pts = [(p["x"], p["y"]) for p in pois]
    n = len(pts)
    D = np.full((n, n), 1e12)
    for i in range(n):
        for j in range(n):
            if i != j:
                D[i, j] = math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
    mst = minimum_spanning_tree(coo_matrix(D)).toarray()
    roads = []
    for i in range(n):
        for j in range(n):
            if mst[i, j] > 0:
                roads.append(dict(kind="main",
                                  points=smooth_path(pts[i], pts[j], h, G)))
    for p in pois:
        if p["type"] in ("harbor", "town", "village", "camp", "airstrip"):
            tgt = min(pts, key=lambda q: (q[0] - p["x"]) ** 2 + (q[1] - p["y"]) ** 2)
            roads.append(dict(kind="dirt", points=smooth_path((p["x"], p["y"]), tgt, h, G)))

    world = dict(roads=roads, pois=pois,
                 regions=[dict(name="North Jungle", cx=384 * 16 * 12, cy=384 * 7 * 12),
                          dict(name="Alien Highlands", cx=384 * 18 * 12, cy=384 * 13 * 12),
                          dict(name="South Marsh", cx=384 * 20 * 12, cy=384 * 28 * 12)],
                 sea_level=SEA)
    with open(os.path.join(MAP, "world_v2.json"), "w", encoding="utf-8") as fh:
        json.dump(world, fh)

    # buildings for settlements
    blds = []
    for p in pois:
        if p["type"] not in ("town", "harbor", "village", "dock", "camp"):
            continue
        cnt = {"town": 90, "harbor": 70, "village": 26, "dock": 14, "camp": 10}[p["type"]]
        for _ in range(cnt):
            a = rng.random() * math.tau
            rad = rng.random() ** 0.6 * 520
            bx, by = p["x"] + math.cos(a) * rad, p["y"] + math.sin(a) * rad
            gx, gy = int(bx / (384 * PX_PER_TILE) * G), int(by / (384 * PX_PER_TILE) * G)
            if not (0 <= gx < G and 0 <= gy < G) or not land[gy, gx]:
                continue
            if h[gy, gx] < SEA + 0.006:
                continue
            blds.append(dict(x=bx, y=by, w=float(rng.integers(56, 150)),
                             h=float(rng.integers(56, 130)),
                             rot=float(rng.random() * 180),
                             style=str(rng.choice(["house", "house", "shop", "warehouse", "hut"]))))
    with open(os.path.join(MAP, "buildings_v2.json"), "w", encoding="utf-8") as fh:
        json.dump(blds, fh)

    print("fields ->", os.path.join(MAP, "_fields_v2.npz"))
    print("pois:", len(pois), "roads:", len(roads), "buildings:", len(blds))


def smooth_path(a, b, h, G):
    """Straight-ish path with a few midpoints nudged off the ridge lines."""
    out = []
    steps = 8
    for k in range(steps + 1):
        t = k / steps
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t
        if 0 < k < steps:
            gx, gy = int(x / (384 * PX_PER_TILE) * G), int(y / (384 * PX_PER_TILE) * G)
            if 0 <= gx < G and 0 <= gy < G and h[gy, gx] < SEA:
                # bend the road inland if it would cross water
                vx, vy = (y - a[1]), -(x - a[0])
                ln = math.hypot(vx, vy) or 1
                x += vx / ln * 300
                y += vy / ln * 300
        out.append([round(x, 1), round(y, 1)])
    return out


if __name__ == "__main__":
    main()
