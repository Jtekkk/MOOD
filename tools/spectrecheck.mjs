import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8101;
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
    const { game, renderer } = window.__MOOD;
    return import('/src/data/enemies.js').then((E) => {
      const r = {};
      r.charMapped = E.ENEMY_CHAR.x === 'spectre';
      r.reusesDemonArt = E.ENEMY_TYPES.spectre.prefix === 'demon';
      game.startNewGame(); game.player.pitch = 0;
      const W = 320, band = (a, b) => { let n = 0; for (let y = 40; y < 170; y++) for (let x = 110; x < 210; x++) { const i = y * W + x; if (a[i] !== b[i]) n++; } return n; };
      const render = (ent) => {
        game.entities = ent ? [ent] : [];
        renderer.clear(); renderer.renderWorld(game);
        return Uint32Array.from(renderer.buf);
      };
      const mkEnt = (fuzz) => ({ kind: 'enemy', type: fuzz ? 'spectre' : 'demon', def: E.ENEMY_TYPES[fuzz ? 'spectre' : 'demon'],
        x: game.player.x + Math.cos(game.player.angle) * 3, y: game.player.y + Math.sin(game.player.angle) * 3,
        angle: game.player.angle + Math.PI, hp: 150, radius: 0.4, spriteH: 1.0, vOffset: 0, fuzz,
        state: 'idle', walkTime: 0, alive: true, sprite: window.__MOOD.SPR.demon_walk0 });
      const A = render(null);                       // baseline, no enemy
      const demonPx = band(render(mkEnt(false)), A);
      const spectrePx = band(render(mkEnt(true)), A);
      r.demonPx = demonPx; r.spectrePx = spectrePx;
      r.fuzzed = spectrePx > 40 && spectrePx < demonPx * 0.7;   // sparse but present
      return r;
    });
  });

  // a visible screenshot of a spectre
  await page.evaluate(() => {
    const { game, SPR } = window.__MOOD;
    game.entities = [];
    game.entities.push({ kind: 'enemy', type: 'spectre', def: window.__MOOD.game.map ? undefined : undefined, x: game.player.x + Math.cos(game.player.angle) * 2.5, y: game.player.y + Math.sin(game.player.angle) * 2.5, angle: game.player.angle + Math.PI, hp: 150, radius: 0.4, spriteH: 1.0, vOffset: 0, fuzz: true, state: 'idle', walkTime: 0, alive: true, sprite: SPR.demon_walk0 });
    game.entities[0].def = { prefix: 'demon' };
    game.state = 'playing';
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/spectre.png` });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    "'x' maps to spectre": out.charMapped,
    'spectre reuses demon art': out.reusesDemonArt,
    'spectre draws a sparse shimmer (fewer pixels than a demon)': out.fuzzed,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'SPECTRE OK');
process.exit(errs.length ? 1 : 0);
