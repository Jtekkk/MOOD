// gen-levels.mjs — procedurally builds 6 valid levels and writes them as
// hand-editable text grids to src/data/levels.gen.js.
//
// Guarantees per level: uniform width, fully solid border, every floor cell
// connected, a reachable exit switch gated by a reachable keycard. Each level
// self-validates; on failure it retries with the next seed.
import { writeFileSync } from 'node:fs';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const irnd = (rng, n) => Math.floor(rng() * n);
const pick = (rng, a) => a[irnd(rng, a.length)];
const center = (r) => [r.x + (r.w >> 1), r.y + (r.h >> 1)];
function overlap(a, b, gap) {
  return a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
}

const KEY = { red: { key: 'R', door: 'r' }, blue: { key: 'U', door: 'b' }, yellow: { key: 'Y', door: 'y' } };

const CONFIGS = [
  { name: 'LEVEL 3: REFINERY', w: 34, h: 24, rooms: 8, key: 'red',
    theme: { primary: '#', accents: ['C', 'L', 'M', 'P'] }, floor: 'floor', ceil: 'ceil', sky: '#20242c',
    enemies: { z: 6, i: 5, d: 2, c: 0 }, weapons: ['2'], barrels: 4,
    items: { h: 4, H: 2, p: 3, a: 1, l: 3, L: 2, s: 3, S: 1 } },
  { name: 'LEVEL 4: FOUNDRY', w: 36, h: 24, rooms: 9, key: 'blue',
    theme: { primary: 'M', accents: ['P', 'H', 'Z', 'C'] }, floor: 'grate', ceil: 'ceil', sky: '#23201a',
    enemies: { z: 5, i: 6, d: 3, c: 1, f: 2 }, weapons: ['4'], barrels: 5,
    items: { h: 4, H: 2, p: 3, a: 1, A: 1, l: 2, L: 3, s: 2, S: 2 } },
  { name: 'LEVEL 5: THE WOUND', w: 36, h: 26, rooms: 9, key: 'yellow',
    theme: { primary: 'A', accents: ['K', 'X', 'S', 'V'] }, floor: 'blood', ceil: 'ceil', sky: '#2a1414',
    enemies: { z: 3, i: 6, d: 4, c: 2, f: 3 }, weapons: ['3'], barrels: 4,
    items: { h: 5, H: 3, p: 4, a: 1, A: 1, g: 1, s: 3, S: 2, r: 1, e: 2 } },
  { name: 'LEVEL 6: RUSTWORKS', w: 38, h: 26, rooms: 10, key: 'red',
    theme: { primary: 'Z', accents: ['M', 'P', 'H', 'C'] }, floor: 'floor2', ceil: 'ceil', sky: '#1e1a18',
    enemies: { z: 5, i: 7, d: 4, c: 3, f: 3 }, weapons: ['5'], barrels: 6,
    items: { h: 5, H: 3, p: 4, a: 1, A: 1, l: 3, L: 3, s: 3, S: 2, r: 2, e: 2 } },
  { name: 'LEVEL 7: CRYPTWORKS', w: 38, h: 28, rooms: 11, key: 'blue',
    theme: { primary: 'S', accents: ['X', 'V', 'B', 'A'] }, floor: 'floor2', ceil: 'ceil', sky: '#1c1d24',
    enemies: { z: 5, i: 8, d: 5, c: 3, f: 4, B: 1 }, weapons: ['6'], barrels: 5,
    items: { h: 6, H: 3, p: 5, a: 1, A: 1, g: 1, l: 3, L: 3, s: 3, S: 3, r: 2, e: 3, E: 2 } },
  { name: 'LEVEL 8: ICON', w: 40, h: 28, rooms: 12, key: 'yellow',
    theme: { primary: 'T', accents: ['Q', 'C', 'L', 'A', 'K'] }, floor: 'tile', ceil: 'ceil', sky: '#241a2a',
    enemies: { z: 4, i: 8, d: 6, c: 5, f: 5, B: 3 }, boss: 'G', weapons: ['6', '5', '7'], barrels: 8,
    items: { h: 7, H: 4, p: 6, a: 1, A: 1, g: 1, l: 4, L: 4, s: 4, S: 4, r: 3, e: 4, E: 3 } },
];

function carve(g, a, b, rng) {
  // 1-wide L corridor; returns the path cells
  let [x, y] = a; const path = [];
  const stepTo = (tx, ty, axis) => {
    while ((axis === 'x' && x !== tx) || (axis === 'y' && y !== ty)) {
      g[y][x] = '.'; path.push([x, y]);
      if (axis === 'x') x += Math.sign(tx - x); else y += Math.sign(ty - y);
    }
  };
  if (rng() < 0.5) { stepTo(b[0], b[1], 'x'); stepTo(b[0], b[1], 'y'); }
  else { stepTo(b[0], b[1], 'y'); stepTo(b[0], b[1], 'x'); }
  g[b[1]][b[0]] = '.'; path.push([b[0], b[1]]);
  return path;
}

