// levels.js — text-based level definitions + a parser.
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
//   'o' explosive barrel

export const WALL_TEX = {
  '#': 'tech', 'B': 'brick', 'M': 'metal', 'S': 'stone', 'A': 'marble',
  'D': 'door', 'r': 'doorRed', 'b': 'doorBlue', 'y': 'doorYellow', '+': 'exit',
};

export const SOLID = new Set(['#', 'B', 'M', 'S', 'A', '+']);
export const DOORS = new Set(['D', 'r', 'b', 'y']);
export const DOOR_LOCK = { 'r': 'red', 'b': 'blue', 'y': 'yellow' };

const E1M1 = {
  name: 'LEVEL 1: ENTRYWAY',
  floor: 'floor', ceil: 'ceil', skyTint: '#20242c',
  startAngle: 0,
  walls: [
    '################################',
    '#.......................#......#',
    '#.........#.....#.......#......#',
    '#.......................#......#',
    '#...................#...r...+..#',
    '#.......................#......#',
    '#.........#.....#.......#......#',
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
    '................................',
    '........l.......................',
    '................................',
    '................................',
    '................................',
    '...H............................',
    '.....5................o......A..',
    '..........4.....................',
    '................c.....h.....R...',
    '..........i...............z.....',
    '.........................d......',
    '................................',
    '...............i............3...',
    '...2..............oo......s.....',
    '.....S......................r...',
    '................................',
    '................................',
  ],
};

const E1M2 = {
  name: 'LEVEL 2: UNDERHALLS',
  floor: 'floor2', ceil: 'ceil', skyTint: '#241a1a',
  startAngle: 0,
  walls: [
    '################################',
    '#.......................#......#',
    '#.........M.....M.......#......#',
    '#.......................#......#',
    '#...................M...b...+..#',
    '#.......................#......#',
    '#.........M.....M.......#......#',
    '#.......................#......#',
    '#.......................########',
    '#............AA................#',
    '#............AA.....M..........#',
    '#.................M............#',
    '#..............................#',
    '########.......................#',
    '#......#.......................#',
    '#......D.............M.........#',
    '#......#.......M...............#',
    '#......#.......................#',
    '#......#.......................#',
    '################################',
  ],
  things: [
    '................................',
    '...@............................',
    '..a........dd......c............',
    '................................',
    '........l.......................',
    '................................',
    '................................',
    '................................',
    '...H............................',
    '.....5................o......A..',
    '..........4.....................',
    '................c.....g.....U...',
    '..........d...............i.....',
    '.........................c......',
    '................................',
    '...............i............d...',
    '...3..............oo......s.....',
    '.....S......................r...',
    '................................',
    '................................',
  ],
};

export const LEVELS = [E1M1, E1M2];

// Parse a level definition into a runtime map object.
export function parseLevel(def) {
  // Normalise rows to a common width (pad short rows with wall).
  const W = Math.max(...def.walls.map((r) => r.length));
  const H = def.walls.length;
  const pad = (rows, fill) =>
    rows.map((r) => (r.length < W ? r + fill.repeat(W - r.length) : r.slice(0, W)));
  const wallRows = pad(def.walls, '#');
  const thingRows = pad(def.things || [], '.');

  const cells = new Int8Array(W * H);   // 0 empty, >0 = wall kind index
  const cellChar = new Array(W * H).fill(' ');
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
      doors.push({
        x, y, axis,
        open: 0, state: 'closed', timer: 0,
        lock: DOOR_LOCK[ch] || null,
        tex: WALL_TEX[ch],
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
    name: def.name, W, H, cells, cellChar, doors, things,
    floor: def.floor, ceil: def.ceil, skyTint: def.skyTint || '#1a1d24',
    start: start || { x: 1.5, y: 1.5 }, startAngle: def.startAngle || 0,
  };
}
