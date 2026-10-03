p = 'web/src/game/version.js'
s = open(p, encoding='utf8').read()
a = "        'RECORDS has a BY STARTER tab: your record and the best run with each starter.',"
b = a + """
        'CO-OP (beta): HOST CO-OP on the title screen gives a link. Player 2 joins with their own POKéMON, picks their own blessings, TMs, held items and moves, catches their own partner, and shares your level, money and POKé BALLS.',
        'Co-op runs show both players in the HALL OF FAME and RECORDS, and player 2 gets the run on their own account.',
        'A dash over water that gets interrupted no longer leaves you stuck in the water.',"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
