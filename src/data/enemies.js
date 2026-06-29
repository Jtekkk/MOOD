// enemies.js — monster definitions and sprite-frame selection.
import { SPR } from '../assets.js';

export const ENEMY_TYPES = {
  zombie: {
    name: 'FORMER HUMAN', prefix: 'zombie',
    hp: 20, speed: 1.5, radius: 0.30, spriteH: 1.0,
    attack: 'hitscan', range: 9, dmg: [3, 9], cooldown: 1.1,
    painChance: 0.6, sightChance: 1,
  },
  imp: {
    name: 'IMP', prefix: 'imp',
    hp: 60, speed: 1.8, radius: 0.32, spriteH: 1.05,
    attack: 'projectile', proj: 'fireball', projSpeed: 6, range: 11, dmg: [6, 14], cooldown: 1.5,
    painChance: 0.5,
  },
  demon: {
    name: 'DEMON', prefix: 'demon',
    hp: 150, speed: 3.1, radius: 0.40, spriteH: 1.0,
    attack: 'melee', range: 1.1, dmg: [4, 16], cooldown: 0.8,
    painChance: 0.35,
  },
  caco: {
    name: 'CACODEMON', prefix: 'caco',
    hp: 250, speed: 1.5, radius: 0.46, spriteH: 1.35, vOffset: 0.45, float: true,
    attack: 'projectile', proj: 'plasma', projSpeed: 6, range: 14, dmg: [8, 18], cooldown: 1.7,
    painChance: 0.3,
  },
};

export const ENEMY_CHAR = { z: 'zombie', i: 'imp', d: 'demon', c: 'caco' };

// Pick the sprite for an enemy's current animation state.
export function enemyFrame(e) {
  const pre = e.def.prefix;
  if (e.state === 'dead') return SPR[pre + '_die3'];
  if (e.state === 'dying') {
    const n = Math.min(3, Math.floor(e.stateTime / 0.12));
    return SPR[pre + '_die' + n];
  }
  if (e.state === 'pain') return SPR[pre + '_pain'];
  if (e.state === 'attack') return SPR[pre + '_attack'];
  // walking / idle: alternate the two walk frames
  const f = (Math.floor(e.walkTime * 4) % 2) === 0 ? '_walk0' : '_walk1';
  return SPR[pre + f];
}
