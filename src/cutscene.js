// cutscene.js — the scripted intro that plays before a new game:
//   1) a dropship streaks down and crashes into a facility on a hell-planet,
//   2) two imps drag the stunned marine into a cell,
//   3) he grabs a dropped pistol and guns them down through the bars,
//   4) the door bursts open and he escapes — hard cut into LEVEL 1.
// Drawn entirely on the 320x200 overlay (vector art + a couple of real game
// sprites), advanced purely by an elapsed-time clock so it's deterministic and
// fully skippable. Audio + shake are driven by CUT_CUES (fired by the Game).
import { RENDER_W as W, RENDER_H as H } from './raycaster.js';
import { SPR } from './assets.js';

export const CUT_DURATION = 17.5;

// time-stamped audio / shake cues the Game fires as the clock passes them
export const CUT_CUES = [
  { t: 1.4, sound: 'rocket' },
  { t: 3.3, sound: 'explosion', shake: 1.0 },
  { t: 3.7, sound: 'explosion', shake: 0.5 },
  { t: 7.7, sound: 'door', shake: 0.3 },
  { t: 10.5, sound: 'pistol' }, { t: 10.7, sound: 'monster_death' },
  { t: 11.4, sound: 'pistol' }, { t: 11.6, sound: 'monster_death' },
  { t: 14.0, sound: 'door', shake: 0.45 },
];

// ---- small drawing helpers -------------------------------------------------
const _tmp = {};
function blit(ctx, tex, dx, dy, s, flip) {
  if (!tex) return;
  let cv = _tmp[tex.w + 'x' + tex.h] || (_tmp[tex.w + 'x' + tex.h] = document.createElement('canvas'));
  cv.width = tex.w; cv.height = tex.h;
  const c2 = cv.getContext('2d');
  c2.putImageData(new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h), 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(dx + tex.w * s, dy); ctx.scale(-1, 1); ctx.drawImage(cv, 0, 0, tex.w * s, tex.h * s); }
  else ctx.drawImage(cv, dx, dy, tex.w * s, tex.h * s);
  ctx.restore();
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
// cheap deterministic hash → pseudo-random in [0,1)
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function caption(ctx, text, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - 30, W, 22);
  ctx.textAlign = 'center'; ctx.font = '9px monospace';
  ctx.fillStyle = '#ffd9a0'; ctx.fillText(text, W / 2, H - 15);
  ctx.restore();
}

