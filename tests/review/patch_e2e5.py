p = 'tests/coop_e2e.mjs'
s = open(p, encoding='utf8').read()
a = "await host.waitForTimeout(900); await host.keyboard.press('Enter'); // P1 picks the first card\nawait host.waitForTimeout(1200);\nawait guest.screenshot({ path: 'tests/out/coop_guest_choice.png' });"
b = "await host.waitForTimeout(900);\nawait guest.screenshot({ path: 'tests/out/coop_guest_choice.png' }); // both columns at once\nawait host.keyboard.press('Enter'); // P1 picks the first card\nawait host.waitForTimeout(600);\nawait guest.screenshot({ path: 'tests/out/coop_guest_choice2.png' });"
assert a in s; s = s.replace(a, b, 1)
a = "// heal reaches P2"
b = r"""// P2 shops on its own (shared money; the POTION heals P2)
const shop0 = await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); const { G } = await import('/src/game/run.js'); const r = window.__room; G.run.money = 500; r.world.p2.hp = 10; window.__shopDone = false; R.coopTalk(r, { name: 'CLERK', onTalk: () => R.openShop(r) }).then(() => (window.__shopDone = true)); return { money: G.run.money }; });
await guest.waitForTimeout(700); await guest.keyboard.press('Enter'); // "Hi there!"
await guest.waitForTimeout(700); await guest.keyboard.press('Enter'); // buy the first item (POTION)
await guest.waitForTimeout(700); await guest.keyboard.press('x');     // leave
await guest.waitForTimeout(700);
console.log('shop', JSON.stringify({ before: shop0, after: await host.evaluate(async () => { const { G } = await import('/src/game/run.js'); const a = window.__room.world.p2; return { money: G.run.money, p2hp: a.hp, done: window.__shopDone, isP2: !!G.run.isP2 }; }) }));
// heal reaches P2"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
