// The main gameplay scene: one room of a run (or the hub). Loads a real FireRed map crop, runs the
// combat World, handles waves, rewards, doors, NPCs, prompts and transitions.
import { Engine, W, H, setScene, pushOverlay, topOverlay } from '../engine/core.js';
import { img, ready } from '../engine/assets.js';
import { text, measure } from '../engine/font.js';
import { pixBox, rect, windowFrame } from '../engine/ui.js';
import { Input } from '../engine/input.js';
import { Sound } from '../audio/sound.js';
import { D, TYPE_COLORS } from '../game/data.js';
import { World, STEP, TILE, makeActor, setAnim } from '../game/combat.js';
import '../game/combat_boons.js';
import { loadLayout, buildRoom, candidates, drawTileAnims, mapIndex } from '../game/rooms.js';
import { drawWorld, drawWorldTexts, drawVignette, drawBA } from '../game/render.js';
import { playerBrain, updateBalls, updateAllies } from '../game/player.js';
import { G, makePlayer, buildHooks, gainExp, expFor, rollDoors, saveMeta, REWARD_INFO, playerMaxHp, rank, saveRunSnapshot } from '../game/run.js';
import { BIOMES, STAGES, ACTS, areaOf, actOf } from '../game/content.js';
import { LEGENDS } from '../game/boons.js';
import { rollWave, makeEnemy, rollTrainer, trainerParty, trainerSprite } from '../game/spawn.js';
import { BOSSES, spawnBoss, bossDirector, bossesDefeated } from '../game/bosses.js';
import { preloadPmd, drawPmd } from '../game/pmd.js';
import { drawHud } from './hud.js';
import { Banner, say, drawOW, ICON } from './ui.js';
import * as R from './rewards.js';
import { Coop, coopFrame, coopStatusText, asP2Sync } from '../game/coop.js';
import { MapPopup, popupName, drawWipe, WIPE_TIME, BATTLE_WIPES, mugshot, MUGSHOT_PAL } from './transitions.js';

const VIEW_W = W / 2, VIEW_H = H / 2;

// How close you must be to talk to / use something: generous, since the nearest one always wins anyway.
const talkReach = n => Math.max(44, (n.range || 30) * 1.4);
// the last map name the popup showed, so it only shows when the name changes (a new area, another Silph floor)
let lastPopup = '';

export class RoomScene {
  // spec: { kind: 'combat'|'trainer'|'boss'|'shop'|'center'|'chaos'|'hub', layout, crop, reward:{kind,legend}, first }
  constructor(spec) {
    this.spec = spec; this.state = 'loading'; this.fade = 1; this.t = 0; this.acc = 0;
    this.banners = []; this.npcs = []; this.waves = []; this.doors = []; this.cam = { x: 0, y: 0 };
    this.run = G.run;
  }

  async enter() {
    const spec = this.spec;
    // autosave: snapshot the run as this room begins (before it rolls anything), for save & quit / crashes
    const devRoom = typeof location !== 'undefined' && /[?&]dev=/.test(location.search || '');
    if (spec.kind !== 'hub' && this.run && !spec.noSave && !devRoom) saveRunSnapshot(this.run, spec);
    try {
      const L = await loadLayout(spec.layout);
      const crop = spec.crop || candidates(spec.layout)[spec.cropIndex || 0] || { x: 0, y: 0, w: L.meta.w, h: L.meta.h };
      this.room = buildRoom(L, crop, { exits: spec.kind === 'boss' || spec.kind === 'hub' ? 1 : 3, waterWalk: false, entry: spec.entry, exitAtWarps: !!spec.shopRoom });
    } catch (e) { console.error('room load failed', spec, e); }
    const run = this.run;
    const world = this.world = new World(this.room, { rng: run.rng });
    world.run = run;
    world.maxAttackers = (areaOf(run)?.maxAttackers ?? 2) * (Coop.active ? 2 : 1); // co-op: two players to pressure
    const ent = this.room.entry;
    const p = world.player = makePlayer(run, ent.x, ent.y);
    p.brain = playerBrain; p.facing = -Math.PI / 2;
    world.add(p);
    world.hooks = buildHooks(run, world);
    this.layoutMap = Object.values(mapIndex().maps).find(m => m.layout === spec.layout);
    // preload sprites we'll need
    const dexes = [p.dex];
    if (run.partner) dexes.push(D.species[run.partner.species].dex);
    if (Coop.p2) dexes.push(D.species[Coop.p2.run.species].dex);
    await preloadPmd(dexes);
    this.setup();
    world.hooks.onRoomStart?.(world);
    this.snapCamera();
    this.state = 'intro';
    window.__room = this; // debugging / tests
  }

