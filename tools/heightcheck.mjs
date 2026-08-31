import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8095;
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
    const { game, input } = window.__MOOD;
    return import('/src/data/levels.js').then((L) => {
      const setup = (px, py, ang) => {
        const map = L.parseLevel(L.HEIGHTS_LAB);
        map.doorMap = {};
        map.isSolidCell = (cx, cy) => (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) ? true : L.SOLID.has(map.cellChar[cy * map.W + cx]);
        game.map = map; game.entities = []; game.particles = [];
        game.player.x = px; game.player.y = py; game.player.angle = ang;
        game.player.z = 0; game.player.vx = 0; game.player.vy = 0; game.state = 'playing';
      };
      const r = {};
      // 1) climb the stairs: walk north from the base
      setup(10.5, 11.5, -Math.PI / 2);
      input.keys.add('KeyW');
      let maxZ = 0, minY = 11.5;
      for (let i = 0; i < 160; i++) { game.update(1 / 30); maxZ = Math.max(maxZ, game.player.z); minY = Math.min(minY, game.player.y); }
      input.keys.delete('KeyW');
      r.climbedZ = maxZ; r.reachedY = minY; r.onPlatform = maxZ >= 0.95 && minY < 6.0;

      // 2) ledge blocks: from the base, try to walk straight into the side of the
      //    tall platform (not via the stairs) — should be stopped.
      setup(5.5, 4.5, Math.PI / 2 * 0 + 0); // face +x toward the platform wall at col7
      game.player.angle = 0; // +x
      input.keys.add('KeyW');
      const startX = game.player.x;
      for (let i = 0; i < 60; i++) game.update(1 / 30);
      input.keys.delete('KeyW');
      r.ledgeStopX = game.player.x;
      // platform starts at col 7; with radius 0.22 a blocked player stops near x≈6.78 and never climbs
      r.ledgeBlocked = (game.player.x < 6.95) && (game.player.z < 0.05);

      // 3) step back down: from platform, walk south down the stairs
      setup(10.5, 4.5, Math.PI / 2); // on platform, face +y (south, down stairs)
      game.player.z = 1.0;
      input.keys.add('KeyW');
      let endZ = 1.0;
      for (let i = 0; i < 160; i++) { game.update(1 / 30); endZ = game.player.z; }
      input.keys.delete('KeyW');
      r.steppedDownZ = endZ; r.descended = endZ < 0.25;
      return r;
    });
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'climbs stairs onto the platform (z→1.0)': out.onPlatform,
    'tall ledge blocks a straight walk-in': out.ledgeBlocked,
    'walks back down the stairs (z→0)': out.descended,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'HEIGHT PHYSICS OK');
process.exit(errs.length ? 1 : 0);
