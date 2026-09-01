// levels.js — text-based level definitions + a parser.
//
// Levels 1-2 are hand-authored below; levels 3-8 are procedurally generated
// (see tools/gen-levels.mjs) and imported from levels.gen.js.
//
// Two parallel ASCII grids per level:
//   `walls`  — geometry. Each char is a 1x1 map cell.
//   `things` — entities placed at the centre of the matching cell.
//
// WALL legend:
//   '.' or ' ' floor (empty)   '#' tech wall      'B' brick
//   'M' metal               'S' stone          'A' marble/face wall
//   'D' door (unlocked)     'r' red door       'b' blue door   'y' yellow door
//   '+' exit switch wall
//
// THING legend (independent of walls):
//   '@' player start
//   'z' zombie  'i' imp  'd' demon  'c' cacodemon
//   'h' stimpack  'H' medikit  'p' health bonus
//   'a' green armor  'A' blue armor  'g' megasphere
//   'l' clip  'L' ammo box  's' shells  'S' shell box  'r' rocket box
//   '2' shotgun  '3' super shotgun  '4' chaingun  '5' rocket launcher
//   'R' red key  'U' blue key  'Y' yellow key
//   'o' explosive barrel   '!' lit brazier (a warm dynamic point light)
//
// Optional third grid `terrain` (same dimensions) decorates the floor/ceiling:
//   '.' nothing   '~' water (walkable, slows you, splashes)
//   '^' open sky overhead (outdoor section)   'O' outdoor pond (water + sky)

export const WALL_TEX = {
  '#': 'tech', 'B': 'brick', 'M': 'metal', 'S': 'stone', 'A': 'marble',
  'D': 'door', 'r': 'doorRed', 'b': 'doorBlue', 'y': 'doorYellow', '+': 'exit',
  // extra surfaces
  'C': 'console', 'H': 'hazard', 'V': 'vine', 'P': 'pipe', 'W': 'wood', 'K': 'flesh',
  'T': 'circuit', 'L': 'lightpanel', 'Z': 'rust', 'X': 'gothic', 'Q': 'crystal', 'N': 'slime',
};

// every non-door wall glyph (the 6 originals + the 12 new surfaces)
export const SOLID = new Set(['#', 'B', 'M', 'S', 'A', '+',
  'C', 'H', 'V', 'P', 'W', 'K', 'T', 'L', 'Z', 'X', 'Q', 'N']);
export const DOORS = new Set(['D', 'r', 'b', 'y', '%']);   // '%' = disguised secret door
export const DOOR_LOCK = { 'r': 'red', 'b': 'blue', 'y': 'yellow' };

const E1M1 = {
  name: 'LEVEL 1: ENTRYWAY',
  floor: 'floor', ceil: 'ceil', skyTint: '#20242c',
  startAngle: 0,
  walls: [
    '################################',
    '#.......................#......#',
    '#.........C.....L.......#......#',
    '#.......................#......#',
    '#...................#...r...+..#',
    '#.......................#......#',
    '#.........C.....L.......#......#',
    '#.......................#......#',
    '#.......................########',
    '#............BB................#',
    '#............BB.....#..........#',
    '#.................#............#',
    '#..............................#',
    '########.......................#',
    '#......#.......................#',
    '#......D.............#.........#',
    '#......#.......#...............#',
    '#......#.......................#',
    '#......#.......................#',
    '################################',
  ],
  things: [
    '................................',
    '...@............................',
    '..a........zz......i............',
    '......!.........................',
    '........l.......................',
    '....................!...........',
    '................................',
    '..........!.....................',
    '...H............................',
    '.....5................o......A..',
    '..........4.....................',
    '................c.....h.....R...',
    '..........i.........!.....z.....',
    '.........................d......',
    '................................',
    '...............i............3...',
    '...2..............oo......s.....',
    '.....S..........!...........r...',
    '................................',
    '................................',
  ],
};

const E1M2 = {
  name: 'LEVEL 2: UNDERHALLS',
  floor: 'tile', ceil: 'ceil', skyTint: '#241a1a',
  startAngle: 0,
  walls: [
    '################################',
    '#.......................Z......#',
    '#.........C.....L.......Z......#',
    '#.......................Z......#',
    '#...................Z...b...+..#',
    '#.......................Z......#',
    '#.........P.....C.......Z......#',
    '#.......................Z......#',
    '#.......................ZZZZZZZZ',
    '#............KK................#',
    '#............KK.....Z..........#',
    '#.................L............#',
    '#..............................#',
    'XXXXXXXX.......................#',
    'X......X.......................#',
    'X......D.............P.........#',
    'X......X.......H...............#',
    'X......X.......................#',
    'X......X.......................#',
    '################################',
  ],
  things: [
    '................................',
    '...@............................',
    '..a........dd......c............',
    '......!.........................',
    '........l.......................',
    '................................',
    '....................!...........',
    '................................',
    '...H............................',
    '.....5................o......A..',
    '..........4.....................',
    '........!.......c.....g.....U...',
    '..........d.!.............i.....',
    '.........................c......',
    '................................',
    '...............i............d...',
    '...3..............oo..!...s.....',
    '.....S......................r...',
    '................................',
    '................................',
  ],
};