function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 160);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---- scene 1: the crash ----------------------------------------------------
function sceneCrash(ctx, t) {
  // hell sky: deep maroon overhead → molten orange at the horizon
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0608'); g.addColorStop(0.55, '#5e1410'); g.addColorStop(0.8, '#c0431a'); g.addColorStop(1, '#f0902a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const horizon = 128;
  // drifting embers
  for (let i = 0; i < 40; i++) {
    const x = (rnd(i) * W + t * (8 + rnd(i + 9) * 20)) % W;
    const y = (H - ((t * (10 + rnd(i + 3) * 30) + rnd(i) * H) % H));
    ctx.fillStyle = `rgba(255,${140 + (rnd(i) * 80 | 0)},60,${0.3 + rnd(i + 1) * 0.5})`;
    ctx.fillRect(x | 0, y | 0, 1, 1 + (rnd(i + 5) > 0.7 ? 1 : 0));
  }
  // jagged mountain ranges (two parallax layers)
  const range = (baseY, amp, step, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += step) { const h = baseY - (rnd(x * 0.13 + baseY) * amp); ctx.lineTo(x, h); }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  range(horizon - 6, 34, 26, '#2a0c0a');
  range(horizon + 6, 22, 16, '#170606');
  // molten ground
  ctx.fillStyle = '#180404'; ctx.fillRect(0, horizon + 20, W, H - horizon - 20);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(255,${90 + rnd(i) * 90 | 0},20,0.5)`; ctx.fillRect((rnd(i) * W) | 0, horizon + 24 + (rnd(i + 2) * 30 | 0), 30 + rnd(i) * 50, 1); }

  // the facility on the right: dark blocky silhouette + a comms tower + windows
  const fac = () => {
    ctx.fillStyle = '#0c0a0c';
    ctx.fillRect(196, 84, 96, 60); ctx.fillRect(214, 66, 40, 22); ctx.fillRect(268, 58, 12, 30);
    ctx.fillRect(272, 40, 4, 20);                       // antenna
    ctx.fillStyle = '#3a2a12';
    for (let wy = 92; wy < 138; wy += 10) for (let wx = 204; wx < 286; wx += 12)
      if (rnd(wx + wy) > 0.35) ctx.fillRect(wx, wy, 5, 4);
  };

  const flash = t > 3.3 && t < 3.6 ? (3.6 - t) / 0.3 : 0;
  if (t < 3.3) {
    fac();
    // dropship: an arc from top-left to the facility, fire trail behind it
    const p = clamp01((t - 0.6) / 2.7);
    const sx = lerp(-20, 232, p), sy = lerp(6, 96, p * p);
    // trail
    for (let k = 1; k < 16; k++) {
      const q = p - k * 0.012; if (q < 0) break;
      const tx = lerp(-20, 232, q), ty = lerp(6, 96, q * q);
      ctx.fillStyle = `rgba(255,${170 - k * 6},40,${0.7 - k * 0.04})`;
      ctx.fillRect(tx - 1, ty - 1, 3 + (16 - k) * 0.2, 2);
    }
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.5);
    ctx.fillStyle = '#b8bcc4'; ctx.fillRect(-8, -3, 16, 6);      // hull
    ctx.fillStyle = '#7a8088'; ctx.fillRect(-10, -1, 4, 2);      // nose
    ctx.fillStyle = '#5a6068'; ctx.fillRect(2, -5, 5, 3); ctx.fillRect(2, 2, 5, 3); // fins
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(-2, -1, 3, 2);       // cockpit glow
    ctx.restore();
  } else {
    // impact: growing fireball + debris, facility half-lit by the blast
    fac();
    const e = t - 3.3, rad = Math.min(70, 10 + e * 90);
    const fg = ctx.createRadialGradient(230, 96, 2, 230, 96, rad);
    fg.addColorStop(0, 'rgba(255,255,220,0.95)'); fg.addColorStop(0.35, 'rgba(255,180,40,0.9)');
    fg.addColorStop(0.7, 'rgba(220,70,20,0.7)'); fg.addColorStop(1, 'rgba(80,20,10,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(230, 96, rad, 0, 7); ctx.fill();
    for (let i = 0; i < 24; i++) {
      const a = rnd(i) * 6.28, d = e * (40 + rnd(i + 1) * 120);
      ctx.fillStyle = rnd(i) > 0.5 ? '#ffce5a' : '#1a1210';
      ctx.fillRect(230 + Math.cos(a) * d, 96 + Math.sin(a) * d * 0.7, 2, 2);
    }
    // rising smoke column
    ctx.fillStyle = 'rgba(30,20,18,0.6)';
    ctx.beginPath(); ctx.ellipse(232, 70 - e * 6, 20 + e * 4, 26 + e * 6, 0, 0, 7); ctx.fill();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,240,200,${flash})`; ctx.fillRect(0, 0, W, H); }
  vignette(ctx);
  caption(ctx, t < 3.2 ? 'The UAC dropship never reached the landing pad.'
    : 'You came to in the wreckage. So did they.', t < 3.2 ? clamp01(t - 0.5) : clamp01(t - 3.6));
}

