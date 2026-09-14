import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8107;
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

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    const arena = game.constructorLevels; // unused
    // arena is the last level
    const idx = window.__MOOD.game && 0;
    game.loadLevel(9);   // LEVEL 10: THE GUMBIRD
    const r = { name: game.map.name };
    const boss = game.entities.find((e) => e.kind === 'enemy' && e.def.boss);
    r.bossPresent = !!boss && boss.type === 'gumbird';
    // stand at the exit and try to use it while the boss lives
    const exitApproach = () => { game.player.x = 14.5; game.player.y = 1.5; game.player.angle = -Math.PI / 2; };
    game.state = 'playing'; exitApproach();
    game._useAction();
    r.blockedWhileAlive = game.state === 'playing';
    r.warned = game.messages.some((m) => /STILL LIVES/.test(m.text));
    // kill the boss, let the corpse settle, then the exit should work
    game._damageEnemy(boss, 999999, 'player');
    for (let i = 0; i < 20; i++) game.update(0.05);
    exitApproach();
    game._useAction();
    r.exitsWhenDead = game.state === 'intermission';
    return r;
  });

  // screenshot the arena from the entrance
  await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame(); game.loadLevel(9);
    game.player.x = 13.5; game.player.y = 15.5; game.player.angle = -Math.PI / 2; game.player.z = 0;
    game.state = 'playing';
    for (let k = 0; k < 3; k++) game.update(0.03);
  });
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${OUT}/arena.png` });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'arena is LEVEL 10': /THE GUMBIRD/.test(out.name || ''),
    'the Gumbird is present': out.bossPresent,
    'exit is sealed while it lives': out.blockedWhileAlive && out.warned,
    'exit opens once it dies': out.exitsWhenDead,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'ARENA OK');
process.exit(errs.length ? 1 : 0);
