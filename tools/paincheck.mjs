import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8104;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, SPR } = window.__MOOD;
    return import('/src/data/enemies.js').then((E) => {
      const r = {};
      r.charMapped = E.ENEMY_CHAR.P === 'painel';
      r.sprites = !!(SPR.painel_walk0 && SPR.painel_attack && SPR.painel_die3);
      game.startNewGame();
      // a lone pain elemental in open space, facing the player
      game.entities = [];
      const def = E.ENEMY_TYPES.painel;
      const pe = { kind: 'enemy', type: 'painel', def, x: game.player.x + 3, y: game.player.y, angle: Math.PI, z: 0,
        hp: def.hp, radius: def.radius, spriteH: def.spriteH, vOffset: def.vOffset, fullbright: false, fuzz: false,
        mass: def.mass, kx: 0, ky: 0, target: 'player', state: 'chase', stateTime: 0, walkTime: 0,
        cooldownTimer: 0, attackTime: 0, didAttack: false, alive: true, sprite: SPR.painel_walk0 };
      game.entities.push(pe);
      const total0 = game.player.totalKills;
      game._spawnLostSoul(pe, Math.PI);
      const souls1 = game.entities.filter((e) => e.type === 'lostsoul' && e.alive).length;
      r.spawnedSoul = souls1 === 1;
      r.tallyBumped = game.player.totalKills === total0 + 1;
      // cap: try to belch 30 more — must not exceed 14 live
      for (let i = 0; i < 30; i++) game._spawnLostSoul(pe, Math.PI);
      r.liveSouls = game.entities.filter((e) => e.type === 'lostsoul' && e.alive).length;
      r.capped = r.liveSouls <= 14;
      return r;
    });
  });

  // render a pain elemental in front of the player
  await page.evaluate(() => {
    const { game, SPR } = window.__MOOD;
    game.startNewGame(); game.entities = [];
    game.entities.push({ kind: 'enemy', type: 'painel', def: { prefix: 'painel' }, x: game.player.x + Math.cos(game.player.angle) * 2.4, y: game.player.y + Math.sin(game.player.angle) * 2.4, angle: game.player.angle + Math.PI, z: 0, spriteH: 1.4, vOffset: 0.5, radius: 0.46, hp: 400, fullbright: false, fuzz: false, state: 'attack', stateTime: 0, walkTime: 0, alive: true, sprite: SPR.painel_attack });
    game.state = 'playing';
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/painel.png` });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    "'P' maps to painel": out.charMapped,
    'pain elemental sprites exist': out.sprites,
    'belches a Lost Soul': out.spawnedSoul,
    'counts it into the tally (kills ≤ total)': out.tallyBumped,
    'swarm is capped at 14': out.capped,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'PAIN ELEMENTAL OK');
process.exit(errs.length ? 1 : 0);
