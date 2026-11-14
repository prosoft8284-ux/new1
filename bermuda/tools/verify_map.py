#!/usr/bin/env python3
"""Validate the generated map exports (TMX, JSON, CSV, fields)."""

import csv
import json
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "map")
N = 384

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def main():
    tmx = os.path.join(MAP, "bermuda-island.tmx")
    tree = ET.parse(tmx)
    root = tree.getroot()

    check(root.tag == "map", "TMX root is <map>")
    check(int(root.get("width")) == N and int(root.get("height")) == N, "map is 384 x 384 tiles")

    layers = {l.get("name"): l for l in root.findall("layer")}
    check("ground" in layers and "collision" in layers, "ground + collision layers present")

    ground = layers["ground"].find("data")
    rows = ground.text.strip().split("\n")
    check(len(rows) == N, f"ground has {N} rows (got {len(rows)})")
    check(all(len(r.split(",")) == N for r in rows), "every ground row has 384 values")

    gids = np.array([[int(v) for v in r.split(",")] for r in rows], dtype=np.int32)
    check(gids.min() >= 1, "no empty ground tiles")
    check(gids.max() <= 52, f"ground gids inside tileset (max {int(gids.max())})")

    coll = layers["collision"].find("data")
    crows = coll.text.strip().split("\n")
    cvals = np.array([[int(v) for v in r.split(",")] for r in crows], dtype=np.int32)
    check(int(cvals.max()) in (0, 51, 52), "collision layer uses marker gids")

    obj = root.find("objectgroup")
    objs = obj.findall("object") if obj is not None else []
    check(len(objs) >= 30, f"{len(objs)} landmark objects in TMX")

    with open(os.path.join(MAP, "world.json"), encoding="utf-8") as fh:
        world = json.load(fh)
    check(len(world["pois"]) == len(objs), "world.json POI count matches TMX objects")
    check(len(world["bestiary"]) == 8, "bestiary has the eight alien species")
    check(len(world["roads"]) >= 20, f"{len(world['roads'])} road routes")

    # every POI must sit on walkable land
    tiles = np.load(os.path.join(MAP, "_fields.npz"))["collision"]
    bad = []
    for p in world["pois"]:
        i, j = p["tile"]
        if tiles[j, i] == 1:
            bad.append(p["id"])
    check(not bad, f"all POIs on walkable tiles ({', '.join(bad) if bad else 'clean'})")

    # spawn must exist
    check(world["spawn"]["type"] == "beach_landing", "spawn point present")

    # props csv
    nprops = 0
    kinds = set()
    with open(os.path.join(MAP, "props.csv"), encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            nprops += 1
            kinds.add(row["type"])
    check(nprops > 15000, f"{nprops} scatter props")
    check({"tree", "palm", "bush", "rock", "crystal"} <= kinds, "prop variety present")

    # world size sanity
    check(world["meta"]["world_px"] == [12288, 12288], "world is 12288 x 12288 px (384 x 384 x 32)")

    print()
    if fails:
        print(f"{len(fails)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
