# Battle animation sprites (`tools/extract_battle_anims.py`)

This script turns the FireRed move-effect particles (`pokefirered/graphics/battle_anims/sprites`) and the move backgrounds into RGBA PNG strips for realtime effects. It writes them to `web/assets/gfx/battle_anims/`.

```
python tools/extract_battle_anims.py            # ~5 s; wipes and rewrites web/assets/gfx/battle_anims/
python tools/extract_battle_anims.py --verify   # also writes contact sheets to tools/battle_anims_verify/
```

> **Run order:** a full `python tools/extract_gfx.py` wipes all of `web/assets/gfx/`, including this folder. Run this script again after it.

The colour rules are the same as in `GFX.md`: BGR555 quantisation, a `.pal` file wins over the PNG's own palette, pixel `& 15`, and index 0 is transparent.

## Where the data comes from

| What | Source |
|---|---|
| Which pic and which palette belong to a tag | `gBattleAnimPicTable` / `gBattleAnimPaletteTable` (`src/data/battle_anim.h`). `loadspritegfx` indexes both tables **by position** (`tag - 10000`). The palette table has one mis-tagged entry: index 47 (`SAP_DRIP_2`) is tagged `SAP_DRIP`. The script keys palettes by position, as the game does. |
| Pic → PNG | `INCBIN` paths in `src/graphics.c`. Five sheets are a `cat` of several PNGs (`graphics_file_rules.mk`): `ice_cube`, `ice_crystals`, `mud_sand`, `flower` and `spark`. Their tiles are concatenated in that order. |
| How many tiles are loaded | The pic-table `size` (bytes / 32). Sheets that are shorter than this are padded with blank tiles; longer ones are cut. |
| Frame size | The OAM size of the `SpriteTemplate`s with `.tileTag = ANIM_TAG_X` in `src/battle_anim_*.c`. When several sizes are used, the most common one wins. |
| Palette | The template's `.paletteTag`. In FRLG every template uses `paletteTag == tileTag`, so no tag borrows another tag's palette. |
| Animation | The first anim of the template's `.anims` table (`ANIMCMD_FRAME(tileOffset, duration)`). Templates that are used by move scripts and show more frames are picked first. |
| Moves | `data/battle_anim_scripts.s`. The script follows `call`/`goto`/jump targets from each `Move_*`. |

**1D tile layout:** frame k uses tiles `[k*tpf, (k+1)*tpf)`, laid out row-major, `frameW/8` tiles per row. It is not a crop of the PNG, although most sheets happen to be a vertical stack as wide as one frame.

## Output

`<tag>.png` is the tag name in lower case without `ANIM_TAG_`, for example `small_ember.png`. It is a horizontal strip of `frames` frames, each `frameW`×`frameH`.

`manifest.json` maps each of the 289 tags to an entry:

```jsonc
"small_ember": {
  "file": "small_ember.png", "frameW": 32, "frameH": 32, "frames": 5,
  "tagId": 29,                         // ANIM_TAG_* - 10000
  "paletteTag": "small_ember",         // palette actually used (template .paletteTag)
  "sourcePng": "graphics/battle_anims/sprites/small_ember.png",   // or a list for cat'ed sheets
  "palette": "graphics/battle_anims/sprites/small_ember.png",     // .pal or .png the colours came from
  "picBytes": 2560,
  "anim": [[0,4],[1,4],[2,4],[3,4],[4,4],["jump",0]],  // [frameIndex, GBA frames @60Hz(, "h"|"v"|"hv" flip)]
  "animSource": "gOutrageFlameSpriteTemplate -> sAnims_OutrageOverheatFire (anim 0 of 1)",
  "usedBy": { "moves": ["EMBER", ...], "templates": ["gEmberSpriteTemplate", ...], "movesTotal": 13 },
  "notes": ""
}
```

Optional keys:

- **`subSheets`:** the template uses a second OAM size, so the extra frames are written to `<tag>__WxH.png`, with `tileOffsets` and `templates`. The tags with sub-sheets are `spark` (8x16 bolts), `ice_crystals` (8x16 crystal, 16x16 Blizzard shard), `orbs` (16x16 absorb orb), `small_bubbles` (8x8), `flower` (8x8 petal), `gold_stars` (8x8 twinkles), `mud_sand` (16x16 mud) and `lock_on` (16x16 corner). The `warm_rock` 16x16 sheet is a guess (Eruption sets its tile at runtime).
- **`tileOffsets`:** frames that are not on a regular grid.
- **`paletteVariants`:** only `music_notes_2`. Its palette has 80 colours, and Grass Whistle/Sing cycle through the banks; they are written as `__bank1..4`.
- **Composite tags:** `ice_cube` (96x96, 4 OBJs) and `flying_dirt` (64x16, Sandstorm/Heat Wave) are assembled from their `Subsprite` tables.

