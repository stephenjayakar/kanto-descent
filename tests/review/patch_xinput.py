def rep(p, pairs):
    s = open(p, encoding='utf8').read()
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf8').write(s)

rep('web/src/engine/input.js', [
    ("""// Standard gamepad mapping indices
const PADMAP = {
  attack: [2], special: [3], dash: [5, 6], cast: [1], call: [4], ball: [7], interact: [0], pause: [9],
  confirm: [0], back: [1], up: [12], down: [13], left: [14], right: [15], dex: [8],
};
const BUFFER_FRAMES = 8; // a press stays "pressed" this many frames unless consumed (input buffering)""",
     """// XInput (Xbox) pads in the browser's "standard" mapping: A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 LS10 RS11 d-pad 12-15
const PADMAP = {
  attack: [2], special: [3], dash: [5, 6], cast: [1], call: [4], ball: [7], interact: [0], pause: [9],
  confirm: [0], back: [1], up: [12], down: [13], left: [14], right: [15], dex: [8],
};
// Some browsers (Firefox on Windows) report XInput pads without the standard mapping: raw XInput order
// A0 B1 X2 Y3 LB4 RB5 Back6 Start7 LS8 RS9, triggers on axes 2 / 5, d-pad on buttons 11-14 or axes 6 / 7.
const RAWMAP = { attack: [2], special: [3], dash: [5], cast: [1], call: [4], interact: [0], pause: [7], confirm: [0], back: [1], dex: [6] };
// on-screen prompts while playing with a pad (Xbox button names)
export const PAD_LABEL = { attack: 'X', special: 'Y', cast: 'B', dash: 'RB', call: 'LB', ball: 'RT', interact: 'A', pause: 'START', confirm: 'A', back: 'B' };
const KEY_LABEL = { attack: 'J', special: 'K', cast: 'Q', dash: 'SPACE', call: 'F', ball: 'R', interact: 'E', pause: 'ESC', confirm: 'ENTER', back: 'X' };
const BUFFER_FRAMES = 8; // a press stays "pressed" this many frames unless consumed (input buffering)
const DIRS = ['up', 'down', 'left', 'right'];"""),
    ("  usingPad: false, lastMouseMove: -1e9,", "  usingPad: false, lastMouseMove: -1e9, rumbleOn: true, _padIdx: -1, _dirHeldT: {},"),
    ("""    // gamepad
    let pad = null;
    try { pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected); } catch { /* no gamepads */ }
    this.aim = null;
    if (pad) {
      const btn = i => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      let any = false;
      for (const [act, idx] of Object.entries(PADMAP)) if (idx.some(btn)) { held.add(act); any = true; }
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.25) { mx = ax; my = ay; any = true; }
      if (held.has('left') && !mx) mx = -1; if (held.has('right') && !mx) mx = 1;
      if (held.has('up') && !my) my = -1; if (held.has('down') && !my) my = 1;
      const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.4) { const l = Math.hypot(rx, ry); this.aim = { x: rx / l, y: ry / l }; this.aimSource = 'stick'; any = true; }
      if (any) this.usingPad = true;
    }""", """    // gamepads: every connected pad counts (so a virtual/Steam pad listed first can't hide the real one)
    let pads = [];
    try { pads = [...(navigator.getGamepads?.() || [])].filter(p => p && p.connected); } catch { /* no gamepads */ }
    this.aim = null;
    let best = 0.25, bestAim = 0.4;
    for (const pad of pads) {
      const std = pad.mapping === 'standard';
      const btn = i => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      let any = false;
      for (const [act, idx] of Object.entries(std ? PADMAP : RAWMAP)) if (idx.some(btn)) { held.add(act); any = true; }
      let rx, ry;
      if (std) { rx = pad.axes[2] || 0; ry = pad.axes[3] || 0; }
      else { // raw XInput: triggers are axes 2 / 5 (-1 released .. 1 pulled), right stick 3 / 4, d-pad buttons or axes 6 / 7
        if ((pad.axes[2] ?? -1) > 0.2) { held.add('dash'); any = true; }
        if ((pad.axes[5] ?? -1) > 0.2) { held.add('ball'); any = true; }
        rx = pad.axes[3] || 0; ry = pad.axes[4] || 0;
        const hx = pad.axes[6] || 0, hy = pad.axes[7] || 0;
        if (btn(11) || hy < -0.5) held.add('up'); if (btn(12) || hy > 0.5) held.add('down');
        if (btn(13) || hx < -0.5) held.add('left'); if (btn(14) || hx > 0.5) held.add('right');
      }
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > best) { best = Math.hypot(ax, ay); mx = ax; my = ay; any = true; }
      // the left stick also works as a d-pad in menus
      if (ax < -0.55) held.add('left'); if (ax > 0.55) held.add('right'); if (ay < -0.55) held.add('up'); if (ay > 0.55) held.add('down');
      if (Math.hypot(rx, ry) > bestAim) { bestAim = Math.hypot(rx, ry); this.aim = { x: rx / bestAim, y: ry / bestAim }; this.aimSource = 'stick'; any = true; }
      if (DIRS.some(d => held.has(d)) && !any) any = DIRS.some(d => PADMAP[d].some(btn));
      if (any) { this.usingPad = true; this._padIdx = pad.index; }
    }
    if (pads.length) {
      if (held.has('left') && !mx) mx = -1; if (held.has('right') && !mx) mx = 1;
      if (held.has('up') && !my) my = -1; if (held.has('down') && !my) my = 1;
    }"""),
    ("""    for (const a of held) if (!this._prevHeld.has(a)) this._buffer.set(a, BUFFER_FRAMES);
    this._held = held;""", """    for (const a of held) if (!this._prevHeld.has(a)) this._buffer.set(a, BUFFER_FRAMES);
    // held directions auto-repeat (menus): after 0.35s, a fresh press every 0.11s
    for (const d of DIRS) {
      if (!held.has(d)) { this._dirHeldT[d] = 0; continue; }
      const t0 = this._dirHeldT[d] || 0, t1 = t0 + (Engine.dt || 1 / 60);
      this._dirHeldT[d] = t1;
      if (t0 >= 0.35 && Math.floor((t1 - 0.35) / 0.11) > Math.floor((t0 - 0.35) / 0.11)) this._prevHeld.delete(d);
    }
    this._held = held;"""),
    ("""  // Mouse aiming is active if the mouse moved in the last few seconds and no pad is in use.
  mouseAiming() { return !this.usingPad && Engine.time - this.lastMouseMove < 4; },""", """  // Mouse aiming is active if the mouse moved in the last few seconds and no pad is in use.
  mouseAiming() { return !this.usingPad && Engine.time - this.lastMouseMove < 4; },
  // the button/key to show for an action in prompts (Xbox names while a pad is in use)
  label(action) { return (this.usingPad ? PAD_LABEL : KEY_LABEL)[action] || action.toUpperCase(); },
  // XInput rumble on the pad that's being used (ms, 0..1 strong/low-frequency, 0..1 weak/high-frequency)
  rumble(ms = 120, strong = 0.4, weak = 0.6) {
    if (!this.rumbleOn || !this.usingPad || this._padIdx < 0) return;
    try {
      const pad = navigator.getGamepads?.()[this._padIdx];
      pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {});
    } catch { /* no rumble support */ }
  },"""),
])

