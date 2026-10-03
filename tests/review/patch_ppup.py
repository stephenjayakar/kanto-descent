def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/scenes/rewards.js', [
    ("  const cards = opts.map(b => { const def = BOONS[b.key]; const next = { ...b, level: b.level + 1 }; return { title: `${def.name} Lv${b.level} → ${b.level + 1}`, desc: def.desc(boonInstance(run, next)), portrait: LEGENDS[def.legend].dex, accent: LEGENDS[def.legend].color }; });",
     "  const cards = opts.map(b => { const def = BOONS[b.key]; const next = { ...b, level: b.level + 1 }; return { title: `${def.name} Lv${b.level} → ${b.level + 1}`, desc: diffDesc(def.desc(boonInstance(run, b)), def.desc(boonInstance(run, next))), portrait: LEGENDS[def.legend].dex, accent: LEGENDS[def.legend].color }; });"),
    ("async function ppUp(scene) {", """// "Strikes for 15 power and 20% ..." vs the next level -> "Strikes for 15→19 power and 20→25% ..."
function diffDesc(a, b) {
  const num = /(\\d+(?:\\.\\d+)?)/;
  const pa = a.split(num), pb = b.split(num);
  if (pa.length !== pb.length) return b;
  return pb.map((t, i) => (i % 2 && t !== pa[i] ? `${pa[i]}→${t}` : t)).join('');
}

async function ppUp(scene) {"""),
])
print('ok')
