#!/usr/bin/env python3
"""
FireRed x Hades -- overworld map layout pipeline.

Renders every map LAYOUT in the pret/pokefirered decomp into browser-ready
RGBA PNG layers (16 px per metatile) plus per-block metadata JSON:

    web/assets/maps/<LAYOUT_ID>/under.png   everything drawn beneath sprites (opaque)
    web/assets/maps/<LAYOUT_ID>/over.png    BG1 top layer (drawn over sprites), transparent elsewhere
    web/assets/maps/<LAYOUT_ID>/meta.json   collision / elevation / behaviour per block
    web/assets/maps/<LAYOUT_ID>/anim.json   (+ anim_*.png) animated 8x8 cells, if any
    web/assets/maps/index.json              all layouts + all MAP_* headers that use them

Usage:
    python tools/extract_maps.py                    # all layouts
    python tools/extract_maps.py LAYOUT_PALLET_TOWN # only some (index.json still lists all)
    python tools/extract_maps.py --verify           # also write contact sheets to tools/maps_verify/

See tools/MAPS.md for the format.  Every rule is taken from the C source:
  * src/fieldmap.c        sMetatileAttrMasks/Shifts, LoadTilesetPalette, GetAttributeByMetatileIdAndMapLayout
  * src/field_camera.c    DrawMetatileAt / DrawMetatile (layer types -> BG buffers)
  * src/overworld.c       buffers1->BG2 (prio 2), buffers2->BG1 (prio 1), buffers3->BG3 (prio 3);
                          object sprites normally have priority 2, so BG3+BG2 are under them and BG1 over.
  * src/tileset_anims.c   animated tile DMA (dest tile, count, timer schedule)
  * tileset_rules.mk      -num_tiles truncation of tile sheets
"""
from __future__ import annotations

import gc
import json
import re
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PRET = ROOT / "pokefirered"
OUT = ROOT / "web" / "assets" / "maps"
VERIFY = ROOT / "tools" / "maps_verify"

# include/fieldmap.h
NUM_TILES_IN_PRIMARY = 640
NUM_TILES_TOTAL = 1024
NUM_METATILES_IN_PRIMARY = 640
NUM_METATILES_TOTAL = 1024
NUM_PALS_IN_PRIMARY = 7
NUM_PALS_TOTAL = 13

# src/fieldmap.c sMetatileAttrMasks / sMetatileAttrShifts
ATTR_BEHAVIOR = (0x000001FF, 0)
ATTR_TERRAIN = (0x00003E00, 9)
ATTR_ENCOUNTER = (0x07000000, 24)
ATTR_LAYER_TYPE = (0x60000000, 29)
LAYER_NORMAL, LAYER_COVERED, LAYER_SPLIT = 0, 1, 2

# src/field_camera.c: NORMAL metatiles write this "garbage" entry into BG3
NORMAL_BG3_ENTRY = 0x3014

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print("WARN:", msg)


# ---------------------------------------------------------------------------
# Colour helpers (same house rule as extract_gfx.py)
# ---------------------------------------------------------------------------

def q5(c: int) -> int:
    c5 = (c >> 3) & 31
    return (c5 << 3) | (c5 >> 2)


def read_jasc(path: Path) -> list[tuple[int, int, int]]:
    lines = path.read_text().split()
    if lines[0] != "JASC-PAL":
        raise ValueError(f"not a JASC palette: {path}")
    n = int(lines[2])
    vals = list(map(int, lines[3:3 + n * 3]))
    pal = [(q5(vals[i * 3]), q5(vals[i * 3 + 1]), q5(vals[i * 3 + 2])) for i in range(n)]
    return (pal + [(0, 0, 0)] * 16)[:16]


