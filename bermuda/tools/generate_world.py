#!/usr/bin/env python3
"""
Bermuda Occupied Island - open world map generator.

Builds a large, hand-shaped tropical island (Far Cry scale, top-down 2D) with:
  - authored coastline (metaballs + fractal warp)
  - elevation, ridges, volcano, cliffs, beaches
  - hydrology: downhill flow accumulation -> rivers, waterfalls
  - roads and trails routed with A* over terrain cost
  - landmarks / POIs (harbor town, villages, airstrip, ruins, caves, ...)
  - alien occupation: corrupted ground, craters, spires, camps
  - scatter props (palms, jungle trees, rocks, bushes, buildings, wrecks)
  - tileset PNG, Tiled TMX (ground + collision + objects), world.json, props.csv

Everything is deterministic from SEED.
"""

import csv
import heapq
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")

# ----------------------------------------------------------------------------
# constants
# ----------------------------------------------------------------------------
N = 384            # tiles per side
TILE = 32          # world pixels per tile
WORLD = N * TILE   # 12288 x 12288 world pixels
SEA = 0.30
SEED = 20261114

TILE_TYPES = [
    "deep_water",     # 0
    "water",          # 1
    "shallow",        # 2
    "reef",           # 3
    "sand",           # 4
    "wet_sand",       # 5
    "grass",          # 6
    "jungle",         # 7
    "dense_jungle",   # 8
    "jungle_dark",    # 9
    "dirt",           # 10
    "rock",           # 11
    "cliff",          # 12
    "mountain",       # 13
    "river",          # 14
    "marsh",          # 15
    "road",           # 16
    "trail",          # 17
    "concrete",       # 18
    "alien_ground",   # 19
    "crater",         # 20
    "ruins_floor",    # 21
    "dock",           # 22
    "bridge",         # 23
    "volcanic",       # 24
]
COLLISION_BLOCK = 50   # tileset index of the "blocked" marker tile
COLLISION_SLOW = 51    # tileset index of the "slow" marker tile
TILE_COUNT = 52

BLOCKED = {0, 1, 12, 13}
SLOW = {3, 5, 8, 15, 19, 20}

rng = np.random.default_rng(SEED)

# ----------------------------------------------------------------------------
# noise helpers
# ----------------------------------------------------------------------------


def value_noise(size, freq, r):
    f = max(1, int(freq))
    lat = r.random((f + 1, f + 1)).astype(np.float32)
    xs = np.linspace(0, f, size, endpoint=False, dtype=np.float32)
    ys = np.linspace(0, f, size, endpoint=False, dtype=np.float32)
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    fx = xs - x0
    fy = ys - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x1 = np.minimum(x0 + 1, f)
    y1 = np.minimum(y0 + 1, f)
    a = lat[np.ix_(y0, x0)]
    b = lat[np.ix_(y0, x1)]
    c = lat[np.ix_(y1, x0)]
    d = lat[np.ix_(y1, x1)]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(size, freq, octaves, r, gain=0.5, lac=2.0):
    total = np.zeros((size, size), np.float32)
    amp = 1.0
    norm = 0.0
    f = float(freq)
    for _ in range(octaves):
        total += value_noise(size, int(round(f)), r) * amp
        norm += amp
        amp *= gain
        f = min(f * lac, 190.0)
    return total / norm


def ridged(size, freq, octaves, r):
    return 1.0 - np.abs(fbm(size, freq, octaves, r) * 2.0 - 1.0)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def coords(size):
    u = np.linspace(0.0, 1.0, size, dtype=np.float32)
    return np.meshgrid(u, u, indexing="xy")


# ----------------------------------------------------------------------------
# authored island layout  (u = west->east, v = north->south, 0..1)
# ----------------------------------------------------------------------------
# main island body, north island and two islets
BLOBS = [
    (0.400, 0.505, 0.225, 1.00),
    (0.300, 0.345, 0.135, 0.88),
    (0.315, 0.705, 0.150, 0.90),
    (0.520, 0.250, 0.120, 0.78),
    (0.500, 0.790, 0.120, 0.82),
    (0.610, 0.560, 0.092, 0.66),
    (0.435, 0.885, 0.082, 0.60),
    (0.735, 0.180, 0.110, 0.62),   # north isle
    (0.860, 0.300, 0.050, 0.42),   # north islet
    (0.868, 0.690, 0.046, 0.38),   # east islet
]

# mountain massifs: (u, v, radius, strength)
MOUNTAINS = [
    (0.410, 0.455, 0.085, 1.00),   # central ridge (radio tower)
    (0.330, 0.585, 0.075, 0.85),   # temple ridge
    (0.355, 0.775, 0.070, 0.78),   # southern peak
    (0.520, 0.795, 0.060, 0.70),   # radar ridge
    (0.300, 0.560, 0.045, 0.45),   # volcano cone (west)
    (0.455, 0.360, 0.050, 0.55),   # north valley wall
    (0.740, 0.180, 0.070, 0.55),   # north isle hill
]

REGIONS = [
    ("harbor_district", "Kestrel Harbor", "بندر کسترل", 0.295, 0.520),
    ("old_quarter",     "Old Quarter",    "محله‌ی کهنه",  0.360, 0.455),
    ("green_jaw",       "Green Jaw Valley", "دره‌ی آرواره‌ی سبز", 0.445, 0.360),
    ("ash_ridge",       "Ash Ridge",      "یال خاکستر",   0.400, 0.590),
    ("south_wilds",     "Southern Wilds", "بیابان‌های جنوبی", 0.370, 0.730),
    ("east_cove",       "East Cove",      "خلیج شرقی",    0.560, 0.615),
    ("fallen_sky",      "Fallen Sky",     "آسمان‌افتاده",  0.630, 0.345),
    ("north_isle",      "North Isle",     "جزیره‌ی شمالی", 0.735, 0.180),
    ("emerald_shoal",   "Emerald Shoal",  "تپه‌ی زمرد",    0.865, 0.690),
]

ALIEN_ZONES = [
    ("fallen_sky_core", "Fallen Sky Core", "هسته‌ی آسمان‌افتاده", 0.635, 0.330, 0.085),
    ("green_jaw_scar",  "Green Jaw Scar",  "زخم آرواره‌ی سبز",   0.470, 0.290, 0.055),
    ("south_rift",      "Southern Rift",   "شکاف جنوبی",        0.360, 0.800, 0.060),
    ("east_landing",    "East Landing",    "فرودگاه شرقی",      0.645, 0.640, 0.045),
]

