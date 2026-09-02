// White-box check for THE DUKETTE (LEVEL 5 boss): sprites, spawn, boss traits,
// the exit seal while it lives, quips, and its gold-blast salvo.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8124;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 460 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, audio, SPR } = window.__MOOD;
    const r = {};
    audio.init();

    r.sprites = ['dukette_walk0', 'dukette_walk1', 'dukette_attack', 'dukette_pain',
      'dukette_front_walk0', 'dukette_sideR_walk0', 'dukette_sideL_walk0', 'dukette_back_walk0',
      'dukette_die0', 'dukette_die3', 'dukeblast']
      .every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    // LEVEL 5 fields exactly the Dukette as a boss
    game.startNewGame();
    game.loadLevel(4);                       // LEVEL 5: FOUNDRY
    const duke = game.entities.find((e) => e.type === 'dukette');
    r.inLevel5 = !!duke;
    r.isBoss = !!(duke && duke.def.boss);
    r.hp = duke ? duke.def.hp : 0;
    r.hasQuips = !!(duke && Array.isArray(duke.def.quips) && duke.def.quips.length >= 3);

    // exit stays sealed while the boss lives, opens once it's dead
    // stand the player on a cell facing the exit switch
    let exitCell = null;
    for (let y = 0; y < game.map.H && !exitCell; y++) for (let x = 0; x < game.map.W; x++) {
      if (game.map.cellChar[y * game.map.W + x] === '+') { exitCell = { x, y }; break; }
    }
    r.exitExists = !!exitCell;
    // put the player right in front of the switch, facing it
    game.player.x = exitCell.x + 0.5; game.player.y = exitCell.y + 1.5; game.player.angle = -Math.PI / 2;
    // ensure a boss is alive somewhere
    duke.alive = true; duke.state = 'chase';
    const before = game.state;
    game._useAction();
    r.sealedWhileAlive = game.state === before && game.state !== 'intermission';
    // kill the boss, then the switch should exit
    duke.alive = false; duke.state = 'dead';
    game._useAction();
    r.exitOpensWhenDead = game.state === 'intermission';

    // quip fires when it first sees the player (throttled thereafter)
    game.loadLevel(4);
    const ddef = game.entities.find((e) => e.type === 'dukette').def;
    const d2 = { def: ddef, target: 'player', _quipT: 0, x: 5, y: 5, alive: true, state: 'chase' };
    game.timer = 100;                        // well past any stale _quipT
    game.messages = [];
    game._bossQuip(d2, 1);
    r.quips = game.messages.some((m) => ddef.quips.includes(m.text));

    // the salvo: one attack fans 3 gold blasts, centred on the player
    game.loadLevel(0);
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');
    d2.x = 4.5; d2.y = 4.5; d2.alive = true; d2.state = 'chase'; d2.target = 'player';
    game.entities.push(d2);
    game.player.x = 14.5; game.player.y = 4.5;
    game._enemyAttack(d2);
    const projs = game.entities.filter((e) => e.kind === 'proj');
    r.salvo = projs.length === 3 && projs.every((p) => p.sprite === SPR.dukeblast);

    // phase-two enrage: crossing half HP flips her enraged, and the salvo grows
    r.notEnragedFull = d2.enraged !== true;
    d2.hp = d2.def.hp; game.messages = [];
    game._damageEnemy(d2, d2.def.hp * 0.55, 'player');   // drop below 50%
    r.enragedAtHalf = d2.enraged === true && d2.hp > 0;
    r.enrageAnnounced = game.messages.some((m) => /DRESS|ENRAGED/.test(m.text));
    game.entities = game.entities.filter((e) => e.kind !== 'proj');
    game._enemyAttack(d2);
    r.enragedSalvo = game.entities.filter((e) => e.kind === 'proj').length === 4;

    // ---- sprite sheet ----
    const cv = document.createElement('canvas'); cv.width = 760; cv.height = 380;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#141018';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#141018'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    ctx.fillStyle = '#ffd9a0'; ctx.font = '12px monospace';
    const rowd = [
      ['dukette_walk0', 'front'], ['dukette_walk1', 'walk'], ['dukette_attack', 'blast'],
      ['dukette_sideR_walk0', 'side'], ['dukette_back_walk0', 'back'], ['dukette_die3', 'death'],
    ];
    rowd.forEach(([k, label], i) => { const dx = 6 + i * 120, dy = 12; blit(SPR[k], dx, dy, 1.9); ctx.fillText(label, dx + 12, dy + 92 * 1.9 + 14); });
    blit(SPR.dukeblast, 706, 40, 1.9); ctx.fillText('blast', 706, 100);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all dukette + blast sprites registered': out.sprites,
    'the Dukette is fielded in LEVEL 5': out.inLevel5,
    'she is flagged as a boss': out.isBoss,
    'she is an 800-HP boss': out.hp === 800,
    'she has parody quips': out.hasQuips,
    'the level has an exit switch': out.exitExists,
    'exit is sealed while the boss lives': out.sealedWhileAlive,
    'exit opens once the boss is dead': out.exitOpensWhenDead,
    'she barks a quip on sight': out.quips,
    'her attack fans a 3-shot gold salvo': out.salvo,
    'she is not enraged at full health': out.notEnragedFull,
    'she enrages at half health': out.enragedAtHalf,
    'the enrage is announced': out.enrageAnnounced,
    'enraged, the salvo grows to 4 shots': out.enragedSalvo,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/dukette.png` });
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'DUKETTE OK');
process.exit(errs.length ? 1 : 0);
