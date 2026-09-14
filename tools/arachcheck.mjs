// White-box check for the Arachnotron (stream-plasma spider) + the Gumbird's
// new enrage phase.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = '/tmp/claude-0/-home-user-MOOD/6bb84b9f-42e6-562d-b4fe-4a7f37e96a45/scratchpad';
const PORT = 8126;
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

    r.sprites = ['arachno_walk0', 'arachno_walk1', 'arachno_attack', 'arachno_pain',
      'arachno_front_walk0', 'arachno_sideR_walk0', 'arachno_sideL_walk0', 'arachno_back_walk0',
      'arachno_die0', 'arachno_die3']
      .every((k) => SPR[k] && SPR[k].pixels && SPR[k].pixels.length);

    game.startNewGame();
    let found = 0;
    for (const li of [5, 6, 7, 8]) { game.loadLevel(li); found += game.entities.filter((e) => e.type === 'arachnotron').length; }
    r.fieldedInCampaign = found > 0;

    game.loadLevel(7);
    const arachDef = game.entities.find((e) => e.type === 'arachnotron').def;
    r.streamDef = !!(arachDef && arachDef.stream >= 3 && arachDef.proj === 'plasma');

    // the stream: one attack spawns a line of plasma bolts, all on the same
    // heading but spaced back along it (a staggered train, not a fan)
    game.loadLevel(0);
    game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'proj');
    const arach = { kind: 'enemy', type: 'arachnotron', def: arachDef, x: 4.5, y: 4.5, alive: true, state: 'chase', target: 'player', radius: 0.46 };
    game.entities.push(arach);
    game.player.x = 14.5; game.player.y = 4.5;
    game._enemyAttack(arach);
    const projs = game.entities.filter((e) => e.kind === 'proj');
    r.streamCount = projs.length === 3;
    const angs = projs.map((p) => Math.atan2(p.vy, p.vx));
    r.sameHeading = Math.max(...angs) - Math.min(...angs) < 0.01;         // a line, not a fan
    const xs = projs.map((p) => p.x); r.spacedBack = (Math.max(...xs) - Math.min(...xs)) > 0.8;
    r.usesPlasma = projs.every((p) => p.sprite === SPR.plasma);

    // the Gumbird now enrages at half health
    game.startNewGame(); game.loadLevel(9);                 // LEVEL 10 arena
    const gum = game.entities.find((e) => e.type === 'gumbird');
    r.gumbird = !!gum;
    r.gumNotEnraged = gum.enraged !== true;
    game.messages = [];
    game._damageEnemy(gum, gum.def.hp * 0.55, 'player');
    r.gumEnrages = gum.enraged === true && gum.hp > 0;
    r.gumAnnounced = game.messages.some((m) => /STREAM|ENRAGED/.test(m.text));

    // sprite sheet
    const cv = document.createElement('canvas'); cv.width = 720; cv.height = 300;
    document.body.innerHTML = ''; document.body.appendChild(cv);
    document.body.style.margin = '0'; document.body.style.background = '#12100e';
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#12100e'; ctx.fillRect(0, 0, cv.width, cv.height);
    const blit = (tex, dx, dy, s) => {
      const id = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h);
      const tmp = document.createElement('canvas'); tmp.width = tex.w; tmp.height = tex.h;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.drawImage(tmp, dx, dy, tex.w * s, tex.h * s);
    };
    ctx.fillStyle = '#ffb0b0'; ctx.font = '12px monospace';
    const rowd = [['arachno_walk0', 'front'], ['arachno_walk1', 'walk'], ['arachno_attack', 'fire'], ['arachno_sideR_walk0', 'side'], ['arachno_back_walk0', 'back'], ['arachno_die3', 'death']];
    rowd.forEach(([k, label], i) => { const dx = 8 + i * 118, dy = 20; blit(SPR[k], dx, dy, 2.4); ctx.fillText(label, dx + 20, dy + 60 * 2.4 + 16); });
    return r;
  });

  console.log(JSON.stringify(out, null, 2));
  const checks = {
    'all arachnotron sprites registered': out.sprites,
    'arachnotrons are fielded in the campaign': out.fieldedInCampaign,
    'it is a 3-bolt plasma-stream shooter': out.streamDef,
    'one attack fires a 3-bolt stream': out.streamCount,
    'the stream is one heading (a line)': out.sameHeading,
    'the bolts are spaced back into a train': out.spacedBack,
    'the stream uses the plasma bolt': out.usesPlasma,
    'the Gumbird is in its arena': out.gumbird,
    'the Gumbird is not enraged at full HP': out.gumNotEnraged,
    'the Gumbird enrages at half HP': out.gumEnrages,
    'the Gumbird enrage is announced': out.gumAnnounced,
  };
  for (const [k, v] of Object.entries(checks)) { console.log((v ? '  ✓ ' : '  ✗ ') + k); if (!v) errs.push('FAIL ' + k); }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/arachnotron.png` });
} catch (e) { errs.push('HARNESS ' + e.message + '\n' + e.stack); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'ARACHNOTRON OK');
process.exit(errs.length ? 1 : 0);
