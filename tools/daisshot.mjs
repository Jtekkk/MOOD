import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8098;
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

  for (const [lvl, tag] of [[5, 'wound'], [8, 'icon']]) {
    const info = await page.evaluate((lvl) => {
      const { game } = window.__MOOD;
      game.startNewGame(); game.loadLevel(lvl);
      const m = game.map;
      // find the dais centre (highest block), then stand a few tiles south of it
      let best = null;
      for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) { const h = m.blockH[y * m.W + x]; if (h > 0 && (!best || h > best.h)) best = { x, y, h }; }
      let out = { hasHeights: m.hasHeights, name: m.name, best };
      if (best) {
        // find open floor to stand on, south of the dais, facing north toward it
        let sy = best.y + 4;
        for (; sy < m.H - 1; sy++) { const c = m.cellChar[sy * m.W + best.x]; if (c === '.' && m.blockH[sy * m.W + best.x] === 0) break; }
        game.player.x = best.x + 0.5; game.player.y = sy + 0.5; game.player.angle = -Math.PI / 2; game.player.z = 0; game.player.pitch = 0;
      }
      game.state = 'playing';
      for (let k = 0; k < 3; k++) game.update(0.03);
      return out;
    }, lvl);
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${OUT}/dais-${tag}.png` });
    if (!info.hasHeights) errs.push(`FAIL ${tag} hasHeights false`);
    if (!info.best) errs.push(`FAIL ${tag} no dais found`);
    console.log(tag, JSON.stringify(info.best));
  }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'DAIS OK');
process.exit(errs.length ? 1 : 0);
