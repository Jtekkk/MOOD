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

function techWall(seed, base = '#5a6b7a', panel = '#3c4a57', rivet = '#8595a4') {
  const { c, ctx } = makeCanvas(64, 64);
  const rng = mulberry32(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
  // recessed panels
  ctx.fillStyle = panel;
  ctx.fillRect(4, 4, 56, 26);
  ctx.fillRect(4, 34, 56, 26);
  // bevels
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(4, 4, 56, 2); ctx.fillRect(4, 34, 56, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(4, 28, 56, 2); ctx.fillRect(4, 58, 56, 2);
  // rivets
  ctx.fillStyle = rivet;
  for (const [x, y] of [[8, 8], [54, 8], [8, 56], [54, 56], [8, 38], [54, 38]]) {
    ctx.fillRect(x, y, 2, 2);
  }
  noiseOverlay(ctx, 64, 64, rng, 26);
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
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 700; i++) {
    const x = (rng() * 64) | 0, y = (rng() * 64) | 0;
    const v = (rng() - 0.5) * 50;
    ctx.fillStyle = `rgba(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0},0.6)`;
    ctx.fillRect(x, y, 1, 1);
  }
  // subtle tiling grid
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.strokeRect(0.5, 0.5, 63, 63);
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
  const { c, ctx } = makeCanvas(48, 56);
  const armOut = frame === 'attack';
  const leg = frame === 'walk1' ? 4 : 0;
  shadowEllipse(ctx, 24, 53, 14, 4);
  // legs
  ctx.fillStyle = '#3a4a2f';
  ctx.fillRect(18 - leg, 38, 6, 14); ctx.fillRect(24 + leg, 38, 6, 14);
  ctx.fillStyle = '#23170f';
  ctx.fillRect(17 - leg, 50, 8, 4); ctx.fillRect(24 + leg, 50, 8, 4);
  // torso (tattered uniform)
  ctx.fillStyle = '#586b3d'; ctx.fillRect(15, 22, 18, 18);
  ctx.fillStyle = '#3f4d2c'; ctx.fillRect(15, 22, 18, 4);
  ctx.fillStyle = '#7a2222'; ctx.fillRect(20, 30, 6, 8); // blood stain
  // arms / weapon
  ctx.fillStyle = '#586b3d';
  if (armOut) {
    ctx.fillRect(31, 24, 14, 5);   // raised arm
    ctx.fillStyle = '#222'; ctx.fillRect(43, 22, 5, 8); // gun
    ctx.fillStyle = '#ff0'; ctx.fillRect(46, 24, 3, 3); // muzzle flash
  } else {
    ctx.fillRect(12, 24, 4, 14); ctx.fillRect(32, 24, 4, 14);
  }
  // head
  ctx.fillStyle = '#9aa17e'; ctx.beginPath(); ctx.ellipse(24, 16, 7, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#11140d'; ctx.fillRect(20, 14, 3, 3); ctx.fillRect(26, 14, 3, 3); // eyes
  ctx.fillStyle = '#5a1414'; ctx.fillRect(21, 20, 7, 2); // grimace
  return texFrom(c, ctx);
}

function zombieDie(stage) {
  const { c, ctx } = makeCanvas(48, 56);
  shadowEllipse(ctx, 24, 53, 16, 4);
  const squash = stage; // 0..3 progressively flatter
  const top = 30 + squash * 6;
  ctx.fillStyle = '#586b3d';
  ctx.fillRect(8, top, 32, 52 - top);
  ctx.fillStyle = '#7a2222';
  ctx.fillRect(8, 50, 32, 4);
  if (stage >= 2) { ctx.fillStyle = '#9a2a2a'; ctx.fillRect(4, 51, 40, 3); }
  if (stage < 2) { // head still visible early
    ctx.fillStyle = '#9aa17e'; ctx.beginPath(); ctx.ellipse(24, top - 4, 6, 6, 0, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

// ----- enemy: imp ---------------------------------------------------------

function imp(frame) {
  const { c, ctx } = makeCanvas(48, 58);
  const leg = frame === 'walk1' ? 4 : 0;
  const attack = frame === 'attack';
  shadowEllipse(ctx, 24, 55, 15, 4);
  // legs
  ctx.fillStyle = '#6b3b22';
  ctx.fillRect(17 - leg, 40, 7, 14); ctx.fillRect(24 + leg, 40, 7, 14);
  // body
  ctx.fillStyle = '#8a4a28'; ctx.beginPath(); ctx.ellipse(24, 30, 12, 14, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b3b22'; ctx.fillRect(14, 26, 20, 3);
  // spikes on shoulders
  ctx.fillStyle = '#d8c8a0';
  ctx.beginPath(); ctx.moveTo(12, 22); ctx.lineTo(8, 14); ctx.lineTo(16, 20); ctx.fill();
  ctx.beginPath(); ctx.moveTo(36, 22); ctx.lineTo(40, 14); ctx.lineTo(32, 20); ctx.fill();
  // arms
  ctx.fillStyle = '#8a4a28';
  if (attack) {
    ctx.fillRect(30, 20, 14, 5);
    // fireball charge
    const g = ctx.createRadialGradient(44, 20, 1, 44, 20, 7);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fc6'); g.addColorStop(1, 'rgba(200,40,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(44, 20, 7, 0, 7); ctx.fill();
  } else {
    ctx.fillRect(11, 24, 5, 16); ctx.fillRect(32, 24, 5, 16);
  }
  // head
  ctx.fillStyle = '#8a4a28'; ctx.beginPath(); ctx.ellipse(24, 14, 8, 8, 0, 0, 7); ctx.fill();
  // horns
  ctx.fillStyle = '#d8c8a0';
  ctx.beginPath(); ctx.moveTo(18, 8); ctx.lineTo(14, 0); ctx.lineTo(21, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(30, 8); ctx.lineTo(34, 0); ctx.lineTo(27, 6); ctx.fill();
  ctx.fillStyle = '#ffcc33'; ctx.fillRect(19, 12, 4, 3); ctx.fillRect(25, 12, 4, 3); // eyes
  ctx.fillStyle = '#3a1a0a'; ctx.fillRect(20, 18, 8, 2);
  return texFrom(c, ctx);
}

function impDie(stage) { return genericDie(stage, '#8a4a28', '#3a1a0a'); }

// ----- enemy: demon (pinky) ----------------------------------------------

function demon(frame) {
  const { c, ctx } = makeCanvas(56, 48);
  const open = frame === 'attack';
  const leg = frame === 'walk1' ? 4 : 0;
  shadowEllipse(ctx, 28, 45, 20, 5);
  // legs
  ctx.fillStyle = '#b06a78';
  ctx.fillRect(10, 34, 8, 12); ctx.fillRect(38 - leg, 34, 8, 12);
  ctx.fillRect(20 + leg, 36, 7, 10);
  // body
  ctx.fillStyle = '#d98aa0'; ctx.beginPath(); ctx.ellipse(28, 26, 22, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#b06a78'; ctx.beginPath(); ctx.ellipse(28, 30, 22, 12, 0, 0, 7); ctx.fill();
  // head/mouth
  ctx.fillStyle = '#d98aa0'; ctx.beginPath(); ctx.ellipse(28, 18, 16, 12, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#7a1f2f';
  if (open) { ctx.beginPath(); ctx.ellipse(28, 22, 12, 9, 0, 0, 7); ctx.fill(); }
  else { ctx.fillRect(16, 22, 24, 4); }
  // teeth
  ctx.fillStyle = '#fff';
  for (let x = 17; x < 40; x += 5) { ctx.beginPath(); ctx.moveTo(x, open ? 16 : 22); ctx.lineTo(x + 2, open ? 22 : 26); ctx.lineTo(x + 4, open ? 16 : 22); ctx.fill(); }
  // eyes + horns
  ctx.fillStyle = '#ffe'; ctx.fillRect(18, 10, 5, 4); ctx.fillRect(33, 10, 5, 4);
  ctx.fillStyle = '#000'; ctx.fillRect(20, 11, 2, 2); ctx.fillRect(35, 11, 2, 2);
  ctx.fillStyle = '#e8e0c8';
  ctx.beginPath(); ctx.moveTo(14, 8); ctx.lineTo(8, 0); ctx.lineTo(18, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(42, 8); ctx.lineTo(48, 0); ctx.lineTo(38, 6); ctx.fill();
  return texFrom(c, ctx);
}

function demonDie(stage) { return genericDie(stage, '#d98aa0', '#7a1f2f'); }

// ----- enemy: cacodemon (floating ranged) ---------------------------------

function caco(frame) {
  const { c, ctx } = makeCanvas(56, 56);
  const attack = frame === 'attack';
  // floating: no ground shadow but a faint one far below
  shadowEllipse(ctx, 28, 53, 12, 3);
  const g = ctx.createRadialGradient(22, 22, 4, 28, 28, 26);
  g.addColorStop(0, '#d05a5a'); g.addColorStop(1, '#7a1f1f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(28, 26, 24, 0, 7); ctx.fill();
  // little horns / nubs
  ctx.fillStyle = '#9a2a2a';
  for (const a of [-1.4, -0.5, 0.5, 1.4]) {
    const x = 28 + Math.cos(a - 1.6) * 24, y = 26 + Math.sin(a - 1.6) * 24;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  // big eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(28, 22, 9, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = attack ? '#39f' : '#136'; ctx.beginPath(); ctx.arc(28, 22, 4, 0, 7); ctx.fill();
  // mouth
  ctx.fillStyle = '#2a0a0a'; ctx.beginPath(); ctx.ellipse(28, 38, attack ? 12 : 9, attack ? 8 : 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let x = 20; x < 37; x += 4) ctx.fillRect(x, 34, 2, 3);
  if (attack) {
    const fg = ctx.createRadialGradient(28, 44, 1, 28, 44, 8);
    fg.addColorStop(0, '#cff'); fg.addColorStop(0.5, '#39f'); fg.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(28, 46, 8, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

function cacoDie(stage) { return genericDie(stage, '#b04040', '#2a0a0a'); }

// Generic gib/melt death used by several monsters.
function genericDie(stage, body, dark) {
  const { c, ctx } = makeCanvas(56, 56);
  shadowEllipse(ctx, 28, 53, 18, 4);
  const top = 28 + stage * 6;
  ctx.fillStyle = body; ctx.fillRect(10, top, 36, 54 - top);
  ctx.fillStyle = dark; ctx.fillRect(10, 50, 36, 4);
  ctx.fillStyle = '#9a2a2a'; ctx.fillRect(6, 51, 44, 3);
  if (stage >= 2) {
    ctx.fillStyle = '#c33';
    for (let i = 0; i < 8; i++) ctx.fillRect(6 + i * 6, 49 + ((i % 2) ? 2 : 0), 3, 3);
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

function fpFist(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  const x = fire ? 70 : 120, y = fire ? 30 : 60;
  ctx.fillStyle = '#caa07a';
  ctx.fillRect(x, y, 56, 70);          // forearm
  ctx.fillStyle = '#b88a64';
  ctx.beginPath(); ctx.ellipse(x + 28, y, 30, 26, 0, 0, 7); ctx.fill(); // fist
  ctx.fillStyle = '#9a6a44';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 13, y - 18, 10, 12); // knuckles
  return texFrom(c, ctx);
}

function fpPistol(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  ctx.fillStyle = '#caa07a'; ctx.fillRect(86, 78, 30, 52); // hand
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(92, 40, 18, 50); // grip/body
  ctx.fillStyle = '#444'; ctx.fillRect(92, 36, 28, 12);    // slide
  ctx.fillStyle = '#111'; ctx.fillRect(116, 38, 8, 6);     // barrel
  if (fire) {
    const g = ctx.createRadialGradient(120, 41, 1, 120, 41, 22);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fe6'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(124, 41, 22, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

function fpShotgun(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  ctx.fillStyle = '#6b4a26'; ctx.fillRect(60, 60, 90, 16);    // stock/pump
  ctx.fillStyle = '#333'; ctx.fillRect(60, 48, 110, 12);      // barrel
  ctx.fillStyle = '#222'; ctx.fillRect(150, 50, 24, 8);       // muzzle
  ctx.fillStyle = '#caa07a'; ctx.fillRect(78, 72, 26, 40); ctx.fillRect(120, 70, 26, 40); // hands
  if (fire) {
    const g = ctx.createRadialGradient(176, 54, 1, 176, 54, 30);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fe6'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(178, 54, 28, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

function fpSuper(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(54, 64, 80, 20);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(54, 44, 120, 10);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(54, 56, 120, 10);
  ctx.fillStyle = '#222'; ctx.fillRect(168, 44, 16, 22);
  ctx.fillStyle = '#caa07a'; ctx.fillRect(70, 80, 28, 40); ctx.fillRect(112, 78, 28, 40);
  if (fire) {
    for (const cy of [49, 61]) {
      const g = ctx.createRadialGradient(184, cy, 1, 184, cy, 30);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fe8'); g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(186, cy, 26, 0, 7); ctx.fill();
    }
  }
  return texFrom(c, ctx);
}

function fpChaingun(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(70, 50, 30, 40);
  ctx.fillStyle = '#555';
  for (let i = 0; i < 4; i++) ctx.fillRect(100, 50 + i * 9, 70, 6); // barrels
  ctx.fillStyle = '#caa07a'; ctx.fillRect(64, 86, 26, 38); ctx.fillRect(96, 86, 24, 38);
  if (fire) {
    const yy = 52 + (Math.floor(Math.random() * 4)) * 9;
    const g = ctx.createRadialGradient(172, yy, 1, 172, yy, 20);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fe6'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(174, yy, 18, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

function fpRocket(fire) {
  const { c, ctx } = makeCanvas(200, 130);
  ctx.fillStyle = '#2a3a2a'; ctx.fillRect(50, 56, 130, 22);   // tube
  ctx.fillStyle = '#1a2a1a'; ctx.fillRect(170, 54, 16, 26);
  ctx.fillStyle = '#444'; ctx.fillRect(96, 50, 30, 8);        // sight
  ctx.fillStyle = '#caa07a'; ctx.fillRect(76, 74, 28, 44); ctx.fillRect(120, 74, 26, 44);
  if (fire) {
    const g = ctx.createRadialGradient(120, 67, 1, 120, 67, 30);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fd6'); g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(120, 78, 28, 0, 7); ctx.fill();
  }
  return texFrom(c, ctx);
}

// ----- HUD: the marine's face (status-bar mug) ----------------------------
// state: 0 healthy .. 4 near death; mood: 'fwd','left','right','ouch','grin','god','dead'
export function makeFace(state, mood) {
  const { c, ctx } = makeCanvas(48, 56);
  ctx.fillStyle = '#1a0d0d'; ctx.fillRect(0, 0, 48, 56);
  if (mood === 'dead') {
    ctx.fillStyle = '#7a1f1f'; ctx.fillRect(4, 30, 40, 24);
    ctx.fillStyle = '#b33'; for (let i = 0; i < 14; i++) ctx.fillRect(2 + i * 3, 28 + (i % 3) * 4, 3, 4);
    ctx.fillStyle = '#ddd'; ctx.fillRect(14, 40, 4, 4); ctx.fillRect(30, 40, 4, 4);
    return texFrom(c, ctx);
  }
  // skin gets paler / bloodier with damage
  const skinShades = ['#caa07a', '#c49770', '#bd8a64', '#b07050', '#9a5a44'];
  const skin = skinShades[Math.min(4, state)];
  // hair
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(8, 6, 32, 12);
  // face
  ctx.fillStyle = skin; ctx.fillRect(8, 14, 32, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(8, 14, 4, 34); ctx.fillRect(36, 14, 4, 34);
  // blood spatter with damage
  if (state >= 2) { ctx.fillStyle = '#9a2020'; ctx.fillRect(10, 18, 6, 3); ctx.fillRect(30, 22, 5, 4); }
  if (state >= 3) { ctx.fillStyle = '#b32020'; ctx.fillRect(20, 16, 8, 3); ctx.fillRect(14, 40, 6, 3); }
  // eyes: look direction
  let ex = 0;
  if (mood === 'left') ex = -3; else if (mood === 'right') ex = 3;
  ctx.fillStyle = '#fff'; ctx.fillRect(13, 24, 8, 6); ctx.fillRect(27, 24, 8, 6);
  ctx.fillStyle = (mood === 'god') ? '#fd0' : '#222';
  ctx.fillRect(16 + ex, 25, 3, 4); ctx.fillRect(30 + ex, 25, 3, 4);
  // brow
  ctx.fillStyle = '#3a2410';
  if (mood === 'ouch' || mood === 'grin') { ctx.fillRect(13, 22, 9, 2); ctx.fillRect(27, 22, 9, 2); }
  else { ctx.fillRect(13, 23, 8, 2); ctx.fillRect(27, 23, 8, 2); }
  // moustache
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(14, 36, 20, 4);
  // mouth
  ctx.fillStyle = '#3a1010';
  if (mood === 'grin') { ctx.fillRect(15, 41, 18, 4); ctx.fillStyle = '#fff'; ctx.fillRect(17, 41, 14, 2); }
  else if (mood === 'ouch') { ctx.fillRect(19, 41, 10, 6); }
  else { ctx.fillRect(17, 42, 14, 3); }
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

  // status-bar faces (5 damage states x moods)
  const moods = ['fwd', 'left', 'right', 'ouch', 'grin', 'god'];
  for (let s = 0; s < 5; s++) for (const m of moods) SPR[`face_${s}_${m}`] = makeFace(s, m);
  SPR.face_dead = makeFace(0, 'dead');

  // first-person weapons
  SPR.fp_fist = fpFist(false); SPR.fp_fist_fire = fpFist(true);
  SPR.fp_pistol = fpPistol(false); SPR.fp_pistol_fire = fpPistol(true);
  SPR.fp_shotgun = fpShotgun(false); SPR.fp_shotgun_fire = fpShotgun(true);
  SPR.fp_super = fpSuper(false); SPR.fp_super_fire = fpSuper(true);
  SPR.fp_chaingun = fpChaingun(false); SPR.fp_chaingun_fire = fpChaingun(true);
  SPR.fp_rocket = fpRocket(false); SPR.fp_rocket_fire = fpRocket(true);
}