// ---- scene 2: dragged to the cell ------------------------------------------
function sceneDrag(ctx, t) {
  // s = local time 0..4
  const s = t - 4.5;
  ctx.fillStyle = '#0a0808'; ctx.fillRect(0, 0, W, H);
  // clammy stone corridor: floor + back wall + a barred cell on the right
  ctx.fillStyle = '#1c1518'; ctx.fillRect(0, 120, W, H - 120);          // floor
  ctx.fillStyle = '#241a1e'; ctx.fillRect(0, 40, W, 80);               // back wall
  for (let x = 0; x < W; x += 24) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, 40, 1, 80); }
  // torches with flicker
  for (const tx of [40, 150, 260]) {
    const fl = 0.6 + 0.4 * Math.sin(t * 12 + tx);
    ctx.fillStyle = '#3a2a10'; ctx.fillRect(tx, 60, 3, 12);
    const gg = ctx.createRadialGradient(tx + 1, 58, 1, tx + 1, 58, 16);
    gg.addColorStop(0, `rgba(255,180,60,${0.8 * fl})`); gg.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(tx + 1, 56, 16, 0, 7); ctx.fill();
  }
  // the cell (right side): dark recess + vertical bars
  ctx.fillStyle = '#050405'; ctx.fillRect(250, 44, 62, 92);
  ctx.strokeStyle = '#6a6a72'; ctx.lineWidth = 2;
  for (let bx = 256; bx < 312; bx += 8) { ctx.beginPath(); ctx.moveTo(bx, 44); ctx.lineTo(bx, 136); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(250, 80); ctx.lineTo(312, 80); ctx.stroke();

  // the procession slides left→right and stops at the cell (s: 0..3), then the
  // marine is shoved in and the door clangs (~s=3.2)
  const march = clamp01(s / 3);
  const gx = lerp(-40, 210, march);
  const bob = Math.sin(s * 9) * 2;
  const impSil = (x, lead) => {
    ctx.fillStyle = '#7a2f14';
    ctx.beginPath(); ctx.ellipse(x, 108 + bob, 8, 13, 0, 0, 7); ctx.fill();     // torso
    ctx.fillStyle = '#8a3a18'; ctx.beginPath(); ctx.arc(x + (lead ? 3 : -1), 92 + bob, 6, 0, 7); ctx.fill(); // head
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x - 2 + (lead ? 3 : -1), 90 + bob, 2, 1); ctx.fillRect(x + 1 + (lead ? 3 : -1), 90 + bob, 2, 1); // horns
    ctx.strokeStyle = '#7a2f14'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x + (lead ? 8 : -8), 122 + bob); ctx.stroke();  // legs stride
    ctx.lineCap = 'butt';
  };
  if (s < 3.15) {
    // marine slumped between the two imps, boots dragging
    ctx.save(); ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#3f5a3a'; ctx.fillRect(gx - 6, 112, 20, 9);      // torso, horizontal
    ctx.fillStyle = '#d8b088'; ctx.beginPath(); ctx.arc(gx - 8, 116, 4, 0, 7); ctx.fill(); // lolling head
    ctx.fillStyle = '#243018'; ctx.fillRect(gx + 12, 118, 8, 4);      // dragging boots
    ctx.restore();
    impSil(gx - 12, false);   // rear imp (pulling under the arms)
    impSil(gx + 20, true);    // lead imp
  } else {
    // shoved in — the marine is now behind the bars, imps turn away
    const push = clamp01((s - 3.15) / 0.5);
    ctx.fillStyle = '#3f5a3a'; ctx.fillRect(lerp(232, 274, push), 108, 12, 20);
    ctx.fillStyle = '#d8b088'; ctx.beginPath(); ctx.arc(lerp(238, 280, push), 104, 4, 0, 7); ctx.fill();
    impSil(238, true);
    if (s > 3.4) { ctx.fillStyle = `rgba(0,0,0,${clamp01((s - 3.4) / 0.4)})`; ctx.fillRect(0, 0, W, H); } // fade out
  }
  vignette(ctx);
  caption(ctx, 'Two of them hauled you off to a cell — meat for later.', clamp01(s - 0.3));
}

