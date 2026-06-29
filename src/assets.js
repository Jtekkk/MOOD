// assets.js — every texture and sprite is generated procedurally on a canvas
// and read back into a packed-pixel Texture. No external image files.

import { rgba } from './math.js';

/** @typedef {{w:number,h:number,pixels:Uint32Array}} Texture */

export const TEX = {};   // wall / floor / ceiling textures (opaque), keyed by name
export const SPR = {};   // sprites with transparency (enemies, items, weapons, faces)

// Deterministic PRNG so the generated art is identical every run.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function texFrom(c, ctx) {
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, pixels: new Uint32Array(img.data.buffer.slice(0)) };
}

// Add a 1px dark outline around the opaque silhouette so the sprite reads
// crisply against the world (monsters and pickups get this in buildAssets).
function outlineTex(tex, color = 0xff080808) {
  const { w, h, pixels } = tex;
  const out = new Uint32Array(pixels);
  const op = (i) => (pixels[i] >>> 24) >= 110;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (op(i)) continue;
      if ((x > 0 && op(i - 1)) || (x < w - 1 && op(i + 1)) ||
          (y > 0 && op(i - w)) || (y < h - 1 && op(i + w))) out[i] = color;
    }
  }
  return { w, h, pixels: out };
}

// ----- wall / flat textures (64x64, tileable-ish, opaque) -----------------

function noiseOverlay(ctx, w, h, rng, amt, alpha = 0.12) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amt;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function techWall(seed, base = '#5a6b7a', panel = '#384552', rivet = '#9aaab8') {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
  // brushed-metal directional shading
  const sg = ctx.createLinearGradient(0, 0, 64, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.07)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, 64, 64);
  // two recessed panels with full bevels
  for (const py of [5, 35]) {
    ctx.fillStyle = panel; ctx.fillRect(5, py, 54, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(5, py, 54, 2); ctx.fillRect(5, py, 2, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(5, py + 22, 54, 2); ctx.fillRect(57, py, 2, 24);
  }
  // recessed indicator-light strip + tiny status lights
  const lights = ['#e85038', '#46e070', '#f0c030', '#40a8ff'];
  for (const py of [11, 41]) {
    ctx.fillStyle = '#222a30'; ctx.fillRect(40, py, 14, 8);
    for (let k = 0; k < 4; k++) { ctx.fillStyle = lights[(k + seed) & 3]; ctx.fillRect(41 + k * 3, py + 3, 2, 2); }
  }
  // rivets with a touch of shadow
  for (const [x, y] of [[9, 9], [55, 9], [9, 56], [55, 56], [9, 39], [55, 39]]) {
    ctx.fillStyle = rivet; ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 2, y + 2, 1, 1);
  }
  // grime drips
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let i = 0; i < 4; i++) { const x = 8 + (rng() * 48 | 0); ctx.fillRect(x, 30 + (rng() * 6 | 0), 1, 18 + (rng() * 10 | 0)); }
  noiseOverlay(ctx, 64, 64, rng, 22);
  return texFrom(c, ctx);
}

function brickWall(seed, mortar = '#2a1d18', brick = '#7a3b2a') {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, 64, 64);
  const bh = 8, bw = 16;
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 5; col++) {
      const x = col * bw + off + 1;
      const y = row * bh + 1;
      const v = 0.8 + rng() * 0.4;
      ctx.fillStyle = `rgb(${(122 * v) | 0},${(59 * v) | 0},${(42 * v) | 0})`;
      ctx.fillRect(x, y, bw - 2, bh - 2);
    }
  }
  noiseOverlay(ctx, 64, 64, rng, 24);
  return texFrom(c, ctx);
}

function metalWall(seed) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#43474d'); g.addColorStop(0.5, '#2b2e33'); g.addColorStop(1, '#1c1e22');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 2, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = 2; x < 64; x += 16) ctx.fillRect(x, 0, 1, 64);
  // hazard stripe
  ctx.fillStyle = '#c7a017';
  ctx.fillRect(0, 28, 64, 8);
  ctx.fillStyle = '#1c1e22';
  for (let x = -8; x < 64; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 36); ctx.lineTo(x + 6, 28); ctx.lineTo(x + 12, 28); ctx.lineTo(x + 6, 36);
    ctx.closePath(); ctx.fill();
  }
  noiseOverlay(ctx, 64, 64, rng, 18);
  return texFrom(c, ctx);
}

function stoneWall(seed) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = '#4b463e'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 26; i++) {
    const x = (rng() * 64) | 0, y = (rng() * 64) | 0, s = 6 + (rng() * 14 | 0);
    const v = 0.7 + rng() * 0.5;
    ctx.fillStyle = `rgb(${(75 * v) | 0},${(70 * v) | 0},${(62 * v) | 0})`;
    ctx.fillRect(x, y, s, s);
  }
  noiseOverlay(ctx, 64, 64, rng, 30);
  return texFrom(c, ctx);
}

// Bloody marble / "skin" wall with a creepy face — a nod to the hell levels.
function marbleFaceWall(seed) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#5d6b6f'); g.addColorStop(1, '#39454a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  // veins
  ctx.strokeStyle = 'rgba(120,30,30,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rng() * 64, y = 0;
    ctx.moveTo(x, y);
    while (y < 64) { x += (rng() - 0.5) * 10; y += 6; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // a snarling face
  ctx.fillStyle = '#1a2024';
  ctx.beginPath(); ctx.ellipse(22, 26, 7, 9, 0, 0, 7); ctx.fill();   // eye socket
  ctx.beginPath(); ctx.ellipse(42, 26, 7, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c33'; ctx.fillRect(20, 24, 4, 4); ctx.fillRect(40, 24, 4, 4); // glowing eyes
  ctx.strokeStyle = '#10161a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(18, 46); for (let x = 18; x <= 46; x += 4) ctx.lineTo(x, 46 + ((x / 4) % 2 ? 4 : -2)); ctx.stroke();
  noiseOverlay(ctx, 64, 64, rng, 16);
  return texFrom(c, ctx);
}

function doorTex(seed) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = '#6b5a32'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#4a3e22'; ctx.fillRect(2, 2, 60, 60);
  // big metal bands
  ctx.fillStyle = '#7d6c3c';
  ctx.fillRect(6, 6, 52, 22); ctx.fillRect(6, 36, 52, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(6, 6, 52, 2); ctx.fillRect(6, 36, 52, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(6, 26, 52, 2); ctx.fillRect(6, 56, 52, 2);
  // vertical seam (door split)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(31, 0, 2, 64);
  ctx.fillStyle = '#c0b070';
  for (const y of [10, 24, 40, 54]) { ctx.fillRect(10, y, 2, 2); ctx.fillRect(52, y, 2, 2); }
  noiseOverlay(ctx, 64, 64, rng, 18);
  return texFrom(c, ctx);
}

function coloredDoorTex(seed, color) {
  const t = doorTex(seed);
  // tint the door with the key color stripe
  const { c, ctx } = makeCanvas(64, 64);
  const img = new ImageData(new Uint8ClampedArray(t.pixels.buffer.slice(0)), 64, 64);
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 28, 64, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 28, 64, 2);
  return texFrom(c, ctx);
}

function exitWall(seed) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = '#2f3a30'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#1d241e'; ctx.fillRect(4, 4, 56, 56);
  // big switch plate
  ctx.fillStyle = '#444'; ctx.fillRect(20, 16, 24, 34);
  ctx.fillStyle = '#2a7d2a'; ctx.fillRect(24, 20, 16, 12);
  ctx.fillStyle = '#5be05b'; ctx.fillRect(24, 20, 16, 4);
  ctx.fillStyle = '#b22'; ctx.fillRect(24, 36, 16, 10);
  ctx.fillStyle = '#f55'; ctx.fillRect(24, 36, 16, 3);
  ctx.fillStyle = '#9f9';
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('EXIT', 32, 60);
  noiseOverlay(ctx, 64, 64, rng, 14);
  return texFrom(c, ctx);
}

