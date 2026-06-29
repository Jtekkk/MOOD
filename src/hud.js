// hud.js — status bar, first-person weapon, and full-screen overlays.
// World pixels live in renderer.buf (320x200); HUD text is drawn on the
// offscreen 2D context after the world buffer is blitted.

import { SPR } from './assets.js';
import { WEAPONS, AMMO_MAX } from './data/weapons.js';
import { RENDER_W, RENDER_H } from './raycaster.js';
import { SOLID, DOORS } from './data/levels.js';

const BAR_H = 32;
const BAR_Y = RENDER_H - BAR_H;     // 168

// ---- first-person weapon, blitted straight into the pixel buffer ----------
const WEAPON_SCALE = 0.58;   // keep the gun small, tucked into the bottom
export function blitWeapon(renderer, game) {
  const p = game.player;
  const w = WEAPONS[p.weapon];
  const tex = (p.weaponFlash > 0 ? SPR[w.fpFire] : SPR[w.fp]) || SPR.fp_pistol;
  const scale = WEAPON_SCALE;
  const drawW = tex.w * scale, drawH = tex.h * scale;
  const bobX = Math.sin(p.bobPhase) * 3 * p.bobAmt;
  const bobY = Math.abs(Math.cos(p.bobPhase)) * 3 * p.bobAmt;
  const recoil = p.recoil * 5;
  const raise = (p.raiseT / 0.16) * 26;
  // anchor the bottom of the sprite just under the status bar, slightly right of centre
  const dx = (RENDER_W - drawW) / 2 + 6 + bobX;
  const dy = BAR_Y - drawH + 10 + bobY + recoil + raise;
  blitSprite(renderer.buf, tex, dx | 0, dy | 0, scale);
}

// Nearest-neighbour scaled blit with alpha test into a Uint32 buffer.
export function blitSprite(buf, tex, dx, dy, scale) {
  const drawW = (tex.w * scale) | 0, drawH = (tex.h * scale) | 0;
  const px = tex.pixels, tw = tex.w, th = tex.h;
  for (let y = 0; y < drawH; y++) {
    const sy = dy + y;
    if (sy < 0 || sy >= RENDER_H) continue;
    const ty = (y / scale) | 0;
    for (let x = 0; x < drawW; x++) {
      const sx = dx + x;
      if (sx < 0 || sx >= RENDER_W) continue;
      const tx = (x / scale) | 0;
      const c = px[ty * tw + tx];
      if ((c >>> 24) < 128) continue;
      buf[sy * RENDER_W + sx] = c;
    }
  }
}

// ---- vignette (darkened edges over the 3D view) ---------------------------
let _vignette = null;
export function drawVignette(ctx) {
  if (!_vignette) {
    const g = ctx.createRadialGradient(
      RENDER_W / 2, BAR_Y / 2, BAR_Y * 0.25,
      RENDER_W / 2, BAR_Y / 2, RENDER_W * 0.62
    );
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(224,224,228,1)');
    g.addColorStop(1, 'rgba(112,112,124,1)');
    _vignette = g;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = _vignette;
  ctx.fillRect(0, 0, RENDER_W, BAR_Y);
  ctx.restore();
}

// ---- full-screen tints (damage/pickup) ------------------------------------
export function drawTints(ctx, game) {
  const p = game.player;
  if (p.damageFlash > 0) {
    ctx.fillStyle = `rgba(180,0,0,${Math.min(0.5, p.damageFlash * 0.5)})`;
    ctx.fillRect(0, 0, RENDER_W, BAR_Y);
  }
  if (p.pickupFlash > 0) {
    ctx.fillStyle = `rgba(220,200,80,${Math.min(0.28, p.pickupFlash * 0.28)})`;
    ctx.fillRect(0, 0, RENDER_W, BAR_Y);
  }
}

// ---- automap (top-down overlay, toggled with Tab) -------------------------
export function drawAutomap(ctx, game) {
  const map = game.map, W = map.W, H = map.H;
  const s = Math.min((RENDER_W - 10) / W, (BAR_Y - 16) / H);
  const ox = (RENDER_W - W * s) / 2, oy = (BAR_Y - H * s) / 2 + 4;
  ctx.fillStyle = 'rgba(2,4,6,0.88)'; ctx.fillRect(0, 0, RENDER_W, BAR_Y);

  const cell = Math.ceil(s);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = map.cellChar[y * W + x];
    let col = null;
    if (DOORS.has(ch)) col = '#caa030';
    else if (ch === '+') col = '#5be05b';
    else if (SOLID.has(ch)) col = '#6f6150';
    if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * s, oy + y * s, cell, cell); }
  }
  // entities
  for (const e of game.entities) {
    let col = null;
    if (e.kind === 'item') col = '#d6d630';
    else if (e.kind === 'enemy' && e.alive) col = (e.state === 'idle') ? '#a23' : '#f44';
    else if (e.kind === 'barrel' && e.alive) col = '#2a8a2a';
    if (col) { ctx.fillStyle = col; ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 2, 2); }
  }
  // player arrow
  const px = ox + game.player.x * s, py = oy + game.player.y * s, a = game.player.angle;
  ctx.strokeStyle = '#6cff6c'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5);
  ctx.lineTo(px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4);
  ctx.lineTo(px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4);
  ctx.closePath(); ctx.stroke();

  ctx.fillStyle = '#9fd6a0'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('AUTOMAP — ' + map.name, RENDER_W / 2, 4);
  ctx.fillStyle = '#778'; ctx.font = '6px monospace';
  ctx.fillText('TAB to close', RENDER_W / 2, BAR_Y - 9);
}

