import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8093;
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

  // Stand next to a lamp on a generated level and look at it.
  const info = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    game.loadLevel(2);                       // LEVEL 3: REFINERY (has lamps + water)
    const lamp = game.entities.find((e) => e.kind === 'lamp');
    let out = { lampCount: game.entities.filter((e) => e.kind === 'lamp').length };
    if (lamp) {
      game.player.x = lamp.x + 0.1; game.player.y = lamp.y + 2.6;
      game.player.angle = -Math.PI / 2;      // face the lamp
      out.lamp = { x: lamp.x, y: lamp.y };
    }
    game.state = 'playing';
    for (let i = 0; i < 3; i++) game.update(0.05);
    return out;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/light-lamp.png` });

  // Muzzle flash: fire the plasma rifle (blue light) in a dark corridor.
  await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.player.owned[6] = true; game.player.ammo.cells = 200; game._switchWeapon(6);
    game.player.weaponFlash = 0.09; game.player.muzzle = [0.45, 0.62, 1.0];
    // put a plasma bolt in flight ahead of the player for the glow
    game._spawnProjectile(game.player.x, game.player.y, game.player.angle, window.__MOOD.game.constructor ? { proj: 'plasma', projSpeed: 13, dmg: 10 } : { proj: 'plasma', projSpeed: 13, dmg: 10 });
    game.update(0.05);
  });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/light-muzzle.png` });

  console.log(JSON.stringify(info));
  if (info.lampCount < 1) errs.push('FAIL no lamps on level 3');
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'LIGHT SHOTS OK');
process.exit(errs.length ? 1 : 0);