function floorTex(seed, base = [60, 58, 54]) {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  const [r, g, b] = base;
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, 64, 64);
  // large soft blotches for big-scale variation
  for (let i = 0; i < 9; i++) {
    const x = rng() * 64, y = rng() * 64, rad = 8 + rng() * 16, v = (rng() - 0.5) * 34;
    const gg = ctx.createRadialGradient(x, y, 1, x, y, rad);
    gg.addColorStop(0, `rgba(${r + v | 0},${g + v | 0},${b + v | 0},0.5)`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  }
  // fine grain
  for (let i = 0; i < 480; i++) {
    const x = (rng() * 64) | 0, y = (rng() * 64) | 0, v = (rng() - 0.5) * 46;
    ctx.fillStyle = `rgba(${r + v | 0},${g + v | 0},${b + v | 0},0.55)`;
    ctx.fillRect(x, y, 1, 1);
  }
  // cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    let x = rng() * 64, y = rng() * 64; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rng() - 0.5) * 18; y += (rng() - 0.5) * 18; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // tile seam + lit top-left edge
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(0.5, 0.5, 63, 63);
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, 64, 1); ctx.fillRect(0, 0, 1, 64);
  return texFrom(c, ctx);
}

function ceilTex(seed) { return floorTex(seed, [30, 30, 36]); }
function bloodFloor(seed) { return floorTex(seed, [70, 18, 18]); }

// ----- sprite helpers -----------------------------------------------------

function shadowEllipse(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill();
}

// ----- enemy: former human (zombie soldier) -------------------------------

