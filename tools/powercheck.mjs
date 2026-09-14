import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8099;
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
    const { game, renderer, SPR } = window.__MOOD;
    return import('/src/data/items.js').then((M) => {
      const ITEMS = M.ITEMS, r = {};
      game.startNewGame();
      r.sprites = !!(SPR.invuln && SPR.berserk && SPR.visor);

      // INVULNERABILITY: absorbs damage
      game.player.health = 100; game.player.armor = 0;
      ITEMS.V.apply(game);
      r.invulnSet = game.player.invuln > 25;
      game._damagePlayer(60);
      r.invulnBlocks = game.player.health === 100;
      game.player.invuln = 0;                       // expire
      game._damagePlayer(20);
      r.damageResumes = game.player.health < 100;

      // BERSERK: fist does ~10x. Compare one punch vs baseline on a fresh enemy.
      const mkEnemy = () => { game.loadLevel(0); return game.entities.find((e) => e.kind === 'enemy'); };
      // baseline punch (no berserk)
      game.player.berserk = false; game.player.weapon = 0;
      let e = mkEnemy(); e.x = game.player.x + 0.8; e.y = game.player.y; e.state = 'chase';
      const hp0 = e.hp; game.player.angle = Math.atan2(e.y - game.player.y, e.x - game.player.x);
      game.player.fireCD = 0; game._fire(); const baseDealt = hp0 - e.hp;
      // berserk punch
      ITEMS.k.apply(game); r.berserkOn = game.player.berserk === true && game.player.weapon === 0;
      e = mkEnemy(); e.x = game.player.x + 0.8; e.y = game.player.y; e.state = 'chase';
      const hp1 = e.hp; game.player.angle = Math.atan2(e.y - game.player.y, e.x - game.player.x);
      game.player.fireCD = 0; game._fire(); const berserkDealt = hp1 - e.hp;
      r.baseDealt = baseDealt; r.berserkDealt = berserkDealt;
      r.berserkStronger = berserkDealt >= baseDealt * 4 && berserkDealt > 0;

      // VISOR: adds a broad light around the player
      game.player.visor = 60;
      renderer._gatherLights(game);
      let bigLight = false;
      for (let i = 0; i < renderer._ln; i++) if (renderer._lrad2[i] > 400) bigLight = true;
      r.visorLight = bigLight;
      return r;
    });
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'powerup sprites exist': out.sprites,
    'invulnerability set on pickup': out.invulnSet,
    'invulnerability blocks damage': out.invulnBlocks,
    'damage resumes after it expires': out.damageResumes,
    'berserk turns on + switches to fist': out.berserkOn,
    'berserk fist hits far harder': out.berserkStronger,
    'visor adds a broad light': out.visorLight,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'POWERUPS OK');
process.exit(errs.length ? 1 : 0);
