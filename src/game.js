// game.js — the World/Game orchestrator: state, player, entities, combat, AI.
import { RENDER_W, RENDER_H } from './raycaster.js';
import { SPR } from './assets.js';
import { LEVELS, parseLevel, SOLID, DOOR_LOCK } from './data/levels.js';
import { ENEMY_TYPES, ENEMY_CHAR, enemyFrame } from './data/enemies.js';
import { WEAPONS, AMMO_MAX } from './data/weapons.js';
import { ITEMS } from './data/items.js';
import { clamp, normalizeAngle, dist, rgba, TAU } from './math.js';

const PLAYER_R = 0.22;
const STEP_UP = 0.34;   // tallest step the player can climb onto in one move (stairs are 0.2)
export const SKILLS = [
  { name: 'EASY', dmgTaken: 0.5, atkCooldown: 1.4 },
  { name: 'NORMAL', dmgTaken: 1.0, atkCooldown: 1.0 },
  { name: 'HARD', dmgTaken: 1.7, atkCooldown: 0.7 },
];
const DEFAULT_SETTINGS = { mouseSens: 1.0, volume: 0.6, musicVol: 0.42, skill: 1 };
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('mood_settings')); if (s) return { ...DEFAULT_SETTINGS, ...s }; } catch { /* no storage */ }
  return { ...DEFAULT_SETTINGS };
}
const BLOOD = [rgba(150, 22, 22), rgba(110, 14, 14), rgba(90, 6, 6), rgba(180, 40, 40)];
const SPARKS = [rgba(255, 224, 130), rgba(255, 170, 50), rgba(220, 220, 230)];
const DEBRIS = [rgba(255, 210, 90), rgba(255, 130, 30), rgba(120, 60, 30), rgba(60, 50, 45)];
const WATER = [rgba(150, 220, 255), rgba(90, 170, 220), rgba(210, 240, 255), rgba(120, 195, 235)];
const GIB = [rgba(190, 40, 40), rgba(140, 20, 24), rgba(220, 120, 120), rgba(90, 10, 12), rgba(200, 80, 70)];
// glow colour [r,g,b] emitted by projectiles in flight (dynamic lighting)
const PROJ_LIGHT = {
  fireball: [1.0, 0.5, 0.2], plasma: [0.45, 0.65, 1.0], rocket: [1.0, 0.6, 0.28],
  baronball: [0.4, 1.0, 0.4], bfgball: [0.5, 1.0, 0.55], jugball: [1.0, 0.45, 0.75],
  tadpole: [1.0, 1.0, 1.0], revmissile: [1.0, 0.55, 0.2], mancuball: [1.0, 0.62, 0.18],
};
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

// The Gumbird's repertoire — "Row, Row, Row Your Boat", lyric + melody (C maj).
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, C5 = 523.25;
const GUMBIRD_SONG = [
  { text: '♪ Row, row, row your boat,', notes: [C4, C4, C4, D4, E4] },
  { text: '♪ gently down the stream,', notes: [E4, D4, E4, F4, G4] },
  { text: '♪ merrily, merrily, merrily, merrily,', notes: [C5, C5, C5, G4, G4, G4, E4, E4, E4, C4, C4, C4] },
  { text: '♪ life is but a dream!', notes: [G4, F4, E4, D4, C4] },
];

