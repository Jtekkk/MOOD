import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8103;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    const enemy = () => game.entities.find((e) => e.kind === 'enemy' && e.alive);
    const r = {};
    // normal kill: chip a zombie down, final small blow (no gib)
    let e = enemy(); e.hp = 6;
    game.particles = [];
    game._damageEnemy(e, 6, 'player');
    r.normalParticles = game.particles.length;
    r.normalNotGib = e.stateTime === 0;      // still plays the fall animation

    // overkill: a rocket-sized hit on a fresh zombie → gib
    e = game.entities.find((x) => x.kind === 'enemy' && x.alive && x !== e) || enemy();
    e.hp = 20;
    game.particles = [];
    game._damageEnemy(e, 110, 'player');
    r.gibParticles = game.particles.length;
    r.gibSnaps = e.stateTime >= 0.36;        // snapped to the gore frame
    r.moreGore = r.gibParticles > r.normalParticles * 2;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'normal kill = modest blood, plays fall anim': out.normalNotGib && out.normalParticles > 0,
    'overkill gibs (snaps to gore frame)': out.gibSnaps,
    'gib throws far more gore': out.moreGore,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'GIBS OK');
process.exit(errs.length ? 1 : 0);