function zombie(frame) {
  const { c, ctx } = makeCanvas(56, 68);
  const attack = frame === 'attack';
  const sw = frame === 'walk1' ? 4 : 0;
  // legs + boots
  ctx.fillStyle = '#2f3b24';
  ctx.fillRect(22 - sw, 46, 7, 16); ctx.fillRect(29 + sw, 46, 7, 16);
  ctx.fillStyle = '#171c10'; ctx.fillRect(20 - sw, 60, 10, 4); ctx.fillRect(29 + sw, 60, 10, 4);
  // torso uniform (lit from the right)
  const tg = ctx.createLinearGradient(18, 0, 40, 0);
  tg.addColorStop(0, '#374527'); tg.addColorStop(0.55, '#566a39'); tg.addColorStop(1, '#3c4a29');
  ctx.fillStyle = tg; ctx.fillRect(18, 26, 22, 22);
  ctx.fillStyle = '#2c3620'; ctx.fillRect(18, 26, 22, 5);          // collar
  ctx.fillStyle = '#7a1c1c'; ctx.beginPath(); ctx.ellipse(28, 37, 5, 6, 0, 0, 7); ctx.fill(); // wound
  ctx.fillStyle = '#a82828'; ctx.fillRect(26, 39, 3, 8);
  // arms / pistol
  const skin = '#93a07a';
  if (attack) {
    ctx.fillStyle = '#445428'; ctx.fillRect(36, 28, 15, 6);
    ctx.fillStyle = skin; ctx.fillRect(49, 28, 5, 6);
    ctx.fillStyle = '#222'; ctx.fillRect(50, 27, 6, 8);
    muzzleFlash(ctx, 56, 31, 7);
  } else {
    ctx.fillStyle = '#445428'; ctx.fillRect(14, 28, 5, 15); ctx.fillRect(39, 28, 5, 15);
    ctx.fillStyle = skin; ctx.fillRect(14, 41, 5, 5); ctx.fillRect(39, 41, 5, 5);
  }
  // head
  const hg = ctx.createRadialGradient(25, 14, 2, 29, 18, 12);
  hg.addColorStop(0, '#aab797'); hg.addColorStop(1, '#6f7c58');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(29, 18, 9, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#241c14'; ctx.fillRect(20, 8, 18, 5); ctx.fillRect(20, 8, 4, 8); ctx.fillRect(34, 9, 4, 7); // hair
  ctx.fillStyle = '#171c10'; ctx.fillRect(24, 16, 4, 4); ctx.fillRect(31, 16, 4, 4);  // eye sockets
  ctx.fillStyle = '#cad860'; ctx.fillRect(25, 17, 2, 2); ctx.fillRect(32, 17, 2, 2);  // dull glow
  ctx.fillStyle = '#3a1414'; ctx.fillRect(25, 24, 9, 2);
  ctx.fillStyle = '#cfcabb'; ctx.fillRect(26, 24, 1, 2); ctx.fillRect(29, 24, 1, 2); ctx.fillRect(32, 24, 1, 2);
  return texFrom(c, ctx);
}

function zombieDie(stage) { return genericDie(stage, '#566a39', '#2c3620'); }

// ----- enemy: imp ---------------------------------------------------------

function imp(frame) {
  const { c, ctx } = makeCanvas(56, 66);
  const attack = frame === 'attack';
  const sw = frame === 'walk1' ? 4 : 0;
  // digitigrade legs + clawed feet
  ctx.fillStyle = '#5a3219';
  ctx.fillRect(20 - sw, 44, 8, 14); ctx.fillRect(30 + sw, 44, 8, 14);
  ctx.fillStyle = '#3a200f'; ctx.fillRect(17 - sw, 56, 12, 5); ctx.fillRect(29 + sw, 56, 12, 5);
  // body volume
  const bg = ctx.createRadialGradient(22, 26, 3, 29, 33, 19);
  bg.addColorStop(0, '#ad632f'); bg.addColorStop(1, '#6c391b');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(28, 33, 14, 16, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(28, 24); ctx.lineTo(28, 45); ctx.stroke();
  // shoulder + back spikes
  ctx.fillStyle = '#e3d5ab';
  ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(8, 18); ctx.lineTo(18, 28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(42, 30); ctx.lineTo(48, 18); ctx.lineTo(38, 28); ctx.fill();
  ctx.fillStyle = '#cabd95';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(15 + i * 3, 30 + i * 4); ctx.lineTo(10, 28 + i * 4); ctx.lineTo(15 + i * 3, 34 + i * 4); ctx.fill(); }
  // arms
  ctx.fillStyle = '#8a4a26';
  if (attack) {
    ctx.fillRect(34, 24, 16, 6);
    ctx.fillStyle = '#5a3219'; ctx.fillRect(48, 22, 6, 9);
    const g = ctx.createRadialGradient(53, 26, 1, 53, 26, 11);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#ffd24a'); g.addColorStop(0.7, '#e8400f'); g.addColorStop(1, 'rgba(180,20,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(53, 26, 11, 0, 7); ctx.fill();
  } else {
    ctx.fillRect(12, 28, 6, 16); ctx.fillRect(38, 28, 6, 16);
    ctx.fillStyle = '#5a3219'; ctx.fillRect(11, 42, 7, 5); ctx.fillRect(38, 42, 7, 5);
  }
  // head
  const hg = ctx.createRadialGradient(24, 12, 2, 28, 16, 11);
  hg.addColorStop(0, '#ad632f'); hg.addColorStop(1, '#6c391b');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(28, 16, 10, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e3d5ab';
  ctx.beginPath(); ctx.moveTo(20, 9); ctx.lineTo(15, 0); ctx.lineTo(24, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(36, 9); ctx.lineTo(41, 0); ctx.lineTo(32, 7); ctx.fill();
  ctx.fillStyle = '#1a0c04'; ctx.fillRect(22, 14, 5, 4); ctx.fillRect(30, 14, 5, 4);
  ctx.fillStyle = '#ffd23a'; ctx.fillRect(23, 15, 3, 2); ctx.fillRect(31, 15, 3, 2);
  ctx.fillStyle = '#2a1206'; ctx.fillRect(23, 21, 10, 3);
  ctx.fillStyle = '#d8c8a0'; ctx.fillRect(24, 21, 1, 3); ctx.fillRect(31, 21, 1, 3);
  return texFrom(c, ctx);
}

function impDie(stage) { return genericDie(stage, '#8a4a28', '#3a1a0a'); }

// ----- enemy: demon (pinky) ----------------------------------------------

function demon(frame) {
  const { c, ctx } = makeCanvas(64, 54);
  const open = frame === 'attack';
  const sw = frame === 'walk1' ? 4 : 0;
  // stubby legs
  ctx.fillStyle = '#9a4f5e';
  ctx.fillRect(12, 40, 9, 12); ctx.fillRect(43, 40, 9, 12);
  ctx.fillRect(24 + sw, 42, 8, 10); ctx.fillRect(34 - sw, 42, 8, 10);
  // body
  const bg = ctx.createRadialGradient(26, 18, 4, 32, 28, 28);
  bg.addColorStop(0, '#e79bb0'); bg.addColorStop(1, '#a85368');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(32, 28, 26, 18, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(45, 24, 12, 9, 0, 0, 7); ctx.fill();
  // head
  const hg = ctx.createRadialGradient(22, 12, 2, 26, 20, 18);
  hg.addColorStop(0, '#eaa6ba'); hg.addColorStop(1, '#bf6076');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(25, 21, 18, 14, 0, 0, 7); ctx.fill();
  // maw
  ctx.fillStyle = '#5a1424';
  if (open) { ctx.beginPath(); ctx.ellipse(21, 26, 15, 11, 0, 0, 7); ctx.fill(); }
  else { ctx.fillRect(7, 24, 30, 5); }
  // fangs
  ctx.fillStyle = '#f4ecd8';
  const my = open ? 16 : 22;
  for (let x = 8; x < 37; x += 5) { ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x + 2, my + 6); ctx.lineTo(x + 4, my); ctx.fill(); }
  if (open) for (let x = 10; x < 35; x += 5) { ctx.beginPath(); ctx.moveTo(x, 36); ctx.lineTo(x + 2, 30); ctx.lineTo(x + 4, 36); ctx.fill(); }
  // eyes + horns
  ctx.fillStyle = '#fff'; ctx.fillRect(15, 9, 6, 5); ctx.fillRect(29, 9, 6, 5);
  ctx.fillStyle = '#c00'; ctx.fillRect(17, 10, 3, 3); ctx.fillRect(31, 10, 3, 3);
  ctx.fillStyle = '#efe6cf';
  ctx.beginPath(); ctx.moveTo(11, 8); ctx.lineTo(4, 0); ctx.lineTo(16, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(39, 8); ctx.lineTo(46, 0); ctx.lineTo(34, 6); ctx.fill();
  return texFrom(c, ctx);
}

function demonDie(stage) { return genericDie(stage, '#d98aa0', '#7a1f2f'); }

// ----- enemy: cacodemon (floating ranged) ---------------------------------

function caco(frame) {
  const { c, ctx } = makeCanvas(60, 60);
  const attack = frame === 'attack';
  const g = ctx.createRadialGradient(22, 20, 4, 30, 30, 30);
  g.addColorStop(0, '#e06a64'); g.addColorStop(0.6, '#b23a3a'); g.addColorStop(1, '#6e1818');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(30, 30, 27, 0, 7); ctx.fill();
  // bumpy nubs around the rim
  ctx.fillStyle = '#8a2222';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(30 + Math.cos(a) * 27, 30 + Math.sin(a) * 27, 2.4, 0, 7); ctx.fill();
  }
  // horns
  ctx.fillStyle = '#e6dcc0';
  ctx.beginPath(); ctx.moveTo(18, 8); ctx.lineTo(13, -1); ctx.lineTo(23, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(42, 8); ctx.lineTo(47, -1); ctx.lineTo(37, 6); ctx.fill();
  // brow vein
  ctx.strokeStyle = 'rgba(90,10,10,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(18, 16); ctx.quadraticCurveTo(30, 12, 42, 16); ctx.stroke();
  // big eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(30, 23, 10, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = attack ? '#3aa0ff' : '#1a4f8a'; ctx.beginPath(); ctx.arc(30, 23, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(28, 21, 1.6, 0, 7); ctx.fill();
  // jagged mouth
  ctx.fillStyle = '#2a0808'; ctx.beginPath(); ctx.ellipse(30, 42, attack ? 13 : 10, attack ? 9 : 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f4ecd8';
  for (let x = 21; x < 40; x += 4) { ctx.beginPath(); ctx.moveTo(x, 38); ctx.lineTo(x + 2, 42); ctx.lineTo(x + 4, 38); ctx.fill(); }
  if (attack) {
    const fg = ctx.createRadialGradient(30, 50, 1, 30, 50, 10);
    fg.addColorStop(0, '#dff'); fg.addColorStop(0.5, '#3aa0ff'); fg.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(30, 50, 10, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

function cacoDie(stage) { return genericDie(stage, '#b04040', '#2a0a0a'); }

// Generic collapse-into-gibs death used by all monsters.
function genericDie(stage, body, dark) {
  const { c, ctx } = makeCanvas(64, 60);
  const top = 30 + stage * 7;
  ctx.fillStyle = 'rgba(120,20,20,0.8)'; ctx.beginPath(); ctx.ellipse(32, 56, 22, 5, 0, 0, 7); ctx.fill();
  const g = ctx.createLinearGradient(0, top, 0, 58);
  g.addColorStop(0, body); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.fillRect(12, top, 40, 58 - top);
  ctx.fillStyle = dark; ctx.fillRect(12, 54, 40, 4);
  if (stage >= 2) {
    ctx.fillStyle = '#9a2424';
    for (let i = 0; i < 10; i++) ctx.fillRect(8 + i * 5, 50 + (i % 3) * 3, 3, 3);
    ctx.fillStyle = '#c43a3a'; ctx.fillRect(20, 52, 5, 4); ctx.fillRect(38, 51, 5, 4);
  }
  return texFrom(c, ctx);
}

// ----- projectiles --------------------------------------------------------

function fireball() {
  const { c, ctx } = makeCanvas(24, 24);
  const g = ctx.createRadialGradient(12, 12, 1, 12, 12, 12);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fd4'); g.addColorStop(0.8, '#e23'); g.addColorStop(1, 'rgba(120,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(12, 12, 12, 0, 7); ctx.fill();
  return texFrom(c, ctx);
}

function plasmaBall() {
  const { c, ctx } = makeCanvas(24, 24);
  const g = ctx.createRadialGradient(12, 12, 1, 12, 12, 12);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#9cf'); g.addColorStop(0.8, '#28f'); g.addColorStop(1, 'rgba(0,40,200,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(12, 12, 12, 0, 7); ctx.fill();
  return texFrom(c, ctx);
}

function rocketProj() {
  const { c, ctx } = makeCanvas(28, 16);
  ctx.fillStyle = '#cfcfcf'; ctx.fillRect(6, 5, 16, 6);
  ctx.fillStyle = '#a00'; ctx.beginPath(); ctx.moveTo(22, 5); ctx.lineTo(28, 8); ctx.lineTo(22, 11); ctx.fill();
  ctx.fillStyle = '#666'; ctx.fillRect(6, 4, 4, 8);
  const g = ctx.createRadialGradient(4, 8, 1, 0, 8, 8);
  g.addColorStop(0, '#ff8'); g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(2, 8, 7, 0, 7); ctx.fill();
  return texFrom(c, ctx);
}

function explosionFrame(stage) {
  const { c, ctx } = makeCanvas(64, 64);
  const r = 8 + stage * 12;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, r);
  g.addColorStop(0, 'rgba(255,255,200,0.95)');
  g.addColorStop(0.4, 'rgba(255,160,40,0.9)');
  g.addColorStop(0.8, 'rgba(180,40,0,0.6)');
  g.addColorStop(1, 'rgba(60,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, r, 0, 7); ctx.fill();
  return texFrom(c, ctx);
}

// ----- pickups / items ----------------------------------------------------

function stimpack() {
  const { c, ctx } = makeCanvas(24, 24);
  shadowEllipse(ctx, 12, 21, 8, 2);
  ctx.fillStyle = '#eee'; ctx.fillRect(5, 10, 14, 9);
  ctx.fillStyle = '#c33'; ctx.fillRect(10, 6, 4, 8); ctx.fillRect(7, 9, 10, 3); // red cross? use white plus on red
  ctx.fillStyle = '#fff'; ctx.fillRect(11, 11, 2, 6); ctx.fillRect(8, 13, 8, 2);
  ctx.fillStyle = '#c33'; ctx.fillRect(5, 10, 14, 2);
  return texFrom(c, ctx);
}

function medikit() {
  const { c, ctx } = makeCanvas(28, 24);
  shadowEllipse(ctx, 14, 21, 10, 2);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(3, 7, 22, 13);
  ctx.fillStyle = '#bbb'; ctx.fillRect(3, 7, 22, 2);
  ctx.fillStyle = '#c22'; ctx.fillRect(12, 10, 4, 8); ctx.fillRect(8, 12, 12, 4);
  return texFrom(c, ctx);
}

function healthBonus() {
  const { c, ctx } = makeCanvas(20, 22);
  shadowEllipse(ctx, 10, 20, 6, 2);
  ctx.fillStyle = '#39f'; ctx.beginPath();
  ctx.moveTo(10, 3); ctx.lineTo(17, 9); ctx.lineTo(14, 18); ctx.lineTo(6, 18); ctx.lineTo(3, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#bdf'; ctx.fillRect(8, 7, 4, 8);
  return texFrom(c, ctx);
}

function armorPickup(color = '#2a2', light = '#5d5') {
  const { c, ctx } = makeCanvas(26, 26);
  shadowEllipse(ctx, 13, 23, 9, 2);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(13, 3); ctx.lineTo(23, 8); ctx.lineTo(20, 22); ctx.lineTo(13, 25); ctx.lineTo(6, 22); ctx.lineTo(3, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = light; ctx.fillRect(11, 8, 4, 12); ctx.fillRect(8, 12, 10, 3);
  return texFrom(c, ctx);
}

function megasphere() {
  const { c, ctx } = makeCanvas(30, 30);
  shadowEllipse(ctx, 15, 27, 10, 2);
  const g = ctx.createRadialGradient(11, 11, 2, 15, 15, 14);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fd6'); g.addColorStop(0.7, '#e36'); g.addColorStop(1, '#637');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(15, 15, 13, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(10, 10, 3, 0, 7); ctx.fill();
  return texFrom(c, ctx);
}

function clip() {
  const { c, ctx } = makeCanvas(18, 14);
  shadowEllipse(ctx, 9, 12, 6, 2);
  ctx.fillStyle = '#caa44a'; ctx.fillRect(3, 4, 12, 7);
  ctx.fillStyle = '#8a6a20';
  for (let x = 4; x < 15; x += 3) ctx.fillRect(x, 4, 1, 7);
  return texFrom(c, ctx);
}

function ammoBox() {
  const { c, ctx } = makeCanvas(26, 18);
  shadowEllipse(ctx, 13, 16, 9, 2);
  ctx.fillStyle = '#6b5a2a'; ctx.fillRect(3, 5, 20, 10);
  ctx.fillStyle = '#caa44a';
  for (let x = 5; x < 22; x += 4) ctx.fillRect(x, 3, 3, 5);
  return texFrom(c, ctx);
}

function shells() {
  const { c, ctx } = makeCanvas(20, 14);
  shadowEllipse(ctx, 10, 12, 7, 2);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#b33'; ctx.fillRect(3 + i * 4, 4, 3, 8);
    ctx.fillStyle = '#dd0'; ctx.fillRect(3 + i * 4, 10, 3, 2);
  }
  return texFrom(c, ctx);
}

function shellBox() {
  const { c, ctx } = makeCanvas(26, 18);
  shadowEllipse(ctx, 13, 16, 9, 2);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(3, 5, 20, 10);
  ctx.fillStyle = '#b33';
  for (let x = 5; x < 22; x += 4) { ctx.fillRect(x, 3, 3, 6); ctx.fillStyle = '#dd0'; ctx.fillRect(x, 7, 3, 2); ctx.fillStyle = '#b33'; }
  return texFrom(c, ctx);
}

function rocketBox() {
  const { c, ctx } = makeCanvas(26, 20);
  shadowEllipse(ctx, 13, 18, 9, 2);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(3, 6, 20, 11);
  ctx.fillStyle = '#a00';
  for (let x = 6; x < 21; x += 6) { ctx.fillRect(x, 3, 4, 6); }
  ctx.fillStyle = '#ccc'; for (let x = 6; x < 21; x += 6) ctx.fillRect(x, 7, 4, 3);
  return texFrom(c, ctx);
}

function keycard(color, light) {
  const { c, ctx } = makeCanvas(18, 22);
  shadowEllipse(ctx, 9, 20, 6, 2);
  ctx.fillStyle = color; ctx.fillRect(4, 4, 10, 14);
  ctx.fillStyle = light; ctx.fillRect(4, 4, 10, 3);
  ctx.fillStyle = '#fff'; ctx.fillRect(6, 9, 6, 2); ctx.fillRect(6, 12, 6, 2);
  return texFrom(c, ctx);
}

function barrel(frame) {
  const { c, ctx } = makeCanvas(28, 40);
  shadowEllipse(ctx, 14, 38, 11, 3);
  ctx.fillStyle = '#2a6a2a'; ctx.fillRect(6, 6, 16, 30);
  ctx.fillStyle = '#1e4e1e'; ctx.fillRect(6, 6, 16, 30);
  const g = ctx.createLinearGradient(6, 0, 22, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.fillRect(6, 6, 16, 30);
  ctx.fillStyle = '#0a2a0a'; ctx.fillRect(6, 12, 16, 2); ctx.fillRect(6, 28, 16, 2);
  ctx.fillStyle = '#cc3'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('☢', 14, 24);
  return texFrom(c, ctx);
}

function weaponPickup(kind) {
  const { c, ctx } = makeCanvas(40, 22);
  shadowEllipse(ctx, 20, 20, 14, 3);
  ctx.fillStyle = '#333';
  if (kind === 'shotgun') { ctx.fillRect(4, 9, 30, 5); ctx.fillStyle = '#7a5a2a'; ctx.fillRect(4, 9, 9, 5); }
  else if (kind === 'sshotgun') { ctx.fillRect(4, 8, 30, 4); ctx.fillRect(4, 13, 30, 4); ctx.fillStyle = '#7a5a2a'; ctx.fillRect(4, 8, 8, 9); }
  else if (kind === 'chaingun') { ctx.fillRect(6, 8, 26, 9); ctx.fillStyle = '#555'; for (let i = 0; i < 5; i++) ctx.fillRect(28, 8 + i * 2, 8, 1); }
  else if (kind === 'rocket') { ctx.fillRect(4, 9, 30, 6); ctx.fillStyle = '#a00'; ctx.fillRect(30, 9, 6, 6); }
  return texFrom(c, ctx);
}

// ----- first-person weapon views -----------------------------------------
// Drawn centered in a 200x130 sprite, bottom-anchored.

// vertical metallic gradient block
function metalGrad(ctx, x, y, w, h, c0, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

// horizontal (across-the-width) gradient — cylindrical shading for a
// barrel that points up/away from the viewer.
function metalGradH(ctx, x, y, w, h, c0, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c0); g.addColorStop(0.42, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

// a gloved hand block with finger seams + a top highlight
function glove(ctx, x, y, w, h) {
  metalGrad(ctx, x, y, w, h, '#9c7848', '#7a5a34', '#46341c');
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + (w / 4) * i, y, 1, h);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y + h - 2, w, 2);
}

// classic spiky muzzle flash; warm (orange) or cold (plasma blue)
function muzzleFlash(ctx, cx, cy, r, warm = true) {
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, warm ? '#ffe98a' : '#cfeaff');
  g.addColorStop(0.7, warm ? '#ff9a2e' : '#4aa0ff');
  g.addColorStop(1, warm ? 'rgba(255,110,0,0)' : 'rgba(40,90,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = (i % 2 === 0) ? r : r * 0.46;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, 7); ctx.fill();
}

// All weapons are drawn from BEHIND: barrel points UP/away, muzzle at the top,
// hands/grip at the bottom. Canvas 200x130, weapon centred on x=100.

function fpFist(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100, oy = fire ? -30 : 0;
  // forearm rising from the bottom
  metalGrad(ctx, cx - 16, 72 + oy, 32, 58, '#3f5a3a', '#2c4129', '#18261a');
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(cx - 16, 72 + oy, 3, 58);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx + 13, 72 + oy, 3, 58);
  // wrist glove
  glove(ctx, cx - 18, 56 + oy, 36, 20);
  // fist mass (knuckles toward the top, punching away)
  ctx.fillStyle = '#6f5230'; ctx.beginPath(); ctx.ellipse(cx, 48 + oy, 22, 18, 0, 0, 7); ctx.fill();
  metalGradH(ctx, cx - 20, 32 + oy, 40, 18, '#a67c48', '#7a5a34', '#4a3318');
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 18 + i * 10, 32 + oy, 1, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx - 13 + i * 10, 36 + oy, 3, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#6a4d2c'; ctx.beginPath(); ctx.ellipse(cx + 20, 50 + oy, 8, 11, 0.3, 0, 7); ctx.fill(); // thumb
  return texFrom(c, ctx);
}

function fpPistol(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100, r = fire ? 6 : 0;
  glove(ctx, cx - 18, 92 + r, 36, 38);                                   // hand on grip
  metalGradH(ctx, cx - 12, 54 + r, 24, 44, '#737b85', '#454b53', '#23272c'); // slide/body
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx - 12, 96 + r, 24, 2);
  ctx.fillStyle = '#111'; ctx.fillRect(cx - 5, 52 + r, 10, 3);           // rear sight
  metalGradH(ctx, cx - 6, 26 + r, 12, 30, '#6a727c', '#3c424a', '#23272c'); // barrel up
  ctx.fillStyle = '#15171a'; ctx.beginPath(); ctx.ellipse(cx, 26 + r, 6, 3, 0, 0, 7); ctx.fill(); // muzzle
  ctx.fillStyle = '#0a0c0e'; ctx.beginPath(); ctx.ellipse(cx, 26 + r, 3, 1.4, 0, 0, 7); ctx.fill();
  if (fire) muzzleFlash(ctx, cx, 20 + r, 22);
  return texFrom(c, ctx);
}

function fpShotgun(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100, r = fire ? 8 : 0;
  glove(ctx, cx - 22, 86 + r, 26, 36); glove(ctx, cx + 2, 90 + r, 24, 34); // hands on pump
  metalGradH(ctx, cx - 16, 76 + r, 32, 16, '#a4702f', '#714a22', '#46300f'); // wood pump
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 5; i++) ctx.fillRect(cx - 14 + i * 7, 76 + r, 1, 16);
  metalGradH(ctx, cx - 14, 58 + r, 28, 20, '#4a505a', '#33383f', '#1c1f24'); // receiver
  metalGradH(ctx, cx - 7, 18 + r, 14, 42, '#6a727c', '#3c424a', '#23272c');   // barrel up
  ctx.fillStyle = '#9aa2ac'; ctx.fillRect(cx - 7, 18 + r, 3, 42);
  metalGradH(ctx, cx + 7, 30 + r, 6, 30, '#4a505a', '#2e333a', '#191b1f');     // mag tube
  ctx.fillStyle = '#15171a'; ctx.beginPath(); ctx.ellipse(cx, 18 + r, 7, 3, 0, 0, 7); ctx.fill(); // muzzle
  if (fire) muzzleFlash(ctx, cx, 12 + r, 30);
  return texFrom(c, ctx);
}

function fpSuper(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100, r = fire ? 10 : 0;
  glove(ctx, cx - 24, 88 + r, 26, 36); glove(ctx, cx + 2, 92 + r, 24, 34);
  metalGradH(ctx, cx - 18, 76 + r, 36, 18, '#a4702f', '#714a22', '#46300f'); // wood
  metalGradH(ctx, cx - 16, 56 + r, 32, 22, '#4a505a', '#33383f', '#1c1f24'); // hinge/receiver
  metalGradH(ctx, cx - 11, 20 + r, 10, 40, '#6a727c', '#3c424a', '#23272c'); // left barrel
  metalGradH(ctx, cx + 1, 20 + r, 10, 40, '#6a727c', '#3c424a', '#23272c');  // right barrel
  ctx.fillStyle = '#9aa2ac'; ctx.fillRect(cx - 11, 20 + r, 2, 40); ctx.fillRect(cx + 1, 20 + r, 2, 40);
  ctx.fillStyle = '#15171a';
  ctx.beginPath(); ctx.ellipse(cx - 6, 20 + r, 5, 3, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 6, 20 + r, 5, 3, 0, 0, 7); ctx.fill();
  if (fire) { muzzleFlash(ctx, cx - 6, 14 + r, 24); muzzleFlash(ctx, cx + 6, 14 + r, 24); }
  return texFrom(c, ctx);
}

function fpChaingun(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100;
  glove(ctx, cx - 22, 92, 26, 34); glove(ctx, cx + 4, 96, 22, 30);
  metalGradH(ctx, cx - 18, 64, 36, 32, '#5a626c', '#3a4048', '#1d2127'); // housing
  ctx.fillStyle = '#33383f'; ctx.beginPath(); ctx.ellipse(cx, 60, 18, 7, 0, 0, 7); ctx.fill(); // rotor
  ctx.fillStyle = '#1c1f24'; ctx.beginPath(); ctx.arc(cx, 60, 4, 0, 7); ctx.fill();
  for (let i = 0; i < 5; i++) {                                          // barrel cluster up
    const bx = cx - 16 + i * 8;
    metalGradH(ctx, bx, 20, 6, 42, '#828a94', '#4a505a', '#2a2e34');
    ctx.fillStyle = '#15171a'; ctx.fillRect(bx + 1, 20, 4, 3);
  }
  if (fire) muzzleFlash(ctx, cx - 16 + (Math.floor(Math.random() * 5)) * 8 + 3, 16, 16);
  return texFrom(c, ctx);
}

function fpRocket(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const cx = 100;
  glove(ctx, cx - 24, 86, 26, 42); glove(ctx, cx + 4, 86, 24, 42);
  metalGradH(ctx, cx - 14, 22, 28, 78, '#3f5a3a', '#2c4129', '#16241a'); // tube up
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(cx - 14, 22, 3, 78);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx + 11, 22, 3, 78);
  ctx.fillStyle = '#222'; ctx.fillRect(cx - 2, 34, 4, 8);                // top sight
  ctx.fillStyle = '#11180f'; ctx.beginPath(); ctx.ellipse(cx, 22, 14, 5, 0, 0, 7); ctx.fill(); // muzzle ring
  ctx.fillStyle = '#0c130a'; ctx.beginPath(); ctx.ellipse(cx, 22, 9, 3, 0, 0, 7); ctx.fill();
  if (fire) muzzleFlash(ctx, cx, 16, 26);
  return texFrom(c, ctx);
}

// ----- HUD: the marine's face (status-bar mug) ----------------------------
// A tribute to the Nicolas Cage "Today I'm feeling..." chart. Each mood is a
// distinct expression wired to gameplay events (see game.js _updateFace).
// state: 0 healthy .. 4 near death.
// moods: happy, carefree, relaxed, excited, focused, stressed, angry, bees, meh, dead
export const FACE_MOODS = [
  'happy', 'carefree', 'relaxed', 'excited', 'focused', 'stressed', 'angry', 'bees', 'meh',
];

export function makeFace(state, mood) {
  const { c, ctx } = makeCanvas(48, 56);
  ctx.fillStyle = '#1a0d0d'; ctx.fillRect(0, 0, 48, 56);

  if (mood === 'dead') {
    ctx.fillStyle = '#7a1f1f'; ctx.fillRect(4, 30, 40, 24);
    ctx.fillStyle = '#b33'; for (let i = 0; i < 14; i++) ctx.fillRect(2 + i * 3, 28 + (i % 3) * 4, 3, 4);
    ctx.fillStyle = '#ddd'; ctx.fillRect(14, 40, 4, 4); ctx.fillRect(30, 40, 4, 4);
    return texFrom(c, ctx);
  }

  const skinShades = ['#caa07a', '#c49770', '#bd8a64', '#b07050', '#9a5a44'];
  const skin = skinShades[Math.min(4, state)];
  const HAIR = '#4a2f17', BROW = '#3a2410', MOUTH = '#3a1010';

  // hair (carefree gets long flowing locks)
  ctx.fillStyle = HAIR; ctx.fillRect(8, 5, 32, 13);
  if (mood === 'carefree') { ctx.fillRect(5, 9, 5, 34); ctx.fillRect(38, 9, 5, 34); }
  // face
  ctx.fillStyle = skin; ctx.fillRect(8, 14, 32, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(8, 14, 4, 34); ctx.fillRect(36, 14, 4, 34);
  if (mood === 'angry') { ctx.fillStyle = 'rgba(170,30,0,0.16)'; ctx.fillRect(8, 14, 32, 34); }
  // stubble for the laid-back moods
  if (mood === 'relaxed' || mood === 'carefree') { ctx.fillStyle = 'rgba(40,28,18,0.28)'; ctx.fillRect(10, 39, 28, 9); }
  // blood spatter with damage
  if (state >= 2) { ctx.fillStyle = '#9a2020'; ctx.fillRect(10, 18, 6, 3); ctx.fillRect(31, 22, 5, 4); }
  if (state >= 3) { ctx.fillStyle = '#b32020'; ctx.fillRect(20, 16, 8, 3); ctx.fillRect(13, 41, 6, 3); }

  const eyeWhite = (x, y, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); };
  const pupil = (x, y, w, h, col = '#1a1a1a') => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const brow = (lx, ly, rx, ry, w = 9, h = 2) => { ctx.fillStyle = BROW; ctx.fillRect(lx, ly, w, h); ctx.fillRect(rx, ry, w, h); };
  const moustache = () => { ctx.fillStyle = HAIR; ctx.fillRect(14, 36, 20, 4); };

  switch (mood) {
    case 'happy': {
      brow(13, 22, 27, 22, 8, 2);
      eyeWhite(13, 24, 8, 6); eyeWhite(27, 24, 8, 6);
      pupil(16, 26, 3, 3); pupil(30, 26, 3, 3);
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(16, 42, 16, 3); ctx.fillRect(15, 40, 2, 2); ctx.fillRect(31, 40, 2, 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(18, 42, 12, 1);
      break;
    }
    case 'carefree': {
      // blissful, eyes shut, gentle smile
      ctx.fillStyle = BROW; ctx.fillRect(13, 26, 8, 2); ctx.fillRect(27, 26, 8, 2);
      ctx.fillRect(13, 28, 3, 1); ctx.fillRect(32, 28, 3, 1);
      ctx.fillStyle = 'rgba(255,160,140,0.30)'; ctx.fillRect(11, 32, 5, 4); ctx.fillRect(32, 32, 5, 4);
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(17, 41, 14, 2); ctx.fillRect(15, 39, 3, 2); ctx.fillRect(30, 39, 3, 2);
      break;
    }
    case 'relaxed': {
      brow(13, 22, 27, 22, 8, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(13, 24, 8, 2); ctx.fillRect(27, 24, 8, 2); // heavy lids
      eyeWhite(13, 26, 8, 3); eyeWhite(27, 26, 8, 3);
      pupil(16, 27, 3, 2); pupil(30, 27, 3, 2);
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(16, 42, 13, 2); ctx.fillRect(28, 40, 3, 2); // smirk
      break;
    }
    case 'excited': {
      brow(12, 20, 27, 20, 9, 2);
      eyeWhite(12, 23, 9, 7); eyeWhite(27, 23, 9, 7);
      pupil(16, 25, 4, 4); pupil(30, 25, 4, 4);
      // big open grin (skip moustache so it reads)
      ctx.fillStyle = MOUTH; ctx.fillRect(15, 39, 18, 9);
      ctx.fillStyle = '#fff'; ctx.fillRect(16, 39, 16, 3);
      ctx.fillStyle = '#a33'; ctx.fillRect(20, 45, 8, 3); // tongue
      break;
    }
    case 'focused': {
      // sunglasses, cool and impassive
      brow(12, 21, 27, 21, 9, 2);
      ctx.fillStyle = '#111'; ctx.fillRect(11, 24, 26, 7);
      ctx.fillStyle = '#333'; ctx.fillRect(11, 23, 26, 1); ctx.fillRect(22, 26, 4, 2); // frame + bridge
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(13, 25, 5, 2); ctx.fillRect(28, 25, 5, 2);
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(17, 42, 14, 2);
      break;
    }
    case 'stressed': {
      brow(13, 21, 26, 21, 9, 2);
      eyeWhite(13, 24, 8, 6); eyeWhite(27, 24, 8, 6);
      pupil(16, 24, 2, 2); pupil(30, 24, 2, 2); // pupils up, nervous
      ctx.fillStyle = '#9cf'; ctx.fillRect(36, 17, 2, 5); ctx.fillRect(10, 19, 2, 4); // sweat
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(16, 42, 16, 4); // gritted teeth
      ctx.fillStyle = '#eee'; for (let x = 17; x < 32; x += 3) ctx.fillRect(x, 42, 1, 4);
      break;
    }
    case 'angry': {
      // furrowed inward brows
      ctx.fillStyle = BROW;
      ctx.fillRect(13, 22, 3, 2); ctx.fillRect(16, 23, 3, 2); ctx.fillRect(19, 24, 3, 2);
      ctx.fillRect(26, 24, 3, 2); ctx.fillRect(29, 23, 3, 2); ctx.fillRect(32, 22, 3, 2);
      eyeWhite(14, 25, 7, 4); eyeWhite(27, 25, 7, 4);
      pupil(17, 26, 3, 3); pupil(30, 26, 3, 3);
      ctx.fillStyle = MOUTH; ctx.fillRect(16, 40, 16, 7); // shout
      ctx.fillStyle = '#fff'; ctx.fillRect(17, 40, 14, 2);
      break;
    }
    case 'bees': {
      // pure panic, then a wire cage + a swarm of bees
      brow(12, 20, 27, 20, 9, 2);
      eyeWhite(12, 23, 9, 7); eyeWhite(27, 23, 9, 7);
      pupil(16, 26, 2, 2); pupil(30, 26, 2, 2);
      ctx.fillStyle = '#2a0a0a'; ctx.beginPath(); ctx.ellipse(24, 42, 8, 6, 0, 0, 7); ctx.fill(); // scream
      // bees
      const bees = [[12, 16], [20, 12], [33, 15], [16, 30], [28, 33], [36, 26], [10, 36], [24, 20], [31, 39], [14, 44], [22, 49], [34, 45]];
      for (const [bx, by] of bees) {
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx, by, 2, 2);
        ctx.fillStyle = 'rgba(220,200,40,0.8)'; ctx.fillRect(bx, by, 1, 1);
      }
      // cage
      ctx.strokeStyle = 'rgba(40,40,46,0.85)'; ctx.lineWidth = 1;
      for (let x = 12; x <= 36; x += 6) { ctx.beginPath(); ctx.moveTo(x + 0.5, 8); ctx.lineTo(x + 0.5, 52); ctx.stroke(); }
      for (let y = 12; y <= 48; y += 8) { ctx.beginPath(); ctx.moveTo(8, y + 0.5); ctx.lineTo(40, y + 0.5); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(10, 14); ctx.quadraticCurveTo(24, 2, 38, 14); ctx.stroke(); // dome
      break;
    }
    case 'meh':
    default: {
      brow(13, 23, 27, 23, 8, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(13, 25, 8, 1); ctx.fillRect(27, 25, 8, 1);
      eyeWhite(13, 26, 8, 4); eyeWhite(27, 26, 8, 4);
      pupil(18, 27, 3, 2); pupil(32, 27, 3, 2); // staring blankly
      moustache();
      ctx.fillStyle = MOUTH; ctx.fillRect(16, 43, 16, 2); // dead-flat line
      break;
    }
  }
  return texFrom(c, ctx);
}

// ----- extra surfaces for variety ----------------------------------------

function consoleWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#272c33'; ctx.fillRect(0, 0, 64, 64);
  metalGrad(ctx, 0, 0, 64, 64, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.28)');
  for (const [sx, sy] of [[6, 6], [34, 6], [6, 34], [34, 34]]) {
    ctx.fillStyle = '#0a140c'; ctx.fillRect(sx, sy, 24, 22);
    ctx.fillStyle = '#123c1a'; ctx.fillRect(sx + 1, sy + 1, 22, 20);
    ctx.fillStyle = '#5be05b';
    for (let i = 0; i < 5; i++) ctx.fillRect(sx + 2, sy + 3 + i * 4, 4 + (rng() * 16 | 0), 2);
    ctx.fillStyle = 'rgba(120,255,120,0.12)'; ctx.fillRect(sx + 1, sy + 1, 22, 20);
  }
  ctx.fillStyle = '#e0b020'; for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 14, 30, 3, 3);
  noiseOverlay(ctx, 64, 64, rng, 12);
  return texFrom(c, ctx);
}

function hazardWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#1a1c1f'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#e8c020';
  for (let i = -64; i < 64; i += 24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 12, 0); ctx.lineTo(i + 12 + 64, 64); ctx.lineTo(i + 64, 64); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, 64, 6); ctx.fillRect(0, 58, 64, 6);
  ctx.fillStyle = '#1a1c1f'; ctx.fillRect(0, 28, 64, 8); ctx.fillStyle = '#c0c4c8'; ctx.fillRect(0, 28, 64, 1);
  noiseOverlay(ctx, 64, 64, rng, 16);
  return texFrom(c, ctx);
}

function vineWall(seed) {
  const t = stoneWall(seed); const { c, ctx } = makeCanvas(64, 64);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(t.pixels.buffer.slice(0)), 64, 64), 0, 0);
  const rng = mulberry32(seed + 5);
  ctx.strokeStyle = '#2c5a22'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    let x = rng() * 64, y = 0; ctx.beginPath(); ctx.moveTo(x, y);
    while (y < 64) { x += (rng() - 0.5) * 14; y += 7; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = '#3c7a2c'; for (let k = 0; k < 4; k++) ctx.fillRect((x + (rng() - 0.5) * 20) | 0, (rng() * 64) | 0, 3, 2);
  }
  ctx.fillStyle = 'rgba(40,90,30,0.25)'; ctx.fillRect(0, 0, 64, 64);
  return texFrom(c, ctx);
}

function pipeWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#34383e'; ctx.fillRect(0, 0, 64, 64);
  noiseOverlay(ctx, 64, 64, rng, 14);
  for (const px of [10, 30, 50]) {
    metalGradH(ctx, px - 5, 0, 10, 64, '#7a828c', '#454b53', '#23272c');
    ctx.fillStyle = '#23272c'; ctx.fillRect(px - 7, 20, 14, 4); ctx.fillRect(px - 7, 44, 14, 4); // brackets
  }
  ctx.fillStyle = '#8a929c'; ctx.beginPath(); ctx.arc(50, 32, 6, 0, 7); ctx.fill(); // valve
  ctx.fillStyle = '#b22'; ctx.fillRect(48, 31, 4, 2); ctx.fillRect(49, 28, 2, 8);
  return texFrom(c, ctx);
}

function woodWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  for (let p = 0; p < 4; p++) {
    const v = 0.85 + rng() * 0.3;
    ctx.fillStyle = `rgb(${(120 * v) | 0},${(80 * v) | 0},${(42 * v) | 0})`;
    ctx.fillRect(p * 16, 0, 16, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(p * 16 + 15, 0, 1, 64);
    ctx.strokeStyle = 'rgba(60,36,16,0.4)'; ctx.lineWidth = 1;
    for (let g = 0; g < 3; g++) { ctx.beginPath(); ctx.moveTo(p * 16 + 2 + g * 5, 0); for (let y = 0; y < 64; y += 8) ctx.lineTo(p * 16 + 2 + g * 5 + (rng() - 0.5) * 3, y); ctx.stroke(); }
    ctx.fillStyle = '#3a2410'; ctx.fillRect(p * 16 + 6, 4, 2, 2); ctx.fillRect(p * 16 + 6, 58, 2, 2); // nails
  }
  noiseOverlay(ctx, 64, 64, rng, 14);
  return texFrom(c, ctx);
}

function fleshWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 40);
  g.addColorStop(0, '#9a2e2e'); g.addColorStop(1, '#5a1414');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(40,8,8,0.6)'; ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) { let x = rng() * 64, y = rng() * 64; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 22; y += (rng() - 0.5) * 22; ctx.lineTo(x, y); } ctx.stroke(); }
  // a watching eye
  ctx.fillStyle = '#e8d8c0'; ctx.beginPath(); ctx.ellipse(32, 30, 10, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c0a020'; ctx.beginPath(); ctx.arc(32, 30, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#100'; ctx.beginPath(); ctx.arc(32, 30, 2, 0, 7); ctx.fill();
  noiseOverlay(ctx, 64, 64, rng, 18);
  return texFrom(c, ctx);
}

function circuitWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#0e2418'; ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#1f7a44'; ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    let x = (rng() * 64) | 0, y = (rng() * 64) | 0; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) { if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * (8 + rng() * 16 | 0); else y += (rng() < 0.5 ? -1 : 1) * (8 + rng() * 16 | 0); ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = '#2fa05a'; ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  const leds = ['#e85038', '#f0c030', '#40a8ff'];
  for (let i = 0; i < 6; i++) { ctx.fillStyle = leds[i % 3]; ctx.fillRect((rng() * 60 | 0) + 2, (rng() * 60 | 0) + 2, 2, 2); }
  noiseOverlay(ctx, 64, 64, rng, 10);
  return texFrom(c, ctx);
}

function lightPanel(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#3a4048'; ctx.fillRect(0, 0, 64, 64);
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
    const x = 4 + gx * 30, y = 4 + gy * 30;
    ctx.fillStyle = '#1a1d22'; ctx.fillRect(x, y, 26, 26);
    const g = ctx.createLinearGradient(x, y, x, y + 26);
    g.addColorStop(0, '#dffaff'); g.addColorStop(0.5, '#8fd8ff'); g.addColorStop(1, '#3a9adf');
    ctx.fillStyle = g; ctx.fillRect(x + 2, y + 2, 22, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 2, y + 2, 22, 3);
  }
  return texFrom(c, ctx);
}

function rustWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  metalGrad(ctx, 0, 0, 64, 64, '#5a5046', '#3e362c', '#241e18');
  for (let i = 0; i < 60; i++) {
    const x = rng() * 64, y = rng() * 64, r = 2 + rng() * 8;
    const o = ctx.createRadialGradient(x, y, 1, x, y, r);
    o.addColorStop(0, 'rgba(150,70,30,0.5)'); o.addColorStop(1, 'rgba(120,50,20,0)');
    ctx.fillStyle = o; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,14,10,0.7)'; for (let i = 0; i < 4; i++) ctx.fillRect((rng() * 60 | 0), (rng() * 40 | 0), 2, 10 + rng() * 18); // holes/streaks
  noiseOverlay(ctx, 64, 64, rng, 26);
  return texFrom(c, ctx);
}

function gothicWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#43403a'; ctx.fillRect(0, 0, 64, 64);
  // big carved block bevels
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 0, 64, 2); ctx.fillRect(0, 0, 2, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 62, 64, 2); ctx.fillRect(62, 0, 2, 64);
  // recessed arch with a cross relief
  ctx.fillStyle = '#33302a'; ctx.fillRect(20, 12, 24, 44);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(20, 12, 24, 2);
  ctx.fillStyle = '#56524a'; ctx.fillRect(30, 18, 4, 30); ctx.fillRect(24, 26, 16, 4);
  noiseOverlay(ctx, 64, 64, rng, 22);
  return texFrom(c, ctx);
}

function crystalWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#16263a'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 16; i++) {
    const x = rng() * 64, y = rng() * 64, s = 8 + rng() * 16;
    const v = 0.5 + rng() * 0.6;
    ctx.fillStyle = `rgba(${(80 * v) | 0},${(150 * v) | 0},${(220 * v) | 0},0.9)`;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.6, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(220,240,255,0.4)'; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  }
  return texFrom(c, ctx);
}

function slimeWall(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#2c3a22'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 30; i++) { const x = rng() * 64, y = rng() * 64, r = 4 + rng() * 10; const o = ctx.createRadialGradient(x, y, 1, x, y, r); o.addColorStop(0, 'rgba(90,150,40,0.4)'); o.addColorStop(1, 'rgba(40,80,20,0)'); ctx.fillStyle = o; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  // drips
  ctx.fillStyle = '#7ab030'; for (let i = 0; i < 5; i++) { const x = (rng() * 60 | 0) + 2; ctx.fillRect(x, 0, 3, 10 + rng() * 30); ctx.beginPath(); ctx.arc(x + 1, 10 + rng() * 30, 3, 0, 7); ctx.fill(); }
  noiseOverlay(ctx, 64, 64, rng, 18);
  return texFrom(c, ctx);
}

function grateFloor(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#0c0e10'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#5a626c';
  for (let i = 0; i <= 64; i += 16) { ctx.fillRect(i, 0, 4, 64); ctx.fillRect(0, i, 64, 4); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i <= 64; i += 16) ctx.fillRect(i, 0, 1, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = 0; i <= 64; i += 16) ctx.fillRect(i + 3, 0, 1, 64);
  noiseOverlay(ctx, 64, 64, rng, 12);
  return texFrom(c, ctx);
}

