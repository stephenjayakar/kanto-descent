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

Current targets and measurements (v0.0.3, `TUNING = { enemyDmg: 3.4, bossDmg: 1.5, bossSecs: 4.6 }`; skill 0.7 is a "decent
player"; 60 to 120 runs each). The owner's target: the bot clears about 20% of HEAT 0 runs **with full research** (Hades-like:
upgrades are needed to win):

| Setup | Win rate |
|---|---|
| Full research, HEAT 0 | ~20% |
| Half research | ~10% |
| Full research, HEAT 5 | ~2% |
| Fresh save | ~0% (most die in the first area) |

* Boss fights take 60-90s (boss HP was doubled in v0.0.2 and raised 10% in v0.0.3).
* **Co-op can't be simmed** (the bot plays P1 only). It is scaled by hand: twice the foes, foes x1.25 damage, bosses x1.8 HP and
  x1.2 damage, and P2 revives after 15s.

## Acts (v0.0.3)
* A run is 3 acts (`ACTS` in content.js). Acts 1 and 2 each draw 2 of 3 areas in random order; act 3 is Cerulean Cave (6 rooms).
  * Act 1: Viridian Forest (Brock), Mt. Moon (Misty), Rock Tunnel (Lt. Surge).
  * Act 2: Pokémon Tower (Marowak), Silph Co. (Giovanni), Seafoam Islands (Lorelei).
* `run.biome` is the stage (0-4) and drives all scaling. `run.route[stage]` is the area's key (`areaOf(run)`).
* Wild levels shift by `STAGE_LEVEL[stage] - STAGE_LEVEL[area.design]`. Bosses use `scaledBoss(key, stage)`, which maps a boss
  onto the reference level of the stage it appears at.
* Records store `area` (its key); older runs fall back to the area index.

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
* **Bosses always reach you (v0.0.2):** boss shots and beams pass over walls and water. A boss that can't see you for 2.2s
  burrows/warps to a spot 60–110px from you that can, then waits 0.6s before attacking. Every boss has an arena-wide `storm`
  (marked blasts, every third one under you). Misty's Swift, Bubble Beam and a 640px Hydro Pump sweep cover the whole gym.
* **Enemy reach (v0.0.2):** enemy shots fly at 72% speed but live 1.5× longer (bosses 1.6×), so they reach slightly further than
  yours. Ranged foes fire from their full range. Lunges and charges start from 80% of their full travel distance.
* **Boons:** a blessing that replaces another legend's blessing in the same slot is offered at least one rarity higher (max
  MASTER). Every boon offer can be skipped, and the screen lists the blessings you already have.
* **Dash crosses gaps** (tiles that block walking but not shots: water, ledges). A dash that ends over a gap carries on for up
  to 0.1s more, otherwise the player drops onto the nearest ground. Onix's charge (`through: true`) burrows through rock;
  leaps and burrowing charges `settle()` onto the nearest open ground.
* **Every line can evolve:** `nextEvolution()` gives each method a level (trade/friendship/beauty 30, stones 32, SPECIAL_EVOS
  first). The caught partner evolves as the player levels (`evolvePartner`).
* **Money is scarce (v0.0.2):** kills give ¥(1 + level/4), trainer prizes are class money ×2 + 10, Nuggets ¥70 + 30/biome. The
  pre-boss Pokémon Center's clerk sells no Potions (Nurse Joy heals there); the mid-area Poké Mart still does.
* **HEAT** (pick it from the rival in the lab after your first escape): 10 cumulative rules, each adding foe damage, with
  +10% STARDUST per level.

## Versions, records and title
* `web/src/game/version.js` holds `VERSION` and `PATCH_NOTES` (newest first). Bump both for every playtest build; the title
  opens new notes once per player (`G.meta.seenVersion`). Finished runs are tagged with the version and scored by
  `web/src/game/score.js` (the server recomputes the score in `game:addRun`).
* The title screen, records screen (`scenes/records.js`) and modals (`scenes/modal.js`) are ported from Kanto Spire. Records
  shows leaderboards by trainer name (`players` table, `game:rename`), never emails. After a prod deploy that changes run
  fields, run `npx convex run game:backfillRuns --prod`.

## Saves, accounts and hosting
* **Autosave:** the run is snapshotted at the start of every room, before the room rolls its enemies. Pause → **Save & quit to title**, or
  just close the tab; **Continue** on the title screen resumes from the start of that room.