// ---- scene 3: the cell, grab the gun, gun them down ------------------------
function sceneCell(ctx, t) {
  const s = t - 8.5;                          // 0..5
  // dim cell interior
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0d10'); g.addColorStop(1, '#04070a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0e1418'; ctx.fillRect(0, 132, W, H - 132);        // floor
  // corridor light beyond the bars
  const gg = ctx.createRadialGradient(W / 2, 96, 8, W / 2, 96, 130);
  gg.addColorStop(0, 'rgba(90,70,40,0.5)'); gg.addColorStop(1, 'rgba(20,14,10,0)');
  ctx.fillStyle = gg; ctx.fillRect(0, 0, W, 140);

  // two imps standing just outside the bars (real sprites), until shot
  const impDead = [s > 2.0, s > 2.9];
  const impFall = (i) => impDead[i] ? clamp01((s - (i ? 2.9 : 2.0)) / 0.5) : 0;
  const drawImp = (i, x) => {
    const fall = impFall(i);
    const walk = SPR.imp_walk0, pain = SPR.imp_pain || SPR.imp_walk0;
    const tex = fall > 0 ? (SPR.imp_die1 || pain) : walk;
    const sc = 1.7, dy = 44 + fall * 40, alpha = 1 - fall * 0.4;
    ctx.save(); ctx.globalAlpha = alpha; blit(ctx, tex, x, dy, sc); ctx.restore();
  };
  if (s > 0.4) { drawImp(0, 70); drawImp(1, 176); }

  // muzzle flashes from the pistol
  const flashAt = (ft) => s > ft && s < ft + 0.12;
  if (flashAt(2.0) || flashAt(2.9)) {
    const mx = W / 2, my = 150;
    const fg = ctx.createRadialGradient(mx, my, 1, mx, my, 40);
    fg.addColorStop(0, 'rgba(255,244,200,0.9)'); fg.addColorStop(0.5, 'rgba(255,200,90,0.6)'); fg.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(mx, my, 40, 0, 7); ctx.fill();
  }

  // vertical prison bars across the whole view (foreground)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 34, W, 4);
  for (let bx = 24; bx < W; bx += 34) {
    const bg2 = ctx.createLinearGradient(bx - 3, 0, bx + 3, 0);
    bg2.addColorStop(0, '#20242a'); bg2.addColorStop(0.5, '#7a808a'); bg2.addColorStop(1, '#20242a');
    ctx.fillStyle = bg2; ctx.fillRect(bx - 3, 34, 6, 118);
  }

  // the dropped pistol rises into view and steadies (first-person)
  const raise = clamp01((s - 0.6) / 0.8);
  const py = lerp(H + 30, H - 44, raise) + (s > 1.4 ? Math.sin(s * 3) * 1.5 : 0);
  const kick = (flashAt(2.0) || flashAt(2.9)) ? 6 : 0;
  blit(ctx, (flashAt(2.0) || flashAt(2.9)) ? (SPR.fp_pistol_fire || SPR.fp_pistol) : SPR.fp_pistol,
    W / 2 - 40, py + kick, 0.9);

  vignette(ctx);
  const cap = s < 2.4 ? 'They should have taken the gun off you first.' : 'COME GET SOME.';
  caption(ctx, cap, s < 0.5 ? clamp01(s * 2) : 1);
}

// ---- scene 4: the escape ---------------------------------------------------
function sceneEscape(ctx, t) {
  const s = t - 13.5;                          // 0..4
  ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, W, H);
  // the cell door swings open; a bright corridor rushes toward us
  const open = clamp01(s / 1.2);
  // corridor glow growing to fill the frame (moving forward)
  const grow = clamp01((s - 0.6) / 2.6);
  const r = lerp(20, 260, grow);
  const cg = ctx.createRadialGradient(W / 2, 100, 4, W / 2, 100, r);
  cg.addColorStop(0, 'rgba(255,230,180,0.95)'); cg.addColorStop(0.5, 'rgba(210,120,50,0.5)'); cg.addColorStop(1, 'rgba(10,8,8,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(W / 2, 100, r, 0, 7); ctx.fill();
  // the two bar-halves swinging apart
  ctx.save(); ctx.globalAlpha = 1 - grow * 0.7;
  const gap = open * 70;
  for (const [dir, sign] of [[0, -1], [1, 1]]) {
    for (let k = 0; k < 5; k++) {
      const bx = W / 2 + sign * (10 + k * 8) + sign * gap;
      ctx.fillStyle = '#6a707a'; ctx.fillRect(bx - 2, 30, 4, 130);
    }
  }
  ctx.restore();
  // white-out into the level
  if (s > 3.0) { ctx.fillStyle = `rgba(255,244,220,${clamp01((s - 3.0) / 0.5)})`; ctx.fillRect(0, 0, W, H); }
  vignette(ctx);
  caption(ctx, 'Time to shoot your way out of hell.', clamp01(s - 0.4) * (s < 3 ? 1 : 0));
}

// ---- master dispatch -------------------------------------------------------
export function drawCutscene(ctx, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (t < 4.5) sceneCrash(ctx, t);
  else if (t < 8.5) sceneDrag(ctx, t);
  else if (t < 13.5) sceneCell(ctx, t);
  else sceneEscape(ctx, t);
  // opening fade-in from black
  if (t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.8})`; ctx.fillRect(0, 0, W, H); }
  // skip hint
  ctx.textAlign = 'right'; ctx.font = '7px monospace';
  ctx.fillStyle = (Math.sin(t * 5) > 0) ? 'rgba(255,220,150,0.7)' : 'rgba(150,140,120,0.5)';
  ctx.fillText('ENTER / FIRE to skip', W - 6, H - 4);
}
