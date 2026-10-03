// Game version and patch notes (shown from the title screen). Only cut a new version when asked.
export const VERSION = 'v0.0.2';

// Newest first. Each entry: { v, sections: [[TITLE, [lines]]] } (an empty title means no heading).
export const PATCH_NOTES = [
  {
    v: 'v0.0.2',
    sections: [
      ['CHANGES', [
        'Harder: enemies hit harder and attack from farther away.',
        'Bosses hit a little softer per attack, but now always have something that reaches you.',
        'Dashing makes you see-through while you are invulnerable (about 0.2s).',
        "HO-OH's Recover only heals when your Cast hits a foe (once per Cast), and isn't offered if your Cast can't hit anything.",
        'Foes move faster. Each hit does a little less, but boss fights last longer.',
        'Your dash crosses gaps (water, ledges) like in Hades. Walls still stop it.',
        "ONIX's charge burrows through rock. Its leap no longer ends in a random teleport.",
        'Your caught partner evolves as you level, including trade and stone evolutions.',
        'RECORDS has a BY STARTER tab: your record and the best run with each starter.',
        'CO-OP (beta): HOST CO-OP on the title screen gives a link. Player 2 joins with their own POKéMON, picks their own blessings, TMs, held items and moves, catches their own partner, and shares your level, money and POKé BALLS.',
        'Co-op runs show both players in the HALL OF FAME and RECORDS, and player 2 gets the run on their own account.',
        'Co-op rooms have twice as many foes, and twice as many can attack at once.',
        'A dash over water that gets interrupted no longer leaves you stuck in the water.',
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
