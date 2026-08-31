// raycaster.js — software renderer. Draws into a low-res 32-bit pixel buffer
// (classic 320x200 chunky look) which is then scaled up to the display canvas.

import { TEX } from './assets.js';
import { enemyRenderSprite } from './data/enemies.js';

export const RENDER_W = 320;
export const RENDER_H = 200;
const HALF_H = RENDER_H / 2;
const PLANE = 0.66;            // camera plane length → ~66° FOV

export class Renderer {
  constructor(displayCanvas) {
    this.display = displayCanvas;
    this.dctx = displayCanvas.getContext('2d');
    this.dctx.imageSmoothingEnabled = false;

    this.off = document.createElement('canvas');
    this.off.width = RENDER_W; this.off.height = RENDER_H;
    this.octx = this.off.getContext('2d', { willReadFrequently: true });
    this.img = this.octx.createImageData(RENDER_W, RENDER_H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(RENDER_W);
  }

  // Blit the finished low-res buffer to the (larger) display canvas.
  present() {
    this.octx.putImageData(this.img, 0, 0);
    const dw = this.display.width, dh = this.display.height;
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.off, 0, 0, RENDER_W, RENDER_H, 0, 0, dw, dh);
  }

  // The offscreen 2D context, for HUD/text drawn on top of the world buffer.
  beginOverlay() {
    this.octx.putImageData(this.img, 0, 0);
    return this.octx;
  }
  presentOverlay() {
    const dw = this.display.width, dh = this.display.height;
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.off, 0, 0, RENDER_W, RENDER_H, 0, 0, dw, dh);
  }

  clear() { this.buf.fill(0xff000000); }

  renderWorld(game) {
    const p = game.player;
    const sh = game.shake || 0;
    const angle = p.angle + (sh > 0 ? (Math.random() - 0.5) * sh * 0.045 : 0);
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const planeX = -dirY * PLANE, planeY = dirX * PLANE;
    const horizon = ((HALF_H + p.pitch) + (sh > 0 ? (Math.random() - 0.5) * sh * 13 : 0)) | 0;
    this._fog = hexToPacked(game.map.skyTint || '#15171c');
    this._time = game.timer || 0;
    this._gatherLights(game);
    this._buildSky(horizon);
    this._floorCeil(game, p, dirX, dirY, planeX, planeY, horizon);
    this._walls(game, p, dirX, dirY, planeX, planeY, horizon);
    this._sprites(game, p, dirX, dirY, planeX, planeY, horizon);
    this._particles(game, p, dirX, dirY, planeX, planeY, horizon);
  }

  // Collect the active point lights for this frame into flat typed arrays:
  // static lamps + glowing projectiles + explosion effects + the muzzle flash.
  _gatherLights(game) {
    const p = game.player, t = this._time;
    const MAX = 24;
    if (!this._lx) {
      this._lx = new Float32Array(MAX); this._ly = new Float32Array(MAX);
      this._lr = new Float32Array(MAX); this._lg = new Float32Array(MAX); this._lb = new Float32Array(MAX);
      this._lrad2 = new Float32Array(MAX); this._lint = new Float32Array(MAX);
      this._lc = [0, 0, 0];
    }
    const raw = this._rawLights || (this._rawLights = []);
    raw.length = 0;
    for (const e of game.entities) {
      if (e.light && (e.kind === 'lamp' || e.kind === 'proj')) {
        const L = e.light;
        let inten = L.intensity;
        if (L.flicker) inten *= 1 + L.flicker * Math.sin(t * 9 + (L.phase || 0));
        raw.push({ x: e.x, y: e.y, r: L.r, g: L.g, b: L.b, rad: L.radius, int: inten });
      } else if (e.kind === 'effect') {
        const k = e.dur > 0 ? 1 - e.time / e.dur : 0;   // fades as it dies
        if (k > 0) raw.push({ x: e.x, y: e.y, r: 1.0, g: 0.62, b: 0.28, rad: (e.small ? 3 : 6) * (0.5 + 0.5 * k), int: 2.4 * k });
      }
    }
    if (p.weaponFlash > 0 && p.muzzle) {
      const k = p.weaponFlash / 0.09;
      raw.push({ x: p.x, y: p.y, r: p.muzzle[0], g: p.muzzle[1], b: p.muzzle[2], rad: 5.5, int: 2.6 * k });
    }
    if (raw.length > MAX) {
      raw.sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
      raw.length = MAX;
    }
    const n = raw.length;
    for (let i = 0; i < n; i++) {
      const L = raw[i];
      this._lx[i] = L.x; this._ly[i] = L.y; this._lr[i] = L.r; this._lg[i] = L.g; this._lb[i] = L.b;
      this._lrad2[i] = L.rad * L.rad; this._lint[i] = L.int;
    }
    this._ln = n;
  }

  // Accumulate light colour at world point (wx,wy) into out[3]. Quadratic falloff.
  _lightAt(wx, wy, out) {
    let r = 0, g = 0, b = 0;
    const n = this._ln, lx = this._lx, ly = this._ly, lr = this._lr, lg = this._lg, lb = this._lb, lrad2 = this._lrad2, lint = this._lint;
    for (let i = 0; i < n; i++) {
      const dx = wx - lx[i], dy = wy - ly[i], d2 = dx * dx + dy * dy, rr = lrad2[i];
      if (d2 < rr) { let a = 1 - d2 / rr; a *= a * lint[i]; r += lr[i] * a; g += lg[i] * a; b += lb[i] * a; }
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  // Precompute a per-row sky gradient (used by open-air ceiling cells).
  _buildSky(horizon) {
    if (!this._sky || this._sky.length !== RENDER_H) this._sky = new Uint32Array(RENDER_H);
    const sky = this._sky;
    // dusk gradient: lighter at the horizon, deeper blue overhead
    const topR = 30, topG = 44, topB = 78;
    const horR = 120, horG = 134, horB = 158;
    for (let y = 0; y < RENDER_H; y++) {
      const t = horizon > 0 ? Math.max(0, Math.min(1, y / horizon)) : 0; // 0 top .. 1 horizon
      const r = (topR + (horR - topR) * t) | 0;
      const g = (topG + (horG - topG) * t) | 0;
      const b = (topB + (horB - topB) * t) | 0;
      sky[y] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  // ---- floor + ceiling (per-row casting) ---------------------------------
  _floorCeil(game, p, dirX, dirY, planeX, planeY, horizon) {
    const map = game.map;
    const floorTex = TEX[map.floor] || TEX.floor;
    const ceilTex = TEX[map.ceil] || TEX.ceil;
    const waterTex = TEX.water || floorTex;
    const fp = floorTex.pixels, cp = ceilTex.pixels, wp = waterTex.pixels;
    const fw = floorTex.w, ch = ceilTex.w, ww = waterTex.w;
    const rayDirX0 = dirX - planeX, rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX, rayDirY1 = dirY + planeY;
    const buf = this.buf;
    const W = map.W, Hh = map.H;
    const fType = map.floorType, cType = map.ceilType;
    const hasTerrain = map.hasTerrain;
    const sky = this._sky;
    const t = this._time;
    const nLights = this._ln, lc = this._lc;
    // animated ripple offsets for water (whole-texel shimmer)
    const rox = Math.sin(t * 1.7) * 3, roy = Math.cos(t * 1.3) * 3;

    for (let y = 0; y < RENDER_H; y++) {
      const isFloor = y > horizon;
      const pRow = isFloor ? (y - horizon) : (horizon - y);
      if (pRow <= 0) continue;
      const rowDist = HALF_H / pRow;
      const stepX = rowDist * (rayDirX1 - rayDirX0) / RENDER_W;
      const stepY = rowDist * (rayDirY1 - rayDirY0) / RENDER_W;
      let fx = p.x + rowDist * rayDirX0;
      let fy = p.y + rowDist * rayDirY0;
      const light = lightFor(rowDist) * (isFloor ? 1 : 0.74);
      const ft = fogT(rowDist), fog = this._fog;
      const rowOff = y * RENDER_W;
      const tex = isFloor ? fp : cp;
      const tw = isFloor ? fw : ch;
      for (let x = 0; x < RENDER_W; x++) {
        const cx = Math.floor(fx), cy = Math.floor(fy);
        let terr = 0;
        if (hasTerrain && cx >= 0 && cy >= 0 && cx < W && cy < Hh) {
          terr = isFloor ? (fType && fType[cy * W + cx]) : (cType && cType[cy * W + cx]);
        }
        if (!isFloor && terr) {
          // open sky overhead — no fog, straight gradient
          buf[rowOff + x] = sky[y];
        } else if (isFloor && terr) {
          // water — sample the rippling water texture
          let tx = (fx + rox - Math.floor(fx + rox)) * ww | 0;
          let ty = (fy + roy - Math.floor(fy + roy)) * ww | 0;
          if (tx < 0) tx += ww; if (ty < 0) ty += ww;
          const c = wp[(ty * ww + tx) | 0];
          if (nLights) { this._lightAt(fx, fy, lc); buf[rowOff + x] = shadeLit(c, light, fog, ft, lc[0], lc[1], lc[2]); }
          else buf[rowOff + x] = shadeFog(c, light, fog, ft);
        } else {
          let tx = (fx - Math.floor(fx)) * tw | 0;
          let ty = (fy - Math.floor(fy)) * tw | 0;
          if (tx < 0) tx += tw; if (ty < 0) ty += tw;
          const c = tex[(ty * tw + tx) | 0];
          if (nLights) { this._lightAt(fx, fy, lc); buf[rowOff + x] = shadeLit(c, light, fog, ft, lc[0], lc[1], lc[2]); }
          else buf[rowOff + x] = shadeFog(c, light, fog, ft);
        }
        fx += stepX; fy += stepY;
      }
    }
  }

  // ---- walls (per-column DDA with sliding doors) -------------------------
  _walls(game, p, dirX, dirY, planeX, planeY, horizon) {
    const map = game.map;
    const buf = this.buf;
    for (let x = 0; x < RENDER_W; x++) {
      const cameraX = 2 * x / RENDER_W - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(p.x), mapY = Math.floor(p.y);
      const deltaX = Math.abs(1 / rayDirX), deltaY = Math.abs(1 / rayDirY);
      let stepX, stepY, sideX, sideY;
      if (rayDirX < 0) { stepX = -1; sideX = (p.x - mapX) * deltaX; }
      else { stepX = 1; sideX = (mapX + 1 - p.x) * deltaX; }
      if (rayDirY < 0) { stepY = -1; sideY = (p.y - mapY) * deltaY; }
      else { stepY = 1; sideY = (mapY + 1 - p.y) * deltaY; }

      let hit = 0, side = 0, perpDist = 0, tex = null, texXf = 0;
      for (let guard = 0; guard < 200 && !hit; guard++) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
        else { sideY += deltaY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= map.W || mapY >= map.H) { hit = 1; perpDist = 1e9; break; }

        const idx = mapY * map.W + mapX;
        const door = map.doorMap[idx];
        if (door) {
          // intersection with door's centre plane
          let dDist, coord;
          if (door.axis === 'v') {                 // plane x = mapX + 0.5
            dDist = (mapX + 0.5 - p.x) / rayDirX;
            const hy = p.y + dDist * rayDirY;
            if (dDist > 0 && Math.floor(hy) === mapY) {
              const u = hy - mapY;
              if (u >= door.open) { perpDist = dDist; tex = TEX[door.tex]; texXf = u; side = 0; hit = 1; }
            }
          } else {                                  // plane y = mapY + 0.5
            dDist = (mapY + 0.5 - p.y) / rayDirY;
            const hx = p.x + dDist * rayDirX;
            if (dDist > 0 && Math.floor(hx) === mapX) {
              const u = hx - mapX;
              if (u >= door.open) { perpDist = dDist; tex = TEX[door.tex]; texXf = u; side = 1; hit = 1; }
            }
          }
          continue; // ray passes through the open part of the door cell
        }

        const cell = map.cellChar[idx];
        if (cell !== '.' && cell !== ' ' && cell !== '@') {
          hit = 1;
          perpDist = (side === 0) ? (sideX - deltaX) : (sideY - deltaY);
          tex = TEX[wallTexName(cell)] || TEX.tech;
          const wx = (side === 0) ? (p.y + perpDist * rayDirY) : (p.x + perpDist * rayDirX);
          texXf = wx - Math.floor(wx);
          if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) texXf = 1 - texXf;
        }
      }
      this.zbuf[x] = perpDist;
      if (perpDist >= 1e8) continue;

      const lineH = (RENDER_H / perpDist) | 0;
      let drawStart = horizon - (lineH >> 1);
      let drawEnd = horizon + (lineH >> 1);
      const y0 = Math.max(0, drawStart);
      const y1 = Math.min(RENDER_H - 1, drawEnd);
      const tw = tex.w, th = tex.h;
      let texX = (texXf * tw) | 0;
      if (texX >= tw) texX = tw - 1; if (texX < 0) texX = 0;
      const light = lightFor(perpDist) * (side === 1 ? 0.70 : 1.0);
      const ft = fogT(perpDist), fog = this._fog;
      const texCol = texX;
      const stepTex = th / lineH;
      let texPos = (y0 - drawStart) * stepTex;
      // dynamic light at the wall-face hit point (constant down the column)
      let lr = 0, lg = 0, lb = 0;
      if (this._ln) {
        this._lightAt(p.x + perpDist * rayDirX, p.y + perpDist * rayDirY, this._lc);
        lr = this._lc[0]; lg = this._lc[1]; lb = this._lc[2];
      }
      const lit = (lr + lg + lb) > 0.0001;
      for (let y = y0; y <= y1; y++) {
        let ty = texPos | 0; if (ty >= th) ty = th - 1;
        const c = tex.pixels[ty * tw + texCol];
        buf[y * RENDER_W + x] = lit ? shadeLit(c, light, fog, ft, lr, lg, lb) : shadeFog(c, light, fog, ft);
        texPos += stepTex;
      }
    }
  }

  // ---- billboarded sprites ----------------------------------------------
  _sprites(game, p, dirX, dirY, planeX, planeY, horizon) {
    const ents = game.entities;
    const list = [];
    for (const e of ents) {
      if (!e.sprite) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      e._dist = dx * dx + dy * dy;
      list.push(e);
    }
    list.sort((a, b) => b._dist - a._dist);
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);
    const buf = this.buf;

    for (const e of list) {
      const relX = e.x - p.x, relY = e.y - p.y;
      const tX = invDet * (dirY * relX - dirX * relY);
      const tY = invDet * (-planeY * relX + planeX * relY); // depth
      if (tY <= 0.05) continue;
      const sprite = e.kind === 'enemy' ? enemyRenderSprite(e, p.x, p.y) : e.sprite;
      if (!sprite) continue;
      const worldH = e.spriteH || 1.0;
      const lineH = RENDER_H / tY;
      const drawH = (lineH * worldH) | 0;
      const drawW = (drawH * (sprite.w / sprite.h)) | 0;
      const vOff = (e.vOffset || 0) * lineH;
      const screenX = ((RENDER_W / 2) * (1 + tX / tY)) | 0;
      const baseY = horizon + (lineH / 2) - vOff;     // feet rest on floor
      const drawBottom = baseY | 0;
      const drawTop = (baseY - drawH) | 0;
      const x0 = Math.max(0, screenX - (drawW >> 1));
      const x1 = Math.min(RENDER_W - 1, screenX + (drawW >> 1));
      const light = e.fullbright ? 1 : lightFor(tY);
      const ft = e.fullbright ? 0 : fogT(tY) * 0.55, fog = this._fog;
      const flash = (e.kind === 'enemy' && e.flash > 0) ? 0.78 : 0;   // white hit-flash
      // dynamic light on the sprite (emitters/fullbright ignore it)
      let lr = 0, lg = 0, lb = 0;
      if (this._ln && !e.fullbright) {
        this._lightAt(e.x, e.y, this._lc);
        lr = this._lc[0]; lg = this._lc[1]; lb = this._lc[2];
      }
      const lit = (lr + lg + lb) > 0.0001;
      const tw = sprite.w, th = sprite.h, px = sprite.pixels;
      for (let x = x0; x <= x1; x++) {
        if (tY >= this.zbuf[x]) continue;             // behind a wall
        let texX = (((x - (screenX - (drawW >> 1))) * tw) / drawW) | 0;
        if (texX < 0 || texX >= tw) continue;
        const y0 = Math.max(0, drawTop), y1 = Math.min(RENDER_H - 1, drawBottom);
        for (let y = y0; y <= y1; y++) {
          let texY = (((y - drawTop) * th) / drawH) | 0;
          if (texY < 0 || texY >= th) continue;
          const c = px[texY * tw + texX];
          if ((c >>> 24) < 128) continue;             // transparent / soft edge
          let out = lit ? shadeLit(c, light, fog, ft, lr, lg, lb)
            : (light >= 1 && ft === 0) ? c : shadeFog(c, light, fog, ft);
          if (flash) out = whiten(out, flash);
          buf[y * RENDER_W + x] = out;
        }
      }
    }
  }

  // ---- particles (blood / sparks / debris) ------------------------------
  _particles(game, p, dirX, dirY, planeX, planeY, horizon) {
    const arr = game.particles;
    if (!arr || !arr.length) return;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);
    const buf = this.buf;
    for (const pt of arr) {
      const rx = pt.x - p.x, ry = pt.y - p.y;
      const tX = invDet * (dirY * rx - dirX * ry);
      const tY = invDet * (-planeY * rx + planeX * ry);
      if (tY <= 0.12) continue;
      const sx = ((RENDER_W / 2) * (1 + tX / tY)) | 0;
      if (sx < 0 || sx >= RENDER_W || tY >= this.zbuf[sx]) continue;
      const lineH = RENDER_H / tY;
      const sy = (horizon + lineH * (0.5 - pt.z)) | 0;
      const ps = lineH > 60 ? 2 : 1;
      const c = pt.color;
      for (let yy = sy; yy < sy + ps; yy++) {
        if (yy < 0 || yy >= RENDER_H) continue;
        for (let xx = sx; xx < sx + ps; xx++) {
          if (xx < 0 || xx >= RENDER_W) continue;
          buf[yy * RENDER_W + xx] = c;
        }
      }
    }
  }
}

