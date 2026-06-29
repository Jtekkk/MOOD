// Render all nine Nic-Cage face moods to a labeled sheet and screenshot it.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8095;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 760, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.SPR', null, { timeout: 8000 });

  await page.evaluate(() => {
    const { SPR, FACE_MOODS } = window.__MOOD;
    const labels = { happy: 'HAPPY', carefree: 'CAREFREE', relaxed: 'RELAXED', excited: 'EXCITED', focused: 'FOCUSED', stressed: 'STRESSED', angry: 'ANGRY', bees: 'BEES!!!', meh: 'MEH' };
    const SC = 4, fw = 48 * SC, fh = 56 * SC, pad = 16, cols = 3;
    const cellW = fw + pad * 2, cellH = fh + pad + 30;
    const cv = document.createElement('canvas');
    cv.id = 'facesheet';
    cv.width = cols * cellW; cv.height = 30 + 3 * cellH;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#111'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
    ctx.fillText("MOOD — TODAY I'M FEELING...", cv.width / 2, 24);
    const tmp = document.createElement('canvas'); tmp.width = 48; tmp.height = 56;
    const tctx = tmp.getContext('2d');
    FACE_MOODS.forEach((m, i) => {
      const tex = SPR[`face_0_${m}`];
      const img = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), 48, 56);
      tctx.putImageData(img, 0, 0);
      const cx = (i % cols) * cellW + pad, cy = 40 + Math.floor(i / cols) * cellH + pad;
      ctx.fillStyle = '#1a0d0d'; ctx.fillRect(cx - 2, cy - 2, fw + 4, fh + 4);
      ctx.drawImage(tmp, cx, cy, fw, fh);
      ctx.fillStyle = '#111'; ctx.font = 'bold 18px monospace';
      ctx.fillText(labels[m], cx + fw / 2, cy + fh + 22);
    });
    document.body.innerHTML = ''; document.body.appendChild(cv);
  });
  await page.waitForTimeout(150);
  await page.locator('#facesheet').screenshot({ path: `${OUT}/06-facesheet.png` });
  console.log(errs.length ? 'ERRORS: ' + errs.join('; ') : 'facesheet OK');
} finally {
  if (browser) await browser.close();
  srv.kill('SIGTERM');
}
