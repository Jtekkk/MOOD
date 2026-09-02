// main.js — bootstrap, input wiring, fixed-timestep-ish loop, render dispatch.
import { buildAssets, SPR, TEX, FACE_MOODS } from './assets.js';
import { Renderer, RENDER_W, RENDER_H } from './raycaster.js';
import { Input } from './input.js';
import { initTouch } from './touch.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import {
  blitWeapon, drawStatusBar, drawMessages, drawCrosshair, drawTints, drawVignette, drawAutomap,
  drawTitle, drawPause, drawDead, drawIntermission, drawVictory, drawSettings, drawBossBar,
} from './hud.js';
import { drawCutscene } from './cutscene.js';

const canvas = document.getElementById('screen');
const loading = document.getElementById('loading');

function resize() {
  const scale = Math.max(1, Math.min(
    Math.floor(window.innerWidth / RENDER_W),
    Math.floor(window.innerHeight / RENDER_H)
  ));
  canvas.width = RENDER_W * scale;
  canvas.height = RENDER_H * scale;
}
window.addEventListener('resize', resize);
resize();

buildAssets();

const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioEngine();
audio.setTracks([
  'assets/music/track1.mp3',            // L1
  'assets/music/track2.mp3',            // L2
  'assets/music/the_last_witch.mp3',    // L3
  'assets/music/gangsta_chiptune.mp3',  // L4
  'assets/music/waltz_kazoon_panic.mp3',// L5
  'assets/music/glitch_grid_1.mp3',     // L6
  'assets/music/glitch_grid_2.mp3',     // L7  (L8 wraps to track1)
]);
const game = new Game(renderer, input, audio);
if (loading) loading.style.display = 'none';

function ensureAudio() { audio.init(); audio.resume(); game.applySettings(); }

// On-screen controls for touch devices (no-op on desktop).
const touchUI = initTouch(input, game, {
  unlockAudio: ensureAudio,
  toggleMap: () => { if (game.state === 'playing' || game.state === 'paused') game.showMap = !game.showMap; },
  pause: () => {
    if (game.state === 'playing') { game.state = 'paused'; input.exitLock(); }
    else if (game.state === 'paused') { game.state = 'playing'; }
  },
});

function startGame() {
  ensureAudio();
  game.startIntro();      // play the intro cutscene, then drop into LEVEL 1
  input.requestLock();
}

canvas.addEventListener('mousedown', () => {
  ensureAudio();
  if (game.state === 'title') { startGame(); return; }
  if (game.state === 'paused') { game.state = 'playing'; input.requestLock(); return; }
  if (game.state === 'victory') { game.state = 'title'; return; }
  if (game.state === 'playing' && !input.locked) input.requestLock();
});

document.addEventListener('pointerlockchange', () => {
  if (!input.locked && game.state === 'playing') game.state = 'paused';
});

let cheatBuf = '';
window.addEventListener('keydown', (e) => {
  ensureAudio();
  if (e.code === 'KeyM') { const on = audio.toggleMute(); game.message(on ? 'sound on' : 'sound off'); }
  if (e.code === 'KeyO' && (game.state === 'title' || game.state === 'paused')) game.openSettings(game.state);
  if (e.code === 'Tab' && (game.state === 'playing' || game.state === 'paused')) game.showMap = !game.showMap;
  if (e.code === 'Escape' && game.state === 'playing') { game.state = 'paused'; input.exitLock(); }
  // cheat codes: keep a short buffer of typed letters and match a code
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
    cheatBuf = (cheatBuf + e.key.toLowerCase()).slice(-8);
    if (cheatBuf.endsWith('stfl')) { game.cheatNextLevel(); cheatBuf = ''; }
    else if (cheatBuf.endsWith('sauce')) { game.cheatSausage(); cheatBuf = ''; }
  }
});

function render() {
  const octx = renderer.octx;
  switch (game.state) {
    case 'title': drawTitle(octx, game.timer); renderer.presentOverlay(); return;
    case 'intro': drawCutscene(octx, game.cutT); renderer.presentOverlay(); return;
    case 'settings': drawSettings(octx, game); renderer.presentOverlay(); return;
    case 'intermission': drawIntermission(octx, game); renderer.presentOverlay(); return;
    case 'victory': drawVictory(octx, game.timer); renderer.presentOverlay(); return;
    default: break;
  }
  // world states: playing / paused / dead
  renderer.clear();
  renderer.renderWorld(game);
  blitWeapon(renderer, game);
  const ctx = renderer.beginOverlay();
  drawVignette(ctx);
  drawTints(ctx, game);
  if (game.showMap) drawAutomap(ctx, game);
  else if (game.state === 'playing') drawCrosshair(ctx);
  drawBossBar(ctx, game);
  drawStatusBar(ctx, game);
  drawMessages(ctx, game);
  if (game.state === 'paused') drawPause(ctx);
  if (game.state === 'dead') drawDead(ctx, game);
  renderer.presentOverlay();
}

let last = performance.now();
let acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;          // clamp big stalls

  input.pollGamepad();
  // Gamepad Start: pause/resume from gameplay, or back out of menus, mirroring Esc.
  if (input.padStartEdge) {
    if (game.state === 'playing') { game.state = 'paused'; input.exitLock(); }
    else if (game.state === 'paused') { game.state = 'playing'; input.requestLock(); }
  }
  // Gamepad confirm (A → synthetic Enter) starts / advances the front-end flow.
  if (input.hasGamepad && input.justPressed('Enter')) {
    if (game.state === 'title') { ensureAudio(); startGame(); }
    else if (game.state === 'paused') { game.state = 'playing'; input.requestLock(); }
    else if (game.state === 'victory') { game.state = 'title'; }
  }

  game.update(dt);
  // global menu keys not handled inside Game
  if (game.state === 'title' && input.justPressed('Enter')) startGame();
  if (game.state === 'victory' && (input.justPressed('Enter') || input.justPressed('Space'))) game.state = 'title';

  if (touchUI) touchUI.update(game.state);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose for debugging / headless screenshot harness
window.__MOOD = { game, renderer, input, audio, SPR, TEX, FACE_MOODS };
