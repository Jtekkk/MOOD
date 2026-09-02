// Verifies the end-of-level stats screen: tally values, the count-up animation,
// skip-to-complete, and advancing to the next level. Also grabs screenshots.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8123;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, audio } = window.__MOOD;
    const r = {};
    audio.init();
    game.startNewGame();

    // clear some kills / items so the tally has partial values
    const enemies = game.entities.filter((e) => e.kind === 'enemy');
    const killN = Math.min(2, enemies.length);
    for (let i = 0; i < killN; i++) game._damageEnemy(enemies[i], 9999, 'player');
    game.itemsTaken = 1;                          // pretend we grabbed one item
    game.timer += 42;                             // 42s on the clock this level

    game._exitLevel();
    r.state = game.state;                         // 'intermission'
    r.tallyKills = game.tally.kills === killN;
    r.tallyTime = Math.round(game.tally.time) === 42;
    r.tallyHasPar = game.tally.par > 0;
    r.next = game.tally.next === true;

    // mid-animation: a fraction of the way in, KILLS should not be fully counted
    // if there were >1 to count. Drive update() to advance the animation.
    game.intermission = 0; game._tallyDone = 0;
    // total tally time
    const totalT = game._tallyTotalTime();
    r.totalReasonable = totalT > 1 && totalT < 6;

    // step ~half the first row's counting window
    for (let i = 0; i < 12; i++) game.update(0.016);   // ~0.19s in
    r.earlyMidAnim = game.intermission > 0 && game.intermission < totalT;

    // press Enter once → snaps to complete but stays on the screen
    window.__MOOD.input.pressed.add('Enter');
    game.update(0.016);
    r.snapped = game.state === 'intermission' && game.intermission >= totalT;

    // press Enter again → advances to level 2
    window.__MOOD.input.pressed.add('Enter');
    game.update(0.016);
    r.advanced = game.state === 'playing' && /LEVEL 2/.test(game.map.name);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));

  // screenshots: reopen intermission and grab mid + complete frames
  await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    const en = game.entities.filter((e) => e.kind === 'enemy');
    for (let i = 0; i < Math.min(3, en.length); i++) game._damageEnemy(en[i], 9999, 'player');
    game.itemsTaken = 2; game.player.secrets = 1; game.totalSecrets = 1; game.timer += 78;
    game._exitLevel();
    game.intermission = 0;
  });
  for (let i = 0; i < 40; i++) await page.evaluate(() => window.__MOOD.game.update(0.016));
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/stats-mid.png` });
  for (let i = 0; i < 120; i++) await page.evaluate(() => window.__MOOD.game.update(0.016));
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/stats-done.png` });

  const checks = {
    'exit → intermission state': out.state === 'intermission',
    'tally records kills': out.tallyKills,
    'tally records time': out.tallyTime,
    'tally computes a par time': out.tallyHasPar,
    'more levels flagged as next': out.next,
    'total animation time is reasonable': out.totalReasonable,
    'animation is mid-way early on': out.earlyMidAnim,
    'first ENTER snaps tally complete': out.snapped,
    'second ENTER advances to level 2': out.advanced,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'STATS SCREEN OK');
process.exit(errs.length ? 1 : 0);
