import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8105;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    game.startNewGame();
    game.loadLevel(4);   // LEVEL 5: FOUNDRY (has a secret)
    const m = game.map, r = {};
    r.totalSecrets = m.totalSecrets;
    const sd = m.doors.find((d) => d.secret);
    r.hasSecretDoor = !!sd;
    r.disguised = sd && sd.tex && sd.tex !== 'door';   // wears a wall texture, not the door skin
    r.rewardBehind = false;
    if (sd) {
      // a reward thing sits in the closet on the far side of the door
      const dirs = sd.axis === 'v' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        if (game.entities.some((e) => e.kind === 'item' && Math.floor(e.x) === sd.x + dx && Math.floor(e.y) === sd.y + dy)) r.rewardBehind = true;
      }
      // stand next to the door, face it, and use it
      game.player.secrets = 0;
      game.player.x = sd.x + (sd.axis === 'v' ? -0.5 : 0.5);
      game.player.y = sd.y + (sd.axis === 'v' ? 0.5 : -0.5);
      // point toward the door cell
      game.player.angle = Math.atan2((sd.y + 0.5) - game.player.y, (sd.x + 0.5) - game.player.x);
      game.player.x = sd.x + 0.5 - Math.cos(game.player.angle) * 0.6;
      game.player.y = sd.y + 0.5 - Math.sin(game.player.angle) * 0.6;
      game._useAction();
      r.opened = sd.state === 'opening' || sd.state === 'open';
      r.counted = game.player.secrets === 1 && sd.found === true;
      // using again does not double-count
      game._useAction();
      r.noDoubleCount = game.player.secrets === 1;
    }
    // it flows into the intermission tally
    game._exitLevel();
    r.tallyHasSecrets = game.tally.totalSecrets === m.totalSecrets;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'level reports a secret': out.totalSecrets >= 1 && out.hasSecretDoor,
    'secret door is disguised (wall texture)': out.disguised,
    'a reward sits behind it': out.rewardBehind,
    'using it opens + counts a secret': out.opened && out.counted,
    'does not double-count': out.noDoubleCount,
    'secret count reaches the intermission tally': out.tallyHasSecrets,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'SECRETS OK');
process.exit(errs.length ? 1 : 0);
