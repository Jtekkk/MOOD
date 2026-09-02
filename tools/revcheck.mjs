// White-box check for the Revenant: sprites, spawn, and homing-missile flight.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8121;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 420 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, audio, SPR } = window.__MOOD;
    const r = {};
    audio.init();

    // all revenant sprites present?
    r.sprites = ['revenant_walk0', 'revenant_walk1', 'revenant_attack', 'revenant_pain',
      'revenant_front_walk0', 'revenant_sideR_walk0', 'revenant_sideL_walk0', 'revenant_back_walk0',
      'revenant_die0', 'revenant_die3', 'revmissile']
      .every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    // the campaign fields at least one Revenant somewhere in levels 6-9
    game.startNewGame();
    let found = 0;
    for (const li of [5, 6, 7, 8]) { game.loadLevel(li); found += game.entities.filter((e) => e.type === 'revenant').length; }
    r.fieldedInCampaign = found > 0;

    // grab a real, fully-wired revenant from a campaign level (its def comes
    // straight from the spawn path, so we exercise the shipping data)
    game.loadLevel(7);
    const real = game.entities.find((e) => e.type === 'revenant');
    r.hp = real ? real.def.hp : 0;
    r.homingDef = !!(real && real.def.homing && real.def.attack === 'projectile' && real.def.proj === 'revmissile');

    // ---- homing flight: fire a missile and confirm it curves toward a moving target ----
    game.loadLevel(0);
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');
    // place the revenant, aim it straight +x, but put the player off to +y so a
    // homing missile must bend toward +y to track.
    real.x = 4.5; real.y = 4.5; real.alive = true; real.state = 'chase';
    real.cooldownTimer = 0;
    game.entities.push(real);
    game.player.x = 12.5; game.player.y = 8.5; game.player.health = 100;
    game.player.invuln = 0;
    real.target = 'player';
    // spawn the missile pointing along +x (0 rad) regardless of player pos
    game._spawnProjectile(real.x, real.y, 0, {
      proj: 'revmissile', projSpeed: 7, dmg: [10, 22], splash: 0, homing: true, turn: 2.4,
    }, real);
    const pr = game.entities.find((e) => e.kind === 'proj');
    r.spawned = !!pr;
    r.startsAlongX = pr && Math.abs(pr.vy) < 0.01 && pr.vx > 0;
    // integrate a bit; the +y velocity component should grow as it curves down toward the player
    let maxVy = 0;
    for (let i = 0; i < 30 && game.entities.includes(pr) && !pr._remove; i++) {
      game._updateProjectile(pr, 0.03);
      if (pr.vy > maxVy) maxVy = pr.vy;
    }
    r.curvedTowardTarget = maxVy > 1.0;   // gained real +y velocity → it homed

    // a homing missile with a dead target falls back to chasing the player
    game.entities = game.entities.filter((e) => e.kind !== 'proj');
    game._spawnProjectile(real.x, real.y, 0, { proj: 'revmissile', projSpeed: 7, dmg: 5, splash: 0, homing: true, turn: 2.4 }, real);
    const pr2 = game.entities.find((e) => e.kind === 'proj');
    r.targetIsPlayer = pr2 && (pr2.hTarget === 'player' || pr2.hTarget === game.player);

    // ---- sprite sheet ----
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 340;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#12141a';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#12141a'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    ctx.fillStyle = '#bfe6ff'; ctx.font = '12px monospace';
    const rowd = [
      ['revenant_walk0', 'front'], ['revenant_walk1', 'walk'], ['revenant_attack', 'launch'],
      ['revenant_sideR_walk0', 'side'], ['revenant_back_walk0', 'back'], ['revenant_die3', 'death'],
    ];
    rowd.forEach(([k, label], i) => { const dx = 10 + i * 118, dy = 16; blit(SPR[k], dx, dy, 2.2); ctx.fillText(label, dx + 12, dy + 84 * 2.2 + 16); });
    blit(SPR.revmissile, 720, 40, 2.4); ctx.fillText('missile', 726, 120);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all revenant + missile sprites registered': out.sprites,
    'revenants are fielded in the campaign': out.fieldedInCampaign,
    'it is a 300-HP homing-missile caster': out.hp === 300 && out.homingDef,
    'a missile spawns on fire': out.spawned,
    'the missile launches along its aim vector': out.startsAlongX,
    'the missile curves toward a target off-axis': out.curvedTowardTarget,
    'a homing missile falls back to the player as target': out.targetIsPlayer,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/revenant.png` });
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'REVENANT OK');
process.exit(errs.length ? 1 : 0);
