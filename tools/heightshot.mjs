import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8094;
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

  // load the HEIGHTS LAB and render from a few vantage points
  const shots = JSON.parse(process.env.SHOTS || '[[10.5,12.5,-1.5708,0],[10.5,9.5,-1.5708,0],[10.5,4.5,-1.5708,0.6]]');
  let idx = 0;
  for (const [px, py, ang, z] of shots) {
    const info = await page.evaluate(({ px, py, ang, z }) => {
      const { game } = window.__MOOD;
      return import('/src/data/levels.js').then((L) => {
        const map = L.parseLevel(L.HEIGHTS_LAB);
        map.doorMap = {};
        for (const d of map.doors) map.doorMap[d.y * map.W + d.x] = d;
        map.isSolidCell = (cx, cy) => (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) ? true : L.SOLID.has(map.cellChar[cy * map.W + cx]);
        game.map = map;
        game.entities = []; game.particles = [];
        game.player.x = px; game.player.y = py; game.player.angle = ang; game.player.z = z; game.player.pitch = 0;
        game.state = 'playing';
        for (let i = 0; i < 2; i++) game.update(0.03);
        return { hasHeights: map.hasHeights, name: map.name };
      });
    }, { px, py, ang, z });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT}/height-${idx}.png` });
    if (!info.hasHeights) errs.push('FAIL hasHeights false');
    idx++;
  }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'HEIGHT SHOTS OK');
process.exit(errs.length ? 1 : 0);
