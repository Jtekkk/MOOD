import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8087;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  await page.evaluate(() => window.__MOOD.game.startNewGame());

  const shots = { 3: 'lvl3', 6: 'lvl6', 8: 'lvl8' };
  for (let lvl = 1; lvl <= 8; lvl++) {
    const info = await page.evaluate(() => {
      const g = window.__MOOD.game;
      const ents = g.entities;
      const keys = ents.filter((e) => e.kind === 'item' && 'RUY'.includes(e.ch)).length;
      let exits = 0; for (let i = 0; i < g.map.cellChar.length; i++) if (g.map.cellChar[i] === '+') exits++;
      const lockedDoors = g.map.doors.filter((d) => d.lock).length;
      return {
        name: g.map.name, state: g.state,
        enemies: ents.filter((e) => e.kind === 'enemy').length,
        items: ents.filter((e) => e.kind === 'item').length,
        keys, exits, lockedDoors,
      };
    });
    const bad = [];
    if (info.enemies < 1) bad.push('no enemies');
    if (info.keys !== 1) bad.push(`keys=${info.keys}`);
    if (info.exits !== 1) bad.push(`exits=${info.exits}`);
    if (info.lockedDoors < 1) bad.push('no locked door');
    console.log(`L${lvl} ${info.name}: enemies=${info.enemies} items=${info.items} keys=${info.keys} exits=${info.exits} lock=${info.lockedDoors} ${bad.length ? 'BAD:' + bad.join(',') : 'ok'}`);
    if (bad.length) errors.push(`L${lvl} ${bad.join(',')}`);

    if (shots[lvl]) {
      await page.evaluate(() => { window.__MOOD.game.player.angle = 0.4; });
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${shots[lvl]}.png` });
    }
    // advance
    const after = await page.evaluate(() => {
      const g = window.__MOOD.game; g._exitLevel(); g.intermission = 1;
      window.__MOOD.input.pressed.add('Enter'); g.update(0.05);
      window.__MOOD.input.pressed.delete('Enter');   // don't let the rAF loop re-consume it
      return g.state;
    });
    if (lvl === 8) console.log('state right after L8 exit+advance:', after);
    await page.waitForTimeout(60);
  }
  const final = await page.evaluate(() => window.__MOOD.game.state);
  console.log('final state after L8 exit:', final);
  if (final !== 'victory') errors.push('did not reach victory after level 8');
} catch (e) { errors.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED (${errors.length})` : 'LEVEL WALK OK');
process.exit(errors.length ? 1 : 0);
