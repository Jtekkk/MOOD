// Generic sprite-sheet viewer: pass a comma-list of SPR keys via SHEET env.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8093;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const KEYS = (process.env.SHEET || 'fp_pistol,fp_pistol_fire').split(',');
const COLS = +(process.env.COLS || 4);
const SC = +(process.env.SC || 2);
const NAME = process.env.NAME || 'sheet';
const BG = process.env.BG || '#9aa0a8';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.SPR', null, { timeout: 8000 });

  await page.evaluate(({ KEYS, COLS, SC, BG }) => {
    const { SPR } = window.__MOOD;
    const maxW = Math.max(...KEYS.map((k) => SPR[k] ? SPR[k].w : 1));
    const maxH = Math.max(...KEYS.map((k) => SPR[k] ? SPR[k].h : 1));
    const cw = maxW * SC + 24, ch = maxH * SC + 34;
    const rows = Math.ceil(KEYS.length / COLS);
    const cv = document.createElement('canvas');
    cv.id = 'sheet'; cv.width = COLS * cw; cv.height = rows * ch;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height);
    const tmp = document.createElement('canvas'); const tctx = tmp.getContext('2d');
    KEYS.forEach((k, i) => {
      const tex = SPR[k]; if (!tex) return;
      tmp.width = tex.w; tmp.height = tex.h;
      tctx.putImageData(new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h), 0, 0);
      const col = i % COLS, row = Math.floor(i / COLS);
      const dx = col * cw + 12, dy = row * ch + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(col * cw + 4, row * ch + 4, cw - 8, ch - 8);
      ctx.drawImage(tmp, dx, dy, tex.w * SC, tex.h * SC);
      ctx.fillStyle = '#111'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(k, col * cw + cw / 2, row * ch + ch - 8);
    });
    document.body.innerHTML = ''; document.body.appendChild(cv);
  }, { KEYS, COLS, SC, BG });
  await page.waitForTimeout(120);
  await page.locator('#sheet').screenshot({ path: `${OUT}/${NAME}.png` });
  console.log(errs.length ? 'ERRORS: ' + errs.join('; ') : `${NAME} OK`);
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}
