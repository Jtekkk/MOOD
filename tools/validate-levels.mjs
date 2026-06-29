// Validate level maps: uniform width, solid border, player start present,
// and that the exit switch is reachable from the start (doors are passable).
import { LEVELS, parseLevel, SOLID, DOORS } from '../src/data/levels.js';

let failures = 0;
function fail(msg) { console.error('  ✗ ' + msg); failures++; }

for (const def of LEVELS) {
  console.log('\n=== ' + def.name + ' ===');
  const W0 = def.walls[0].length;
  def.walls.forEach((r, i) => { if (r.length !== W0) fail(`wall row ${i} width ${r.length} (expected ${W0}): "${r}"`); });
  (def.things || []).forEach((r, i) => { if (r.length !== W0) fail(`thing row ${i} width ${r.length} (expected ${W0}): "${r}"`); });
  if ((def.things || []).length && def.things.length !== def.walls.length) fail('things height != walls height');

  const lvl = parseLevel(def);
  const { W, H, cellChar } = lvl;

  // border must be solid/door-free walls
  for (let x = 0; x < W; x++) {
    if (!SOLID.has(cellChar[x]) ) fail(`top border open at x=${x} ('${cellChar[x]}')`);
    if (!SOLID.has(cellChar[(H - 1) * W + x])) fail(`bottom border open at x=${x}`);
  }
  for (let y = 0; y < H; y++) {
    if (!SOLID.has(cellChar[y * W])) fail(`left border open at y=${y}`);
    if (!SOLID.has(cellChar[y * W + W - 1])) fail(`right border open at y=${y}`);
  }

  if (!lvl.start) fail('no player start (@)');

  // flood fill from start through empty + door cells
  const passable = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const c = cellChar[y * W + x];
    return !(SOLID.has(c));   // doors are passable for reachability
  };
  const sx = Math.floor(lvl.start.x), sy = Math.floor(lvl.start.y);
  const seen = new Uint8Array(W * H);
  const stack = [[sx, sy]];
  seen[sy * W + sx] = 1;
  let reached = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    reached++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (passable(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; stack.push([nx, ny]); }
    }
  }

  // exit reachable?
  let exitFound = false, exitReached = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (cellChar[y * W + x] === '+') {
      exitFound = true;
      // exit switch is a wall; reachable if any neighbour cell was reached
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && seen[ny * W + nx]) exitReached = true;
      }
    }
  }
  if (!exitFound) fail('no exit switch (+)');
  else if (!exitReached) fail('exit switch not reachable from start');

  // report things that landed on solid cells (likely a typo)
  for (const t of lvl.things) {
    const cx = Math.floor(t.x), cy = Math.floor(t.y);
    if (SOLID.has(cellChar[cy * W + cx])) fail(`thing '${t.ch}' embedded in wall at ${cx},${cy}`);
  }

  console.log(`  reachable cells: ${reached}, doors: ${lvl.doors.length}, things: ${lvl.things.length}`);
  console.log(`  exit found: ${exitFound}, exit reachable: ${exitReached}`);
}

console.log('\n' + (failures ? `FAILED with ${failures} problem(s)` : 'ALL LEVELS OK'));
process.exit(failures ? 1 : 0);