function genLevel(cfg, seed) {
  const rng = mulberry32(seed);
  const W = cfg.w, H = cfg.h;
  const g = Array.from({ length: H }, () => Array(W).fill(cfg.theme.primary));
  const t = Array.from({ length: H }, () => Array(W).fill('.'));

  // place non-overlapping rooms
  const rooms = [];
  for (let tries = 0; tries < 400 && rooms.length < cfg.rooms; tries++) {
    const rw = 4 + irnd(rng, 5), rh = 4 + irnd(rng, 4);
    const rect = { x: 1 + irnd(rng, W - rw - 2), y: 1 + irnd(rng, H - rh - 2), w: rw, h: rh };
    if (rooms.some((o) => overlap(rect, o, 1))) continue;
    rooms.push(rect);
  }
  if (rooms.length < Math.max(5, cfg.rooms - 2)) return null;

  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = '.';

  // connect as a chain (guarantees connectivity); last room stays single-entrance
  const corridors = [];
  for (let i = 1; i < rooms.length; i++) corridors.push(carve(g, center(rooms[i - 1]), center(rooms[i]), rng));
  // a couple of extra loops among the non-final rooms for non-linearity
  for (let k = 0; k < 2 && rooms.length > 4; k++) {
    const a = irnd(rng, rooms.length - 1), b = irnd(rng, rooms.length - 1);
    if (a !== b) carve(g, center(rooms[a]), center(rooms[b]), rng);
  }

  // per-room accent wall textures (the ring just outside each room interior)
  for (const r of rooms) {
    const acc = pick(rng, cfg.theme.accents);
    for (let x = r.x - 1; x <= r.x + r.w; x++) for (const y of [r.y - 1, r.y + r.h]) {
      if (x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.') g[y][x] = acc;
    }
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (const x of [r.x - 1, r.x + r.w]) {
      if (x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== '.') g[y][x] = acc;
    }
  }

  // hard border
  for (let x = 0; x < W; x++) { g[0][x] = cfg.theme.primary; g[H - 1][x] = cfg.theme.primary; }
  for (let y = 0; y < H; y++) { g[y][0] = cfg.theme.primary; g[y][W - 1] = cfg.theme.primary; }

  const startRoom = rooms[0], exitRoom = rooms[rooms.length - 1];
  const [sx, sy] = center(startRoom);

  // exit switch on a perimeter wall of the exit room, away from its entrance
  const [ex, ey] = center(exitRoom);
  let exitPlaced = false;
  const exitCandidates = [[ex, exitRoom.y - 1, ex, exitRoom.y], [ex, exitRoom.y + exitRoom.h, ex, exitRoom.y + exitRoom.h - 1],
    [exitRoom.x - 1, ey, exitRoom.x, ey], [exitRoom.x + exitRoom.w, ey, exitRoom.x + exitRoom.w - 1, ey]];
  for (const [wx, wy, ix, iy] of exitCandidates) {
    if (wx > 0 && wy > 0 && wx < W - 1 && wy < H - 1 && g[wy][wx] !== '.' && g[iy][ix] === '.') {
      g[wy][wx] = '+'; exitPlaced = true; break;
    }
  }
  if (!exitPlaced) return null;

  // locked door at a pinch in the final corridor (entrance to the exit room)
  const lastCorr = corridors[corridors.length - 1] || [];
  const isWall = (x, y) => g[y] && g[y][x] !== undefined && g[y][x] !== '.' && g[y][x] !== '+';
  const pinches = lastCorr.filter(([x, y]) =>
    (isWall(x - 1, y) && isWall(x + 1, y)) || (isWall(x, y - 1) && isWall(x, y + 1)));
  if (!pinches.length) return null;
  const [dx, dy] = pinches[Math.floor(pinches.length / 2)];
  g[dy][dx] = KEY[cfg.key].door;

  // ----- things -----
  t[sy][sx] = '@';
  const occupied = new Set([`${sx},${sy}`]);
  const floorCells = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && !(x === sx && y === sy)) floorCells.push([x, y]);
  // shuffle
  for (let i = floorCells.length - 1; i > 0; i--) { const j = irnd(rng, i + 1); [floorCells[i], floorCells[j]] = [floorCells[j], floorCells[i]]; }
  const place = (ch) => {
    while (floorCells.length) {
      const [x, y] = floorCells.pop();
      if (occupied.has(`${x},${y}`)) continue;
      occupied.add(`${x},${y}`); t[y][x] = ch; return true;
    }
    return false;
  };

  // keycard in a middle room (reachable; gates the exit)
  const keyRoomIdx = 1 + irnd(rng, Math.max(1, rooms.length - 2));
  const kr = rooms[keyRoomIdx]; const kcx = kr.x + irnd(rng, kr.w), kcy = kr.y + irnd(rng, kr.h);
  t[kcy][kcx] = KEY[cfg.key].key; occupied.add(`${kcx},${kcy}`);

  // the final boss waits in the heart of the exit room (last level only)
  if (cfg.boss) {
    const br = rooms[rooms.length - 1];
    const bx = br.x + (br.w >> 1), by = br.y + (br.h >> 1);
    if (g[by][bx] === '.' && !occupied.has(`${bx},${by}`)) { t[by][bx] = cfg.boss; occupied.add(`${bx},${by}`); }
    else place(cfg.boss);
  }

  const scatter = (ch, n) => { for (let i = 0; i < n; i++) place(ch); };
  for (const [ch, n] of Object.entries(cfg.enemies)) scatter(ch, n);
  for (const w of cfg.weapons) place(w);
  scatter('o', cfg.barrels);
  for (const [ch, n] of Object.entries(cfg.items)) scatter(ch, n);

  return {
    name: cfg.name, floor: cfg.floor, ceil: cfg.ceil, sky: cfg.sky, startAngle: 0,
    walls: g.map((row) => row.join('')), things: t.map((row) => row.join('')),
  };
}

