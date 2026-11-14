#!/usr/bin/env python3
"""Export the generated island into compact game data under game/public/world."""

import csv
import json
import os
import shutil
import struct

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")
OUT = os.path.join(ROOT, "game", "public", "world")

N = 384
TILE = 32
WORLD = N * TILE

PROP_TYPES = ["tree", "palm", "bush", "grass", "reed", "rock", "crystal",
              "debris", "column", "tower", "radar", "lighthouse", "spire",
              "wreck", "shipwreck", "mine_head", "falls"]

# camp definitions: (poi id, display name, garrison, has_tower)
CAMPS = [
    ("outpost", "Compound 12", {"brute": 2, "runner": 3}, False),
    ("fuel_depot", "North Fuel Depot", {"runner": 3, "jelly": 1}, False),
    ("airstrip", "Rook Airstrip", {"brute": 1, "runner": 2, "mage": 1}, False),
    ("alien_camp_east", "Signal Nest", {"runner": 3, "jelly": 2}, False),
    ("radio_tower", "Ash Radio Tower", {"runner": 2}, True),
    ("radar", "Ridge Radar", {"brute": 1, "runner": 2}, True),
    ("lighthouse", "Gull Point Light", {}, True),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    d = np.load(os.path.join(MAP, "_fields.npz"))
    tiles = d["tiles"].astype(np.uint8)
    collision = d["collision"].astype(np.uint8)
    height = np.clip((d["h"] - 0.0) * 255.0, 0, 255).astype(np.uint8)

    tiles.tofile(os.path.join(OUT, "tiles.bin"))
    collision.tofile(os.path.join(OUT, "collision.bin"))
    height.tofile(os.path.join(OUT, "height.bin"))

    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)

    by_id = {p["id"]: p for p in world["pois"]}
    camps = []
    for (pid, name, garrison, tower) in CAMPS:
        p = by_id.get(pid)
        if not p:
            continue
        camps.append(dict(
            id=pid, name=name, x=p["x"], y=p["y"], tile=p["tile"],
            garrison=garrison, tower=tower,
            radius=520 if pid in ("airstrip",) else 380,
        ))

    out_world = dict(
        meta=world["meta"],
        spawn=world["spawn"],
        regions=world["regions"],
        pois=world["pois"],
        alien_zones=world["alien_zones"],
        bestiary=world["bestiary"],
        camps=camps,
        prop_types=PROP_TYPES,
        grid=[N, N],
        tile=TILE,
        world_px=WORLD,
    )
    with open(os.path.join(OUT, "world.json"), "w", encoding="utf-8") as fh:
        json.dump(out_world, fh, ensure_ascii=False, separators=(",", ":"))

    # props: x u16, y u16, type u8, rot u8, scale u8  -> 7 bytes each
    buf = bytearray()
    count = 0
    with open(os.path.join(MAP, "props.csv"), encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            t = row["type"]
            if t not in PROP_TYPES:
                continue
            x, y = int(row["x"]), int(row["y"])
            rot = int(row["rot"]) % 360
            scale = max(40, min(160, int(row["scale"])))
            buf += struct.pack("<HHBBB", x, y, PROP_TYPES.index(t), rot * 255 // 360, scale)
            count += 1
    with open(os.path.join(OUT, "props.bin"), "wb") as fh:
        fh.write(buf)

    shutil.copyfile(os.path.join(MAP, "tileset.png"), os.path.join(OUT, "tileset.png"))
    shutil.copyfile(os.path.join(MAP, "buildings.json"), os.path.join(OUT, "buildings.json"))

    print(f"tiles {tiles.size} bytes, collision {collision.size}, props {count} ({count * 7} bytes)")
    print(f"camps {len(camps)}: " + ", ".join(c["name"] for c in camps))
    print("->", OUT)


if __name__ == "__main__":
    main()
