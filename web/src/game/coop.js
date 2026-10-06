// Co-op (staging prototype): host-streamed remote play.
// The host's browser runs the real game with a second player in the world. The guest's browser shows the
// host's canvas + audio as a WebRTC stream and sends its inputs back over a data channel. Convex only
// relays the one-time offer/answer (game:coop.*); after that the browsers talk directly (STUN only, so
// some strict networks can't connect yet).
import { Engine, W, H } from '../engine/core.js';
import { Sound } from '../audio/sound.js';
import { D } from './data.js';
import { STARTERS } from './content.js';
import { G, makePlayer, buildHooks, checkEvolution, nextEvolution, PLAYER_BANNED, knowsMove } from './run.js';
import { profile } from './moves_rt.js';
import { movesLearnedAt } from './data.js';
import { preloadPmd } from './pmd.js';
import { playerBrain } from './player.js';
import { Cloud, coopCreate, coopGet, coopAnswer } from './cloud.js';
import { Input } from '../engine/input.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const ACTIONS = ['attack', 'special', 'dash', 'cast', 'call', 'ball', 'interact', 'pause', 'confirm', 'back', 'up', 'down', 'left', 'right'];
const BUFFER_FRAMES = 8;

// The guest's controls as the host sees them; same interface as engine/input.js's Input.
class RemoteInput {
  constructor() { this.reset(); }
  reset() {
    this.move = { x: 0, y: 0 }; this.aim = null; this.mouseWorld = null; this.msg = null; this.usingPad = false;
    this._held = new Set(); this._prev = new Set(); this._buffer = new Map(); this._counts = {}; this._mouseAim = false; this._fresh = new Set();
  }
  receive(m) { this.msg = m; }
  // once per host frame; cam converts the guest's screen-space mouse to world coordinates
  poll(cam) {
    const m = this.msg || { h: [], mx: 0, my: 0, c: {} };
    this._prev = this._held; this._held = new Set(m.h || []);
    this.move.x = m.mx || 0; this.move.y = m.my || 0;
    this.aim = m.ax != null ? { x: m.ax, y: m.ay } : null;
    this._mouseAim = !!m.ma;
    this.usingPad = !!m.pad; // the guest's button names (its HUD and menus show its own controls)
    this.mouseWorld = m.ms && cam ? { x: m.ms[0] / 2 + cam.x, y: m.ms[1] / 2 + cam.y } : null;
    for (const [k, v] of this._buffer) { if (v <= 1) this._buffer.delete(k); else this._buffer.set(k, v - 1); }
    // presses arrive as counters, so a quick tap survives a dropped (unreliable) packet
    this._fresh.clear();
    for (const a of ACTIONS) { const n = m.c?.[a] || 0; if (n > (this._counts[a] || 0)) { this._buffer.set(a, BUFFER_FRAMES); this._fresh.add(a); } this._counts[a] = n; }
  }
  down(a) { return this._held.has(a); }
  pressed(a) { return this._buffer.has(a); }
  // a tap is held for one guest frame only: when that packet was dropped or overtaken before this poll, its press
  // counter still says it happened (menus read justPressed)
  justPressed(a) { return (this._held.has(a) && !this._prev.has(a)) || this._fresh.has(a); }
  consume(a) { this._buffer.delete(a); }
  clear() { this._buffer.clear(); }
  mouseAiming() { return this._mouseAim && !!this.mouseWorld; }
}

export const Coop = {
  role: null,        // 'host' | 'guest' | null
  status: 'off',     // off | starting | waiting | connecting | connected | lost | error
  code: null, link: null, error: null,
  pc: null, input: null, ctl: null,
  remote: new RemoteInput(),
  guest: null,       // host side: { starter, name } from the guest's hello
  p2: null,          // host side: the second player's run state { starter, species, hp, slots, downT }
  hostName: null,    // guest side
  menuP2: false,     // a menu is open for P2: it reads the guest's controller
  drawingP2: false,  // host side: drawing the guest's view right now (asP2View)
  get active() { return this.role === 'host' && this.status === 'connected' && !!this.guest; },
};

