import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8081;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, audio } = window.__MOOD; audio.init();
    const r = {};
    game.openSettings('title'); r.opened = game.state === 'settings';
    // navigate to SKILL (index 3) and bump to HARD
    game.settingsSel = 3;
    game.settings.skill = 1;
    window.__MOOD.input.pressed.add('ArrowRight'); game.update(0); window.__MOOD.input.pressed.delete('ArrowRight');
    r.skillName = game.skill.name; r.skillIdx = game.settings.skill;
    r.persisted = JSON.parse(localStorage.getItem('mood_settings')).skill;
    // SOUND volume change applies to audio master
    game.settingsSel = 1; game.settings.volume = 0.5;
    window.__MOOD.input.pressed.add('ArrowRight'); game.update(0); window.__MOOD.input.pressed.delete('ArrowRight');
    r.masterVol = audio.masterVol;
    // back out
    game.settingsSel = 4; window.__MOOD.input.pressed.add('Enter'); game.update(0); window.__MOOD.input.pressed.delete('Enter');
    r.returned = game.state;
    // difficulty actually scales incoming damage
    game.startNewGame();
    game.settings.skill = 0; game.applySettings();   // EASY = 0.5x
    game.player.health = 100; game.player.armor = 0; game._damagePlayer(20);
    r.easyHealth = game.player.health;               // expect 100 - round(20*0.5)=90
    game.player.health = 100; game.settings.skill = 2; game.applySettings();  // HARD = 1.7x
    game._damagePlayer(20);
    r.hardHealth = game.player.health;               // expect 100 - round(20*1.7)=66
    return r;
  });
  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'settings opens': out.opened,
    'skill → HARD': out.skillName === 'HARD' && out.skillIdx === 2,
    'skill persisted to storage': out.persisted === 2,
    'volume applies to master': Math.abs(out.masterVol - 0.6) < 1e-6,
    'back returns to title': out.returned === 'title',
    'EASY halves damage': out.easyHealth === 90,
    'HARD amplifies damage': out.hardHealth === 66,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }

  // screenshot the menu
  await page.evaluate(() => { window.__MOOD.game.openSettings('title'); window.__MOOD.game.settingsSel = 3; });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/settings.png` });
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'SETTINGS OK');
process.exit(errs.length ? 1 : 0);
