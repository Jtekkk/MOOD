import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8089;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  await page.evaluate(() => {
    const g = window.__MOOD.game; g.startNewGame();
    g.player.x = 14.5; g.player.y = 10.5; g.player.angle = 0.6;
    g.showMap = true;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/automap.png` });
  console.log(errs.length ? 'ERR ' + errs.join(';') : 'automap OK');
} finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