def load_tiles_png(path: Path, limit: int | None = None) -> np.ndarray:
    """4bpp sheet -> (N, 8, 8) uint8 colour indices (low nibble, as gbagfx)."""
    im = Image.open(path)
    if im.mode != "P":
        raise ValueError(f"{path}: expected indexed PNG, got {im.mode}")
    a = np.array(im, dtype=np.uint8) & 15
    h, w = a.shape
    t = a.reshape(h // 8, 8, w // 8, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    if limit is not None:
        t = t[:limit]
    return t


# ---------------------------------------------------------------------------
# C source parsing
# ---------------------------------------------------------------------------

def strip_ext(p: str) -> str:
    for ext in (".4bpp.lz", ".4bpp", ".gbapal", ".lz"):
        if p.endswith(ext):
            return p[: -len(ext)]
    return p


def parse_tilesets() -> dict:
    hdr = (PRET / "src/data/tilesets/headers.h").read_text()
    # gTileset_General tiles/palettes live in src/graphics.c, the rest in graphics.h
    gfx = (PRET / "src/data/tilesets/graphics.h").read_text() + (PRET / "src/graphics.c").read_text()
    mt = (PRET / "src/data/tilesets/metatiles.h").read_text()
    rules = (PRET / "tileset_rules.mk").read_text()

    num_tiles = {m.group(1): int(m.group(2)) for m in re.finditer(
        r"\$\(TILESETGFXDIR\)/(\S+)/tiles\.4bpp:.*?\n\s*\$\(GFX\).*?-num_tiles (\d+)", rules)}

    tiles_sym = {m.group(1): m.group(2) for m in re.finditer(
        r"const u32 (gTilesetTiles_\w+)\[\]\s*=\s*INCBIN_U32\(\"([^\"]+)\"\)", gfx)}
    pal_sym = {}
    for m in re.finditer(r"const u16 (gTilesetPalettes_\w+)\[\]\[16\]\s*=\s*\{(.*?)\};", gfx, re.S):
        pal_sym[m.group(1)] = re.findall(r"\"([^\"]+)\"", m.group(2))
    bin_sym = {m.group(1): m.group(2) for m in re.finditer(
        r"const u(?:16|32) (gMetatile(?:s|Attributes)_\w+)\[\]\s*=\s*INCBIN_U(?:16|32)\(\"([^\"]+)\"\)", mt)}

    sets = {}
    for m in re.finditer(r"const struct Tileset (gTileset_\w+)\s*=\s*\{(.*?)\};", hdr, re.S):
        body = dict(re.findall(r"\.(\w+)\s*=\s*([^,]+),", m.group(2)))
        tiles_path = strip_ext(tiles_sym[body["tiles"]]) + ".png"
        folder = str(Path(tiles_path).parent).replace("\\", "/")
        sets[m.group(1)] = {
            "sym": m.group(1),
            "secondary": body["isSecondary"].strip() == "TRUE",
            "folder": folder,
            "tiles": tiles_path,
            "num_tiles": num_tiles.get(folder.replace("data/tilesets/", "")),
            "palettes": [strip_ext(p) + ".pal" for p in pal_sym[body["palettes"]]],
            "metatiles": bin_sym[body["metatiles"]],
            "attrs": bin_sym[body["metatileAttributes"]],
            "callback": body.get("callback", "NULL").strip(),
        }
    return sets


def parse_anims() -> dict:
    """src/tileset_anims.c -> {InitTilesetAnim_X: [anim, ...]}.
    anim = {name, dest (VRAM tile), count, frames [png paths], interval, phase}
    Frame shown at tick t (60 Hz, t from map load) =
        frames[floor((t - phase) / interval) % len(frames)]   (t >= phase)
    """
    src = (PRET / "src/tileset_anims.c").read_text()
    frame_file = {m.group(1): m.group(2) for m in re.finditer(
        r"static const u16 (sTilesetAnims_\w+)\[\]\s*=\s*INCBIN_U16\(\"([^\"]+)\"\)", src)}
    arrays = {}
    for m in re.finditer(r"static const u16 \*const (sTilesetAnims_\w+)\[\]\s*=\s*\{(.*?)\};", src, re.S):
        arrays[m.group(1)] = re.findall(r"(sTilesetAnims_\w+)", m.group(2))
    queues = {}
    for m in re.finditer(r"static void (QueueAnimTiles_\w+)\(u16 timer\)\s*\{(.*?)\n\}", src, re.S):
        body = m.group(2)
        arr = re.search(r"(sTilesetAnims_\w+)\[", body).group(1)
        dest = int(re.search(r"TILE_OFFSET_4BPP\((\d+)\)", body).group(1))
        count = int(re.search(r"(\d+)\s*\*\s*TILE_SIZE_4BPP", body).group(1))
        queues[m.group(1)] = (arr, dest, count)
    cbs = {}
    for m in re.finditer(r"static void (TilesetAnim_\w+)\(u16 timer\)\s*\{(.*?)\n\}", src, re.S):
        lst = []
        for c in re.finditer(r"timer % (\d+) == (\d+)\)\s*\n\s*(QueueAnimTiles_\w+)\(timer / (\d+)\)", m.group(2)):
            interval, phase, q, div = int(c.group(1)), int(c.group(2)), c.group(3), int(c.group(4))
            assert interval == div, (q, interval, div)
            arr, dest, count = queues[q]
            frames = [strip_ext(frame_file[s]) + ".png" for s in arrays[arr]]
            lst.append({"name": q.replace("QueueAnimTiles_", ""), "dest": dest, "count": count,
                        "frames": frames, "interval": interval, "phase": phase})
        cbs[m.group(1)] = lst
    out = {}
    for m in re.finditer(r"void (InitTilesetAnim_\w+)\(void\)\s*\{(.*?)\n\}", src, re.S):
        cb = re.search(r"Callback = (TilesetAnim_\w+);", m.group(2)).group(1)
        out[m.group(1)] = cbs[cb]
    return out


def parse_behavior_names() -> dict[int, str]:
    names = {}
    for m in re.finditer(r"#define (MB_\w+) (0x[0-9A-Fa-f]+|\d+)",
                         (PRET / "include/constants/metatile_behaviors.h").read_text()):
        names.setdefault(int(m.group(2), 0), m.group(1))
    return names


# ---------------------------------------------------------------------------
# Tileset loading
# ---------------------------------------------------------------------------

_TS_CACHE: dict = {}


def load_tileset(ts: dict) -> dict:
    if ts["sym"] in _TS_CACHE:
        return _TS_CACHE[ts["sym"]]
    tiles = load_tiles_png(PRET / ts["tiles"], ts["num_tiles"])
    pals = [read_jasc(PRET / p) for p in ts["palettes"]]
    mt = np.fromfile(PRET / ts["metatiles"], dtype="<u2").reshape(-1, 8)
    at = np.fromfile(PRET / ts["attrs"], dtype="<u4")
    if len(at) != len(mt):
        warn(f"{ts['sym']}: {len(mt)} metatiles but {len(at)} attributes")
    d = {"tiles": tiles, "pals": pals, "metatiles": mt, "attrs": at}
    _TS_CACHE[ts["sym"]] = d
    return d


def build_vram(prim: dict, sec: dict) -> np.ndarray:
    vram = np.zeros((NUM_TILES_TOTAL, 8, 8), np.uint8)
    n = min(len(prim["tiles"]), NUM_TILES_IN_PRIMARY)
    vram[:n] = prim["tiles"][:n]
    n2 = min(len(sec["tiles"]), NUM_TILES_TOTAL - NUM_TILES_IN_PRIMARY)
    vram[NUM_TILES_IN_PRIMARY:NUM_TILES_IN_PRIMARY + n2] = sec["tiles"][:n2]
    return vram


def build_palette(prim: dict, sec: dict) -> tuple[np.ndarray, list]:
    """fieldmap.c LoadTilesetPalette: slots 0-6 = primary palettes[0..6] with colour 0 of
    slot 0 forced to black; slots 7-12 = secondary palettes[7..12].  Slots 13-15 are not
    loaded by the map code (menus/weather use them); we fill them from the secondary file
    so stray references still show something, and report them."""
    pal = np.zeros((16, 16, 3), np.uint8)
    for i in range(16):
        src = prim["pals"] if i < NUM_PALS_IN_PRIMARY else sec["pals"]
        if i < len(src):
            pal[i] = np.array(src[i], np.uint8)
    pal[0, 0] = (0, 0, 0)
    return pal


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def render_bg(entries: np.ndarray, vram: np.ndarray, pal: np.ndarray) -> np.ndarray:
    """entries (H8, W8) u16 tilemap -> RGBA (H8*8, W8*8, 4); colour index 0 transparent."""
    h8, w8 = entries.shape
    t = vram[entries & 0x3FF].copy()                      # (h8, w8, 8, 8)
    hf = (entries & 0x400) != 0
    vf = (entries & 0x800) != 0
    t[hf] = t[hf][:, :, ::-1]
    t[vf] = t[vf][:, ::-1, :]
    bank = (entries >> 12).astype(np.intp)
    rgb = pal[bank[:, :, None, None], t]                  # (h8, w8, 8, 8, 3)
    a = np.where(t != 0, 255, 0).astype(np.uint8)
    img = np.concatenate([rgb, a[..., None]], axis=-1)
    return img.transpose(0, 2, 1, 3, 4).reshape(h8 * 8, w8 * 8, 4)


def alpha_over(bottom: np.ndarray, top: np.ndarray) -> np.ndarray:
    m = top[..., 3:4] > 0
    return np.where(m, top, bottom)


def layout_bgs(blocks: np.ndarray, prim: dict, sec: dict, lid: str):
    """field_camera.c DrawMetatile for every block -> (bg3, bg2, bg1) tilemaps + layer types."""
    h, w = blocks.shape
    mid = (blocks & 0x3FF).astype(np.int32)
    mid = np.where(mid > NUM_METATILES_TOTAL, 0, mid)   # DrawMetatileAt: '>' (sic)
    n_p, n_s = len(prim["metatiles"]), len(sec["metatiles"])
    tiles = np.zeros((h, w, 8), np.uint16)
    attrs = np.zeros((h, w), np.uint32)
    isp = mid < NUM_METATILES_IN_PRIMARY
    pi = np.where(isp, mid, 0)
    si = np.where(isp, 0, mid - NUM_METATILES_IN_PRIMARY)
    bad = (isp & (pi >= n_p)) | (~isp & (si >= n_s))
    if bad.any():
        warn(f"{lid}: {int(bad.sum())} blocks reference metatiles beyond the tileset (drawn as metatile 0)")
    pi = np.where(pi < n_p, pi, 0)
    si = np.where(si < n_s, si, 0)
    tiles[isp] = prim["metatiles"][pi[isp]]
    tiles[~isp] = sec["metatiles"][si[~isp]]
    pa = prim["attrs"]
    sa = sec["attrs"]
    attrs[isp] = pa[np.minimum(pi[isp], len(pa) - 1)]
    attrs[~isp] = sa[np.minimum(si[~isp], len(sa) - 1)]
    layer = (attrs & ATTR_LAYER_TYPE[0]) >> ATTR_LAYER_TYPE[1]

    def quad(sel):  # (h, w, 4) -> (2h, 2w)
        return sel.reshape(h, w, 2, 2).transpose(0, 2, 1, 3).reshape(h * 2, w * 2)

    bot = tiles[:, :, 0:4]
    top = tiles[:, :, 4:8]
    zero = np.zeros_like(bot)
    garbage = np.full_like(bot, NORMAL_BG3_ENTRY)
    L = layer[:, :, None]
    # BG3 (gBGTilemapBuffers3), BG2 (gBGTilemapBuffers1), BG1 (gBGTilemapBuffers2)
    bg3 = np.where(L == LAYER_NORMAL, garbage, bot)
    bg2 = np.where(L == LAYER_NORMAL, bot, np.where(L == LAYER_COVERED, top, zero))
    bg1 = np.where(L == LAYER_COVERED, zero, top)
    unknown = (layer > 2)
    if unknown.any():
        warn(f"{lid}: {int(unknown.sum())} blocks with layer type 3 (nothing drawn, as in game)")
        for b in (bg3, bg2, bg1):
            b[unknown] = 0
    return quad(bg3), quad(bg2), quad(bg1), attrs, layer


def compose(bg3, bg2, bg1, vram, pal):
    h, w = bg3.shape
    under = np.zeros((h * 8, w * 8, 4), np.uint8)
    under[..., :3] = pal[0, 0]           # backdrop = BG palette 0 colour 0 (black)
    under[..., 3] = 255
    under = alpha_over(under, render_bg(bg3, vram, pal))
    under = alpha_over(under, render_bg(bg2, vram, pal))
    over = render_bg(bg1, vram, pal)
    return under, over


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------

ANIM_COLS = 64  # cells per sheet row


def build_anims(layout_dir: Path, anims: list, bgs, vram, pal, lid: str) -> dict | None:
    bg3, bg2, bg1 = bgs
    out = []
    conflict_cells = 0
    for an in anims:
        lo, hi = an["dest"], an["dest"] + an["count"]
        frames = []
        for fp in an["frames"]:
            t = load_tiles_png(PRET / fp)
            if len(t) != an["count"]:
                warn(f"{an['name']}: frame {fp} has {len(t)} tiles, expected {an['count']}")
                t = np.resize(t, (an["count"], 8, 8))
            frames.append(t)

        def hit(bg):
            ti = bg & 0x3FF
            return (ti >= lo) & (ti < hi)

        for layer_name, layer_bgs in (("under", (bg3, bg2)), ("over", (bg1,))):
            mask = np.zeros(bg3.shape, bool)
            for b in layer_bgs:
                mask |= hit(b)
            if not mask.any():
                continue
            # cells that also contain tiles of a *different* animation (shown at baked frame)
            for other in anims:
                if other is an:
                    continue
                for b in layer_bgs:
                    ti = b & 0x3FF
                    conflict_cells += int((mask & (ti >= other["dest"]) & (ti < other["dest"] + other["count"])).sum())
            ys, xs = np.nonzero(mask)
            n = len(xs)
            stacks = np.zeros((n, len(frames), 8, 8, 4), np.uint8)   # every frame of every cell
            for fi, ft in enumerate(frames):
                v = vram.copy()
                v[lo:hi] = ft
                if layer_name == "under":
                    img = np.zeros((bg3.shape[0] * 8, bg3.shape[1] * 8, 4), np.uint8)
                    img[..., :3] = pal[0, 0]
                    img[..., 3] = 255
                    img = alpha_over(img, render_bg(bg3, v, pal))
                    img = alpha_over(img, render_bg(bg2, v, pal))
                else:
                    img = render_bg(bg1, v, pal)
                cells = img.reshape(img.shape[0] // 8, 8, img.shape[1] // 8, 8, 4).transpose(0, 2, 1, 3, 4)
                stacks[:, fi] = cells[ys, xs]
            if (stacks == stacks[:, :1]).all():
                continue   # tiles in range but no visible change (e.g. fully covered)
            # identical cells (same tile/flip/palette over the same background) share one slot
            seen: dict[bytes, int] = {}
            slot, inv = [], []
            for ci in range(n):
                key = stacks[ci].tobytes()
                if key not in seen:
                    seen[key] = len(slot)
                    slot.append(ci)
                inv.append(seen[key])
            u = len(slot)
            rows = (u + ANIM_COLS - 1) // ANIM_COLS
            sheet = np.zeros((rows * 8 * len(frames), min(u, ANIM_COLS) * 8, 4), np.uint8)
            for k, ci in enumerate(slot):
                for fi in range(len(frames)):
                    sx, sy = (k % ANIM_COLS) * 8, (fi * rows + k // ANIM_COLS) * 8
                    sheet[sy:sy + 8, sx:sx + 8] = stacks[ci, fi]
            fname = f"anim_{an['name']}_{layer_name}.png"
            Image.fromarray(sheet, "RGBA").save(layout_dir / fname, optimize=True)
            out.append({
                "name": an["name"], "layer": layer_name, "sheet": fname,
                "frames": len(frames), "interval": an["interval"], "phase": an["phase"],
                "cols": ANIM_COLS, "rowsPerFrame": rows, "slots": u,
                "cells": [[int(x) * 8, int(y) * 8, int(k)] for x, y, k in zip(xs, ys, inv)],
            })
    if conflict_cells:
        warn(f"{lid}: {conflict_cells} anim cells overlap another animation (other shown at baked frame)")
    if not out:
        return None
    return {"tickHz": 60, "cellSize": 8, "anims": out}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def read_maps() -> dict:
    maps = {}
    for mj in sorted((PRET / "data/maps").glob("*/map.json")):
        m = json.loads(mj.read_text())
        if "id" not in m or "layout" not in m:
            continue
        maps[m["id"]] = {
            "name": m.get("name"),
            "layout": m["layout"],
            "music": m.get("music"),
            "map_type": m.get("map_type"),
            "weather": m.get("weather"),
            "floor_number": m.get("floor_number"),
            "warp_events": [{"x": w["x"], "y": w["y"], "elevation": w.get("elevation"),
                             "dest_map": w.get("dest_map"), "dest_warp_id": w.get("dest_warp_id")}
                            for w in m.get("warp_events") or []],
            "object_events": [{"x": o.get("x"), "y": o.get("y"), "graphics_id": o.get("graphics_id"),
                               "local_id": o.get("local_id"), "type": o.get("type"),
                               "trainer_type": o.get("trainer_type"), "flag": o.get("flag")}
                              for o in m.get("object_events") or []],
        }
    return maps


def tint_collision(under: np.ndarray, coll: np.ndarray) -> np.ndarray:
    img = under[..., :3].astype(np.float32).copy()
    m = np.kron(coll != 0, np.ones((16, 16), bool))
    img[m] = img[m] * 0.45 + np.array([255, 0, 0]) * 0.55
    return img.astype(np.uint8)


def contact_sheet(entries: list[tuple[str, np.ndarray]], path: Path, max_w: int = 2400, scale: float = 1.0):
    """entries: (label, RGB/RGBA image).  Simple shelf packing with labels."""
    pad, lab = 6, 12
    imgs = []
    for label, a in entries:
        im = Image.fromarray(a[..., :3] if a.shape[2] == 4 else a, "RGB")
        if scale != 1.0:
            im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.NEAREST)
        imgs.append((label, im))
    x = y = 0
    row_h = 0
    pos = []
    for label, im in imgs:
        if x + im.width > max_w and x > 0:
            x, y = 0, y + row_h + pad + lab
            row_h = 0
        pos.append((x, y))
        x += im.width + pad
        row_h = max(row_h, im.height)
    H = y + row_h + pad + lab
    W = max(px + im.width for (px, _), (_, im) in zip(pos, imgs))
    sheet = Image.new("RGB", (W, H), (40, 40, 48))
    d = ImageDraw.Draw(sheet)
    for (px, py), (label, im) in zip(pos, imgs):
        d.text((px, py), label, fill=(255, 255, 0))
        sheet.paste(im, (px, py + lab))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    print("wrote", path.relative_to(ROOT))


VERIFY_SETS = {
    "towns_interiors": ["LAYOUT_PALLET_TOWN", "LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB",
                        "LAYOUT_POKEMON_CENTER_1F", "LAYOUT_MART", "LAYOUT_PEWTER_CITY_GYM",
                        "LAYOUT_CERULEAN_CITY_GYM", "LAYOUT_CELADON_CITY_GYM", "LAYOUT_SAFFRON_CITY_GYM"],
    "forest": ["LAYOUT_VIRIDIAN_FOREST"],
    "mt_moon": ["LAYOUT_MT_MOON_1F", "LAYOUT_MT_MOON_B1F", "LAYOUT_MT_MOON_B2F"],
    "pokemon_tower": [f"LAYOUT_POKEMON_TOWER_{i}F" for i in range(1, 8)],
    "silph_co": [f"LAYOUT_SILPH_CO_{i}F" for i in range(1, 12)],
    "rocket_hideout": [f"LAYOUT_ROCKET_HIDEOUT_B{i}F" for i in range(1, 5)],
    "seafoam": ["LAYOUT_SEAFOAM_ISLANDS_1F", "LAYOUT_SEAFOAM_ISLANDS_B1F", "LAYOUT_SEAFOAM_ISLANDS_B2F",
                "LAYOUT_SEAFOAM_ISLANDS_B3F", "LAYOUT_SEAFOAM_ISLANDS_B4F"],
    "cerulean_cave": ["LAYOUT_CERULEAN_CAVE_1F", "LAYOUT_CERULEAN_CAVE_2F", "LAYOUT_CERULEAN_CAVE_B1F"],
    "victory_road": ["LAYOUT_VICTORY_ROAD_1F", "LAYOUT_VICTORY_ROAD_2F", "LAYOUT_VICTORY_ROAD_3F"],
    "elite_four": ["LAYOUT_POKEMON_LEAGUE_LORELEIS_ROOM", "LAYOUT_POKEMON_LEAGUE_BRUNOS_ROOM",
                   "LAYOUT_POKEMON_LEAGUE_AGATHAS_ROOM", "LAYOUT_POKEMON_LEAGUE_LANCES_ROOM",
                   "LAYOUT_POKEMON_LEAGUE_CHAMPIONS_ROOM", "LAYOUT_POKEMON_LEAGUE_HALL_OF_FAME"],
}
COLLISION_SET = ["LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB", "LAYOUT_PEWTER_CITY_GYM",
                 "LAYOUT_MT_MOON_1F", "LAYOUT_POKEMON_TOWER_3F", "LAYOUT_SILPH_CO_5F"]


def render_layout(l: dict, entry: dict, tilesets: dict, anims_by_cb: dict, mb_names: dict):
    """Render one layout to OUT/<id>/ and return (under, over, collision)."""
    lid = l["id"]
    w, h = l["width"], l["height"]
    ps, ss = l["primary_tileset"], l["secondary_tileset"]
    blocks = np.fromfile(PRET / l["blockdata_filepath"], dtype="<u2")
    if len(blocks) != w * h:
        warn(f"{lid}: map.bin has {len(blocks)} blocks, expected {w * h}")
        blocks = np.resize(blocks, w * h)
    blocks = blocks.reshape(h, w)
    prim, sec = load_tileset(tilesets[ps]), load_tileset(tilesets[ss])
    vram = build_vram(prim, sec)
    pal = build_palette(prim, sec)
    bg3, bg2, bg1, attrs, layer = layout_bgs(blocks, prim, sec, lid)
    nonblank = vram.reshape(NUM_TILES_TOTAL, -1).any(axis=1)
    for name, b in (("BG3", bg3), ("BG2", bg2), ("BG1", bg1)):
        ti = b & 0x3FF
        hi_pal = ((b >> 12) >= NUM_PALS_TOTAL) & nonblank[ti]
        if hi_pal.any():
            warn(f"{lid}: {int(hi_pal.sum())} {name} tiles use palette slot >= 13 (not loaded by map code)")
    under, over = compose(bg3, bg2, bg1, vram, pal)

    coll = (blocks >> 10) & 3
    elev = (blocks >> 12) & 15
    beh = (attrs & ATTR_BEHAVIOR[0]) >> ATTR_BEHAVIOR[1]
    terrain = (attrs & ATTR_TERRAIN[0]) >> ATTR_TERRAIN[1]
    enc = (attrs & ATTR_ENCOUNTER[0]) >> ATTR_ENCOUNTER[1]
    has_over = bool(over[..., 3].any())

    d = OUT / lid
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("anim_*.png"):
        f.unlink()
    Image.fromarray(under, "RGBA").save(d / "under.png", optimize=True)
    Image.fromarray(over, "RGBA").save(d / "over.png", optimize=True)

    anims = []
    for tsn in (ps, ss):
        cb = tilesets[tsn]["callback"]
        if cb != "NULL":
            anims += anims_by_cb.get(cb, [])
    anim = build_anims(d, anims, (bg3, bg2, bg1), vram, pal, lid) if anims else None
    if anim:
        (d / "anim.json").write_text(json.dumps(anim, separators=(",", ":")))
    elif (d / "anim.json").exists():
        (d / "anim.json").unlink()

    used = sorted(set(int(b) for b in beh.ravel()))
    meta = {
        "id": lid, "name": l["name"], "w": w, "h": h, "primary": ps, "secondary": ss,
        "collision": "".join(str(int(c)) for c in coll.ravel()),
        "elevation": "".join("%x" % int(e) for e in elev.ravel()),
        "behavior": [int(b) for b in beh.ravel()],
        "behaviorNames": {str(b): mb_names.get(b, "MB_0x%02X" % b) for b in used},
        "metatile": [int(m) for m in (blocks & 0x3FF).ravel()],
        "layerType": "".join(str(int(t)) for t in layer.ravel()),
        "terrain": "".join("%x" % int(t) for t in terrain.ravel()),
        "encounter": "".join(str(int(e)) for e in enc.ravel()),
        "hasOver": has_over,
        "hasAnim": bool(anim),
        "maps": entry["maps"],
    }
    (d / "meta.json").write_text(json.dumps(meta, separators=(",", ":")))
    entry["hasOver"], entry["hasAnim"] = has_over, bool(anim)
    print(f"{lid:55s} {w:3d}x{h:<3d} over={int(has_over)} anim={len(anim['anims']) if anim else 0}")
    return under, over, coll


def main(argv: list[str]) -> int:
    verify = "--verify" in argv
    only = [a for a in argv if not a.startswith("--")]
    tilesets = parse_tilesets()
    anims_by_cb = parse_anims()
    mb_names = parse_behavior_names()
    layouts = [l for l in json.loads((PRET / "data/layouts/layouts.json").read_text())["layouts"]
               if l and l.get("blockdata_filepath")]
    maps = read_maps()

    OUT.mkdir(parents=True, exist_ok=True)

    renders: dict[str, tuple] = {}
    index_layouts = {}
    for l in layouts:
        lid = l["id"]
        w, h = l["width"], l["height"]
        ps, ss = l["primary_tileset"], l["secondary_tileset"]
        if ps not in tilesets or ss not in tilesets:
            warn(f"{lid}: unknown tileset {ps}/{ss}; skipped")
            continue
        entry = {"name": l["name"], "w": w, "h": h, "primary": ps, "secondary": ss,
                 "maps": sorted(k for k, m in maps.items() if m["layout"] == lid)}
        index_layouts[lid] = entry
        need_render = not only or lid in only
        if verify and any(lid in v for v in VERIFY_SETS.values()):
            need_render = True
        if not need_render:
            prev = OUT / lid / "meta.json"
            if prev.exists():
                pm = json.loads(prev.read_text())
                entry["hasOver"], entry["hasAnim"] = pm.get("hasOver"), pm.get("hasAnim")
            continue

        for attempt in range(6):
            try:
                r = render_layout(l, entry, tilesets, anims_by_cb, mb_names)
                break
            except (MemoryError, OSError):   # host short of commit (zlib reports OSError); retry
                gc.collect()
                print(f"MemoryError on {lid}, retry {attempt + 1}")
                time.sleep(5)
        else:
            raise MemoryError(lid)
        if verify and (lid in COLLISION_SET or any(lid in v for v in VERIFY_SETS.values())):
            renders[lid] = r

    index = {
        "tileSize": 16,
        "layouts": index_layouts,
        "maps": maps,
    }
    (OUT / "index.json").write_text(json.dumps(index, indent=1))
    if not only:  # drop folders of layouts that no longer exist
        for p in OUT.iterdir():
            if p.is_dir() and p.name.startswith("LAYOUT_") and p.name not in index_layouts:
                shutil.rmtree(p)
    print(f"wrote index.json: {len(index_layouts)} layouts, {len(maps)} maps")

    if verify:
        for sheet, ids in VERIFY_SETS.items():
            ents = []
            for lid in ids:
                if lid not in renders:
                    warn(f"verify: {lid} not rendered")
                    continue
                u, o, _ = renders[lid]
                ents.append((lid.replace("LAYOUT_", ""), alpha_over(u, o)))
            if ents:
                contact_sheet(ents, VERIFY / f"{sheet}.png")
        ents = []
        for lid in COLLISION_SET:
            u, o, c = renders[lid]
            ents.append((lid.replace("LAYOUT_", "") + " collision", tint_collision(alpha_over(u, o), c)))
        contact_sheet(ents, VERIFY / "collision.png")
        # layer split check: under | over-on-grey for a few
        ents = []
        for lid in ["LAYOUT_PALLET_TOWN", "LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB", "LAYOUT_VIRIDIAN_FOREST"]:
            u, o, _ = renders[lid]
            grey = np.zeros_like(o)
            grey[...] = (255, 0, 255, 255)
            ents.append((lid.replace("LAYOUT_", "") + " under", u))
            ents.append((lid.replace("LAYOUT_", "") + " over", alpha_over(grey, o)))
        contact_sheet(ents, VERIFY / "layers.png", max_w=3000)

    if WARNINGS:
        print(f"{len(WARNINGS)} warnings")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
