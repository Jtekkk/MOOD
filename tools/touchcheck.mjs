import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8089;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  // emulate a phone: touch enabled, landscape
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, input } = window.__MOOD;
    const r = {};
    r.bodyTouch = document.body.classList.contains('touch');
    const root = document.getElementById('touch');
    r.overlayExists = !!root;
    if (!root) return r;

    // enter gameplay and force-show the controls for hit-testing
    game.startNewGame(); game.state = 'playing';
    root.classList.add('playing');

    const rectOf = (id) => document.getElementById(id).getBoundingClientRect();
    let nextId = 1;
    const T = (target, x, y, id) => new Touch({ identifier: id, target, clientX: x, clientY: y });
    const fire = (type, t) => root.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));

    // 1) move stick: push UP → forward (KeyW), hard push → run
    const mv = rectOf('tc-move'); const mcx = mv.left + mv.width / 2, mcy = mv.top + mv.height / 2;
    let id = nextId++; let t = T(root, mcx, mv.top + 2, id);       // near top edge = full up
    fire('touchstart', t); fire('touchmove', t);
    r.up = input.down('KeyW'); r.run = input.down('ShiftLeft'); r.notBack = !input.down('KeyS');
    // move DOWN → back
    t = T(root, mcx, mv.bottom - 2, id); fire('touchmove', t);
    r.down = input.down('KeyS') && !input.down('KeyW');
    // release → cleared
    fire('touchend', t);
    r.moveCleared = !input.down('KeyS') && !input.down('KeyW');

    // 2) fire pad → mouseDown(0)
    const f = rectOf('tc-fire'); id = nextId++; t = T(root, f.left + f.width / 2, f.top + f.height / 2, id);
    fire('touchstart', t);
    r.fire = input.mouseDown(0);
    fire('touchend', t);
    r.fireReleased = !input.mouseDown(0);

    // 3) look drag on bare area → mouseDX accumulates
    input.mouseDX = 0;
    id = nextId++; const lx = 422, ly = 150;
    t = T(root, lx, ly, id); fire('touchstart', t);
    t = T(root, lx + 60, ly, id); fire('touchmove', t);
    r.look = input.mouseDX > 10;
    fire('touchend', t);

    // 4) USE button → KeyE edge
    input.pressed.clear();
    const u = rectOf('tc-use'); id = nextId++; t = T(root, u.left + u.width / 2, u.top + u.height / 2, id);
    fire('touchstart', t); r.use = input.justPressed('KeyE'); fire('touchend', t);

    // 5) WPN button → KeyQ edge
    input.pressed.clear();
    const w = rectOf('tc-wpn'); id = nextId++; t = T(root, w.left + w.width / 2, w.top + w.height / 2, id);
    fire('touchstart', t); r.wpn = input.justPressed('KeyQ'); fire('touchend', t);

    // 6) multi-touch: move + fire at once
    input.touchDown.clear(); input.touchFire = false;
    const idM = nextId++, idF = nextId++;
    const tm = T(root, mcx, mv.top + 2, idM), tf = T(root, f.left + f.width / 2, f.top + f.height / 2, idF);
    root.dispatchEvent(new TouchEvent('touchstart', { touches: [tm], targetTouches: [tm], changedTouches: [tm], bubbles: true, cancelable: true }));
    root.dispatchEvent(new TouchEvent('touchstart', { touches: [tm, tf], targetTouches: [tf], changedTouches: [tf], bubbles: true, cancelable: true }));
    r.multi = input.down('KeyW') && input.mouseDown(0);

    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'body gets .touch class': out.bodyTouch,
    'overlay built': out.overlayExists,
    'stick up → forward': out.up,
    'hard push → run': out.run,
    'up is not back': out.notBack,
    'stick down → back': out.down,
    'release clears movement': out.moveCleared,
    'fire pad → firing': out.fire,
    'release → stop firing': out.fireReleased,
    'drag look → mouseDX': out.look,
    'USE → KeyE': out.use,
    'WPN → KeyQ': out.wpn,
    'multi-touch move + fire': out.multi,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }

  // screenshot the on-screen controls in play
  await page.evaluate(() => { window.__MOOD.game.state = 'playing'; document.getElementById('touch').classList.add('playing'); });
  await page.waitForTimeout(160);
  await page.screenshot({ path: `${OUT}/touch-controls.png` });
  await ctx.close();
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'TOUCH OK');
process.exit(errs.length ? 1 : 0);