// ----- in-tool validation (mirrors tools/validate-levels.mjs) --------------
const SOLID = new Set(['#', 'B', 'M', 'S', 'A', '+', 'C', 'H', 'V', 'P', 'W', 'K', 'T', 'L', 'Z', 'X', 'Q', 'N']);
const DOORS = new Set(['D', 'r', 'b', 'y']);
function validate(lv) {
  const W = lv.walls[0].length, H = lv.walls.length;
  if (lv.walls.some((r) => r.length !== W)) return 'width';
  if (lv.things.some((r) => r.length !== W) || lv.things.length !== H) return 'things-width';
  for (let x = 0; x < W; x++) { if (!SOLID.has(lv.walls[0][x]) || !SOLID.has(lv.walls[H - 1][x])) return 'border'; }
  for (let y = 0; y < H; y++) { if (!SOLID.has(lv.walls[y][0]) || !SOLID.has(lv.walls[y][W - 1])) return 'border'; }
  // flood fill from start through non-solid (doors passable)
  let sx = -1, sy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lv.things[y][x] === '@') { sx = x; sy = y; }
  if (sx < 0) return 'no-start';
  const seen = new Uint8Array(W * H), st = [[sx, sy]]; seen[sy * W + sx] = 1; let n = 0;
  const passable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !SOLID.has(lv.walls[y][x]);
  while (st.length) { const [x, y] = st.pop(); n++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (passable(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; st.push([nx, ny]); } } }
  // exit reachable
  let exitOk = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lv.walls[y][x] === '+') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && seen[ny * W + nx]) exitOk = true; }
  }
  if (!exitOk) return 'exit-unreachable';
  // key reachable + no thing in wall
  let keyOk = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = lv.things[y][x]; if (ch === '.') continue;
    if (SOLID.has(lv.walls[y][x]) || DOORS.has(lv.walls[y][x])) return 'thing-in-wall';
    if ('RUY'.includes(ch) && seen[y * W + x]) keyOk = true;
  }
  if (!keyOk) return 'key-unreachable';
  if (n < 40) return 'too-small';
  return null;
}

// ----- build all 6 -----
const levels = [];
let li = 3;
for (const cfg of CONFIGS) {
  let made = null, err = '';
  for (let off = 0; off < 400; off++) {
    const lv = genLevel(cfg, li * 1000 + off);
    if (!lv) { err = 'gen-null'; continue; }
    err = validate(lv);
    if (!err) { made = lv; console.log(`  ${cfg.name}: ok @seed ${li * 1000 + off} (${lv.walls[0].length}x${lv.walls.length})`); break; }
  }
  if (!made) { console.error(`FAILED ${cfg.name}: ${err}`); process.exit(1); }
  levels.push(made); li++;
}

// ----- emit src/data/levels.gen.js -----
const esc = (rows) => rows.map((r) => "    '" + r + "'").join(',\n');
let src = `// AUTO-GENERATED by tools/gen-levels.mjs — do not edit by hand; re-run the tool.
// 6 procedurally built, fully-validated levels (3..8).
export const GEN_LEVELS = [\n`;
for (const lv of levels) {
  src += `  {\n    name: '${lv.name}',\n    floor: '${lv.floor}', ceil: '${lv.ceil}', skyTint: '${lv.sky}',\n    startAngle: ${lv.startAngle},\n    walls: [\n${esc(lv.walls)},\n    ],\n    things: [\n${esc(lv.things)},\n    ],\n  },\n`;
}
src += `];\n`;
writeFileSync(new URL('../src/data/levels.gen.js', import.meta.url), src);
console.log(`\nWrote src/data/levels.gen.js with ${levels.length} levels.`);
