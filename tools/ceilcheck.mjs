import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8114;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    game.loadLevel(2);                     // LEVEL 3: THE ASCENT (now with per-cell ceilings)
    const m = game.map, r = {};
    const at = (x, y) => m.ceilH[y * m.W + x];
    r.hasCeils = !!m.hasCeils;
    r.tall = at(18, 8);                     // catwalk-to-exit hall → 3.9
    r.low = at(3, 15);                      // entry nook → 1.8
    r.def = at(20, 11);                     // untouched → 2.4 default
    r.range = r.tall > 3.5 && r.low < 2.0 && Math.abs(r.def - 2.4) < 0.01;

    // headroom physics: a base-floor cell under the low nook stays passable…
    r.nookPassable = game._ledgeBlocks(3.5, 15.5, 0) === false;
    // …but drop a low ceiling over a raised platform cell and you can't fit
    const pi = 7 * m.W + 11;               // a platform cell (blockH ≈ 1.0)
    r.platFloor = m.blockH[pi];
    const save = m.ceilH[pi];
    m.ceilH[pi] = 1.5;                      // headroom 0.5 < 1.0 → blocked
    r.lowCeilBlocks = game._ledgeBlocks(11.5, 7.5, 0) === true;
    m.ceilH[pi] = save;
    r.restored = game._ledgeBlocks(11.5, 7.5, 1.0) === false;   // fits again once ceiling restored

    // render a few frames from the low nook, looking into the tall hall
    game.player.x = 3.5; game.player.y = 15.5; game.player.angle = -Math.PI / 2 + 0.5; game.player.z = 0;
    game.state = 'playing';
    for (let i = 0; i < 4; i++) game.update(0.03);
    const R = window.__MOOD.renderer;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { game.update(0.016); R.clear(); R.renderWorld(game); }
    r.fps = Math.round(30000 / (performance.now() - t0));
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'ASCENT now carries a per-cell ceiling map': out.hasCeils,
    'ceilings span low→default→tall (1.8 / 2.4 / 3.9)': out.range,
    'a low ceiling over open floor stays walkable': out.nookPassable,
    'a low ceiling over a raised platform blocks entry': out.lowCeilBlocks,
    'headroom returns once the ceiling is restored': out.restored,
    'renders at a healthy frame rate': out.fps >= 45,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.player.x = 4.5; game.player.y = 12.5; game.player.angle = -Math.PI / 2 + 0.35; game.player.z = 0;
    for (let i = 0; i < 3; i++) game.update(0.03);
  });
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${OUT}/ceilings.png` });
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'CEILINGS OK');
process.exit(errs.length ? 1 : 0);
