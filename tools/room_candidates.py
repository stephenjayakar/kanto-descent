#!/usr/bin/env python3
"""
Find rectangular combat-arena crops in rendered FireRed layouts.

Reads web/assets/maps/<LAYOUT>/meta.json (run tools/extract_maps.py first) and writes
web/assets/maps/rooms_candidates.json plus one preview per layout in
tools/maps_verify/rooms/<LAYOUT>.png (candidate rectangles drawn and numbered).

Usage:
    python tools/room_candidates.py                         # default dungeon/gym/interior list
    python tools/room_candidates.py LAYOUT_MT_MOON_1F ...   # specific layouts (merged into the json)
    python tools/room_candidates.py --all                   # every layout

Rules (see tools/MAPS.md):
  walkable  = collision == 0 and behaviour not water / ledge / hole / current / seaweed
  candidate = rect 16x10 .. 26x16 metatiles (landscape only: w is the long side, matching the screen),
              walkable fraction 45%..85%, largest 4-connected walkable component >= 90% of walkable cells.
  Up to 8 non-overlapping candidates per layout (greedy by score, restarted from the best 80
  first picks; the set with the highest summed score wins):
      score = (area/416)^0.35 * (1 - 1.5*|frac - 0.65|) * compFrac
  Layouts no bigger than 30x25 also get a "whole" candidate: the bounding box of their largest
  walkable component (gyms, tower floors, Mart / Pokemon Center interiors are rooms as-is).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

try:
    from scipy.ndimage import label as _label
except ImportError:  # pragma: no cover
    _label = None

ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / "web" / "assets" / "maps"
OUT_JSON = MAPS / "rooms_candidates.json"
OUT_DIR = ROOT / "tools" / "maps_verify" / "rooms"

MIN_W, MAX_W, MIN_H, MAX_H = 16, 26, 10, 16
FRAC_LO, FRAC_HI = 0.45, 0.85
COMP_MIN = 0.90
PER_LAYOUT = 8
BEAM = 80         # first picks tried (see find())
AREA_EXP = 0.35   # weak preference for bigger rects, so several fit side by side
WHOLE_MAX_W, WHOLE_MAX_H = 30, 25

# Behaviour names that are never arena floor even when collision == 0
BLOCKING_NAMES = {
    "MB_POND_WATER", "MB_FAST_WATER", "MB_DEEP_WATER", "MB_WATERFALL", "MB_OCEAN_WATER",
    "MB_UNDERWATER_BLOCKED_ABOVE", "MB_UNUSED_WATER", "MB_CYCLING_ROAD_WATER", "MB_SEAWEED",
    "MB_JUMP_EAST", "MB_JUMP_WEST", "MB_JUMP_NORTH", "MB_JUMP_SOUTH",
    "MB_EASTWARD_CURRENT", "MB_WESTWARD_CURRENT", "MB_NORTHWARD_CURRENT", "MB_SOUTHWARD_CURRENT",
    "MB_FALL_WARP", "MB_CRACKED_ICE",
}
WARP_HINT = ("WARP", "DOOR", "LADDER", "ESCALATOR")

DEFAULT_LAYOUTS = [
    "LAYOUT_PALLET_TOWN", "LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB", "LAYOUT_VIRIDIAN_FOREST",
    "LAYOUT_MT_MOON_1F", "LAYOUT_MT_MOON_B1F", "LAYOUT_MT_MOON_B2F",
    "LAYOUT_PEWTER_CITY_GYM", "LAYOUT_CERULEAN_CITY_GYM", "LAYOUT_CELADON_CITY_GYM", "LAYOUT_SAFFRON_CITY_GYM",
    "LAYOUT_VERMILION_CITY_GYM", "LAYOUT_FUCHSIA_CITY_GYM", "LAYOUT_CINNABAR_ISLAND_GYM", "LAYOUT_VIRIDIAN_CITY_GYM",
    *[f"LAYOUT_POKEMON_TOWER_{i}F" for i in range(1, 8)],
    *[f"LAYOUT_SILPH_CO_{i}F" for i in range(1, 12)],
    *[f"LAYOUT_ROCKET_HIDEOUT_B{i}F" for i in range(1, 5)],
    "LAYOUT_POKEMON_CENTER_1F", "LAYOUT_MART",
    "LAYOUT_SEAFOAM_ISLANDS_1F", "LAYOUT_SEAFOAM_ISLANDS_B1F", "LAYOUT_SEAFOAM_ISLANDS_B2F",
    "LAYOUT_SEAFOAM_ISLANDS_B3F", "LAYOUT_SEAFOAM_ISLANDS_B4F",
    "LAYOUT_CERULEAN_CAVE_1F", "LAYOUT_CERULEAN_CAVE_2F", "LAYOUT_CERULEAN_CAVE_B1F",
    "LAYOUT_VICTORY_ROAD_1F", "LAYOUT_VICTORY_ROAD_2F", "LAYOUT_VICTORY_ROAD_3F",
    "LAYOUT_POKEMON_LEAGUE_LORELEIS_ROOM", "LAYOUT_POKEMON_LEAGUE_BRUNOS_ROOM",
    "LAYOUT_POKEMON_LEAGUE_AGATHAS_ROOM", "LAYOUT_POKEMON_LEAGUE_LANCES_ROOM",
    "LAYOUT_POKEMON_LEAGUE_CHAMPIONS_ROOM",
]
COLORS = [(255, 64, 64), (64, 200, 255), (255, 220, 0), (80, 255, 80),
          (255, 120, 255), (255, 160, 40), (160, 120, 255), (255, 255, 255)]


def label(mask: np.ndarray):
    if _label is not None:
        return _label(mask)  # default structure = 4-connectivity
    lab = np.zeros(mask.shape, np.int32)
    n = 0
    h, w = mask.shape
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not lab[sy, sx]:
                n += 1
                stack = [(sy, sx)]
                lab[sy, sx] = n
                while stack:
                    y, x = stack.pop()
                    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
    return lab, n


def largest_comp(mask: np.ndarray) -> tuple[int, np.ndarray]:
    lab, n = label(mask)
    if n == 0:
        return 0, np.zeros_like(mask)
    sizes = np.bincount(lab.ravel())[1:]
    k = int(np.argmax(sizes)) + 1
    return int(sizes[k - 1]), lab == k


def walk_mask(meta: dict) -> tuple[np.ndarray, np.ndarray]:
    w, h = meta["w"], meta["h"]
    coll = np.frombuffer(meta["collision"].encode(), np.uint8).reshape(h, w) - ord("0")
    beh = np.array(meta["behavior"], np.int32).reshape(h, w)
    names = meta["behaviorNames"]
    blocked_ids = [int(k) for k, v in names.items() if v in BLOCKING_NAMES]
    warp_ids = [int(k) for k, v in names.items() if any(s in v for s in WARP_HINT)]
    walk = (coll == 0) & ~np.isin(beh, blocked_ids)
    warp = np.isin(beh, warp_ids)
    return walk, warp


def find(meta: dict) -> list[dict]:
    W, H = meta["w"], meta["h"]
    walk, warp = walk_mask(meta)
    S = np.zeros((H + 1, W + 1), np.int64)
    S[1:, 1:] = walk.cumsum(0).cumsum(1)
    out = []

    if W <= WHOLE_MAX_W and H <= WHOLE_MAX_H:
        n, comp = largest_comp(walk)
        if n:
            ys, xs = np.nonzero(comp)
            x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
            sub = walk[y0:y1, x0:x1]
            out.append({"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "whole": True,
                        "walkableFrac": round(float(sub.mean()), 3),
                        "compFrac": round(n / max(1, int(sub.sum())), 3),
                        "warps": int(warp[y0:y1, x0:x1].sum())})

    cands = []
    for rh in range(MIN_H, min(MAX_H, H) + 1):
        for rw in range(MIN_W, min(MAX_W, W) + 1):
            cnt = S[rh:, rw:] - S[:-rh, rw:] - S[rh:, :-rw] + S[:-rh, :-rw]   # (H-rh+1, W-rw+1)
            frac = cnt / (rw * rh)
            ok = (frac >= FRAC_LO) & (frac <= FRAC_HI)
            for y, x in zip(*np.nonzero(ok)):
                f = float(frac[y, x])
                cands.append((((rw * rh) / (MAX_W * MAX_H)) ** AREA_EXP * (1 - 1.5 * abs(f - 0.65)), int(x), int(y), rw, rh, f))
    if not cands:
        return out
    cands.sort(key=lambda c: -c[0])
    C = np.array([c[:5] for c in cands], np.float64)
    SC, X, Y, RW, RH = C[:, 0], C[:, 1].astype(int), C[:, 2].astype(int), C[:, 3].astype(int), C[:, 4].astype(int)
    FR = np.array([c[5] for c in cands])
    cf_cache: dict[int, float] = {}

    def comp_frac(i: int) -> float:
        if i not in cf_cache:
            sub = walk[Y[i]:Y[i] + RH[i], X[i]:X[i] + RW[i]]
            n, _ = largest_comp(sub)
            cf_cache[i] = n / max(1, int(sub.sum()))
        return cf_cache[i]

    def greedy(first: int | None) -> list[int]:
        alive = np.ones(len(C), bool)
        picks: list[int] = []

        def take(i):
            picks.append(i)
            alive[:] &= ((X + RW <= X[i]) | (X >= X[i] + RW[i]) | (Y + RH <= Y[i]) | (Y >= Y[i] + RH[i]))

        if first is not None:
            take(first)
        while len(picks) < PER_LAYOUT:
            idx = np.flatnonzero(alive)
            if not len(idx):
                break
            i = int(idx[0])
            if comp_frac(i) < COMP_MIN:
                alive[i] = False
                continue
            take(i)
        return picks

    # Greedy from each of the best BEAM first picks; keep the set with the highest total score,
    # so two good side-by-side rooms beat one marginally better centred room.
    firsts = []
    for i in range(len(C)):
        if len(firsts) >= BEAM:
            break
        if comp_frac(i) >= COMP_MIN:
            firsts.append(i)
    best, best_total = [], -1.0
    for f0 in firsts:
        picks = greedy(f0)
        total = sum(SC[i] * comp_frac(i) for i in picks)
        if total > best_total + 1e-9:
            best, best_total = picks, total
    best.sort(key=lambda i: -SC[i] * comp_frac(i))
    for i in best:
        x, y, rw, rh = int(X[i]), int(Y[i]), int(RW[i]), int(RH[i])
        out.append({"x": x, "y": y, "w": rw, "h": rh, "whole": False,
                    "walkableFrac": round(float(FR[i]), 3), "compFrac": round(comp_frac(i), 3),
                    "warps": int(warp[y:y + rh, x:x + rw].sum()),
                    "score": round(float(SC[i] * comp_frac(i)), 3)})
    return out


def preview(lid: str, meta: dict, cands: list[dict]) -> None:
    d = MAPS / lid
    im = Image.open(d / "under.png").convert("RGBA")
    im.alpha_composite(Image.open(d / "over.png").convert("RGBA"))
    walk, _ = walk_mask(meta)
    a = np.array(im).astype(np.float32)
    m = np.kron(~walk, np.ones((16, 16), bool))
    a[m, :3] = a[m, :3] * 0.55
    im = Image.fromarray(a.astype(np.uint8), "RGBA")
    scale = 2 if max(im.width, im.height) <= 800 else 1
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    dr = ImageDraw.Draw(im)
    s = 16 * scale
    for i, c in enumerate(cands):
        col = (255, 255, 255) if c["whole"] else COLORS[i % len(COLORS)]
        x0, y0 = c["x"] * s, c["y"] * s
        x1, y1 = (c["x"] + c["w"]) * s - 1, (c["y"] + c["h"]) * s - 1
        for k in range(3 if not c["whole"] else 1):
            dr.rectangle([x0 + k, y0 + k, x1 - k, y1 - k], outline=col)
        tag = "whole" if c["whole"] else f"#{i} {c['w']}x{c['h']} {c['walkableFrac']:.2f}"
        dr.rectangle([x0 + 3, y0 + 3, x0 + 6 + 6 * len(tag), y0 + 15], fill=(0, 0, 0))
        dr.text((x0 + 5, y0 + 4), tag, fill=col)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT_DIR / f"{lid}.png")


def main(argv: list[str]) -> int:
    if "--all" in argv:
        ids = sorted(p.parent.name for p in MAPS.glob("LAYOUT_*/meta.json"))
    else:
        ids = [a for a in argv if not a.startswith("--")] or DEFAULT_LAYOUTS
    result = json.loads(OUT_JSON.read_text()) if OUT_JSON.exists() else {}
    for lid in ids:
        mp = MAPS / lid / "meta.json"
        if not mp.exists():
            print("missing", lid, "(run tools/extract_maps.py)")
            continue
        meta = json.loads(mp.read_text())
        c = find(meta)
        result[lid] = {"w": meta["w"], "h": meta["h"], "candidates": c}
        preview(lid, meta, c)
        crops = [x for x in c if not x["whole"]]
        print(f"{lid:45s} {meta['w']:3d}x{meta['h']:<3d} whole={'y' if any(x['whole'] for x in c) else 'n'} crops={len(crops)}")
    OUT_JSON.write_text(json.dumps(result, indent=1))
    print("wrote", OUT_JSON.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
