// Rock-solid physics gate: for EVERY campaign level, walk the whole map with the
// real movement code (game._movePlayer) and prove you can traverse it — the exit
// is reachable from the start and there are no cells you can enter but not leave
// (no wedges / one-way drops), including all raised (stair/dais) geometry.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8130;
const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const errs = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__MOOD && window.__MOOD.game', null, { timeout: 8000 });

  const levelCount = await page.evaluate(() => window.__MOOD.game.constructor && window.__MOOD.LEVELN || 0);
  // discover level count
  const N = await page.evaluate(() => { const { game } = window.__MOOD; game.startNewGame(); let n = 0; try { while (true) { game.loadLevel(n); n++; if (n > 64) break; } } catch (e) {} return n; });

  for (let idx = 0; idx < N; idx++) {
    const out = await page.evaluate((idx) => {
      const { game } = window.__MOOD;
      game.startNewGame(); game.loadLevel(idx);
      const m = game.map, W = m.W, H = m.H, p = game.player;
      // open every door + drop enemies so we test the raw geometry, not key/AI gating
      for (const d of m.doors) { d.open = 1; d.state = 'open'; d.lock = null; }
      // drop movable blockers (enemies + barrels) so we test the raw geometry —
      // in play you kill/shoot those; they don't define traversability.
      game.entities = game.entities.filter((e) => e.kind !== 'enemy' && e.kind !== 'barrel');
      const solid = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return true;
        const ch = m.cellChar[y * W + x];
        return ch !== '.' && ch !== ' ' && ch !== '@' && !m.doorMap[y * W + x];   // walls; doors passable
      };
      const canStep = (ax, ay, bx, by) => {
        p.x = ax + 0.5; p.y = ay + 0.5; p.z = m.hasHeights ? m.blockH[ay * W + ax] : 0;
        p.vx = p.vy = p.kx = p.ky = 0;
        const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
        for (let i = 0; i < 40; i++) { game._movePlayer(dx * 0.05, dy * 0.05); if (Math.floor(p.x) === bx && Math.floor(p.y) === by) return true; }
        return false;
      };
      const sx = Math.floor(m.start.x), sy = Math.floor(m.start.y);
      const goals = new Set();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.cellChar[y * W + x] === '+')
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!solid(x + dx, y + dy)) goals.add((y + dy) * W + (x + dx));
      const seen = new Set([sy * W + sx]), q = [[sx, sy]], edges = [];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (solid(nx, ny) || !canStep(x, y, nx, ny)) continue;
          edges.push([y * W + x, ny * W + nx]);
          if (!seen.has(ny * W + nx)) { seen.add(ny * W + nx); q.push([nx, ny]); }
        }
      }
      const radj = new Map();
      for (const [a, b] of edges) { if (!radj.has(b)) radj.set(b, []); radj.get(b).push(a); }
      const canExit = new Set([...goals].filter((g) => seen.has(g)));
      const rq = [...canExit];
      while (rq.length) { const c = rq.shift(); for (const a of (radj.get(c) || [])) if (!canExit.has(a)) { canExit.add(a); rq.push(a); } }
      let traps = 0; const trapEx = [];
      for (const c of seen) if (!canExit.has(c)) { traps++; if (trapEx.length < 6) trapEx.push([c % W, (c / W) | 0]); }
      // elevation reachable? (at least one raised cell is in the reachable set)
      let raised = 0, raisedReached = 0;
      if (m.hasHeights) for (const c of seen) if (m.blockH[c] > 0.05) raisedReached++;
      if (m.hasHeights) for (let i = 0; i < m.blockH.length; i++) if (m.blockH[i] > 0.05) raised++;
      return { name: m.name, W, H, reachable: seen.size, exit: [...goals].some((g) => seen.has(g)), traps, trapEx, hasHeights: !!m.hasHeights, raised, raisedReached };
    }, idx);
    const ok = out.exit && out.traps === 0 && (!out.hasHeights || out.raisedReached > 0 || out.raised === 0);
    console.log(`${ok ? '  ✓' : '  ✗'} ${out.name} (${out.W}x${out.H})  reach=${out.reachable} exit=${out.exit} traps=${out.traps}` +
      (out.hasHeights ? ` elevation=${out.raisedReached}/${out.raised} cells reachable` : '') +
      (out.traps ? ` TRAPS@${JSON.stringify(out.trapEx)}` : ''));
    if (!out.exit) errs.push(`${out.name}: exit not reachable`);
    if (out.traps) errs.push(`${out.name}: ${out.traps} trap cells`);
    if (out.hasHeights && out.raised > 0 && out.raisedReached === 0) errs.push(`${out.name}: elevation unreachable`);
  }
} catch (e) { errs.push('HARNESS ' + e.message); }
finally { if (browser) await browser.close(); srv.kill('SIGTERM'); }
for (const e of errs) console.log(e);
console.log(errs.length ? `FAILED (${errs.length})` : 'PHYSICS ROCK SOLID — all levels traversable');
process.exit(errs.length ? 1 : 0);
