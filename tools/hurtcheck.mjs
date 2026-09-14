import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8102;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    const p = game.player; p.x = 10; p.y = 10; p.angle = 0; p.health = 100; p.armor = 0;
    const near = (a, b) => Math.abs(a - b) < 0.2;
    const r = {};
    // hit from directly ahead (+x, since angle 0 faces +x)
    p.hurtT = 0; game._damagePlayer(5, 12, 10); r.frontDir = p.hurtDir; r.frontSet = p.hurtT > 0.9 && near(p.hurtDir, 0);
    // hit from the player's right (world +y when facing +x)
    p.hurtT = 0; game._damagePlayer(5, 10, 12); r.rightDir = p.hurtDir; r.rightOk = near(p.hurtDir, Math.PI / 2);
    // hit from behind (-x)
    p.hurtT = 0; game._damagePlayer(5, 8, 10); r.backOk = near(Math.abs(p.hurtDir), Math.PI);
    // decays over time (clear monsters so nothing re-triggers it)
    game.entities = []; p.hurtT = 1;
    for (let i = 0; i < 60; i++) game.update(1 / 30);
    r.decays = p.hurtT === 0;
    return r;
  });

  // screenshot with an active marker from the right
  await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.state = 'playing'; game.player.hurtDir = Math.PI / 2; game.player.hurtT = 0.9; game.player.damageFlash = 0.3;
  });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${OUT}/hurt-marker.png` });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'hit from ahead → marker up (dir 0)': out.frontSet,
    'hit from the right → dir +90°': out.rightOk,
    'hit from behind → dir ±180°': out.backOk,
    'marker fades out': out.decays,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'HURT MARKER OK');
process.exit(errs.length ? 1 : 0);