# Engine.dt for the repeat timer
s = open('web/src/engine/core.js', encoding='utf8').read()
if 'Engine.dt =' not in s:
    i = s.index('function tick(dt) {')
    s = s[:i] + s[i:].replace('function tick(dt) {', 'function tick(dt) {\n  Engine.dt = dt;', 1)
    open('web/src/engine/core.js', 'w', encoding='utf8').write(s)

# HUD prompts follow the device
rep('web/src/scenes/hud.js', [
    ("  const slots = [['attack', 'J', 'ATK'], ['special', 'K', 'SP'], ['cast', 'Q', 'CAST']];",
     "  const slots = [['attack', Input.label('attack'), 'ATK'], ['special', Input.label('special'), 'SP'], ['cast', Input.label('cast'), 'CAST']];"),
    ("  text(ctx, 'DASH', W - 8 - slots.length * 76 + p.dashCharges * 12 + 2, sy - 15, { font: 'small', color: 'gray' });",
     "  text(ctx, Input.usingPad ? 'DASH RB' : 'DASH', W - 8 - slots.length * 76 + p.dashCharges * 12 + 2, sy - 15, { font: 'small', color: 'gray' });"),
    ("  text(ctx, 'R', bx + 40, sy - 18, { color: 'gray', font: 'small' });", "  text(ctx, Input.label('ball'), bx + 40, sy - 18, { color: 'gray', font: 'small' });"),
    ("    text(ctx, 'F', cx + 52, cy + 2, { font: 'small', color: 'gray', align: 'right' });", "    text(ctx, Input.label('call'), cx + 52, cy + 2, { font: 'small', color: 'gray', align: 'right' });"),
])
s = open('web/src/scenes/hud.js', encoding='utf8').read()
if "from '../engine/input.js'" not in s:
    s = s.replace("import { BIOMES, HELD, areaOf } from '../game/content.js';", "import { BIOMES, HELD, areaOf } from '../game/content.js';\nimport { Input } from '../engine/input.js';", 1)
    open('web/src/scenes/hud.js', 'w', encoding='utf8').write(s)

