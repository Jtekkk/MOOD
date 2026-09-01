// enemies.js — monster definitions and sprite-frame selection.
import { SPR } from '../assets.js';
import { normalizeAngle } from '../math.js';

export const ENEMY_TYPES = {
  zombie: {
    name: 'FORMER HUMAN', prefix: 'zombie',
    hp: 20, speed: 1.5, radius: 0.30, spriteH: 1.0, mass: 1.0,
    attack: 'hitscan', range: 9, dmg: [3, 9], cooldown: 1.1,
    painChance: 0.6, sightChance: 1,
  },
  imp: {
    name: 'IMP', prefix: 'imp',
    hp: 60, speed: 1.8, radius: 0.32, spriteH: 1.05, mass: 1.3,
    attack: 'projectile', proj: 'fireball', projSpeed: 6, range: 11, dmg: [6, 14], cooldown: 1.5,
    painChance: 0.5,
  },
  demon: {
    name: 'DEMON', prefix: 'demon',
    hp: 150, speed: 3.1, radius: 0.40, spriteH: 1.0, mass: 2.2,
    attack: 'melee', range: 1.1, dmg: [4, 16], cooldown: 0.8,
    painChance: 0.35,
  },
  spectre: {
    name: 'SPECTRE', prefix: 'demon', fuzz: true,
    hp: 150, speed: 3.5, radius: 0.40, spriteH: 1.0, mass: 2.2,
    attack: 'melee', range: 1.1, dmg: [4, 18], cooldown: 0.75,
    painChance: 0.3,
  },
  caco: {
    name: 'CACODEMON', prefix: 'caco',
    hp: 250, speed: 1.5, radius: 0.46, spriteH: 1.35, vOffset: 0.45, float: true, mass: 2.8,
    attack: 'projectile', proj: 'plasma', projSpeed: 6, range: 14, dmg: [8, 18], cooldown: 1.7,
    painChance: 0.3,
  },
  lostsoul: {
    name: 'LOST SOUL', prefix: 'lostsoul',
    hp: 30, speed: 4.3, radius: 0.30, spriteH: 0.85, vOffset: 0.55, float: true, fullbright: true, mass: 0.8,
    attack: 'melee', range: 1.0, dmg: [3, 9], cooldown: 0.7,
    painChance: 0.2,
  },
  painel: {
    name: 'PAIN ELEMENTAL', prefix: 'painel',
    hp: 400, speed: 1.3, radius: 0.46, spriteH: 1.4, vOffset: 0.5, float: true, mass: 3.0,
    attack: 'spawn', range: 18, dmg: [0, 0], cooldown: 2.6, painChance: 0.2,
  },
  baron: {
    name: 'BARON OF HELL', prefix: 'baron',
    hp: 600, speed: 1.7, radius: 0.45, spriteH: 1.5, mass: 3.6,
    attack: 'projectile', proj: 'baronball', projSpeed: 8, range: 16, dmg: [12, 28], cooldown: 1.5,
    painChance: 0.12,
  },
  gumbird: {
    name: 'THE GUMBIRD', prefix: 'gumbird', boss: true,
    hp: 1000, speed: 2.4, radius: 0.5, spriteH: 1.8, mass: 3.8,
    attack: 'projectile', proj: 'jugball', projSpeed: 7, range: 15, dmg: [10, 24], cooldown: 1.2,
    painChance: 0.08, sightChance: 1,
  },
};

export const ENEMY_CHAR = { z: 'zombie', i: 'imp', d: 'demon', c: 'caco', f: 'lostsoul', B: 'baron', G: 'gumbird', x: 'spectre', P: 'painel' };

// Pick the sprite for an enemy's current animation state (front view only;
// used as a fallback / for the AI's e.sprite).
export function enemyFrame(e) {
  const pre = e.def.prefix;
  if (e.state === 'dead') return SPR[pre + '_die3'];
  if (e.state === 'dying') {
    const n = Math.min(3, Math.floor(e.stateTime / 0.12));
    return SPR[pre + '_die' + n];
  }
  if (e.state === 'pain') return SPR[pre + '_pain'];
  if (e.state === 'attack') return SPR[pre + '_attack'];
  const f = (Math.floor(e.walkTime * 4) % 2) === 0 ? '_walk0' : '_walk1';
  return SPR[pre + f];
}

// Render-time sprite: like enemyFrame, but while walking it picks a
// front / side / back rotation based on the enemy's facing vs. the viewer.
// Attack/pain/death always show the front view (as in the original).
export function enemyRenderSprite(e, px, py) {
  const pre = e.def.prefix;
  if (e.state === 'dead') return SPR[pre + '_die3'];
  if (e.state === 'dying') return SPR[pre + '_die' + Math.min(3, Math.floor(e.stateTime / 0.12))];
  if (e.state === 'pain') return SPR[pre + '_pain'] || SPR[pre + '_walk0'];
  if (e.state === 'attack') return SPR[pre + '_attack'];
  const frame = (Math.floor(e.walkTime * 4) % 2) === 0 ? 'walk0' : 'walk1';
  const toViewer = Math.atan2(py - e.y, px - e.x);
  const rel = normalizeAngle(e.angle - toViewer);   // 0 = facing viewer (front)
  const a = Math.abs(rel);
  let view;
  if (a < Math.PI / 4) view = 'front';
  else if (a > 3 * Math.PI / 4) view = 'back';
  else view = rel > 0 ? 'sideL' : 'sideR';
  return SPR[`${pre}_${view}_${frame}`] || SPR[`${pre}_walk0`];
}
