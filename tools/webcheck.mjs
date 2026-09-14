// Verify dist-web/ runs as a fully standalone static bundle (the way a host
// like Porkbun would serve it) — served from its own folder only, no repo.
import { chromium } from 'playwright-core';
import { createStaticServer } from '../server.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist-web');
const PORT = 8092;

const errs = [];
const server = createStaticServer(DIST);
await new Promise((r) => server.listen(PORT, r));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const failed = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', (r) => failed.push(r.url() + ' — ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.url() + ' — HTTP ' + r.status()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, TEX, SPR } = window.__MOOD;
    game.startNewGame();
    game.state = 'playing';
    for (let i = 0; i < 4; i++) game.update(0.05);
    return {
      started: game.state === 'playing',
      level: game.map && game.map.name,
      texCount: Object.keys(TEX).length,
      sprCount: Object.keys(SPR).length,
      enemies: game.entities.filter((e) => e.kind === 'enemy').length,
    };
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/web-standalone.png` });

  console.log(JSON.stringify(out, null, 2));
  const realFails = failed.filter((u) => !/favicon/.test(u));
  const checks = {
    'bundle boots (window.__MOOD)': out.started,
    'level loaded': !!out.level,
    'textures generated': out.texCount > 20,
    'sprites generated': out.sprCount > 40,
    'enemies spawned': out.enemies > 0,
    'no failed asset requests (excl. favicon)': realFails.length === 0,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  if (realFails.length) for (const f of realFails) console.log('   missing: ' + f);
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); server.close(); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'WEB BUNDLE OK');
process.exit(errs.length ? 1 : 0);
