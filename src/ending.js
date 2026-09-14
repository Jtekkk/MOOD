// ending.js — the escape cutscene that plays after the final boss falls:
//   1) the marine crosses the hell-planet landing pad to a waiting dropship,
//   2) the engines ignite and it lifts off in a wash of flame,
//   3) flying away, he lights a cigarette and watches the red planet shrink.
// Drawn on the 320x200 overlay, time-driven and skippable. The LEVEL 10 track
// (alien.mp3) keeps playing under it. Then the victory screen.
import { RENDER_W as W, RENDER_H as H } from './raycaster.js';

export const END_DURATION = 16.5;

// time-stamped audio / shake cues the Game fires as the clock passes them
export const END_CUES = [
  { t: 4.6, sound: 'rocket' },
  { t: 5.0, sound: 'explosion', shake: 0.7 },
  { t: 5.4, sound: 'rocket', shake: 0.4 },
  { t: 8.7, sound: 'rocket' },
];

const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function caption(ctx, text, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - 30, W, 22);
  ctx.textAlign = 'center'; ctx.font = '9px monospace'; ctx.fillStyle = '#ffd9a0';
  ctx.fillText(text, W / 2, H - 15);
  ctx.restore();
}
function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 165);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function embers(ctx, t) {
  for (let i = 0; i < 34; i++) {
    const x = (rnd(i) * W + t * (6 + rnd(i + 9) * 16)) % W;
    const y = H - ((t * (8 + rnd(i + 3) * 26) + rnd(i) * H) % H);
    ctx.fillStyle = `rgba(255,${140 + (rnd(i) * 80 | 0)},60,${0.3 + rnd(i + 1) * 0.5})`;
    ctx.fillRect(x | 0, y | 0, 1, 1 + (rnd(i + 5) > 0.7 ? 1 : 0));
  }
}
// a chunky lander: pod body, cockpit glow, fins, legs
function ship(ctx, cx, cy, s, flame) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  if (flame > 0) {   // exhaust plume below
    const fg = ctx.createLinearGradient(0, 16, 0, 16 + 40 * flame);
    fg.addColorStop(0, 'rgba(255,255,220,0.95)'); fg.addColorStop(0.4, 'rgba(255,180,50,0.85)'); fg.addColorStop(1, 'rgba(220,60,20,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-9, 16); ctx.lineTo(9, 16); ctx.lineTo(4, 16 + 44 * flame); ctx.lineTo(-4, 16 + 44 * flame); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#6a7078'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, 7); ctx.fill();     // hull
  ctx.fillStyle = '#454b52'; ctx.fillRect(-15, 0, 30, 8);                                          // belly band
  ctx.fillStyle = '#8a9098'; ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(-22, 8); ctx.lineTo(-12, 6); ctx.closePath(); ctx.fill();  // fins
  ctx.beginPath(); ctx.moveTo(15, -2); ctx.lineTo(22, 8); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2e33'; ctx.fillRect(-6, 14, 3, 8); ctx.fillRect(3, 14, 3, 8);                // legs
  const cg = ctx.createRadialGradient(0, -4, 1, 0, -4, 8);
  cg.addColorStop(0, '#eaffff'); cg.addColorStop(0.6, '#6ad0ff'); cg.addColorStop(1, 'rgba(40,120,220,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, -4, 7, 5, 0, 0, 7); ctx.fill();              // cockpit glow
  ctx.restore();
}

// ---- scene 1: crossing the landing pad -------------------------------------
function scenePad(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0608'); g.addColorStop(0.55, '#5e1410'); g.addColorStop(0.82, '#c0431a'); g.addColorStop(1, '#f0902a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  embers(ctx, t);
  // distant facility silhouette (left) + jagged ridge
  ctx.fillStyle = '#160606'; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 120 - rnd(x * 0.11) * 22); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0c0a0c'; ctx.fillRect(18, 78, 70, 46); ctx.fillRect(34, 62, 30, 18); ctx.fillRect(80, 52, 8, 24);
  // landing pad (right) + the parked ship
  ctx.fillStyle = '#241c1a'; ctx.fillRect(150, 138, W - 150, H - 138);
  ctx.strokeStyle = 'rgba(255,180,80,0.5)'; ctx.lineWidth = 1;
  for (let x = 160; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x + 8, 140); ctx.stroke(); }
  ship(ctx, 250, 118, 1.5, 0);
  // the marine strides across the pad toward the ship
  const march = clamp01(t / 4.2);
  const mx = lerp(30, 224, march), my = 132 + Math.sin(t * 8) * 1.5;
  if (t < 4.4) {
    ctx.fillStyle = '#3f5a3a'; ctx.fillRect(mx - 4, my - 14, 8, 14);            // torso
    ctx.fillStyle = '#d8b088'; ctx.beginPath(); ctx.arc(mx, my - 17, 3, 0, 7); ctx.fill();  // head
    ctx.strokeStyle = '#243018'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const sw = Math.sin(t * 8) * 3;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - sw, my + 8); ctx.moveTo(mx, my); ctx.lineTo(mx + sw, my + 8); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  vignette(ctx);
  caption(ctx, 'The Gumbird is dead. Hell goes quiet — for now.', clamp01(t - 0.4));
}