# alien bestiary: the eight species shown on the model sheet, assigned to home zones
SPECIES = [
    dict(id="runner", name="Spiked Runner", fa="خاردار رانده", tier=1,
         role="سریع و چابک؛ به صورت گروهی حمله می‌کند.",
         zones=["green_jaw_scar", "south_rift", "east_landing"]),
    dict(id="brute", name="Armored Warrior", fa="جنگجوی زره‌پوش", tier=3,
         role="ضربات سنگین و مقاومت بالا؛ به سلاح نفوذی نیاز دارد.",
         zones=["fallen_sky_core", "south_rift", "green_jaw_scar"]),
    dict(id="jelly", name="Nerve Drifter", fa="عضبان", tier=2,
         role="از راه دور حمله می‌کند و ذهن را مختل می‌کند.",
         zones=["fallen_sky_core", "east_landing"]),
    dict(id="flyer", name="Winged", fa="بالزن", tier=2,
         role="از بالا حمله می‌کند و در هوا حرکت می‌کند.",
         zones=["east_landing", "fallen_sky_core"]),
    dict(id="parasite", name="Leech", fa="انگل‌زن", tier=1,
         role="به بدن می‌چسبد و به‌تدریج سلامتی را کاهش می‌دهد.",
         zones=["green_jaw_scar", "east_landing"]),
    dict(id="mutant", name="Flesh-grown", fa="جهش‌یافته", tier=2,
         role="از کشته‌ها برمی‌خیزد و با حمله‌ی اسیدی آسیب می‌زند.",
         zones=["south_rift", "green_jaw_scar"]),
    dict(id="mage", name="Alien Warlock", fa="جادوگر بیگانه", tier=4,
         role="از قدرت‌های کیهانی استفاده می‌کند؛ سپر و تله.",
         zones=["fallen_sky_core"]),
    dict(id="mother", name="Mother Creature", fa="موجود مادر", tier=5,
         role="باس اصلی بازی؛ چند مرحله‌ی مبارزه.",
         zones=["fallen_sky_core"]),
]

ZONE_SPAWNS = {
    "fallen_sky_core": {"brute": 2, "jelly": 3, "mage": 2, "flyer": 1, "mother": 1},
    "green_jaw_scar": {"runner": 4, "parasite": 2, "mutant": 1, "brute": 1},
    "south_rift": {"brute": 2, "mutant": 3, "runner": 3},
    "east_landing": {"flyer": 3, "jelly": 2, "parasite": 2, "runner": 1},
}

# POIs: id, name, persian, type, u, v, danger, region
POI_SPEC = [
    ("harbor", "Kestrel Harbor", "بندر کسترل", "harbor", 0.288, 0.518, 3, "harbor_district"),
    ("old_quarter", "Old Quarter", "محله‌ی کهنه", "town", 0.356, 0.452, 2, "old_quarter"),
    ("village_north", "Green Jaw Village", "روستای آرواره‌ی سبز", "village", 0.452, 0.372, 2, "green_jaw"),
    ("village_south", "Mango Creek", "نهر انبه", "village", 0.392, 0.688, 2, "south_wilds"),
    ("village_east", "Cove Town", "شهر خلیج", "village", 0.552, 0.628, 3, "east_cove"),
    ("airstrip", "Rook Airstrip", "باند فرودگاه روک", "airstrip", 0.474, 0.246, 4, "green_jaw"),
    ("lighthouse", "Gull Point Light", "فانوس دریایی دماغه‌ی مرغابی", "lighthouse", 0.243, 0.330, 1, "harbor_district"),
    ("radio_tower", "Ash Radio Tower", "برج رادیویی خاکستر", "radio_tower", 0.408, 0.452, 3, "ash_ridge"),
    ("radar", "Ridge Radar", "رادار یال", "radar", 0.524, 0.792, 4, "south_wilds"),
    ("ruins", "Temple of the Tide", "معبد جزر و مد", "ruins", 0.332, 0.590, 3, "ash_ridge"),
    ("cave_west", "Kiln Cave", "غار کوره", "cave", 0.300, 0.640, 2, "south_wilds"),
    ("cave_ridge", "Whisper Cave", "غار نجوا", "cave", 0.430, 0.545, 3, "ash_ridge"),
    ("cave_north", "Smugglers Cave", "غار قاچاقچی‌ها", "cave", 0.505, 0.352, 3, "green_jaw"),
    ("waterfall", "Veil Falls", "آبشار پرده", "waterfall", 0.398, 0.520, 1, "ash_ridge"),
    ("waterfall_south", "Twin Falls", "آبشار دوقلو", "waterfall", 0.365, 0.758, 1, "south_wilds"),
    ("shipwreck", "The Cormorant", "کشتی کورمورانت", "shipwreck", 0.600, 0.470, 2, "east_cove"),
    ("mine", "Old Sulphur Mine", "معدن گوگرد قدیمی", "mine", 0.286, 0.735, 3, "south_wilds"),
    ("fuel_depot", "North Fuel Depot", "انبار سوخت شمالی", "fuel_depot", 0.512, 0.296, 4, "green_jaw"),
    ("lookout", "Kite Lookout", "دیده‌بانی بادبادک", "lookout", 0.560, 0.238, 2, "green_jaw"),
    ("spawn", "Landing Beach", "ساحل پیاده‌سازی", "beach_landing", 0.300, 0.418, 1, "harbor_district"),
    ("outpost", "Compound 12", "کمپ ۱۲", "outpost", 0.452, 0.622, 4, "ash_ridge"),
    ("bridge_north", "North Causeway", "جاده‌ی شمالی", "bridge", 0.640, 0.212, 2, "north_isle"),
    ("alien_spire", "The Spire", "مناره", "alien_spire", 0.638, 0.330, 5, "fallen_sky"),
    ("alien_spire_south", "Bone Spire", "مناره‌ی استخوانی", "alien_spire", 0.352, 0.804, 5, "south_wilds"),
    ("alien_camp_north", "Harvest Camp", "کمپ برداشت", "alien_camp", 0.520, 0.318, 4, "fallen_sky"),
    ("alien_camp_mid", "Drill Site Theta", "سایت حفاری تتا", "alien_camp", 0.470, 0.288, 4, "green_jaw"),
    ("alien_camp_east", "Signal Nest", "آشیانه‌ی سیگنال", "alien_camp", 0.652, 0.642, 3, "east_cove"),
    ("crash_north", "Fallen Needle", "سوزن افتاده", "alien_crash", 0.712, 0.212, 4, "north_isle"),
    ("crash_south", "Broken Halo", "هاله‌ی شکسته", "alien_crash", 0.478, 0.702, 4, "south_wilds"),
    ("cache_west", "Cache: Harbour Road", "انبار: جاده‌ی بندر", "cache", 0.322, 0.472, 1, "harbor_district"),
    ("cache_ridge", "Cache: Ridge Trail", "انبار: راه یال", "cache", 0.398, 0.492, 2, "ash_ridge"),
    ("cache_east", "Cache: Cove Trail", "انبار: راه خلیج", "cache", 0.528, 0.582, 2, "east_cove"),
    ("cache_south", "Cache: Mango Creek", "انبار: نهر انبه", "cache", 0.372, 0.652, 1, "south_wilds"),
    ("dock_east", "Cove Docks", "اسکله‌ی خلیج", "dock", 0.566, 0.612, 2, "east_cove"),
]