function iceDone(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

function watch(pc) {
  pc.addEventListener('connectionstatechange', () => {
    const s = pc.connectionState;
    (Coop.log ??= []).push(`${Math.round(performance.now())} ${s}`);
    if (s === 'connected') Coop.status = 'connected';
    else if (s === 'disconnected') { if (Coop.status === 'connected') Coop.status = 'reconnecting'; } // often recovers by itself
    else if (s === 'failed' || s === 'closed') { Coop.status = 'lost'; Coop.error = s === 'failed' ? 'Connection lost (or a strict network/firewall blocked it).' : 'The other player disconnected.'; }
  });
}

// ---------------------------------------------------------------- host
export async function hostCoop() {
  if (Coop.role === 'host' && Coop.status !== 'lost' && Coop.status !== 'error') return;
  stopCoop();
  Object.assign(Coop, { role: 'host', status: 'starting', error: null, guest: null, code: null, link: null });
  try {
    const pc = Coop.pc = new RTCPeerConnection({ iceServers: ICE });
    watch(pc);
    const video = guestCanvas().captureStream(60).getVideoTracks()[0]; // the guest's own view (its HUD), not the host's screen
    Engine.afterDraw = composeGuestView;
    video.contentHint = 'motion';
    const out = new MediaStream([video]);
    const master = Sound.output;
    if (master) { const dest = master.context.createMediaStreamDestination(); master.connect(dest); for (const t of dest.stream.getAudioTracks()) out.addTrack(t); }
    for (const t of out.getTracks()) pc.addTrack(t, out);
    const input = Coop.input = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
    input.onmessage = e => { try { Coop.remote.receive(JSON.parse(e.data)); } catch { /* bad packet */ } };
    const ctl = Coop.ctl = pc.createDataChannel('ctl');
    ctl.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'hello') { Coop.guest = { starter: STARTERS.some(s => s.species === m.starter) ? m.starter : 'CHARMANDER', name: String(m.name || 'P2').slice(0, 12) }; Coop.p2 = null; } };
    await pc.setLocalDescription(await pc.createOffer());
    await iceDone(pc);
    const { code } = await coopCreate(pc.localDescription.sdp);
    Coop.code = code; Coop.link = `${location.origin}${location.pathname}?coop=${code}`; Coop.status = 'waiting';
    // a sharper stream once connected: plenty of bitrate for 768x432, and keep full resolution (pixel art)
    // rather than downscaling when starved; frames drop instead
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState !== 'connected') return;
      for (const s of pc.getSenders()) if (s.track?.kind === 'video') { const p = s.getParameters(); p.encodings = [{ ...(p.encodings?.[0] || {}), maxBitrate: 6_000_000, maxFramerate: 60 }]; p.degradationPreference = 'maintain-resolution'; s.setParameters(p).catch(() => {}); }
    });
    const started = Date.now();
    const poll = async () => {
      if (Coop.pc !== pc || pc.signalingState !== 'have-local-offer') return;
      if (Date.now() - started > 30 * 60 * 1000) { Coop.status = 'lost'; Coop.error = 'Nobody joined; the code expired.'; return; }
      try { const r = await coopGet(code); if (r?.answer) { Coop.status = 'connecting'; await pc.setRemoteDescription({ type: 'answer', sdp: r.answer }); return; } } catch { /* retry */ }
      setTimeout(poll, 1000);
    };
    poll();
  } catch (e) { Coop.status = 'error'; Coop.error = e.message; }
}

export function stopCoop() {
  try { Coop.pc?.close(); } catch { /* already closed */ }
  if (Engine.afterDraw === composeGuestView) Engine.afterDraw = null;
  Object.assign(Coop, { role: null, status: 'off', pc: null, input: null, ctl: null, guest: null, p2: null, code: null, link: null });
  Coop.remote.reset();
}

