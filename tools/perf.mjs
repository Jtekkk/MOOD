import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8096;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  // perf: time renderWorld over many frames
  const perf = await page.evaluate(() => {
    const { game, renderer } = window.__MOOD;
    game.startNewGame();
    // warm up
    for (let i = 0; i < 10; i++) { game.update(0.016); renderer.clear(); renderer.renderWorld(game); }
    const N = 240;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      game.player.angle += 0.01;
      game.update(0.016);
      renderer.clear();
      renderer.renderWorld(game);
    }
    const ms = (performance.now() - t0) / N;
    return { msPerFrame: +ms.toFixed(3), fps: Math.round(1000 / ms) };
  });
  console.log('PERF', JSON.stringify(perf));

  // jump to level 2 and screenshot
  await page.evaluate(() => {
    const { game, input } = window.__MOOD;
    game._exitLevel();
    game.intermission = 1; input.pressed.add('Enter'); game.update(0.05);
    game.player.angle = 0.5;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/05-level2.png` });
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}