function lavaFloor(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  ctx.fillStyle = '#5a1404'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) { const x = rng() * 64, y = rng() * 64, r = 3 + rng() * 12; const o = ctx.createRadialGradient(x, y, 1, x, y, r); o.addColorStop(0, 'rgba(255,210,60,0.9)'); o.addColorStop(0.5, 'rgba(240,90,10,0.6)'); o.addColorStop(1, 'rgba(120,20,0,0)'); ctx.fillStyle = o; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#1a0602'; ctx.lineWidth = 1; ctx.strokeStyle = '#1a0602';
  for (let i = 0; i < 5; i++) { let x = rng() * 64, y = rng() * 64; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 24; y += (rng() - 0.5) * 24; ctx.lineTo(x, y); } ctx.stroke(); }
  return texFrom(c, ctx);
}

function tileFloor(seed) {
  const { c, ctx } = makeCanvas(64, 64); const rng = mulberry32(seed);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const dark = (gx + gy) % 2 === 0;
    const v = 0.9 + rng() * 0.2;
    ctx.fillStyle = dark ? `rgb(${44 * v | 0},${46 * v | 0},${52 * v | 0})` : `rgb(${92 * v | 0},${94 * v | 0},${100 * v | 0})`;
    ctx.fillRect(gx * 16, gy * 16, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(gx * 16, gy * 16, 16, 1); ctx.fillRect(gx * 16, gy * 16, 1, 16);
  }
  noiseOverlay(ctx, 64, 64, rng, 12);
  return texFrom(c, ctx);
}

