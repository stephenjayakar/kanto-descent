// Realtime profiles for Gen 3 moves. A profile says how a move plays in the arena: its shape
// (swipe, lunge, projectile, beam...), its timing, and what it looks/sounds like. Damage still comes
// from the real move data (power, type, effect) through the Gen 3 formula in combat.js.
//
// kinds:
//   swipe   arc in front (range, arc). combo: chain length for the Attack button
//   lunge   short dash that hits on the way (dist)
//   charge  long dash, pierces (dist, dur); recoil moves hurt the user a bit
//   multi   several quick swipes in place (hits)
//   proj    projectile(s) (speed, count, spread, size, pierce, homing, lob, bounce)
//   stream  a held spray of small projectiles (dur, rate)
//   beam    windup then a long line (len, width)
//   chain   lightning that jumps between targets (jumps, range)
//   nova    ring around the user (radius)
//   strike  delayed blast at a target point (radius, delay, count)
//   cloud   lingering zone at target or self (radius, dur, status)
//   buff / debuff / heal / protect / teleport / seed / trap / dig
import { D, isSpecial } from './data.js';

const P = {
  // ---- Normal / physical basics
  SCRATCH: { kind: 'swipe', range: 22, arc: 1.9, combo: 3, cd: 0.17, fx: 'claw' , sfx: 'se_m_scratch' },
  POUND: { kind: 'swipe', range: 20, arc: 1.6, combo: 3, cd: 0.17, fx: 'impact', sfx: 'se_m_comet_punch' },
  TACKLE: { kind: 'lunge', dist: 26, range: 14, cd: 0.23, fx: 'impact', sfx: 'se_m_comet_punch' },
  QUICK_ATTACK: { kind: 'lunge', dist: 56, range: 14, dur: 0.12, cd: 0.28, fx: 'impact', sfx: 'se_m_take_down' },
  HEADBUTT: { kind: 'lunge', dist: 30, range: 16, cd: 0.4, fx: 'impact', sfx: 'se_m_headbutt' },
  HORN_ATTACK: { kind: 'lunge', dist: 30, range: 16, cd: 0.36, fx: 'impact', sfx: 'se_m_horn_attack' },
  PECK: { kind: 'swipe', range: 22, arc: 0.9, combo: 3, cd: 0.16, fx: 'impact', sfx: 'se_m_horn_attack' },
  DRILL_PECK: { kind: 'lunge', dist: 40, range: 18, cd: 0.35, fx: 'impact', sfx: 'se_m_horn_attack' },
  SLASH: { kind: 'swipe', range: 28, arc: 2.4, combo: 3, cd: 0.2, fx: 'claw', crit: 0.25, sfx: 'se_m_cut' },
  CUT: { kind: 'swipe', range: 28, arc: 2.2, combo: 2, cd: 0.22, fx: 'cut', sfx: 'se_m_cut' },
  FURY_SWIPES: { kind: 'multi', hits: 4, range: 22, arc: 1.8, cd: 0.45, fx: 'claw', sfx: 'se_m_scratch' },
  FURY_ATTACK: { kind: 'multi', hits: 4, range: 24, arc: 0.9, cd: 0.45, fx: 'impact', sfx: 'se_m_horn_attack' },
  COMET_PUNCH: { kind: 'multi', hits: 4, range: 20, arc: 1.2, cd: 0.45, fx: 'fist', sfx: 'se_m_comet_punch' },
  DOUBLE_SLAP: { kind: 'multi', hits: 3, range: 20, arc: 1.4, cd: 0.4, fx: 'impact', sfx: 'se_m_double_slap' },
  DOUBLE_KICK: { kind: 'multi', hits: 2, range: 22, arc: 1.4, cd: 0.32, fx: 'impact', sfx: 'se_m_mega_kick' },
  KARATE_CHOP: { kind: 'swipe', range: 24, arc: 1.4, combo: 3, cd: 0.18, fx: 'impact', crit: 0.25, sfx: 'se_m_vital_throw' },
  LOW_KICK: { kind: 'swipe', range: 22, arc: 2.2, combo: 2, cd: 0.22, fx: 'impact', sfx: 'se_m_mega_kick' },
  MEGA_PUNCH: { kind: 'lunge', dist: 24, range: 18, cd: 0.5, fx: 'fist', knock: 160, sfx: 'se_m_mega_kick' },
  MEGA_KICK: { kind: 'lunge', dist: 28, range: 20, cd: 0.6, fx: 'impact', knock: 200, sfx: 'se_m_mega_kick2' },
  BITE: { kind: 'swipe', range: 20, arc: 1.1, combo: 2, cd: 0.24, fx: 'bite', sfx: 'se_m_bite' },
  CRUNCH: { kind: 'swipe', range: 22, arc: 1.2, combo: 2, cd: 0.28, fx: 'bite', sfx: 'se_m_bite' },
  HYPER_FANG: { kind: 'lunge', dist: 30, range: 16, cd: 0.35, fx: 'bite', sfx: 'se_m_bite' },
  SUPER_FANG: { kind: 'lunge', dist: 30, range: 16, cd: 0.9, fx: 'bite', sfx: 'se_m_bite' },
  METAL_CLAW: { kind: 'swipe', range: 24, arc: 2.0, combo: 3, cd: 0.18, fx: 'claw', sfx: 'se_m_scratch' },
  WING_ATTACK: { kind: 'swipe', range: 30, arc: 2.6, combo: 2, cd: 0.22, fx: 'wind', sfx: 'se_m_wing_attack' },
  STOMP: { kind: 'strike', radius: 20, delay: 0.0, count: 1, self: true, cd: 0.5, fx: 'impact', sfx: 'se_m_mega_kick' },
  SLAM: { kind: 'swipe', range: 30, arc: 2.0, combo: 1, cd: 0.45, fx: 'impact', knock: 160, sfx: 'se_m_mega_kick' },
  BODY_SLAM: { kind: 'lunge', dist: 44, range: 20, cd: 0.6, fx: 'impact', knock: 120, sfx: 'se_m_mega_kick' },
  TAKE_DOWN: { kind: 'charge', dist: 70, dur: 0.24, range: 16, cd: 0.7, fx: 'impact', recoil: 0.15, sfx: 'se_m_take_down' },
  DOUBLE_EDGE: { kind: 'charge', dist: 90, dur: 0.28, range: 18, cd: 0.9, fx: 'impact', recoil: 0.2, sfx: 'se_m_take_down' },
  SKULL_BASH: { kind: 'charge', dist: 90, dur: 0.3, range: 20, windup: 0.4, cd: 1.0, fx: 'impact', sfx: 'se_m_headbutt' },
  RAPID_SPIN: { kind: 'nova', radius: 26, cd: 0.6, fx: 'wind', sfx: 'se_m_razor_wind', clears: true },
  ROLLOUT: { kind: 'charge', dist: 110, dur: 0.45, range: 16, cd: 0.6, fx: 'impact', sfx: 'se_m_take_down', roll: true },
  FLAIL: { kind: 'multi', hits: 3, range: 22, arc: 2.4, cd: 0.5, fx: 'impact', sfx: 'se_m_double_slap' },
  STRENGTH: { kind: 'lunge', dist: 26, range: 22, cd: 0.6, fx: 'fist', knock: 240, sfx: 'se_m_strength' },
  SEISMIC_TOSS: { kind: 'lunge', dist: 20, range: 18, cd: 0.8, fx: 'impact', knock: 220, fixed: 'level', sfx: 'se_m_vital_throw' },
  SUBMISSION: { kind: 'charge', dist: 60, dur: 0.22, range: 18, cd: 0.8, fx: 'impact', recoil: 0.2, sfx: 'se_m_vital_throw' },
  CROSS_CHOP: { kind: 'swipe', range: 26, arc: 1.4, combo: 2, cd: 0.3, crit: 0.3, fx: 'impact', sfx: 'se_m_vital_throw2' },
  DYNAMIC_PUNCH: { kind: 'lunge', dist: 24, range: 20, cd: 0.9, fx: 'fist', status: { kind: 'confuse', chance: 1 }, sfx: 'se_m_mega_kick2' },
  FIRE_PUNCH: { kind: 'swipe', range: 22, arc: 1.4, combo: 3, cd: 0.2, fx: 'fist', sfx: 'se_m_fire_punch' },
  ICE_PUNCH: { kind: 'swipe', range: 22, arc: 1.4, combo: 3, cd: 0.2, fx: 'fist', sfx: 'se_m_comet_punch' },
  THUNDER_PUNCH: { kind: 'swipe', range: 22, arc: 1.4, combo: 3, cd: 0.2, fx: 'fist', sfx: 'se_m_thunder_wave' },
  LICK: { kind: 'swipe', range: 20, arc: 1.4, combo: 3, cd: 0.18, fx: 'ghost', sfx: 'se_m_lick' },
  VINE_WHIP: { kind: 'swipe', range: 40, arc: 1.2, combo: 2, cd: 0.22, fx: 'vine', sfx: 'se_m_vicegrip' },
  CLAMP: { kind: 'swipe', range: 20, arc: 1.0, combo: 1, cd: 0.6, fx: 'bite', status: { kind: 'trap', chance: 1 }, sfx: 'se_m_vicegrip' },
  CRABHAMMER: { kind: 'swipe', range: 24, arc: 1.4, combo: 2, cd: 0.32, crit: 0.25, fx: 'impact', sfx: 'se_m_crabhammer' },
  VICE_GRIP: { kind: 'swipe', range: 20, arc: 1.0, combo: 2, cd: 0.28, fx: 'bite', sfx: 'se_m_vicegrip' },
  GUILLOTINE: { kind: 'swipe', range: 22, arc: 1.0, combo: 1, cd: 1.2, fx: 'bite', sfx: 'se_m_vicegrip' },
  BONE_CLUB: { kind: 'swipe', range: 26, arc: 1.8, combo: 3, cd: 0.22, fx: 'bone', sfx: 'se_m_mega_kick' },
  BONEMERANG: { kind: 'proj', speed: 170, size: 6, count: 1, life: 1.2, boomerang: true, pierce: 99, cd: 0.7, sprite: 'bone', spin: true, sfx: 'se_m_bonemerang' },
  PIN_MISSILE: { kind: 'proj', speed: 260, size: 3, count: 4, spread: 0.35, life: 0.6, cd: 0.6, sprite: 'needle', sfx: 'se_m_horn_attack' },
  TWINEEDLE: { kind: 'proj', speed: 240, size: 3, count: 2, spread: 0.18, life: 0.6, cd: 0.4, sprite: 'needle', sfx: 'se_m_horn_attack' },
  POISON_STING: { kind: 'proj', speed: 220, size: 3, count: 1, life: 0.7, cd: 0.3, sprite: 'needle', sfx: 'se_m_horn_attack' },
  SPIKE_CANNON: { kind: 'proj', speed: 250, size: 3, count: 5, spread: 0.5, life: 0.6, cd: 0.7, sprite: 'needle', sfx: 'se_m_horn_attack' },
  // ---- special projectiles
  EMBER: { kind: 'proj', speed: 210, size: 5, count: 1, life: 0.8, cd: 0.3, sprite: 'ember', sfx: 'se_m_ember' },
  FLAMETHROWER: { kind: 'stream', dur: 0.7, rate: 0.045, speed: 230, size: 6, life: 0.5, spread: 0.18, cd: 1.2, sprite: 'ember', sfx: 'se_m_flamethrower' },
  FIRE_BLAST: { kind: 'proj', speed: 160, size: 11, count: 1, life: 1.2, cd: 1.6, sprite: 'fireblast', explode: 34, sfx: 'se_m_flame_wheel' },
  FIRE_SPIN: { kind: 'cloud', radius: 24, dur: 3, at: 'target', cd: 1.6, tick: 0.35, sprite: 'ember', sfx: 'se_m_flame_wheel', status: { kind: 'trap', chance: 1 } },
  FLAME_WHEEL: { kind: 'charge', dist: 70, dur: 0.24, range: 16, cd: 0.7, fx: 'fire', sfx: 'se_m_flame_wheel', trail: 'fire' },
  HEAT_WAVE: { kind: 'nova', radius: 50, cd: 1.6, fx: 'fire', sfx: 'se_m_heat_wave' },
  SACRED_FIRE: { kind: 'stream', dur: 0.8, rate: 0.04, speed: 250, size: 7, life: 0.55, spread: 0.24, cd: 1.4, sprite: 'ember', sfx: 'se_m_sacred_fire' },
  OVERHEAT: { kind: 'proj', speed: 170, size: 14, count: 1, life: 1.2, cd: 2.4, sprite: 'fireblast', explode: 44, sfx: 'se_m_sacred_fire2' },
  WATER_GUN: { kind: 'proj', speed: 240, size: 5, count: 1, life: 0.7, cd: 0.3, sprite: 'water', sfx: 'se_m_bubble' },
  BUBBLE: { kind: 'proj', speed: 170, size: 5, count: 3, spread: 0.35, life: 1.0, cd: 0.5, sprite: 'bubble', wobble: true, sfx: 'se_m_bubble' },
  BUBBLE_BEAM: { kind: 'stream', dur: 0.5, rate: 0.06, speed: 190, size: 5, life: 0.6, spread: 0.25, cd: 1.0, sprite: 'bubble', sfx: 'se_m_bubble_beam' },
  HYDRO_PUMP: { kind: 'beam', len: 150, width: 14, windup: 0.35, dur: 0.4, cd: 2.0, fx: 'water', knock: 220, sfx: 'se_m_hydro_pump' },
  SURF: { kind: 'nova', radius: 64, cd: 1.8, fx: 'water', knock: 180, sfx: 'se_m_surf', wave: true },
  WATERFALL: { kind: 'charge', dist: 60, dur: 0.22, range: 18, cd: 0.7, fx: 'water', sfx: 'se_m_waterfall' },
  OCTAZOOKA: { kind: 'proj', speed: 200, size: 7, count: 1, life: 0.8, cd: 0.7, sprite: 'ink', explode: 18, sfx: 'se_m_bubble3' },
  AURORA_BEAM: { kind: 'beam', len: 130, width: 8, windup: 0.25, dur: 0.25, cd: 1.0, fx: 'ice', sfx: 'se_m_icy_wind' },
  ICE_BEAM: { kind: 'beam', len: 150, width: 10, windup: 0.3, dur: 0.3, cd: 1.4, fx: 'ice', sfx: 'se_m_icy_wind' },
  BLIZZARD: { kind: 'strike', radius: 22, delay: 0.5, count: 5, scatter: 40, cd: 2.2, fx: 'ice', sfx: 'se_m_blizzard' },
  POWDER_SNOW: { kind: 'stream', dur: 0.4, rate: 0.06, speed: 160, size: 5, life: 0.5, spread: 0.5, cd: 0.8, sprite: 'snow', sfx: 'se_m_icy_wind' },
  ICY_WIND: { kind: 'proj', speed: 180, size: 6, count: 5, spread: 0.9, life: 0.6, cd: 1.0, sprite: 'snow', sfx: 'se_m_icy_wind' },
  RAZOR_LEAF: { kind: 'proj', speed: 230, size: 4, count: 3, spread: 0.32, life: 0.7, cd: 0.45, sprite: 'leaf', spin: true, crit: 0.25, sfx: 'se_m_razor_wind2' },
  MAGICAL_LEAF: { kind: 'proj', speed: 200, size: 4, count: 2, spread: 0.3, life: 1.0, homing: 6, cd: 0.45, sprite: 'leaf', spin: true, sfx: 'se_m_razor_wind2' },
  SOLAR_BEAM: { kind: 'beam', len: 180, width: 16, windup: 0.7, dur: 0.45, cd: 2.6, fx: 'solar', sfx: 'se_m_solar_beam' },
  PETAL_DANCE: { kind: 'nova', radius: 40, cd: 1.2, fx: 'petal', sfx: 'se_m_petal_dance', repeat: 3 },
  ABSORB: { kind: 'proj', speed: 200, size: 5, count: 1, life: 0.7, cd: 0.35, sprite: 'orb_green', drain: 0.5, sfx: 'se_m_absorb' },
  MEGA_DRAIN: { kind: 'proj', speed: 200, size: 6, count: 1, life: 0.8, cd: 0.5, sprite: 'orb_green', drain: 0.5, sfx: 'se_m_absorb_2' },
  GIGA_DRAIN: { kind: 'proj', speed: 200, size: 7, count: 2, spread: 0.2, life: 0.8, cd: 0.6, sprite: 'orb_green', drain: 0.5, sfx: 'se_m_giga_drain' },
  THUNDER_SHOCK: { kind: 'chain', jumps: 1, range: 90, cd: 0.32, fx: 'spark', sfx: 'se_m_thunderbolt' },
  THUNDERBOLT: { kind: 'chain', jumps: 3, range: 120, cd: 0.6, fx: 'spark', sfx: 'se_m_thunderbolt2' },
  THUNDER: { kind: 'strike', radius: 24, delay: 0.45, count: 1, cd: 1.4, fx: 'lightning', sfx: 'se_m_thunderbolt2' },
  SPARK: { kind: 'lunge', dist: 40, range: 16, cd: 0.4, fx: 'spark', sfx: 'se_m_thunder_wave' },
  ZAP_CANNON: { kind: 'proj', speed: 120, size: 10, count: 1, life: 1.6, cd: 2.0, sprite: 'orb_yellow', explode: 30, sfx: 'se_m_thunderbolt2' },
  CONFUSION: { kind: 'strike', radius: 18, delay: 0.25, count: 1, cd: 0.45, fx: 'psychic', sfx: 'se_m_psybeam' },
  PSYBEAM: { kind: 'beam', len: 130, width: 9, windup: 0.25, dur: 0.3, cd: 0.9, fx: 'psychic', sfx: 'se_m_psybeam2' },
  PSYCHIC: { kind: 'strike', radius: 30, delay: 0.35, count: 1, cd: 1.0, fx: 'psychic', knock: 160, sfx: 'se_m_psybeam' },
  PSYWAVE: { kind: 'nova', radius: 44, cd: 1.2, fx: 'psychic', sfx: 'se_m_psybeam2', wave: true, fixed: 'level' },
  DREAM_EATER: { kind: 'strike', radius: 22, delay: 0.3, count: 1, cd: 1.0, fx: 'psychic', drain: 0.5, sfx: 'se_m_nightmare' },
  SWIFT: { kind: 'proj', speed: 190, size: 4, count: 3, spread: 0.5, life: 1.2, homing: 8, cd: 0.8, sprite: 'star', spin: true, sfx: 'se_m_swift' },
  NIGHT_SHADE: { kind: 'strike', radius: 18, delay: 0.3, count: 1, cd: 0.7, fx: 'ghost', fixed: 'level', sfx: 'se_m_nightmare' },
  SHADOW_BALL: { kind: 'proj', speed: 170, size: 8, count: 1, life: 1.2, cd: 0.9, sprite: 'shadow', explode: 22, sfx: 'se_m_nightmare' },
  SHADOW_PUNCH: { kind: 'swipe', range: 30, arc: 1.2, combo: 2, cd: 0.25, fx: 'ghost', sfx: 'se_m_comet_punch' },
  ACID: { kind: 'proj', speed: 170, size: 5, count: 2, spread: 0.3, life: 0.8, cd: 0.45, sprite: 'sludge', sfx: 'se_m_bubble3' },
  SLUDGE: { kind: 'proj', speed: 160, size: 7, count: 1, life: 0.9, cd: 0.6, sprite: 'sludge', explode: 18, puddle: 'poison', sfx: 'se_m_bubble3' },
  SLUDGE_BOMB: { kind: 'proj', speed: 170, size: 9, count: 1, life: 1.0, cd: 1.0, sprite: 'sludge', explode: 28, puddle: 'poison', sfx: 'se_m_bubble3' },
  SMOG: { kind: 'cloud', radius: 26, dur: 3, at: 'front', cd: 1.4, tick: 0.5, sprite: 'smog', status: { kind: 'poison', chance: 0.4 }, sfx: 'se_m_toxic' },
  POISON_GAS: { kind: 'cloud', radius: 30, dur: 3.5, at: 'front', cd: 2.0, tick: 0.5, sprite: 'smog', status: { kind: 'poison', chance: 1 }, sfx: 'se_m_toxic' },
  ROCK_THROW: { kind: 'proj', speed: 150, size: 6, count: 1, life: 1.0, lob: true, cd: 0.7, sprite: 'rock', explode: 16, sfx: 'se_m_rock_throw' },
  ROCK_SLIDE: { kind: 'strike', radius: 18, delay: 0.55, count: 4, scatter: 34, cd: 1.6, fx: 'rock', sfx: 'se_m_rock_throw' },
  ROCK_TOMB: { kind: 'strike', radius: 18, delay: 0.5, count: 3, scatter: 24, cd: 1.6, fx: 'rock', sfx: 'se_m_rock_throw' },
  ANCIENT_POWER: { kind: 'proj', speed: 180, size: 6, count: 5, spread: 1.0, life: 0.9, cd: 1.0, sprite: 'rock', sfx: 'se_m_rock_throw' },
  MUD_SLAP: { kind: 'proj', speed: 200, size: 5, count: 1, life: 0.6, cd: 0.4, sprite: 'mud', sfx: 'se_m_dig' },
  SAND_ATTACK: { kind: 'debuff', stat: 'acc', radius: 30, at: 'front', cd: 4, fx: 'sand', sfx: 'se_m_sand_attack' },
  MAGNITUDE: { kind: 'nova', radius: 56, cd: 1.6, fx: 'quake', sfx: 'se_m_earthquake', grounded: true },
  EARTHQUAKE: { kind: 'nova', radius: 80, cd: 2.0, fx: 'quake', sfx: 'se_m_earthquake', grounded: true },
  FISSURE: { kind: 'beam', len: 140, width: 14, windup: 0.6, dur: 0.3, cd: 2.4, fx: 'quake', sfx: 'se_m_earthquake', grounded: true },
  DIG: { kind: 'dig', dur: 0.9, radius: 24, cd: 1.6, fx: 'quake', sfx: 'se_m_dig' },
  BONE_RUSH: { kind: 'multi', hits: 4, range: 24, arc: 1.6, cd: 0.45, fx: 'bone', sfx: 'se_m_mega_kick' },
  GUST: { kind: 'proj', speed: 160, size: 9, count: 1, life: 0.8, pierce: 3, cd: 0.6, sprite: 'wind', knock: 120, sfx: 'se_m_gust' },
  RAZOR_WIND: { kind: 'proj', speed: 260, size: 6, count: 3, spread: 0.4, life: 0.6, cd: 1.2, windup: 0.4, sprite: 'wind', pierce: 3, sfx: 'se_m_razor_wind' },
  AEROBLAST: { kind: 'beam', len: 190, width: 18, windup: 0.4, dur: 0.4, cd: 2.0, fx: 'wind', knock: 240, sfx: 'se_m_razor_wind' },
  TWISTER: { kind: 'swipe', range: 34, arc: 3.0, combo: 2, cd: 0.3, fx: 'wind', sfx: 'se_m_twister' },
  SKY_ATTACK: { kind: 'charge', dist: 130, dur: 0.3, range: 22, windup: 0.6, cd: 2.0, fx: 'wind', sfx: 'se_m_fly' },
  FLY: { kind: 'dig', dur: 0.9, radius: 26, cd: 1.6, fx: 'wind', sfx: 'se_m_fly', air: true },
  DRAGON_RAGE: { kind: 'proj', speed: 190, size: 8, count: 1, life: 0.9, cd: 1.0, sprite: 'dragon', fixed: 40, explode: 20, sfx: 'se_m_dragon_rage' },
  DRAGON_BREATH: { kind: 'stream', dur: 0.5, rate: 0.05, speed: 210, size: 6, life: 0.45, spread: 0.3, cd: 1.0, sprite: 'dragon', sfx: 'se_m_dragon_rage' },
  OUTRAGE: { kind: 'multi', hits: 5, range: 30, arc: 3.2, cd: 1.0, fx: 'dragon', sfx: 'se_m_dragon_rage' },
  SONIC_BOOM: { kind: 'proj', speed: 240, size: 5, count: 1, life: 0.6, cd: 0.6, sprite: 'wind', fixed: 20, sfx: 'se_m_razor_wind2' },
  TRI_ATTACK: { kind: 'proj', speed: 200, size: 5, count: 3, spread: 0.45, life: 0.8, cd: 0.8, sprite: 'tri', sfx: 'se_m_tri_attack' },
  HYPER_BEAM: { kind: 'beam', len: 200, width: 18, windup: 0.6, dur: 0.5, cd: 3.0, fx: 'hyper', recharge: 0.7, sfx: 'se_m_hyper_beam' },
  SELF_DESTRUCT: { kind: 'nova', radius: 50, windup: 0.6, cd: 3.0, fx: 'explosion', selfKO: 0.5, sfx: 'se_m_self_destruct' },
  EXPLOSION: { kind: 'nova', radius: 64, windup: 0.8, cd: 4.0, fx: 'explosion', selfKO: 0.5, sfx: 'se_m_explosion' },
  EGG_BOMB: { kind: 'proj', speed: 150, size: 7, count: 1, life: 1.0, lob: true, cd: 0.9, sprite: 'egg', explode: 24, sfx: 'se_m_explosion' },
  BARRAGE: { kind: 'proj', speed: 170, size: 5, count: 3, spread: 0.6, life: 0.9, lob: true, cd: 0.9, sprite: 'egg', explode: 14, sfx: 'se_m_explosion' },
  PAY_DAY: { kind: 'proj', speed: 220, size: 4, count: 3, spread: 0.4, life: 0.7, cd: 0.5, sprite: 'coin', money: true, sfx: 'se_m_pay_day' },
  SPLASH: { kind: 'buff', none: true, cd: 1.0, sfx: 'se_m_bubble' },
  // ---- status moves
  GROWL: { kind: 'debuff', stat: 'atk', radius: 56, at: 'self', cd: 5, fx: 'sound', sfx: 'se_m_screech' },
  TAIL_WHIP: { kind: 'debuff', stat: 'def', radius: 48, at: 'self', cd: 5, fx: 'sound', sfx: 'se_m_tail_whip' },
  LEER: { kind: 'debuff', stat: 'def', radius: 70, at: 'front', cd: 5, fx: 'sound', sfx: 'se_m_leer' },
  SCREECH: { kind: 'debuff', stat: 'def', stages: 2, radius: 64, at: 'self', cd: 6, fx: 'sound', sfx: 'se_m_screech' },
  SCARY_FACE: { kind: 'debuff', stat: 'spe', stages: 2, radius: 70, at: 'front', cd: 6, fx: 'sound', sfx: 'se_m_leer' },
  STRING_SHOT: { kind: 'proj', speed: 200, size: 4, count: 1, life: 0.7, cd: 1.0, sprite: 'string', status: { kind: 'slow', chance: 1 }, sfx: 'se_m_string_shot' },
  SMOKESCREEN: { kind: 'cloud', radius: 34, dur: 4, at: 'self', cd: 8, sprite: 'smoke', blind: true, sfx: 'se_m_sand_attack' },
  SLEEP_POWDER: { kind: 'cloud', radius: 26, dur: 2.2, at: 'front', cd: 7, sprite: 'powder_blue', status: { kind: 'sleep', chance: 1 }, sfx: 'se_m_poison_powder' },
  STUN_SPORE: { kind: 'cloud', radius: 26, dur: 2.2, at: 'front', cd: 6, sprite: 'powder_yellow', status: { kind: 'para', chance: 1 }, sfx: 'se_m_poison_powder' },
  POISON_POWDER: { kind: 'cloud', radius: 26, dur: 2.5, at: 'front', cd: 6, sprite: 'powder_purple', status: { kind: 'poison', chance: 1 }, sfx: 'se_m_poison_powder' },
  SPORE: { kind: 'cloud', radius: 30, dur: 2.2, at: 'front', cd: 8, sprite: 'powder_green', status: { kind: 'sleep', chance: 1 }, sfx: 'se_m_poison_powder' },
  SING: { kind: 'debuff', status: 'sleep', radius: 60, at: 'self', cd: 9, fx: 'note', sfx: 'se_m_sing' },
  HYPNOSIS: { kind: 'proj', speed: 120, size: 6, count: 1, life: 1.2, cd: 6, sprite: 'ring', status: { kind: 'sleep', chance: 1 }, sfx: 'se_m_supersonic' },
  SUPERSONIC: { kind: 'proj', speed: 160, size: 8, count: 1, life: 0.9, pierce: 9, cd: 4, sprite: 'ring', status: { kind: 'confuse', chance: 1 }, sfx: 'se_m_supersonic' },
  CONFUSE_RAY: { kind: 'proj', speed: 110, size: 6, count: 1, life: 1.6, homing: 3, cd: 5, sprite: 'orb_ghost', status: { kind: 'confuse', chance: 1 }, sfx: 'se_m_confuse_ray' },
  THUNDER_WAVE: { kind: 'chain', jumps: 2, range: 100, cd: 5, fx: 'spark', status: { kind: 'para', chance: 1 }, sfx: 'se_m_thunder_wave' },
  GLARE: { kind: 'debuff', status: 'para', radius: 70, at: 'front', cd: 6, fx: 'sound', sfx: 'se_m_leer' },
  TOXIC: { kind: 'proj', speed: 180, size: 6, count: 1, life: 0.9, cd: 5, sprite: 'sludge', status: { kind: 'toxic', chance: 1 }, sfx: 'se_m_toxic' },
  LEECH_SEED: { kind: 'seed', speed: 180, size: 4, life: 0.9, cd: 4, sprite: 'seed', sfx: 'se_m_absorb' },
  WRAP: { kind: 'swipe', range: 22, arc: 1.2, combo: 1, cd: 0.8, fx: 'vine', status: { kind: 'trap', chance: 1 }, sfx: 'se_m_bind' },
  BIND: { kind: 'swipe', range: 22, arc: 1.2, combo: 1, cd: 0.8, fx: 'vine', status: { kind: 'trap', chance: 1 }, sfx: 'se_m_bind' },
  HARDEN: { kind: 'buff', stat: 'def', cd: 5, fx: 'shine', sfx: 'se_m_harden' },
  WITHDRAW: { kind: 'buff', stat: 'def', cd: 5, fx: 'shine', sfx: 'se_m_harden' },
  DEFENSE_CURL: { kind: 'buff', stat: 'def', cd: 5, fx: 'shine', sfx: 'se_m_harden' },
  IRON_DEFENSE: { kind: 'buff', stat: 'def', stages: 2, cd: 6, fx: 'shine', sfx: 'se_m_harden' },
  BARRIER: { kind: 'buff', stat: 'def', stages: 2, cd: 6, fx: 'shine', sfx: 'se_m_barrier' },
  ACID_ARMOR: { kind: 'buff', stat: 'def', stages: 2, cd: 6, fx: 'shine', sfx: 'se_m_acid_armor' },
  AGILITY: { kind: 'buff', stat: 'spe', stages: 2, cd: 6, fx: 'speed', sfx: 'se_m_stat_increase' },
  DOUBLE_TEAM: { kind: 'buff', stat: 'eva', cd: 6, fx: 'speed', sfx: 'se_m_double_team', decoys: 2 },
  MINIMIZE: { kind: 'buff', stat: 'eva', cd: 6, fx: 'speed', sfx: 'se_m_minimize' },
  SWORDS_DANCE: { kind: 'buff', stat: 'atk', stages: 2, cd: 7, fx: 'swords', sfx: 'se_m_swords_dance' },
  GROWTH: { kind: 'buff', stat: 'spa', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' },
  MEDITATE: { kind: 'buff', stat: 'atk', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' },
  SHARPEN: { kind: 'buff', stat: 'atk', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' },
  AMNESIA: { kind: 'buff', stat: 'spd', stages: 2, cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' },
  FOCUS_ENERGY: { kind: 'buff', stat: 'crit', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' },
  DRAGON_DANCE: { kind: 'buff', stat: 'atk', also: 'spe', cd: 7, fx: 'dragon', sfx: 'se_m_dragon_rage' },
  BULK_UP: { kind: 'buff', stat: 'atk', also: 'def', cd: 7, fx: 'shine', sfx: 'se_m_stat_increase' },
  CALM_MIND: { kind: 'buff', stat: 'spa', also: 'spd', cd: 7, fx: 'psychic', sfx: 'se_m_stat_increase' },
  REFLECT: { kind: 'buff', stat: 'def', stages: 2, cd: 8, fx: 'shine', sfx: 'se_m_reflect' },
  LIGHT_SCREEN: { kind: 'buff', stat: 'spd', stages: 2, cd: 8, fx: 'shine', sfx: 'se_m_reflect' },
  PROTECT: { kind: 'protect', dur: 0.8, cd: 4, sfx: 'se_m_detect' },
  DETECT: { kind: 'protect', dur: 0.8, cd: 4, sfx: 'se_m_detect' },
  RECOVER: { kind: 'heal', amount: 0.3, cd: 12, sfx: 'se_m_moonlight' },
  SOFT_BOILED: { kind: 'heal', amount: 0.3, cd: 12, sfx: 'se_m_milk_drink' },
  REST: { kind: 'heal', amount: 0.6, sleep: 2.5, cd: 16, sfx: 'se_m_snore' },
  SYNTHESIS: { kind: 'heal', amount: 0.25, cd: 12, sfx: 'se_m_morning_sun' },
  MOONLIGHT: { kind: 'heal', amount: 0.25, cd: 12, sfx: 'se_m_moonlight' },
  MORNING_SUN: { kind: 'heal', amount: 0.25, cd: 12, sfx: 'se_m_morning_sun' },
  MILK_DRINK: { kind: 'heal', amount: 0.3, cd: 12, sfx: 'se_m_milk_drink' },
  TELEPORT: { kind: 'teleport', cd: 3, sfx: 'se_m_teleport' },
  KINESIS: { kind: 'debuff', stat: 'acc', radius: 50, at: 'front', cd: 5, fx: 'psychic', sfx: 'se_m_teleport' },
  DISABLE: { kind: 'debuff', status: 'stun', radius: 50, at: 'front', cd: 7, fx: 'psychic', sfx: 'se_m_psybeam' },
  HAZE: { kind: 'cloud', radius: 44, dur: 2.5, at: 'self', cd: 9, sprite: 'smoke', blind: true, sfx: 'se_m_haze' },
  MIST: { kind: 'buff', stat: 'def', cd: 8, fx: 'ice', sfx: 'se_m_mist' },
  ROAR: { kind: 'nova', radius: 60, cd: 6, fx: 'sound', knock: 320, power0: true, sfx: 'se_m_screech' },
  WHIRLWIND: { kind: 'nova', radius: 60, cd: 6, fx: 'wind', knock: 320, power0: true, sfx: 'se_m_gust2' },
  METRONOME: { kind: 'metronome', cd: 1.2, sfx: 'se_m_metronome' },
  TRANSFORM: { kind: 'buff', stat: 'atk', also: 'spa', cd: 10, fx: 'psychic', sfx: 'se_m_teleport' },
  SPIKES: { kind: 'cloud', radius: 28, dur: 8, at: 'front', cd: 8, sprite: 'spikes', tick: 0.6, dmg: 0.05, sfx: 'se_m_rock_throw' },
  SWEET_SCENT: { kind: 'debuff', stat: 'eva', radius: 70, at: 'self', cd: 6, fx: 'petal', sfx: 'se_m_sweet_scent' },
  CHARM: { kind: 'debuff', stat: 'atk', stages: 2, radius: 60, at: 'front', cd: 6, fx: 'heart', sfx: 'se_m_charm' },
  RAIN_DANCE: { kind: 'buff', stat: 'spa', cd: 10, fx: 'water', sfx: 'se_m_rain_dance', weather: 'rain' },
  SUNNY_DAY: { kind: 'buff', stat: 'spa', cd: 10, fx: 'fire', sfx: 'se_m_morning_sun', weather: 'sun' },
  SAFEGUARD: { kind: 'protect', dur: 1.2, cd: 8, sfx: 'se_m_reflect' },
  SUBSTITUTE: { kind: 'buff', stat: 'eva', cd: 10, fx: 'shine', sfx: 'se_m_double_team', decoys: 1 },
};

const VARIABLE_POWER = { MAGNITUDE: 70, LOW_KICK: 60, FLAIL: 60, REVERSAL: 60, SUPER_FANG: 60, FISSURE: 100, GUILLOTINE: 90, HORN_DRILL: 90, SHEER_COLD: 90, COUNTER: 60, MIRROR_COAT: 60, BIDE: 50, ENDEAVOR: 50, PRESENT: 50, RETURN: 70, FRUSTRATION: 70, HIDDEN_POWER: 60, NIGHT_SHADE: 50, SEISMIC_TOSS: 50, PSYWAVE: 50, DRAGON_RAGE: 40, SONIC_BOOM: 30 };
const SPRITE_FOR_TYPE = { FIRE: 'ember', WATER: 'water', GRASS: 'leaf', ELECTRIC: 'orb_yellow', ICE: 'snow', PSYCHIC: 'orb_psychic', DRAGON: 'dragon', DARK: 'shadow', GHOST: 'shadow', POISON: 'sludge', ROCK: 'rock', GROUND: 'mud', BUG: 'needle', FLYING: 'wind', STEEL: 'star', NORMAL: 'star', FIGHTING: 'fist' };
const FX_FOR_TYPE = { FIRE: 'fire', WATER: 'water', GRASS: 'vine', ELECTRIC: 'spark', ICE: 'ice', PSYCHIC: 'psychic', DRAGON: 'dragon', DARK: 'bite', GHOST: 'ghost', POISON: 'sludge', ROCK: 'rock', GROUND: 'quake', BUG: 'claw', FLYING: 'wind', STEEL: 'claw', NORMAL: 'impact', FIGHTING: 'fist' };

// Derive a profile from the move's data when there is no hand-written one.
function derive(m) {
  const contact = m.flags?.includes('MAKES_CONTACT');
  const pw = m.power || 0;
  const eff = m.effect;
  if (pw === 0) {
    if (/_UP(_2)?$/.test(eff) || eff === 'EVASION_UP' || eff === 'FOCUS_ENERGY') {
      const st = eff.startsWith('ATTACK') ? 'atk' : eff.startsWith('DEFENSE') ? 'def' : eff.startsWith('SPEED') ? 'spe' : eff.startsWith('SPECIAL_ATTACK') ? 'spa' : eff.startsWith('SPECIAL_DEFENSE') ? 'spd' : eff === 'EVASION_UP' ? 'eva' : 'crit';
      return { kind: 'buff', stat: st, stages: eff.endsWith('_2') ? 2 : 1, cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' };
    }
    if (/_DOWN(_2)?$/.test(eff)) {
      const st = eff.startsWith('ATTACK') ? 'atk' : eff.startsWith('DEFENSE') ? 'def' : eff.startsWith('SPEED') ? 'spe' : eff.startsWith('ACCURACY') ? 'acc' : eff.startsWith('EVASION') ? 'eva' : 'spd';
      return { kind: 'debuff', stat: st, stages: eff.endsWith('_2') ? 2 : 1, radius: 56, at: 'front', cd: 6, fx: 'sound', sfx: 'se_m_stat_decrease' };
    }
    if (eff === 'SLEEP') return { kind: 'proj', speed: 130, size: 6, count: 1, life: 1.1, cd: 7, sprite: 'ring', status: { kind: 'sleep', chance: 1 }, sfx: 'se_m_sing' };
    if (eff === 'PARALYZE') return { kind: 'proj', speed: 200, size: 5, count: 1, life: 0.8, cd: 5, sprite: 'orb_yellow', status: { kind: 'para', chance: 1 }, sfx: 'se_m_thunder_wave' };
    if (eff === 'POISON' || eff === 'TOXIC') return { kind: 'proj', speed: 170, size: 5, count: 1, life: 0.8, cd: 5, sprite: 'sludge', status: { kind: 'poison', chance: 1 }, sfx: 'se_m_toxic' };
    if (eff === 'CONFUSE' || eff === 'SWAGGER' || eff === 'FLATTER' || eff === 'TEETER_DANCE') return { kind: 'proj', speed: 140, size: 6, count: 1, life: 1.2, cd: 5, sprite: 'ring', status: { kind: 'confuse', chance: 1 }, sfx: 'se_m_supersonic' };
    if (eff === 'WILL_O_WISP') return { kind: 'proj', speed: 120, size: 6, count: 1, life: 1.4, homing: 3, cd: 5, sprite: 'orb_ghost', status: { kind: 'burn', chance: 1 }, sfx: 'se_m_ember' };
    if (['RESTORE_HP', 'SOFTBOILED', 'SYNTHESIS', 'MORNING_SUN', 'MOONLIGHT', 'SWALLOW', 'WISH', 'INGRAIN'].includes(eff)) return { kind: 'heal', amount: 0.25, cd: 12, sfx: 'se_m_moonlight' };
    if (eff === 'PROTECT' || eff === 'ENDURE') return { kind: 'protect', dur: 0.8, cd: 4, sfx: 'se_m_detect' };
    return { kind: 'buff', stat: 'def', cd: 6, fx: 'shine', sfx: 'se_m_stat_increase' };
  }
  if (contact) {
    if (eff === 'QUICK_ATTACK' || eff === 'FAKE_OUT' || eff === 'PURSUIT') return { kind: 'lunge', dist: 50, range: 14, dur: 0.12, cd: 0.32, fx: FX_FOR_TYPE[m.type] };
    if (eff === 'RECOIL' || eff === 'DOUBLE_EDGE' || eff === 'RECOIL_IF_MISS' || eff === 'RAMPAGE') return { kind: 'charge', dist: 80, dur: 0.26, range: 17, cd: 0.8, fx: FX_FOR_TYPE[m.type], recoil: 0.15 };
    if (eff === 'MULTI_HIT' || eff === 'DOUBLE_HIT' || eff === 'TRIPLE_KICK' || eff === 'TWINEEDLE' || eff === 'FURY_CUTTER') return { kind: 'multi', hits: eff === 'DOUBLE_HIT' ? 2 : 3, range: 22, arc: 1.6, cd: 0.45, fx: FX_FOR_TYPE[m.type] };
    if (pw >= 80) return { kind: 'lunge', dist: 32, range: 20, cd: 0.55, fx: FX_FOR_TYPE[m.type], knock: 160 };
    return { kind: 'swipe', range: 20 + Math.min(10, pw / 10), arc: 1.7, combo: pw >= 60 ? 2 : 3, cd: 0.2, fx: FX_FOR_TYPE[m.type] };
  }
  // non-contact damaging
  if (eff === 'EARTHQUAKE' || eff === 'MAGNITUDE' || eff === 'EXPLOSION') return { kind: 'nova', radius: 60, cd: 2, fx: FX_FOR_TYPE[m.type], grounded: eff !== 'EXPLOSION' };
  if (eff === 'SOLAR_BEAM' || eff === 'RECHARGE' || pw >= 110) return { kind: 'beam', len: 160, width: 14, windup: 0.5, dur: 0.4, cd: 2.2, fx: FX_FOR_TYPE[m.type] };
  if (eff === 'THUNDER' || eff === 'FUTURE_SIGHT') return { kind: 'strike', radius: 24, delay: 0.45, count: 1, cd: 1.4, fx: FX_FOR_TYPE[m.type] };
  if (eff === 'ABSORB') return { kind: 'proj', speed: 200, size: 6, count: 1, life: 0.8, cd: 0.5, sprite: 'orb_green', drain: 0.5 };
  if (eff === 'TRAP') return { kind: 'cloud', radius: 24, dur: 3, at: 'target', cd: 1.6, tick: 0.35, sprite: SPRITE_FOR_TYPE[m.type], status: { kind: 'trap', chance: 1 } };
  if (pw >= 85) return { kind: 'proj', speed: 180, size: 9, count: 1, life: 1.0, cd: 1.1, sprite: SPRITE_FOR_TYPE[m.type], explode: 26 };
  return { kind: 'proj', speed: 210, size: 5, count: 1, life: 0.8, cd: pw >= 60 ? 0.5 : 0.32, sprite: SPRITE_FOR_TYPE[m.type] };
}

const cache = {};
export function profile(moveKey) {
  if (cache[moveKey]) return cache[moveKey];
  const m = D.moves[moveKey] || D.moves.TACKLE;
  const p = { ...(P[moveKey] || derive(m)) };
  p.key = moveKey; p.type = m.type; p.power = m.power || 0; p.name = m.name;
  if (m.power === 1) p.power = VARIABLE_POWER[moveKey] ?? 50; // Magnitude, Low Kick, OHKO moves... have power 1 in the data
  p.special = isSpecial(m.type);
  p.status ??= statusFromEffect(m);
  p.fx ??= FX_FOR_TYPE[m.type] || 'impact';
  p.sprite ??= SPRITE_FOR_TYPE[m.type] || 'star';
  p.sfx ??= defaultSfx(p);
  p.windup ??= defaultWindup(p);
  p.crit ??= m.effect === 'HIGH_CRITICAL' ? 0.25 : 0.0625;
  p.melee = ['swipe', 'lunge', 'charge', 'multi'].includes(p.kind);
  p.damaging = p.power > 0 && !p.power0;
  p.range ??= estimateRange(p);
  return (cache[moveKey] = p);
}

function statusFromEffect(m) {
  const c = (m.chance || 0) / 100;
  switch (m.effect) {
    case 'BURN_HIT': case 'BLAZE_KICK': case 'THAW_HIT': return { kind: 'burn', chance: Math.max(c, 0.1) };
    case 'FREEZE_HIT': return { kind: 'chill', chance: Math.max(c, 0.1) * 3 };
    case 'PARALYZE_HIT': case 'THUNDER': return { kind: 'para', chance: Math.max(c, 0.1) };
    case 'POISON_HIT': case 'TWINEEDLE': case 'POISON_FANG': case 'POISON_TAIL': return { kind: 'poison', chance: Math.max(c, 0.2) };
    case 'CONFUSE_HIT': return { kind: 'confuse', chance: Math.max(c, 0.1) };
    case 'FLINCH_HIT': case 'FLINCH_MINIMIZE_HIT': case 'SNORE': return { kind: 'flinch', chance: Math.max(c, 0.1) };
    case 'SPEED_DOWN_HIT': return { kind: 'slow', chance: Math.max(c, 0.3) };
    case 'TRAP': return { kind: 'trap', chance: 1 };
    default: return null;
  }
}

function defaultSfx(p) {
  const t = { FIRE: 'se_m_ember', WATER: 'se_m_bubble', GRASS: 'se_m_razor_wind2', ELECTRIC: 'se_m_thunderbolt', ICE: 'se_m_icy_wind', PSYCHIC: 'se_m_psybeam', GHOST: 'se_m_nightmare', POISON: 'se_m_toxic', ROCK: 'se_m_rock_throw', GROUND: 'se_m_dig', FLYING: 'se_m_gust', DRAGON: 'se_m_dragon_rage', BUG: 'se_m_string_shot', DARK: 'se_m_bite', STEEL: 'se_m_harden', FIGHTING: 'se_m_comet_punch' };
  if (p.melee) return p.type === 'NORMAL' ? 'se_m_comet_punch' : (t[p.type] || 'se_m_comet_punch');
  return t[p.type] || 'se_m_swift';
}

// Enemy telegraph time (seconds) before the active frames. Players get much shorter windups.
function defaultWindup(p) {
  switch (p.kind) {
    case 'swipe': case 'multi': return 0.45;
    case 'lunge': return 0.5;
    case 'charge': return 0.65;
    case 'proj': case 'seed': return 0.45;
    case 'stream': return 0.5;
    case 'beam': return 0.7;
    case 'chain': return 0.55;
    case 'nova': return 0.65;
    case 'strike': return 0.25;
    case 'cloud': return 0.4;
    default: return 0.3;
  }
}

function estimateRange(p) {
  switch (p.kind) {
    case 'swipe': case 'multi': return 24;
    case 'lunge': return (p.dist || 26) + 14;
    case 'charge': return (p.dist || 70) + 10;
    case 'proj': case 'seed': return Math.min(160, (p.speed || 200) * (p.life || 0.8));
    case 'stream': return (p.speed || 200) * (p.life || 0.5);
    case 'beam': return p.len || 150;
    case 'chain': return p.range || 100;
    case 'nova': return (p.radius || 40) * 0.8;
    case 'strike': return 140;
    case 'cloud': return p.at === 'self' ? 30 : 70;
    case 'debuff': return p.radius || 60;
    default: return 60;
  }
}

// Which slot a move suits best in the player's kit.
export function slotFor(moveKey) {
  const p = profile(moveKey);
  if (!p.damaging) return 'cast';
  if (p.melee || (p.kind === 'proj' && (p.cd || 0) <= 0.35) || p.kind === 'chain' && (p.cd || 0) <= 0.35) return 'attack';
  return 'special';
}