import { GEN_LEVELS } from './levels.gen.js';

// A development sandbox for the height renderer: a 5-step staircase rising to
// a raised platform, plus a narrow raised walkway (a "bridge"). Not in the
// campaign — loaded by tools/heightshot.mjs.
export const HEIGHTS_LAB = {
  name: 'HEIGHTS LAB',
  floor: 'floor', ceil: 'ceil', skyTint: '#20242c',
  startAngle: -Math.PI / 2,
  walls: [
    '######################',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '######################',
  ],
  things: [
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '..........@...........',
    '......................',
    '......................',
  ],
  heights: [
    '......................',
    '......................',
    '.......5555555........',
    '.......5555555........',
    '.......5555555........',
    '.......5555555........',
    '........44444.........',
    '........33333.........',
    '........22222.........',
    '........11111.........',
    '......................',
    '...3333333............',
    '......................',
    '......................',
    '......................',
  ],
};

// A playable elevation level: climb the staircase to a raised platform, then
// cross a raised catwalk to the exit. Monsters stand up on the ledges.
const ASCENT = {
  name: 'LEVEL 3: THE ASCENT',
  floor: 'floor2', ceil: 'ceil', skyTint: '#1b2028',
  startAngle: -Math.PI / 2,
  walls: [
    '########################',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................+',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '########################',
  ],
  things: [
    '........................',
    '........................',
    '........................',
    '.....!.......z..........',
    '........................',
    '...........i............',
    '........................',
    '...........z............',
    '............!...........',
    '........................',
    '........................',
    '........................',
    '.......l.........V......',
    '...h.............v......',
    '......s...........!..2..',
    '...@.....k........i.....',
    '..........H.............',
    '........................',
  ],
  heights: [
    '........................',
    '..888...................',
    '..888...................',
    '........................',
    '........................',
    '........................',
    '.........555555.........',
    '.........555555.........',
    '.........55555544444444.',
    '.........555555.........',
    '..........4444..........',
    '..........3333..........',
    '..........2222..........',
    '..........1111..........',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  // a tall water wall (the '888' blocks) that cascades into a wading pool
  terrain: [
    '........................',
    '..~~~...................',
    '..~~~...................',
    '..~~~~..................',
    '..~~~~..................',
    '..~~~~..................',
    '..~~~~..................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  // per-cell ceilings: a low entry nook ('2' ≈ 1.8) you emerge from, opening into
  // a soaring cascade + platform hall ('8'/'9' ≈ 3.6/3.9) — real vertical drama.
  ceils: [
    '........................',
    '.88888888...............',
    '.88888888...............',
    '.88888888...............',
    '.88888888...............',
    '.88888888...............',
    '.888888888888888........',
    '........888888899999999.',
    '........888888899999999.',
    '........8888888.........',
    '........................',
    '........................',
    '........................',
    '.22222222...............',
    '.22222222...............',
    '.22222222...............',
    '.22222222...............',
    '........................',
  ],
};

// The finale: a dedicated boss arena. The exit stays sealed until the Gumbird
// is dead (see _useAction). Cover pillars, braziers, adds, and a supply cache.
const GUMBIRD_ARENA = {
  name: 'LEVEL 10: THE GUMBIRD',
  floor: 'tile', ceil: 'ceil', skyTint: '#241a2a',
  startAngle: -Math.PI / 2,
  walls: [
    '##############+#############',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#......S............S......#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#............S.............#',
    '#..........................#',
    '#..........................#',
    '#......S............S......#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '############################',
  ],
  things: [
    '............................',
    '............................',
    '..!..........!...........!..',
    '............................',
    '....c........G.........c....',
    '............................',
    '.........i........i.........',
    '............................',
    '.............f..............',
    '............................',
    '....i..................i....',
    '............................',
    '............................',
    '............................',
    '............................',
    '............................',
    '.....j.....E...E............',
    '..!......7...@...k.......!..',
    '..........H..g..H...........',
    '............................',
  ],
};

export const LEVELS = [E1M1, E1M2, ASCENT, ...GEN_LEVELS, GUMBIRD_ARENA];

// Parse a level definition into a runtime map object.
export function parseLevel(def) {
  // Normalise rows to a common width (pad short rows with wall).
  const W = Math.max(...def.walls.map((r) => r.length));
  const H = def.walls.length;
  const pad = (rows, fill) =>
    rows.map((r) => (r.length < W ? r + fill.repeat(W - r.length) : r.slice(0, W)));
  const wallRows = pad(def.walls, '#');
  const thingRows = pad(def.things || [], '.');
  const terrainRows = def.terrain ? pad(def.terrain, '.') : null;

  const cells = new Int8Array(W * H);   // 0 empty, >0 = wall kind index
  const cellChar = new Array(W * H).fill(' ');
  // optional per-cell terrain: floor type (0 normal, 1 water) + open-sky ceiling
  const floorType = new Uint8Array(W * H);
  const ceilType = new Uint8Array(W * H);
  let hasTerrain = false;
  if (terrainRows) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tc = terrainRows[y][x];
        const i = y * W + x;
        if (tc === '~' || tc === 'O') { floorType[i] = 1; hasTerrain = true; }   // water (~ pond/stream, O outdoor pond)
        if (tc === '^' || tc === 'O') { ceilType[i] = 1; hasTerrain = true; }    // open sky overhead
      }
    }
  }
  // optional per-cell block height (raised platforms / steps you can climb and
  // stand on). Chars '1'..'9' → 0.1..0.9 world units; '.'/space → base (0).
  const heightRows = def.heights ? pad(def.heights, '.') : null;
  const blockH = new Float32Array(W * H);
  let hasHeights = false;
  if (heightRows) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const hc = heightRows[y][x];
        if (hc >= '1' && hc <= '9') { blockH[y * W + x] = (hc.charCodeAt(0) - 48) * 0.2; hasHeights = true; }
      }
    }
  }
  // optional per-cell CEILING height — soaring halls and low crawl-tunnels, so
  // rooms and passages read at genuinely different elevations. Chars '1'..'9' →
  // 1.5..3.9 world units in 0.3 steps ('4' = the 2.4 default); '.'/space → 2.4.
  const ceilRows = def.ceils ? pad(def.ceils, '.') : null;
  let ceilH = null, hasCeils = false;
  if (ceilRows) {
    ceilH = new Float32Array(W * H); ceilH.fill(2.4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cc = ceilRows[y][x];
        if (cc >= '1' && cc <= '9') { ceilH[y * W + x] = 1.2 + (cc.charCodeAt(0) - 48) * 0.3; hasCeils = true; }
      }
    }
  }
  const doors = [];
  let start = null;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = wallRows[y][x] || ' ';
      cellChar[y * W + x] = ch;
      if (SOLID.has(ch)) cells[y * W + x] = 1;
      else if (DOORS.has(ch)) cells[y * W + x] = 2;  // door, dynamic solidity
    }
  }

  // Determine door orientation from neighbours and register doors.
  const isWall = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const c = cellChar[y * W + x];
    return SOLID.has(c) || DOORS.has(c);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = cellChar[y * W + x];
      if (!DOORS.has(ch)) continue;
      // axis 'h' (slides along x, blocks N-S) when E/W neighbours are walls.
      const ewWalls = isWall(x - 1, y) && isWall(x + 1, y);
      const axis = ewWalls ? 'h' : 'v';
      const secret = ch === '%';
      // a secret door wears a neighbouring wall's texture so it hides in plain sight
      let tex = WALL_TEX[ch];
      if (secret) {
        tex = 'brick';
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const nc = cellChar[ny * W + nx];
          if (nc && SOLID.has(nc) && WALL_TEX[nc]) { tex = WALL_TEX[nc]; break; }
        }
      }
      doors.push({
        x, y, axis,
        open: 0, state: 'closed', timer: 0,
        lock: DOOR_LOCK[ch] || null, secret, found: false,
        tex,
      });
    }
  }

  const things = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = thingRows[y][x] || '.';
      if (ch === '@') { start = { x: x + 0.5, y: y + 0.5 }; continue; }
      if (ch === '.' || ch === ' ') continue;
      things.push({ ch, x: x + 0.5, y: y + 0.5 });
    }
  }

  return {
    name: def.name, W, H, cells, cellChar, doors, things, floorType, ceilType, hasTerrain, blockH, hasHeights, ceilH, hasCeils,
    totalSecrets: doors.reduce((n, d) => n + (d.secret ? 1 : 0), 0),
    floor: def.floor, ceil: def.ceil, skyTint: def.skyTint || '#1a1d24',
    start: start || { x: 1.5, y: 1.5 }, startAngle: def.startAngle || 0,
  };
}
