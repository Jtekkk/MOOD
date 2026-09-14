// Verifies the escape ending + the new per-level music wiring.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8139;
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
    const tk = audio.musicTracks || [];
    r.trackCount = tk.length;
    r.l7 = (tk[6] || '').endsWith('level7.mp3');
    r.l8 = (tk[7] || '').endsWith('level8.mp3');
    r.l9 = (tk[8] || '').endsWith('level9.mp3');
    r.l10alien = (tk[9] || '').endsWith('alien.mp3');

    game.startNewGame();
    const last = window.__MOOD.game;   // noop
    // jump to the final level and finish it
    game.levelIndex = 9; game.loadLevel(9);
    r.lastIsGumbird = /GUMBIRD/.test(game.map.name);
    game._exitLevel();
    r.intermission = game.state === 'intermission';
    game.intermission = 999; window.__MOOD.input.pressed.add('Enter');
    game.update(0.016);
    r.reachesEnding = game.state === 'ending';
    // ending runs then hands off to victory
    game.endT = 0;
    for (let i = 0; i < 1300 && game.state === 'ending'; i++) game.update(0.016);
    r.endsInVictory = game.state === 'victory';
    // skippable
    game._startEnding(); game.endT = 1; window.__MOOD.input.pressed.add('Enter'); game.update(0.016);
    r.skips = game.state === 'victory';
    window.__MOOD.input.pressed.clear();
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  // screenshots of the three ending beats
  for (const [name, T] of [['pad', 2.2], ['liftoff', 6.2], ['cockpit', 11.5]]) {
    await page.evaluate((T) => {
      const g = window.__MOOD.game, inp = window.__MOOD.input;
      inp.pressed.clear(); inp.mousePressed.clear(); inp.keys.clear(); inp.padFire = false;
      g._startEnding(); g.endT = T;
    }, T);
    await page.waitForTimeout(70);
    await page.screenshot({ path: `${OUT}/ending-${name}.png` });
  }

  const checks = {
    'track list has 10 entries': out.trackCount === 10,
    'LEVEL 7 track wired': out.l7,
    'LEVEL 8 track wired (NO WAY OF KNOWING)': out.l8,
    'LEVEL 9 track wired': out.l9,
    'LEVEL 10 uses the alien track': out.l10alien,
    'last level is the Gumbird arena': out.lastIsGumbird,
    'finishing it hits intermission': out.intermission,
    'then plays the ending cutscene': out.reachesEnding,
    'the ending hands off to victory': out.endsInVictory,
    'the ending is skippable': out.skips,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'ENDING OK');
process.exit(errs.length ? 1 : 0);