`notes` marks the 80-odd tags that **no template uses** (Ruby/Sapphire leftovers). For those the frame size is guessed from the PNG width.

**`moves.json`:** `MOVE → { tags, backgrounds, templates, visualTasks }` for all 355 moves (`Move_NONE` excluded). Some moves have no particles. In those, the effect comes entirely from a background and from visual tasks (screen shake, palette blends): for example `CONFUSION`/`PSYCHIC` (psychic BG), `NIGHT_SHADE` (ghost BG), `EARTHQUAKE` (`AnimTask_HorizontalShake`) and `SURF` (`AnimTask_CreateSurfWave`).

**`backgrounds/`:** 32 move backgrounds from `gBattleAnimBackgroundTable`, plus Surf, muddy Surf, Scary Face and Attract, with `backgrounds/manifest.json`.
- Each is 256x256, 512x256 or 256x160, with colour 0 transparent. The 240x160 view is the top-left corner.
- The game scrolls and alpha-blends these layers. `dark` really is magenta clouds; the game blends it darker.

## Runtime effects the PNGs don't capture

- **Palette effects:** Hyper Beam/Solar Beam orbs flash (`AnimTask_FlashAnimTagWithColor`), Aurora Beam rings rotate their colours, and Thunder inverts the screen.
- **Blending:** many particles use `ObjBlend` OAM, so they are drawn semi-transparent. Ice crystals, the ice cube and the light walls are examples. The script can't tell which, so add alpha yourself.
- **Scaling:** affine anims scale and rotate sprites (rocks, the Fire Blast cross, Shadow Ball spin).

## Which tag to use for common moves