// Distance light falloff (diminishing lighting like the original).
function lightFor(dist) {
  const l = 1.0 / (1 + dist * 0.115);
  return l < 0.36 ? 0.36 : l > 1 ? 1 : l;
}

// How much distance haze to mix in (0 near .. ~0.6 far).
function fogT(dist) {
  if (dist < 4) return 0;
  const t = (dist - 4) * 0.044;
  return t > 0.6 ? 0.6 : t;
}

// Fast packed-color shade (scale RGB by f, keep alpha 0xff).
function shadePacked(c, f) {
  const r = (c & 0xff) * f & 0xff;
  const g = ((c >>> 8) & 0xff) * f & 0xff;
  const b = ((c >>> 16) & 0xff) * f & 0xff;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// Like shadeFog, but adds per-channel dynamic light (lr,lg,lb) before fog.
function shadeLit(c, f, fog, t, lr, lg, lb) {
  let r = (c & 0xff) * (f + lr), g = ((c >>> 8) & 0xff) * (f + lg), b = ((c >>> 16) & 0xff) * (f + lb);
  if (t > 0) {
    const fr = fog & 0xff, fg = (fog >>> 8) & 0xff, fb = (fog >>> 16) & 0xff;
    r += (fr - r) * t; g += (fg - g) * t; b += (fb - b) * t;
  }
  if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
  return (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}

// Shade by light factor `f`, then blend toward fog colour by `t`.
function shadeFog(c, f, fog, t) {
  let r = (c & 0xff) * f, g = ((c >>> 8) & 0xff) * f, b = ((c >>> 16) & 0xff) * f;
  if (t > 0) {
    const fr = fog & 0xff, fg = (fog >>> 8) & 0xff, fb = (fog >>> 16) & 0xff;
    r += (fr - r) * t; g += (fg - g) * t; b += (fb - b) * t;
  }
  return (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}

// Blend a packed colour toward white by t (used for the enemy hit-flash).
function whiten(c, t) {
  let r = c & 0xff, g = (c >>> 8) & 0xff, b = (c >>> 16) & 0xff;
  r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t;
  return (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}

function hexToPacked(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

const WALL_TEX_BY_CHAR = {
  '#': 'tech', 'B': 'brick', 'M': 'metal', 'S': 'stone', 'A': 'marble', '+': 'exit',
  'C': 'console', 'H': 'hazard', 'V': 'vine', 'P': 'pipe', 'W': 'wood', 'K': 'flesh',
  'T': 'circuit', 'L': 'lightpanel', 'Z': 'rust', 'X': 'gothic', 'Q': 'crystal', 'N': 'slime',
};
function wallTexName(ch) { return WALL_TEX_BY_CHAR[ch] || 'tech'; }
