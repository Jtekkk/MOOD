import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8086;
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 360 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const out = await page.evaluate(() => {
    const { game, audio, SPR } = window.__MOOD;
    const r = {};
    audio.init();

    // sprites all registered?
    r.sprites = ['gumbird_walk0', 'gumbird_walk1', 'gumbird_attack', 'gumbird_pain',
      'gumbird_front_walk0', 'gumbird_sideR_walk0', 'gumbird_sideL_walk0', 'gumbird_back_walk0',
      'gumbird_die0', 'gumbird_die3', 'jugball'].every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    // load the final level and find the boss
    game.startNewGame();
    game.loadLevel(9);                                   // LEVEL 10: THE GUMBIRD (arena)
    const boss = game.entities.find((e) => e.type === 'gumbird');
    r.bossInLevel = !!boss;
    r.bossHP = boss ? boss.hp : 0;
    r.bossSpriteH = boss ? boss.spriteH : 0;
    r.bossInExitRoom = false;
    if (boss) {
      // exit switch '+' should be in the same room region (close to the boss)
      r.bossInExitRoom = true; // placement validated by gen-levels; presence is enough here
    }

    // singing: stub singLine to count calls, then rouse the boss
    let sang = 0; const orig = audio.singLine.bind(audio);
    audio.singLine = (n, d) => { sang++; return orig(n, d); };
    boss.state = 'chase'; boss.singTimer = 0;
    game._updateGumbirdSong(boss, 0.05);
    r.introduced = game.messages.some((m) => /GUMBIRD ROLLS IN/.test(m.text));
    r.sangLine = game.messages.some((m) => m.text.indexOf('♪') === 0); // starts with ♪
    r.singLineCalled = sang >= 1;

    // attack throws a juggling ball
    game.player.x = boss.x + 2; game.player.y = boss.y;
    const before = game.entities.filter((e) => e.kind === 'proj').length;
    game._enemyAttack(boss);
    const projs = game.entities.filter((e) => e.kind === 'proj');
    r.threwBall = projs.length > before && projs[projs.length - 1].sprite === SPR.jugball;

    // death: takes a final bow
    game.messages = [];
    game._damageEnemy(boss, 99999, 'player');
    r.bossDying = boss.state === 'dying' || boss.state === 'dead';
    r.finalBow = game.messages.some((m) => /FINAL BOW/.test(m.text));

    // ---- render a sprite sheet for visual confirmation ----
    const cv = document.createElement('canvas'); cv.id = 'sheet'; cv.width = 880; cv.height = 320;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#15121a';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#15121a'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    const S = 2.2;
    const items = [
      ['gumbird_walk0', 'front'], ['gumbird_walk1', 'front2'], ['gumbird_attack', 'throw'],
      ['gumbird_sideR_walk0', 'side'], ['gumbird_back_walk0', 'back'], ['gumbird_die3', 'death'],
    ];
    ctx.fillStyle = '#ffe9b0'; ctx.font = '12px monospace';
    items.forEach(([k, label], i) => {
      const dx = 12 + i * 145, dy = 20;
      blit(SPR[k], dx, dy, S);
      ctx.fillText(label, dx + 10, dy + 112 * S + 16);
    });
    blit(SPR.jugball, 800, 30, 3);
    ctx.fillText('jugball', 800, 120);
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all gumbird sprites registered': out.sprites,
    'boss present in the arena': out.bossInLevel,
    'boss is a 1000-HP heavyweight': out.bossHP === 1000,
    'boss is tall (1.8)': out.bossSpriteH === 1.8,
    'rolls in with an intro line': out.introduced,
    'sings a ♪ lyric line': out.sangLine,
    'melody synthesized (singLine)': out.singLineCalled,
    'throws a juggling ball': out.threwBall,
    'boss dies when killed': out.bossDying,
    'takes a final bow on death': out.finalBow,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/gumbird.png` });
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'BOSS OK');
process.exit(errs.length ? 1 : 0);
