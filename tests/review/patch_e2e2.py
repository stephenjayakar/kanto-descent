p = 'tests/coop_e2e.mjs'
s = open(p, encoding='utf8').read()
a = "await host.screenshot({ path: 'tests/out/coop_host.png' });"
b = r"""// per-player rewards: a blessing for each player, chosen on each player's own keyboard
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); window.__rw = R.applyReward(window.__room, { kind: 'boon', legend: 'ZAPDOS' }).then(() => (window.__rwDone = true)); });
await host.waitForTimeout(900); await host.keyboard.press('Enter'); // P1 picks the first card
await host.waitForTimeout(1200);
await guest.screenshot({ path: 'tests/out/coop_guest_choice.png' });
await guest.keyboard.press('ArrowDown'); await guest.waitForTimeout(150); await guest.keyboard.press('Enter'); // P2 picks the second
await host.waitForTimeout(800);
const boons = await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js'); return { done: !!window.__rwDone, p1: G.run.boons.map(b => b.key), p2: Coop.p2.run.boons.map(b => b.key), isP2: !!G.run.isP2 }; });
console.log('boons', JSON.stringify(boons));
// TM for each
await host.evaluate(async () => { const R = await import('/src/scenes/rewards.js'); window.__rwDone = false; R.applyReward(window.__room, { kind: 'tm' }).then(() => (window.__rwDone = true)); });
await host.waitForTimeout(900); await host.keyboard.press('Enter'); await host.waitForTimeout(700);
for (let i = 0; i < 4; i++) { await host.keyboard.press('Enter'); await host.waitForTimeout(450); } // slot prompt / dialogs
await guest.waitForTimeout(600); await guest.keyboard.press('Enter');
for (let i = 0; i < 4; i++) { await guest.waitForTimeout(450); await guest.keyboard.press('Enter'); }
await host.waitForTimeout(800);
const moves = await host.evaluate(async () => { const { Coop } = await import('/src/game/coop.js'); const { G } = await import('/src/game/run.js'); return { done: !!window.__rwDone, p1: G.run.slots, p2: Coop.p2.run.slots, p2actor: window.__room.world.p2.slots || window.__room.world.p2.run.slots }; });
console.log('moves', JSON.stringify(moves));
// heal reaches P2
const heal = await host.evaluate(async () => { const { coopHeal } = await import('/src/game/coop.js'); const a = window.__room.world.p2; a.hp = 5; coopHeal(window.__room, 0.5); return { hp: a.hp, max: a.maxHp }; });
console.log('heal', JSON.stringify(heal));
await host.screenshot({ path: 'tests/out/coop_host.png' });"""
assert a in s; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf8').write(s)
print('ok')