// ---- crosshair ------------------------------------------------------------
export function drawCrosshair(ctx) {
  ctx.fillStyle = 'rgba(120,255,120,0.7)';
  const cx = RENDER_W / 2, cy = BAR_Y / 2;
  ctx.fillRect(cx - 4, cy, 3, 1); ctx.fillRect(cx + 2, cy, 3, 1);
  ctx.fillRect(cx, cy - 4, 1, 3); ctx.fillRect(cx, cy + 2, 1, 3);
}

// ---- messages (top-left) --------------------------------------------------
export function drawMessages(ctx, game) {
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 3;
  for (const m of game.messages) {
    const a = Math.min(1, m.time);
    ctx.fillStyle = `rgba(0,0,0,${a * 0.6})`;
    ctx.fillText(m.text, 5, y + 1);
    ctx.fillStyle = `rgba(230,230,210,${a})`;
    ctx.fillText(m.text, 4, y);
    y += 10;
  }
}

function faceSprite(p) {
  if (p.dead || p.faceMood === 'dead') return SPR.face_dead;
  const h = p.health;
  const s = h > 80 ? 0 : h > 60 ? 1 : h > 40 ? 2 : h > 20 ? 3 : 4;
  const mood = p.faceMood || 'happy';
  return SPR[`face_${s}_${mood}`] || SPR.face_0_happy;
}

// The label under the face — the meme caption for the current mood.
const MOOD_LABEL = {
  happy: 'HAPPY', carefree: 'CAREFREE', relaxed: 'RELAXED', excited: 'EXCITED',
  focused: 'FOCUSED', stressed: 'STRESSED', angry: 'ANGRY', bees: 'BEES!!!', meh: 'MEH',
};

