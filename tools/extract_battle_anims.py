#!/usr/bin/env python3
"""
Kanto Spire -- battle animation sprite extractor.

Converts the battle-animation particle graphics of the pret/pokefirered decomp
(graphics/battle_anims/sprites, plus the move backgrounds) into RGBA PNG strips
for use as realtime move effects.

    python tools/extract_battle_anims.py            # writes web/assets/gfx/battle_anims/
    python tools/extract_battle_anims.py --verify   # also contact sheets in tools/battle_anims_verify/

Everything is derived from the C source:
  * src/graphics.c                 gBattleAnimSpriteGfx_* / gBattleAnimSpritePal_* -> INCBIN paths
  * graphics_file_rules.mk         sheets that are `cat` of several PNGs (ice_cube, spark, ...)
  * src/data/battle_anim.h         gBattleAnimPicTable {gfx, size, tag}, gBattleAnimPaletteTable {pal, tag}
  * src/battle_anim_*.c            SpriteTemplates {.tileTag, .paletteTag, .oam, .anims} + AnimCmd tables
  * data/battle_anim_scripts.s     Move_* scripts (loadspritegfx / createsprite) -> usedBy

See tools/BATTLE_ANIMS.md for the output format.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PRET = ROOT / "pokefirered"
OUT = ROOT / "web" / "assets" / "gfx" / "battle_anims"
VERIFY = ROOT / "tools" / "battle_anims_verify"

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print("WARN:", msg)


# ---------------------------------------------------------------------------
# Colour helpers (same rules as tools/extract_gfx.py)
# ---------------------------------------------------------------------------

def q5(c: int) -> int:
    c5 = (c >> 3) & 31
    return (c5 << 3) | (c5 >> 2)


def read_jasc(path: Path) -> list[tuple[int, int, int]]:
    t = path.read_text(encoding="utf-8", errors="replace").split()
    if t[0] != "JASC-PAL":
        raise ValueError(f"not a JASC palette: {path}")
    n = int(t[2])
    v = list(map(int, t[3:3 + n * 3]))
    return [(q5(v[i * 3]), q5(v[i * 3 + 1]), q5(v[i * 3 + 2])) for i in range(n)]


def png_palette(path: Path) -> list[tuple[int, int, int]]:
    p = Image.open(path).getpalette() or []
    return [(q5(p[i]), q5(p[i + 1]), q5(p[i + 2])) for i in range(0, len(p), 3)]


def pal_for_stem(stem: Path) -> tuple[list, str]:
    """Palette the build uses for '<stem>.gbapal': .pal wins over the PNG's PLTE."""
    if stem.with_suffix(".pal").exists():
        return read_jasc(stem.with_suffix(".pal")), stem.with_suffix(".pal").relative_to(PRET).as_posix()
    if stem.with_suffix(".png").exists():
        return png_palette(stem.with_suffix(".png")), stem.with_suffix(".png").relative_to(PRET).as_posix()
    raise FileNotFoundError(stem)


