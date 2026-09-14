import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8112;
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

    // all arch-vile sprites present?
    r.sprites = ['archvile_walk0', 'archvile_walk1', 'archvile_attack', 'archvile_pain',
      'archvile_front_walk0', 'archvile_sideR_walk0', 'archvile_sideL_walk0', 'archvile_back_walk0',
      'archvile_die0', 'archvile_die3', 'vileflame0', 'vileflame1', 'vileflame2', 'vileflame3']
      .every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    // the arena fields a Vile
    game.startNewGame();
    game.loadLevel(9);                                   // LEVEL 10: THE GUMBIRD (arena)
    const vile = game.entities.find((e) => e.type === 'archvile');
    r.vileInArena = !!vile;
    r.vileHP = vile ? vile.hp : 0;
    r.vileAttack = vile ? vile.def.attack : '';

    // grab a monster to use as a corpse
    const corpse = game.entities.find((e) => e.kind === 'enemy' && e.type !== 'archvile' && !e.def.boss);
    // set it up as a fresh corpse right next to the Vile, with the player far off
    corpse.x = vile.x + 1.2; corpse.y = vile.y;
    corpse.state = 'dead'; corpse.alive = false; corpse.hp = -1;
    game.player.x = vile.x + 12; game.player.y = vile.y;

    // gibbed corpses can't be raised
    corpse.gibbed = true;
    r.gibNotRaised = game._findResurrectable(vile) === null;

    // a clean corpse can
    corpse.gibbed = false;
    r.corpseFound = game._findResurrectable(vile) === corpse;

    // resurrect it: back to life, off the tally, flame pillar spawned
    game.player.kills = 5;
    const fxBefore = game.entities.filter((e) => e.kind === 'effect' && e.vile).length;
    game._resurrect(vile, corpse);
    r.raisedAlive = corpse.alive && corpse.state === 'chase' && corpse.hp === corpse.def.hp;
    r.tallyKept = game.player.kills === 4;
    r.raiseFlame = game.entities.filter((e) => e.kind === 'effect' && e.vile).length > fxBefore;

    // fire attack: heavy damage + a blast away from the Vile + a flame at the target
    game.player.x = vile.x + 3; game.player.y = vile.y;
    game.player.health = 100; game.player.armor = 0; game.player.invuln = 0;
    game.player.kx = 0; game.player.ky = 0; game.player.dead = false;
    const fxB2 = game.entities.filter((e) => e.kind === 'effect' && e.vile).length;
    game._vileFire(vile);
    r.fireHurts = game.player.health < 100;
    r.fireKnocks = Math.abs(game.player.kx) > 0.01 || Math.abs(game.player.ky) > 0.01;
    r.fireFlame = game.entities.filter((e) => e.kind === 'effect' && e.vile).length > fxB2;

    // fizzle: no line of sight at ignition → the cast deals nothing
    const losOrig = game._lineOfSight.bind(game);
    game._lineOfSight = () => false;
    game.player.health = 100; game.player.kx = 0; game.player.ky = 0;
    const fxB3 = game.entities.filter((e) => e.kind === 'effect' && e.vile).length;
    vile.state = 'attack'; vile.attackTime = (vile.def.windup || 0.3) + 0.001; vile.didAttack = false;
    game._updateEnemy(vile, 0.016);
    r.fizzled = vile.didAttack && game.player.health === 100 &&
      game.entities.filter((e) => e.kind === 'effect' && e.vile).length === fxB3;
    game._lineOfSight = losOrig;

    // ---- sprite sheet for a visual confirmation ----
    const cv = document.createElement('canvas'); cv.width = 940; cv.height = 380;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#181016';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#181016'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    ctx.fillStyle = '#ffd9a0'; ctx.font = '12px monospace';
    const row = [
      ['archvile_walk0', 'front'], ['archvile_walk1', 'walk'], ['archvile_attack', 'cast'],
      ['archvile_sideR_walk0', 'side'], ['archvile_back_walk0', 'back'], ['archvile_die3', 'death'],
    ];
    row.forEach(([k, label], i) => { const dx = 10 + i * 118, dy = 16; blit(SPR[k], dx, dy, 2.2); ctx.fillText(label, dx + 12, dy + 84 * 2.2 + 16); });
    for (let i = 0; i < 4; i++) { blit(SPR['vileflame' + i], 730 + i * 52, 40, 2.4); }
    ctx.fillText('vile flame', 760, 340);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all arch-vile + flame sprites registered': out.sprites,
    'the Arch-Vile is fielded in the arena': out.vileInArena,
    'it is a 700-HP fire caster': out.vileHP === 700 && out.vileAttack === 'fire',
    'a gibbed corpse cannot be raised': out.gibNotRaised,
    'a clean corpse is found for raising': out.corpseFound,
    'resurrection restores it to the hunt': out.raisedAlive,
    'raise keeps the kill tally honest (kills--)': out.tallyKept,
    'raise erupts a flame pillar': out.raiseFlame,
    'fire attack deals damage': out.fireHurts,
    'fire attack blasts the player back': out.fireKnocks,
    'fire attack spawns a flame at the target': out.fireFlame,
    'cast fizzles with no line of sight at ignition': out.fizzled,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/archvile.png` });
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'ARCH-VILE OK');
process.exit(errs.length ? 1 : 0);