// ---------------------------------------------------------------- guest
export async function joinCoop(code, video, hello) {
  stopCoop();
  Object.assign(Coop, { role: 'guest', status: 'connecting', error: null, code });
  const room = await coopGet(code);
  if (!room) throw new Error('That co-op code has expired or does not exist.');
  Coop.hostName = room.hostName;
  const pc = Coop.pc = new RTCPeerConnection({ iceServers: ICE });
  watch(pc);
  pc.ontrack = e => { if (video.srcObject !== e.streams[0]) { video.srcObject = e.streams[0]; video.play().catch(() => {}); } };
  pc.ondatachannel = e => {
    if (e.channel.label === 'input') Coop.input = e.channel;
    else {
      Coop.ctl = e.channel; e.channel.onopen = () => e.channel.send(JSON.stringify({ type: 'hello', ...hello }));
      e.channel.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.type === 'run' && m.entry) Coop.onRun?.(m.entry); } catch { /* bad message */ } };
    }
  };
  await pc.setRemoteDescription({ type: 'offer', sdp: room.offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await iceDone(pc);
  await coopAnswer(code, pc.localDescription.sdp);
}

// ---------------------------------------------------------------- the second player (host side)
// P2 has its own run state layered over the host's: its own POKéMON, moves, blessings, held item, partner and
// Call gauge, while level/EXP, money, POKé BALLS, curses and the map stay shared (accessors forward them).
const SHARED = ['money', 'balls', 'ballType', 'level', 'exp', 'kills', 'time', 'stardustGained', 'revives', 'reviveFrac', 'rerolls',
  'biome', 'roomInBiome', 'depth', 'heat', 'chaos', 'over', 'won', 'visited', 'lastLayouts', 'history', 'caught', 'rng', 'seed', 'callBonus'];

function makeP2Run(base, starter) {
  const kit = STARTERS.find(s => s.species === starter) || STARTERS[0];
  const r2 = Object.create(base);
  for (const k of SHARED) Object.defineProperty(r2, k, { get: () => base[k], set: v => { base[k] = v; }, enumerable: true });
  Object.assign(r2, {
    isP2: true, starter: kit.species, species: kit.species, slots: { ...kit.slots }, known: Object.values(kit.slots),
    boons: [], held: null, partner: null, maxHpMul: base.maxHpMul, callGauge: 0, pendingLearn: [], seenTM: [], pendingEvo: null, partnerEvo: null,
    focusUsed: false, hp: null, lastLevel: base.level,
  });
  // joining mid-run: start evolved and with a sensible kit for the shared level (later levels prompt as usual)
  for (let i = 0; i < 3; i++) { const n = nextEvolution(r2.species, base.level); if (!n || !D.species[n] || n === 'CHOICE') break; r2.species = n; }
  const attack = bestMove(r2.species, base.level, 'attack', kit.slots.attack);
  // never the same move in two slots (DRATINI's TWISTER is its attack and was also its best special)
  const special = bestMove(r2.species, base.level, 'special', kit.slots.special, attack);
  r2.slots = { attack, special, cast: kit.slots.cast !== attack && kit.slots.cast !== special ? kit.slots.cast : null };
  r2.known = [...new Set([...r2.known, ...Object.values(r2.slots)].filter(Boolean))];
  return r2;
}

function bestMove(species, level, want, fallback, avoid) {
  const ok = fallback && fallback !== avoid;
  let best = ok ? fallback : null, bp = ok ? profile(fallback).power : -1;
  const lines = [species]; for (let s = D.species[species]?.preEvolution; s; s = D.species[s]?.preEvolution) lines.push(s);
  for (const sp of lines) for (const [lv, m] of D.species[sp]?.learnset || []) {
    if (lv > level || !D.moves[m] || PLAYER_BANNED.has(m) || m === avoid) continue;
    const p = profile(m);
    if (!p.damaging || p.melee !== (want === 'attack') || p.power <= bp || p.power > 100) continue;
    best = m; bp = p.power;
  }
  return best;
}

// The shared level went up: queue P2's own level-up moves and evolution (offered at the next prompts).
function syncP2Level(r2) {
  for (let l = r2.lastLevel + 1; l <= r2.level; l++) {
    for (const mv of movesLearnedAt(r2.species, l)) if (!PLAYER_BANNED.has(mv) && !knowsMove(r2, mv)) r2.pendingLearn.push(mv);
  }
  r2.lastLevel = r2.level;
  checkEvolution(r2);
}

function ensureP2(base) {
  if (!Coop.guest) return null;
  if (!Coop.p2 || Coop.p2.base !== base) Coop.p2 = { base, run: makeP2Run(base, Coop.guest.starter), downT: 0 };
  return Coop.p2;
}

const p2Key = r2 => `${r2.level}|${r2.species}|${r2.boons.map(b => b.key + b.rarity + b.level).join()}|${r2.held}|${r2.maxHpMul}|${Object.values(r2.slots).join()}`;

function buildP2(world, x, y) {
  const r2 = Coop.p2.run;
  const a = makePlayer(r2, x, y);
  a.hp = r2.hp == null ? a.maxHp : Math.max(1, Math.min(a.maxHp, r2.hp));
  Object.assign(a, { brain: playerBrain, input: Coop.remote, run: r2, p2: true, label: Coop.guest.name, facing: -Math.PI / 2 });
  a._key = p2Key(r2);
  return a;
}

// Each player's blessings only react to their own hits, kills, dashes and casts. P2's are built against a view
// of the world whose `player` is P2, so boon code that says w.player means P2.
export function coopWrapHooks(w) {
  if (!w?.p2 || !Coop.p2) return;
  const host = w.hooks?._host || w.hooks;
  const pw = Object.create(w); pw.player = w.p2;
  for (const k of ['sunny', 'slowmo', 'hitstop', 'shake']) Object.defineProperty(pw, k, { get: () => w[k], set: v => { w[k] = v; } }); // shared world state P2's blessings may set
  const p2h = buildHooks(Coop.p2.run, pw);
  const mine = a => !!a && (a === w.p2 || a.owner === w.p2);
  const by = (pick, name) => (W, x, ...rest) => (pick(x, ...rest) ? p2h[name]?.(pw, x, ...rest) : host[name]?.(W, x, ...rest));
  w.hooks = {
    _host: host,
    beforeHit: by(info => mine(info.src), 'beforeHit'),
    onHit: by(info => mine(info.src), 'onHit'),
    beforeHurt: by(ctx => ctx.target === w.p2, 'beforeHurt'),
    beforeDeath: (W, ctx) => host.beforeDeath?.(W, ctx),
    onKill: by((e, src) => mine(src), 'onKill'),
    onDash: by(a => a === w.p2, 'onDash'),
    onCast: by(a => a === w.p2, 'onCast'),
    onCastHit: (W, e, a) => (a === w.p2 ? p2h.onCastHit?.(pw, e) : host.onCastHit?.(W, e)),
    onFreeze: (W, e) => host.onFreeze?.(W, e),
    onSlam: (W, e) => host.onSlam?.(W, e),
    onTick: (W, dt) => { host.onTick?.(W, dt); if (w.p2 && !w.p2.dead) p2h.onTick?.(pw, dt); },
    onRoomStart: W => { host.onRoomStart?.(W); p2h.onRoomStart?.(pw); },
    onRoomClear: W => { host.onRoomClear?.(W); p2h.onRoomClear?.(pw); },
    onSpawn: (W, e) => {
      host.onSpawn?.(W, e);
      if (e.team === 'enemy' && !e.coopScaled) { // co-op: two players' worth of pressure
        e.coopScaled = true;
        e.dmgScale = (e.dmgScale || 1) * (e.boss ? 1.2 : 1.25);
        if (e.boss) e.maxHp = e.hp = Math.round(e.maxHp * 1.8);
      }
    },
  };
}

// Put P2 into the current room (on room start, or when the guest connects mid-room).
export function coopSpawnP2(scene) {
  const w = scene.world;
  if (!Coop.active || !w?.player || (w.p2 && !w.p2.removed)) return;
  if (!ensureP2(scene.run)) return;
  const p = w.player;
  const at = w.collides(p.x + 16, p.y, 6, 'walk') || !w.lineClear(p.x, p.y, p.x + 16, p.y, 'walk') ? { x: p.x, y: p.y } : { x: p.x + 16, y: p.y }; // never across a wall or cliff rim
  const a = buildP2(w, at.x, at.y);
  a.iframes = 1.5;
  w.p2 = a; w.add(a);
  coopWrapHooks(w);
  preloadPmd([a.dex]);
  w.vfx.push({ kind: 'sendout', x: a.x, y: a.y, t: 0, life: 0.5 });
}

// P2 picked another starter (Oak's lab): start its run state over and swap the actor.
export function coopResetP2(scene, starter) {
  if (!Coop.guest) return;
  Coop.guest.starter = starter; Coop.p2 = null;
  removeP2(scene.world);
  coopSpawnP2(scene);
}

function removeP2(w) {
  if (!w?.p2) return;
  w.p2.removed = true; w.actors = w.actors.filter(x => x !== w.p2); w.p2 = null;
  if (w.hooks?._host) w.hooks = w.hooks._host;
}

// Rebuild P2's actor in place after its run changed (level, blessings, held item, moves, evolution).
export function coopRefreshP2(scene) {
  const w = scene.world, a = w?.p2;
  if (!a || !Coop.p2) return;
  const frac = a.dead ? 0 : a.hp / a.maxHp;
  const n = buildP2(w, a.x, a.y);
  const keep = ['x', 'y', 'facing', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'speedMul', 'z', 'stun', 'dead', 'deathT'];
  const saved = {}; for (const k of keep) saved[k] = a[k];
  for (const k of Object.keys(a)) delete a[k];
  Object.assign(a, n, saved);
  if (!a.dead) a.hp = Math.max(1, Math.round(a.maxHp * frac));
  coopWrapHooks(w);
  preloadPmd([a.dex]);
}

// Run a reward/level-up flow for P2: G.run is P2's run and the menus read the guest's controller.
export async function asP2(scene, fn) {
  if (!Coop.active || !scene.world?.p2 || !Coop.p2 || G.run?.isP2) return;
  const host = G.run, r2 = Coop.p2.run;
  syncP2Level(r2);
  G.run = r2; Coop.menuP2 = true;
  try { await fn(); } finally { G.run = host; Coop.menuP2 = false; }
  coopRefreshP2(scene);
}

// Same as asP2 for code with no menus or awaits (a catch): swap, run, swap back right away.
export function asP2Sync(scene, fn) {
  if (!Coop.p2 || G.run?.isP2) return fn();
  const host = G.run; G.run = Coop.p2.run;
  try { return fn(); } finally { G.run = host; coopRefreshP2(scene); }
}

// Heals from Nurse Joy, potions, HP UP and between areas reach P2 too (and wake it up if it had fainted).
export function coopHeal(scene, frac) {
  const w = scene.world, a = w?.p2;
  if (!a || !Coop.p2) return;
  if (a.dead) reviveP2(w, a, frac);
  else { w.heal(a, Math.round(a.maxHp * frac)); a.status = {}; }
  Coop.p2.run.hp = a.hp;
}
function reviveP2(w, a, frac) {
  Coop.p2.downT = 0;
  const p = w.player;
  Object.assign(a, { dead: false, deathT: 0, hp: Math.max(1, Math.round(a.maxHp * frac)), x: p.x, y: p.y, iframes: 2, action: null, status: {}, stun: 0 });
  w.vfx.push({ kind: 'heal', x: a.x, y: a.y, t: 0, life: 0.8 });
  Sound.playSE('se_m_morning_sun');
}

// Every host frame (before the simulation steps): read the guest's input, keep P2 in sync with its run.
export function coopFrame(scene, dt) {
  const w = scene.world;
  if (!w) return;
  if (Coop.role === 'host' && Coop.status === 'reconnecting' && w.p2) { Coop.remote.reset(); return; } // hold P2 still for a moment
  if (!Coop.active) { if (w.p2) removeP2(w); return; }
  Coop.remote.poll(scene.cam);
  if (!w.p2) { if (scene.state === 'play' || scene.state === 'intro') coopSpawnP2(scene); return; }
  const a = w.p2, st = Coop.p2;
  if (a.dead) {
    st.downT += dt;
    if (st.downT > 15 || scene.cleared) reviveP2(w, a, 0.5); // back up next to P1 with half HP
    return;
  }
  st.run.hp = a.hp;
  if (p2Key(st.run) !== a._key) coopRefreshP2(scene);
}

// The run ended: who played player 2 (for the record and the Hall of Fame), and tell the guest so the run is
// saved on its own account too (from its point of view).
export function coopTeam() {
  if (!Coop.p2 || !Coop.guest) return null;
  const r2 = Coop.p2.run;
  return { name: Coop.guest.name, starter: r2.starter, species: r2.species, partner: r2.partner?.species || null, boons: r2.boons.map(b => b.key) };
}
export function coopSendRun(entry, hostName) {
  const t = entry.coop;
  if (!t || Coop.role !== 'host' || Coop.ctl?.readyState !== 'open') return;
  const mine = { ...entry, starter: t.starter, species: t.species, partner: t.partner, boons: t.boons, coop: { name: hostName, starter: entry.starter, species: entry.species, partner: entry.partner }, coopGuest: true };
  try { Coop.ctl.send(JSON.stringify({ type: 'run', entry: mine })); } catch { /* channel closing */ }
}

// Host overlay: the code while waiting, P2's name/HP over its head.
export function coopStatusText() {
  if (Coop.role !== 'host') return null;
  if (Coop.status === 'waiting') return `CO-OP code ${Coop.code} · waiting for player 2`;
  if (Coop.status === 'starting' || Coop.status === 'connecting') return 'CO-OP connecting...';
  if (Coop.status === 'reconnecting') return 'CO-OP: player 2 reconnecting...';
  if (Coop.status === 'connected' && !Coop.guest) return 'CO-OP connected, waiting for player 2...';
  if (Coop.status === 'lost' || Coop.status === 'error') return `CO-OP: ${Coop.error || 'connection lost'}`;
  return null;
}

// Guest: the packet sent to the host every frame (held actions, movement, aim, mouse, press counters).
const counts = {};
export function guestPacket(Input, mouse) {
  for (const a of ACTIONS) if (Input.justPressed(a)) counts[a] = (counts[a] || 0) + 1;
  const m = { h: ACTIONS.filter(a => Input.down(a)), mx: +Input.move.x.toFixed(3), my: +Input.move.y.toFixed(3), c: counts, ma: Input.mouseAiming() };
  if (Input.usingPad) m.pad = 1;
  if (Input.aim) { m.ax = +Input.aim.x.toFixed(3); m.ay = +Input.aim.y.toFixed(3); }
  if (mouse.x >= 0) m.ms = [Math.round(mouse.x), Math.round(mouse.y)];
  return JSON.stringify(m);
}

// ---------------------------------------------------------------- the guest's own view (host side)
// The stream isn't the host's screen. The world is drawn once; the room copies it onto this canvas and draws the HUD
// again from player 2's side (its healthbox, moves, Call gauge and blessings where player 1's are, player 1 as the
// ally panel), then the overlays are drawn on top again as P2 sees them (its own button names, its run in G.run).
// Outside a room, or before P2 is in, the host's finished frame is copied as it is. Solo play never gets here.
const GV = { canvas: null, ctx: null, frame: -1 };
function guestCanvas() {
  if (!GV.canvas) {
    const c = GV.canvas = document.createElement('canvas');
    c.width = W; c.height = H;
    // in the page (1px, invisible) so every browser keeps capturing it
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(c);
    GV.ctx = c.getContext('2d', { alpha: false });
    GV.ctx.imageSmoothingEnabled = false;
  }
  return GV.canvas;
}

// The room, once its world is drawn: the guest view's context to copy the world onto and draw P2's HUD into, or null
// (not hosting, nobody connected, P2 not in the room yet).
export function coopGuestView(scene) {
  if (!GV.ctx || !Coop.active || !scene.world?.p2 || !Coop.p2) return null;
  GV.frame = Engine.frame;
  return GV.ctx;
}

// Draw something as player 2 sees it: the guest's button names (keyboard or pad), P2's run as G.run (pause menu,
// shop), and Coop.drawingP2 for the menus that word things differently for P2 (ui.js).
export function asP2View(fn) {
  const pad = Input.usingPad, run = G.run, swap = !!Coop.p2 && run === Coop.p2.base;
  Input.usingPad = Coop.remote.usingPad; Coop.drawingP2 = true;
  if (swap) G.run = Coop.p2.run;
  try { fn(); } finally { Input.usingPad = pad; Coop.drawingP2 = false; if (swap) G.run = run; }
}

// Engine.afterDraw while hosting: finish the guest's frame.
function composeGuestView() {
  const g = GV.ctx;
  if (Coop.role !== 'host' || !g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (GV.frame !== Engine.frame) { g.drawImage(Engine.canvas, 0, 0); return; } // not a co-op room frame: the host's screen
  if (Engine.overlays.length) asP2View(() => { for (const o of Engine.overlays) { g.save(); o.draw?.(g); g.restore(); } });
}

// Host name as player 2 sees player 1 (ally panel, tag).
export { GV as coopView }; // (tests: the guest view's canvas)

export function hostLabel() { return String(Cloud.me?.name || Cloud.me?.email?.split('@')[0] || 'P1').toUpperCase().slice(0, 12); }

export { G };
