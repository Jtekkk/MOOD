import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8087;
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

  const info = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    game.loadLevel(7);
    const boss = game.entities.find((e) => e.type === 'gumbird');
    boss.state = 'chase';
    // stand the player a few tiles from the boss with a clear shot, facing it
    game.player.x = boss.x; game.player.y = boss.y + 3.2;
    game.player.angle = -Math.PI / 2;             // look toward -y (the boss)
    game.state = 'playing';
    for (let i = 0; i < 4; i++) game.update(0.016); // let it animate / sing a beat
    return { bx: boss.x, by: boss.y, px: game.player.x, py: game.player.y };
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/gumbird-world.png` });
  console.log(JSON.stringify(info));
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'WORLD SHOT OK');
process.exit(errs.length ? 1 : 0);
