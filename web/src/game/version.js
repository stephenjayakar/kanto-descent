// Game version and patch notes (shown from the title screen). Only cut a new version when asked.
export const VERSION = 'v0.0.5';

// Newest first. Each entry: { v, sections: [[TITLE, [lines]]] } (an empty title means no heading).
export const PATCH_NOTES = [
  {
    v: 'v0.0.5',
    sections: [
      ['', [
        'HQ AUDIO (on by default): music and sounds are mixed at full precision with 12 voices instead of 5, smoothed between samples, with soft-limited peaks and the harsh top end filtered out. No more crunch or crackle in busy battle themes. Switch back to the authentic GBA sound in SETTINGS.',
        'Talking and using things no longer misses presses: on 120/144 Hz screens a quick tap of E / the talk button could be lost. They also work from further away (NURSE JOY and the clerks from anywhere along their counter).',
        'THUNDER (yours and LT. SURGE’s RAICHU) hits like it should: a tall column of lightning, crackling sparks, a flash and a heavier shake. Electric hits no longer show a flat blue disc.',
        'Controllers: a worn stick that rests off-centre (or a second device that isn’t a gamepad) no longer makes you walk on the spot.',
        'Xbox controllers use Hades’ layout: X attack, Y special, B cast, A dash, RB talk / interact, RT call your partner, LT throw a POKé BALL, VIEW blessings, START pause.',
      ]],
    ],
  },
  {
    v: 'v0.0.4',
    sections: [
      ['ART PASS (REAL FIRERED ART)', [
        'Beams are streams of FireRed particles: PSYBEAM rings, ICE BEAM crystals, HYDRO PUMP water, sparks for electric beams, each with its own hit.',
        'THUNDERBOLT chains are built from spark tiles and THUNDER is a column of lightning. WATER GUN fires droplets. BLIZZARD and WHIRLPOOL use the game’s ice crystals and water orbs. SMOKESCREEN now shows its smoke.',
        'HP bars are the GBA’s own bar tiles, with the status icon beside them, the caught-ball mark and stat arrows. Shadows, dust and grass rustles are FireRed’s field effects.',
        'Bursts and rings are made of each move’s particles. Effects stay inside the arena and are drawn at clean pixel sizes. Damage numbers are sharper, fan out and add up over time.',
        'The evolution screen is FireRed’s (swirl, sparkles, the real sprites), and the magenta band is gone.',
        'Doors use FireRed’s warp arrows with the reward in a window; locked exits show an X. The pause menu is a START menu. Item balls for rewards.',
        'Boss bars no longer cover the boss, dialogue hides the HUD, the shop list fits, and icons are no longer blurry. MEWTWO’s psychic attacks flash the Psychic background.',
      ]],
      ['CONTROLLERS', [
        'Xbox (XInput) controllers: every connected pad works, the left stick navigates menus with auto-repeat, and pads that report the raw XInput layout are supported too.',
        'Rumble when you are hit, catch a POKéMON or beat a boss (toggle it in SETTINGS).',
        'Button prompts show Xbox buttons (X, Y, B, RB, RT, A) while you play with a pad.',
      ]],
    ],
  },
  {
    v: 'v0.0.3',
    sections: [
      ['ACTS AND AREAS', [
        'Runs are now 3 ACTS and change every time: ACT 1 and ACT 2 each pick two of three areas in a random order, ACT 3 is CERULEAN CAVE.',
        'New areas: ROCK TUNNEL (boss: LT. SURGE and RAICHU at the VERMILION GYM) and SEAFOAM ISLANDS (boss: LORELEI and LAPRAS in her ELITE FOUR room).',
        'Areas and bosses scale to where they fall in the run, so any order is fair.',
        'CERULEAN CAVE, the final area, is twice as long.',
        'PIKACHU unlocks from BROCK or LT. SURGE, DRATINI from GIOVANNI or LORELEI.',
      ]],
      ['CO-OP (BETA)', [
        'HOST CO-OP on the title screen gives a link. Player 2 joins with their own POKéMON and picks their own blessings, TMs, held items and moves, catches their own partner, and shares your level, money and POKé BALLS.',
        'Both players pick blessings at the same time, side by side. Player 2 can shop (shared money), talk to NURSE JOY, pick up rewards and change starter at the POKé BALLs in OAK’s lab.',
        'Co-op is harder: twice the foes, foes hit 25% harder, bosses have 80% more HP and hit 20% harder, and a fainted player 2 takes 15s to get back up.',
        'Co-op runs are marked CO-OP in RECORDS and show both players in the HALL OF FAME; player 2 gets the run on their own account.',
      ]],
      ['COMBAT', [
        'Much harder overall: tuned so a run with all of OAK’s research clears about 1 time in 5 at HEAT 0. Fresh files will need research to win.',
        'Bosses have twice the HP.',
        'Foes move faster. Each hit does a little less.',
        'Your dash crosses gaps (water, ledges) like in Hades. Walls still stop it, and an interrupted dash no longer leaves you stuck in the water.',
        'Contact abilities: hitting a POKéMON with STATIC, POISON POINT, FLAME BODY or EFFECT SPORE up close can paralyze, poison, burn or put you to sleep (and the same goes for foes touching yours).',
        'FIRE BLAST explodes in a five-pointed burst of flame and leaves the ground burning. BLIZZARD brings a snowstorm with ice falling from the sky.',
        'QUICK ATTACK, TACKLE and other lunges: a quick dash with afterimages instead of a jittery double move.',
        "ONIX's charge burrows through rock, and its leap no longer ends in a random teleport.",
        'Foes that get stuck on a wall find another way round.',
      ]],
      ['BLESSINGS', [
        "HO-OH's Recover only heals when your Cast hits a foe (once per Cast), and isn't offered if your Cast can't hit anything.",
        'PP UP shows what changes (e.g. 20 ➜ 25 power).',
        '26 new blessings inspired by Hades, across all six legends: Electrify, Forked Lightning, Doom Desire, Fire Spin, Moxie, Hail, Never-Melt Ice, Extreme Speed, Regenerator, Multiscale, Hurricane, Flash, Endure and more. HO-OH now has a Special blessing.',
        '6 new duo blessings: Psycho Bolt, Glacial Tide, Phoenix Pyre, Aurora Veil, Healing Wish and Thunderstorm. DEOXYS offers two new bargains.',
        'LUGIA’s Whirlpool (and Fire Spin) look like real whirlpools.',
      ]],
      ['OTHER', [
        'Your caught partner evolves as you level, including trade and stone evolutions.',
        'RECORDS has a BY STARTER tab: your record and the best run with each starter.',
        'After you beat a trainer, the area’s music comes back instead of the victory theme playing on.',
      ]],
    ],
  },
  {
    v: 'v0.0.2',
    sections: [
      ['CHANGES', [
        'Harder: enemies hit harder and attack from farther away.',
        'Bosses hit a little softer per attack, but now always have something that reaches you.',
        'Dashing makes you see-through while you are invulnerable (about 0.2s).',
        'Bosses: no longer stuck behind their own terrain; shots and beams pass over walls, they reposition when they lose sight of you, and every boss has an arena-wide attack. MISTY’s attacks reach the whole arena.',
        'Boons: see the boons you already have while choosing; you can skip a boon; a boon that replaces one you have comes at least one rarity higher.',
        'Economy: less money from battles, trainers and NUGGETS; the pre-boss POKéMON CENTER no longer sells healing (NURSE JOY heals you).',
        'OAK’s lab: switching starters updates your moves immediately; the research (STARDUST) menu scrolls.',
      ]],
      ['NEW', [
        'New title screen, RECORDS screen (leaderboards, your runs, trainers) and these patch notes.',
        'Every finished run now gets a score and is tagged with the game version.',
      ]],
    ],
  },
  {
    v: 'v0.0.1',
    sections: [
      ['', ['The first playtest build.']],
      ['COMBAT', [
        'Realtime, top-down combat in the style of Hades: dash with i-frames, ATTACK, SPECIAL and CAST moves with their own realtime shapes (combos, lunges, beams, novas, clouds...).',
        'Gen 3 damage: real base stats, STAB, type matchups, crits and stat stages. Burn, poison, paralysis, sleep, confusion, chill and freeze.',
        'Weaken a wild POKéMON and throw a POKé BALL to catch it. It becomes your partner: call it in when the gauge is full.',
      ]],
      ['THE RUN', [
        'Five areas built from real FireRed maps: VIRIDIAN FOREST, MT. MOON, POKéMON TOWER, SILPH CO. and CERULEAN CAVE.',
        'Boss fights: BROCK’s ONIX, MISTY’s STARMIE, the GHOST of POKéMON TOWER, GIOVANNI and MEWTWO.',
        'Pick a door after each room: legendary blessings (ZAPDOS, ARTICUNO, MOLTRES, MEW, LUGIA, HO-OH and duo blessings), RARE CANDY, TMs, held items, Marts, POKéMON CENTERS and DEOXYS rooms.',
        'Wild and trainer rooms use the real encounter tables and trainer parties. Level up, learn moves and evolve at the real levels.',
      ]],
      ['PROGRESSION', [
        'PROF. OAK’s lab is the hub: spend STARDUST on permanent research, choose your starter and unlock new ones by beating bosses.',
        'HEAT: after your first escape, your rival offers 10 levels of extra rules for more STARDUST.',
      ]],
      ['SAVES & ACCOUNTS', [
        'Save & quit from the pause menu (or just close the tab) and CONTINUE from the start of that room.',
        'Cloud saves with Google sign-in, so your progress follows you. Invite links let new players join the playtest.',
      ]],
    ],
  },
];

// The newest notes entry (the title screen shows the notes once whenever this changes).
export const LATEST_NOTES = PATCH_NOTES[0].v;