# roads: (from, to, kind)  kind: main (gravel road) / trail (dirt)
ROAD_SPEC = [
    ("harbor", "old_quarter", "main"),
    ("old_quarter", "village_north", "main"),
    ("village_north", "airstrip", "main"),
    ("airstrip", "fuel_depot", "main"),
    ("fuel_depot", "alien_camp_north", "trail"),
    ("old_quarter", "outpost", "main"),
    ("outpost", "village_east", "main"),
    ("village_east", "dock_east", "trail"),
    ("old_quarter", "ruins", "trail"),
    ("ruins", "cave_ridge", "trail"),
    ("outpost", "village_south", "trail"),
    ("village_south", "mine", "trail"),
    ("village_south", "alien_spire_south", "trail"),
    ("harbor", "spawn", "trail"),
    ("harbor", "lighthouse", "trail"),
    ("old_quarter", "radio_tower", "trail"),
    ("village_east", "radar", "trail"),
    ("village_north", "cave_north", "trail"),
    ("lookout", "bridge_north", "main"),
    ("airstrip", "lookout", "trail"),
    ("alien_camp_mid", "alien_camp_north", "trail"),
    ("crash_north", "bridge_north", "trail"),
    ("cache_west", "old_quarter", "trail"),
]

# ship / boat names etc are in POI_SPEC
# ----------------------------------------------------------------------------


def build_fields():
    u, v = coords(N)

    # ---- coastline -----------------------------------------------------
    field = np.zeros((N, N), np.float32)
    for (bu, bv, br, bs) in BLOBS:
        d2 = ((u - bu) ** 2 + (v - bv) ** 2) / (br * br)
        field += bs * np.exp(-d2 * 1.35)
    warp = (fbm(N, 6, 4, rng) - 0.5) * 0.40 + (fbm(N, 20, 3, rng) - 0.5) * 0.12
    field = field + warp
    land = field > 0.36

    # keep only the largest few components (drop noise islands)
    lbl, nlab = ndimage.label(land)
    sizes = ndimage.sum(land, lbl, range(1, nlab + 1))
    keep = np.zeros(nlab + 1, bool)
    for idx in np.argsort(sizes)[::-1][:4]:
        if sizes[idx] > 250:
            keep[idx + 1] = True
    land = keep[lbl]

    # ---- elevation -----------------------------------------------------
    ridge = ridged(N, 6, 5, rng)
    base = fbm(N, 4, 5, rng)
    spine = np.zeros((N, N), np.float32)
    for (bu, bv, br, bs) in MOUNTAINS:
        spine += bs * np.exp((((u - bu) ** 2 + (v - bv) ** 2) / (br * br)) * -1.7)
    spine = np.clip(spine, 0.0, 1.0)
    spine = ndimage.gaussian_filter(spine, 1.8)
    land_h = 0.16 * base + spine * (0.40 + 0.55 * ridge)
    land_h = ndimage.gaussian_filter(land_h, 1.2)

    # coast shelf: sea floor falls away from the shore
    dist_out = ndimage.distance_transform_edt(~land)
    sea_h = SEA - 0.045 - np.clip(dist_out / 46.0, 0.0, 1.0) * 0.40
    sea_h = ndimage.gaussian_filter(sea_h, 1.2)

    shore = smoothstep(0.36, 0.58, field)
    h = np.where(land, SEA + 0.006 + shore * (0.055 + 0.62 * land_h), sea_h)
    h = ndimage.gaussian_filter(h, 0.8)

    # ---- slope / moisture ---------------------------------------------
    gy, gx = np.gradient(h)
    slope = np.hypot(gx, gy)   # height change per tile: 0.02 gentle, 0.08 steep

    moist = 0.50 + (fbm(N, 4, 4, rng) - 0.5) * 0.55
    moist += np.clip(1.0 - dist_out / 45.0, 0.0, 1.0) * 0.10   # humid coast
    moist -= np.clip((h - SEA - 0.30) / 0.42, 0.0, 1.0) * 0.18  # dry peaks only
    moist = np.clip(moist, 0.0, 1.0)

    # ---- hydrology: downhill accumulation ------------------------------
    flat_h = h.ravel().astype(np.float64)
    flat_land = land.ravel()
    order = np.argsort(-flat_h, kind="stable")
    acc = np.ones(N * N, np.float32)
    accv = acc  # view into contiguous array
    for k in order:
        if not flat_land[k]:
            continue
        j, i = divmod(int(k), N)
        cur = flat_h[k]
        best = -1
        bestdrop = 1e-7
        for dj in (-1, 0, 1):
            nj = j + dj
            if nj < 0 or nj >= N:
                continue
            for di in (-1, 0, 1):
                if di == 0 and dj == 0:
                    continue
                ni = i + di
                if ni < 0 or ni >= N:
                    continue
                kk = nj * N + ni
                drop = cur - flat_h[kk]
                if drop > bestdrop:
                    bestdrop = drop
                    best = kk
        if best >= 0:
            accv[best] += accv[k]
    acc = accv.reshape(N, N)
    land_acc = acc[land]
    thr_river = float(np.quantile(land_acc, 0.9915))
    thr_stream = float(np.quantile(land_acc, 0.972))
    river = (acc > thr_river) & land & (h > SEA + 0.012)
    stream = (acc > thr_stream) & ~river & land & (h > SEA + 0.012)

    # rivers cut a shallow valley
    h = np.where(river, h - 0.018, h)
    # moisture rises near rivers
    river_near = ndimage.distance_transform_edt(~river)
    moist = np.clip(moist + np.clip(1.0 - river_near / 9.0, 0.0, 1.0) * 0.18, 0.0, 1.0)

    # marsh: flat, wet, low land
    flatness = 1.0 - np.clip(slope * 3.0, 0.0, 1.0)
    marsh = land & (h < SEA + 0.05) & (moist > 0.80) & (flatness > 0.72) & ~river
    marsh = ndimage.binary_opening(marsh)

    # volcano crater
    cone_u, cone_v, cone_r = 0.300, 0.560, 0.022
    cd = np.sqrt((u - cone_u) ** 2 + (v - cone_v) ** 2)
    volcanic = land & (cd < cone_r)
    # crater rim depression
    h = np.where(land & (cd < cone_r * 0.55), h - 0.05, h)

    return dict(
        u=u, v=v, field=field, land=land, h=h, slope=slope, moist=moist,
        river=river, stream=stream, marsh=marsh, volcanic=volcanic,
        acc=acc, dist_out=dist_out,
    )


