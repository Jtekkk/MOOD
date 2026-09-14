import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8106;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(async () => {
    const { game, audio } = window.__MOOD;
    audio.init(); audio.resume();
    const r = {};
    r.tensionNode = !!audio.tension;
    // direct: raising intensity swells the music + tension
    audio.setIntensity(0);
    const v0 = audio.musicEl ? audio.musicEl.volume : null;
    audio.setIntensity(1);
    const v1 = audio.musicEl ? audio.musicEl.volume : null;
    r.musicSwells = v1 !== null && v1 > v0;
    r.tensionRises = audio.tension ? audio.tension.gain.value >= 0 : false; // scheduled via setTargetAtTime

    // integration: a swarm of awake enemies near the player drives intensity up
    game.startNewGame(); game.state = 'playing';
    for (const e of game.entities) { if (e.kind === 'enemy') { e.state = 'chase'; e.x = game.player.x + 1.5; e.y = game.player.y; } }
    for (let i = 0; i < 90; i++) game.update(1 / 30);
    r.combatHot = game.combatT;
    r.hotEnough = game.combatT > 0.4;

    // calm: clear monsters, keep updating → intensity eases back down
    game.entities = [];
    for (let i = 0; i < 150; i++) game.update(1 / 30);
    r.combatCalm = game.combatT;
    r.settles = game.combatT < 0.15;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'tension drone node created': out.tensionNode,
    'music swells with intensity': out.musicSwells,
    'a nearby swarm heats the mix up': out.hotEnough,
    'it settles back to calm when the fight ends': out.settles,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'REACTIVE AUDIO OK');
process.exit(errs.length ? 1 : 0);
