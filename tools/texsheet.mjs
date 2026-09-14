import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8091;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const KEYS = (process.env.TEXS || '').split(',').filter(Boolean);
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.TEX', null, { timeout: 8000 });
  await page.evaluate((KEYS) => {
    const { TEX } = window.__MOOD;
    const keys = KEYS.length ? KEYS : Object.keys(TEX);
    const SC = 3, cell = 64 * SC + 12, lab = 22, cols = 5;
    const rows = Math.ceil(keys.length / cols);
    const cv = document.createElement('canvas'); cv.id = 'tex';
    cv.width = cols * cell; cv.height = rows * (cell + lab);
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, cv.width, cv.height);
    const tmp = document.createElement('canvas'); tmp.width = 64; tmp.height = 64; const tctx = tmp.getContext('2d');
    keys.forEach((k, i) => {
      const t = TEX[k]; if (!t) return;
      tctx.putImageData(new ImageData(new Uint8ClampedArray(t.pixels.buffer.slice(0)), t.w, t.h), 0, 0);
      const x = (i % cols) * cell + 6, y = Math.floor(i / cols) * (cell + lab) + 6;
      // draw 2x2 tiled to show seams
      ctx.drawImage(tmp, x, y, 64 * SC, 64 * SC);
      ctx.fillStyle = '#eee'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(k, x + 32 * SC, y + 64 * SC + 15);
    });
    document.body.innerHTML = ''; document.body.appendChild(cv);
  }, KEYS);
  await page.waitForTimeout(120);
  await page.locator('#tex').screenshot({ path: `${OUT}/surfaces.png` });
  console.log(errs.length ? 'ERR: ' + errs.join(';') : 'surfaces OK');
} finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