  // ---- content per room kind
  setup() {
    const spec = this.spec, run = this.run, w = this.world, B = areaOf(run);
    const music = B?.music || 'mus_pallet';
    if (spec.kind === 'combat' || spec.kind === 'trainer') {
      Sound.playBGM(music);
      this.mapPopup(spec.first ? `${ACTS[actOf(run.biome)].name} · ${B.intro}` : '');
      if (spec.kind === 'trainer' || (B.trainerOnly && run.rng.chance(0.6))) this.setupTrainer();
      else this.setupWaves();
    } else if (spec.kind === 'boss') {
      this.setupBoss();
    } else if (spec.kind === 'shop') {
      Sound.playBGM('mus_poke_center');
      this.addNpc({ sprite: 'clerk', ...this.at(2, 3), dir: 'right', name: 'CLERK', label: 'SHOP', range: 56, onTalk: () => R.openShop(this) });
      this.clearRoom(true);
    } else if (spec.kind === 'center') {
      Sound.playBGM('mus_poke_center');
      this.addNpc({ sprite: 'nurse', ...this.at(7, 2), dir: 'down', fixed: true, name: 'NURSE JOY', label: 'HEAL', range: 64, /* behind the counter: reachable from anywhere along its front */ onTalk: () => R.nurse(this) });
      if (spec.preBoss) this.addNpc({ sprite: 'clerk', ...this.at(12, 5), dir: 'left', name: 'CLERK', label: 'SHOP', range: 52, onTalk: () => R.openShop(this) });
      this.clearRoom(true);
    } else if (spec.kind === 'chaos') {
      Sound.playBGM('mus_encounter_deoxys');
      this.mapPopup();
      const c = this.room.center;
      this.addNpc({ dex: 386, x: c.x, y: c.y - 10, name: 'DEOXYS', onTalk: () => R.chaosBargain(this) });
      this.clearRoom(true);
    } else if (spec.kind === 'hub') {
      lastPopup = '';
      this.setupHub();
    }
  }

  // FireRed's map name popup when entering a map whose name differs from the last one shown
  mapPopup(sub = '') {
    const B = areaOf(this.run); if (!B) return;
    const pn = popupName(B.name, this.layoutMap);
    if (!this.spec.first && pn.name === lastPopup) return;
    lastPopup = pn.name;
    this.popup = new MapPopup(pn.name, { wide: pn.wide, sub, hold: sub ? 3 : 2 });
  }

  setupWaves() {
    const run = this.run, B = areaOf(run);
    const nw = run.rng.int(B.waves[0], B.waves[1]);
    for (let i = 0; i < nw; i++) {
      const n = (run.rng.int(B.perWave[0], B.perWave[1]) + Math.floor(run.roomInBiome / 3) + (run.heat >= 7 ? 1 : 0)) * (Coop.active ? 2 : 1); // co-op: twice the foes
      this.waves.push(rollWave(run, n).map(e => ({ ...e, elite: run.depth > 2 && run.rng.chance(0.08 + run.biome * 0.03 + (run.heat >= 4 ? 0.1 : 0)) })));
    }
    this.waveT = 0.9; this.waveI = 0;
    preloadPmd([...new Set(this.waves.flat().map(e => D.species[e.species].dex))]);
  }

  setupTrainer() {
    const run = this.run;
    const t = rollTrainer(run, new Set(run.trainersBeaten || []));
    if (!t) return this.setupWaves();
    run.trainersBeaten = [...(run.trainersBeaten || []), t.key];
    this.trainer = t;
    const party = trainerParty(run, t, this.spec.kind === 'trainer' ? 2 : 0);
    // the trainer stands at the far exit
    const ex = this.room.exits[0] || this.room.center;
    const npc = this.addNpc({ sprite: trainerSprite(t), x: ex.x, y: ex.y + 8, dir: 'down', name: `${t.className} ${t.name}`, trainer: true });
    // two at a time
    const per = Coop.active ? 4 : 2; // co-op: the party comes out twice as fast, plus a second helping of wild ones
    for (let i = 0; i < party.length; i += per) this.waves.push(party.slice(i, i + per).map(e => ({ ...e, trainerMon: true, elite: this.spec.kind === 'trainer' })));
    if (Coop.active) this.waves.push(rollWave(run, party.length + Math.floor(run.roomInBiome / 3)).map(e => ({ ...e, trainerMon: true })));
    // small parties get backup from the area's other POKéMON
    if (party.length < 3) this.waves.push(rollWave(run, 2 + Math.floor(run.roomInBiome / 3)).map(e => ({ ...e, trainerMon: true })));
    this.waveT = 99; this.waveI = 0;
    preloadPmd(party.map(e => D.species[e.species].dex));
    this.pendingIntro = async () => {
      Sound.playBGM(t.encounterSong ? t.encounterSong.toLowerCase() : 'mus_encounter_boy');
      npc.emote = 1.0;
      await say([`${t.className} ${t.name} would like to battle!`], { pic: `gfx/trainers/${t.pic}.png` });
      Sound.playBGM('mus_vs_trainer');
      this.blink = 0.36; // FireRed's battle intro: the screen blinks before the fight
      this.waveT = 0.2;
    };
  }

