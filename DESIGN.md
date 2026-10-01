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
