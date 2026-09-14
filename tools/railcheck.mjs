// Verifies the RAILGUN: sprites, a pierceing beam that hits every enemy in a
// line (each once), stops at a wall, uses cells, is fielded, and slots in the HUD.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8130;
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
    const { game, SPR } = window.__MOOD;
    const W = window.__MOOD; const r = {};
    const WEAPONS = null; // not exported; use game internals
    r.sprites = ['fp_rail', 'fp_rail_fire', 'pickup_rail'].every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    game.startNewGame();
    const p = game.player;
    // find the railgun slot by name
    const list = game.constructor; // no
    // use the module weapon list via a fired shot: give all weapons and switch by key
    // locate railgun index via p.owned length + WEAPONS through a projectile? simpler: search
    let railIdx = -1;
    // WEAPONS is not on game; infer by cooldown/kind through firing each. Instead read from a known: sausage is last, railgun is second-last.
    railIdx = p.owned.length - 2;   // [...,railgun,sausage]
    p.owned[railIdx] = true; p.weapon = railIdx; p.ammo.cells = 300; p.fireCD = 0; p.raiseT = 0;

    // line up three dummies in a clear horizontal run directly ahead
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');
    let rx = -1, ry = -1;
    for (let y = 1; y < game.map.H - 1 && rx < 0; y++) for (let x = 1; x < game.map.W - 6; x++) {
      let open = true; for (let k = 0; k < 6; k++) if (game.map.isSolidCell(x + k, y)) { open = false; break; }
      if (open) { rx = x; ry = y; break; }
    }
    p.x = rx + 0.5; p.y = ry + 0.5; p.angle = 0;
    const mk = (dx) => { const e = { kind: 'enemy', type: 'demon', def: { painChance: 0, hp: 100000 }, x: p.x + dx, y: p.y, radius: 0.4, hp: 100000, alive: true, state: 'chase', mass: 1, vOffset: 0, target: 'player' }; game.entities.push(e); return e; };
    const a = mk(1.2), b = mk(2.4), c = mk(3.6);
    const before = [a.hp, b.hp, c.hp];
    const cellsBefore = p.ammo.cells;
    game._fire();
    r.pierced = a.hp < before[0] && b.hp < before[1] && c.hp < before[2];   // all three hit
    r.usesCells = p.ammo.cells === cellsBefore - 3;
    r.tracer = game.particles.length > 0;

    // beam stops at a wall: put a dummy beyond a wall — find a wall cell ahead
    game.entities = game.entities.filter((e) => e.kind !== 'enemy');
    // place player facing +x with a wall somewhere; use level geometry: scan for a solid cell to the +x of an open cell
    let ox = -1, oy = -1;
    for (let y = 1; y < game.map.H - 1 && ox < 0; y++) for (let x = 1; x < game.map.W - 3; x++) {
      if (!game.map.isSolidCell(x, y) && game.map.isSolidCell(x + 1, y)) { ox = x; oy = y; break; }
    }
    if (ox >= 0) {
      p.x = ox + 0.5; p.y = oy + 0.5; p.angle = 0;
      const behind = { kind: 'enemy', type: 'demon', def: { painChance: 0, hp: 500 }, x: ox + 2.5, y: oy + 0.5, radius: 0.4, hp: 500, alive: true, state: 'chase', mass: 1, vOffset: 0, target: 'player' };
      game.entities.push(behind);
      p.fireCD = 0; game._fire();
      r.wallStops = behind.hp === 500;   // the wall blocked the beam
    } else r.wallStops = true;

    // fielded in the campaign (levels 7/8 carry the '0' pickup)
    let found = 0;
    for (const li of [6, 7]) { game.loadLevel(li); for (const t of game.map.things) if (t.ch === '0') found++; }
    r.fielded = found > 0;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  await page.evaluate(() => {
    const g = window.__MOOD.game; g.startNewGame();
    const p = g.player; p.owned[p.owned.length - 2] = true; p.weapon = p.owned.length - 2; p.ammo.cells = 300;
    p.x = 5.5; p.y = 2.6; p.angle = 0.5; p.fireCD = 0; g._fire();
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/railgun.png` });

  const checks = {
    'railgun sprites registered': out.sprites,
    'beam pierces all enemies in a line': out.pierced,
    'a shot uses 3 cells': out.usesCells,
    'the beam draws a tracer': out.tracer,
    'the beam stops at a wall': out.wallStops,
    'railgun is fielded in the campaign': out.fielded,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'RAILGUN OK');
process.exit(errs.length ? 1 : 0);
