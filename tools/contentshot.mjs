import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8084;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  // plasma rifle in-game
  await page.evaluate(() => {
    const g = window.__MOOD.game; g.startNewGame();
    g.player.owned = [true, true, true, true, true, true, true];
    g.player.ammo.cells = 200; g.player.weapon = 6; g.player.raiseT = 0;
    g.player.x = 5.5; g.player.y = 2.6; g.player.angle = 0.5;
  });
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.add(0); });
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/plasma.png` });
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.delete(0); });

  // intermission stats: simulate some kills + item pickups, then exit
  await page.evaluate(() => {
    const g = window.__MOOD.game;
    g.player.kills = 9; g.itemsTaken = 7; g.levelStartT = g.timer - 83.0;  // 01:23
    g._exitLevel();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/intermission.png` });
  console.log('contentshot OK');
} finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
