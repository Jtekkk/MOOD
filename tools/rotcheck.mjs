import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8090;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });
  // controlled scene: player looking "north" (−y) at a single imp 4 cells ahead
  const cases = [
    ['facing-player', Math.PI / 2],   // expect FRONT
    ['facing-east', 0],               // expect SIDE (snout to viewer's right)
    ['facing-west', Math.PI],         // expect SIDE (snout to viewer's left)
    ['fleeing', -Math.PI / 2],        // expect BACK
  ];
  for (const [label, ang] of cases) {
    await page.evaluate((ang) => {
      const { game } = window.__MOOD;
      game.startNewGame();
      game.player.x = 5.5; game.player.y = 9.5; game.player.angle = -Math.PI / 2;
      game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'item' && e.kind !== 'barrel');
      // a ranged imp at close range never enters its move-block, so it keeps
      // the facing we set (no need to pause the sim).
      game.entities.push({
        kind: 'enemy', type: 'imp', def: { prefix: 'imp', range: 11, speed: 0, attack: 'projectile', cooldown: 99, painChance: 0, dmg: [1, 1] },
        x: 5.5, y: 6.5, angle: ang, hp: 60, radius: 0.32, spriteH: 1.05, vOffset: 0,
        mass: 1.3, kx: 0, ky: 0, target: 'none', state: 'chase', stateTime: 0, walkTime: 0.1,
        cooldownTimer: 99, attackTime: 0, didAttack: false, alive: true, sprite: window.__MOOD.SPR.imp_walk0,
      });
    }, ang);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT}/rot-${label}.png`, clip: { x: 240, y: 120, width: 520, height: 360 } });
  }
  console.log('rotcheck OK');
} finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
