import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8085;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  // place an imp right ahead, flash it, and spray blood particles in view
  const n = await page.evaluate(() => {
    const { game, SPR } = window.__MOOD;
    game.startNewGame();
    game.player.x = 5.5; game.player.y = 9.5; game.player.angle = -Math.PI / 2;
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'item' && e.kind !== 'barrel');
    const imp = {
      kind: 'enemy', type: 'imp', def: { prefix: 'imp', range: 11, speed: 0, attack: 'projectile', cooldown: 99, painChance: 0, dmg: [1, 1] },
      x: 5.5, y: 6.0, angle: Math.PI / 2, hp: 60, radius: 0.32, spriteH: 1.05, vOffset: 0,
      mass: 1.3, kx: 0, ky: 0, target: 'none', state: 'chase', stateTime: 0, walkTime: 0.1,
      cooldownTimer: 99, attackTime: 0, didAttack: false, alive: true, flash: 0.09, sprite: SPR.imp_walk0,
    };
    game.entities.push(imp);
    game._spawnParticles(5.5, 6.0, 0.6, 60, { speed: 3, up: 3, life: 2, colors: [0xff2222cc, 0xff1414aa, 0xff4040dc] });
    game.shake = 0;   // keep this shot steady
    return game.particles.length;
  });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/juice.png`, clip: { x: 200, y: 120, width: 580, height: 380 } });
  console.log('particles spawned:', n, '-> juice OK');
} finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