| Move(s) | Tag(s) | Looks like |
|---|---|---|
| Ember, Flamethrower, Fire Spin, Fire Blast, Fire Punch | `small_ember` | 32x32 ×5: a small flame that grows into a red-orange fireball and fades. Fire Blast builds its 大-shaped cross from these. |
| Sacred Fire, Fire Spin (big flames) | `fire`, `fire_plume` | `fire`: 32x32 ×8 looping wall of flame. `fire_plume`: an erupting pillar of fire, 5 frames. |
| Dragon Rage | `fire_plume` + `small_ember` | Spat embers, then the flame plume. |
| Water Gun | `small_bubbles` (+ `water_impact`) | Blue-white droplet and bubble (16x16 ×2); `water_impact` is a blue 8-point splash star. |
| Bubble, Bubble Beam | `bubble`, `small_bubbles` | Pale-blue bubble → popping ring → sparkle (16x16 ×3). |
| Hydro Pump | `water_orb` + `water_impact` | Blue orbs shrinking in 4 steps, plus the splash star. |
| Surf | BG `surf_player` / `surf_opponent` | A big blue wave layer; there are no sprites. |
| Vine Whip | `whip_hit` | Green whip-crack arc → green impact burst (32x32 ×8; anim 0 = frames 4–7). |
| Razor Leaf | `razor_leaf`, `leaf` | `razor_leaf`: a 32x16 green crescent blade. `leaf`: 16x16 ×9 tumbling leaves. |
| Leech Seed | `seed` | A brown seed and two sprouting frames (16x16 ×3). |
| Sleep Powder / Stun Spore / Poison Powder | `sleep_powder` / `stun_spore` / `poison_powder` | 8x16 ×8 falling powder clouds in green / yellow-orange / magenta. |
| Spore | `spore` | A white or tan spore ball (16x16 ×2). |
| Solar Beam | `orbs` (+ BG `solar_beam_*`) | Yellow → orange glowing orbs (8x8), plus a 16x16 big orb in the sub-sheet. |
| Hyper Beam | `orbs` | The same orbs, flashed orange-red at runtime. |
| Thunder Shock | `spark`, `spark_2` | Yellow zig-zag spark bits (8x8, plus 8x16 bolts) and 16x16 arcs. |
| Thunderbolt | `spark`, `spark_2`, `shock_3` | Plus `shock_3`: a blue → cyan → crackling yellow ball (32x32 ×3). |
| Thunder, Thunder Punch | `lightning` (+ BG `thunder`) | 32x32 ×5 yellow/purple lightning bolt segments. |
| Thunder Wave | `spark_h` | A horizontal yellow zig-zag (32x16 ×2). |
| Ice Beam, Powder Snow, Blizzard, Ice Punch | `ice_crystals` | 8x8 ice shards and snowballs, an 8x16 crystal, and a 16x16 Blizzard shard (sub-sheets). |
| Freeze status / Ice Beam end | `ice_cube` | 96x96 lilac ice block (composite). |
| Aurora Beam | `rainbow_rings` (+ BG `aurora`) | 8x16 ×3 rainbow ellipse rings. |
| Poison Sting, Twineedle, Pin Missile | `needle` (+ `poison_bubble`) | A white needle (16x16). |
| Sludge, Sludge Bomb, Acid | `poison_bubble` | A magenta blob → droplet → splat (16x16 ×3). |
| Toxic | `toxic_bubble` | Magenta bubbles rising from a puddle (16x32 ×4). |
| Rock Throw, Rock Slide | `rocks` | Brown boulders in 6 sizes (32x32 ×6). |
| Bone Club, Bonemerang | `bone` | A white bone (32x32); the game rotates it with affine anims. |
| Lick | `lick` | A yellow tongue licking upward (16x32 ×5). |
| Night Shade | BG `ghost` | Red/blue blotchy layer, plus a palette blend; there are no sprites. |
| Shadow Ball | `shadow_ball` | 32x32 dark navy/purple orb with swirling arms. |
| Confusion, Psychic | BG `psychic` | Wavy purple/red striped layer; there are no sprites. |
| Psybeam, Supersonic | `gold_ring` (+ BG `psychic`) | A yellow ellipse ring (16x32). Screech uses `purple_ring`. |
| Scratch | `scratch` | Yellow claw arc forming (32x32 ×5). |
| Slash / False Swipe | `slash` / `slash_2` | Red-orange / blue flash streaks (32x32 ×4). |
| Fury Swipes | `swipe` | Orange triple-claw flame swipe (32x32 ×5). |
| Metal Claw, Dragon Claw | `claw_slash` | A dark-red claw line with a white outline (32x32 ×5). |
| Cut | `cut` | Yellow diagonal slash streak (32x32 ×4). |
| Tackle, Pound, Body Slam, Quick Attack, generic hit | `impact` | A pale-yellow 8-point burst star (32x32). |
| Mega Punch / Mega Kick / Karate Chop | `hands_and_feet` + `impact` | Outlined grey fist, paw, foot and chop hand (32x32 ×4: 0 = fist, 2 = foot). |
| Bite, Crunch | `sharp_teeth` | A white jaw of teeth (64x64); two of them clamp together. |
| Hyper Fang / Super Fang | `fang_attack` | Glowing fang streaks (32x32 ×4). |
| Gust, Wing Attack | `gust` | A grey tornado (32x64). |
| Aeroblast | `air_wave_2` (+ BG `sky`) | A white-grey crescent air blade (32x16). Sonic Boom and Air Cutter use `air_wave`. |
| Sand Attack, Dig debris | `mud_sand` | 8x8 dirt specks and a 16x16 mud splat. |
| Sandstorm | `flying_dirt` | 64x16 streak of flying sand. |
| Dig | `dirt_mound` (+ `mud_sand`) | A 32x16 brown dirt pile. |
| Earthquake, Fissure | BG `fissure`; no sprites | Screen shake (`AnimTask_HorizontalShake`). Fissure adds a crack background. |
| Swift | `yellow_star` | A 32x32 yellow star. |
| Smokescreen | `black_smoke`, `black_ball` | A black smoke puff (32x16) and an 8x8 black pellet. |
| Explosion, Self-Destruct | `explosion` | Fiery burst → ring (32x32 ×4). |
| Focus Energy | `focus_energy` | Rising flame streaks (16x32 ×4). |
| Reflect / Light Screen | `blue_light_wall` / `green_light_wall` | 64x64 striped translucent panes (blend them). |
| Protect | `protect` | A 64x64 green hexagonal shield. |
| Sing, Grass Whistle | `music_notes` / `music_notes_2` | Pink notes (16x16 ×6) / 16 notes with 5 colour banks. |
| Will-O-Wisp | `wisp_fire`, `wisp_orb` | Pale-blue ghost flames with red outlines. |
| Healing (Recover, Moonlight …) | `blue_star`, `sparkle_2` | Blue twinkle burst (32x32 ×7) / gold sparkle field. |
| String Shot / Spider Web | `string`, `web_thread`, `spider_web` | A white string, a thread dot, and a 64x64 web. |
| Leer / Growl | `leer` / `noise_line` | A yellow eye-glint star / orange sound zig-zags. |
| Sky Attack | `bird` (+ BG `sky`) | A 64x64 white bird silhouette. |
| Status hit sparks | `hit` / `hit_2` | Orange-red / blue expanding impact rings (32x32 ×5). |

Background ids (`backgrounds/<name>.png`): `dark ghost psychic impact_* drill(_contests) highspeed_* thunder guillotine_* ice cosmic in_air sky(_contests) aurora fissure bug_* solar_beam_* surf_* surf_muddy_opponent scary_face_* attract`. The per-move list is `moves.json[...].backgrounds`.

## Verification

`tools/battle_anims_verify/sheet_00..14.png` show every tag and sub-sheet with its palette variants on mid-grey, scaled ×2 and labelled. `backgrounds.png` shows all the backgrounds. All of them were checked by eye: embers and fire are orange-red, water and bubbles are blue, leaves green, the bone white, lightning yellow/purple, ice light blue/lilac, poison magenta, and Shadow Ball dark navy-purple.
