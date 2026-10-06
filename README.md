# Kanto Descent

A Pokémon FireRed × Hades roguelike for the browser: realtime, top-down combat through Kanto, built on FireRed's maps,
music and data. This is a non-commercial fan project.

This repository has **only original code**: the game engine and logic (`web/src`), the Convex backend (`convex/`),
the asset extraction tools (`tools/`), tests and the balance sim (`tests/`), and deploy scripts (`deploy/`).
It has **no Nintendo / Game Freak content**: no ROM, no decomp, no extracted graphics, maps, music or data. You
rebuild all of that locally from your own copy of the game (see below).

The design doc, which is the source of truth for how the game plays, is [DESIGN.md](DESIGN.md).

## References (not included in this repo)

The project needs these, but they are not committed. Each one is gitignored at the path shown.

| Reference | Local path | What it is used for |
|---|---|---|
| **Pokémon FireRed (US) ROM**: your own dump | `rom/firered.gba` | Music, sound effects and cries, read by `tools/extract_sound.js` |
| **[pret/pokefirered](https://github.com/pret/pokefirered)** decompilation | `pokefirered/` | Source for the species/move/trainer/encounter data, graphics, map layouts and battle animations (`tools/extract_*.{js,py}`) |
| **[PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)** (CC BY-NC 4.0) | `web/assets/pmd/` | 8-direction animated Pokémon sprites and portraits, fetched by `tools/fetch_pmd.js` with credits for each species |
| **Generated game assets** | `web/assets/{data,gfx,maps,sound}` | The output of the tools above, which the game loads at runtime. In production they are served from Convex behind sign-in, not from the static site |

The design and code also draw on these projects:

* **Hades** (Supergiant Games): the run structure, boons, Mirror of Night, Chaos rooms, keepsakes and Call
  (design only).
* **Kanto Spire**, a sister FireRed roguelike project. This repo includes code ported from it: the engine core,
  font, title/records/modals, the data/gfx/sound extractors, and the m4a sound-driver port.
* **[pokemon-emerald-arena](https://github.com/GBurgardt/pokemon-emerald-arena)**: the SpriteCollab commit pin and
  the idea of using PMD sprites.
* The **m4a/MP2K sound driver** in `web/src/audio/m4a-core.js` is a JS port of pret/pokefirered's
  `src/m4a.c`, `src/m4a_1.s` and `src/m4a_tables.c`.

## Building the assets

```sh
# 1. Supply the references
cp /path/to/your/firered.gba rom/firered.gba
git clone https://github.com/pret/pokefirered pokefirered

# 2. Extract (see tools/DATA.md, GFX.md, MAPS.md, BATTLE_ANIMS.md)
node tools/extract_data.js
python tools/extract_gfx.py
python tools/extract_maps.py
python tools/extract_battle_anims.py
node tools/extract_sound.js
node tools/fetch_pmd.js

# 3. Run
npm install
node serve.cjs 8092   # http://localhost:8092/
```

Cloud saves and co-op need a Convex deployment (`convex/`). `tools/write_config.cjs` writes the gitignored
`web/config.js`.

## Legal

Pokémon © Nintendo / Creatures / Game Freak. This project is not affiliated with or endorsed by them, and it
distributes none of their assets. The PMDCollab sprites are CC BY-NC 4.0 and belong to their individual artists.
