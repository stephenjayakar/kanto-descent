// Co-op (staging prototype): host-streamed remote play.
// The host's browser runs the real game with a second player in the world. The guest's browser shows the
// host's canvas + audio as a WebRTC stream and sends its inputs back over a data channel. Convex only
// relays the one-time offer/answer (game:coop.*); after that the browsers talk directly (STUN only, so
// some strict networks can't connect yet).
import { Engine } from '../engine/core.js';
import { Sound } from '../audio/sound.js';
import { D } from './data.js';
import { STARTERS } from './content.js';
import { profile } from './moves_rt.js';
import { G, makePlayer, nextEvolution, PLAYER_BANNED } from './run.js';
import { playerBrain } from './player.js';
import { coopCreate, coopGet, coopAnswer } from './cloud.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const ACTIONS = ['attack', 'special', 'dash', 'cast', 'call', 'ball', 'interact', 'pause', 'confirm', 'back'];
const BUFFER_FRAMES = 8;

// The guest's controls as the host sees them; same interface as engine/input.js's Input.
class RemoteInput {
  constructor() { this.reset(); }
  reset() {
    this.move = { x: 0, y: 0 }; this.aim = null; this.mouseWorld = null; this.msg = null;
    this._held = new Set(); this._prev = new Set(); this._buffer = new Map(); this._counts = {}; this._mouseAim = false;
  }
  receive(m) { this.msg = m; }
  // once per host frame; cam converts the guest's screen-space mouse to world coordinates
  poll(cam) {
    const m = this.msg || { h: [], mx: 0, my: 0, c: {} };
    this._prev = this._held; this._held = new Set(m.h || []);
    this.move.x = m.mx || 0; this.move.y = m.my || 0;
    this.aim = m.ax != null ? { x: m.ax, y: m.ay } : null;
    this._mouseAim = !!m.ma;
    this.mouseWorld = m.ms && cam ? { x: m.ms[0] / 2 + cam.x, y: m.ms[1] / 2 + cam.y } : null;
    for (const [k, v] of this._buffer) { if (v <= 1) this._buffer.delete(k); else this._buffer.set(k, v - 1); }
    // presses arrive as counters, so a quick tap survives a dropped (unreliable) packet
    for (const a of ACTIONS) { const n = m.c?.[a] || 0; if (n > (this._counts[a] || 0)) this._buffer.set(a, BUFFER_FRAMES); this._counts[a] = n; }
  }
  down(a) { return this._held.has(a); }
  pressed(a) { return this._buffer.has(a); }
  justPressed(a) { return this._held.has(a) && !this._prev.has(a); }
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
    const video = Engine.canvas.captureStream(60).getVideoTracks()[0];
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
    else { Coop.ctl = e.channel; e.channel.onopen = () => e.channel.send(JSON.stringify({ type: 'hello', ...hello })); }
  };
  await pc.setRemoteDescription({ type: 'offer', sdp: room.offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await iceDone(pc);
  await coopAnswer(code, pc.localDescription.sdp);
}

// ---------------------------------------------------------------- the second player (host side)
// P2 shares the run (level, blessings, held item, money) but plays its own starter, which evolves with the shared level.
function bestMove(species, level, want, fallback) {
  let best = fallback, bp = fallback ? profile(fallback).power : -1;
  const lines = [species]; for (let s = D.species[species]?.preEvolution; s; s = D.species[s]?.preEvolution) lines.push(s);
  for (const sp of lines) for (const [lv, m] of D.species[sp]?.learnset || []) {
    if (lv > level || !D.moves[m] || PLAYER_BANNED.has(m)) continue;
    const p = profile(m);
    if (!p.damaging || p.melee !== (want === 'attack') || p.power <= bp || p.power > 100) continue;
    best = m; bp = p.power;
  }
  return best;
}
function p2Slots(st, level) {
  const kit = STARTERS.find(s => s.species === st.starter) || STARTERS[0];
  return { attack: bestMove(st.species, level, 'attack', kit.slots.attack), special: bestMove(st.species, level, 'special', kit.slots.special), cast: kit.slots.cast };
}

function buildP2(world, run, x, y) {
  const st = Coop.p2 ??= { starter: Coop.guest.starter, species: Coop.guest.starter, hp: null, downT: 0 };
  for (let i = 0; i < 3; i++) { const n = nextEvolution(st.species, run.level); if (!n || !D.species[n] || n === 'CHOICE') break; st.species = n; }
  const r2 = Object.create(run);
  r2.species = st.species; r2.slots = st.slots = p2Slots(st, run.level); r2.hp = 1e9;
  const a = makePlayer(r2, x, y);
  a.hp = st.hp == null ? a.maxHp : Math.max(1, Math.min(a.maxHp, st.hp));
  Object.assign(a, { brain: playerBrain, input: Coop.remote, slots: r2.slots, p2: true, label: Coop.guest.name, facing: -Math.PI / 2 });
  a._key = `${run.level}|${run.boons.length}|${run.held}|${run.maxHpMul}`;
  return a;
}

// Put P2 into the current room (on room start, or when the guest connects mid-room).
export function coopSpawnP2(scene) {
  const w = scene.world;
  if (!Coop.active || !w?.player || (w.p2 && !w.p2.removed)) return;
  const p = w.player;
  const at = w.collides(p.x + 16, p.y, 6, 'walk') ? { x: p.x, y: p.y } : { x: p.x + 16, y: p.y };
  const a = buildP2(w, scene.run, at.x, at.y);
  a.iframes = 1.5;
  w.p2 = a; w.add(a);
  w.vfx.push({ kind: 'sendout', x: a.x, y: a.y, t: 0, life: 0.5 });
}

function removeP2(w) {
  if (!w?.p2) return;
  w.p2.removed = true; w.actors = w.actors.filter(x => x !== w.p2); w.p2 = null;
}

// Every host frame (before the simulation steps): read the guest's input, keep P2 in sync with the run.
export function coopFrame(scene, dt) {
  const w = scene.world;
  if (!w) return;
  if (Coop.role === 'host' && Coop.status === 'reconnecting' && w.p2) { Coop.remote.reset(); return; } // hold P2 still for a moment
  if (!Coop.active) { if (w.p2) removeP2(w); return; }
  Coop.remote.poll(scene.cam);
  if (!w.p2) { if (scene.state === 'play' || scene.state === 'intro') coopSpawnP2(scene); return; }
  const a = w.p2, run = scene.run, st = Coop.p2;
  if (a.dead) {
    st.downT += dt;
    if (st.downT > 8 || scene.cleared) { // back up next to P1 with half HP
      st.downT = 0; st.hp = Math.round(a.maxHp * 0.5);
      const p = w.player;
      Object.assign(a, { dead: false, deathT: 0, hp: st.hp, x: p.x, y: p.y, iframes: 2, action: null, status: {}, stun: 0 });
      w.vfx.push({ kind: 'heal', x: a.x, y: a.y, t: 0, life: 0.8 });
      Sound.playSE('se_m_morning_sun');
    }
    return;
  }
  st.hp = a.hp;
  // the shared run changed (level, blessings, items): rebuild P2's stats in place
  const key = `${run.level}|${run.boons.length}|${run.held}|${run.maxHpMul}`;
  if (key !== a._key) {
    const frac = a.hp / a.maxHp;
    const n = buildP2(w, run, a.x, a.y);
    const keep = ['x', 'y', 'facing', 'pc', 'cds', 'cdMax', 'status', 'stages', 'stageTimers', 'iframes', 'id', 'action', 'kx', 'ky', 'dashing', 'noCollide', 'anim', 'animT', 'speedMul', 'z', 'stun'];
    const saved = {}; for (const k of keep) saved[k] = a[k];
    for (const k of Object.keys(a)) delete a[k];
    Object.assign(a, n, saved);
    a.hp = Math.max(1, Math.round(a.maxHp * frac));
  }
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
  if (Input.aim) { m.ax = +Input.aim.x.toFixed(3); m.ay = +Input.aim.y.toFixed(3); }
  if (mouse.x >= 0) m.ms = [Math.round(mouse.x), Math.round(mouse.y)];
  return JSON.stringify(m);
}

export { G };
