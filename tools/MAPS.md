# Overworld map pipeline (`tools/extract_maps.py`, `tools/room_candidates.py`)

`extract_maps.py` renders every map layout in `pokefirered/data/layouts/layouts.json` (364 layouts with block data) into `web/assets/maps/`.

```
python tools/extract_maps.py                       # all layouts (~1.5 min); also rewrites index.json
python tools/extract_maps.py LAYOUT_MT_MOON_1F ... # only these; index.json still lists every layout
python tools/extract_maps.py --verify              # also writes contact sheets to tools/maps_verify/
python tools/room_candidates.py [LAYOUT_ ...|--all] # arena crops -> web/assets/maps/rooms_candidates.json
```

Coordinates are in metatiles (blocks). One block is 16x16 px, so block `(x, y)` covers pixels `(16x, 16y)` in the PNGs. Every per-block array is row-major with `index = y*w + x`.

## Rendering rules (all taken from the C source)

- **Colours:** JASC `.pal` values go through BGR555, `c5=v>>3; out=(c5<<3)|(c5>>2)`, the same as `extract_gfx.py`. Tile pixels use the low nibble only.
- **Palettes** (`fieldmap.c LoadTilesetPalette`):
  - Slots 0-6 come from the primary tileset's `palettes/00-06.pal`. Colour 0 of slot 0 is forced to black.
  - Slots 7-12 come from the secondary tileset's `palettes/07-12.pal`.
  - Slots 13-15 are not loaded by the map code. They are filled from the secondary files, but no layout uses them (the script warns if one does).
- **Tiles:**
  - VRAM tiles 0-639 are the primary `tiles.png`, 640-1023 are the secondary `tiles.png` (secondary index = tile - 640).
  - Sheets are cut to the `-num_tiles` value in `tileset_rules.mk`. Tiles beyond that count are blank.
  - The tile/palette symbols for `gTileset_General` live in `src/graphics.c`; every other tileset is in `src/data/tilesets/graphics.h`.
- **Metatiles:** 8 u16 tilemap entries each: 4 bottom (TL, TR, BL, BR), then 4 top. Entry = tile `&0x3FF`, hflip `0x400`, vflip `0x800`, palette `>>12`.
- **Metatile ids:** ids >= 640 are in the secondary tileset (index = id - 640). Ids above 1024 become 0, as in `DrawMetatileAt`.
- **Attributes** (u32, `sMetatileAttrMasks`):

  | Field | Bits |
  |---|---|
  | behaviour | 0-8 |
  | terrain | 9-13 |
  | encounter | 24-26 |
  | layer type | 29-30 |

- **Layers** (`field_camera.c DrawMetatile`; `overworld.c` puts buffer1 on BG2 at priority 2, buffer2 on BG1 at priority 1, buffer3 on BG3 at priority 3; object sprites are normally priority 2):

  | Layer type | BG3 (under) | BG2 (under) | BG1 (over) |
  |---|---|---|---|
  | NORMAL (0) | entry `0x3014` (filler) | bottom | top |
  | COVERED (1) | bottom | top | – |
  | SPLIT (2) | bottom | – | top |

  - `under.png` = black backdrop + BG3 + BG2. It is fully opaque.
  - `over.png` = BG1, with colour index 0 transparent. Draw it after (above) sprites.
  - Tree tops, roofs, and the black void around interiors live in `over.png`.
- **Not rendered:** door and other script-driven metatile swaps, border blocks, and connections to neighbouring maps.

## `web/assets/maps/<LAYOUT_ID>/`

| File | Contents |
|---|---|
| `under.png` | RGBA, `16w x 16h`, opaque. |
| `over.png` | RGBA, `16w x 16h`, transparent where there is no BG1 pixel. Always written; check `hasOver`. |
| `meta.json` | See below. |
| `anim.json` + `anim_<name>_<layer>.png` | Only if a tileset animation is visible in this layout (`hasAnim`). |

### `meta.json`

```
id, name            "LAYOUT_PALLET_TOWN", "PalletTown_Layout"
w, h                size in blocks
primary, secondary  tileset symbols, e.g. "gTileset_General", "gTileset_PalletTown"
collision           string, w*h chars '0'..'3'   (map.bin bits 10-11; 0 = passable)
elevation           string, w*h hex chars '0'..'f' (map.bin bits 12-15)
behavior            int array, w*h  MB_* numeric ids
behaviorNames       {"<id>": "MB_..."} for every id used in this layout
metatile            int array, w*h  metatile ids (map.bin & 0x3FF)
layerType           string, w*h chars '0' NORMAL / '1' COVERED / '2' SPLIT
terrain             string, w*h hex chars (attr bits 9-13)
encounter           string, w*h chars (attr bits 24-26: 0 none, 1 land, 2 water)
hasOver, hasAnim    bool
maps                MAP_* ids that use this layout
```