  setupBoss() {
    const run = this.run, key = this.spec.boss, def = BOSSES[key];
    const c = this.room.exits[0] ? { x: this.room.center.x, y: (this.room.center.y + this.room.exits[0].y) / 2 } : this.room.center;
    this.bossKey = key;
    const dexes = def.mons.map(m => D.species[m.species].dex);
    if (def.adds) dexes.push(D.species[def.adds.species].dex);
    if (def.finale) dexes.push(D.species[def.finale.species].dex);
    preloadPmd(dexes);
    Sound.playBGM(key === 'MAROWAK' ? 'mus_poke_tower' : key === 'MEWTWO' ? 'mus_rocket_hideout' : 'mus_gym');
    if (def.sprite) this.addNpc({ sprite: def.sprite, x: c.x, y: c.y - 30, dir: 'down', name: D.trainers[def.trainer]?.name || key, trainer: true });
    this.bossSpawnAt = c;
    this.pendingIntro = async () => {
      const name = def.sprite ? (D.trainers[def.trainer]?.name || key) : key === 'MAROWAK' ? 'GHOST' : 'MEWTWO';
      if (key === 'MEWTWO') { Sound.playCry('MEWTWO'); }
      const tr = def.trainer && D.trainers[def.trainer];
      await say(def.intro.map(t => ({ text: t, name })), { portrait: def.sprite ? null : (key === 'MEWTWO' ? 150 : null), pic: tr ? `gfx/trainers/${tr.pic}.png` : null });
      Sound.playBGM(def.music);
      // FireRed's Elite Four mugshot transition ("VS") instead of a banner; the world waits under it
      const me = D.species[this.run.species];
      const wildPic = name === 'GHOST' ? 'gfx/pokemon/ghost/front.png' : !tr && D.species[def.mons[0].species]?.sprites?.front ? `gfx/pokemon/${D.species[def.mons[0].species].sprites.front}` : null; // FireRed's battle sprites
      await mugshot({ pal: MUGSHOT_PAL[key], name, title: def.title, pic: tr ? `gfx/trainers/${tr.pic}.png` : wildPic, portrait: D.species[def.mons[0].species].dex, playerDex: me?.dex, playerName: me?.name });
      const list = spawnBoss(this.world, key, this.bossSpawnAt);
      for (const b of list) { b.spawnT = 0.8; b.spawnMax = 0.8; Sound.playCry(b.species); }
      if (def.sprite) Sound.playSE('se_ball_open');
      this.bossLive = true;
    };
  }

  setupHub() {
    Sound.playBGM('mus_oak_lab');
    R.setupHub(this);
  }

  at(x, y) { return { tx: x - this.room.crop.x, ty: y - this.room.crop.y }; }

  addNpc(n) {
    if (n.tx !== undefined) { n.x = n.tx * TILE + 8; n.y = n.ty * TILE + 16; }
    n.emote = 0;
    if (n.dex) preloadPmd([n.dex]);
    this.npcs.push(n);
    return n;
  }

  // ---- waves
  spawnWave(list) {
    const w = this.world, p = w.player;
    for (const e of list) {
      const pt = w.randomOpenPoint(p, 90);
      let at = pt;
      if (this.trainer && this.npcs[0]) { // trainer mons pop out near the trainer
        const n = this.npcs[0];
        at = w.randomOpenPoint(null); for (let k = 0; k < 30; k++) { const q = w.randomOpenPoint(null); if (Math.hypot(q.x - n.x, q.y - n.y) < Math.hypot(at.x - n.x, at.y - n.y) && Math.hypot(q.x - p.x, q.y - p.y) > 60) at = q; }
      }
      const a = makeEnemy(w, e.species, e.level, { x: at.x, y: at.y, moves: e.moves, elite: e.elite, shiny: this.run.rng.chance(1 / 200) });
      a.trainerMon = !!e.trainerMon;
      a.facing = Math.atan2(p.y - a.y, p.x - a.x);
      w.add(a);
      w.hooks.onSpawn?.(w, a);
      G.meta.dex.seen[e.species] = true;
      if (e.trainerMon) w.vfx.push({ kind: 'sendout', x: a.x, y: a.y, t: 0, life: 0.5 });
      else w.vfx.push({ kind: 'custom', t: 0, life: 0.45, draw: (ctx, v, k) => { const grass = w.room.grass?.[Math.floor(a.y / TILE) * w.room.w + Math.floor(a.x / TILE)]; const im = img(`gfx/misc/field_effects/${grass ? 'jump_tall_grass' : 'ground_impact_dust'}.png`); if (!ready(im)) return; if (grass) { const f = Math.min(1, Math.floor(k * 2)); ctx.drawImage(im, 0, f * 16, 16, 16, Math.round(a.x - 8), Math.round(a.y - 12), 16, 16); } else { const f = Math.min(2, Math.floor(k * 3)); ctx.drawImage(im, 0, f * 8, 16, 8, Math.round(a.x - 8), Math.round(a.y - 6), 16, 8); } } }); // FireRed field effects: grass rustle / ground dust
    }
    if (list.some(e => e.trainerMon)) Sound.playSE('se_ball_open'); else Sound.playSE('se_m_razor_wind2');
    this.world.maxAttackers = Math.max(areaOf(this.run)?.maxAttackers ?? 2, 1) * (Coop.active ? 2 : 1);
  }

  updateWaves(dt) {
    if (this.waveI >= this.waves.length) return;
    const alive = this.world.enemies().length;
    if (alive <= (this.waveI > 0 ? 1 : 0)) this.waveT -= dt;
    if (this.waveT <= 0) {
      this.spawnWave(this.waves[this.waveI++]);
      this.waveT = 1.0;
    }
  }

  // ---- room cleared: prompts, then the reward, then the doors
  async clearRoom(quiet = false) {
    if (this.cleared) return;
    this.cleared = true;
    const run = this.run, w = this.world;
    if (!quiet) {
      if (this.trainer) { Sound.playBGM('mus_victory_trainer'); this.musicBackAt = this.t + 6; const prize = Math.round(D.trainerClasses?.[this.trainer.class]?.money || 10) * 2 + 10; run.money += Math.round(prize * (w.player.moneyMul || 1)); this.banners.push(new Banner(`Defeated ${this.trainer.className} ${this.trainer.name}!`, `Got ¥${Math.round(prize * (w.player.moneyMul || 1))} for winning!`, { life: 2.2 })); }
      else Sound.playSE('se_success');
      w.hooks.onRoomClear?.(w);
      for (const c of run.chaos) if (!c.active) { c.rooms--; if (c.rooms <= 0) { c.active = true; this.banners.push(new Banner('DEOXYS\'s curse lifts!', c.blessing.name, { color: '#d050a0' })); } }
    }
    await R.levelPrompts(this);
    if (this.spec.reward && !quiet && this.spec.kind !== 'boss') R.spawnReward(this, this.spec.reward, this.lastKillAt || this.room.center);
    else this.openDoors();
  }

