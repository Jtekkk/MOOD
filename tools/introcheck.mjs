// Verifies the intro cutscene: state flow, audio/shake cue firing, skip, and
// clean completion into LEVEL 1 — plus a screenshot of each of the four scenes.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8125;
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
    const { game } = window.__MOOD;
    const r = {};
    // spy on audio + shake
    const sounds = []; const origPlay = game.audio.play.bind(game.audio);
    game.audio.play = (n) => { sounds.push(n); };
    let maxShake = 0; const origShake = game.addShake.bind(game); game.addShake = (v) => { maxShake = Math.max(maxShake, v); origShake(v); };

    game.startIntro();
    r.startState = game.state === 'intro' && game.cutT === 0;

    // run the whole timeline deterministically (no skip) — should end in LEVEL 1
    for (let i = 0; i < 1300 && game.state === 'intro'; i++) game.update(0.016);
    r.endsInLevel1 = game.state === 'playing' && /LEVEL 1/.test(game.map.name);
    r.firedExplosion = sounds.includes('explosion');
    r.firedPistol = sounds.filter((s) => s === 'pistol').length >= 2;
    r.firedDoor = sounds.includes('door');
    r.shook = maxShake > 0.5;

    // restore, then test skip
    game.audio.play = origPlay;
    game.startIntro();
    game.update(0.5);                         // past the 0.4s skip guard
    window.__MOOD.input.pressed.add('Enter');
    game.update(0.016);
    r.skips = game.state === 'playing';
    // early click (before guard) does NOT skip
    game.startIntro();
    window.__MOOD.input.mousePressed.add(0);
    game.update(0.016);
    r.noEarlySkip = game.state === 'intro';
    // clear any input we synthesized so the live rAF loop doesn't act on it
    window.__MOOD.input.pressed.clear(); window.__MOOD.input.mousePressed.clear();
    return r;
  });

  console.log(JSON.stringify(out, null, 2));

  // screenshots of each scene (set the clock, let the loop paint a frame)
  const shots = [['crash', 2.4], ['drag', 6.4], ['cell', 11.2], ['escape', 14.6]];
  for (const [name, T] of shots) {
    await page.evaluate((T) => {
      const g = window.__MOOD.game, inp = window.__MOOD.input;
      inp.pressed.clear(); inp.mousePressed.clear(); inp.keys.clear(); inp.padFire = false;
      g.startIntro(); g.cutT = T;
    }, T);
    await page.waitForTimeout(70);
    await page.screenshot({ path: `${OUT}/intro-${name}.png` });
  }

  const checks = {
    'startIntro → intro state at t=0': out.startState,
    'full timeline ends in LEVEL 1': out.endsInLevel1,
    'crash fires an explosion cue': out.firedExplosion,
    'cell fires two pistol shots': out.firedPistol,
    'a door cue fires': out.firedDoor,
    'the crash shakes the screen': out.shook,
    'ENTER skips after the guard': out.skips,
    'a click before the guard does not skip': out.noEarlySkip,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'INTRO CUTSCENE OK');
process.exit(errs.length ? 1 : 0);