export class Game {
  constructor(renderer, input, audio) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.state = 'title';
    this.levelIndex = 0;
    this.showMap = false;
    this.messages = [];
    this.timer = 0;
    this.combatT = 0;   // smoothed combat intensity for reactive audio
    this.player = this._freshPlayer();
    this.intermission = null;
    this.tally = null;
    this.particles = [];   // blood / sparks / debris
    this.shake = 0;        // screen-shake magnitude (decays)
    this.settings = loadSettings();
    this.skill = SKILLS[clamp(this.settings.skill | 0, 0, 2)];
    this.settingsSel = 0;
    this.settingsReturn = 'title';
  }

  // Apply current settings to audio + difficulty (call once audio is inited).
  applySettings() {
    this.skill = SKILLS[clamp(this.settings.skill | 0, 0, 2)];
    this.audio.setMasterVolume(this.settings.volume);
    this.audio.setMusicVolume(this.settings.musicVol);
  }
  saveSettings() { try { localStorage.setItem('mood_settings', JSON.stringify(this.settings)); } catch { /* no storage */ } }
  openSettings(from) { this.settingsReturn = from; this.settingsSel = 0; this.state = 'settings'; }

  _updateSettings() {
    const inp = this.input, N = 5;
    if (inp.justPressed('ArrowUp')) { this.settingsSel = (this.settingsSel + N - 1) % N; this.audio.play('menu'); }
    if (inp.justPressed('ArrowDown')) { this.settingsSel = (this.settingsSel + 1) % N; this.audio.play('menu'); }
    const dir = inp.justPressed('ArrowRight') ? 1 : inp.justPressed('ArrowLeft') ? -1 : 0;
    if (dir) {
      const s = this.settings;
      if (this.settingsSel === 0) s.mouseSens = clamp(+(s.mouseSens + dir * 0.1).toFixed(2), 0.2, 3);
      else if (this.settingsSel === 1) s.volume = clamp(+(s.volume + dir * 0.1).toFixed(2), 0, 1);
      else if (this.settingsSel === 2) s.musicVol = clamp(+(s.musicVol + dir * 0.05).toFixed(2), 0, 1);
      else if (this.settingsSel === 3) s.skill = clamp((s.skill | 0) + dir, 0, 2);
      this.applySettings(); this.saveSettings(); this.audio.play('menu');
    }
    if (inp.justPressed('Escape') || ((inp.justPressed('Enter') || inp.mouseJustPressed(0)) && this.settingsSel === 4)) {
      this.state = this.settingsReturn || 'title';
    }
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }

  // Spawn a burst of particles at (x,y) at height z (cells above the floor).
  _spawnParticles(x, y, z, count, { speed = 3, up = 2.2, life = 0.5, colors = BLOOD } = {}) {
    const arr = this.particles;
    for (let i = 0; i < count; i++) {
      if (arr.length >= 360) arr.shift();
      const a = Math.random() * TAU, sp = Math.random() * speed;
      arr.push({
        x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * up,
        life: life * (0.6 + Math.random() * 0.7), color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  _updateParticles(dt) {
    const arr = this.particles;
    for (const p of arr) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= 7 * dt; p.vx *= (1 - 1.6 * dt); p.vy *= (1 - 1.6 * dt);
      p.life -= dt;
      if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.55; p.vy *= 0.55; }
      // stop particles that drift into a wall
      if (this._rayBlocked(Math.floor(p.x), Math.floor(p.y))) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx = p.vy = 0; }
    }
    if (arr.length) this.particles = arr.filter((p) => p.life > 0);
  }

  _freshPlayer() {
    return {
      x: 1.5, y: 1.5, angle: 0, pitch: 0,
      vx: 0, vy: 0, kx: 0, ky: 0,    // momentum + knockback velocities
      health: 100, armor: 0,
      owned: [true, true, false, false, false, false, false, false, false],
      weapon: 1, pendingWeapon: 1, raiseT: 0,
      ammo: { bullets: 50, shells: 0, rockets: 0, cells: 0 },
      keys: { red: false, blue: false, yellow: false },
      fireCD: 0, weaponFlash: 0, recoil: 0,
      bobPhase: 0, bobAmt: 0,
      damageFlash: 0, pickupFlash: 0, powerFlash: 0,
      invuln: 0, berserk: false, visor: 0, z: 0, hurtT: 0, hurtDir: 0,
      kills: 0, totalKills: 0, secrets: 0,
      dead: false, deathTime: 0,
      faceTimer: 0, faceMood: 'happy', calmT: 0, idleMoveT: 0, killStreak: 0, lastKillStamp: -99,
    };
  }

  // ---- level loading -----------------------------------------------------
  startNewGame() {
    this.player = this._freshPlayer();
    this.levelIndex = 0;
    this.loadLevel(0);   // also starts the level-1 track
    this.state = 'playing';
  }

  loadLevel(index) {
    const def = LEVELS[index];
    const map = parseLevel(def);
    // door lookup by cell index
    map.doorMap = {};
    for (const d of map.doors) map.doorMap[d.y * map.W + d.x] = d;
    map.isSolidCell = (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return true;
      const ch = map.cellChar[cy * map.W + cx];
      return SOLID.has(ch);
    };
    this.map = map;
    this.entities = [];
    this.particles = [];
    this.shake = 0;
    this.player.x = map.start.x;
    this.player.y = map.start.y;
    this.player.angle = map.startAngle;
    this.player.z = map.hasHeights ? map.blockH[Math.floor(map.start.y) * map.W + Math.floor(map.start.x)] : 0;
    this.player.keys = { red: false, blue: false, yellow: false };
    this.player.kills = 0;
    this._spawnThings(map);
    this.player.totalKills = this.entities.filter((e) => e.kind === 'enemy').length;
    this.levelStartT = this.timer;
    this.totalItems = this.entities.filter((e) => e.kind === 'item').length;
    this.itemsTaken = 0;
    this.player.secrets = 0;
    this.totalSecrets = map.totalSecrets || 0;
    this.audio.playTrack(index);     // per-level background music
    this.message(def.name);
  }

  _spawnThings(map) {
    for (const t of map.things) {
      const { ch, x, y } = t;
      if (ENEMY_CHAR[ch]) {
        const type = ENEMY_CHAR[ch];
        const def = ENEMY_TYPES[type];
        this.entities.push({
          kind: 'enemy', type, def, x, y, angle: 0,
          z: map.hasHeights ? map.blockH[Math.floor(y) * map.W + Math.floor(x)] : 0,
          hp: def.hp, radius: def.radius, spriteH: def.spriteH, vOffset: def.vOffset || 0,
          fullbright: def.fullbright || false, fuzz: def.fuzz || false,
          mass: def.mass || 1, kx: 0, ky: 0, target: 'player',
          state: 'idle', stateTime: 0, walkTime: 0, cooldownTimer: 0,
          attackTime: 0, didAttack: false, alive: true, sprite: SPR[def.prefix + '_walk0'],
        });
      } else if (ch === 'o') {
        this.entities.push({ kind: 'barrel', x, y, hp: 20, radius: 0.33, spriteH: 0.85, vOffset: 0, alive: true, sprite: SPR.barrel });
      } else if (ch === '!') {
        // a lit brazier/lamp: a fullbright sprite plus a warm point light
        this.entities.push({
          kind: 'lamp', x, y, radius: 0.28, spriteH: 0.95, vOffset: 0, alive: true, fullbright: true, sprite: SPR.lamp,
          light: { r: 1.0, g: 0.72, b: 0.34, radius: 5.0, intensity: 1.5, flicker: 0.16, phase: Math.random() * 6.28 },
        });
      } else if (ITEMS[ch]) {
        const def = ITEMS[ch];
        this.entities.push({ kind: 'item', ch, def, x, y, spriteH: def.spriteH, vOffset: 0, alive: true, sprite: SPR[def.sprite], bob: Math.random() * 6 });
      }
    }
  }

  message(text) {
    this.messages.unshift({ text, time: 4 });
    if (this.messages.length > 4) this.messages.pop();
  }

  // ---- main update -------------------------------------------------------
  update(dt) {
    this.timer += dt;
    for (const m of this.messages) m.time -= dt;
    this.messages = this.messages.filter((m) => m.time > 0);

    switch (this.state) {
      case 'playing': this._updatePlaying(dt); break;
      case 'intermission': this._updateIntermission(dt); break;
      case 'dead': this._updateDead(dt); break;
      case 'settings': this._updateSettings(); break;
      default: break;
    }
    // outside of active play, let the combat music/tension settle back to calm
    if (this.state !== 'playing' && this.combatT > 0.001) {
      this.combatT = Math.max(0, this.combatT - dt * 0.8);
      this.audio.setIntensity(this.combatT);
    }
  }

  _updatePlaying(dt) {
    const inp = this.input, p = this.player;
    // --- look (mouse + arrows/Q-E) ---
    const turnSpeed = 2.6;
    p.angle += inp.mouseDX * 0.0026 * (this.settings.mouseSens || 1);
    if (inp.down('ArrowLeft')) p.angle -= turnSpeed * dt;
    if (inp.down('ArrowRight')) p.angle += turnSpeed * dt;
    // right analog stick rotates the view (rate-based, framerate-independent)
    if (inp.padTurn) p.angle += inp.padTurn * 3.4 * (this.settings.mouseSens || 1) * dt;
    p.angle = normalizeAngle(p.angle);

    // --- movement (velocity with acceleration + friction → momentum) ---
    let fwd = 0, strafe = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) fwd += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) fwd -= 1;
    if (inp.down('KeyD')) strafe += 1;
    if (inp.down('KeyA')) strafe -= 1;
    const run = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 1.7 : 1.0;
    const ft = this.map.floorType;
    const inWater = !!(ft && ft[Math.floor(p.y) * this.map.W + Math.floor(p.x)] === 1);
    const speed = 3.1 * run * (inWater ? 0.55 : 1.0);   // wading slows you down
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    const desVX = (dirX * fwd - dirY * strafe) * speed;
    const desVY = (dirY * fwd + dirX * strafe) * speed;
    const accel = Math.min(1, (fwd || strafe ? 11 : 9) * dt);   // brisk to start, smooth to stop
    p.vx += (desVX - p.vx) * accel;
    p.vy += (desVY - p.vy) * accel;
    // knockback decays separately and adds on top
    const kd = Math.max(0, 1 - 9 * dt);
    const mvx = (p.vx + p.kx) * dt, mvy = (p.vy + p.ky) * dt;
    const ox = p.x, oy = p.y;
    if (Math.abs(mvx) > 1e-4 || Math.abs(mvy) > 1e-4) this._movePlayer(mvx, mvy);
    // hit a wall on an axis → bleed off that velocity so we stop solidly
    if (Math.abs(mvx) > 1e-4 && Math.abs(p.x - ox) < Math.abs(mvx) * 0.5) { p.vx *= 0.2; p.kx *= 0.4; }
    if (Math.abs(mvy) > 1e-4 && Math.abs(p.y - oy) < Math.abs(mvy) * 0.5) { p.vy *= 0.2; p.ky *= 0.4; }
    p.kx *= kd; p.ky *= kd;
    const movingFast = Math.hypot(p.vx, p.vy) > 0.4;
    if (movingFast) {
      p.bobPhase += dt * 10 * run;
      p.bobAmt = Math.min(1, p.bobAmt + dt * 4);
      p.idleMoveT = 0;
    } else {
      p.bobAmt = Math.max(0, p.bobAmt - dt * 4);
      p.idleMoveT += dt;
    }
    // wading kicks up splashes
    if (inWater && movingFast) {
      p.splashT = (p.splashT || 0) - dt;
      if (p.splashT <= 0) {
        p.splashT = 0.17;
        this._spawnParticles(p.x, p.y, 0.04, 5, { speed: 1.8, up: 2.3, life: 0.42, colors: WATER });
        this.audio.play('splash');
      }
    }

    // --- weapon select ---
    for (let i = 0; i < WEAPONS.length; i++) {
      if (inp.justPressed(WEAPONS[i].key) && p.owned[i] && i !== p.weapon) this._switchWeapon(i);
    }
    if (inp.justPressed('KeyQ')) this._cycleWeapon(-1);

    // --- use / open doors ---
    if (inp.justPressed('Space') || inp.justPressed('KeyE') || inp.justPressed('KeyF')) this._useAction();

    // --- fire ---
    if (p.raiseT > 0) p.raiseT = Math.max(0, p.raiseT - dt);
    p.fireCD = Math.max(0, p.fireCD - dt);
    p.weaponFlash = Math.max(0, p.weaponFlash - dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);
    if ((inp.mouseDown(0) || inp.down('ControlLeft')) && p.fireCD <= 0 && p.raiseT <= 0) this._fire();

    // --- entities ---
    for (const e of this.entities) {
      if (e.kind === 'enemy') this._updateEnemy(e, dt);
      else if (e.kind === 'proj') this._updateProjectile(e, dt);
      else if (e.kind === 'effect') this._updateEffect(e, dt);
      else if (e.kind === 'item') { e.bob += dt * 4; this._tryPickup(e); }
    }
    this.entities = this.entities.filter((e) => !e._remove);

    // --- doors / particles / shake ---
    for (const d of this.map.doors) this._updateDoor(d, dt);
    this._updateParticles(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

    // --- reactive audio: how hot is the fight right now? ---
    let threat = 0;
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.alive && (e.state === 'chase' || e.state === 'attack' || e.state === 'pain')) {
        const d = dist(e.x, e.y, p.x, p.y);
        if (d < 16) threat += (e.def.boss ? 3 : 1) * (1 - d / 16);
      }
    }
    const intTarget = Math.min(1, threat / 5 + (p.damageFlash > 0 ? 0.25 : 0));
    this.combatT += (intTarget - this.combatT) * Math.min(1, dt * 1.6);
    this.audio.setIntensity(this.combatT);

    // --- timers/flashes ---
    p.damageFlash = Math.max(0, p.damageFlash - dt * 2);
    p.pickupFlash = Math.max(0, p.pickupFlash - dt * 3);
    p.powerFlash = Math.max(0, p.powerFlash - dt * 2);
    if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt * 1.4);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.visor > 0) p.visor = Math.max(0, p.visor - dt);
    this._updateFace(dt);

    if (p.health <= 0 && !p.dead) this._killPlayer();
  }

  // ---- player movement & collision --------------------------------------
  _movePlayer(mvx, mvy) {
    const p = this.player;
    const z = p.z || 0;
    if (!this._blocked(p.x + mvx, p.y, PLAYER_R, true) && !this._ledgeBlocks(p.x + mvx, p.y, z)) p.x += mvx;
    if (!this._blocked(p.x, p.y + mvy, PLAYER_R, true) && !this._ledgeBlocks(p.x, p.y + mvy, z)) p.y += mvy;
    // stand on whatever block is under us now (snap; steps are small)
    if (this.map.hasHeights) {
      const cx = Math.floor(p.x), cy = Math.floor(p.y);
      p.z = (cx >= 0 && cy >= 0 && cx < this.map.W && cy < this.map.H) ? this.map.blockH[cy * this.map.W + cx] : 0;
    }
  }

  // Can the player STAND where their centre would land? Decided by the single
  // destination cell — not the player radius — so climbing stairs/daises at an
  // angle never wedges on a step one cell away (that used to feel like "falling
  // into" the stairs). Tall blocks you can't clip into are handled by _blocked.
  _ledgeBlocks(x, y, fromZ) {
    const map = this.map;
    if (!map.hasHeights && !map.hasCeils) return false;
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return false;
    const idx = cy * map.W + cx;
    const fz = map.hasHeights ? map.blockH[idx] : 0;
    if (fz > fromZ + STEP_UP) return true;                        // too tall to step onto — take the stairs
    if (map.ceilH && (map.ceilH[idx] - fz) < 1.0) return true;    // ceiling too low to fit under here
    return false;
  }

  // Circle-vs-grid collision; optionally also collide with solid entities.
  _blocked(x, y, r, vsEntities) {
    const map = this.map;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    const bh = map.hasHeights ? map.blockH : null, pz = this.player.z || 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // a wall, or a raised block too tall to step onto from here — either way
        // the player's body can't enter it, but slides along it (nearest-point).
        if (this._cellBlocks(cx, cy) ||
            (bh && cx >= 0 && cy >= 0 && cx < map.W && cy < map.H && bh[cy * map.W + cx] - pz > STEP_UP)) {
          const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
          if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
        }
      }
    }
    if (vsEntities) {
      for (const e of this.entities) {
        if (!e.alive) continue;
        if (e.kind === 'enemy' && e.state !== 'dead' && e.state !== 'dying') {
          if (Math.abs((e.z || 0) - (this.player.z || 0)) > 0.7) continue;  // on a different level — walk under/over it
          const rr = r + e.radius;
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < rr * rr) return true;
        } else if (e.kind === 'barrel') {
          const rr = r + e.radius;
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < rr * rr) return true;
        }
      }
    }
    return false;
  }

  _cellBlocks(cx, cy) {
    const map = this.map;
    if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return true;
    const idx = cy * map.W + cx;
    const door = map.doorMap[idx];
    if (door) return door.open < 0.78;        // closed/closing door blocks
    return SOLID.has(map.cellChar[idx]);
  }

  // Blocks a ray / projectile / line-of-sight: solid walls + mostly-closed doors.
  _rayBlocked(cx, cy) {
    const map = this.map;
    if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return true;
    const idx = cy * map.W + cx;
    const door = map.doorMap[idx];
    if (door) return door.open < 0.5;
    return SOLID.has(map.cellChar[idx]);
  }

  // ---- use action (doors, switches) -------------------------------------
  _useAction() {
    const p = this.player;
    const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
    for (let t = 0.4; t <= 1.3; t += 0.2) {
      const cx = Math.floor(p.x + dx * t), cy = Math.floor(p.y + dy * t);
      const idx = cy * this.map.W + cx;
      const ch = this.map.cellChar[idx];
      const door = this.map.doorMap[idx];
      if (door) {
        if (door.lock && !p.keys[door.lock]) {
          this.audio.play('nokey');
          this.message(`You need a ${door.lock} keycard.`);
        } else if (door.state === 'closed' || door.state === 'closing') {
          door.state = 'opening'; this.audio.play('door');
          if (door.secret && !door.found) { door.found = true; p.secrets++; this.message('A SECRET IS REVEALED!'); }
        }
        return;
      }
      if (ch === '+') {
        if (this.entities.some((e) => e.kind === 'enemy' && e.alive && e.def.boss)) {
          this.audio.play('nokey'); this.message('THE GUMBIRD STILL LIVES!');
        } else { this._exitLevel(); }
        return;
      }
      if (SOLID.has(ch)) return;   // a wall blocks reaching further
    }
  }

  _updateDoor(d, dt) {
    if (d.state === 'opening') {
      d.open = Math.min(1, d.open + dt * 2.2);
      if (d.open >= 1) { d.state = 'open'; d.timer = 4; }
    } else if (d.state === 'open') {
      d.timer -= dt;
      // don't close on top of an entity
      if (d.timer <= 0 && !this._entityInCell(d.x, d.y)) { d.state = 'closing'; this.audio.play('door'); }
    } else if (d.state === 'closing') {
      if (this._entityInCell(d.x, d.y)) { d.state = 'opening'; return; }
      d.open = Math.max(0, d.open - dt * 2.2);
      if (d.open <= 0) d.state = 'closed';
    }
  }

  _entityInCell(cx, cy) {
    const p = this.player;
    if (Math.floor(p.x) === cx && Math.floor(p.y) === cy) return true;
    for (const e of this.entities) {
      if ((e.kind === 'enemy' && e.alive) || e.kind === 'barrel') {
        if (Math.floor(e.x) === cx && Math.floor(e.y) === cy) return true;
      }
    }
    return false;
  }

  // ---- weapons & combat --------------------------------------------------
  _switchWeapon(idx) {
    this.player.pendingWeapon = idx;
    this.player.weapon = idx;
    this.player.raiseT = 0.16;
  }
  _cycleWeapon(dir) {
    const p = this.player;
    for (let n = 1; n <= WEAPONS.length; n++) {
      const i = (p.weapon + dir * n + WEAPONS.length * 2) % WEAPONS.length;
      if (p.owned[i]) { this._switchWeapon(i); return; }
    }
  }

  // Add a decaying knockback impulse to a player/enemy (heavier = less push).
  _applyKnock(obj, dx, dy, force) {
    const len = Math.hypot(dx, dy) || 1;
    const mass = obj.mass || 1;
    obj.kx += (dx / len) * force / mass;
    obj.ky += (dy / len) * force / mass;
    const k = Math.hypot(obj.kx, obj.ky), max = 8;
    if (k > max) { obj.kx *= max / k; obj.ky *= max / k; }
  }

  // Wake idle monsters within earshot (gunfire / a comrade spotting the player).
  _alertNearby(x, y, radius) {
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.alive && e.state === 'idle' && dist(x, y, e.x, e.y) < radius) {
        e.state = 'chase'; e.target = 'player';
      }
    }
  }

  // Where an enemy is currently trying to attack (its target, or the player).
  _targetPos(e) {
    const t = e.target;
    if (t && t !== 'player' && t.alive && t.state !== 'dead' && t.state !== 'dying') return { x: t.x, y: t.y, ent: t };
    e.target = 'player';
    return { x: this.player.x, y: this.player.y, ent: null };
  }

  _fire() {
    const p = this.player, w = WEAPONS[p.weapon];
    if (w.ammo && p.ammo[w.ammo] < w.useAmmo) {
      // auto-switch to a weapon we can fire (pistol or fist)
      this.message('out of ammo');
      if (p.owned[1] && p.ammo.bullets > 0) this._switchWeapon(1);
      else this._switchWeapon(0);
      return;
    }
    if (w.ammo) p.ammo[w.ammo] -= w.useAmmo;
    p.fireCD = w.cooldown;
    p.weaponFlash = 0.09;
    p.muzzle = w.flash;
    p.recoil = 1;
    p.faceMood = (p.health <= 35 ? 'angry' : 'excited'); p.faceTimer = 0.35; p.calmT = 0;
    this.audio.play(w.sound);

    if (w.kind === 'projectile') {
      this._spawnProjectile(p.x, p.y, p.angle + (w.spread ? rnd(-w.spread, w.spread) : 0), w);
    } else {
      const pellets = w.pellets || 1;
      const berserkMul = (p.berserk && w.kind === 'melee') ? 10 : 1;   // berserk fist wrecks
      for (let i = 0; i < pellets; i++) {
        const a = p.angle + rnd(-w.spread, w.spread);
        this._hitscan(p.x, p.y, a, irnd(w.dmg[0], w.dmg[1]) * berserkMul, w.range, 'player');
      }
    }
    if (w.name !== 'FIST') this._alertNearby(p.x, p.y, 6);  // the noise draws monsters
    if (w.name === 'BFG 9000') this.addShake(0.5);
    else if (w.name === 'SUPER SHOTGUN' || w.name === 'ROCKET LAUNCHER') this.addShake(0.28);
    else if (w.name === 'SHOTGUN' || w.name === 'CHAINGUN') this.addShake(0.1);
  }

  // March a ray; damage the first thing hit before a wall. `source` is
  // 'player' or the firing enemy; an enemy's shot can hit the player AND other
  // monsters (friendly fire → infighting), but never the shooter itself.
  _hitscan(ox, oy, angle, dmg, range, source) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const step = 0.04;
    let x = ox, y = oy;
    const isPlayer = source === 'player';
    const knock = Math.min(2 + dmg * 0.12, 4);
    for (let t = 0; t < range; t += step) {
      x += dx * step; y += dy * step;
      if (this._rayBlocked(Math.floor(x), Math.floor(y))) return; // hit wall/closed door
      for (const e of this.entities) {
        if (e === source) continue;
        if (e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') {
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < e.radius * e.radius) {
            this._applyKnock(e, dx, dy, knock);
            this._damageEnemy(e, dmg, source); this._spawnPuff(x, y); return;
          }
        } else if (e.kind === 'barrel' && e.alive) {
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < e.radius * e.radius) { this._damageBarrel(e, dmg, source); return; }
        }
      }
      if (!isPlayer && (x - this.player.x) ** 2 + (y - this.player.y) ** 2 < PLAYER_R * PLAYER_R) {
        this._applyKnock(this.player, dx, dy, knock * 0.7);
        this._damagePlayer(dmg, ox, oy); return;
      }
    }
  }

  _spawnProjectile(x, y, angle, w, owner = 'player') {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const sprite = SPR[w.proj] || SPR.fireball;
    const glow = PROJ_LIGHT[w.proj];
    this.entities.push({
      kind: 'proj', x: x + dx * 0.4, y: y + dy * 0.4,
      vx: dx * w.projSpeed, vy: dy * w.projSpeed,
      dmg: Array.isArray(w.dmg) ? irnd(w.dmg[0], w.dmg[1]) : w.dmg,
      splash: w.splash || 0, owner, sprite, spriteH: w.projH || 0.4, vOffset: 0.45,
      fullbright: true, alive: true, life: 6,
      // homing (Revenant missiles): curve toward the shooter's target at a
      // capped turn rate, so strafing still dodges them.
      homing: !!w.homing, turn: w.turn || 2.2,
      hTarget: (owner && owner !== 'player' && owner.target) ? owner.target : 'player',
      light: glow ? { r: glow[0], g: glow[1], b: glow[2], radius: w.splash > 1 ? 4 : 3, intensity: 1.5 } : null,
    });
  }

  // Where a homing projectile should steer: its target entity if alive, else the player.
  _projTarget(pr) {
    const t = pr.hTarget;
    if (t && t !== 'player' && t.alive && t.state !== 'dead' && t.state !== 'dying') return t;
    return this.player;
  }

  _updateProjectile(pr, dt) {
    // Homing missiles (Revenant): rotate the velocity toward the target at a
    // capped turn rate so a strafing player can still outrun/dodge them.
    if (pr.homing) {
      const tp = this._projTarget(pr);
      const desired = Math.atan2(tp.y - pr.y, tp.x - pr.x);
      const cur = Math.atan2(pr.vy, pr.vx);
      let d = normalizeAngle(desired - cur);
      const m = pr.turn * dt;
      if (d > m) d = m; else if (d < -m) d = -m;
      const na = cur + d, spd = Math.hypot(pr.vx, pr.vy);
      pr.vx = Math.cos(na) * spd; pr.vy = Math.sin(na) * spd;
    }
    const steps = 3;
    const sx = pr.vx * dt / steps, sy = pr.vy * dt / steps;
    pr.life -= dt;
    const fromPlayer = pr.owner === 'player';
    for (let i = 0; i < steps; i++) {
      pr.x += sx; pr.y += sy;
      if (this._rayBlocked(Math.floor(pr.x), Math.floor(pr.y))) { this._projectileHit(pr, null); return; }
      // hit any monster/barrel except the one that fired it
      for (const e of this.entities) {
        if (e === pr.owner) continue;
        if ((e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') || (e.kind === 'barrel' && e.alive)) {
          const rr = e.radius + 0.15;
          if ((pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 < rr * rr) { this._projectileHit(pr, e); return; }
        }
      }
      if (!fromPlayer && (pr.x - this.player.x) ** 2 + (pr.y - this.player.y) ** 2 < (PLAYER_R + 0.15) ** 2) { this._projectileHit(pr, 'player'); return; }
    }
    if (pr.life <= 0) pr._remove = true;
  }

  _projectileHit(pr, target) {
    pr._remove = true;
    if (pr.splash > 0) {
      this._explode(pr.x, pr.y, pr.splash, pr.dmg, pr.owner);
    } else {
      if (target === 'player') { this._applyKnock(this.player, pr.vx, pr.vy, 3); this._damagePlayer(pr.dmg, pr.x - pr.vx, pr.y - pr.vy); }
      else if (target && target.kind === 'enemy') { this._applyKnock(target, pr.vx, pr.vy, 4); this._damageEnemy(target, pr.dmg, pr.owner); }
      else if (target && target.kind === 'barrel') this._damageBarrel(target, pr.dmg, pr.owner);
      this._spawnEffect(pr.x, pr.y, 0.5);
    }
  }

  _explode(x, y, radius, dmg, source) {
    this.audio.play('explosion');
    this._spawnEffect(x, y, radius * 0.6);
    this._spawnParticles(x, y, 0.5, 24, { speed: 5, up: 4, life: 0.7, colors: DEBRIS });
    const dpl = dist(x, y, this.player.x, this.player.y);
    if (dpl < radius + 4) this.addShake(Math.min(0.9, (radius + 4 - dpl) / (radius + 4) * 0.9));
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') {
        const d = dist(x, y, e.x, e.y);
        if (d < radius + e.radius) {
          const f = 1 - d / (radius + e.radius);
          this._applyKnock(e, e.x - x, e.y - y, 9 * f);
          this._damageEnemy(e, Math.round(dmg * f), source);
        }
      } else if (e.kind === 'barrel' && e.alive) {
        const d = dist(x, y, e.x, e.y);
        if (d < radius + e.radius) this._damageBarrel(e, dmg, source);
      }
    }
    const dp = dist(x, y, this.player.x, this.player.y);
    if (dp < radius + PLAYER_R) {
      const f = 1 - dp / (radius + PLAYER_R);
      this._applyKnock(this.player, this.player.x - x, this.player.y - y, 7 * f);
      this._damagePlayer(Math.round(dmg * f), x, y);
    }
  }

  _spawnEffect(x, y, sh) {
    this.entities.push({ kind: 'effect', x, y, spriteH: sh + 0.4, vOffset: 0.4, time: 0, dur: 0.34, fullbright: true, sprite: SPR.explosion0, alive: true });
  }
  _spawnPuff(x, y) {
    this.entities.push({ kind: 'effect', x, y, spriteH: 0.3, vOffset: 0.5, time: 0, dur: 0.16, fullbright: true, sprite: SPR.explosion0, alive: true, small: true });
    this._spawnParticles(x, y, 0.55, 5, { speed: 2.2, up: 1.6, life: 0.32, colors: SPARKS });
  }
  _updateEffect(e, dt) {
    e.time += dt;
    const n = Math.min(3, Math.floor(e.time / (e.dur / 4)));
    e.sprite = e.vile ? SPR['vileflame' + n] : SPR['explosion' + n];
    if (e.time >= e.dur) e._remove = true;
  }

  _damageBarrel(b, dmg, source = 'player') {
    b.hp -= dmg;
    if (b.hp <= 0 && b.alive) {
      b.alive = false; b._remove = true;
      this._explode(b.x, b.y, 2.2, 80, source);
    }
  }

  _damageEnemy(e, dmg, source) {
    if (!e.alive || e.state === 'dead' || e.state === 'dying') return;
    e.hp -= dmg;
    e.flash = 0.09;     // bright hit-flash
    this._spawnParticles(e.x, e.y, (e.vOffset || 0) + 0.55, 4 + (dmg / 8 | 0), { speed: 2.5, up: 2.4, life: 0.5, colors: BLOOD });
    const wasIdle = e.state === 'idle';
    // retaliate against whoever hurt us — a monster hit by another monster
    // turns on it (infighting); a player hit re-aims it at the player.
    if (source && source !== 'player' && source.kind === 'enemy' && source !== e) e.target = source;
    else if (source === 'player') e.target = 'player';
    if (wasIdle) { this.audio.play('monster_sight'); this._alertNearby(e.x, e.y, 5); }

    if (e.hp <= 0) {
      e.state = 'dying'; e.stateTime = 0; e.alive = false;
      // overkill (rockets / BFG / point-blank super shotgun) gibs the monster
      const gib = !e.def.boss && (dmg > 100 || -e.hp >= e.def.hp * 0.75);
      const zc = (e.vOffset || 0) + 0.5;
      this._spawnParticles(e.x, e.y, zc, gib ? 30 : 14, { speed: gib ? 5 : 3.5, up: gib ? 4.6 : 3, life: gib ? 0.95 : 0.7, colors: BLOOD });
      if (gib) {
        this._spawnParticles(e.x, e.y, zc, 12, { speed: 4.6, up: 5.6, life: 1.25, colors: GIB });
        this.audio.play('gib');
        e.gibbed = true;      // obliterated — an Arch-Vile can't raise a puddle
        e.stateTime = 0.36;   // snap straight to the final gore frame (obliterated)
      }
      this.audio.play('monster_death');
      if (e.def.boss) {
        this.message('THE GUMBIRD TAKES A FINAL BOW.');
        this.audio.singLine([C4, G4, C5], 0.5);
        this._spawnParticles(e.x, e.y, 0.9, 40, { speed: 5, up: 4.5, life: 1.0, colors: DEBRIS });
        this.addShake(0.85);
      }
      const p = this.player;
      p.kills++;
      if (source === 'player') {
        p.killStreak = (this.timer - p.lastKillStamp < 2.5) ? p.killStreak + 1 : 1;
        p.lastKillStamp = this.timer;
        p.faceMood = p.killStreak >= 3 ? 'angry' : 'excited';
        p.faceTimer = 0.55; p.calmT = 0;
      }
      return;
    }
    if (e.state === 'idle') e.state = 'chase';
    if (Math.random() < e.def.painChance) { e.state = 'pain'; e.stateTime = 0; this.audio.play('pain'); }
  }

  _damagePlayer(dmg, srcX, srcY) {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;   // invulnerability sphere shrugs it off
    dmg = Math.max(1, Math.round(dmg * (this.skill ? this.skill.dmgTaken : 1)));
    let dealt = dmg;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.floor(dmg / 3));
      p.armor -= absorbed; dealt = dmg - absorbed;
    }
    p.health -= dealt;
    // remember which way the hit came from (screen-relative) for the HUD marker
    if (srcX !== undefined) { p.hurtDir = normalizeAngle(Math.atan2(srcY - p.y, srcX - p.x) - p.angle); p.hurtT = 1; }
    p.damageFlash = Math.min(1, p.damageFlash + dmg / 30);
    this.addShake(Math.min(0.7, 0.18 + dmg * 0.02));
    const panic = dmg > 20 || p.health <= 20;
    p.faceMood = panic ? 'bees' : 'stressed'; p.faceTimer = panic ? 0.8 : 0.45; p.calmT = 0;
    this.audio.play(dmg > 18 ? 'oof' : 'pain');
  }

  _killPlayer() {
    const p = this.player;
    p.dead = true; p.health = 0; p.deathTime = 0;
    p.faceMood = 'dead';
    this.audio.play('death');
    this.audio.stopMusic();
    this.state = 'dead';
  }

  // Is an awake monster bearing down on the player right now?
  _threatNear() {
    const p = this.player;
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.alive && (e.state === 'chase' || e.state === 'attack' || e.state === 'pain')) {
        if (dist(e.x, e.y, p.x, p.y) < 7 && this._lineOfSight(e.x, e.y, p.x, p.y)) return true;
      }
    }
    return false;
  }

  // Drive the Nicolas Cage status-bar face from gameplay state.
  // Short-lived event moods (fire/hurt/kill) are set elsewhere with a faceTimer;
  // when none is active we fall back to an ambient mood.
  _updateFace(dt) {
    const p = this.player;
    const threat = this._threatNear();
    if (threat) p.calmT = 0; else p.calmT += dt;
    if (p.faceTimer > 0) { p.faceTimer -= dt; return; }
    let mood;
    if (p.health <= 20) mood = 'bees';                 // BEES!!! — pure panic
    else if (threat) mood = 'focused';                 // sunglasses, locked in
    else if (p.calmT > 6 && p.health >= 100) mood = 'carefree';
    else if (p.calmT > 3) mood = (p.idleMoveT > 5 ? 'meh' : 'relaxed');
    else mood = 'happy';
    p.faceMood = mood;
  }

  // ---- enemy AI ----------------------------------------------------------
  _updateEnemy(e, dt) {
    if (e.state === 'dead') { e.sprite = enemyFrame(e); return; }
    if (e.state === 'dying') {
      e.stateTime += dt;
      if (e.stateTime >= 0.5) e.state = 'dead';
      e.sprite = enemyFrame(e);
      return;
    }

    if (e.def.boss) this._updateGumbirdSong(e, dt);

    if (e.flash > 0) e.flash -= dt;
    // physics: ride out any knockback impulse, then decay it
    if (e.kx || e.ky) {
      this._moveEnemy(e, e.kx * dt, e.ky * dt);
      const kd = Math.max(0, 1 - 10 * dt);
      e.kx *= kd; e.ky *= kd;
      if (Math.abs(e.kx) < 0.01) e.kx = 0;
      if (Math.abs(e.ky) < 0.01) e.ky = 0;
    }

    const tp = this._targetPos(e);
    const tx = tp.x, ty = tp.y;
    const d = dist(e.x, e.y, tx, ty);
    const see = this._lineOfSight(e.x, e.y, tx, ty);

    if (e.state === 'pain') {
      e.stateTime += dt;
      if (e.stateTime >= 0.2) e.state = 'chase';
      e.sprite = enemyFrame(e);
      return;
    }

    if (e.state === 'idle') {
      if (see && d < 16) { e.state = 'chase'; this.audio.play('monster_sight'); this._alertNearby(e.x, e.y, 5); }
      e.sprite = enemyFrame(e);
      return;
    }

    e.cooldownTimer = Math.max(0, e.cooldownTimer - dt);

    // Arch-Vile: raise a fallen monster back to life instead of pressing forward.
    if (e.def.attack === 'fire' && e.state === 'chase') {
      e.reviveCD = Math.max(0, (e.reviveCD || 0) - dt);
      if (e.reviveCD <= 0) {
        const corpse = this._findResurrectable(e);
        if (corpse) {
          this._resurrect(e, corpse);
          e.reviveCD = 3.4; e.cooldownTimer = Math.max(e.cooldownTimer, 0.9);
          e.sprite = enemyFrame(e); return;
        }
      }
    }

    if (e.state === 'attack') {
      e.attackTime += dt;
      const wind = e.def.windup || 0.3;   // the Arch-Vile telegraphs a long cast
      if (!e.didAttack && e.attackTime >= wind) {
        e.didAttack = true;
        if (see) this._enemyAttack(e);    // no line of sight at ignition → the cast fizzles
      }
      if (e.attackTime >= wind + 0.3) { e.state = 'chase'; e.cooldownTimer = e.def.cooldown * (this.skill ? this.skill.atkCooldown : 1); }
      e.sprite = enemyFrame(e);
      return;
    }

    // chase the current target (player by default, or an enemy if infighting)
    e.walkTime += dt;
    const inRange = d <= e.def.range;
    if (see && inRange && e.cooldownTimer <= 0) {
      e.state = 'attack'; e.attackTime = 0; e.didAttack = false;
      e.angle = Math.atan2(ty - e.y, tx - e.x);
      this.audio.play(e.def.attackSound || 'monster_attack');
      e.sprite = enemyFrame(e);
      return;
    }
    const ang = Math.atan2(ty - e.y, tx - e.x);
    e.angle = ang;
    const sp = e.def.speed * dt;
    const ranged = e.def.attack !== 'melee';
    if (e.def.attack === 'melee' || d > e.def.range * 0.85) {
      // approach
      if (see || d < 18) { this._enemyOpenDoors(e, ang); this._moveEnemy(e, Math.cos(ang) * sp, Math.sin(ang) * sp); }
    } else if (ranged && d < e.def.range * 0.45) {
      // too close — back off to keep firing range
      this._moveEnemy(e, -Math.cos(ang) * sp * 0.8, -Math.sin(ang) * sp * 0.8);
    }
    // ranged monsters juke sideways to dodge fire
    if (ranged && see && d < e.def.range * 1.2 && d > 1.4) {
      e.strafeT = (e.strafeT || 0) - dt;
      if (e.strafeT <= 0) { e.strafe = Math.random() < 0.5 ? 1 : -1; e.strafeT = 0.5 + Math.random() * 0.9; }
      const perp = ang + Math.PI / 2;
      const ss = sp * 0.6 * (e.strafe || 1);
      this._moveEnemy(e, Math.cos(perp) * ss, Math.sin(perp) * ss);
    }
    e.sprite = enemyFrame(e);
  }

  // The Gumbird belts out "Row, Row, Row Your Boat" once roused, one line at a
  // time, with the melody synthesized under each lyric.
  _updateGumbirdSong(e, dt) {
    if (e.state === 'idle') return;
    if (!e._introduced) { e._introduced = true; this.message('THE GUMBIRD ROLLS IN, JUGGLING!'); }
    e.singTimer = (e.singTimer || 0) - dt;
    if (e.singTimer <= 0) {
      e.singLine = ((e.singLine == null ? -1 : e.singLine) + 1) % GUMBIRD_SONG.length;
      const line = GUMBIRD_SONG[e.singLine];
      this.message(line.text);
      const dur = this.audio.singLine(line.notes);
      e.singTimer = (dur || line.notes.length * 0.32) + 0.7;   // line length + a breath
    }
  }

  _enemyAttack(e) {
    const tp = this._targetPos(e);
    const ang = Math.atan2(tp.y - e.y, tp.x - e.x);
    const dmg = irnd(e.def.dmg[0], e.def.dmg[1]);
    if (e.def.attack === 'melee') {
      if (dist(e.x, e.y, tp.x, tp.y) <= e.def.range + 0.2) {
        if (tp.ent) { this._applyKnock(tp.ent, tp.x - e.x, tp.y - e.y, 3); this._damageEnemy(tp.ent, dmg, e); }
        else { this._applyKnock(this.player, this.player.x - e.x, this.player.y - e.y, 3); this._damagePlayer(dmg, e.x, e.y); }
      }
    } else if (e.def.attack === 'hitscan') {
      this._hitscan(e.x, e.y, ang + rnd(-0.06, 0.06), dmg, e.def.range + 2, e);
    } else if (e.def.attack === 'spawn') {
      this._spawnLostSoul(e, ang);          // pain elemental belches a Lost Soul
    } else if (e.def.attack === 'fire') {
      this._vileFire(e);                    // arch-vile erupts flame at its target
    } else {
      // projectile — usually one, but a `salvo` fans several across `spread`
      // radians (the Mancubus's two-cannon spread that punishes strafing).
      const n = e.def.salvo || 1, sp = e.def.spread || 0;
      for (let k = 0; k < n; k++) {
        const a = n === 1 ? ang : ang + (k - (n - 1) / 2) * sp;
        this._spawnProjectile(e.x, e.y, a, {
          proj: e.def.proj, projSpeed: e.def.projSpeed, dmg: e.def.dmg, splash: 0,
          homing: e.def.homing, turn: e.def.turn,
        }, e);
      }
    }
  }

  // Pain Elemental: launch a Lost Soul toward the target, capped so the swarm
  // can't run away, and counted into the level tally so kills stay ≤ total.
  _spawnLostSoul(pe, ang) {
    let live = 0;
    for (const x of this.entities) if (x.kind === 'enemy' && x.type === 'lostsoul' && x.alive) live++;
    if (live >= 14) return;
    const x = pe.x + Math.cos(ang) * 0.9, y = pe.y + Math.sin(ang) * 0.9;
    if (this._rayBlocked(Math.floor(x), Math.floor(y))) return;
    const def = ENEMY_TYPES.lostsoul;
    this.entities.push({
      kind: 'enemy', type: 'lostsoul', def, x, y, angle: ang, z: pe.z || 0,
      hp: def.hp, radius: def.radius, spriteH: def.spriteH, vOffset: def.vOffset || 0,
      fullbright: def.fullbright || false, fuzz: false, mass: def.mass || 1,
      kx: Math.cos(ang) * 6, ky: Math.sin(ang) * 6, target: pe.target,
      state: 'chase', stateTime: 0, walkTime: 0, cooldownTimer: 0.3,
      attackTime: 0, didAttack: false, alive: true, sprite: SPR.lostsoul_walk0,
    });
    this.player.totalKills++;
    this.audio.play('monster_attack');
  }

  // ---- Arch-Vile abilities ----------------------------------------------
  _spawnVileFlame(x, y, voff = 0) {
    this.entities.push({
      kind: 'effect', vile: true, x, y, spriteH: 1.7, vOffset: (voff || 0) + 0.05,
      time: 0, dur: 0.5, fullbright: true, sprite: SPR.vileflame0, alive: true,
    });
  }

  // The fire attack: a flame erupts from the ground at the target for heavy
  // damage and a hard blast away from the Vile. Ignition only reaches here while
  // the Vile still has line of sight — breaking it mid-cast makes it fizzle.
  _vileFire(e) {
    const tp = this._targetPos(e);
    const dmg = irnd(e.def.dmg[0], e.def.dmg[1]);
    this._spawnVileFlame(tp.x, tp.y, tp.ent ? (tp.ent.vOffset || 0) : (this.player.z || 0));
    this._spawnParticles(tp.x, tp.y, 0.4, 14, { speed: 3.2, up: 5, life: 0.6, colors: DEBRIS });
    this.audio.play('vilefire');
    if (tp.ent) {
      this._applyKnock(tp.ent, tp.ent.x - e.x, tp.ent.y - e.y, 7);
      this._damageEnemy(tp.ent, dmg, e);
    } else {
      this.addShake(0.5);
      this._applyKnock(this.player, this.player.x - e.x, this.player.y - e.y, 8);  // blasted off your feet
      this._damagePlayer(dmg, e.x, e.y);
    }
  }

  // A raiseable corpse near the Vile: a fully-collapsed monster (not gibbed, not
  // a boss, not another Vile), within reach, in sight, and clear of the player.
  _findResurrectable(v) {
    for (const e of this.entities) {
      if (e === v || e.kind !== 'enemy' || e.state !== 'dead') continue;
      if (e.gibbed || e.def.boss || e.type === 'archvile') continue;
      if (dist(v.x, v.y, e.x, e.y) > 4.5) continue;
      if (dist(e.x, e.y, this.player.x, this.player.y) < 0.9) continue;
      if (!this._lineOfSight(v.x, v.y, e.x, e.y)) continue;
      return e;
    }
    return null;
  }

  // Raise a corpse: it stands at full health and rejoins the hunt. Taken back off
  // the tally (kills--) so a resurrected-then-rekilled monster isn't double-counted.
  _resurrect(v, e) {
    e.alive = true; e.hp = e.def.hp;
    e.state = 'chase'; e.target = 'player'; e.gibbed = false;
    e.stateTime = 0; e.walkTime = 0; e.attackTime = 0; e.didAttack = false;
    e.cooldownTimer = 0.5; e.kx = 0; e.ky = 0; e.flash = 0.2;
    this.player.kills = Math.max(0, this.player.kills - 1);
    this._spawnVileFlame(e.x, e.y, e.vOffset || 0);
    this._spawnParticles(e.x, e.y, (e.vOffset || 0) + 0.5, 18,
      { speed: 3, up: 4.4, life: 0.75, colors: [rgba(120, 255, 150), rgba(60, 200, 90), rgba(200, 255, 210), rgba(30, 150, 70)] });
    this.audio.play('resurrect');
    v.angle = Math.atan2(e.y - v.y, e.x - v.x);
    if (!v._raisedOnce && this._lineOfSight(this.player.x, this.player.y, v.x, v.y)) {
      v._raisedOnce = true; this.message('THE ARCH-VILE RAISES THE DEAD!');
    }
  }

  // Monsters shove unlocked doors open to pursue their target.
  _enemyOpenDoors(e, ang) {
    const ax = e.x + Math.cos(ang) * (e.radius + 0.4);
    const ay = e.y + Math.sin(ang) * (e.radius + 0.4);
    const door = this.map.doorMap[Math.floor(ay) * this.map.W + Math.floor(ax)];
    if (door && !door.lock && (door.state === 'closed' || door.state === 'closing')) {
      door.state = 'opening'; this.audio.play('door');
    }
  }

  _moveEnemy(e, mvx, mvy) {
    if (!this._blockedEnemy(e, e.x + mvx, e.y, e.radius)) e.x += mvx;
    else if (!this._blockedEnemy(e, e.x + mvx, e.y + (mvy >= 0 ? e.radius : -e.radius) * 0.3, e.radius)) e.x += mvx * 0.5;
    if (!this._blockedEnemy(e, e.x, e.y + mvy, e.radius)) e.y += mvy;
    if (this.map.hasHeights) {
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      e.z = (cx >= 0 && cy >= 0 && cx < this.map.W && cy < this.map.H) ? this.map.blockH[cy * this.map.W + cx] : 0;
    }
  }

  _blockedEnemy(self, x, y, r) {
    const map = this.map;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    const climb = (self.z || 0) + 0.28;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const tall = map.hasHeights && cx >= 0 && cy >= 0 && cx < map.W && cy < map.H && map.blockH[cy * map.W + cx] > climb;
        if (this._cellBlocks(cx, cy) || tall) {
          const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
          if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
        }
      }
    // avoid overlapping other monsters / barrels / player
    for (const o of this.entities) {
      if (o === self || !o.alive) continue;
      if ((o.kind === 'enemy' && o.state !== 'dead' && o.state !== 'dying') || o.kind === 'barrel') {
        const rr = r + o.radius;
        if ((x - o.x) ** 2 + (y - o.y) ** 2 < rr * rr) return true;
      }
    }
    const rp = r + PLAYER_R;
    if ((x - this.player.x) ** 2 + (y - this.player.y) ** 2 < rp * rp) return true;
    return false;
  }

  _lineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const steps = Math.ceil(d / 0.1);
    const sx = dx / steps, sy = dy / steps;
    let x = x0, y = y0;
    for (let i = 0; i < steps; i++) {
      x += sx; y += sy;
      if (this._rayBlocked(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  // ---- pickups -----------------------------------------------------------
  _tryPickup(e) {
    if (!e.alive) return;
    if (dist(e.x, e.y, this.player.x, this.player.y) < 0.55) {
      if (e.def.apply(this)) {
        e.alive = false; e._remove = true;
        this.itemsTaken = (this.itemsTaken || 0) + 1;
        this.player.pickupFlash = 0.5;
        this.audio.play(e.def.sound || 'pickup');
      }
    }
  }

  // ---- level flow --------------------------------------------------------
  // Cheat: warp straight to the next level (no intermission), keeping your
  // loadout. Triggered by typing "stfl" during play. Wraps victory on the last.
  cheatNextLevel() {
    if (this.state !== 'playing') return;
    if (this.levelIndex + 1 < LEVELS.length) {
      this.levelIndex++;
      this.loadLevel(this.levelIndex);
      this.message('STFL — WARPED TO ' + this.map.name);
    } else {
      this.message('STFL — NO NEXT LEVEL (final map)');
    }
  }

  // Cheat: grant the secret SAUSAGE gun (fires white tadpoles, no ammo) and
  // switch to it. Triggered by typing "sauce" during play.
  cheatSausage() {
    if (this.state !== 'playing') return;
    const idx = WEAPONS.length - 1;   // the sausage is the last slot
    this.player.owned[idx] = true;
    this._switchWeapon(idx);
    this.message('SAUCE — THE SAUSAGE IS YOURS');
    this.audio.play('weapon');
  }

  _exitLevel() {
    this.audio.play('levelend');
    const total = this.player.totalKills, totItems = this.totalItems || 0;
    this.tally = {
      level: LEVELS[this.levelIndex].name,
      kills: this.player.kills, total,
      items: this.itemsTaken || 0, totalItems: totItems,
      secrets: this.player.secrets || 0, totalSecrets: this.totalSecrets || 0,
      time: Math.max(0, this.timer - (this.levelStartT || 0)),
      // a target time that scales with how much there was to clear
      par: Math.round(35 + total * 4 + totItems * 1.5),
      next: this.levelIndex + 1 < LEVELS.length,
    };
    this.state = 'intermission';
    this.intermission = 0;
    this._tallyDone = 0; this._tickAcc = 0;
  }

  // Rows the intermission counts up, in order. Secrets only when the level had any.
  _tallyRows() {
    const t = this.tally;
    const rows = ['kills', 'items'];
    if ((t.totalSecrets || 0) > 0) rows.push('secrets');
    rows.push('time');
    return rows;
  }

  // Animation timing shared with the HUD (hud.js mirrors these constants).
  _tallyTiming() { return { LEAD: 0.45, ROW_DUR: 0.85, ROW_GAP: 0.32 }; }
  _tallyTotalTime() {
    const { LEAD, ROW_DUR, ROW_GAP } = this._tallyTiming();
    return LEAD + this._tallyRows().length * (ROW_DUR + ROW_GAP) + 0.2;
  }

  _updateIntermission(dt) {
    this.intermission += dt;
    const { LEAD, ROW_DUR, ROW_GAP } = this._tallyTiming();
    const rows = this._tallyRows(), t = this.intermission;

    // tick while a row is counting up; a ding as each row lands
    let counting = false;
    for (let k = 0; k < rows.length; k++) { const s = LEAD + k * (ROW_DUR + ROW_GAP); if (t >= s && t < s + ROW_DUR) counting = true; }
    this._tickAcc = (this._tickAcc || 0) + dt;
    if (counting && this._tickAcc >= 0.05) { this.audio.play('menu'); this._tickAcc = 0; }
    const done = rows.filter((_, k) => t >= LEAD + k * (ROW_DUR + ROW_GAP) + ROW_DUR).length;
    if (done > (this._tallyDone || 0)) this.audio.play('pickup');
    this._tallyDone = done;

    const advance = this.input.justPressed('Enter') || this.input.justPressed('Space') || this.input.mouseJustPressed(0);
    if (!advance) return;
    // first press snaps the still-running tally to complete; press again to leave
    if (this.intermission < this._tallyTotalTime()) { this.intermission = this._tallyTotalTime(); this._tallyDone = rows.length; return; }
    if (this.tally.next) {
      this.levelIndex++;
      this.loadLevel(this.levelIndex);   // switches to the next level's track
      this.state = 'playing';
    } else {
      this.audio.stopMusic();
      this.state = 'victory';
    }
  }

  _updateDead(dt) {
    this.player.deathTime += dt;
    if ((this.input.justPressed('Enter') || this.input.justPressed('KeyR') || this.input.mouseJustPressed(0)) && this.player.deathTime > 0.8) {
      // restart current level, keep nothing (fresh marine)
      const lvl = this.levelIndex;
      this.player = this._freshPlayer();
      this.loadLevel(lvl);   // restarts the level track
      this.state = 'playing';
    }
  }
}
