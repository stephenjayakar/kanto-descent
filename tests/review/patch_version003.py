p = 'web/src/game/version.js'
s = open(p, encoding='utf8').read()
start = s.index("export const VERSION = 'v0.0.2';")
end = s.index("  {\n    v: 'v0.0.1',")
new = """export const VERSION = 'v0.0.3';

// Newest first. Each entry: { v, sections: [[TITLE, [lines]]] } (an empty title means no heading).
export const PATCH_NOTES = [
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
        'Bosses have twice the HP (each hit is softer, so fights are longer rather than deadlier).',
        'Foes move faster. Each hit does a little less.',
        'Your dash crosses gaps (water, ledges) like in Hades. Walls still stop it, and an interrupted dash no longer leaves you stuck in the water.',
        'Contact abilities: hitting a POKéMON with STATIC, POISON POINT, FLAME BODY or EFFECT SPORE up close can paralyze, poison, burn or put you to sleep (and the same goes for foes touching yours).',
        'FIRE BLAST explodes in its 大-shaped burst and leaves the ground burning. BLIZZARD brings a snowstorm with ice falling from the sky.',
        'QUICK ATTACK, TACKLE and other lunges: a quick dash with afterimages instead of a jittery double move.',
        "ONIX's charge burrows through rock, and its leap no longer ends in a random teleport.",
        'Foes that get stuck on a wall find another way round.',
      ]],
      ['BLESSINGS', [
        "HO-OH's Recover only heals when your Cast hits a foe (once per Cast), and isn't offered if your Cast can't hit anything.",
        'PP UP shows what changes (e.g. 20 ➜ 25 power).',
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
"""
s = s[:start] + new + s[end:]
open(p, 'w', encoding='utf8').write(s)
print('ok')
