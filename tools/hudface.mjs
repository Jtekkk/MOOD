import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8094;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  await page.evaluate(() => window.__MOOD.game.startNewGame());

  // EXCITED: fire
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.add(0); });
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.delete(0); });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/07-hud-excited.png`, clip: { x: 0, y: 470, width: 980, height: 190 } });

  // BEES: drop health low
  await page.evaluate(() => { window.__MOOD.game.player.health = 12; window.__MOOD.game._damagePlayer(5); });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/08-hud-bees.png`, clip: { x: 0, y: 470, width: 980, height: 190 } });
  console.log('hud faces OK');
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}
