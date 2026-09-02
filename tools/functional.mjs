// White-box functional test: drives the Game's internals headlessly and
// asserts on outcomes the screenshots can't show.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8097;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const errors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const results = await page.evaluate(() => {
    const out = {};
    const { game } = window.__MOOD;
    const step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) game.update(dt); };

    game.startNewGame();
    out.state0 = game.state;
    out.kills0 = game.player.kills;

    // 1) kill an enemy
    const enemy = game.entities.find((e) => e.kind === 'enemy');
    game._damageEnemy(enemy, 9999, 'player');
    out.enemyDying = enemy.state === 'dying' || enemy.state === 'dead';
    out.killsAfter = game.player.kills;
    step(15); // let death animation finish
    out.enemyDead = enemy.state === 'dead';

    // 2) barrel explodes and is removed
    const barrel = game.entities.find((e) => e.kind === 'barrel');
    const before = game.entities.length;
    game._damageBarrel(barrel, 100);
    game.entities = game.entities.filter((e) => !e._remove);
    out.barrelGone = !game.entities.includes(barrel);
    out.effectSpawned = game.entities.some((e) => e.kind === 'effect');

    // 3) pickup: drop player on an ammo box of bullets via a clip item
    const clip = game.entities.find((e) => e.kind === 'item' && e.ch === 'l');
    const bulletsBefore = game.player.ammo.bullets;
    game.player.x = clip.x; game.player.y = clip.y;
    step(2);
    out.clipPicked = !game.entities.includes(clip);
    out.bulletsGained = game.player.ammo.bullets > bulletsBefore;

    // where to stand to face a door, and a floor cell just past it (works for
    // both orientations: 'h' opens N/S, 'v' opens E/W)
    const approach = (d) => d.axis === 'h'
      ? { px: d.x + 0.5, py: d.y + 1.5, ang: -Math.PI / 2, tx: d.x + 0.5, ty: d.y - 0.5 }
      : { px: d.x + 1.5, py: d.y + 0.5, ang: Math.PI, tx: d.x - 0.5, ty: d.y + 0.5 };

    // 4) door: face a normal (unlocked) door and use it
    const normDoor = game.map.doors.find((d) => !d.lock && !d.secret);
    { const a = approach(normDoor); game.player.x = a.px; game.player.y = a.py; game.player.angle = a.ang; }
    game._useAction();
    out.doorOpening = normDoor && normDoor.state === 'opening';
    step(40); // ~2s, plenty to fully open
    out.doorOpen = normDoor.open > 0.9;

    // 5) locked door: needs its coloured key
    const exitDoor = game.map.doors.find((d) => d.lock);
    const lockColor = exitDoor.lock;
    { const a = approach(exitDoor); game.player.x = a.px; game.player.y = a.py; game.player.angle = a.ang; }
    game.player.keys[lockColor] = false;
    game._useAction();
    out.lockedStaysClosed = exitDoor.state === 'closed';
    game.player.keys[lockColor] = true;
    game._useAction();
    out.unlockedOpens = exitDoor.state === 'opening';

    // 5b) rays are blocked by a CLOSED door, pass through an OPEN one
    // (clear wandering enemies first so none crosses the ray path — determinism)
    game.entities = game.entities.filter((e) => e.kind !== 'enemy');
    const dr = normDoor, a = approach(dr);
    const target = { kind: 'enemy', x: a.tx, y: a.ty, radius: 0.3, hp: 1000, alive: true,
      state: 'chase', def: { painChance: 0 } };
    game.entities.push(target);
    game.player.x = a.px; game.player.y = a.py; game.player.angle = a.ang;
    dr.open = 0; dr.state = 'closed';             // closed
    const hpBeforeClosed = target.hp;
    game._hitscan(game.player.x, game.player.y, a.ang, 50, 6, 'player');
    out.rayBlockedByClosedDoor = target.hp === hpBeforeClosed;
    dr.open = 1;                                  // open
    game._hitscan(game.player.x, game.player.y, a.ang, 50, 6, 'player');
    out.rayThroughOpenDoor = target.hp < hpBeforeClosed;
    target._remove = true; game.entities = game.entities.filter((e) => !e._remove);

    // 5c) infighting — a monster hit by another monster retaliates against it
    const mkEnemy = (x, y) => ({ kind: 'enemy', alive: true, state: 'chase', def: { painChance: 0 }, x, y, radius: 0.3, hp: 100, mass: 1, target: 'player', cooldownTimer: 0 });
    const atk = mkEnemy(5, 5), vic = mkEnemy(6, 5);
    game.entities.push(atk, vic);
    game._damageEnemy(vic, 5, atk);
    out.infight = vic.target === atk && vic.hp === 95;
    atk._remove = true; vic._remove = true; game.entities = game.entities.filter((e) => !e._remove);

    // 5d) knockback shoves the player (impulse + blast)
    game.player.kx = 0; game.player.ky = 0;
    game._applyKnock(game.player, 1, 0, 5);
    out.knockImpulse = game.player.kx > 0.1;
    game.player.kx = 0; game.player.ky = 0; game.player.x = 10.5; game.player.y = 10.5;
    game._explode(11.2, 10.5, 2.2, 60, 'player');
    out.knockFromBlast = Math.abs(game.player.kx) > 0.1 || Math.abs(game.player.ky) > 0.1;

    // 5e) momentum — releasing input decelerates rather than instantly stopping
    game.player.vx = 3; game.player.vy = 0; game.player.kx = 0; game.player.ky = 0;
    window.__MOOD.input.keys.clear();
    game.update(0.05);
    out.momentum = game.player.vx > 0.1 && game.player.vx < 3;

    // 6) exit → intermission → next level
    game._exitLevel();
    out.intermission = game.state === 'intermission';
    game.intermission = 1; window.__MOOD.input.pressed.add('Enter');
    game.update(0.05);
    out.level2 = game.state === 'playing' && /LEVEL 2/.test(game.map.name);

    // 7) death → respawn
    game.player.health = 0;
    game.update(0.05);
    out.died = game.state === 'dead';
    game.player.deathTime = 1; window.__MOOD.input.pressed.add('KeyR');
    game.update(0.05);
    out.respawned = game.state === 'playing' && game.player.health === 100;

    return out;
  });

  console.log('RESULTS', JSON.stringify(results, null, 2));
  const checks = {
    'game started': results.state0 === 'playing',
    'enemy dies': results.enemyDying,
    'kill counted': results.killsAfter === results.kills0 + 1,
    'enemy reaches dead': results.enemyDead,
    'barrel removed': results.barrelGone,
    'explosion effect': results.effectSpawned,
    'clip picked up': results.clipPicked,
    'bullets gained': results.bulletsGained,
    'door opens on use': results.doorOpening,
    'door fully opens': results.doorOpen,
    'locked door blocks': results.lockedStaysClosed,
    'key unlocks door': results.unlockedOpens,
    'closed door blocks bullets': results.rayBlockedByClosedDoor,
    'open door lets bullets through': results.rayThroughOpenDoor,
    'infighting (retaliate vs attacker)': results.infight,
    'knockback impulse': results.knockImpulse,
    'knockback from blast': results.knockFromBlast,
    'movement momentum': results.momentum,
    'exit → intermission': results.intermission,
    'advance to level 2': results.level2,
    'player can die': results.died,
    'respawn works': results.respawned,
  };
  let pass = 0, fail = 0;
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); v ? pass++ : (fail++, errors.push('CHECK FAILED: ' + k)); }
  console.log(`\n${pass}/${pass + fail} checks passed`);
} catch (e) {
  errors.push('HARNESS: ' + e.message + '\n' + e.stack);
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}
for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED (${errors.length})` : 'ALL FUNCTIONAL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