rep('web/src/scenes/room.js', [
    ("    if (this.nearNpc && !topOverlay()) this.prompt(ctx, `E: ${this.nearNpc.verb || 'Talk'}`, this.nearNpc.x, this.nearNpc.y - 40);",
     "    if (this.nearNpc && !topOverlay()) this.prompt(ctx, `${Input.label('interact')}: ${this.nearNpc.verb || 'Talk'}`, this.nearNpc.x, this.nearNpc.y - 40);"),
    ("`   (E: reroll ×${this.run.rerolls})`", "`   (${Input.label('interact')}: reroll ×${this.run.rerolls})`"),
    # rumble: getting hit, catching, beating a boss
    ("      case 'hurt': if (G.meta.settings.shake) Engine.shake = 0; break;",
     "      case 'hurt': if (G.meta.settings.shake) Engine.shake = 0; { const f = Math.min(1, (e.dmg || 0) / Math.max(1, w.player.maxHp) * 5); Input.rumble(90 + f * 160, 0.25 + 0.6 * f, 0.5 + 0.4 * f); } break;"),
    ("      case 'catch': if (e.by?.p2)", "      case 'catch': Input.rumble(200, 0.3, 0.8); if (e.by?.p2)"),
])
rep('web/src/scenes/rewards.js', [
    ("  w0.player.iframes = 99; w0.player.status = {};", "  w0.player.iframes = 99; w0.player.status = {};\n  Input.rumble(450, 0.9, 0.6); // the boss goes down"),
])
# settings: RUMBLE toggle
rep('web/src/scenes/title.js', [
    ("    const w = 300, h = 160, x = (W - w) / 2, y = (H - h) / 2;\n    panel(ctx, x, y, w, h);\n    text(ctx, 'SETTINGS', W / 2, y + 8, { align: 'center', color: 'white' });",
     "    const w = 300, h = 186, x = (W - w) / 2, y = (H - h) / 2;\n    panel(ctx, x, y, w, h);\n    text(ctx, 'SETTINGS', W / 2, y + 8, { align: 'center', color: 'white' });"),
    ("    this.btn(ctx, 'shake', s.shake ? 'ON' : 'OFF', x + 176, y + 84, 62, 20, { color: s.shake ? THEME.green : '#806060' }, () => { s.shake = s.shake ? 0 : 1; saveMeta(); });",
     "    this.btn(ctx, 'shake', s.shake ? 'ON' : 'OFF', x + 176, y + 84, 62, 20, { color: s.shake ? THEME.green : '#806060' }, () => { s.shake = s.shake ? 0 : 1; saveMeta(); });\n    text(ctx, 'RUMBLE (PAD)', x + 16, y + 113, { color: 'white' });\n    const rumble = s.rumble !== false;\n    this.btn(ctx, 'rumble', rumble ? 'ON' : 'OFF', x + 176, y + 110, 62, 20, { color: rumble ? THEME.green : '#806060' }, () => { s.rumble = !rumble; Input.rumbleOn = s.rumble; saveMeta(); Input.rumble(200, 0.5, 0.5); });"),
])
# apply the saved rumble setting at boot
rep('web/src/main.js', [
    ("  loadMeta();", "  loadMeta();\n  Input.rumbleOn = G.meta.settings?.rumble !== false;"),
])
print('ok')
