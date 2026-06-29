import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8088;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errors = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.audio', null, { timeout: 8000 });

  const out = await page.evaluate(async () => {
    const r = {};
    // server serves the mp3 with the right type
    const resp = await fetch('assets/music/track1.mp3');
    r.httpStatus = resp.status;
    r.contentType = resp.headers.get('content-type');

    const { game, audio } = window.__MOOD;
    audio.init();
    game.startNewGame();                       // → loadLevel(0) → playTrack(0)
    r.track0 = audio.curTrack;
    r.src0 = (audio.musicEl.src || '').split('/').pop();
    await new Promise((res) => setTimeout(res, 700));
    r.playing0 = !audio.musicEl.paused && audio.musicEl.currentTime > 0;

    // advance to level 2
    game._exitLevel(); game.intermission = 1; window.__MOOD.input.pressed.add('Enter'); game.update(0.05);
    r.level = game.map.name;
    r.track1 = audio.curTrack;
    r.src1 = (audio.musicEl.src || '').split('/').pop();

    // mute toggles the music element too
    const on1 = audio.toggleMute(); r.mutedAfterToggle = audio.musicEl.muted; r.enabled1 = on1;
    const on2 = audio.toggleMute(); r.unmuted = !audio.musicEl.muted; r.enabled2 = on2;
    return r;
  });
  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'mp3 served 200': out.httpStatus === 200,
    'mp3 content-type audio/mpeg': /audio\/mpeg/.test(out.contentType || ''),
    'level 1 → track 0': out.track0 === 0 && out.src0 === 'track1.mp3',
    'track actually plays (currentTime advances)': out.playing0 === true,
    'level 2 → track 1': out.track1 === 1 && out.src1 === 'track2.mp3' && /LEVEL 2/.test(out.level),
    'mute mutes music': out.mutedAfterToggle === true,
    'unmute restores music': out.unmuted === true,
  };
  let pass = 0;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); v ? pass++ : errors.push('FAIL ' + k); }
  console.log(`\n${pass}/${Object.keys(checks).length} checks passed`);
} catch (e) { errors.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED (${errors.length})` : 'MUSIC OK');
process.exit(errors.length ? 1 : 0);
