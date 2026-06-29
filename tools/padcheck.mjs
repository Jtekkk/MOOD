import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8083;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 980, height: 660 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { input } = window.__MOOD;
    const r = {};
    // Build a fake standard-mapping gamepad and stub navigator.getGamepads.
    const mkPad = (axes, pressedBtns) => ({
      connected: true, mapping: 'standard',
      axes,
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressedBtns.includes(i), value: pressedBtns.includes(i) ? 1 : 0 })),
    });
    let PAD = null;
    navigator.getGamepads = () => [PAD, null, null, null];

    // 1) push left stick up → KeyW held, hard push → run
    PAD = mkPad([0, -1, 0, 0], []);
    input.pollGamepad();
    r.up = input.down('KeyW'); r.run = input.down('ShiftLeft');
    r.notDown = !input.down('KeyS');

    // 2) left stick right → KeyD, dead-zone ignores tiny tilt
    PAD = mkPad([0.5, 0, 0, 0], []);
    input.pollGamepad();
    r.right = input.down('KeyD');
    PAD = mkPad([0.1, 0.1, 0, 0], []);
    input.pollGamepad();
    r.deadzone = !input.down('KeyD') && !input.down('KeyW') && !input.down('KeyS') && !input.down('KeyA');

    // 3) right stick X → mouseDX accumulates (look)
    input.mouseDX = 0;
    PAD = mkPad([0, 0, 1, 0], []);
    input.pollGamepad();
    r.look = input.mouseDX > 10;

    // 4) right trigger (7) → fire
    PAD = mkPad([0, 0, 0, 0], [7]);
    input.pollGamepad();
    r.fire = input.mouseDown(0);
    // release → no fire
    PAD = mkPad([0, 0, 0, 0], []);
    input.pollGamepad();
    r.fireRelease = !input.mouseDown(0);

    // 5) edge buttons fire once: shoulder (4) → Q (weapon cycle)
    input.endFrame();
    PAD = mkPad([0, 0, 0, 0], [4]);
    input.pollGamepad();
    r.qEdge = input.justPressed('KeyQ');
    input.endFrame();
    PAD = mkPad([0, 0, 0, 0], [4]);   // still held → no re-trigger
    input.pollGamepad();
    r.qNoRepeat = !input.justPressed('KeyQ');

    // 6) Start (9) → pause edge + Escape
    input.endFrame();
    PAD = mkPad([0, 0, 0, 0], [9]);
    input.pollGamepad();
    r.startEdge = input.padStartEdge && input.justPressed('Escape');

    // 7) X button (2) → use (KeyE)
    input.endFrame();
    PAD = mkPad([0, 0, 0, 0], [2]);
    input.pollGamepad();
    r.useEdge = input.justPressed('KeyE');

    // 8) no pad connected → fire cleared, no crash
    input.endFrame();
    PAD = null;
    input.pollGamepad();
    r.noPad = !input.padFire && !input.down('KeyW');
    return r;
  });
  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'stick up → forward': out.up,
    'hard push → run': out.run,
    'up is not also back': out.notDown,
    'stick right → strafe': out.right,
    'dead-zone ignores small tilt': out.deadzone,
    'right stick → look (mouseDX)': out.look,
    'trigger → fire': out.fire,
    'release → stop firing': out.fireRelease,
    'shoulder edge → weapon cycle': out.qEdge,
    'held button does not repeat': out.qNoRepeat,
    'Start → pause edge': out.startEdge,
    'X → use': out.useEdge,
    'no pad → safe + cleared': out.noPad,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'PAD OK');
process.exit(errs.length ? 1 : 0);
