// Verifies player gravity: walking off a ledge falls smoothly (not a teleport)
// and lands on the floor below; climbing a step snaps up; flat levels stay at 0.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8128;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game } = window.__MOOD;
    const r = {};

    // flat level: z stays pinned at 0
    game.startNewGame();               // LEVEL 1 (flat)
    r.flatHasHeights = game.map.hasHeights === false;
    game.player.z = 0; for (let i = 0; i < 5; i++) game.update(0.05);
    r.flatStaysGround = game.player.z === 0 && game.player.grounded === true;

    // height level: find a floor cell whose ground height is 0, stand there,
    // lift the player up as if a ledge vanished, and let gravity work.
    game.loadLevel(2);                 // THE ASCENT (hasHeights)
    r.heightLevel = game.map.hasHeights === true;
    const map = game.map; let fx = -1, fy = -1;
    for (let y = 1; y < map.H - 1 && fx < 0; y++) for (let x = 1; x < map.W - 1; x++) {
      if (!map.isSolidCell(x, y) && map.blockH[y * map.W + x] === 0) { fx = x; fy = y; break; }
    }
    r.foundFloor = fx >= 0;
    const p = game.player;
    p.x = fx + 0.5; p.y = fy + 0.5; p.z = 0.8; p.vz = 0; p.grounded = false;
    game.update(0.05);
    r.fallsGradually = p.z < 0.8 && p.z > 0.0;         // dropped, but not teleported to 0
    r.gainedDownVel = p.vz < 0;                        // accelerating downward
    for (let i = 0; i < 60; i++) game.update(0.05);
    r.landed = Math.abs(p.z - game._groundZ(p.x, p.y)) < 1e-3 && p.grounded === true;

    // a hard drop kicks screen-shake + a dust puff (transient — capture the peak)
    game.shake = 0; p.z = 1.6; p.vz = 0; p.grounded = false;
    let maxShake = 0, sawPuff = false;
    for (let i = 0; i < 40; i++) { game.update(0.05); maxShake = Math.max(maxShake, game.shake); if (game.entities.some((e) => e.kind === 'effect')) sawPuff = true; }
    r.landShake = maxShake > 0 || sawPuff;

    // climbing: stepping onto a higher cell snaps up immediately (no float)
    // find two 4-connected floor cells whose heights differ by a climbable step
    let a = null, b = null;
    for (let y = 1; y < map.H - 1 && !a; y++) for (let x = 1; x < map.W - 1; x++) {
      if (map.isSolidCell(x, y)) continue;
      const h0 = map.blockH[y * map.W + x];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (map.isSolidCell(nx, ny)) continue;
        const h1 = map.blockH[ny * map.W + nx];
        if (h1 - h0 > 0.05 && h1 - h0 <= 0.34) { a = { x, y, h: h0 }; b = { x: nx, y: ny, h: h1 }; break; }
      }
      if (a) break;
    }
    r.foundStep = !!a;
    if (a) {
      p.x = a.x + 0.5; p.y = a.y + 0.5; p.z = a.h; p.vz = 0; p.grounded = true;
      game._movePlayer((b.x - a.x) * 0.6, (b.y - a.y) * 0.6);
      r.climbSnaps = Math.abs(p.z - b.h) < 1e-3;   // snapped up onto the step
    } else r.climbSnaps = true;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'flat level reports no heights': out.flatHasHeights,
    'flat level keeps z at ground': out.flatStaysGround,
    'height level has heights': out.heightLevel,
    'found a ground-level floor cell': out.foundFloor,
    'walking off a ledge falls gradually (no teleport)': out.fallsGradually,
    'downward velocity builds while falling': out.gainedDownVel,
    'the player lands on the floor below': out.landed,
    'a hard landing shakes / kicks dust': out.landShake,
    'found a climbable step': out.foundStep,
    'climbing a step snaps up instantly': out.climbSnaps,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'GRAVITY OK');
process.exit(errs.length ? 1 : 0);