def load_idx(path: Path) -> np.ndarray:
    im = Image.open(path)
    if im.mode not in ("P", "L", "1"):
        raise ValueError(f"unsupported mode {im.mode}: {path}")
    a = np.array(im, dtype=np.uint8)
    if im.mode == "L":
        a = (a.astype(np.uint16) * 15 // 255).astype(np.uint8)
    return a


def png_tiles(path: Path) -> np.ndarray:
    """4bpp tiles in gbagfx order (row-major over the 8x8 grid) -> (N, 8, 8) nibbles."""
    a = load_idx(path) & 15
    h, w = a.shape
    th, tw = h // 8, w // 8
    a = a[:th * 8, :tw * 8]
    return a.reshape(th, 8, tw, 8).transpose(0, 2, 1, 3).reshape(th * tw, 8, 8)


def tiles_to_frames(tiles: np.ndarray, fw: int, fh: int) -> tuple[np.ndarray, int]:
    """1D OBJ mapping: frame k is tiles [k*tpf, (k+1)*tpf) laid out row-major,
    fw/8 tiles per row.  Returns an (fh, fw*frames) index strip."""
    cw, ch = fw // 8, fh // 8
    tpf = cw * ch
    n = len(tiles) // tpf
    if n == 0:
        return np.zeros((fh, fw), np.uint8), 0
    t = tiles[:n * tpf].reshape(n, ch, cw, 8, 8)
    # -> (ch*8, n*cw*8)
    strip = t.transpose(1, 3, 0, 2, 4).reshape(ch * 8, n * cw * 8)
    return strip, n


def colorize(idx: np.ndarray, pal: list, bank: int = 0) -> np.ndarray:
    pal = list(pal)
    while len(pal) < 16 * (bank + 1):
        pal.append((255, 0, 255))
    lut = np.array([(r, g, b, 255) for r, g, b in pal[16 * bank:16 * bank + 16]], np.uint8)
    out = lut[idx & 15]
    out[(idx & 15) == 0] = (0, 0, 0, 0)
    return out


# ---------------------------------------------------------------------------
# Source parsing
# ---------------------------------------------------------------------------

def strip_comments(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


def parse_incbins() -> dict[str, str]:
    out = {}
    for f in [PRET / "src" / "graphics.c"]:
        for m in re.finditer(r"(\w+)\[\]\s*=\s*INCBIN_U(?:8|16|32)\(\"([^\"]+)\"\)", f.read_text(encoding="utf-8", errors="replace")):
            out[m.group(1)] = m.group(2)
    return out


def parse_cat_rules() -> dict[str, list[str]]:
    """graphics_file_rules.mk: '$(BTLANMSPRGFXDIR)/x.4bpp: a.4bpp b.4bpp\\n\\t@cat $^ >$@'."""
    txt = (PRET / "graphics_file_rules.mk").read_text(encoding="utf-8", errors="replace").replace("\\\n", " ")
    dirs = dict(re.findall(r"^(\w+)\s*:=\s*(\S+)", txt, re.M))
    rules = {}
    for m in re.finditer(r"^(\S+\.4bpp)\s*:\s*([^\n]*)\n\t@?cat ", txt, re.M):
        def expand(p):
            return re.sub(r"\$\((\w+)\)", lambda mm: dirs.get(mm.group(1), mm.group(0)), p)
        rules[expand(m.group(1))] = [expand(p) for p in m.group(2).split()]
    return rules


def parse_tag_ids() -> dict[str, int]:
    txt = (PRET / "include" / "constants" / "battle_anim.h").read_text(encoding="utf-8", errors="replace")
    return {m.group(1): int(m.group(2))
            for m in re.finditer(r"#define\s+(ANIM_TAG_\w+)\s+\(ANIM_SPRITES_START \+ (\d+)\)", txt)}


def parse_tables():
    txt = strip_comments((PRET / "src" / "data" / "battle_anim.h").read_text(encoding="utf-8", errors="replace"))
    pic = {}
    body = re.search(r"gBattleAnimPicTable\[\]\s*=\s*\{(.*?)\n\};", txt, re.S).group(1)
    for m in re.finditer(r"\{\s*(\w+)\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(ANIM_TAG_\w+)\s*\}", body):
        pic[m.group(3)] = (m.group(1), int(m.group(2), 0))
    # Cmd_loadspritegfx indexes both tables by position (tag - ANIM_SPRITES_START),
    # so key each palette by the pic-table tag at the same index. This matters for
    # SAP_DRIP_2, whose palette entry is mis-tagged ANIM_TAG_SAP_DRIP.
    pal = {}
    body = re.search(r"gBattleAnimPaletteTable\[\]\s*=\s*\{(.*?)\n\};", txt, re.S).group(1)
    pic_order = list(pic)
    for i, m in enumerate(re.finditer(r"\{\s*(\w+)\s*,\s*(ANIM_TAG_\w+)\s*\}", body)):
        key = pic_order[i] if i < len(pic_order) else m.group(2)
        if key != m.group(2):
            warn(f"palette table entry {i} ({m.group(1)}) is tagged {m.group(2)} "
                 f"but sits at {key}'s index; using it for {key}")
        pal[key] = m.group(1)
    bgs = {}
    body = re.search(r"gBattleAnimBackgroundTable\[\]\s*=\s*\{(.*?)\n\};", txt, re.S).group(1)
    for m in re.finditer(r"\[(\w+)\]\s*=\s*\{\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\}", body):
        bgs[m.group(1)] = (m.group(2), m.group(3), m.group(4))
    return pic, pal, bgs


SIZE_RE = re.compile(r"_(\d+)x(\d+)$")


def parse_sources():
    """SpriteTemplates, OamData sizes and AnimCmd tables from all battle_anim*.c."""
    files = sorted((PRET / "src").glob("battle_anim*.c"))
    files.append(PRET / "src" / "data" / "battle_anim.h")
    oam_sizes: dict[str, tuple[int, int]] = {}
    anim_seqs: dict[str, list] = {}       # sAnim_X -> [[tileOffset, duration, flags], ...]
    anim_tables: dict[str, list[str]] = {}  # sAnims_X -> [sAnim_A, ...]
    templates: list[dict] = []
    subsprites: dict[str, list] = {}      # template name -> subsprite list
    for f in files:
        txt = strip_comments(f.read_text(encoding="utf-8", errors="replace"))
        for m in re.finditer(r"struct OamData\s+(\w+)\s*=\s*\{(.*?)\};", txt, re.S):
            sm = re.search(r"SPRITE_SIZE\((\d+)x(\d+)\)", m.group(2))
            if sm:
                oam_sizes[m.group(1)] = (int(sm.group(1)), int(sm.group(2)))
        for m in re.finditer(r"union AnimCmd\s+(\w+)\[\]\s*=\s*\{(.*?)\};", txt, re.S):
            seq = []
            for c in re.finditer(r"ANIMCMD_(FRAME|JUMP|END|LOOP)\(?([^)\n]*)\)?", m.group(2)):
                kind, args = c.group(1), c.group(2)
                if kind == "FRAME":
                    parts = [p.strip() for p in args.split(",")]
                    try:
                        tile = int(eval(parts[0], {}, {}))
                        dur = int(eval(parts[1], {}, {}))
                    except Exception:
                        continue
                    flags = ""
                    if "hFlip = TRUE" in args:
                        flags += "h"
                    if "vFlip = TRUE" in args:
                        flags += "v"
                    seq.append([tile, dur, flags])
                elif kind == "JUMP":
                    seq.append(["jump", args.strip()])
                elif kind == "LOOP":
                    seq.append(["loop", args.strip()])
            anim_seqs[m.group(1)] = seq
        for m in re.finditer(r"union AnimCmd\s*\*const\s+(\w+)\[\]\s*=\s*\{(.*?)\};", txt, re.S):
            anim_tables[m.group(1)] = re.findall(r"(?:\]\s*=\s*)?\b([A-Za-z_]\w*)\b", m.group(2))
        # templates: the name is the last identifier before '=' preceding the brace block
        for m in re.finditer(r"struct SpriteTemplate\s+(\w+)(\[\w*\])?\s*=\s*\{", txt):
            name, start = m.group(1), m.end() - 1
            depth, i = 0, start
            while i < len(txt):
                if txt[i] == "{":
                    depth += 1
                elif txt[i] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            block = txt[start:i + 1]
            for k, b in enumerate(re.findall(r"\{[^{}]*\.tileTag[^{}]*\}", block) or [block]):
                def field(fn):
                    fm = re.search(r"\." + fn + r"\s*=\s*&?\s*(\w+)", b)
                    return fm.group(1) if fm else None
                t = {"name": name + (f"[{k}]" if m.group(2) else ""), "file": f.name,
                     "tileTag": field("tileTag"), "paletteTag": field("paletteTag"),
                     "oam": field("oam"), "anims": field("anims"), "callback": field("callback")}
                if t["tileTag"] and t["tileTag"].startswith("ANIM_TAG_"):
                    templates.append(t)
        # Subsprite tables: struct Subsprite X[] -> SubspriteTable Y[] -> SetSubspriteTables(.., Y)
        # inside a function that is either the template's callback or CreateSprite()s it.
        subs = {}
        for m in re.finditer(r"struct Subsprite\s+(\w+)\[\]\s*=\s*\{(.*?)\n\};", txt, re.S):
            lst = []
            for e in re.findall(r"\{([^{}]*\.tileOffset[^{}]*)\}", m.group(2)):
                g = lambda k: re.search(r"\." + k + r"\s*=\s*(-?\d+)", e)
                sz = re.search(r"SPRITE_SIZE\((\d+)x(\d+)\)", e)
                lst.append({"x": int(g("x").group(1)), "y": int(g("y").group(1)),
                            "w": int(sz.group(1)), "h": int(sz.group(2)),
                            "tileOffset": int(g("tileOffset").group(1))})
            subs[m.group(1)] = lst
        tables = {m.group(1): m.group(2) for m in re.finditer(
            r"struct SubspriteTable\s+(\w+)\[\]\s*=\s*\{\s*\{[^,]*,\s*(\w+)\s*\}", txt)}
        for fm in re.finditer(r"\n(?:static\s+)?void\s+(\w+)\([^)]*\)\s*\n\{(.*?)\n\}", txt, re.S):
            for sm in re.finditer(r"SetSubspriteTables\([^,]+,\s*(\w+)\)", fm.group(2)):
                lst = subs.get(tables.get(sm.group(1), ""))
                if not lst:
                    continue
                created = set(re.findall(r"CreateSprite\(&(\w+)", fm.group(2)))
                for t in templates:
                    if t["file"] == f.name and (t["callback"] == fm.group(1) or t["name"] in created):
                        subsprites[t["name"]] = lst
    for t in templates:
        o = t["oam"] or ""
        sm = SIZE_RE.search(o)
        t["size"] = (int(sm.group(1)), int(sm.group(2))) if sm else oam_sizes.get(o)
    return templates, anim_seqs, anim_tables, subsprites


def parse_scripts():
    """Move_* -> (set of tags, set of templates), following call/goto/jump targets."""
    lines = (PRET / "data" / "battle_anim_scripts.s").read_text(encoding="utf-8", errors="replace").splitlines()
    labels: dict[str, list[str]] = {}
    order: list[str] = []
    cur = None
    for ln in lines:
        ln = ln.split("@")[0].rstrip()
        m = re.match(r"^(\w+)::?\s*$", ln)
        if m:
            cur = m.group(1)
            labels[cur] = []
            order.append(cur)
            continue
        if cur and ln.strip():
            labels[cur].append(ln.strip())
    nxt = {a: b for a, b in zip(order, order[1:])}
    terminators = ("end", "return", "goto")

    def collect(label, seen):
        tags, temps = set(), set()  # temps also collects BG_* ids and visual tasks
        while label and label not in seen:
            seen.add(label)
            body = labels.get(label, [])
            for ln in body:
                op, _, args = ln.partition(" ")
                toks = re.findall(r"\b\w+\b", args)
                if op == "loadspritegfx" and toks:
                    tags.add(toks[0])
                if op == "createsprite" and toks:
                    temps.add(toks[0])
                if op in ("fadetobg", "fadetobgfromset"):
                    temps.update("@" + t for t in toks if t.startswith("BG_"))
                if op == "createvisualtask" and toks:
                    temps.add("!" + toks[0])
                for tk in toks:
                    if tk in labels and tk != label:
                        a, b = collect(tk, seen)
                        tags |= a
                        temps |= b
            last = body[-1].split()[0] if body else ""
            if last in terminators:
                break
            label = nxt.get(label)  # falls through into the next label
        return tags, temps

    moves = {}
    for lab in order:
        if lab.startswith("Move_") and lab != "Move_NONE":
            moves[lab[5:]] = collect(lab, set())
    return moves


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_sheet_tiles(path: str, cat_rules) -> tuple[np.ndarray, list[str]]:
    """'graphics/.../x.4bpp.lz' -> tiles (concatenating the PNG parts if needed)."""
    base = re.sub(r"\.lz$", "", path)
    parts = cat_rules.get(base, [base])
    tiles, srcs = [], []
    for p in parts:
        png = PRET / re.sub(r"\.4bpp$", ".png", p)
        tiles.append(png_tiles(png))
        srcs.append(png.relative_to(PRET).as_posix())
    return np.concatenate(tiles), srcs


# Sprites whose callback moves oam.tileNum at runtime (so the anim tables don't
# tell where the frame is).  (tag, "WxH") -> (tile offsets, source reference)
RUNTIME_TILE_OFFSETS = {
    ("ANIM_TAG_LOCK_ON", "16x16"): ([16], "AnimLockOnMoveTarget does oam.tileNum += 16 (battle_anim_effects_1.c)"),
    ("ANIM_TAG_GOLD_STARS", "8x8"): ([4, 5], "AnimMiniTwinklingStar picks tileNum += 4 or 5 (battle_anim_effects_3.c)"),
}


def lower(tag: str) -> str:
    return tag[len("ANIM_TAG_"):].lower()


def anim_to_frames(seq, tpf, tile_offsets=None):
    """AnimCmd list -> [[frameIndex, durationInGbaFrames(, 'h'/'v'/'hv' flips)], ..., ['jump', n]]."""
    out = []
    for c in seq:
        if c[0] in ("jump", "loop"):
            try:
                out.append([c[0], int(c[1], 0)])
            except ValueError:
                out.append([c[0], c[1]])
            continue
        tile, dur, flags = c
        k = tile_offsets.index(tile) if tile_offsets and tile in tile_offsets else tile // tpf
        e = [k, dur]
        if flags:
            e.append(flags)
        out.append(e)
    return out


def template_offsets(t, anim_seqs, anim_tables) -> list[int]:
    """Every tile offset a template's anim table shows (0 for dummy/no anims)."""
    offs = set()
    for a in anim_tables.get(t["anims"] or "", []):
        for c in anim_seqs.get(a, []):
            if c[0] not in ("jump", "loop"):
                offs.add(c[0])
    return sorted(offs) or [0]


def frames_at(tiles: np.ndarray, offsets: list[int], fw: int, fh: int) -> np.ndarray:
    """Strip of frames whose 1D tile data starts at the given tile offsets."""
    tpf = (fw // 8) * (fh // 8)
    need = max(offsets) + tpf
    if len(tiles) < need:
        tiles = np.concatenate([tiles, np.zeros((need - len(tiles), 8, 8), np.uint8)])
    parts = [tiles_to_frames(tiles[o:o + tpf], fw, fh)[0] for o in offsets]
    return np.concatenate(parts, axis=1)


def composite(tiles: np.ndarray, subs: list[dict]):
    """Assemble a sprite from its Subsprite table (each OBJ uses tiles from tileOffset)."""
    x0 = min(s["x"] for s in subs)
    y0 = min(s["y"] for s in subs)
    x1 = max(s["x"] + s["w"] for s in subs)
    y1 = max(s["y"] + s["h"] for s in subs)
    img = np.zeros((y1 - y0, x1 - x0), np.uint8)
    for s in subs:
        part = frames_at(tiles, [s["tileOffset"]], s["w"], s["h"])
        reg = img[s["y"] - y0:s["y"] - y0 + s["h"], s["x"] - x0:s["x"] - x0 + s["w"]]
        np.copyto(reg, part, where=part != 0)
    return img, (x1 - x0, y1 - y0)


def main(verify: bool):
    incbin = parse_incbins()
    cat_rules = parse_cat_rules()
    tag_ids = parse_tag_ids()
    pic, paltab, bgs = parse_tables()
    templates, anim_seqs, anim_tables, subsprites = parse_sources()
    moves = parse_scripts()

    by_tile = defaultdict(list)
    for t in templates:
        by_tile[t["tileTag"]].append(t)
    tag_moves = defaultdict(list)
    temp_moves = defaultdict(list)
    for mv, (tags, temps) in moves.items():
        for tg in tags:
            tag_moves[tg].append(mv)
        for tp in temps:
            temp_moves[tp].append(mv)

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    pal_cache = {}

    def get_pal(tag):
        if tag not in pal_cache:
            sym = paltab.get(tag)
            if not sym or sym not in incbin:
                pal_cache[tag] = (None, None)
            else:
                stem = PRET / re.sub(r"\.gbapal(\.lz)?$", "", incbin[sym])
                pal_cache[tag] = pal_for_stem(stem)
        return pal_cache[tag]

    manifest = {}
    contact = []  # (name, rgba strip, fw, fh, n)
    for tag in sorted(tag_ids, key=tag_ids.get):
        name = lower(tag)
        if tag not in pic:
            warn(f"{tag}: not in gBattleAnimPicTable")
            continue
        gsym, nbytes = pic[tag]
        if gsym not in incbin:
            warn(f"{tag}: no INCBIN for {gsym}")
            continue
        tiles, srcs = load_sheet_tiles(incbin[gsym], cat_rules)
        ntiles = nbytes // 32
        notes = []
        real_tiles = len(tiles)
        if len(tiles) < ntiles:
            notes.append(f"sheet has {len(tiles)} tiles but the pic table loads {ntiles}; padded with blank tiles")
            tiles = np.concatenate([tiles, np.zeros((ntiles - len(tiles), 8, 8), np.uint8)])
        elif len(tiles) > ntiles:
            notes.append(f"sheet has {len(tiles)} tiles, the pic table loads only the first {ntiles}")
        tiles = tiles[:ntiles]

        temps = by_tile.get(tag, [])
        groups = defaultdict(list)          # OAM size -> templates
        for t in temps:
            if t["size"]:
                groups[t["size"]].append(t)
        if groups:
            (fw, fh) = max(groups, key=lambda sz: (len(groups[sz]), sz[0] * sz[1]))
        else:
            # No template uses the tag (mostly Ruby/Sapphire leftovers): sheets are
            # nearly always a vertical stack as wide as one frame, so use the PNG
            # width and a square frame (or the whole loaded height if shorter).
            pw = Image.open(PRET / srcs[0]).width
            fw = pw if pw in (8, 16, 32, 64) else 32
            if real_tiles < ntiles:  # don't invent frames from the pic table's padding
                tiles, ntiles = tiles[:real_tiles], real_tiles
            loaded_h = ntiles * 64 // fw
            fh = next((h for h in (fw, 64, 32, 16, 8) if h <= max(fw, 8) and loaded_h % h == 0 and loaded_h >= h), 8)
            notes.append("no SpriteTemplate uses this tag (unused in FRLG); frame size guessed from the PNG width")
        tpf = (fw // 8) * (fh // 8)
        dom = groups.get((fw, fh), [])
        sub = next((subsprites[t["name"]] for t in dom if t["name"] in subsprites), None)
        dom_offs = sorted({o for t in dom for o in template_offsets(t, anim_seqs, anim_tables)})
        tile_offsets = None
        if sub:
            strip, (fw, fh) = composite(tiles, sub)
            nframes = 1
            notes.append(f"built from the template's subsprite table ({len(sub)} OBJs, {fw}x{fh}); "
                         f"the template OAM is {dom[0]['size'][0]}x{dom[0]['size'][1]}")
        elif all(o % tpf == 0 for o in dom_offs):
            if ntiles % tpf:
                notes.append(f"{ntiles} tiles is not a multiple of {tpf} tiles/frame; trailing tiles dropped")
            strip, nframes = tiles_to_frames(tiles, fw, fh)
        else:
            # mixed sheet: frames start at arbitrary tile offsets -> take exactly those
            tile_offsets = dom_offs
            strip = frames_at(tiles, dom_offs, fw, fh)
            nframes = len(dom_offs)
            notes.append("frames are not on a regular grid; frame k starts at tile tileOffsets[k]")

        # palette choice: the templates' paletteTag (most common), else the tag's own
        ptags = Counter(t["paletteTag"] for t in temps if t["paletteTag"] and t["paletteTag"].startswith("ANIM_TAG_"))
        if ptags:
            best = max(ptags.items(), key=lambda kv: (kv[1], kv[0] == tag))[0]
        else:
            best = tag
        pal, palsrc = get_pal(best)
        if pal is None:
            warn(f"{tag}: palette tag {best} has no palette; falling back to own")
            best = tag
            pal, palsrc = get_pal(tag)
        if pal is None:
            warn(f"{tag}: no palette at all, greyscale")
            pal = [(i * 17, i * 17, i * 17) for i in range(16)]
            palsrc = None
        if best != tag:
            notes.append(f"templates use {best}'s palette")

        rgba = colorize(strip, pal)
        fname = f"{name}.png"
        Image.fromarray(rgba, "RGBA").save(OUT / fname, optimize=True)
        contact.append((name, rgba, fw, fh, nframes))

        entry = {
            "file": fname, "frameW": fw, "frameH": fh, "frames": nframes,
            "tagId": tag_ids[tag], "paletteTag": lower(best),
            "sourcePng": srcs[0] if len(srcs) == 1 else srcs,
            "palette": palsrc, "picBytes": nbytes,
        }
        if tile_offsets is not None:
            entry["tileOffsets"] = tile_offsets

        # other OAM sizes used by templates of this tag -> sub-sheets
        subsheets = {}
        for (w, h), grp in sorted(groups.items()):
            if dom and (w, h) == dom[0]["size"]:
                continue
            key = (tag, f"{w}x{h}")
            real = [t for t in grp if t["anims"] in anim_tables]
            offs = sorted({o for t in (real or grp) for o in template_offsets(t, anim_seqs, anim_tables)})
            if key in RUNTIME_TILE_OFFSETS:
                offs, why = RUNTIME_TILE_OFFSETS[key]
                notes.append(f"{w}x{h} frames: {why}")
            sstrip = frames_at(tiles, offs, w, h)
            sf = f"{name}__{w}x{h}.png"
            srgba = colorize(sstrip, pal)
            Image.fromarray(srgba, "RGBA").save(OUT / sf, optimize=True)
            subsheets[f"{w}x{h}"] = {"file": sf, "frameW": w, "frameH": h, "frames": len(offs),
                                     "tileOffsets": offs, "templates": [t["name"] for t in grp][:6]}
            contact.append((f"{name} [{w}x{h}]", srgba, w, h, len(offs)))
        if subsheets:
            entry["subSheets"] = subsheets
            notes.append("templates also use OAM size " + ", ".join(subsheets) + " (see subSheets)")

        # palette variants: other paletteTags used with this tileTag, and multi-bank palettes
        variants = {}
        for pt in sorted(ptags):
            if pt == best:
                continue
            vpal, vsrc = get_pal(pt)
            if vpal is None:
                continue
            vf = f"{name}__{lower(pt)}.png"
            vrgba = colorize(strip, vpal)
            Image.fromarray(vrgba, "RGBA").save(OUT / vf, optimize=True)
            variants[lower(pt)] = vf
            contact.append((f"{name} [pal {lower(pt)}]", vrgba, fw, fh, nframes))
        if len(pal) > 16:
            for b in range(1, len(pal) // 16):
                vf = f"{name}__bank{b}.png"
                vrgba = colorize(strip, pal, bank=b)
                Image.fromarray(vrgba, "RGBA").save(OUT / vf, optimize=True)
                variants[f"bank{b}"] = vf
                contact.append((f"{name} [bank {b}]", vrgba, fw, fh, nframes))
            notes.append(f"palette has {len(pal)} colours; banks 1+ written as __bankN variants (the game swaps them at runtime)")
        if variants:
            entry["paletteVariants"] = variants

        # anim sequence: first dominant-size template with a real (multi-frame) anim table
        anim = None
        def anim_rank(t):
            seq0 = anim_seqs.get((anim_tables.get(t["anims"] or "") or [""])[0], [])
            return (bool(temp_moves.get(t["name"])), len({c[0] for c in seq0 if c[0] not in ("jump", "loop")}))
        for t in sorted(dom, key=anim_rank, reverse=True):
            if sub or not t["anims"] or t["anims"] not in anim_tables:
                continue
            seqs = [anim_seqs[a] for a in anim_tables[t["anims"]] if a in anim_seqs]
            if not seqs or not seqs[0]:
                continue
            if len([c for c in seqs[0] if c[0] not in ("jump", "loop")]) <= 1 and len(seqs) == 1:
                continue
            anim = {"template": t["name"], "table": t["anims"],
                    "seq": anim_to_frames(seqs[0], tpf, tile_offsets),
                    "numAnims": len(seqs)}
            break
        if anim:
            entry["anim"] = anim["seq"]
            entry["animSource"] = f'{anim["template"]} -> {anim["table"]} (anim 0 of {anim["numAnims"]})'

        tnames = [t["name"] for t in temps]
        mv = sorted(set(tag_moves.get(tag, [])))
        for tn in tnames:
            mv += [m for m in temp_moves.get(tn.split("[")[0], []) if m not in mv]
        entry["usedBy"] = {"moves": sorted(set(mv))[:12], "templates": tnames[:8]}
        if len(set(mv)) > 12:
            entry["usedBy"]["movesTotal"] = len(set(mv))
        entry["notes"] = "; ".join(notes)
        manifest[name] = entry

    # -- backgrounds (optional extra): gBattleAnimBackgroundTable tilemaps, palette slot 2
    bg_manifest = {}
    bgdir = OUT / "backgrounds"
    bgdir.mkdir()
    # BGs that tasks load directly instead of through the table (Surf, Scary Face, Attract)
    extra_bgs = {
        "BG_SURF_OPPONENT": ("gBattleAnimBgImage_Surf", "gBattleAnimBgPalette_Surf", "gBattleAnimBgTilemap_SurfOpponent"),
        "BG_SURF_PLAYER": ("gBattleAnimBgImage_Surf", "gBattleAnimBgPalette_Surf", "gBattleAnimBgTilemap_SurfPlayer"),
        "BG_SURF_MUDDY_OPPONENT": ("gBattleAnimBgImage_Surf", "gBattleAnimBgPalette_MuddyWater", "gBattleAnimBgTilemap_SurfOpponent"),
        "BG_SCARY_FACE_OPPONENT": ("gBattleAnim_ScaryFaceGfx", "gBattleAnim_ScaryFacePal", "gBattleAnimBgTilemap_ScaryFaceOpponent"),
        "BG_SCARY_FACE_PLAYER": ("gBattleAnim_ScaryFaceGfx", "gBattleAnim_ScaryFacePal", "gBattleAnimBgTilemap_ScaryFacePlayer"),
        "BG_ATTRACT": ("gBattleAnimBg_AttractGfx", "gBattleAnimBg_AttractPal", "gBattleAnimBg_AttractTilemap"),
    }
    for bgid, (img_s, pal_s, map_s) in list(bgs.items()) + list(extra_bgs.items()):
        if bgid == "BG_NONE":
            continue
        try:
            tiles = png_tiles(PRET / re.sub(r"\.4bpp\.lz$", ".png", incbin[img_s]))
            pal, palsrc = pal_for_stem(PRET / re.sub(r"\.gbapal\.lz$", "", incbin[pal_s]))
            raw = (PRET / re.sub(r"\.lz$", "", incbin[map_s])).read_bytes()
        except Exception as e:  # noqa: BLE001
            warn(f"{bgid}: {e}")
            continue
        ent = np.frombuffer(raw, "<u2")
        nsb = len(ent) // 1024
        if nsb == 0:  # small maps (1280 bytes) are linear, 32 tiles wide
            nsb, w_t, h_t = 1, 32, len(ent) // 32
        else:
            w_t = 32 * min(nsb, 2)
            h_t = 32 * (2 if nsb == 4 else 1)
        img = np.zeros((h_t * 8, w_t * 8), np.uint8)
        for sb in range(nsb):
            sx, sy = (sb % 2) * 32, (sb // 2) * 32
            for i in range(min(1024, len(ent) - sb * 1024)):
                e = int(ent[sb * 1024 + i])
                t = e & 0x3FF
                tile = tiles[t] if t < len(tiles) else np.zeros((8, 8), np.uint8)
                if e & 0x400:
                    tile = tile[:, ::-1]
                if e & 0x800:
                    tile = tile[::-1, :]
                x, y = sx + i % 32, sy + i // 32
                img[y * 8:y * 8 + 8, x * 8:x * 8 + 8] = tile
        p = list(pal) + [(255, 0, 255)] * 16
        lut = np.array([(r, g, b, 255) for r, g, b in p[:16]], np.uint8)
        rgba = lut[img]
        rgba[img == 0] = (0, 0, 0, 0)  # colour 0 is transparent on a BG layer
        nm = bgid[3:].lower()
        Image.fromarray(rgba, "RGBA").save(bgdir / f"{nm}.png", optimize=True)
        bg_manifest[nm] = {"file": f"backgrounds/{nm}.png", "w": w_t * 8, "h": h_t * 8,
                           "image": incbin[img_s], "palette": palsrc, "tilemap": incbin[map_s],
                           "notes": "BG layer (LoadMoveBg: palette slot 2, 16 colours), colour 0 transparent; the visible 240x160 window is the top-left at scroll 0,0. Many scripts scroll it and alpha-blend it."}

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (OUT / "backgrounds" / "manifest.json").write_text(json.dumps(bg_manifest, indent=1))
    move_map = {mv: {"tags": sorted(lower(t) for t in tags if t.startswith("ANIM_TAG_")),
                     "backgrounds": sorted(t[4:].lower() for t in temps if t.startswith("@")),
                     "templates": sorted(t for t in temps if t[0] not in "@!"),
                     "visualTasks": sorted(t[1:] for t in temps if t.startswith("!"))}
                for mv, (tags, temps) in moves.items()}
    (OUT / "moves.json").write_text(json.dumps(move_map, indent=1))
    print(f"{len(manifest)} tags, {sum(len(e.get('paletteVariants', {})) for e in manifest.values())} palette variants, "
          f"{len(bg_manifest)} backgrounds, {len(move_map)} moves, {len(WARNINGS)} warnings")

    if verify:
        write_contact_sheets(contact, bg_manifest)


def write_contact_sheets(contact, bg_manifest):
    if VERIFY.exists():
        shutil.rmtree(VERIFY)
    VERIFY.mkdir(parents=True)
    try:
        font = ImageFont.truetype("arial.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    MAXW, LABW, SCALE, PAD = 1100, 190, 2, 6
    rows = []
    for name, rgba, fw, fh, n in contact:
        im = Image.fromarray(rgba, "RGBA")
        im = im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)
        fws, fhs = fw * SCALE, fh * SCALE
        per = max(1, (MAXW - LABW) // (fws + 2))
        nrows = max(1, -(-n // per))
        cell = Image.new("RGBA", (MAXW, max(34, nrows * (fhs + 2) + PAD)), (128, 128, 128, 255))
        d = ImageDraw.Draw(cell)
        d.text((4, 2), name, fill=(255, 255, 255), font=font)
        d.text((4, 16), f"{fw}x{fh} x{n}", fill=(220, 220, 220), font=font)
        for k in range(n):
            fr = im.crop((k * fws, 0, (k + 1) * fws, fhs))
            x = LABW + (k % per) * (fws + 2)
            y = (k // per) * (fhs + 2) + 2
            d.rectangle((x - 1, y - 1, x + fws, y + fhs), outline=(110, 110, 110))
            cell.alpha_composite(fr, (x, y))
        d.line((0, cell.height - 1, MAXW, cell.height - 1), fill=(90, 90, 90))
        rows.append(cell)
    sheet, cur, k = [], 0, 0
    for r in rows + [None]:
        if r is None or (cur + r.height > 1400 and sheet):
            img = Image.new("RGBA", (MAXW, cur), (128, 128, 128, 255))
            y = 0
            for s in sheet:
                img.paste(s, (0, y))
                y += s.height
            img.convert("RGB").save(VERIFY / f"sheet_{k:02d}.png")
            k += 1
            sheet, cur = [], 0
        if r is not None:
            sheet.append(r)
            cur += r.height
    # backgrounds
    ims = []
    for nm in bg_manifest:
        ims.append((nm, Image.open(OUT / "backgrounds" / f"{nm}.png").crop((0, 0, 240, 160))))
    if ims:
        cols = 4
        W, H = 250, 180
        img = Image.new("RGB", (cols * W, -(-len(ims) // cols) * H), (128, 128, 128))
        d = ImageDraw.Draw(img)
        for i, (nm, im) in enumerate(ims):
            x, y = (i % cols) * W + 5, (i // cols) * H + 16
            img.paste(im.convert("RGB"), (x, y), im.convert("RGBA"))
            d.text((x, y - 14), nm, fill=(255, 255, 255), font=font)
        img.save(VERIFY / "backgrounds.png")
    print(f"contact sheets: {k} + backgrounds -> {VERIFY}")


if __name__ == "__main__":
    main("--verify" in sys.argv)
