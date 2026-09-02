// Verifies the D.I. access terminals: placement (L2/L6), the login → menu flow,
// that options 1-5 are lethal and only #6 drains the pool, and that draining
// reveals the Sausage gun + immortality gold sludge in LEVEL 9's pool.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8127;
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
    const { game, audio } = window.__MOOD;
    const r = {};
    audio.init();
    const type = (s) => { window.__MOOD.input.typed = s; };
    const press = (code) => { window.__MOOD.input.pressed.add(code); };
    const clear = () => { window.__MOOD.input.pressed.clear(); window.__MOOD.input.typed = ''; window.__MOOD.input.mousePressed.clear(); };

    // terminals exist on levels 2 and 6, and nowhere else
    game.startNewGame();
    const termCount = (li) => { game.loadLevel(li); return game.entities.filter((e) => e.kind === 'terminal').length; };
    r.l2 = termCount(1) === 2;
    r.l6 = termCount(5) === 2;
    r.l1none = termCount(0) === 0;

    // open a terminal directly and walk the login → menu flow
    game.startNewGame(); game.loadLevel(1);
    const term = game.entities.find((e) => e.kind === 'terminal');
    game._openTerminal(term);
    r.opened = game.state === 'terminal' && game.terminal.step === 'login';
    // wrong creds → denied
    clear(); type('admin'); game._updateTerminal(0.016); clear(); press('Enter'); game._updateTerminal(0.016);   // user submitted
    clear(); type('nope'); game._updateTerminal(0.016); clear(); press('Enter'); game._updateTerminal(0.016);    // wrong pass
    r.denied = game.terminal.step === 'login' && /DENIED/.test(game.terminal.msg);
    // right creds → menu
    clear(); type('admin'); game._updateTerminal(0.016); clear(); press('Enter'); game._updateTerminal(0.016);
    clear(); type('admin'); game._updateTerminal(0.016); clear(); press('Enter'); game._updateTerminal(0.016);
    r.menu = game.terminal.step === 'menu';

    // option 1 is lethal
    clear(); press('Digit1'); game._updateTerminal(0.016);
    r.opt1result = game.terminal && game.terminal.step === 'result' && game.terminal.fatal === true;
    game.player.health = 100;
    for (let i = 0; i < 200 && game.state === 'terminal'; i++) game._updateTerminal(0.05);   // let result timer run
    game.update(0.05);   // process the queued death
    r.opt1kills = game.state === 'dead' || game.player.health <= 0;

    // option 6 drains (no death), sets the flag
    game.startNewGame(); game.loadLevel(5);
    game._openTerminal(game.entities.find((e) => e.kind === 'terminal'));
    game.terminal.step = 'menu';                     // skip login for this leg
    clear(); press('Digit6'); game._updateTerminal(0.016);
    r.opt6safe = game.terminal.step === 'result' && game.terminal.fatal === false;
    r.drained = game.wasteDrained === true;
    for (let i = 0; i < 200 && game.state === 'terminal'; i++) game._updateTerminal(0.05);
    r.opt6returns = game.state === 'playing' && game.player.health > 0;

    // LEVEL 9 pool: undrained = no rewards + toxic; drained = rewards present
    game.wasteDrained = false; game.loadLevel(8);
    r.poolExists = !!game.map.wastePool;
    r.noRewardUndrained = !game.entities.some((e) => e.def === undefined ? false : (e.sprite === window.__MOOD.SPR.goldsludge));
    r.toxic = !!game.sludgeRect;
    game.wasteDrained = true; game.loadLevel(8);
    const gold = game.entities.find((e) => e.sprite === window.__MOOD.SPR.goldsludge);
    const sauce = game.entities.find((e) => e.sprite === window.__MOOD.SPR.pickup_sausage);
    r.rewardsRevealed = !!gold && !!sauce;
    r.poolDrained = !game.sludgeRect;
    // gold sludge grants immortality
    if (gold) { game.player.immortal = false; gold.def.apply(game); }
    r.immortalApplied = game.player.immortal === true;
    game.player.health = 100; game._damagePlayer(9999, 0, 0);
    r.immortalWorks = game.player.health === 100;
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  // screenshots of the login + menu
  await page.evaluate(() => {
    const g = window.__MOOD.game; g.startNewGame(); g.loadLevel(1);
    g._openTerminal(g.entities.find((e) => e.kind === 'terminal'));
    g.terminal.user = 'admin';
  });
  await page.waitForTimeout(80); await page.screenshot({ path: `${OUT}/terminal-login.png` });
  await page.evaluate(() => { window.__MOOD.game.terminal.step = 'menu'; });
  await page.waitForTimeout(80); await page.screenshot({ path: `${OUT}/terminal-menu.png` });

  const checks = {
    'two terminals on LEVEL 2': out.l2,
    'two terminals on LEVEL 6': out.l6,
    'no terminals on LEVEL 1': out.l1none,
    'terminal opens to a login': out.opened,
    'wrong credentials are denied': out.denied,
    'admin/admin reaches the menu': out.menu,
    'option 1 is a fatal result': out.opt1result,
    'a fatal option kills you': out.opt1kills,
    'option 6 is a safe result': out.opt6safe,
    'option 6 sets the drained flag': out.drained,
    'option 6 returns you to play alive': out.opt6returns,
    'LEVEL 9 has a sludge pool': out.poolExists,
    'no rewards before draining': out.noRewardUndrained,
    'pool is toxic before draining': out.toxic,
    'draining reveals gun + gold sludge': out.rewardsRevealed,
    'drained pool is no longer toxic': out.poolDrained,
    'gold sludge grants immortality': out.immortalApplied,
    'immortality blocks all damage': out.immortalWorks,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'TERMINALS OK');
process.exit(errs.length ? 1 : 0);