# ----------------------------------------------------------------------------
# POIs
# ----------------------------------------------------------------------------


def find_tile(pred, i0, j0, max_ring=70):
    if 0 <= i0 < N and 0 <= j0 < N and pred(i0, j0):
        return i0, j0
    for ring in range(1, max_ring):
        for dj in range(-ring, ring + 1):
            for di in range(-ring, ring + 1):
                if max(abs(di), abs(dj)) != ring:
                    continue
                i, j = i0 + di, j0 + dj
                if 0 <= i < N and 0 <= j < N and pred(i, j):
                    return i, j
    return i0, j0


def place_pois(f):
    land, h, river = f["land"], f["h"], f["river"]
    pois = []
    for (pid, name, fa, ptype, pu, pv, danger, region) in POI_SPEC:
        i0 = int(round(pu * N))
        j0 = int(round(pv * N))

        if ptype in ("harbor", "dock"):
            def pred(i, j):
                return (land[j, i] and SEA - 0.10 < h[j, i] < SEA + 0.06
                        and ndimage_val(f, i, j) > 0)
        elif ptype in ("lighthouse", "shipwreck", "beach_landing"):
            def pred(i, j):
                return land[j, i] and h[j, i] < SEA + 0.06
        elif ptype == "airstrip":
            def pred(i, j):
                return land[j, i] and h[j, i] < SEA + 0.14 and f["slope"][j, i] < 0.015
        elif ptype in ("radio_tower", "radar", "lookout"):
            def pred(i, j):
                return land[j, i] and h[j, i] > SEA + 0.30
        elif ptype == "cave":
            def pred(i, j):
                return land[j, i] and SEA + 0.06 < h[j, i] < SEA + 0.22
        elif ptype == "waterfall":
            def pred(i, j):
                return bool(river[j, i])
        elif ptype in ("cache", "outpost", "alien_camp", "alien_crash"):
            def pred(i, j):
                return land[j, i] and h[j, i] > SEA + 0.03
        else:
            def pred(i, j):
                return land[j, i] and h[j, i] > SEA + 0.02

        i, j = find_tile(pred, i0, j0)
        pois.append(dict(
            id=pid, name=name, fa=fa, type=ptype, danger=danger, region=region,
            u=i / N, v=j / N,
            x=int(i * TILE + TILE // 2), y=int(j * TILE + TILE // 2),
            tile=[i, j],
        ))

    # harbour wants a little coastline strip: shift a few tiles seaward for docks
    return pois


def ndimage_val(f, i, j):
    # helper: how water-like is the neighbourhood of a tile (for harbour placement)
    h = f["h"]
    j0, j1 = max(0, j - 4), min(N, j + 5)
    i0, i1 = max(0, i - 4), min(N, i + 5)
    return float((h[j0:j1, i0:i1] < SEA).mean())


# ----------------------------------------------------------------------------
# roads
# ----------------------------------------------------------------------------


def astar(cost, start, goal):
    hh, ww = cost.shape
    openh = [(0.0, start)]
    g = {start: 0.0}
    came = {}
    seen = set()
    while openh:
        _, cur = heapq.heappop(openh)
        if cur in seen:
            continue
        seen.add(cur)
        if cur == goal:
            break
        cx, cy = cur
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = cx + dx, cy + dy
                if not (0 <= nx < ww and 0 <= ny < hh):
                    continue
                step = cost[ny, nx] * (1.4142 if dx and dy else 1.0)
                if not np.isfinite(step) or step > 900:
                    continue
                ng = g[cur] + step
                if ng < g.get((nx, ny), 1e18):
                    g[(nx, ny)] = ng
                    came[(nx, ny)] = cur
                    # tiny tie-breaker so the search prefers straight lines
                    heapq.heappush(openh, (ng + math.hypot(nx - goal[0], ny - goal[1]) * 1.01, (nx, ny)))
    if goal not in came:
        return []
    path = [goal]
    while path[-1] != start:
        p = came.get(path[-1])
        if p is None:
            return []
        path.append(p)
    return path[::-1]


def chaikin(points, iterations=3):
    """Corner-cutting smoothing so roads read as curves instead of staircases."""
    pts = [(float(x), float(y)) for (x, y) in points]
    for _ in range(iterations):
        if len(pts) < 3:
            break
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        out.append(pts[-1])
        pts = out
    return [(round(x, 1), round(y, 1)) for (x, y) in pts]


def route_roads(f, pois):
    land, h, slope, river = f["land"], f["h"], f["slope"], f["river"]
    S = 4
    M = N // S
    hc = h[::S, ::S]
    sc = slope[::S, ::S]
    rc = river[::S, ::S]
    lc = land[::S, ::S]
    water = hc < SEA - 0.02
    cost = 1.0 + sc * 45.0 + rc * 7.0
    cost = np.where(water, 260.0, cost)
    cost = np.where(~lc, 260.0, cost)

    by_id = {p["id"]: p for p in pois}
    road_mask = np.zeros((N, N), np.uint8)   # 1 = main, 2 = trail
    road_paths = []

    for (a, b, kind) in ROAD_SPEC:
        if a not in by_id or b not in by_id:
            continue
        pa, pb = by_id[a], by_id[b]
        sa = (int(pa["tile"][0] / S), int(pa["tile"][1] / S))
        sb = (int(pb["tile"][0] / S), int(pb["tile"][1] / S))
        path = astar(cost, sa, sb)
        if not path:
            print(f"  ! no route {a} -> {b}")
            continue
        rough = [(x * S * TILE + TILE / 2, y * S * TILE + TILE / 2) for (x, y) in path]
        pts = chaikin(rough, 3)
        road_paths.append(dict(id=f"{a}__{b}", a=a, b=b, kind=kind,
                               points=[[p[0], p[1]] for p in pts]))
        mask = Image.fromarray(np.zeros((WORLD // TILE, WORLD // TILE), np.uint8))
        dr = ImageDraw.Draw(mask)
        width = 3 if kind == "main" else 2
        dr.line([(p[0] / TILE, p[1] / TILE) for p in pts], fill=1, width=width, joint="curve")
        arr = np.asarray(mask)
        if kind == "main":
            road_mask = np.maximum(road_mask, (arr > 0).astype(np.uint8))
        else:
            road_mask = np.where(road_mask == 0, (arr > 0).astype(np.uint8) * 2, road_mask).astype(np.uint8)
    return road_mask, road_paths


# ----------------------------------------------------------------------------
# alien occupation, airfield, buildings
# ----------------------------------------------------------------------------


def alien_fields(f, pois):
    u, v = f["u"], f["v"]
    land = f["land"]
    corrupted = np.zeros((N, N), bool)
    crater = np.zeros((N, N), bool)
    for (zid, name, fa, zu, zv, zr) in ALIEN_ZONES:
        d = np.sqrt((u - zu) ** 2 + (v - zv) ** 2) / (zr * 0.88)
        n = fbm(N, 9, 3, rng)
        blob = (d + (n - 0.5) * 0.45) < 1.0
        corrupted |= blob & land
    corrupted = ndimage.binary_opening(corrupted, iterations=1)

    yy, xx = np.mgrid[0:N, 0:N]
    for p in pois:
        if p["type"] not in ("alien_spire", "alien_camp", "alien_crash"):
            continue
        i, j = p["tile"]
        rad = {"alien_spire": 9, "alien_camp": 6, "alien_crash": 11}[p["type"]]
        d2 = (xx - i) ** 2 + (yy - j) ** 2
        crater |= d2 <= rad * rad
        corrupted |= d2 <= (rad + 3) ** 2
    crater &= land
    corrupted = (corrupted | crater) & land
    return corrupted, crater


def airfield_mask(pois):
    mask = np.zeros((N, N), np.uint8)
    for p in pois:
        if p["type"] != "airstrip":
            continue
        i, j = p["tile"]
        img = Image.fromarray(mask)
        dr = ImageDraw.Draw(img)
        # runway: 46 x 9 tiles, angled a few degrees
        cx, cy = i, j
        ang = math.radians(-8)
        L, W = 23, 4.5
        dx, dy = math.cos(ang), math.sin(ang)
        px, py = -dy, dx
        corners = []
        for (a, b) in ((-L, -W), (L, -W), (L, W), (-L, W)):
            corners.append((cx + dx * a + px * b, cy + dy * a + py * b))
        dr.polygon(corners, fill=1)
        # apron + taxi area
        dr.rectangle([cx - 6, cy + 4, cx + 6, cy + 11], fill=1)
        mask = np.asarray(img)
    return mask.astype(np.uint8)


# ----------------------------------------------------------------------------
# tile classification
# ----------------------------------------------------------------------------


def classify(f, pois, road_mask, airfield, corrupted, crater):
    land, h, moist, slope = f["land"], f["h"], f["moist"], f["slope"]
    river, marsh, volcanic = f["river"], f["marsh"], f["volcanic"]
    depth = SEA - h
    t = np.full((N, N), 6, np.uint8)          # default: grass

    # ---- ocean ---------------------------------------------------------
    t[(depth > 0.135)] = 0
    t[(depth > 0.045) & (depth <= 0.135)] = 1
    t[(depth > 0.008) & (depth <= 0.045)] = 2
    t[(depth > 0) & (depth <= 0.008)] = 3

    # ---- beach: measured from the waterline ----------------------------
    inland = ndimage.distance_transform_edt(land)
    t[land & (inland <= 2.0)] = 5              # wet sand
    t[land & (inland > 2.0) & (inland <= 6.5)] = 4

    # ---- lowland biomes by moisture ------------------------------------
    low = land & (inland > 6.5)
    t[low & (moist < 0.36)] = 10               # dry scrub / dirt
    t[low & (moist >= 0.36) & (moist < 0.47)] = 6
    t[low & (moist >= 0.47) & (moist < 0.60)] = 7
    t[low & (moist >= 0.60)] = 8
    canopy = ndimage.gaussian_filter(fbm(N, 10, 3, rng), 1.0)
    t[(t == 8) & (canopy > 0.53)] = 9

    # ---- high ground and rock faces ------------------------------------
    t[land & (h >= SEA + 0.30)] = 11           # bare rock
    t[land & (h >= SEA + 0.46)] = 13           # mountain
    t[land & (slope > 0.080) & (h > SEA + 0.10)] = 12
    t[land & (slope > 0.050) & (h > SEA + 0.24)] = 12

    # ---- water features ------------------------------------------------
    t[river & land] = 14
    t[marsh & land] = 15
    t[volcanic & land] = 24

    # ---- artificial ----------------------------------------------------
    t[road_mask == 1] = 16
    t[road_mask == 2] = 17
    t[airfield > 0] = 18
    t[corrupted & land] = 19
    t[crater & land] = 20

    # bridge wherever a road crosses water or a river
    wet = (t <= 3) | (t == 14)
    t[(road_mask > 0) & wet] = 23

    # ---- POI grounds ---------------------------------------------------
    for p in pois:
        i, j = p["tile"]
        if p["type"] == "harbor":
            y0, y1 = max(0, j - 14), min(N, j + 14)
            x0, x1 = max(0, i - 12), min(N, i + 12)
            t[y0:y1, x0:x1] = np.where(t[y0:y1, x0:x1] <= 3, 22, 18)
        if p["type"] in ("town", "village", "outpost", "fuel_depot", "airstrip", "dock"):
            y0, y1 = max(0, j - 7), min(N, j + 7)
            x0, x1 = max(0, i - 7), min(N, i + 7)
            sub = t[y0:y1, x0:x1]
            sub[(sub >= 4) & (sub <= 10)] = 10
            sub[(sub == 11) | (sub == 12)] = 10
        if p["type"] == "ruins":
            y0, y1 = max(0, j - 6), min(N, j + 6)
            x0, x1 = max(0, i - 6), min(N, i + 6)
            t[y0:y1, x0:x1] = 21
        if p["type"] in ("alien_spire", "alien_camp", "alien_crash"):
            y0, y1 = max(0, j - 3), min(N, j + 3)
            x0, x1 = max(0, i - 3), min(N, i + 3)
            t[y0:y1, x0:x1] = 20
    return t


def collision_from_tiles(t):
    c = np.zeros((N, N), np.uint8)
    for v in BLOCKED:
        c[t == v] = 1
    for v in SLOW:
        c[(t == v)] = 2
    return c


# ----------------------------------------------------------------------------
# props (vegetation, buildings, debris)
# ----------------------------------------------------------------------------


def make_buildings(pois, rng_local):
    out = []
    for p in pois:
        i, j = p["tile"]
        if p["type"] in ("town", "harbor"):
            count, radius, styles = 26, 13, ("house", "shop", "warehouse")
        elif p["type"] in ("village",):
            count, radius, styles = 13, 9, ("hut", "hut", "house")
        elif p["type"] in ("outpost", "fuel_depot"):
            count, radius, styles = 9, 7, ("warehouse", "hut")
        elif p["type"] == "airstrip":
            count, radius, styles = 5, 10, ("warehouse", "tower")
        elif p["type"] == "dock":
            count, radius, styles = 4, 5, ("warehouse",)
        elif p["type"] in ("ruins",):
            count, radius, styles = 7, 6, ("temple",)
        elif p["type"] in ("alien_camp", "alien_spire"):
            count, radius, styles = 5, 6, ("alien_pod",)
        elif p["type"] == "mine":
            count, radius, styles = 4, 5, ("warehouse", "tower")
        else:
            count, radius, styles = 0, 0, ()

        placed = 0
        tries = 0
        while placed < count and tries < count * 30:
            tries += 1
            ang = rng_local.random() * math.tau
            rad = (0.35 + 0.65 * math.sqrt(rng_local.random())) * radius
            bi = i + math.cos(ang) * rad
            bj = j + math.sin(ang) * rad
            # keep clear of the POI centre so the road/plaza stays open
            if abs(bi - i) < 1.5 and abs(bj - j) < 1.5:
                continue
            style = styles[int(rng_local.integers(0, len(styles)))]
            if style == "hut":
                w, hh = rng_local.integers(2, 4), rng_local.integers(2, 4)
                rot = int(rng_local.integers(0, 4)) * 90
            elif style == "house":
                w, hh = rng_local.integers(3, 6), rng_local.integers(3, 5)
                rot = int(rng_local.integers(0, 4)) * 90
            elif style == "shop":
                w, hh = rng_local.integers(4, 7), rng_local.integers(3, 5)
                rot = int(rng_local.integers(0, 4)) * 90
            elif style == "warehouse":
                w, hh = rng_local.integers(6, 11), rng_local.integers(4, 7)
                rot = int(rng_local.integers(0, 2)) * 90
            elif style == "tower":
                w, hh = 3, 3
                rot = 0
            elif style == "temple":
                w, hh = rng_local.integers(3, 6), rng_local.integers(3, 6)
                rot = int(rng_local.integers(0, 4)) * 90
            else:
                w, hh = rng_local.integers(2, 5), rng_local.integers(2, 5)
                rot = int(rng_local.integers(0, 8)) * 45
            out.append(dict(
                x=int(bi * TILE + TILE / 2), y=int(bj * TILE + TILE / 2),
                type="building", style=style, rot=rot,
                w=int(w * TILE), h=int(hh * TILE),
            ))
            placed += 1
    return out


def make_props(f, t, pois, buildings, rng_local):
    land = f["land"]
    h, moist, slope = f["h"], f["moist"], f["slope"]
    props = []

    # vegetation on every jungle / grass / sand tile
    for j in range(N):
        for i in range(N):
            if not land[j, i]:
                continue
            tv = t[j, i]
            x = int(i * TILE + rng_local.integers(4, TILE - 4))
            y = int(j * TILE + rng_local.integers(4, TILE - 4))
            r = rng_local.random()
            if tv == 8:      # dense jungle
                if r < 0.85:
                    props.append((x, y, "tree", int(rng_local.integers(0, 360)), int(rng_local.integers(90, 130))))
                elif r < 0.95:
                    props.append((x, y, "bush", int(rng_local.integers(0, 360)), 100))
            elif tv == 7:    # jungle
                if r < 0.55:
                    props.append((x, y, "tree", int(rng_local.integers(0, 360)), int(rng_local.integers(85, 120))))
                elif r < 0.75:
                    props.append((x, y, "bush", int(rng_local.integers(0, 360)), 100))
                elif r < 0.80:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), 90))
            elif tv == 9:    # shaded undergrowth
                if r < 0.45:
                    props.append((x, y, "bush", int(rng_local.integers(0, 360)), 100))
                elif r < 0.55:
                    props.append((x, y, "tree", int(rng_local.integers(0, 360)), 80))
            elif tv == 6:    # grass
                if r < 0.10:
                    props.append((x, y, "tree", int(rng_local.integers(0, 360)), int(rng_local.integers(80, 105))))
                elif r < 0.24:
                    props.append((x, y, "grass", int(rng_local.integers(0, 360)), 100))
                elif r < 0.30:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), 85))
            elif tv in (4, 5):   # beach
                if r < 0.055:
                    props.append((x, y, "palm", int(rng_local.integers(0, 360)), int(rng_local.integers(85, 115))))
                elif r < 0.075:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), 70))
            elif tv in (11, 13):  # rock / mountain
                if r < 0.045:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), int(rng_local.integers(75, 120))))
            elif tv == 12:   # cliff
                if r < 0.09:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), int(rng_local.integers(90, 150))))
            elif tv == 10:   # dirt
                if r < 0.05:
                    props.append((x, y, "grass", int(rng_local.integers(0, 360)), 80))
                elif r < 0.07:
                    props.append((x, y, "rock", int(rng_local.integers(0, 360)), 80))
            elif tv == 15:   # marsh
                if r < 0.30:
                    props.append((x, y, "reed", int(rng_local.integers(0, 360)), 100))
            elif tv == 19:   # alien ground
                if r < 0.030:
                    props.append((x, y, "crystal", int(rng_local.integers(0, 360)), int(rng_local.integers(70, 120))))
            elif tv == 20:   # crater
                if r < 0.05:
                    props.append((x, y, "debris", int(rng_local.integers(0, 360)), 100))
                elif r < 0.075:
                    props.append((x, y, "crystal", int(rng_local.integers(0, 360)), 80))
            elif tv == 21:   # ruins floor
                if r < 0.08:
                    props.append((x, y, "column", int(rng_local.integers(0, 360)), 100))

    # landmark props
    for p in pois:
        i, j = p["tile"]
        x, y = p["x"], p["y"]
        if p["type"] == "radio_tower":
            props.append((x, y, "tower", 0, 120))
        elif p["type"] == "radar":
            props.append((x, y, "radar", 0, 120))
        elif p["type"] == "lighthouse":
            props.append((x, y, "lighthouse", 0, 120))
        elif p["type"] == "alien_spire":
            props.append((x, y, "spire", int(rng_local.integers(0, 360)), 140))
        elif p["type"] == "alien_crash":
            props.append((x, y, "wreck", int(rng_local.integers(0, 360)), 130))
        elif p["type"] == "shipwreck":
            props.append((x, y, "shipwreck", int(rng_local.integers(0, 360)) + 30, 120))
        elif p["type"] == "mine":
            props.append((x, y, "mine_head", 0, 120))
        elif p["type"] == "waterfall":
            props.append((x, y, "falls", 0, 110))

    return props


