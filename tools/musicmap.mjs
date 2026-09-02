import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8083;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.audio', null, { timeout: 8000 });
  // all 7 tracks serve as audio/mpeg
  const files = ['track1', 'track2', 'the_last_witch', 'gangsta_chiptune', 'waltz_kazoon_panic', 'glitch_grid_1', 'glitch_grid_2'];
  for (const f of files) {
    const ok = await page.evaluate(async (f) => { const r = await fetch('assets/music/' + f + '.mp3'); return r.status === 200 && /audio\/mpeg/.test(r.headers.get('content-type') || ''); }, f);
    if (!ok) errs.push('serve fail: ' + f);
  }
  // per-level mapping + a new track actually plays
  const map = await page.evaluate(async () => {
    const { game, audio } = window.__MOOD; audio.init(); game.startNewGame();
    const out = [];
    for (let lvl = 1; lvl <= 8; lvl++) {
      out.push({ lvl, src: (audio.musicEl.src || '').split('/').pop(), playing: !audio.musicEl.paused });
      if (lvl === 6) { await new Promise((r) => setTimeout(r, 600)); out[out.length - 1].adv = audio.musicEl.currentTime > 0; }
      game._exitLevel(); game.intermission = 1; window.__MOOD.input.pressed.add('Enter'); game.update(0.05); window.__MOOD.input.pressed.delete('Enter');
    }
    return out;
  });
  for (const m of map) console.log(`L${m.lvl} -> ${m.src}${m.adv !== undefined ? '  (currentTime advancing: ' + m.adv + ')' : ''}`);
  const l6 = map.find((m) => m.lvl === 6);
  if (l6.src !== 'glitch_grid_1.mp3') errs.push('L6 wrong track: ' + l6.src);
  if (!l6.adv) errs.push('L6 track did not advance');
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'MUSIC MAP OK');
process.exit(errs.length ? 1 : 0);