Walkability is not the same as `collision == 0`. Water (`MB_POND_WATER`, `MB_OCEAN_WATER`, `MB_DEEP_WATER`, ...), ledges (`MB_JUMP_*`) and currents have collision 0 but need Surf or are one-way.

### `anim.json`

`src/tileset_anims.c` is parsed, not hard-coded. The animations are:

- General flower, water and sand edge
- Celadon City fountain
- Silph Co fountain
- Mt. Ember steam
- Vermilion Gym door
- Celadon Gym flowers

```
{ tickHz: 60, cellSize: 8,
  anims: [ { name, layer: "under"|"over", sheet, frames, interval, phase,
             cols, rowsPerFrame, slots,
             cells: [[px, py, slot], ...] } ] }
```

**Current frame:** at tick `t` (60 Hz, counted from map load), `f = floor((t - phase) / interval) mod frames`. For `t < phase`, use the static PNG.

**Drawing:** for every cell `[px, py, slot]`, copy the 8x8 block at `sheet(sx, sy)` to `(px, py)` in that layer, where:

- `sx = (slot % cols) * 8`
- `sy = (f * rowsPerFrame + floor(slot / cols)) * 8`

**Cell contents:** each cell is fully composited for its layer, so under cells already include the backdrop, BG3 and BG2. Identical cells share one slot.

**Caveat:** if a cell contains tiles from two animations, the other animation is shown at its baked `tiles.png` frame. The script prints a warning count when this happens.

**Sequence:** frame lists are already expanded. Celadon Gym flowers run 0, 1, 2, 1, so the sheet holds 4 frames.

**Known mismatch:** the baked `tiles.png` art for flowers and the Celadon fountain differs slightly from anim frame 0.

## `web/assets/maps/index.json`

```
{ tileSize: 16,
  layouts: { LAYOUT_ID: { name, w, h, primary, secondary, maps: [MAP_*], hasOver, hasAnim } },
  maps:    { MAP_ID: { name, layout, music, map_type, weather, floor_number,
                       warp_events:   [{x, y, elevation, dest_map, dest_warp_id}],
                       object_events: [{x, y, graphics_id, local_id, type, trainer_type, flag}] } } }
```

The data comes from `data/maps/*/map.json`. Several maps share a layout: there are 12 Marts and every Pokémon Center 1F.

## `rooms_candidates.json` (`tools/room_candidates.py`)

```
{ LAYOUT_ID: { w, h, candidates: [ {x, y, w, h, whole, walkableFrac, compFrac, warps, score?} ] } }
```

**Walkable:** `collision == 0`, and the behaviour is not water, seaweed, a ledge, a current, a hole (`MB_FALL_WARP`) or cracked ice. Warp, door and ladder tiles count as walkable; `warps` says how many are inside the rect.

**Crops:**

- Landscape rectangles from 16x10 to 26x16 blocks.
- Walkable fraction between 0.45 and 0.85.
- The largest 4-connected walkable component holds at least 90% of the walkable cells (`compFrac`).
- Score = `(area/416)^0.35 * (1 - 1.5*|frac-0.65|) * compFrac`.
- Up to 8 non-overlapping crops per layout. Selection is greedy by score, restarted from each of the best 80 first picks; the set with the highest summed score wins.

**Whole layouts:** layouts no bigger than 30x25 also get a `whole: true` entry. It is the bounding box of the largest walkable component, which covers gyms, Elite Four rooms, tower floors, Marts and Centers.

**Previews:** `tools/maps_verify/rooms/<LAYOUT>.png` shows every candidate on the layout. Non-walkable blocks are darkened, crops are drawn as numbered coloured boxes, and the whole-layout box is white.

## Verification sheets (`--verify`)

`tools/maps_verify/` contains:

- `towns_interiors`, `forest`, `mt_moon`, `pokemon_tower`, `silph_co`, `rocket_hideout`, `seafoam`, `cerulean_cave`, `victory_road`, `elite_four` (`under` + `over` composited)
- `collision.png`: collision != 0 tinted red
- `layers.png`: `under` next to `over` on magenta