# ----------------------------------------------------------------------------
# outputs: tileset, TMX, json, csv
# ----------------------------------------------------------------------------

TILE_COLORS = {
    "deep_water": (14, 36, 62), "water": (20, 74, 104), "shallow": (46, 140, 152),
    "reef": (96, 178, 168), "sand": (222, 205, 156), "wet_sand": (196, 178, 132),
    "grass": (128, 152, 84), "jungle": (62, 104, 52), "dense_jungle": (42, 82, 44),
    "jungle_dark": (30, 60, 38), "dirt": (150, 124, 86), "rock": (122, 114, 102),
    "cliff": (94, 86, 78), "mountain": (112, 106, 98), "river": (58, 132, 150),
    "marsh": (88, 106, 72), "road": (176, 150, 108), "trail": (156, 132, 94),
    "concrete": (150, 148, 142), "alien_ground": (86, 44, 104), "crater": (72, 58, 66),
    "ruins_floor": (140, 132, 118), "dock": (112, 88, 62), "bridge": (118, 96, 68),
    "volcanic": (58, 48, 46),
}


def make_tileset(path):
    cols = 8
    rows = int(math.ceil(TILE_COUNT / cols))
    img = Image.new("RGBA", (cols * TILE, rows * TILE), (0, 0, 0, 0))
    pix = img.load()
    r = np.random.default_rng(SEED + 5)
    for idx in range(TILE_COUNT):
        if idx == COLLISION_BLOCK or idx == COLLISION_SLOW:
            col = (255, 40, 40, 120) if idx == COLLISION_BLOCK else (60, 140, 255, 120)
            ox, oy = (idx % cols) * TILE, (idx // cols) * TILE
            for y in range(TILE):
                for x in range(TILE):
                    if x == 0 or y == 0 or x == TILE - 1 or y == TILE - 1 or (x + y) % 8 == 0:
                        pix[ox + x, oy + y] = col
            continue
        ttype = TILE_TYPES[idx // 2]
        variant = idx % 2
        base = np.array(TILE_COLORS[ttype], np.float32)
        noise = r.random((TILE, TILE)).astype(np.float32)
        noise = 0.5 * noise + 0.5 * np.roll(noise, 3, axis=0) * 0.0
        tex = np.zeros((TILE, TILE, 4), np.float32)
        tex[..., 3] = 255
        amp = 26 if ttype not in ("deep_water", "water", "shallow", "reef", "river") else 14
        tex[..., :3] = base + (noise[..., None] - 0.5) * amp
        # per-style details
        if ttype in ("water", "shallow", "reef", "river", "deep_water"):
            for y in range(TILE):
                for x in range(TILE):
                    v = math.sin((x * 0.9 + y * 0.35 + variant * 1.7) * 0.55)
                    if v > 0.86:
                        tex[y, x, :3] += 22
                    if v < -0.94:
                        tex[y, x, :3] -= 12
        elif ttype in ("sand", "wet_sand"):
            dots = r.random((TILE, TILE)) > 0.90
            tex[dots, :3] += 16
        elif ttype in ("jungle", "dense_jungle", "jungle_dark", "grass", "marsh"):
            dots = r.random((TILE, TILE)) > 0.88
            tex[dots, :3] -= 18
            leaves = r.random((TILE, TILE)) > 0.95
            tex[leaves, :3] += 22
        elif ttype in ("rock", "cliff", "mountain"):
            cracks = (r.random((TILE, TILE)) > 0.93)
            tex[cracks, :3] -= 26
        elif ttype in ("road", "trail", "concrete"):
            if ttype == "concrete":
                for x in range(TILE):
                    tex[TILE - 1, x, :3] -= 22
            else:
                dots = r.random((TILE, TILE)) > 0.86
                tex[dots, :3] += 14
        elif ttype == "alien_ground":
            veins = np.abs(np.sin((np.arange(TILE)[None, :] * 0.7 + np.arange(TILE)[:, None] * 1.3)))
            tex[veins < 0.12, :3] = [168, 92, 200]
        elif ttype == "volcanic":
            dots = r.random((TILE, TILE)) > 0.86
            tex[dots, :3] = [190, 76, 40]
        np.clip(tex[..., :3], 0, 255, out=tex[..., :3])
        arr = tex.astype(np.uint8)
        tile = Image.fromarray(arr, "RGBA")
        img.paste(tile, ((idx % cols) * TILE, (idx // cols) * TILE))
    img.save(path)
    return cols, rows


def write_tmx(path, tiles, airfield, collision, pois):
    r = np.random.default_rng(SEED + 9)
    gid = np.zeros((N, N), np.int32)
    variant = r.random((N, N)) < 0.34
    gid = tiles.astype(np.int32) * 2 + variant.astype(np.int32) + 1

    def csv_of(arr):
        rows = []
        for j in range(N):
            rows.append(",".join(str(int(x)) for x in arr[j]))
        return "\n".join(rows)

    coll_gid = np.zeros((N, N), np.int32)
    coll_gid[collision == 1] = COLLISION_BLOCK + 1
    coll_gid[collision == 2] = COLLISION_SLOW + 1

    with open(path, "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        fh.write(f'<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" '
                 f'renderorder="right-down" width="{N}" height="{N}" tilewidth="{TILE}" '
                 f'tileheight="{TILE}" infinite="0" nextlayerid="4" nextobjectid="900">\n')
        fh.write(f' <tileset firstgid="1" name="bermuda" tilewidth="{TILE}" tileheight="{TILE}" '
                 f'tilecount="{TILE_COUNT}" columns="8">\n')
        fh.write(f'  <image source="tileset.png" width="{8 * TILE}" height="{int(math.ceil(TILE_COUNT / 8)) * TILE}"/>\n')
        fh.write(' </tileset>\n')
        fh.write(f' <layer id="1" name="ground" width="{N}" height="{N}">\n  <data encoding="csv">\n')
        fh.write(csv_of(gid))
        fh.write('\n</data>\n </layer>\n')
        fh.write(f' <layer id="2" name="collision" width="{N}" height="{N}">\n  <data encoding="csv">\n')
        fh.write(csv_of(coll_gid))
        fh.write('\n</data>\n </layer>\n')
        fh.write(' <objectgroup id="3" name="pois">\n')
        objs, _ = write_tmx_objects(pois)
        fh.write(objs)
        fh.write(' </objectgroup>\n</map>\n')


def write_tmx_objects(pois):
    out = []
    oid = 1
    for p in pois:
        out.append(
            f'  <object id="{oid}" name="{p["name"]}" type="{p["type"]}" '
            f'x="{p["x"]}" y="{p["y"]}" width="0" height="0">\n'
            f'   <properties>\n'
            f'    <property name="id" value="{p["id"]}"/>\n'
            f'    <property name="name_fa" value="{p["fa"]}"/>\n'
            f'    <property name="region" value="{p["region"]}"/>\n'
            f'    <property name="danger" type="int" value="{p["danger"]}"/>\n'
            f'   </properties>\n'
            f'  </object>\n'
        )
        oid += 1
    return "".join(out), oid


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------


def main():
    os.makedirs(MAP, exist_ok=True)
    rng_local = np.random.default_rng(SEED + 1)
    random_like = np.random.default_rng(SEED + 2)

    print("[1/8] terrain fields")
    f = build_fields()
    land = f["land"]
    print(f"      land fraction: {land.mean():.3f}   rivers: {int(f['river'].sum())} tiles")

    print("[2/8] POIs")
    pois = place_pois(f)
    print(f"      {len(pois)} landmarks")

    print("[3/8] roads")
    road_mask, road_paths = route_roads(f, pois)
    print(f"      {len(road_paths)} routes, {int((road_mask > 0).sum())} road tiles")

    print("[4/8] alien occupation + airfield")
    corrupted, crater = alien_fields(f, pois)
    airfield = airfield_mask(pois)
    print(f"      corrupted {int(corrupted.sum())} tiles, craters {int(crater.sum())} tiles")

    print("[5/8] tiles")
    tiles = classify(f, pois, road_mask, airfield, corrupted, crater)
    collision = collision_from_tiles(tiles)
    print(f"      blocked {int((collision == 1).sum())} tiles, slow {int((collision == 2).sum())}")

    # a landmark must never stand on a blocked tile: snap it to the nearest walkable one
    for p in pois:
        i, j = p["tile"]
        if collision[j, i] == 1:
            ni, nj = find_tile(lambda a, b: collision[b, a] != 1, i, j, max_ring=28)
            p["tile"] = [ni, nj]
            p["u"], p["v"] = ni / N, nj / N
            p["x"], p["y"] = int(ni * TILE + TILE // 2), int(nj * TILE + TILE // 2)

    print("[6/8] props")
    buildings = make_buildings(pois, random_like)
    props = make_props(f, tiles, pois, buildings, rng_local)
    print(f"      {len(props)} props ({len(buildings)} buildings)")

    print("[7/8] tileset + tmx")
    cols, rows = make_tileset(os.path.join(MAP, "tileset.png"))
    write_tmx(os.path.join(MAP, "bermuda-island.tmx"), tiles, airfield, collision, pois)
    hist = {TILE_TYPES[i]: int((tiles == i).sum()) for i in range(len(TILE_TYPES))}
    print("      tile histogram:", {k: v for k, v in hist.items() if v})

    print("[8/8] world.json + props.csv")
    regions = []
    for (rid, name, fa, ru, rv) in REGIONS:
        regions.append(dict(id=rid, name=name, name_fa=fa,
                            cx=int(ru * WORLD), cy=int(rv * WORLD)))

    world = dict(
        meta=dict(name="Bermuda - Occupied Island", version=1, seed=SEED,
                  tile=TILE, grid=[N, N], world_px=[WORLD, WORLD],
                  land_fraction=round(float(land.mean()), 4)),
        tileset=dict(file="tileset.png", tile=TILE, columns=8, count=TILE_COUNT,
                     index_rule="gid = type*2 + variant + 1",
                     types=TILE_TYPES,
                     collision=dict(blocked=COLLISION_BLOCK + 1, slow=COLLISION_SLOW + 1)),
        regions=regions,
        alien_zones=[dict(id=z[0], name=z[1], name_fa=z[2],
                          x=int(z[3] * WORLD), y=int(z[4] * WORLD), r=int(z[5] * WORLD),
                          spawns=ZONE_SPAWNS.get(z[0], {}))
                     for z in ALIEN_ZONES],
        bestiary=SPECIES,
        pois=[{**{k: p[k] for k in ("id", "name", "fa", "type", "danger", "region", "x", "y")},
               "tile": p["tile"]} for p in pois],
        roads=road_paths,
        spawn=dict(next(p for p in pois if p["type"] == "beach_landing")),
        stats=dict(rivers=int(f["river"].sum()),
                   roads=int((tiles == 16).sum()),
                   trails=int((tiles == 17).sum()),
                   buildings=len(buildings)),
    )
    with open(os.path.join(MAP, "world.json"), "w", encoding="utf-8") as fh:
        json.dump(world, fh, ensure_ascii=False, indent=1)

    with open(os.path.join(MAP, "props.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["x", "y", "type", "rot", "scale"])
        for (x, y, ttype, rot, scale) in props:
            w.writerow([x, y, ttype, rot, scale])

    with open(os.path.join(MAP, "buildings.json"), "w", encoding="utf-8") as fh:
        json.dump(buildings, fh, ensure_ascii=False, separators=(",", ":"))

    np.savez_compressed(
        os.path.join(MAP, "_fields.npz"),
        h=f["h"].astype(np.float32),
        moist=f["moist"].astype(np.float32),
        slope=f["slope"].astype(np.float32),
        land=land.astype(np.uint8),
        field=f["field"].astype(np.float32),
        river=f["river"].astype(np.uint8),
        marsh=f["marsh"].astype(np.uint8),
        tiles=tiles,
        road=road_mask,
        airfield=airfield,
        corrupted=corrupted.astype(np.uint8),
        crater=crater.astype(np.uint8),
        collision=collision,
    )

    print("done ->", MAP)


if __name__ == "__main__":
    main()
