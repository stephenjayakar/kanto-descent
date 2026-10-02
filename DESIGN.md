# Kanto Descent — a FireRed × Hades roguelike

A browser game with realtime, top-down combat in the style of Hades. The maps, music, sound effects, cries, item
icons, battle-animation sprites and Pokémon/move/trainer/encounter data come from Pokémon FireRed: the
pret/pokefirered decomp plus your own ROM. Pokémon are drawn with PMDCollab SpriteCollab's 8-direction
animated sprites, the same source pokemon-emerald-arena uses. This is a private fan project.

Run it with `node serve.cjs 8092` and open http://localhost:8092/.

## The loop
* **Hub: Professor Oak's lab**, the real FireRed map. Walk around as your partner.
  * **Poké Balls on the table:** choose your starter.
  * **Oak:** spend STARDUST on permanent research (Hades' Mirror of Night).
  * **Aides:** records and the tutorial.
  * **Lab door:** starts a run.
* **A run** goes through five areas. Each area is a chain of rooms cropped from real FireRed maps, ending in a boss:
  1. **Viridian Forest.** Boss: Brock's Onix in the real Pewter Gym (Geodude join at 60% and 30% HP).
  2. **Mt. Moon.** Boss: Misty's Starmie in the Cerulean Gym. Starmie crosses the pool; Staryu joins.
  3. **Pokémon Tower.** Boss: the restless GHOST, revealed as Marowak at half HP. Bonemerangs, leaps, phasing.
  4. **Silph Co.** Boss: Giovanni's Rhyhorn and Kangaskhan together, then Nidoqueen.
  5. **Cerulean Cave.** Boss: Mewtwo, in three phases (Barrier, sweeping Psybeam, Shadow Ball rings, Future Sight, Psystrike storm).
* **Rooms:** clear the waves, collect the reward, then pick the next door. Each door shows its reward.
* **Wild rooms** use the area's real FireRed encounter table, at the table's levels plus depth scaling.
* **Trainer rooms** use real trainers from that map with their real parties. They show the trainer class
  overworld sprite and play the encounter and battle music.
* **Pokémon Center:** Nurse Joy heals you. One always comes right before the boss, with a Mart clerk.
* **Poké Mart:** potions, Rare Candy, PP Up, balls, HP Up, TMs, held items, Sacred Ash.
* **Deoxys rooms** (Hades' Chaos): take 15% HP and a curse for a few rooms, then a permanent blessing.

## Combat
* **Controls:**
  * WASD: move. Space: dash, with i-frames, 1 charge plus upgrades.
  * J / left click: **Attack**. K / right click: **Special**. Q: **Cast**.
  * R: throw a Poké Ball. F: Call your partner. E: interact.
  * The mouse aims once you move it. Otherwise you get soft auto-aim. Gamepads work.
* **Moves have realtime profiles** (`web/src/game/moves_rt.js`): swipe combos, lunges, charges, multi-hits,
  projectiles, streams, beams, chain lightning, novas, targeted strikes, lingering clouds, buffs, debuffs,
  heals, Protect, Teleport, Dig and Fly. About 150 moves are hand-tuned; the rest are derived from the
  move's real data (power, type, effect, contact flag).
* **Damage** uses the Gen 3 formula: real base stats and levels, STAB, the type chart, crits, the
  physical/special split by type, and stat stages from Growl, Leer, Swords Dance and so on.
* **Statuses:** burn (stacks), poison and toxic, paralysis, sleep, confusion (enemies hit each other),
  chill (5 stacks freeze), freeze (+50% damage taken, shatters), trap, flinch.
* **Enemies telegraph** their attacks in red. The AI picks from the enemy's real moveset; Metapod and
  Kakuna inherit their pre-evolution's attacks. Flyers cross water, ghosts phase through walls.
* **Catching:** weaken a wild Pokémon below 35% HP (the bar shows a ball marker), then throw with R. The
  catch uses the Gen 3 formula with ball and status bonuses. The caught Pokémon becomes your **partner**:
  press F when the gauge is full to call it in for 10 seconds (Hades' Call).

## Progression within a run
* **EXP and levels:** levels use the real growth curves, and a level up raises max HP like the games.
  * Moves are learned at the real learnset levels. When a room is cleared you choose a slot or skip,
    like "forget a move".
  * Evolution happens at the real levels. Stone and trade evolutions happen at fixed levels instead.
    At 20, Eevee picks Vaporeon, Jolteon or Flareon.
* **Legendary blessings** (Hades boons), one per slot (attack, special, dash, cast) plus passives:
  * **Zapdos:** lightning strikes, chains, paralysis.
  * **Articuno:** chill, freeze, Shatter, Ice Body.
  * **Moltres:** stacking burn, fire trail, Sunny Day, Blaze.
  * **Mew:** crits, Agility, Quick Feet, dodge, Pickup, Metronome.
  * **Lugia:** knockback, wall slams, Tailwind, Whirlpool vortex.
  * **Ho-Oh:** Sacred Ash revive, deflecting dash, Rainbow Wing heal, shield.
  * **Duo blessings (MASTER rarity):** Frozen Storm, Steam Burst, Plasma Fists, Tidal Rebirth, Mirage Gust.
  * **Rarity tiers** are the ball tiers POKé, GREAT, ULTRA and MASTER. A PP Up levels a blessing.
* **Door rewards:** blessing, Rare Candy (+2 levels), HP Up, PP Up, Nugget (money), TM (from the
  species' real TM list), Stardust or Star Piece, Poké Balls, held item, Mart, Center, Deoxys.
* **Held items** (Hades keepsakes, 1 slot): Leftovers, Quick Claw, Scope Lens, Shell Bell, Focus Band,
  King's Rock, Lucky Egg, Amulet Coin, Exp. Share, BrightPowder, Choice Band, and the type boosters.

## Permanent progression
* **Stardust** comes from reward rooms, bosses (more the first time) and new Pokédex catches.
* **Oak's research:**
  * More HP and damage, and Revivals.
  * Higher starting level, a second dash, money and balls.
  * Lucky Egg EXP, Shiny Charm boon rarity, Itemfinder door rerolls, and a longer partner Call.
* **Starters:** Charmander, Bulbasaur and Squirtle at first. Brock unlocks Pikachu, Misty unlocks Eevee,
  Marowak unlocks Gastly and Giovanni unlocks Dratini.

## Code map (web/src)
| File | What |
|---|---|
| `engine/` | Canvas, loop and overlays (from Kanto Spire), FireRed bitmap font, UI helpers, `input.js` (keyboard, mouse, gamepad), seeded RNG |
| `audio/` | FireRed m4a sound engine in an AudioWorklet (real songs, SFX, cries from the ROM) |
| `game/combat.js` | World simulation at a fixed 60 Hz: actors, actions, projectiles, zones, strikes, damage, statuses |
| `game/combat_boons.js` | Boon helpers on World: lightning strikes, chains, novas, vortex, Metronome, timers |
| `game/moves_rt.js` | Realtime move profiles |
| `game/ai.js` / `bosses.js` | Enemy brains and the five boss fights |
| `game/player.js` | Player controller, dash, combos, Poké Balls and catch formula, partner Call |
| `game/rooms.js` | Builds room collision, water, ledges, tall grass, entry and exits from real map layouts; tile animations |
| `game/render.js` | Draws the world: map layers, telegraphs, PMD sprites, battle-anim sprites, effects |
| `game/run.js` | Run state, meta save, EXP/evolution, door rolls, boon/TM/held choices, combat hooks |
| `game/boons.js`, `content.js`, `spawn.js` | Boons, biomes, starters, items, research, encounter and trainer spawning |
| `scenes/room.js` | The gameplay scene: waves, trainers, bosses, rewards, doors, NPCs, camera, HUD |
| `scenes/rewards.js` | Reward and choice flows, shop, center, Deoxys, evolution, hub, pause, game over, victory, dev entry |
| `dev/autoplay.js` | Smoke-test bot that plays a whole run |

## Asset pipelines (tools/)
* `extract_data.js`, `extract_gfx.py`, `extract_sound.js`: from Kanto Spire (data, UI/sprites, music/SFX).
* `extract_maps.py` (MAPS.md): renders every map layout to under/over PNG layers, plus collision,
  behaviour, warps and tile animations.
* `room_candidates.py`: finds good arena crops in the layouts.
* `extract_battle_anims.py` (BATTLE_ANIMS.md): all 289 battle-animation sprite tags as frame strips.
* `fetch_pmd.js`: PMDCollab SpriteCollab sprites and portraits for 172 species, pinned to the same commit
  as emerald-arena, with credits per species.

## Testing
* `node tests/browserd.cjs` drives headless Chrome. Send it commands with `tests/b.sh '{"cmd":...}'`.
* `?dev=combat|boss|shop|center|chaos|trainer&biome=N&level=L&starter=X&boons=Z_ATTACK,...` jumps straight
  into a room.
* `?hub` skips the title screen.
* `import('./src/dev/autoplay.js').then(m => m.start({god:true}))` plays a full run.

## Balance (tuned with the headless simulator)
`node tests/sim/sim.mjs <runs> <starter|all> <skill 0..1> [research 0..1]` plays complete runs through the real
scenes and combat code in Node. `tests/sim/env.mjs` stubs fetch, Image, audio and timers. The bot aims with the mouse, dodges
telegraphs (`skill` sets its reaction time and how often it dodges), paths around walls, makes the reward and shop
choices, and catches partners. The report covers win rate, where runs die, per-boss pass rate, fight length and HP lost, and
per-starter results, plus a breakdown of damage taken by attack type.

Environment variables:

| Variable | Effect |
|---|---|
| `TUNE='{"enemyDmg":..}'` | Overrides `TUNING` in content.js |
| `HEAT=n` | Sets the HEAT level |
| `R='{"revive":1}'` | Sets individual research ranks |
| `START='dev=boss&biome=1&level=24'` | Starts every run at a specific room |

Current targets and measurements (skill 0.7 is a "decent player"; about 40 to 100 runs each):

| Setup | Win rate |
|---|---|
| Fresh save | ~29% (no dodging 12%, perfect dodging 33%) |
| Half of Oak's research | ~74% |
| Full research | ~79% |
| Full research, HEAT 5 | ~40% |
| Full research, HEAT 10 | ~14% |

* **Boss pass rates:** Brock, Misty, Marowak and Giovanni are each passed about 85–95% of the time; Mewtwo about 50%. Combat rooms take about 18s.
* **Starters:** the spread is now 39–57% when the global tuning is easier (the gap used to be 4% to 71%).

Rules that came out of two adversarial review rounds and the sim:
* **Telegraphs are readable.** Enemy ground blasts give at least 0.8s of warning (bosses 0.65s), enemy shots fly at 72% speed,
  and enemy windups are 0.45–0.7s. Dodging measurably changes outcomes.
* **Boss HP** = target seconds × your sustained DPS. DPS is measured at the level you're expected to have at that boss, with an
  uptime estimate per move type (melee, aimed or homing). Type matchups are compressed (^0.8), and there's a low floor against
  status-only kits. Being over-leveled, upgraded or boon-buffed makes boss fights shorter.
* **Type matchups against the player are compressed:** regular foes ×0.6–1.5, bosses ×0.9–1.1. The player's own moves are never
  below ×0.5. Matchups matter but never decide a run.
* **The player has floors on HP, DEF and SP.DEF** (base 70) and levels on one shared EXP curve. Moves that only hurt the user
  (Explosion and similar) are never offered.
* **Bosses resist control:** no flinch, short sleep/disable with a 4s immunity window, and paralysis only slows them.
  Damage-over-time against bosses is weak. Stat stages are capped at ±2 and last 8s.
* **On-hit boon procs** trigger at most once per target every 0.25s.
* **HEAT** (pick it from the rival in the lab after your first escape): 10 cumulative rules, each adding foe damage, with
  +10% STARDUST per level.

## Saves
* **Autosave:** the run is snapshotted at the start of every room, before the room rolls its enemies. Pause → **Save & quit to title**, or
  just close the tab; **Continue** on the title screen resumes from the start of that room (Hades-style).
* **Cloud saves** go to Convex (`convex/`, project `kanto-descent`) and are keyed by the email you enter on the title screen:
  * tables: `profiles` (progression), `saves` (the run in progress) and `runs` (finished-run history);
  * the browser talks to Convex's HTTP API with `fetch`, so there's no bundler. `web/config.js` holds the deployment URL;
    regenerate it with `node tools/write_config.cjs`;
  * localStorage is always written first, so the game works offline;
  * on sign-in, whichever progression is further along wins, and so does the newer run save;
  * access control: every Convex function requires the deployment's `ACCESS_KEY` plus an email listed in `ALLOWED_EMAILS`
    (`npx convex env set [--prod] ...`). The keys live in the gitignored `.env.access.dev` and `.env.access.prod`.
    `web/config.js` (generated, gitignored) carries the dev key; the deployed site carries the prod key.
* **Deploying function changes:** `npx convex dev --once`.

## Deploying (private ChatGPT Site + Convex prod)
1. Deploy the Convex functions to prod: `npx convex deploy -y` (prod deployment `enchanted-newt-545`).
2. Build the site: `node tools/build_site.mjs` writes `dist/`. It holds the code, only the assets the game can use (~30 MB)
   and a `config.js` with the prod URL, the prod key and the default email.
3. Test locally: `node serve.cjs 8094 dist`.
4. Publish: `codex exec --dangerously-bypass-approvals-and-sandbox -C <repo> - < tests/out/sites_deploy_prompt.txt`.
   * The site is private, with an access allowlist of exactly aj12ay@gmail.com.
   * `dist/` and `web/assets/` are never committed; they only go up inside the site archive.
