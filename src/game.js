// game.js — the World/Game orchestrator: state, player, entities, combat, AI.
import { RENDER_W, RENDER_H } from './raycaster.js';
import { SPR } from './assets.js';
import { LEVELS, parseLevel, SOLID, DOOR_LOCK } from './data/levels.js';
import { ENEMY_TYPES, ENEMY_CHAR, enemyFrame } from './data/enemies.js';
import { WEAPONS, AMMO_MAX } from './data/weapons.js';
import { ITEMS } from './data/items.js';
import { clamp, normalizeAngle, dist, rgba } from './math.js';

const PLAYER_R = 0.22;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

export class Game {
  constructor(renderer, input, audio) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.state = 'title';
    this.levelIndex = 0;
    this.messages = [];
    this.timer = 0;
    this.player = this._freshPlayer();
    this.intermission = null;
    this.tally = null;
  }

  _freshPlayer() {
    return {
      x: 1.5, y: 1.5, angle: 0, pitch: 0,
      health: 100, armor: 0,
      owned: [true, true, false, false, false, false],
      weapon: 1, pendingWeapon: 1, raiseT: 0,
      ammo: { bullets: 50, shells: 0, rockets: 0 },
      keys: { red: false, blue: false, yellow: false },
      fireCD: 0, weaponFlash: 0, recoil: 0,
      bobPhase: 0, bobAmt: 0,
      damageFlash: 0, pickupFlash: 0,
      kills: 0, totalKills: 0, secrets: 0,
      dead: false, deathTime: 0,
      faceTimer: 0, faceMood: 'happy', calmT: 0, idleMoveT: 0, killStreak: 0, lastKillStamp: -99,
    };
  }

  // ---- level loading -----------------------------------------------------
  startNewGame() {
    this.player = this._freshPlayer();
    this.levelIndex = 0;
    this.loadLevel(0);
    this.state = 'playing';
    this.audio.startMusic();
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
    this.player.x = map.start.x;
    this.player.y = map.start.y;
    this.player.angle = map.startAngle;
    this.player.keys = { red: false, blue: false, yellow: false };
    this.player.kills = 0;
    this._spawnThings(map);
    this.player.totalKills = this.entities.filter((e) => e.kind === 'enemy').length;
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
          hp: def.hp, radius: def.radius, spriteH: def.spriteH, vOffset: def.vOffset || 0,
          state: 'idle', stateTime: 0, walkTime: 0, cooldownTimer: 0,
          attackTime: 0, didAttack: false, alive: true, sprite: SPR[def.prefix + '_walk0'],
        });
      } else if (ch === 'o') {
        this.entities.push({ kind: 'barrel', x, y, hp: 20, radius: 0.33, spriteH: 0.85, vOffset: 0, alive: true, sprite: SPR.barrel });
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
      default: break;
    }
  }

  _updatePlaying(dt) {
    const inp = this.input, p = this.player;
    // --- look (mouse + arrows/Q-E) ---
    const turnSpeed = 2.6;
    p.angle += inp.mouseDX * 0.0026;
    if (inp.down('ArrowLeft')) p.angle -= turnSpeed * dt;
    if (inp.down('ArrowRight')) p.angle += turnSpeed * dt;
    p.angle = normalizeAngle(p.angle);

    // --- movement ---
    let fwd = 0, strafe = 0;
    if (inp.down('KeyW') || inp.down('ArrowUp')) fwd += 1;
    if (inp.down('KeyS') || inp.down('ArrowDown')) fwd -= 1;
    if (inp.down('KeyD')) strafe += 1;
    if (inp.down('KeyA')) strafe -= 1;
    const run = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 1.7 : 1.0;
    const speed = 3.1 * run;
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    let mvx = (dirX * fwd - dirY * strafe) * speed * dt;
    let mvy = (dirY * fwd + dirX * strafe) * speed * dt;
    if (mvx || mvy) {
      this._movePlayer(mvx, mvy);
      p.bobPhase += dt * 10 * run;
      p.bobAmt = Math.min(1, p.bobAmt + dt * 4);
      p.idleMoveT = 0;
    } else {
      p.bobAmt = Math.max(0, p.bobAmt - dt * 4);
      p.idleMoveT += dt;
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

    // --- doors ---
    for (const d of this.map.doors) this._updateDoor(d, dt);

    // --- timers/flashes ---
    p.damageFlash = Math.max(0, p.damageFlash - dt * 2);
    p.pickupFlash = Math.max(0, p.pickupFlash - dt * 3);
    this._updateFace(dt);

    if (p.health <= 0 && !p.dead) this._killPlayer();
  }

  // ---- player movement & collision --------------------------------------
  _movePlayer(mvx, mvy) {
    const p = this.player;
    if (!this._blocked(p.x + mvx, p.y, PLAYER_R, true)) p.x += mvx;
    if (!this._blocked(p.x, p.y + mvy, PLAYER_R, true)) p.y += mvy;
  }

  // Circle-vs-grid collision; optionally also collide with solid entities.
  _blocked(x, y, r, vsEntities) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this._cellBlocks(cx, cy)) {
          const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
          if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
        }
      }
    }
    if (vsEntities) {
      for (const e of this.entities) {
        if (!e.alive) continue;
        if (e.kind === 'enemy' && e.state !== 'dead' && e.state !== 'dying') {
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
        }
        return;
      }
      if (ch === '+') { this._exitLevel(); return; }
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
    p.recoil = 1;
    p.faceMood = (p.health <= 35 ? 'angry' : 'excited'); p.faceTimer = 0.35; p.calmT = 0;
    this.audio.play(w.sound);

    if (w.kind === 'projectile') {
      this._spawnProjectile(p.x, p.y, p.angle, w);
    } else {
      const pellets = w.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const a = p.angle + rnd(-w.spread, w.spread);
        this._hitscan(p.x, p.y, a, irnd(w.dmg[0], w.dmg[1]), w.range, 'player');
      }
    }
  }

  // March a ray; damage the first enemy/barrel hit before a wall.
  _hitscan(ox, oy, angle, dmg, range, owner) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const step = 0.04;
    let x = ox, y = oy;
    for (let t = 0; t < range; t += step) {
      x += dx * step; y += dy * step;
      if (this._rayBlocked(Math.floor(x), Math.floor(y))) return; // hit wall/closed door
      for (const e of this.entities) {
        if (e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') {
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < e.radius * e.radius) {
            this._damageEnemy(e, dmg, owner); this._spawnPuff(x, y); return;
          }
        } else if (e.kind === 'barrel' && e.alive) {
          if ((x - e.x) ** 2 + (y - e.y) ** 2 < e.radius * e.radius) {
            this._damageBarrel(e, dmg); return;
          }
        }
      }
      // hit the player? (used by enemy hitscan)
      if (owner === 'enemy') {
        if ((x - this.player.x) ** 2 + (y - this.player.y) ** 2 < PLAYER_R * PLAYER_R) {
          this._damagePlayer(dmg); return;
        }
      }
    }
  }

  _spawnProjectile(x, y, angle, w, owner = 'player') {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const sprite = SPR[w.proj] || SPR.fireball;
    this.entities.push({
      kind: 'proj', x: x + dx * 0.4, y: y + dy * 0.4,
      vx: dx * w.projSpeed, vy: dy * w.projSpeed,
      dmg: Array.isArray(w.dmg) ? irnd(w.dmg[0], w.dmg[1]) : w.dmg,
      splash: w.splash || 0, owner, sprite, spriteH: 0.4, vOffset: 0.45,
      fullbright: true, alive: true, life: 6,
    });
  }

  _updateProjectile(pr, dt) {
    const steps = 3;
    const sx = pr.vx * dt / steps, sy = pr.vy * dt / steps;
    pr.life -= dt;
    for (let i = 0; i < steps; i++) {
      pr.x += sx; pr.y += sy;
      if (this._rayBlocked(Math.floor(pr.x), Math.floor(pr.y))) { this._projectileHit(pr, null); return; }
      // target collision
      if (pr.owner === 'player') {
        for (const e of this.entities) {
          if ((e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') || (e.kind === 'barrel' && e.alive)) {
            const rr = e.radius + 0.15;
            if ((pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 < rr * rr) { this._projectileHit(pr, e); return; }
          }
        }
      } else {
        if ((pr.x - this.player.x) ** 2 + (pr.y - this.player.y) ** 2 < (PLAYER_R + 0.15) ** 2) { this._projectileHit(pr, 'player'); return; }
      }
    }
    if (pr.life <= 0) pr._remove = true;
  }

  _projectileHit(pr, target) {
    pr._remove = true;
    if (pr.splash > 0) {
      this._explode(pr.x, pr.y, pr.splash, pr.dmg, pr.owner);
    } else {
      if (target === 'player') this._damagePlayer(pr.dmg);
      else if (target && target.kind === 'enemy') this._damageEnemy(target, pr.dmg, pr.owner);
      else if (target && target.kind === 'barrel') this._damageBarrel(target, pr.dmg);
      this._spawnEffect(pr.x, pr.y, 0.5);
    }
  }

  _explode(x, y, radius, dmg, owner) {
    this.audio.play('explosion');
    this._spawnEffect(x, y, radius * 0.6);
    for (const e of this.entities) {
      if (e.kind === 'enemy' && e.alive && e.state !== 'dead' && e.state !== 'dying') {
        const d = dist(x, y, e.x, e.y);
        if (d < radius + e.radius) this._damageEnemy(e, Math.round(dmg * (1 - d / (radius + e.radius))), owner);
      } else if (e.kind === 'barrel' && e.alive) {
        const d = dist(x, y, e.x, e.y);
        if (d < radius + e.radius) this._damageBarrel(e, dmg);
      }
    }
    const dp = dist(x, y, this.player.x, this.player.y);
    if (dp < radius + PLAYER_R) this._damagePlayer(Math.round(dmg * (1 - dp / (radius + PLAYER_R))));
  }

  _spawnEffect(x, y, sh) {
    this.entities.push({ kind: 'effect', x, y, spriteH: sh + 0.4, vOffset: 0.4, time: 0, dur: 0.34, fullbright: true, sprite: SPR.explosion0, alive: true });
  }
  _spawnPuff(x, y) {
    this.entities.push({ kind: 'effect', x, y, spriteH: 0.3, vOffset: 0.5, time: 0, dur: 0.16, fullbright: true, sprite: SPR.explosion0, alive: true, small: true });
  }
  _updateEffect(e, dt) {
    e.time += dt;
    const n = Math.min(3, Math.floor(e.time / (e.dur / 4)));
    e.sprite = SPR['explosion' + n];
    if (e.time >= e.dur) e._remove = true;
  }

  _damageBarrel(b, dmg) {
    b.hp -= dmg;
    if (b.hp <= 0 && b.alive) {
      b.alive = false; b._remove = true;
      this._explode(b.x, b.y, 2.2, 80, 'player');
    }
  }

  _damageEnemy(e, dmg, owner) {
    if (!e.alive || e.state === 'dead' || e.state === 'dying') return;
    e.hp -= dmg;
    if (e.state === 'idle') { e.state = 'chase'; this.audio.play('monster_sight'); }
    if (e.hp <= 0) {
      e.state = 'dying'; e.stateTime = 0; e.alive = false;
      this.audio.play('monster_death');
      const p = this.player;
      p.kills++;
      if (owner === 'player') {
        p.killStreak = (this.timer - p.lastKillStamp < 2.5) ? p.killStreak + 1 : 1;
        p.lastKillStamp = this.timer;
        p.faceMood = p.killStreak >= 3 ? 'angry' : 'excited';
        p.faceTimer = 0.55; p.calmT = 0;
      }
      return;
    }
    if (Math.random() < e.def.painChance) {
      e.state = 'pain'; e.stateTime = 0;
      this.audio.play('pain');
    }
  }

  _damagePlayer(dmg) {
    const p = this.player;
    if (p.dead) return;
    let dealt = dmg;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.floor(dmg / 3));
      p.armor -= absorbed; dealt = dmg - absorbed;
    }
    p.health -= dealt;
    p.damageFlash = Math.min(1, p.damageFlash + dmg / 30);
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

    const p = this.player;
    const d = dist(e.x, e.y, p.x, p.y);
    const see = this._lineOfSight(e.x, e.y, p.x, p.y);

    if (e.state === 'pain') {
      e.stateTime += dt;
      if (e.stateTime >= 0.2) e.state = 'chase';
      e.sprite = enemyFrame(e);
      return;
    }

    if (e.state === 'idle') {
      if (see && d < 16) { e.state = 'chase'; this.audio.play('monster_sight'); }
      e.sprite = enemyFrame(e);
      return;
    }

    e.cooldownTimer = Math.max(0, e.cooldownTimer - dt);

    if (e.state === 'attack') {
      e.attackTime += dt;
      if (!e.didAttack && e.attackTime >= 0.3) {
        e.didAttack = true;
        if (see) this._enemyAttack(e);
      }
      if (e.attackTime >= 0.6) { e.state = 'chase'; e.cooldownTimer = e.def.cooldown; }
      e.sprite = enemyFrame(e);
      return;
    }

    // chase
    e.walkTime += dt;
    const inRange = d <= e.def.range;
    if (see && inRange && e.cooldownTimer <= 0) {
      e.state = 'attack'; e.attackTime = 0; e.didAttack = false;
      e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      this.audio.play('monster_attack');
      e.sprite = enemyFrame(e);
      return;
    }
    // move toward the player (melee wants to close, ranged keeps mid distance)
    const wantClose = e.def.attack === 'melee' || d > e.def.range * 0.8;
    if (wantClose && (see || d < 18)) {
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      e.angle = ang;
      const sp = e.def.speed * dt;
      this._moveEnemy(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
    }
    e.sprite = enemyFrame(e);
  }

  _enemyAttack(e) {
    const p = this.player;
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.def.attack === 'melee') {
      if (dist(e.x, e.y, p.x, p.y) <= e.def.range + 0.2) this._damagePlayer(irnd(e.def.dmg[0], e.def.dmg[1]));
    } else if (e.def.attack === 'hitscan') {
      const a = ang + rnd(-0.06, 0.06);
      this._hitscan(e.x, e.y, a, irnd(e.def.dmg[0], e.def.dmg[1]), e.def.range + 2, 'enemy');
    } else {
      this._spawnProjectile(e.x, e.y, ang, {
        proj: e.def.proj, projSpeed: e.def.projSpeed, dmg: e.def.dmg, splash: 0,
      }, 'enemy');
    }
  }

  _moveEnemy(e, mvx, mvy) {
    if (!this._blockedEnemy(e, e.x + mvx, e.y, e.radius)) e.x += mvx;
    else if (!this._blockedEnemy(e, e.x + mvx, e.y + (mvy >= 0 ? e.radius : -e.radius) * 0.3, e.radius)) e.x += mvx * 0.5;
    if (!this._blockedEnemy(e, e.x, e.y + mvy, e.radius)) e.y += mvy;
  }

  _blockedEnemy(self, x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        if (this._cellBlocks(cx, cy)) {
          const nx = clamp(x, cx, cx + 1), ny = clamp(y, cy, cy + 1);
          if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
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
        this.player.pickupFlash = 0.5;
        this.audio.play(e.def.sound || 'pickup');
      }
    }
  }

  // ---- level flow --------------------------------------------------------
  _exitLevel() {
    this.audio.play('levelend');
    this.tally = {
      level: LEVELS[this.levelIndex].name,
      kills: this.player.kills, total: this.player.totalKills,
      next: this.levelIndex + 1 < LEVELS.length,
    };
    this.state = 'intermission';
    this.intermission = 0;
  }

  _updateIntermission(dt) {
    this.intermission += dt;
    if ((this.input.justPressed('Enter') || this.input.justPressed('Space') || this.input.mouseJustPressed(0)) && this.intermission > 0.4) {
      if (this.tally.next) {
        this.levelIndex++;
        this.loadLevel(this.levelIndex);
        this.state = 'playing';
      } else {
        this.state = 'victory';
      }
    }
  }

  _updateDead(dt) {
    this.player.deathTime += dt;
    if ((this.input.justPressed('Enter') || this.input.justPressed('KeyR') || this.input.mouseJustPressed(0)) && this.player.deathTime > 0.8) {
      // restart current level, keep nothing (fresh marine)
      const lvl = this.levelIndex;
      this.player = this._freshPlayer();
      this.loadLevel(lvl);
      this.state = 'playing';
      this.audio.startMusic();
    }
  }
}
