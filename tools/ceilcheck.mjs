// Verifies the per-cell ceiling engine on a generated ceiling level (LEVEL 3):
// ceilings vary (low passages ↔ tall halls), headroom blocks where it should,
// and it renders fast. Level-agnostic — finds a hasCeils level itself.
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
    const { game, renderer } = window.__MOOD;
    game.startNewGame();
    // find the first campaign level that carries a per-cell ceiling map
    let idx = -1;
    for (let i = 0; i < 32; i++) { try { game.loadLevel(i); } catch (e) { break; } if (game.map.hasCeils) { idx = i; break; } }
    const m = game.map, r = { idx, name: m.name, hasCeils: !!m.hasCeils };
    // ceiling variety: some cells lower than the 2.4 default, some taller
    let lo = 9, hi = 0;
    for (let i = 0; i < m.ceilH.length; i++) { const c = m.ceilH[i]; if (c < lo) lo = c; if (c > hi) hi = c; }
    r.lo = +lo.toFixed(2); r.hi = +hi.toFixed(2);
    r.variety = lo < 2.3 && hi > 2.5;
    // headroom physics: a low ceiling over a raised block blocks entry; restore → fits
    const W = m.W, cx = Math.floor(m.start.x) + 1, cy = Math.floor(m.start.y);
    const bi = cy * W + cx;
    const sbH = m.blockH[bi], scH = m.ceilH[bi];
    m.blockH[bi] = 1.0; m.ceilH[bi] = 1.5;                       // headroom 0.5 < 1.0
    r.lowBlocks = game._ledgeBlocks(cx + 0.5, cy + 0.5, 1.0) === true;   // fromZ=1.0 isolates headroom from step-up
    m.ceilH[bi] = 3.0;                                           // headroom 2.0
    r.restored = game._ledgeBlocks(cx + 0.5, cy + 0.5, 1.0) === false;
    m.blockH[bi] = sbH; m.ceilH[bi] = scH;
    // fps: update + render a few dozen frames
    game.state = 'playing';
    for (let i = 0; i < 4; i++) game.update(0.03);
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { game.update(0.016); renderer.clear(); renderer.renderWorld(game); }
    r.fps = Math.round(30000 / (performance.now() - t0));
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'a campaign level carries a per-cell ceiling map': out.hasCeils && out.idx >= 0,
    'ceilings vary (low passages ↔ tall halls)': out.variety,
    'a low ceiling over a raised block blocks entry': out.lowBlocks,
    'headroom returns once the ceiling is raised': out.restored,
    'renders at a healthy frame rate': out.fps >= 45,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.evaluate(() => { const { game } = window.__MOOD; game.state = 'playing'; for (let i = 0; i < 3; i++) game.update(0.03); });
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${OUT}/ceilings.png` });
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'CEILINGS OK');
process.exit(errs.length ? 1 : 0);