* **Accounts:** players sign in with Google through Convex Auth. The OAuth client is the same one Kanto Spire uses (Google Cloud project
  polar-column-510319-q2), and both Convex callback URLs are registered on it. Only emails in the `allowedEmails` table can play, sync
  saves or download assets:
  * `npx convex run access:allow|revoke|list [--prod]`;
  * **invite links:** only aj12ay@gmail.com can create them (title screen → *Make an invite link*, or
    `npx convex run invites:createInternal '{"note":"name"}' --prod`). The link is `<site>/?invite=CODE`, it's single-use and it lasts
    14 days; the first account to sign in with it joins the allowlist.
* **Saves:** `profiles` (progression), `saves` (the run in progress) and `runs` (history), keyed by the signed-in account's email.
  localStorage is written first, so play continues offline.
* **Assets are never on the public site:**
  * `node tools/upload_packs.mjs [--prod]` packs the pruned asset set (`tools/asset_list.mjs`, ~28 MB) into chunks under 12 MB and
    uploads them to Convex storage;
  * `GET /pack` serves them to allowed accounts only;
  * the client caches them by hash and serves them from memory (`web/src/game/assetpack.js`).
* **Local dev:** `node tools/write_config.cjs`, then `node serve.cjs 8093`. Assets load from `web/assets`, and Google sign-in is
  optional (dev deployment neat-kudu-314, SITE_URL http://localhost:8093).
* **Deploy:** `deploy/prod.sh` (master, committed). It runs:
  1. `npx convex deploy -y` (prod enchanted-newt-545);
  2. `node tools/upload_packs.mjs --prod` (only changed packs upload);
  3. `node tools/build_site.mjs` (code only; it refuses asset files);
  4. `codex exec --dangerously-bypass-approvals-and-sandbox -C <repo> - < deploy/prod_sites_prompt.txt` (codex's ChatGPT
     Sites connector pushes the commit to the site's source repo, uploads dist/ and deploys).
  * Needs `npx convex` logged in (`~/.convex/config.json`) and the codex CLI logged in to the ChatGPT account that owns the site.
  * The ChatGPT Site is https://kanto-descent.stephenjayakar.chatgpt.site (project appgprj_6abfb709d628819189468cd9ce5a15b1).
    Its access is public; access control lives in the Convex backend.
  * Convex Auth env per deployment: AUTH_GOOGLE_ID/SECRET, JWT_PRIVATE_KEY and JWKS (`tools/gen_auth_keys.mjs`), and SITE_URL.

## Co-op (in prod since v0.0.3; staging was branch `coop`, now merged)
* **Design:** host-streamed remote play. The host's browser runs the game with a second player (`web/src/game/coop.js`):
  * P2 is its own starter that evolves with the shared level, sharing blessings, held item and money.
  * When P2 faints it is revived after 8s, or when the room is cleared. It never uses the run's revives or ends the run.
* **Streaming:** the guest (`scenes/guest.js`, link `?coop=CODE`) gets the host's canvas and audio as a WebRTC stream, and sends
  keyboard/mouse/gamepad state over an unreliable data channel. Presses are sent as counters, so a dropped packet can't eat a tap.
* **Signalling:** Convex `coop:create/get/answer` relays the offer and answer only. STUN only, with no TURN server yet.
* **Test:** `node tests/coop_e2e.mjs` runs two headless Chromes with a mocked Convex and real WebRTC.
* **Staging:** https://kanto-descent-staging.stephenjayakar.chatgpt.site (project appgprj_6ac14ba642f4819197cbfbb4c58ad4cf) uses the
  **dev** Convex deployment (neat-kudu-314). That deployment has its own allowlist and packs, and its SITE_URL lists the staging origin.
* **Deploy staging:** `deploy/staging.sh` (current branch, committed). It runs `npx convex dev --once`,
  `node tools/upload_packs.mjs`, `OUT=dist-staging CONVEX_URL_PROD=https://neat-kudu-314.convex.cloud node tools/build_site.mjs`,
  then codex with `deploy/staging_sites_prompt.txt` (which packages dist-staging as "dist").

## TODO (owner's suggestions)
* ~~Co-op: each player gets their own boon list and their own reward choices.~~ Done: per-player runs, parallel boon picks.
* PvP mode: two players (co-op link) fight each other in an arena (or race the same seed), with their own builds.
* Beam/stream clash (idea from upstream pokemon-emerald-arena 0.12): when the player's beam meets a boss beam head-on, the jets push against each other, then explode, with no damage.
* More boons, inspired by Hades: more per legend, more duos, more ways to build (e.g. Hades-style status curses that stack, cast/dash variants, legendary-tier boons with prerequisites).