  openDoors() {
    if (this.doorsOpen) return;
    this.doorsOpen = true;
    const run = this.run;
    if (this.spec.kind === 'hub') return;
    if (this.spec.kind === 'boss') {
      const last = run.biome >= STAGES - 1;
      this.doors = [{ ...this.room.exits[0], reward: { kind: last ? 'victory' : 'next' } }];
    } else {
      const rewards = rollDoors(run, this.room.exits.length);
      this.doors = rewards.map((r, i) => ({ ...this.room.exits[i % this.room.exits.length], reward: r }));
    }
    const pl = this.world.player;
    for (const d of this.doors) { d.t = 0; d.armed = Math.hypot(d.x - pl.x, d.y - pl.y) > 16; if (d.reward.kind === 'boon') preloadPmd([LEGENDS[d.reward.legend].dex]); }
    R.addDoorIcons(this);
    Sound.playSE('se_door');
  }

  // ---- main loop
  update(dt) {
    this.t += dt;
    Input.poll();
    if (this.state === 'loading') return;
    const w = this.world;
    // mouse in world coordinates
    Input.mouseWorld = { x: Engine.mouse.x / 2 + this.cam.x, y: Engine.mouse.y / 2 + this.cam.y };
    if (this.state === 'intro') { this.fade = Math.max(0, this.fade - dt * 3); if (this.fade <= 0) { this.state = 'play'; if (this.pendingIntro) { const f = this.pendingIntro; this.pendingIntro = null; f(); } } }
    if (this.state === 'exiting') { this.fade = Math.min(1, this.fade + dt / (this.wipe?.dur || 0.29)); if (this.fade >= 1 && this.next) { const n = this.next; this.next = null; n(); } return; }
    if (Input.justPressed('pause') && this.state === 'play') { R.openPause(this); return; }
    if (Coop.role === 'host') coopFrame(this, dt); // co-op: the guest's input drives player 2
    if (this.musicBackAt && this.t > this.musicBackAt) { this.musicBackAt = 0; Sound.playBGM(areaOf(this.run)?.music || 'mus_pallet'); } // back to the area's music after a win
    // fixed-step simulation
    const scale = w.slowmo > 0 ? 0.35 : 1;
    this.acc += dt * scale;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) { this.acc -= STEP; steps++; this.step(STEP); }
    if (steps >= 4) this.acc = 0;
    this.updateCamera(dt);
    this.banners = this.banners.filter(b => b.update(dt));
    if (this.blink > 0) this.blink -= dt;
    if (this.popup && this.state !== 'intro' && !this.popup.update(dt)) this.popup = null; // like FireRed: after the fade-in
  }

  step(dt) {
    const w = this.world, run = this.run;
    if (this.state !== 'play' && this.state !== 'intro') return;
    w.step(dt);
    updateBalls(w, dt);
    updateAllies(w, dt);
    run.time += dt;
    if (w.player) run.hp = Math.max(0, w.player.hp);
    if (this.trainer || this.waves.length) this.updateWaves(dt);
    if (this.bossLive) bossDirector(w);
    for (const n of this.npcs) { if (n.emote > 0) n.emote -= dt; this.npcFacing(n, dt); }
    for (const e of w.events.splice(0)) this.onEvent(e);
    // clear check
    if (!this.cleared && this.state === 'play') {
      const fightDone = this.bossLive ? bossesDefeated(w) : (this.waves.length && this.waveI >= this.waves.length && !w.enemies().length);
      if (fightDone && !this.pendingIntro) {
        if (this.bossLive) R.bossDefeated(this); else this.clearRoom();
      }
    }
    if (this.spec.kind === 'hub' || this.cleared) this.interactions();
    if (this.doorsOpen) this.checkDoors(dt);
    if (w.player.dead && !this.dying && !this.bossDone) this.die();
  }

  onEvent(e) {
    const run = this.run, w = this.world;
    switch (e.type) {
      case 'kill': {
        const a = e.actor; run.kills++;
        this.lastKillAt = { x: a.x, y: a.y };
        if (a.team === 'enemy' && !a.noExp) {
          const ev = gainExp(run, expFor(run, a, a.trainerMon));
          for (const l of ev) { w.text(w.player, `Lv ${l.level}!`, '#80ffff'); Sound.playSE('se_exp_max'); w.player.level = run.level; R.refreshPlayer(this); }
          const money = Math.round((1 + a.level * 0.25) * (w.player.moneyMul || 1) * (a.trainerMon ? 0.5 : 1));
          if (!a.boss) { run.money += money; w.texts.push({ str: `¥${money}`, x: a.x, y: a.y - 10, t: 0, life: 0.9, color: 'gold' }); }
        }
        break;
      }
      case 'money': run.money += Math.round(e.amount * (w.player.moneyMul || 1)); w.texts.push({ str: `¥${e.amount}`, x: e.x, y: e.y - 10, t: 0, life: 0.9, color: 'gold' }); break;
      case 'catch': Input.rumble(200, 0.3, 0.8); if (e.by?.p2) asP2Sync(this, () => R.onCatch(this, e.actor, e.ball)); else R.onCatch(this, e.actor, e.ball); break; // co-op: P2's catch is P2's partner
      case 'revive': this.banners.push(new Banner('REVIVED!', 'Back on your feet!', { color: '#f8d060', life: 1.6 })); w.vfx.push({ kind: 'heal', x: w.player.x, y: w.player.y, t: 0, life: 0.8 }); Sound.playSE('se_m_morning_sun'); break;
      case 'bossPhase': w.shake = 8; Sound.playCry(e.actor.species, { mode: 'roar_1' }); if (e.actor.species === 'MAROWAK' && e.phase === 1) this.banners.push(new Banner('The GHOST was MAROWAK!', 'Its spirit rages!', { color: '#a080ff' })); if (e.actor.species === 'MEWTWO' && e.phase === 2) this.banners.push(new Banner('MEWTWO is enraged!', '', { color: '#f85888', life: 1.6 })); break;
      case 'banner': this.banners.push(new Banner(e.text, '', { life: 1.6, color: '#f8f8f8' })); break;
      case 'pickup': R.onPickup(this, e.pickup); break;
      case 'hurt': if (G.meta.settings.shake) Engine.shake = 0; { const f = Math.min(1, (e.dmg || 0) / Math.max(1, w.player.maxHp) * 5); Input.rumble(90 + f * 160, 0.25 + 0.6 * f, 0.5 + 0.4 * f); } break;
    }
  }

  interactions() {
    const p = this.world.player;
    let near = null, nd = 1e9;
    for (const n of this.npcs) { if (!n.onTalk) continue; const d = Math.hypot(n.x - p.x, n.y - 8 - p.y); if (d < talkReach(n) && d < nd) { nd = d; near = n; } }
    this.nearNpc = near;
    // buffered press, not justPressed: this runs in fixed 60 Hz steps, and on 120/144 Hz screens many frames run no step,
    // so a press that landed on one of those frames used to be lost ("A is hard to trigger")
    if (near && Input.pressed('interact') && !topOverlay()) { Input.consume('interact'); Sound.playSE('se_select'); near.onTalk(near); }
    // co-op: player 2 talks to NPCs with its own interact button
    const a = this.world.p2;
    this.nearNpc2 = null;
    if (!a || a.dead || !Coop.active || topOverlay()) return;
    let nd2 = 1e9;
    for (const n of this.npcs) { if (!n.onTalk) continue; const d = Math.hypot(n.x - a.x, n.y - 8 - a.y); if (d < talkReach(n) && d < nd2) { nd2 = d; this.nearNpc2 = n; } }
    if (this.nearNpc2 && Coop.remote.pressed('interact')) { Coop.remote.consume('interact'); Sound.playSE('se_select'); R.coopTalk(this, this.nearNpc2); }
  }

  checkDoors(dt) {
    const p = this.world.player;
    this.nearDoor = null;
    for (const d of this.doors) {
      d.t += dt;
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd > 16) d.armed = true;
      if (dd < 22) this.nearDoor = d;
      if (dd < 10 && d.armed && this.state === 'play' && !d.used && !topOverlay()) { d.used = true; this.leave(d.reward); return; }
    }
    // Itemfinder reroll
    if (this.nearDoor && Input.pressed('interact') && !Input.down('dash') && !this.nearNpc && this.run.rerolls > 0 && !['boss', 'center', 'next', 'victory', 'start'].includes(this.nearDoor.reward.kind)) {
      this.run.rerolls--; Input.consume('interact');
      const r = rollDoors(this.run, 3).find(x => x.kind !== this.nearDoor.reward.kind && x.kind !== 'boss' && x.kind !== 'center');
      if (r) { this.nearDoor.reward = r; Sound.playSE('se_itemfinder'); if (r.kind === 'boon') preloadPmd([LEGENDS[r.legend].dex]); }
    }
  }

  leave(reward) {
    Sound.playSE(this.spec.kind === 'hub' ? 'se_exit' : 'se_door');
    this.state = 'exiting';
    // FireRed: doors, stairs and new areas fade to black; walking into another fight is a battle wipe; the boss
    // gets the blinking intro and a closing circle
    const from = this.spec.kind, to = reward.kind;
    let kind = 'fade';
    if (to === 'boss') kind = 'boss';
    else if (!['hub', 'shop', 'center'].includes(from) && !['center', 'shop', 'next', 'victory', 'start'].includes(to)) kind = BATTLE_WIPES[Math.floor(Math.random() * BATTLE_WIPES.length)];
    const p = this.world.player;
    this.wipe = { kind, dur: WIPE_TIME[kind], cx: (p.x - this.cam.x) * 2, cy: (p.y - 8 - this.cam.y) * 2 };
    this.next = () => R.goNext(this, reward);
  }

  async die() {
    this.dying = true;
    const w = this.world;
    Sound.playCry(w.player.species, { mode: 'faint' });
    w.slowmo = 2;
    setTimeout(() => R.gameOver(this), 1600);
  }

  // ---- camera
  snapCamera() { const p = this.world.player; this.cam = this.camTarget(p); }
  camTarget(p) {
    const Rm = this.room, rw = Rm.w * TILE, rh = Rm.h * TILE;
    let fx = p.x, fy = p.y;
    const p2 = this.world.p2;
    if (p2 && !p2.dead) { fx = (p.x + p2.x) / 2; fy = (p.y + p2.y) / 2; } // co-op: keep both players in view
    // frame bosses: look partway toward them
    const bosses = this.world.actors.filter(a => a.boss && !a.dead && a.spawnT <= 0);
    if (bosses.length) {
      const bx = bosses.reduce((s, a) => s + a.x, 0) / bosses.length, by = bosses.reduce((s, a) => s + a.y, 0) / bosses.length;
      if (Math.hypot(bx - p.x, by - p.y) < 320) { fx += (bx - p.x) * 0.4; fy += (by - p.y) * 0.4; }
    }
    let x = fx - VIEW_W / 2, y = fy - 8 - VIEW_H / 2;
    if (Input.mouseAiming() && Input.mouseWorld && this.state === 'play') { x += (Input.mouseWorld.x - p.x) * 0.12; y += (Input.mouseWorld.y - p.y) * 0.12; }
    if (rw <= VIEW_W) x = (rw - VIEW_W) / 2; else x = Math.max(-16, Math.min(rw - VIEW_W + 16, x));
    const pad = bosses.length ? bosses.length * 13 + 16 : 0; // the boss bars cover the top of the screen
    if (rh <= VIEW_H + 8) y = (rh - VIEW_H) / 2 + 14; else y = Math.max(-24 - pad, Math.min(rh - VIEW_H + 40, y));
    if (pad) { // keep the bosses (and the trainer behind them) below their bars, as long as the player stays in view
      const top = Math.min(...bosses.map(a => a.y)) - 36;
      y = Math.min(y, Math.max(top - pad, p.y - VIEW_H + 40, -24 - pad));
    }
    // never look past the edge of the whole map into the black void when the map goes on (a crop at a layout's
    // edge); a little slack at the bottom, where the HUD covers the corners anyway
    const lx0 = -Rm.ox, lx1 = (Rm.fullW || Rm.w) * TILE - Rm.ox - VIEW_W, ly0 = -Rm.oy - (pad ? 8 : 0), ly1 = (Rm.fullH || Rm.h) * TILE - Rm.oy - VIEW_H + 20;
    if (lx1 >= lx0) x = Math.max(lx0, Math.min(lx1, x));
    if (ly1 >= ly0) y = Math.max(ly0, Math.min(ly1, y));
    return { x, y };
  }
  updateCamera(dt) {
    const t = this.camTarget(this.world.player);
    const k = 1 - Math.exp(-8 * dt);
    this.cam.x += (t.x - this.cam.x) * k; this.cam.y += (t.y - this.cam.y) * k;
  }

  // ---- drawing
  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (this.state === 'loading' || !this.world) { text(ctx, 'Loading...', W / 2, H / 2, { align: 'center', color: 'white' }); return; }
    const w = this.world;
    const sh = w.shake * (G.meta.settings.shake ?? 1);
    // the camera snaps to screen pixels (half world pixels), not world pixels: scrolling moves in 1px steps and
    // sprites wobble against the map by at most 1px instead of 2
    const cx2 = Math.round((this.cam.x + (sh ? (Math.random() - 0.5) * sh : 0)) * 2), cy2 = Math.round((this.cam.y + (sh ? (Math.random() - 0.5) * sh : 0)) * 2);
    const cx = cx2 / 2, cy = cy2 / 2;
    ctx.save();
    ctx.setTransform(2, 0, 0, 2, -cx2, -cy2);
    ctx.imageSmoothingEnabled = false;
    const tick = Math.floor(this.t * 60);
    drawWorld(ctx, w, this.cam, {
      tileAnims: c => drawTileAnims(c, this.room, tick),
      underlay: c => this.drawDoors(c),
      extraSprites: items => { for (const n of this.npcs) items.push({ y: n.y - 2, draw: c => this.drawNpc(c, n) }); },
      screenTexts: true,
    });
    ctx.restore();
    // a move's battle background flashes over the screen (FireRed's Psychic etc.)
    if (w.bgFlash) { const f = w.bgFlash, k = f.t / f.life; if (k >= 1) w.bgFlash = null; else { const im = img(`gfx/battle_anims/backgrounds/${f.bg}.png`); if (ready(im)) { ctx.save(); ctx.globalAlpha = 0.22 * Math.sin(k * Math.PI); const ox = (this.t * 40) % im.naturalWidth; for (let x = -ox; x < W; x += im.naturalWidth * 2) for (let y = 0; y < H; y += im.naturalHeight * 2) ctx.drawImage(im, x, y, im.naturalWidth * 2, im.naturalHeight * 2); ctx.restore(); } } }
    if (w.screenFlash) { const f = w.screenFlash; ctx.fillStyle = `rgba(${f.color},${f.a * (1 - f.t / f.life)})`; ctx.fillRect(0, 0, W, H); } // THUNDER's flash
    drawWorldTexts(ctx, w, { x: cx, y: cy });
    const B = areaOf(this.run);
    if (B?.vignette && this.spec.kind !== 'hub' && this.spec.kind !== 'shop' && this.spec.kind !== 'center') drawVignette(ctx, W, H, B.vignette, (w.player.x - cx) * 2, (w.player.y - 8 - cy) * 2); // centred on the player, like FLASH
    if (this.world.player.hp < this.world.player.maxHp * 0.25 && !this.world.player.dead) { ctx.fillStyle = `rgba(200,0,0,${0.12 + 0.08 * Math.sin(this.t * 6)})`; ctx.fillRect(0, 0, W, H); }
    // NPC labels (screen space): small FireRed sign tags that fade with distance; the nearest one becomes the prompt
    if (!topOverlay()) for (const n of this.npcs) if (n.label && this.nearNpc !== n && this.nearNpc2 !== n) {
      const p = w.player, d = Math.hypot(n.x - p.x, n.y - 8 - p.y);
      this.tag(ctx, n.label, n.x, n.y - (n.sprite ? 40 : 22), Math.max(0.7, Math.min(1, 1.6 - d / 160)));
    }
    // prompts
    if (this.nearNpc && !topOverlay()) this.prompt(ctx, `${Input.label('interact')}: ${this.nearNpc.verb || 'Talk'}`, this.nearNpc.x, this.nearNpc.y - 40);
    if (this.nearDoor && this.doorsOpen) {
      const info = R.rewardLabel(this.nearDoor.reward);
      this.prompt(ctx, info + (this.run.rerolls > 0 && !['boss', 'center', 'next', 'victory', 'start'].includes(this.nearDoor.reward.kind) ? `   (${Input.label('interact')}: reroll ×${this.run.rerolls})` : ''), this.nearDoor.x, this.nearDoor.y - 40);
    }
    if (this.doorsOpen && this.spec.kind !== 'hub') this.drawDoorArrows(ctx);
    if ((this.spec.kind !== 'hub' || this.run) && !topOverlay()?.hidesHud) drawHud(ctx, w, this.run, { hub: this.spec.kind === 'hub' }); // dialogue boxes cover the HUD
    this.drawCoop(ctx);
    for (const b of this.banners) b.draw(ctx);
    if (this.popup) this.popup.draw(ctx);
    if (this.blink > 0) { const b = Math.sin((1 - this.blink / 0.36) * Math.PI * 2); ctx.fillStyle = `rgba(0,0,0,${(0.75 * b * b).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (this.spec.kind === 'hub') R.drawHubHints(ctx, this);
    if (this.fade > 0) { if (this.state === 'exiting' && this.wipe) drawWipe(ctx, this.wipe.kind, this.fade, this.wipe); else drawWipe(ctx, 'fade', this.fade); }
  }

  // co-op: player 2's name and HP over its head, plus the connection status
  drawCoop(ctx) {
    const a = this.world.p2;
    if (a) {
      const sx = (a.x - this.cam.x) * 2, sy = (a.y - this.cam.y) * 2 - a.r * 2 - 46;
      if (a.dead) text(ctx, `${a.label || 'P2'} fainted · back in ${Math.max(0, Math.ceil(15 - (Coop.p2?.downT || 0)))}s`, sx, sy, { align: 'center', font: 'small', color: ['#ff9080', '#202020'] });
      else {
        text(ctx, a.label || 'P2', sx, sy - 2, { align: 'center', font: 'small', color: ['#80d0ff', '#202020'] });
        rect(ctx, sx - 20, sy + 11, 40, 4, '#202020'); rect(ctx, sx - 19, sy + 12, 38 * Math.max(0, a.hp / a.maxHp), 2, a.hp < a.maxHp * 0.25 ? '#f04040' : '#40d860');
      }
    }
    // compact player-2 panel (bottom centre), since both players watch the same screen
    if (a) {
      const x = 258, y = H - 46, wdt = 200;
      pixBox(ctx, x, y, wdt, 40, 'rgba(16,20,32,0.85)', '#80d0ff', 2);
      text(ctx, `${a.label || 'P2'} · ${D.species[a.species]?.name || ''} Lv${a.level}`, x + 6, y + 3, { font: 'small', color: ['#80d0ff', '#202020'] });
      const r2 = a.run; // its own partner and Call gauge
      if (r2?.partner) text(ctx, `${D.species[r2.partner.species]?.name || ''} ${r2.callGauge >= 1 ? 'F!' : Math.floor(r2.callGauge * 100) + '%'}`, x + wdt - 6, y + 3, { align: 'right', font: 'small', color: r2.callGauge >= 1 ? 'gold' : 'gray' });
      rect(ctx, x + 6, y + 16, wdt - 12, 4, '#202020'); rect(ctx, x + 7, y + 17, (wdt - 14) * Math.max(0, a.hp / a.maxHp), 2, a.hp < a.maxHp * 0.25 ? '#f04040' : '#40d860');
      ['attack', 'special', 'cast'].forEach((slot, i) => {
        const mv = a.slots?.[slot], cd = a.cds?.['slot_' + slot] || 0, max = a.cdMax?.['slot_' + slot] || 1;
        const bx = x + 6 + i * 64;
        rect(ctx, bx, y + 24, 60, 12, '#283048');
        if (cd > 0) rect(ctx, bx, y + 24, 60 * Math.min(1, cd / max), 12, '#101420');
        text(ctx, (D.moves[mv]?.name || '-').slice(0, 11), bx + 30, y + 24, { align: 'center', font: 'small', color: cd > 0 ? 'gray' : 'white' });
      });
    }
    if (this.nearNpc2 && !topOverlay()) this.prompt(ctx, `${this.world.p2?.label || 'P2'}: E to ${this.nearNpc2.verb || 'talk'}`, this.nearNpc2.x, this.nearNpc2.y - 54);
    const s = coopStatusText();
    if (s) { const tw = measure(s, 'small') + 16; pixBox(ctx, W / 2 - tw / 2, 4, tw, 16, 'rgba(16,20,32,0.85)', '#80d0ff', 2); text(ctx, s, W / 2, 5, { align: 'center', font: 'small', color: 'white' }); }
  }

  // arrows at the screen edge pointing to exits that are off screen
  // (FireRed's warp arrow at 2x, like the doors themselves, with the reward's icon beside it)
  drawDoorArrows(ctx) {
    for (const d of this.doors) {
      const sx = (d.x - this.cam.x) * 2, sy = (d.y - this.cam.y) * 2;
      if (sx > 12 && sx < W - 12 && sy > 12 && sy < H - 64) continue;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      let dir, px, py; // at the screen edge nearest the door, clear of the HUD
      if (sy <= 12) { dir = 'up'; px = clamp(sx, 64, W - 40); py = 44; }
      else if (sy >= H - 64) { dir = 'down'; px = clamp(sx, 64, W - 40); py = H - 84; }
      else if (sx <= 12) { dir = 'left'; px = 56; py = clamp(sy, 60, H - 110); }
      else { dir = 'right'; px = W - 24; py = clamp(sy, 60, H - 110); }
      const ax = Math.round(px / 2), ay = Math.round(py / 2); // in 2x units
      const off = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[dir]; // the icon sits on the inner side
      ctx.save(); ctx.scale(2, 2);
      R.drawWarpArrow(ctx, dir, ax, ay, this.t);
      R.drawRewardIcon(ctx, d.reward, ax + off[0] * 24, ay + off[1] * 24);
      ctx.restore();
    }
  }

  // interaction prompt: a FireRed text window (std frame, dark text) with the key in a blue button cap
  prompt(ctx, str, wx, wy) {
    const m = /^([^:]+): (.*)$/.exec(str), key = m && m[1].length <= 6 ? m[1] : null, body = key ? m[2] : str;
    const kw = key ? measure(key, 'small') + 8 : 0, tw = measure(body, 'small') + 20 + (key ? kw + 4 : 0), h = 22;
    let sx = Math.round((wx - this.cam.x) * 2 - tw / 2), sy = Math.round((wy - this.cam.y) * 2 - h / 2);
    sx = Math.max(4, Math.min(W - tw - 4, sx)); sy = Math.max(4, Math.min(H - h - 64, sy));
    windowFrame(ctx, sx, sy, tw, h, 'std');
    let x = sx + 10;
    if (key) { pixBox(ctx, x, sy + 5, kw, 12, '#3152ce', '#202858', 2); text(ctx, key, x + kw / 2, sy + 4, { font: 'small', color: 'white', align: 'center' }); x += kw + 4; }
    text(ctx, body, x, sy + 4, { font: 'small', color: 'dark' });
  }
  // a small name tag over an NPC (world point wx, wy = the tag's bottom centre)
  tag(ctx, str, wx, wy, alpha = 1) {
    const tw = measure(str, 'small') + 12, h = 18;
    let sx = Math.round((wx - this.cam.x) * 2 - tw / 2), sy = Math.round((wy - this.cam.y) * 2 - h);
    sx = Math.max(4, Math.min(W - tw - 4, sx)); sy = Math.max(4, sy);
    ctx.save(); ctx.globalAlpha = alpha;
    windowFrame(ctx, sx, sy, tw, h, 'std');
    text(ctx, str, sx + tw / 2, sy + 2, { font: 'small', color: 'dark', align: 'center' });
    ctx.restore();
  }

  // NPCs turn to face you when you come close (FireRed NPCs face the player to talk); some look around when idle
  npcFacing(n, dt) {
    if (!n.sprite || n.trainer || n.fixed) return;
    const p = this.world.player, near = p && Math.hypot(n.x - p.x, n.y - 8 - p.y) < talkReach(n) * 1.25;
    if (near) {
      const dx = p.x - n.x, dy = p.y - (n.y - 8);
      n.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      n.lookT = 1.2;
    } else if (n.lookAround && (n.lookT = (n.lookT ?? 2) - dt) <= 0) { // MOVEMENT_TYPE_LOOK_AROUND
      n.face = ['down', 'left', 'right', 'up', n.dir, n.dir][Math.floor(Math.random() * 6)];
      n.lookT = 1.5 + Math.random() * 2.5;
    } else if (!n.lookAround && n.lookT > 0 && (n.lookT -= dt) <= 0) n.face = null; // back to its post
  }

  drawNpc(ctx, n) {
    if (n.dex) drawPmd(ctx, n.dex, n.x, n.y - 4 - (n.float ? 6 + Math.sin(this.t * 2) * 3 : 0), { anim: n.anim || 'Idle', dir: n.pdir || 0, t: this.t });
    else if (n.sprite) drawOW(ctx, n.sprite, n.x, n.y, n.face || n.dir || 'down');
    if (n.icon) { const im = img(n.icon); if (ready(im)) ctx.drawImage(im, Math.round(n.x - im.naturalWidth / 2), Math.round(n.y - im.naturalHeight - 2 + Math.sin(this.t * 3) * 1.5)); }
    if (n.emote > 0) { const im = img('gfx/misc/emotes/exclamation.png'); if (ready(im)) ctx.drawImage(im, 0, 0, 16, 16, Math.round(n.x - 8), Math.round(n.y - 48), 16, 16); }

  }

  drawDoors(ctx) {
    if (!this.doorsOpen) {
      // locked exits glow faintly so the player knows where they'll be
      // locked exits show FireRed's X emote so the player knows where they'll be
      const xim = img('gfx/misc/emotes/x.png');
      if (ready(xim) && this.spec.kind !== 'hub') { ctx.save(); ctx.globalAlpha = 0.7; for (const e of this.room.exits) ctx.drawImage(xim, 32, 0, 16, 16, Math.round(e.x - 8), Math.round(e.y - 10), 16, 16); ctx.restore(); }
      return;
    }
    for (const d of this.doors) R.drawDoor(ctx, this, d);
  }
}
