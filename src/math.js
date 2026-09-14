// math.js — small math/color helpers shared across MOOD.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Normalize an angle into [-PI, PI).
export function normalizeAngle(a) {
  a = a % TAU;
  if (a < -Math.PI) a += TAU;
  else if (a >= Math.PI) a -= TAU;
  return a;
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// Pack RGBA into a little-endian Uint32 (matches ImageData byte order: 0xAABBGGRR).
export function rgba(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Scale the RGB channels of a packed color by `f` (0..1), preserving alpha.
// Used for distance/diminished-light shading.
export function shade(color, f) {
  const a = (color >>> 24) & 0xff;
  const b = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const r = color & 0xff;
  return rgba(
    (r * f) | 0,
    (g * f) | 0,
    (b * f) | 0,
    a
  );
}

// Linear blend between two packed colors, t in [0,1].
export function mixColor(c0, c1, t) {
  const r0 = c0 & 0xff, g0 = (c0 >>> 8) & 0xff, b0 = (c0 >>> 16) & 0xff;
  const r1 = c1 & 0xff, g1 = (c1 >>> 8) & 0xff, b1 = (c1 >>> 16) & 0xff;
  return rgba(
    lerp(r0, r1, t) | 0,
    lerp(g0, g1, t) | 0,
    lerp(b0, b1, t) | 0,
    255
  );
}

export function randInt(n) {
  return (Math.random() * n) | 0;
}

export function choice(arr) {
  return arr[(Math.random() * arr.length) | 0];
}
