// Verifies the new powerups: Soulsphere (+100 hp), Radiation Suit (sludge
// immunity), Quad Damage (2x, glow), and that they're fielded + light-emitting.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8129;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out2 = await page.evaluate(() => {
    const { game, SPR } = window.__MOOD;
    const r = {};
    game.startNewGame();
    const p = game.player;
    const grab = (ch) => {   // spawn the pickup on top of the player and step
      game.entities = game.entities.filter((e) => e.kind !== 'item');
      game.loadLevelThing = null;
      // reconstruct the item entity via _spawnThings path: put a things entry
      game.map.things.push({ ch, x: p.x, y: p.y });
      game._spawnThings({ things: [{ ch, x: p.x, y: p.y }] });
      const it = game.entities.find((e) => e.kind === 'item' && e.ch === ch);
      if (it) { it.def.apply(game); return it; }
      return null;
    };

    // Soulsphere
    p.health = 70;
    const soul = grab('b');
    r.soulSprite = soul && soul.sprite === SPR.soulsphere;
    r.soulHeals = p.health === 170;
    r.soulGlows = !!(soul && soul.light);
    p.health = 190; grab('b'); r.soulCaps = p.health === 200;

    // Radiation suit
    const suit = grab('u');
    r.suitTimer = p.radsuit > 0;
    r.suitGlows = !!(suit && suit.light);

    // Quad damage
    const q = grab('I');
    r.quadTimer = p.quad > 0;
    r.quadGlows = !!(q && q.light);

    // Quad doubles weapon damage (statistical: sum damage over many shots)
    const setup = (dummyHP) => {
      game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj' && e.kind !== 'item');
      const d = { kind: 'enemy', type: 'demon', def: { painChance: 0, hp: dummyHP }, x: p.x + 1.0, y: p.y, radius: 0.35, hp: dummyHP, alive: true, state: 'chase', mass: 1, vOffset: 0, target: 'player' };
      game.entities.push(d); return d;
    };
    p.weapon = 1; p.owned[1] = true; p.ammo.bullets = 9999; p.angle = 0; p.fireCD = 0; p.raiseT = 0;
    // no quad
    p.quad = 0; let dn = setup(100000); for (let i = 0; i < 80; i++) { p.fireCD = 0; game._fire(); } const normDmg = 100000 - dn.hp;
    // with quad
    p.quad = 30; let dq = setup(100000); for (let i = 0; i < 80; i++) { p.fireCD = 0; game._fire(); } const quadDmg = 100000 - dq.hp;
    r.quadDoubles = quadDmg > normDmg * 1.6 && quadDmg < normDmg * 2.4;

    // Radsuit blocks the toxic sludge
    game.loadLevel(8);                       // LEVEL 9 (bigger, has wastePool)
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');  // isolate sludge damage
    game.wasteDrained = false; game._setupSludgePool(game.map);
    r.hasPool = !!game.sludgeRect;
    const rr = game.sludgeRect;
    p.x = rr.x + rr.w / 2; p.y = rr.y + rr.h / 2; p.health = 100; p.radsuit = 20;
    for (let i = 0; i < 30; i++) game.update(0.05);
    r.suitProtects = p.health === 100;
    p.radsuit = 0; p.health = 100;
    for (let i = 0; i < 30; i++) game.update(0.05);
    r.sludgeBurnsWithout = p.health < 100;
    return r;
  });

  // campaign presence + bigger maps
  const out3 = await page.evaluate(() => {
    const { game } = window.__MOOD;
    const r = { found: { b: 0, u: 0, I: 0 }, maxCells: 0 };
    game.startNewGame();
    for (let li = 0; li < 9; li++) {
      game.loadLevel(li);
      r.maxCells = Math.max(r.maxCells, game.map.W * game.map.H);
      for (const t of game.map.things) { if (t.ch === 'b' || t.ch === 'u' || t.ch === 'I') r.found[t.ch]++; }
    }
    return r;
  });

  const merged = { ...out2, ...out3 };
  console.log(JSON.stringify(merged, null, 2));
  const checks = {
    'soulsphere/radsuit/quad sprites registered': (await page.evaluate(() => ['soulsphere', 'radsuit', 'quad'].every((k) => window.__MOOD.SPR[k]))),
    'soulsphere uses its sprite': out2.soulSprite,
    'soulsphere heals +100': out2.soulHeals,
    'soulsphere caps at 200': out2.soulCaps,
    'soulsphere glows': out2.soulGlows,
    'rad-suit sets a timer': out2.suitTimer,
    'rad-suit glows': out2.suitGlows,
    'quad sets a timer': out2.quadTimer,
    'quad glows': out2.quadGlows,
    'quad ~doubles weapon damage': out2.quadDoubles,
    'level 9 has a sludge pool': out2.hasPool,
    'rad-suit blocks the sludge': out2.suitProtects,
    'sludge burns without a suit': out2.sludgeBurnsWithout,
    'soulspheres fielded in campaign': out3.found.b > 0,
    'rad-suits fielded in campaign': out3.found.u > 0,
    'quads fielded in campaign': out3.found.I > 0,
    'maps are bigger (>4000 cells)': out3.maxCells > 4000,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'POWERUPS OK');
process.exit(errs.length ? 1 : 0);