// ----- build everything ---------------------------------------------------

export function buildAssets() {
  // walls / flats
  TEX.tech = techWall(1);
  TEX.tech2 = techWall(7, '#6a5a4a', '#473b2e', '#a4907a');
  TEX.brick = brickWall(2);
  TEX.metal = metalWall(3);
  TEX.stone = stoneWall(4);
  TEX.marble = marbleFaceWall(9);
  TEX.door = doorTex(5);
  TEX.doorRed = coloredDoorTex(11, '#c22');
  TEX.doorBlue = coloredDoorTex(12, '#39f');
  TEX.doorYellow = coloredDoorTex(13, '#dd2');
  TEX.exit = exitWall(6);
  TEX.floor = floorTex(20);
  TEX.floor2 = floorTex(24, [52, 44, 40]);
  TEX.ceil = ceilTex(21);
  TEX.blood = bloodFloor(22);

  // 15 extra surfaces for variety (12 walls + 3 flats)
  TEX.console = consoleWall(31);
  TEX.hazard = hazardWall(32);
  TEX.vine = vineWall(33);
  TEX.pipe = pipeWall(34);
  TEX.wood = woodWall(35);
  TEX.flesh = fleshWall(36);
  TEX.circuit = circuitWall(37);
  TEX.lightpanel = lightPanel(38);
  TEX.rust = rustWall(39);
  TEX.gothic = gothicWall(40);
  TEX.crystal = crystalWall(41);
  TEX.slime = slimeWall(42);
  TEX.grate = grateFloor(43);
  TEX.lava = lavaFloor(44);
  TEX.tile = tileFloor(45);

  // enemies
  SPR.zombie_walk0 = zombie('walk0');
  SPR.zombie_walk1 = zombie('walk1');
  SPR.zombie_attack = zombie('attack');
  SPR.zombie_pain = zombie('walk0');
  for (let i = 0; i < 4; i++) SPR['zombie_die' + i] = zombieDie(i);

  SPR.imp_walk0 = imp('walk0');
  SPR.imp_walk1 = imp('walk1');
  SPR.imp_attack = imp('attack');
  SPR.imp_pain = imp('walk0');
  for (let i = 0; i < 4; i++) SPR['imp_die' + i] = impDie(i);

  SPR.demon_walk0 = demon('walk0');
  SPR.demon_walk1 = demon('walk1');
  SPR.demon_attack = demon('attack');
  SPR.demon_pain = demon('walk0');
  for (let i = 0; i < 4; i++) SPR['demon_die' + i] = demonDie(i);

  SPR.caco_walk0 = caco('walk0');
  SPR.caco_walk1 = caco('walk0');
  SPR.caco_attack = caco('attack');
  SPR.caco_pain = caco('walk0');
  for (let i = 0; i < 4; i++) SPR['caco_die' + i] = cacoDie(i);

  // projectiles
  SPR.fireball = fireball();
  SPR.plasma = plasmaBall();
  SPR.rocket = rocketProj();
  for (let i = 0; i < 4; i++) SPR['explosion' + i] = explosionFrame(i);

  // items
  SPR.stimpack = stimpack();
  SPR.medikit = medikit();
  SPR.healthbonus = healthBonus();
  SPR.armorbonus = armorPickup('#39f', '#7bf');
  SPR.greenarmor = armorPickup('#2a2', '#5d5');
  SPR.bluearmor = armorPickup('#36c', '#69f');
  SPR.megasphere = megasphere();
  SPR.clip = clip();
  SPR.ammobox = ammoBox();
  SPR.shells = shells();
  SPR.shellbox = shellBox();
  SPR.rocketbox = rocketBox();
  SPR.keyRed = keycard('#c22', '#f66');
  SPR.keyBlue = keycard('#36c', '#6af');
  SPR.keyYellow = keycard('#cc2', '#ff6');
  SPR.barrel = barrel(0);
  SPR.pickup_shotgun = weaponPickup('shotgun');
  SPR.pickup_sshotgun = weaponPickup('sshotgun');
  SPR.pickup_chaingun = weaponPickup('chaingun');
  SPR.pickup_rocket = weaponPickup('rocket');

  // status-bar faces (5 damage states x the Nic Cage moods)
  for (let s = 0; s < 5; s++) for (const m of FACE_MOODS) SPR[`face_${s}_${m}`] = makeFace(s, m);
  SPR.face_dead = makeFace(0, 'dead');

  // first-person weapons
  SPR.fp_fist = fpFist(false); SPR.fp_fist_fire = fpFist(true);
  SPR.fp_pistol = fpPistol(false); SPR.fp_pistol_fire = fpPistol(true);
  SPR.fp_shotgun = fpShotgun(false); SPR.fp_shotgun_fire = fpShotgun(true);
  SPR.fp_super = fpSuper(false); SPR.fp_super_fire = fpSuper(true);
  SPR.fp_chaingun = fpChaingun(false); SPR.fp_chaingun_fire = fpChaingun(true);
  SPR.fp_rocket = fpRocket(false); SPR.fp_rocket_fire = fpRocket(true);

  // crisp dark outline on monsters + world pickups so they pop against the fog
  for (const k of Object.keys(SPR)) {
    if (k.startsWith('fp_') || k.startsWith('face_') || k.startsWith('explosion')) continue;
    if (k === 'fireball' || k === 'plasma' || k === 'rocket') continue;
    SPR[k] = outlineTex(SPR[k]);
  }
}
