// Headless smoke-test + screenshots using the pre-installed Chromium.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8099;
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';

const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 700));

const errors = [];
const logs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/01-title.png` });

  // start the game directly (headless: bypass pointer lock)
  await page.evaluate(() => window.__MOOD.game.startNewGame());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-start.png` });

  // turn to look around and walk forward a bit, firing
  await page.evaluate(() => {
    const { game, input } = window.__MOOD;
    game.player.angle = 0.6;           // look toward the room
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__MOOD.input.keys.add('KeyW'); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__MOOD.input.keys.delete('KeyW'); });
  await page.screenshot({ path: `${OUT}/03-move.png` });

  // fire the pistol (set mouse button down for a couple frames)
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.add(0); });
  await page.waitForTimeout(120);
  await page.evaluate(() => { window.__MOOD.input.mouseButtons.delete(0); });
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${OUT}/04-fire.png` });

  // report runtime state
  const snap = await page.evaluate(() => {
    const g = window.__MOOD.game;
    return {
      state: g.state, level: g.map?.name, entities: g.entities.length,
      enemies: g.entities.filter((e) => e.kind === 'enemy').length,
      items: g.entities.filter((e) => e.kind === 'item').length,
      health: g.player.health, weapon: g.player.weapon,
      px: +g.player.x.toFixed(2), py: +g.player.y.toFixed(2),
    };
  });
  console.log('SNAPSHOT', JSON.stringify(snap));
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}

console.log('--- console logs ---');
for (const l of logs.slice(-40)) console.log(l);
console.log('--- errors ---');
for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED: ${errors.length} error(s)` : 'NO RUNTIME ERRORS');
process.exit(errors.length ? 1 : 0);
