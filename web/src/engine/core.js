// Canvas, scaling, main loop, scenes and input.
export const W = 768, H = 432;

export const Engine = {
  canvas: null, ctx: null, scale: 1, time: 0, dt: 0, frame: 0,
  scene: null, overlays: [],
  mouse: { x: -1, y: -1, down: false, clicked: false, rclicked: false, wheel: 0, justPressed: false },
  keys: new Set(), pressed: new Set(), suppressed: new Set(),
  shake: 0, cursor: 'default', hoverAny: false,
  timeScale: 1,
  afterDraw: null, // called once a frame after the scene and overlays are drawn
};

export function initEngine(canvas) {
  Engine.canvas = canvas;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  Engine.ctx = ctx;
  const resize = () => {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    const fs = Math.min(window.innerWidth / W, window.innerHeight / H);
    // Use integer scale when it fits well; otherwise fractional to fill (crisp-edges keeps pixels sharp)
    const scale = fs - s > 0.15 ? fs : s;
    Engine.scale = scale;
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
  };
  window.addEventListener('resize', resize);
  resize();
  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    Engine.mouse.x = (e.clientX - r.left) / r.width * W;
    Engine.mouse.y = (e.clientY - r.top) / r.height * H;
  };
  canvas.addEventListener('mousemove', toLocal);
  canvas.addEventListener('mousedown', e => { toLocal(e); if (e.button === 0) { Engine.mouse.down = true; Engine.mouse.justPressed = true; } });
  window.addEventListener('mouseup', e => { if (e.button === 0) { if (Engine.mouse.down) Engine.mouse.clicked = true; Engine.mouse.down = false; } });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); toLocal(e); Engine.mouse.rclicked = true; });
  canvas.addEventListener('wheel', e => { Engine.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchstart', e => { const t = e.touches[0]; toLocal(t); Engine.mouse.down = true; Engine.mouse.justPressed = true; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { toLocal(e.touches[0]); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', e => { Engine.mouse.clicked = true; Engine.mouse.down = false; e.preventDefault(); }, { passive: false });
  const norm = k => (k.length === 1 ? k.toLowerCase() : k);
  window.addEventListener('keydown', e => {
    const k = norm(e.key);
    if (e.repeat || Engine.suppressed.has(k)) { if ([' ', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) e.preventDefault(); return; }
    if (!Engine.keys.has(k)) Engine.pressed.add(k);
    Engine.keys.add(k);
    if ([' ', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { Engine.keys.delete(norm(e.key)); Engine.suppressed.delete(norm(e.key)); });
  let last = performance.now();
  const loop = (now) => {
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    Engine.dt = rawDt * Engine.timeScale;
    Engine.time += Engine.dt;
    Engine.frame++;
    tick(Engine.dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function tick(dt) {
  const ctx = Engine.ctx;
  Engine.hoverAny = false;
  updateTweens(dt);
  updateTimers(dt);
  const top = Engine.overlays[Engine.overlays.length - 1];
  try {
    if (top) top.update?.(dt); else Engine.scene?.update?.(dt);
    if (Engine.scene && top) Engine.scene.passiveUpdate?.(dt);
  } catch (e) { console.error(e); }
  ctx.save();
  if (Engine.shake > 0) {
    const s = Engine.shake;
    ctx.translate(Math.round((Math.random() - 0.5) * s * 2), Math.round((Math.random() - 0.5) * s * 2));
    Engine.shake = Math.max(0, Engine.shake - dt * 30);
  }
  try {
    Engine.scene?.draw?.(ctx);
    for (const o of Engine.overlays) o.draw?.(ctx);
  } catch (e) { console.error(e); }
  ctx.restore();
  if (Engine.afterDraw) try { Engine.afterDraw(); } catch (e) { console.error(e); } // co-op host: compose the guest's view (game/coop.js)
  Engine.canvas.style.cursor = Engine.hoverAny ? 'pointer' : 'default';
  Engine.mouse.clicked = false; Engine.mouse.rclicked = false; Engine.mouse.justPressed = false; Engine.mouse.wheel = 0;
  Engine.pressed.clear();
}

export function setScene(scene) {
  Engine.scene?.exit?.();
  Engine.overlays = [];
  Engine.scene = scene;
  Engine.mouse.clicked = false; Engine.mouse.rclicked = false; Engine.pressed.clear();
  scene.enter?.();
}
export function pushOverlay(o) { Engine.mouse.clicked = false; Engine.mouse.rclicked = false; Engine.pressed.clear(); Engine.overlays.push(o); o.enter?.(); return o; }
export function popOverlay(o) {
  for (const k of ['Enter', 'z', 'e']) if (Engine.keys.has(k)) { Engine.keys.delete(k); Engine.suppressed.add(k); }
  Engine.pressed.clear(); window.__input?.clear?.();
  Engine.overlayClosedAt = (Engine.overlayClosedAt || 0) + 1; // pad buttons held at this moment are ignored until released
  const i = o ? Engine.overlays.indexOf(o) : Engine.overlays.length - 1;
  if (i >= 0) { const [x] = Engine.overlays.splice(i, 1); x.exit?.(); }
  Engine.mouse.clicked = false; Engine.pressed.clear();
}
export function topOverlay() { return Engine.overlays[Engine.overlays.length - 1]; }

// ---- input helpers --------------------------------------------------------------------------
export function inRect(x, y, w, h) { const m = Engine.mouse; return m.x >= x && m.x < x + w && m.y >= y && m.y < y + h; }
export function hover(x, y, w, h) { const r = inRect(x, y, w, h); if (r) Engine.hoverAny = true; return r; }
export function clicked(x, y, w, h) { return Engine.mouse.clicked && inRect(x, y, w, h); }
export function keyPressed(k) { return Engine.pressed.has(k); }
export function consumeClick() { Engine.mouse.clicked = false; }
export function shake(n) { Engine.shake = Math.max(Engine.shake, n); }

// ---- tweens & timers ------------------------------------------------------------------------
const tweens = [];
export const Ease = {
  linear: t => t, outQuad: t => 1 - (1 - t) * (1 - t), inQuad: t => t * t, inOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  outCubic: t => 1 - Math.pow(1 - t, 3),
};
export function tween(obj, props, dur, ease = Ease.outQuad, delay = 0) {
  return new Promise(res => {
    const from = {};
    for (const k in props) from[k] = obj[k];
    tweens.push({ obj, props, from, dur: Math.max(0.0001, dur), t: -delay, ease, res });
  });
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    if (tw.t < 0) continue;
    const p = Math.min(1, tw.t / tw.dur);
    const e = tw.ease(p);
    for (const k in tw.props) tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
    if (p >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}
const timers = [];
export function wait(sec) { return new Promise(res => timers.push({ t: sec, res })); }
function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const t = timers.splice(i, 1)[0]; t.res(); } }
}
export function waitFrames(n) { return wait(n / 60); }

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
