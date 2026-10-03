p = 'web/src/scenes/room.js'
s = open(p, encoding='utf8').read()
a = "      text(ctx, `${a.label || 'P2'} · ${D.species[a.species]?.name || ''} Lv${a.level}`, x + 6, y + 3, { font: 'small', color: ['#80d0ff', '#202020'] });"
b = """      text(ctx, `${a.label || 'P2'} · ${D.species[a.species]?.name || ''} Lv${a.level}`, x + 6, y + 3, { font: 'small', color: ['#80d0ff', '#202020'] });
      const r2 = a.run; // its own partner and Call gauge
      if (r2?.partner) text(ctx, `${D.species[r2.partner.species]?.name || ''} ${r2.callGauge >= 1 ? 'F!' : Math.floor(r2.callGauge * 100) + '%'}`, x + wdt - 6, y + 3, { align: 'right', font: 'small', color: r2.callGauge >= 1 ? 'gold' : 'gray' });"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