// ---- scene 2: liftoff -------------------------------------------------------
function sceneLiftoff(ctx, t) {
  const s = t - 4.5;   // 0..4
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#12060a'); g.addColorStop(0.6, '#4a1210'); g.addColorStop(1, '#a83a18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  embers(ctx, t);
  ctx.fillStyle = '#241c1a'; ctx.fillRect(150, 150, W - 150, H - 150);          // pad
  // billowing dust as it lifts
  const rise = clamp01(s / 3.2);
  ctx.fillStyle = `rgba(60,40,30,${0.5 * (1 - rise)})`;
  ctx.beginPath(); ctx.ellipse(250, 156, 40 + s * 10, 14, 0, 0, 7); ctx.fill();
  const shy = lerp(118, -30, rise * rise), flame = 0.5 + 0.5 * Math.sin(t * 30);
  ship(ctx, 250, shy, lerp(1.5, 1.0, rise), 0.6 + 0.4 * flame);
  if (s < 0.4) { ctx.fillStyle = `rgba(255,240,200,${(0.4 - s) / 0.4})`; ctx.fillRect(0, 0, W, H); }  // ignition flash
  vignette(ctx);
  caption(ctx, 'Time to go home.', clamp01(s - 0.2));
}

// ---- scene 3: flying away, lighting a cigarette -----------------------------
function sceneCockpit(ctx, t) {
  const s = t - 8.5;   // 0..5
  // space + the shrinking hell-planet through the windshield
  ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { const x = (rnd(i) * W) | 0, y = (rnd(i + 50) * (H - 40)) | 0; ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd(i) * 0.6})`; ctx.fillRect(x, y, 1, 1); }
  const pr = lerp(26, 5, clamp01(s / 4.5));   // planet shrinks as we pull away
  const pg = ctx.createRadialGradient(232 - s * 2, 44, 2, 236, 46, pr);
  pg.addColorStop(0, '#ff7a3a'); pg.addColorStop(0.6, '#a8281a'); pg.addColorStop(1, '#3a0a08');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(236, 46, pr, 0, 7); ctx.fill();

  // cockpit interior framing (dark) + glowing dashboard
  ctx.fillStyle = '#0a0c10';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(46, 0); ctx.lineTo(30, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();   // left pillar
  ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W - 40, 0); ctx.lineTo(W - 24, H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();  // right pillar
  ctx.fillStyle = '#14181e'; ctx.fillRect(0, H - 46, W, 46);                    // dashboard
  ctx.fillStyle = '#1c2028'; ctx.fillRect(0, H - 46, W, 3);
  for (let i = 0; i < 9; i++) { ctx.fillStyle = ['#39d6e6', '#46e070', '#f0c030', '#e8503a'][(i + (t * 3 | 0)) & 3]; ctx.fillRect(30 + i * 26, H - 30, 6, 3); }
  const wheel = ctx.createLinearGradient(0, H - 20, 0, H); wheel.addColorStop(0, '#2a2e36'); wheel.addColorStop(1, '#14171c');
  ctx.fillStyle = wheel; ctx.fillRect(W / 2 - 40, H - 18, 80, 18);             // yoke

  // the marine in profile (right side), raising a cigarette to his mouth
  const hx = W / 2 + 34, hy = H - 78;
  ctx.fillStyle = '#3f5a3a'; ctx.fillRect(hx - 4, hy + 8, 22, 30);            // shoulder/torso
  ctx.fillStyle = '#d8b088'; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fill();     // head (facing left, toward the view)
  ctx.fillStyle = '#243018'; ctx.beginPath(); ctx.arc(hx + 2, hy - 4, 9, -0.6, 0.9); ctx.fill();  // hair/helmet back
  // the cigarette at his mouth + glowing ember + curling smoke
  const cigX = hx - 9, cigY = hy + 2;
  ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cigX, cigY); ctx.lineTo(cigX - 6, cigY + 1); ctx.stroke();  // the cigarette
  const glow = 0.6 + 0.4 * Math.sin(t * 6);
  const eg = ctx.createRadialGradient(cigX - 6, cigY + 1, 0, cigX - 6, cigY + 1, 3.5);
  eg.addColorStop(0, `rgba(255,${180 + glow * 60 | 0},80,${0.9})`); eg.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cigX - 6, cigY + 1, 3.5, 0, 7); ctx.fill();
  // hand holding it
  ctx.fillStyle = '#d8b088'; ctx.beginPath(); ctx.arc(cigX - 1, cigY + 4, 2.5, 0, 7); ctx.fill();
  // rising smoke curl (drifts up from the ember)
  ctx.strokeStyle = 'rgba(210,210,220,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let k = 0; k < 26; k++) { const yy = cigY - k * 2.2, xx = cigX - 6 + Math.sin(t * 2 + k * 0.5) * (2 + k * 0.25); k === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy); }
  ctx.stroke();

  vignette(ctx);
  const cap = s < 2.6 ? 'You climb in and light one up.' : 'Rebuilding will be more fun than saving it.';
  caption(ctx, cap, s < 0.5 ? clamp01(s * 2) : 1);
}

export function drawEnding(ctx, t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (t < 4.5) scenePad(ctx, t);
  else if (t < 8.5) sceneLiftoff(ctx, t);
  else sceneCockpit(ctx, t);
  if (t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.8})`; ctx.fillRect(0, 0, W, H); }         // fade in
  if (t > END_DURATION - 1.2) { ctx.fillStyle = `rgba(0,0,0,${clamp01((t - (END_DURATION - 1.2)) / 1.2)})`; ctx.fillRect(0, 0, W, H); }  // fade out
  ctx.textAlign = 'right'; ctx.font = '7px monospace';
  ctx.fillStyle = (Math.sin(t * 5) > 0) ? 'rgba(255,220,150,0.7)' : 'rgba(150,140,120,0.5)';
  ctx.fillText('ENTER / FIRE to skip', W - 6, H - 4);
}