// ---- the status bar -------------------------------------------------------
export function drawStatusBar(ctx, game) {
  const p = game.player;
  // metallic bar background
  const g = ctx.createLinearGradient(0, BAR_Y, 0, RENDER_H);
  g.addColorStop(0, '#2b2f36'); g.addColorStop(0.5, '#20242a'); g.addColorStop(1, '#15181c');
  ctx.fillStyle = g; ctx.fillRect(0, BAR_Y, RENDER_W, BAR_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, BAR_Y, RENDER_W, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, BAR_Y + 1, RENDER_W, 1);

  const w = WEAPONS[p.weapon];
  const ammoStr = w.ammo ? String(p.ammo[w.ammo]) : '--';

  bigNum(ctx, ammoStr, 38, BAR_Y + 8, '#e8b020');
  label(ctx, 'AMMO', 6, RENDER_H - 6);

  bigNum(ctx, String(Math.max(0, p.health)) + '%', 104, BAR_Y + 8, p.health > 30 ? '#d83030' : '#ff5050');
  label(ctx, 'HEALTH', 52, RENDER_H - 6);

  // ARMS panel — owned weapon slot numbers
  ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i < WEAPONS.length; i++) {
    const col = 112 + ((i - 1) % 3) * 12;
    const row = BAR_Y + 6 + (((i - 1) / 3) | 0) * 11;
    const owned = p.owned[i];
    ctx.fillStyle = (i === p.weapon) ? '#ffd040' : owned ? '#9aa' : '#445';
    ctx.fillText(String(i + 1), col, row);
  }

  // face mug + meme caption ("TODAY I'M FEELING...")
  const face = faceSprite(p);
  if (face) {
    const fw = 20, fh = 21, fx = 151, fy = BAR_Y + 1;
    ctx.fillStyle = '#000'; ctx.fillRect(fx - 1, fy - 1, fw + 2, fh + 2);
    drawTex(ctx, face, fx, fy, fw, fh);
    ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = p.faceMood === 'bees' ? '#ffd040' : '#bbaa88';
    ctx.fillText(MOOD_LABEL[p.faceMood] || '', fx + fw / 2, RENDER_H - 1);
  }

  bigNum(ctx, String(Math.max(0, p.armor)) + '%', 210, BAR_Y + 8, '#30b030');
  label(ctx, 'ARMOR', 182, RENDER_H - 6);

  // keys
  const keyCols = { blue: '#39f', yellow: '#dd2', red: '#d33' };
  let ky = BAR_Y + 4;
  for (const k of ['blue', 'yellow', 'red']) {
    ctx.fillStyle = p.keys[k] ? keyCols[k] : 'rgba(40,44,50,0.8)';
    ctx.fillRect(228, ky, 8, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(228.5, ky + 0.5, 7, 6);
    ky += 9;
  }

  // ammo type counts: "LABEL  cur/max"
  ctx.font = '6px monospace'; ctx.textBaseline = 'top';
  const types = [['BULL', 'bullets'], ['SHEL', 'shells'], ['RCKT', 'rockets'], ['CELL', 'cells']];
  let ay = BAR_Y + 2;
  for (const [lab, t] of types) {
    const cur = w.ammo === t;
    ctx.textAlign = 'left'; ctx.fillStyle = cur ? '#ffd040' : '#8a8a78'; ctx.fillText(lab, 250, ay);
    ctx.textAlign = 'right'; ctx.fillStyle = cur ? '#ffe060' : '#cfcf30';
    ctx.fillText(`${p.ammo[t]}/${AMMO_MAX[t]}`, 318, ay);
    ay += 7;
  }
}

function bigNum(ctx, str, rightX, y, color) {
  ctx.font = 'bold 16px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, rightX + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(str, rightX, y);
}
function label(ctx, str, x, y) {
  ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#8a8a78'; ctx.fillText(str, x, y);
}
function drawTex(ctx, tex, dx, dy, dw, dh) {
  // render a Texture via a temporary canvas (cached on the texture object)
  if (!tex._canvas) {
    const c = document.createElement('canvas'); c.width = tex.w; c.height = tex.h;
    const cx = c.getContext('2d');
    const img = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
    cx.putImageData(img, 0, 0); tex._canvas = c;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tex._canvas, dx, dy, dw, dh);
}

// ---- screen overlays ------------------------------------------------------
export function drawTitle(ctx, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  // hellish gradient sky
  const g = ctx.createLinearGradient(0, 0, 0, RENDER_H);
  g.addColorStop(0, '#3a0a0a'); g.addColorStop(0.5, '#1a0606'); g.addColorStop(1, '#050505');
  ctx.fillStyle = g; ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  // jagged horizon
  ctx.fillStyle = '#0a0303';
  ctx.beginPath(); ctx.moveTo(0, 150);
  for (let x = 0; x <= RENDER_W; x += 16) ctx.lineTo(x, 140 + Math.sin(x * 0.3) * 8 + (x % 32 ? 0 : 6));
  ctx.lineTo(RENDER_W, RENDER_H); ctx.lineTo(0, RENDER_H); ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 54px monospace';
  ctx.fillStyle = '#000'; ctx.fillText('MOOD', RENDER_W / 2 + 2, 36);
  const pulse = 0.7 + 0.3 * Math.sin(t * 3);
  ctx.fillStyle = `rgb(${(200 * pulse) | 0},${(30 * pulse) | 0},${(20 * pulse) | 0})`;
  ctx.fillText('MOOD', RENDER_W / 2, 34);
  ctx.font = '8px monospace'; ctx.fillStyle = '#caa';
  ctx.fillText('a reverse-engineered knockoff of DOOM II', RENDER_W / 2, 96);

  ctx.font = '9px monospace';
  ctx.fillStyle = (Math.sin(t * 4) > 0) ? '#ffd040' : '#a88';
  ctx.fillText('CLICK or PRESS ENTER to descend', RENDER_W / 2, 120);

  ctx.font = '7px monospace'; ctx.fillStyle = '#998';
  ctx.fillText('WASD move   MOUSE look   CLICK fire   1-8 weapons', RENDER_W / 2, 150);
  ctx.fillText('E/SPACE use   SHIFT run   TAB map   M mute', RENDER_W / 2, 162);
  ctx.fillText('Reach the EXIT switch. Kill everything that moves.', RENDER_W / 2, 178);
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, RENDER_W, BAR_Y);
  ctx.textAlign = 'center'; ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ffd040'; ctx.fillText('PAUSED', RENDER_W / 2, 70);
  ctx.font = '8px monospace'; ctx.fillStyle = '#ccc';
  ctx.fillText('click to resume', RENDER_W / 2, 96);
}

