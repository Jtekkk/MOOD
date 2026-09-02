import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8088;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
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

  // find which generated levels actually contain water + sky
  const summary = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    const res = [];
    for (let lvl = 0; lvl < 8; lvl++) {
      game.loadLevel(lvl);
      const m = game.map;
      let water = 0, sky = 0;
      for (let i = 0; i < m.W * m.H; i++) { if (m.floorType[i]) water++; if (m.ceilType[i]) sky++; }
      res.push({ lvl, name: m.name, water, sky, hasTerrain: m.hasTerrain });
    }
    return res;
  });
  console.log(JSON.stringify(summary, null, 2));
  const anyWater = summary.some((s) => s.water > 0);
  const anySky = summary.some((s) => s.sky > 0);
  if (!anyWater) errs.push('FAIL no water in any level');
  if (!anySky) errs.push('FAIL no open sky in any level');

  // screenshot a level standing IN water looking across a sky room if possible.
  const shoot = async (kind, tag) => {
    const ok = await page.evaluate((kind) => {
      const { game } = window.__MOOD;
      // choose a level that has the feature
      let target = -1;
      for (let lvl = 0; lvl < 8; lvl++) {
        game.loadLevel(lvl);
        const m = game.map;
        let has = false;
        for (let i = 0; i < m.W * m.H; i++) { if ((kind === 'water' ? m.floorType[i] : m.ceilType[i])) { has = true; break; } }
        if (has) { target = lvl; break; }
      }
      if (target < 0) return false;
      game.loadLevel(target);
      const m = game.map;
      // find a feature cell with the most open floor around it, place player there
      const arr = kind === 'water' ? m.floorType : m.ceilType;
      let best = null;
      for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < m.W - 1; x++) {
        if (!arr[y * m.W + x]) continue;
        // count open neighbours (prefer roomy spots)
        let open = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const c = m.cellChar[(y + dy) * m.W + (x + dx)];
          if (c === '.' || c === ' ' || c === '@') open++;
        }
        if (!best || open > best.open) best = { x, y, open };
      }
      if (!best) return false;
      game.player.x = best.x + 0.5; game.player.y = best.y + 0.5;
      game.player.pitch = kind === 'sky' ? -28 : 10;   // look up for sky, down for water
      game.player.angle = 0;
      game.state = 'playing';
      for (let i = 0; i < 3; i++) game.update(0.05);
      window.__MOOD._lvl = target;
      return true;
    }, kind);
    if (!ok) { errs.push(`FAIL could not stage ${kind} shot`); return; }
    await page.waitForTimeout(180);
    await page.screenshot({ path: `${OUT}/terrain-${tag}.png` });
  };
  await shoot('water', 'water');
  await shoot('sky', 'sky');
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'TERRAIN OK');
process.exit(errs.length ? 1 : 0);
