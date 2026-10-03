// Action-level input: keyboard + mouse + gamepad, polled once per frame.
//   Input.poll()            once per frame before game logic
//   Input.down('attack')    held
//   Input.pressed('dash')   went down this frame (buffered for a few frames, see consume)
//   Input.move              {x, y} in -1..1, normalised
//   Input.aim               {x, y} unit vector or null (mouse / right stick)
import { Engine } from './core.js';

const KEYMAP = {
  up: ['w', 'ArrowUp'], down: ['s', 'ArrowDown'], left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'],
  attack: ['j'], special: ['k'], dash: [' ', 'Shift'], cast: ['q', 'l'],
  call: ['f'], ball: ['r'], interact: ['e', 'Enter'], pause: ['Escape', 'p'],
  confirm: ['Enter', 'z', 'e'], back: ['Escape', 'x', 'Backspace'], dex: ['Tab'],
};
// XInput (Xbox) pads in the browser's "standard" mapping: A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 LS10 RS11 d-pad 12-15
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
const DIRS = ['up', 'down', 'left', 'right'];

export const Input = {
  move: { x: 0, y: 0 }, aim: null, aimSource: 'move',
  mouseWorld: null, // set by the scene each frame (world coordinates of the mouse)
  usingPad: false, lastMouseMove: -1e9, rumbleOn: true, _padIdx: -1, _dirHeldT: {},
  _held: new Set(), _prevHeld: new Set(), _buffer: new Map(), _padPrev: [],
  _lastMouse: { x: -1, y: -1 }, _mouseBtn: { l: false, r: false },

  init(canvas) {
    canvas.addEventListener('mousedown', e => { if (e.button === 0) this._mouseBtn.l = true; if (e.button === 2) this._mouseBtn.r = true; this.usingPad = false; });
    window.addEventListener('mouseup', e => { if (e.button === 0) this._mouseBtn.l = false; if (e.button === 2) this._mouseBtn.r = false; });
    window.addEventListener('blur', () => { Engine.keys.clear(); this._mouseBtn.l = this._mouseBtn.r = false; });
    window.addEventListener('keydown', e => {
      if (['Tab', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      this.usingPad = false;
    });
  },

  poll() {
    this._prevHeld = this._held;
    const held = new Set();
    for (const [act, keys] of Object.entries(KEYMAP)) if (keys.some(k => Engine.keys.has(k) || Engine.pressed.has(k))) held.add(act);
    if (this._mouseBtn.l) held.add('attack');
    if (this._mouseBtn.r) held.add('special');
    let mx = 0, my = 0;
    if (held.has('left')) mx -= 1; if (held.has('right')) mx += 1;
    if (held.has('up')) my -= 1; if (held.has('down')) my += 1;
    // gamepads: every connected pad counts (so a virtual/Steam pad listed first can't hide the real one)
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
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.move.x = mx; this.move.y = my;
    // mouse movement switches aim to the mouse
    const m = Engine.mouse;
    if (m.x !== this._lastMouse.x || m.y !== this._lastMouse.y) {
      if (this._lastMouse.x >= 0) { this.lastMouseMove = Engine.time; this.usingPad = false; }
      this._lastMouse = { x: m.x, y: m.y };
    }
    // buffered presses
    for (const [k, v] of this._buffer) { if (v <= 1) this._buffer.delete(k); else this._buffer.set(k, v - 1); }
    for (const a of held) if (!this._prevHeld.has(a)) this._buffer.set(a, BUFFER_FRAMES);
    // held directions auto-repeat (menus): after 0.35s, a fresh press every 0.11s
    for (const d of DIRS) {
      if (!held.has(d)) { this._dirHeldT[d] = 0; continue; }
      const t0 = this._dirHeldT[d] || 0, t1 = t0 + (Engine.dt || 1 / 60);
      this._dirHeldT[d] = t1;
      if (t0 >= 0.35 && Math.floor((t1 - 0.35) / 0.11) > Math.floor((t0 - 0.35) / 0.11)) this._prevHeld.delete(d);
    }
    this._held = held;
  },

  down(a) { return this._held.has(a); },
  pressed(a) { return this._buffer.has(a); },
  justPressed(a) { return this._held.has(a) && !this._prevHeld.has(a); },
  consume(a) { this._buffer.delete(a); },
  clear() { this._buffer.clear(); },
  // Mouse aiming is active if the mouse moved in the last few seconds and no pad is in use.
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
  },
};
