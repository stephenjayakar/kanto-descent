def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)
rep('web/src/scenes/ui.js', [
    ("import { TYPE_COLORS } from '../game/data.js';", "import { TYPE_COLORS } from '../game/data.js';\nimport { Coop } from '../game/coop.js';\n\n// co-op: while a menu is open for player 2, it is driven by the guest's controller\nconst menuInput = () => (Coop.menuP2 ? Coop.remote : Input);"),
    # Dialog: either player can advance P2's dialog lines
    ("  update(dt) {\n    Input.poll();\n    const L = this.lines[this.i];\n    this.chars += dt * 70;\n    if (confirmPressed()) {",
     "  update(dt) {\n    Input.poll(); if (Coop.menuP2) Coop.remote.poll();\n    const L = this.lines[this.i];\n    this.chars += dt * 70;\n    if (confirmPressed() || (Coop.menuP2 && Coop.remote.justPressed('confirm'))) {"),
    # Choice
    ("  enter() { Input.clear(); Sound.playSE('se_win_open'); }\n  update(dt) {\n    Input.poll(); this.t += dt;",
     "  enter() { Input.clear(); this.p2 = Coop.menuP2; Sound.playSE('se_win_open'); }\n  update(dt) {\n    const I = this.p2 ? Coop.remote : Input;\n    I.poll(); this.t += dt;"),
    ("    if (Input.justPressed('up')) { this.sel = (this.sel + n - 1) % n; Sound.playSE('se_select'); moved = true; }\n    if (Input.justPressed('down')) { this.sel = (this.sel + 1) % n; Sound.playSE('se_select'); moved = true; }",
     "    if (I.justPressed('up')) { this.sel = (this.sel + n - 1) % n; Sound.playSE('se_select'); moved = true; }\n    if (I.justPressed('down')) { this.sel = (this.sel + 1) % n; Sound.playSE('se_select'); moved = true; }"),
    ("    L.forEach((r, i) => { if (vis(r) && inRect(r.x, r.y, r.w, r.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) this.sel = i; });",
     "    if (!this.p2) L.forEach((r, i) => { if (vis(r) && inRect(r.x, r.y, r.w, r.h) && (Engine.mouse.x !== this.mx || Engine.mouse.y !== this.my)) this.sel = i; });"),
    ("    if (Input.justPressed('confirm') && this.t > 0.4) pick = this.sel;\n    if (Engine.mouse.clicked && this.t > 0.4) L.forEach",
     "    if (I.justPressed('confirm') && this.t > 0.4) pick = this.sel;\n    if (Engine.mouse.clicked && this.t > 0.4 && !this.p2) L.forEach"),
    ("    else if (skip && (Input.justPressed('back') || (Engine.mouse.clicked && this.t > 0.4 && inRect(skip.x, skip.y, skip.w, skip.h)))) {",
     "    else if (skip && (I.justPressed('back') || (!this.p2 && Engine.mouse.clicked && this.t > 0.4 && inRect(skip.x, skip.y, skip.w, skip.h)))) {"),
    ("    if (this.opts.footer) text(ctx, this.opts.footer, cx, H - 24, { align: 'center', color: 'whiteSoft', font: 'small' });",
     "    if (this.opts.footer) text(ctx, this.opts.footer, cx, H - 24, { align: 'center', color: 'whiteSoft', font: 'small' });\n    if (this.p2) { // whose pick this is\n      const s = `PLAYER 2 (${Coop.guest?.name || 'P2'}) CHOOSES  ·  arrows + Enter/Z, X to skip`, tw = measure(s, 'small') + 16;\n      pixBox(ctx, W / 2 - tw / 2, 4, tw, 16, 'rgba(16,40,64,0.95)', '#80d0ff', 2); text(ctx, s, W / 2, 5, { align: 'center', font: 'small', color: ['#80d0ff', '#202020'] });\n    }"),
])
print('ok')
