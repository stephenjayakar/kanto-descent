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
// Standard gamepad mapping indices
const PADMAP = {
  attack: [2], special: [3], dash: [5, 6], cast: [1], call: [4], ball: [7], interact: [0], pause: [9],
  confirm: [0], back: [1], up: [12], down: [13], left: [14], right: [15], dex: [8],
};
const BUFFER_FRAMES = 8; // a press stays "pressed" this many frames unless consumed (input buffering)

export const Input = {
  move: { x: 0, y: 0 }, aim: null, aimSource: 'move',
  mouseWorld: null, // set by the scene each frame (world coordinates of the mouse)
  usingPad: false, lastMouseMove: -1e9,
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
    // gamepad
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
    this._held = held;
  },

  down(a) { return this._held.has(a); },
  pressed(a) { return this._buffer.has(a); },
  justPressed(a) { return this._held.has(a) && !this._prevHeld.has(a); },
  consume(a) { this._buffer.delete(a); },
  clear() { this._buffer.clear(); },
  // Mouse aiming is active if the mouse moved in the last few seconds and no pad is in use.
  mouseAiming() { return !this.usingPad && Engine.time - this.lastMouseMove < 4; },
};