export function drawDead(ctx, game) {
  ctx.fillStyle = 'rgba(80,0,0,0.4)'; ctx.fillRect(0, 0, RENDER_W, BAR_Y);
  ctx.textAlign = 'center'; ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#c00'; ctx.fillText('YOU DIED', RENDER_W / 2, 60);
  if (game.player.deathTime > 0.8) {
    ctx.font = '9px monospace';
    ctx.fillStyle = (Math.sin(game.timer * 4) > 0) ? '#ffd040' : '#a88';
    ctx.fillText('press R or ENTER to try again', RENDER_W / 2, 100);
  }
}

export function drawIntermission(ctx, game) {
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  const g = ctx.createLinearGradient(0, 0, 0, RENDER_H);
  g.addColorStop(0, '#101820'); g.addColorStop(1, '#05080a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  const tally = game.tally;
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#cfcf40';
  ctx.fillText('LEVEL COMPLETE', RENDER_W / 2, 36);
  ctx.font = '9px monospace'; ctx.fillStyle = '#bbb';
  ctx.fillText(tally.level, RENDER_W / 2, 56);
  const kpct = tally.total ? Math.round((tally.kills / tally.total) * 100) : 100;
  const ipct = tally.totalItems ? Math.round((tally.items / tally.totalItems) * 100) : 100;
  const secs = Math.floor(tally.time || 0);
  const tstr = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  ctx.textAlign = 'left'; ctx.font = '10px monospace';
  const lx = RENDER_W / 2 - 56;
  ctx.fillStyle = '#d83030'; ctx.fillText('KILLS', lx, 80);
  ctx.fillStyle = '#3a9adf'; ctx.fillText('ITEMS', lx, 96);
  ctx.fillStyle = '#cfcf40'; ctx.fillText('TIME', lx, 112);
  ctx.textAlign = 'right'; const rx = RENDER_W / 2 + 60;
  ctx.fillStyle = '#eaeaea';
  ctx.fillText(`${tally.kills} / ${tally.total}   ${kpct}%`, rx, 80);
  ctx.fillText(`${tally.items} / ${tally.totalItems}   ${ipct}%`, rx, 96);
  ctx.fillText(tstr, rx, 112);
  ctx.textAlign = 'center'; ctx.font = '8px monospace';
  ctx.fillStyle = (Math.sin(game.timer * 4) > 0) ? '#ffd040' : '#998';
  ctx.fillText(tally.next ? 'press ENTER for the next level' : 'press ENTER', RENDER_W / 2, 138);
}

export function drawVictory(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, RENDER_H);
  g.addColorStop(0, '#102008'); g.addColorStop(1, '#040804');
  ctx.fillStyle = g; ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#5be05b';
  ctx.fillText('HELL ON EARTH', RENDER_W / 2, 44);
  ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#cfcf40';
  ctx.fillText('CLEARED', RENDER_W / 2, 66);
  ctx.font = '8px monospace'; ctx.fillStyle = '#bbb';
  const lines = [
    'The demons are routed. For now.',
    'You are the only thing left moving',
    'in a city of the dead.',
    '',
    'Rebuilding will be more fun than saving it.',
  ];
  let y = 96; for (const l of lines) { ctx.fillText(l, RENDER_W / 2, y); y += 12; }
  ctx.font = '8px monospace';
  ctx.fillStyle = (Math.sin(t * 4) > 0) ? '#ffd040' : '#998';
  ctx.fillText('press ENTER to return to the title', RENDER_W / 2, RENDER_H - 16);
}
