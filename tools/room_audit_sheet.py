#!/usr/bin/env python3
"""Contact sheets for tools/room_audit.mjs: one PNG per area, every room drawn from the real map layers with
its collision overlay.

    python tools/room_audit_sheet.py tools/maps_verify/audit/audit.json tools/maps_verify/audit
    python tools/room_audit_sheet.py <audit.json> <outdir> "SILPH_CO_2F" 2   # detail view(s) at 2x

Overlay legend:
    red tint      solid (blocks walking, dashes and shots)
    blue tint     water / gap (blocks walking; dashes and flyers cross)
    yellow hatch  other walk-only blocks (ledges, counters, IMPASSABLE_*)
    purple tint   walkable but unreachable from the entry (pockets)
    magenta box   ERROR flag on that cell        orange box   WARN flag
    orange line   thin wall (cliff rim / one-way side / height change): blocks walking and dashes
    green dot     entry   cyan box  exit   white corner  warp
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / "web" / "assets" / "maps"
T = 16
COLS = 3
_layer_cache = {}


def layers(lid):
    if lid not in _layer_cache:
        im = Image.open(MAPS / lid / "under.png").convert("RGBA")
        im.alpha_composite(Image.open(MAPS / lid / "over.png").convert("RGBA"))
        _layer_cache[lid] = im
    return _layer_cache[lid]


def render(r):
    c = r["crop"]
    base = layers(r["layout"]).crop((c["x"] * T, c["y"] * T, (c["x"] + c["w"]) * T, (c["y"] + c["h"]) * T))
    a = np.array(base).astype(np.float32)
    w, h = r["w"], r["h"]
    walk, shot, water, reach = (np.array(r[k], np.uint8).reshape(h, w) for k in ("walk", "shot", "water", "reach"))
    solid = (walk == 1) & (shot == 1)
    gapw = (walk == 1) & (shot == 0) & (water == 1)
    gapo = (walk == 1) & (shot == 0) & (water == 0)
    pocket = (walk == 0) & (reach == 0)
    kinds = np.zeros((h, w), np.uint8)  # 0 walkable, 1 solid, 2 water, 3 other gap, 4 pocket
    for n, (m, col, k) in enumerate(((solid, (255, 30, 30), 0.3), (gapw, (40, 110, 255), 0.35), (gapo, (255, 220, 0), 0.0), (pocket, (170, 40, 255), 0.5)), 1):
        kinds[m] = n
        mm = np.kron(m, np.ones((T, T), bool))
        a[mm, :3] = a[mm, :3] * (1 - k) + np.array(col) * k
    im = Image.fromarray(a.astype(np.uint8), "RGBA").convert("RGB")
    d = ImageDraw.Draw(im)
    for y, x in zip(*np.nonzero(gapo)):  # walk-only blocks: diagonal hatching (sand floors are yellow too)
        for k in range(0, 2 * T, 5):
            d.line([x * T + max(0, k - T + 1), y * T + min(k, T - 1), x * T + min(k, T - 1), y * T + max(0, k - T + 1)], fill=(255, 230, 0))
    # collision edges: a line wherever a walkable cell meets a blocked one, coloured by what blocks
    EDGE = {1: (255, 0, 0), 2: (60, 140, 255), 3: (255, 230, 0)}
    for y in range(h):
        for x in range(w):
            if kinds[y, x] not in (0, 4):
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                X, Y = x + dx, y + dy
                if not (0 <= X < w and 0 <= Y < h) or kinds[Y, X] in (0, 4):
                    continue
                col = EDGE[int(kinds[Y, X])]
                px, py = x * T, y * T
                if dx == 1: d.line([px + T - 1, py, px + T - 1, py + T - 1], fill=col)
                if dx == -1: d.line([px, py, px, py + T - 1], fill=col)
                if dy == 1: d.line([px, py + T - 1, px + T - 1, py + T - 1], fill=col)
                if dy == -1: d.line([px, py, px + T - 1, py], fill=col)
    edge = np.array(r.get("edge") or [0] * (w * h), np.uint8).reshape(h, w)
    for y, x in zip(*np.nonzero(edge)):  # thin walls (cliff rims, one-way sides, height changes): orange
        e, px, py = int(edge[y, x]), x * T, y * T
        if e & 8: d.line([px + T - 1, py, px + T - 1, py + T - 1], fill=(255, 140, 0), width=2)
        if e & 2: d.line([px, py + T - 1, px + T - 1, py + T - 1], fill=(255, 140, 0), width=2)
        if e & 1 and y == 0: d.line([px, py, px + T - 1, py], fill=(255, 140, 0), width=2)
        if e & 4 and x == 0: d.line([px, py, px, py + T - 1], fill=(255, 140, 0), width=2)
    for f in r["flags"]:
        if f.get("x") is None:
            continue
        col = (255, 0, 255) if f["sev"] == "ERROR" else (255, 150, 0)
        x, y = f["x"] * T, f["y"] * T
        if f["kind"] == "elevation-edge":
            if "to E" in f.get("note", ""):
                d.line([x + T - 1, y, x + T - 1, y + T - 1], fill=col, width=2)
            else:
                d.line([x, y + T - 1, x + T - 1, y + T - 1], fill=col, width=2)
        else:
            d.rectangle([x + 1, y + 1, x + T - 2, y + T - 2], outline=col, width=2)
    for q in r["warps"]:
        x, y = q["x"] * T, q["y"] * T
        d.line([x, y, x + 5, y], fill=(255, 255, 255)); d.line([x, y, x, y + 5], fill=(255, 255, 255))
    for e in r["exits"]:
        d.rectangle([e["x"] - 6, e["y"] - 6, e["x"] + 6, e["y"] + 6], outline=(0, 255, 255), width=2)
    ex, ey = r["entry"]["x"], r["entry"]["y"]
    d.ellipse([ex - 4, ey - 4, ex + 4, ey + 4], fill=(0, 255, 0), outline=(0, 0, 0))
    return im


def main(src, outdir, only=None, scale=1):
    rooms = json.loads(Path(src).read_text())
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    if only:  # detail view: matching rooms at `scale`, one file
        sel = [r for r in rooms if only in r["label"] and not r.get("missing")]
        for k, r in enumerate(sel):
            im = render(r)
            im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            p = outdir / f"detail_{k}.png"
            im.save(p)
            print("wrote", p, r["label"])
        return
    by = {}
    for r in rooms:
        by.setdefault(r["area"], []).append(r)
    for area, rs in by.items():
        tiles = []
        for r in rs:
            if r.get("missing"):
                continue
            im = render(r)
            errs = sum(f["sev"] == "ERROR" for f in r["flags"])
            warns = len(r["flags"]) - errs
            st = r["stats"]
            cap = f"{r['label']}  {r['w']}x{r['h']} reach {st['reach']}  E{errs} W{warns}"
            lab = Image.new("RGB", (max(im.width, 6 * len(cap) + 8), 12), (0, 0, 0))
            ImageDraw.Draw(lab).text((3, 0), cap, fill=(255, 80, 255) if errs else (255, 255, 255))
            tile = Image.new("RGB", (max(im.width, lab.width), im.height + 12), (24, 24, 24))
            tile.paste(lab, (0, 0)); tile.paste(im, (0, 12))
            tiles.append(tile)
        if not tiles:
            continue
        cw = max(t.width for t in tiles) + 6
        rows = [tiles[i:i + COLS] for i in range(0, len(tiles), COLS)]
        H = sum(max(t.height for t in row) + 6 for row in rows)
        sheet = Image.new("RGB", (cw * min(COLS, len(tiles)), H), (12, 12, 12))
        y = 0
        for row in rows:
            for k, t in enumerate(row):
                sheet.paste(t, (k * cw, y))
            y += max(t.height for t in row) + 6
        p = outdir / f"{area}.png"
        sheet.quantize(colors=200, method=Image.Quantize.MEDIANCUT).save(p, optimize=True)
        print("wrote", p, f"{sheet.width}x{sheet.height}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None, int(sys.argv[4]) if len(sys.argv) > 4 else 2)
