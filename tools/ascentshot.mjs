import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8096;
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

  const views = [
    { x: 3.5, y: 15.5, a: -Math.PI / 2, z: 0, tag: 'start' },          // looking up the stairs
    { x: 11.5, y: 11.5, a: -Math.PI / 2, z: 0.4, tag: 'stairs' },       // partway up
    { x: 11.5, y: 8.0, a: 0, z: 1.0, tag: 'platform' },
    { x: 3.5, y: 7.5, a: -Math.PI/2, z: 0, tag: 'waterfall' },                 // on platform, look along the catwalk to exit
  ];
  let i = 0;
  const climb = await page.evaluate(() => {
    // verify the player can climb + cross to the exit region
    const { game, input } = window.__MOOD;
    game.startNewGame(); game.loadLevel(2);
    game.player.x = 11.5; game.player.y = 13.5; game.player.angle = -Math.PI / 2; game.player.z = 0;
    input.keys.add('KeyW');
    let zTop = 0, yTop = 13.5;
    for (let k = 0; k < 90; k++) { game.update(1 / 30); if (game.player.z > zTop) { zTop = game.player.z; yTop = game.player.y; } }
    input.keys.delete('KeyW');
    // now cross the catwalk east toward the exit
    game.player.x = 15.5; game.player.y = 8.5; game.player.z = 0.8; game.player.angle = 0;
    input.keys.add('KeyW');
    for (let k = 0; k < 120; k++) game.update(1 / 30);
    input.keys.delete('KeyW');
    return { zTop, yTop, exitX: game.player.x, exitZ: game.player.z };
  });
  console.log(JSON.stringify(climb));

  for (const v of views) {
    await page.evaluate((v) => {
      const { game } = window.__MOOD;
      game.startNewGame(); game.loadLevel(2);
      game.player.x = v.x; game.player.y = v.y; game.player.angle = v.a; game.player.z = v.z; game.player.pitch = 0;
      game.state = 'playing';
      for (let k = 0; k < 3; k++) game.update(0.03);
    }, v);
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${OUT}/ascent-${v.tag}.png` });
    i++;
  }
  // climbed onto the platform, and crossed near the exit (x approaching 22)
  if (!(climb.zTop >= 0.95)) errs.push('FAIL did not climb onto platform');
  if (!(climb.exitX > 20)) errs.push('FAIL did not cross catwalk to exit');
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'ASCENT OK');
process.exit(errs.length ? 1 : 0);
