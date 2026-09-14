// White-box check for the Mancubus: sprites, spawn, and the spread salvo.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8122;
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

    r.sprites = ['mancubus_walk0', 'mancubus_walk1', 'mancubus_attack', 'mancubus_pain',
      'mancubus_front_walk0', 'mancubus_sideR_walk0', 'mancubus_sideL_walk0', 'mancubus_back_walk0',
      'mancubus_die0', 'mancubus_die3', 'mancuball']
      .every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    // fielded across the campaign (levels 5-9)
    game.startNewGame();
    let found = 0;
    for (const li of [4, 5, 7, 8]) { game.loadLevel(li); found += game.entities.filter((e) => e.type === 'mancubus').length; }
    r.fieldedInCampaign = found > 0;

    // grab a fully-wired mancubus from a campaign level
    game.loadLevel(4);
    const man = game.entities.find((e) => e.type === 'mancubus');
    r.hp = man ? man.def.hp : 0;
    r.salvoDef = !!(man && man.def.salvo >= 3 && man.def.spread > 0 && man.def.proj === 'mancuball');

    // ---- the spread salvo: one attack fires several diverging fireballs ----
    game.loadLevel(0);
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');
    man.x = 4.5; man.y = 4.5; man.alive = true; man.state = 'chase'; man.target = 'player';
    game.entities.push(man);
    game.player.x = 14.5; game.player.y = 4.5; game.player.health = 100; game.player.invuln = 0;
    game._enemyAttack(man);
    const projs = game.entities.filter((e) => e.kind === 'proj');
    r.salvoCount = projs.length;                 // expect 3
    // the fireballs must actually diverge — spread of heading angles > 0
    const angs = projs.map((p) => Math.atan2(p.vy, p.vx));
    const spreadRad = angs.length ? Math.max(...angs) - Math.min(...angs) : 0;
    r.fanned = spreadRad > 0.3;
    r.centeredOnPlayer = Math.abs(angs.reduce((a, b) => a + b, 0) / angs.length) < 0.05; // ~aimed +x
    r.usesMancuball = projs.every((p) => p.sprite === SPR.mancuball);

    // ---- sprite sheet ----
    const cv = document.createElement('canvas'); cv.width = 820; cv.height = 320;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#1a130c';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1a130c'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    ctx.fillStyle = '#ffcf9a'; ctx.font = '12px monospace';
    const rowd = [
      ['mancubus_walk0', 'front'], ['mancubus_walk1', 'walk'], ['mancubus_attack', 'unload'],
      ['mancubus_sideR_walk0', 'side'], ['mancubus_back_walk0', 'back'], ['mancubus_die3', 'death'],
    ];
    rowd.forEach(([k, label], i) => { const dx = 8 + i * 126, dy = 14; blit(SPR[k], dx, dy, 2.0); ctx.fillText(label, dx + 16, dy + 76 * 2.0 + 16); });
    blit(SPR.mancuball, 770, 40, 2.0); ctx.fillText('ball', 780, 100);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all mancubus + fireball sprites registered': out.sprites,
    'mancubi are fielded in the campaign': out.fieldedInCampaign,
    'it is a 400-HP salvo caster': out.hp === 400 && out.salvoDef,
    'one attack fires a 3-shot salvo': out.salvoCount === 3,
    'the salvo fans out across an arc': out.fanned,
    'the spread is centred on the target': out.centeredOnPlayer,
    'the salvo uses the mancubus fireball': out.usesMancuball,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/mancubus.png` });
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'MANCUBUS OK');
process.exit(errs.length ? 1 : 0);
