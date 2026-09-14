import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8097;
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
    game.startNewGame(); game.loadLevel(2);   // THE ASCENT
    // an enemy in the pool trying to chase the player north THROUGH the tall
    // water wall (rows 1-2 are h=1.6) must be stopped by the ledge.
    const def = window.__MOOD.game.map; // not used, keep ref
    const e = game.entities.find((x) => x.kind === 'enemy');
    // direct collision test: shove the enemy north into the tall water wall
    e.x = 3.5; e.y = 3.6; e.z = 0;
    let minY = e.y, maxZ = 0;
    for (let i = 0; i < 120; i++) { game._moveEnemy(e, 0, -0.05); minY = Math.min(minY, e.y); maxZ = Math.max(maxZ, e.z); }
    // one-shot predicate: a base enemy is blocked from entering the 1.6 wall row
    const blockedInWall = game._blockedEnemy(e, 3.5, 2.4, e.radius);
    // an enemy on the platform keeps platform height as it walks around on it
    const e2 = game.entities.filter((x) => x.kind === 'enemy')[1] || e;
    e2.x = 11.5; e2.y = 7.0; e2.z = 1.0;
    let e2minZ = 1.0;
    for (let i = 0; i < 40; i++) { game._moveEnemy(e2, 0, 0.03); e2minZ = Math.min(e2minZ, e2.z); }
    return { minY, maxZ, blockedInWall, e2minZ };
  });

  console.log(JSON.stringify(out));
  const checks = {
    'enemy stopped before the tall water wall': out.minY > 2.7,
    'enemy never climbs the 1.6 wall': out.maxZ < 0.35,
    '_blockedEnemy reports the tall wall as blocking': out.blockedInWall === true,
    'enemy on the platform stays elevated': out.e2minZ > 0.55,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'HEIGHT ENEMIES OK');
process.exit(errs.length ? 1 : 0);
