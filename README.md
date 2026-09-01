# MOOD

**A reverse-engineered knockoff of Doom II — built from scratch in a browser.**

MOOD is a self-contained, dependency-free first-person shooter in the spirit of
*Doom II: Hell on Earth*. It runs in any modern browser using a hand-written
**software raycasting renderer** (no WebGL, no game engine, no build step).
Every texture, sprite, sound effect, and level is **generated procedurally at
runtime** (background music streams from bundled MP3 tracks) — there are no Doom
assets in this repo. It's an homage, not a copy.

![MOOD title screen](docs/screens/title.png)
![MOOD gameplay](docs/screens/gameplay.png)

---

## Play it

No install, no build. You just need a static file server (ES modules can't load
over `file://`). With Node installed:

```bash
npm start            # serves on http://localhost:8080
# or:  node server.mjs
# or any static server, e.g.  python3 -m http.server 8080
```

Then open **http://localhost:8080** and click the screen.

### On a phone or tablet

The same URL works on touch devices — load it in mobile Chrome/Safari (turn the
phone **landscape**) and an on-screen control layer appears automatically: a
virtual movement stick (bottom-left), a **FIRE** pad and **USE**/**WPN** buttons
(bottom-right), **MAP** + pause (top-right), and *drag anywhere else to look*.
For the best result, add it to your home screen so it runs full-screen.

### As a desktop app (Windows `.exe`, macOS, Linux)

MOOD can be packaged into a standalone desktop app with
[Electron](https://www.electronjs.org/). The wrapper (`electron/main.js`) boots
the bundled static server on a private port and opens the game in a window.

```bash
npm install                  # pulls electron + electron-builder (dev only)
npm run desktop              # run the desktop app locally (no packaging)

npm run dist:win             # build a Windows installer + portable .exe
npm run dist:mac             # build a macOS .dmg
npm run dist:linux           # build a Linux AppImage
```

Installers land in `dist-electron/` (e.g. `MOOD Setup 0.1.0.exe` plus a portable
`MOOD 0.1.0.exe`). **Build each target on that OS** — producing a Windows `.exe`
is most reliable *on Windows*. The game itself stays a zero-dependency browser
app; Electron is only used for packaging.

**Don't have a Windows PC?** A GitHub Actions workflow
(`.github/workflows/build-desktop.yml`) builds the `.exe` for you on GitHub's
**Windows runner** — no local toolchain needed:

- It runs automatically on every push to the dev branch; grab the `MOOD-windows`
  artifact from the **Actions** tab of the run.
- Or push a tag (`git tag v0.1.0 && git push --tags`) and it attaches the
  Windows `.exe`, macOS `.dmg`, and Linux `AppImage` to a **GitHub Release**.

### Host it on the web (Porkbun / Netlify / GitHub Pages / any static host)

MOOD is a **pure static site** — there's no backend, no build needed, just files
served over HTTP(S). To get a clean, upload-ready folder (without the dev-only
server/tools/electron bits):

```bash
npm run build:web      # → writes dist-web/  (zero dependencies)
```

Then upload **the contents of `dist-web/`** to your host, keeping the folder
structure intact (`index.html` at the top, with `src/` and `assets/` beside it).

**On Porkbun static hosting:** open your domain's *Static Hosting* / file
manager, upload everything inside `dist-web/` (drag the `index.html`, `styles.css`,
`src/` folder, and `assets/` folder into the web root, or zip the folder's
*contents* and upload the zip), and visit your domain. It works in a subfolder
too (e.g. `yourdomain.com/mood/`) because every path is relative.

Notes:
- It's ~28 MB, almost all of it the seven background-music MP3s in
  `assets/music/`. Delete tracks you don't want (and the matching entries in
  `setTracks([...])` in `src/main.js`) to shrink it.
- Phones get the on-screen touch controls automatically; desktop gets
  keyboard/mouse + gamepad. Serve over **HTTPS** so pointer-lock mouselook works.

## Controls

| Action            | Keyboard & mouse                      | Gamepad                       |
| ----------------- | ------------------------------------- | ----------------------------- |
| Move              | `W` `A` `S` `D` / arrow keys          | Left stick / d-pad            |
| Look              | Mouse (click to capture) / `←` `→`    | Right stick                   |
| Fire              | Left mouse / `Ctrl`                   | Right trigger / `A`           |
| Use door / switch | `E` / `Space` / `F`                   | `X` / `B`                     |
| Run               | `Shift`                               | Push left stick fully         |
| Select weapon     | `1`–`8` (`Q` cycles)                  | Shoulders cycle               |
| Pause             | `Esc`                                 | `Start`                       |
| Automap           | `Tab`                                 | —                             |
| Options           | `O` (from title or pause)             | —                             |
| Mute              | `M`                                   | `Y`                           |

A gamepad (Xbox/standard mapping) is detected automatically when connected, and
on touch devices an on-screen control layer appears automatically (see above).

**Goal:** clear the level and reach the **EXIT** switch. Some doors are locked —
find the matching keycard.

---

## Features

- **Raycasting engine** rendering at a chunky 320×200 internal buffer, scaled up
  with crisp nearest-neighbour pixels. Textured walls, per-row floor/ceiling
  casting, and a depth buffer so sprites clip correctly behind walls.
- **Height / elevation engine:** a per-column renderer (kept separate from the
  flat path) gives real **stairs, raised platforms, ledges, and catwalks** — the
  camera rides at your standing height, you climb one step at a time, tall ledges
  block you (take the stairs), and you can drop off edges. Monsters stand up on
  the ledges. Showcased in **LEVEL 3: THE ASCENT**.
- **Dynamic coloured lighting:** real point lights spill onto floors, walls, and
  monsters — lit **braziers** (warm, flickering), glowing **projectiles** (blue
  plasma, orange fireballs, green BFG bolts), **muzzle flashes** that light the
  room when you fire, and **explosions** that flash bright. Per-pixel on the
  floors/ceilings, with quadratic falloff and per-light colour, composited under
  the fog.
- **Atmosphere:** diminishing distance lighting plus a distance **fog** that
  fades the world toward each level's mood colour, a screen **vignette**, and a
  baked dark **outline** on every monster and pickup so they read against the
  gloom. All hand-drawn procedurally — shaded weapons, volume-lit demons,
  panelled tech walls with blinking status lights, cracked grimy floors.

  ![The arsenal](docs/screens/arsenal.png)
  ![The bestiary](docs/screens/bestiary.png)
- **Wolfenstein-style sliding doors** computed as a mid-cell plane intersection
  during the DDA — they slide, block sight/bullets when closed, and re-open if
  something is standing in the doorway.
- **Eight weapons:** fist, pistol, shotgun, super shotgun, chaingun, rocket
  launcher, plasma rifle, and the BFG 9000 — hitscan with pellet spread, plus
  splash-damage, rapid-energy, and a screen-shaking BFG blast, across four
  ammo types.
- **The Spectre** — a near-invisible Demon that reads as a shimmering heat-haze
  (a moving dither over the demon silhouette), fast and melee, lurking in the
  later levels.
- **The Pain Elemental** — a floating maw that belches **Lost Souls** at you
  (capped so the swarm can't run away), turning any fight into a spawn-camp.
- **Gibbing:** overkill hits (rockets, the BFG, point-blank shells) burst a
  monster into a spray of gore and snap it straight to its final gib frame,
  with a wet splat.
- **Eight enemy types** with a real AI state machine (idle → chase → attack →
  pain → death) — the Former Human (hitscan), Imp (fireballs), Demon (melee
  charger), Cacodemon (floating plasma lobber), Lost Soul (fast flaming-skull
  charger), and the Baron of Hell (600-HP green-fireball boss). Ranged monsters
  strafe to dodge and kite you, and each has a distinct death animation.
- **The Gumbird** — a 1000-HP final boss guarding LEVEL 8's exit: part Gumby,
  part Big Bird, on roller skates, in a dunce cap and a polka-dot dress,
  juggling three balls and belting out "Row, Row, Row Your Boat" line by line
  (with a synthesized melody) while pelting you with juggling balls.
- **Gamepad support:** any standard-mapping controller is detected on connect —
  sticks to move and look, triggers to fire, shoulders to swap weapons, and
  full menu/pause navigation.
- **Environmental terrain:** wadeable **water** — ponds and streams that ripple,
  slow you down, and kick up splashes — and **outdoor sections** open to a dusk
  **sky** instead of a ceiling. (The renderer is a flat-floor raycaster, so
  these are surface features, not true multi-height geometry.)
- **Physics & feel:** momentum-based movement (acceleration, friction, and
  velocity bleed-off when you hit a wall) and **knockback** — bullets nudge,
  fireballs shove, rockets and barrels launch both monsters and the player.
- **Emergent behaviors:** **infighting** (a monster caught in another's
  crossfire turns on it — `target` retargeting), **alerting** (gunfire and a
  monster spotting you rouse nearby sleepers), and monsters that **shove
  unlocked doors open** to chase you through.
- **Directional monster sprites:** while walking, each monster shows a front,
  side, or back view based on its facing — you see them turn and flee.
- **Automap** (`Tab`): a top-down overlay of the level with the player, doors,
  the exit, monsters, items, and barrels.
- **Options menu** (`O`): mouse sensitivity, sound + music volume, and three
  skill levels (Easy / Normal / Hard) that scale incoming damage and monster
  attack rate. Settings persist in `localStorage`.
- **Pickups:** stimpacks, medikits, health/armor bonuses, MegaArmor, MegaSphere,
  ammo of every type, weapons, and three colored keycards.
- **Powerups:** an **Invulnerability** sphere (shrugs off all damage, golden
  screen sheen), a **Berserk** pack (fist hits ~10× and swaps you to it), and a
  **Light-Amp Visor** that floods the gloom with light — each on a timer.
- **Explosive barrels** with chain-reaction splash damage.
- **Classic status-bar HUD:** ammo, health, the ARMS panel, armor, keys, and
  per-type ammo counts — plus a live mug shot.
- **The "Today I'm Feeling..." face:** the status-bar portrait cycles through
  nine Nicolas-Cage-meme moods wired to what's actually happening —
  **HAPPY** (idle & fine), **CAREFREE** (full health, no threats),
  **RELAXED** (calm), **EXCITED** (firing / a kill), **FOCUSED** (sunglasses on
  when a monster is stalking you), **STRESSED** (taking hits), **ANGRY** (a 3+
  kill streak / fighting while wounded), **MEH** (bored), and **BEES!!!** — full
  panic, complete with a wire cage and a swarm, when you're nearly dead.

  ![The nine moods](docs/screens/faces.png)
- **Nine levels** — three hand-authored (Entryway, Underhalls, The Ascent) plus six
  procedurally generated (`tools/gen-levels.mjs`): rooms-and-corridors layouts,
  each with its own surface theme, a key-gated exit, and a rising
  enemy/difficulty curve. A title screen, level-complete intermission (kills / items /
  secrets / time tally), death/respawn, and a final victory screen tie them
  together.
- **Procedurally synthesized sound effects** (WebAudio) for every weapon,
  monster, door, and pickup — generated at runtime, no SFX files.
- **Per-level background music** — seven looping MP3 tracks in `assets/music/`,
  one per level (level 8 wraps to the first); the `M` mute key silences music
  and SFX together.

## Project layout

```
index.html          page shell
styles.css          page chrome
server.mjs          tiny zero-dependency static server
src/
  main.js           bootstrap, input wiring, frame loop, render dispatch
  raycaster.js      the software renderer (walls / floors / sprites)
  game.js           world state: player, movement, combat, AI, doors, flow
  assets.js         procedural textures, sprites, weapons, faces
  audio.js          WebAudio sound + music synthesis
  input.js          keyboard + mouse + pointer lock
  hud.js            status bar, weapon view, screen overlays
  math.js           small math/color helpers
  data/
    levels.js       ASCII level maps + parser
    enemies.js      monster stats + animation frames
    weapons.js      the arsenal
    items.js        pickups
tools/
  validate-levels.mjs   checks map width/border/connectivity/reachable exit
  functional.mjs        headless white-box tests (combat, doors, flow, …)
  shoot.mjs / perf.mjs  headless screenshots + render perf probe
```

## Editing levels

Levels are plain ASCII in `src/data/levels.js`. Each level has two equal-size
grids — `walls` (geometry) and `things` (entities). Legends are documented at the
top of that file. After editing, validate before playing:

```bash
npm run validate     # node tools/validate-levels.mjs
```

It enforces a solid border, uniform row widths, a player start, and that the
exit switch is actually reachable.

Levels 3-8 live in `src/data/levels.gen.js`, produced by the procedural
generator. Re-roll them (or tweak the per-level themes/difficulty in its
`CONFIGS`) with:

```bash
node tools/gen-levels.mjs   # builds + self-validates, then writes levels.gen.js
```

The generated grids are plain text and can be hand-edited like any other level.

## Development checks

The game is verified headlessly against the pre-installed Chromium:

```bash
node tools/validate-levels.mjs   # level integrity
node tools/functional.mjs        # 18 white-box gameplay assertions
node tools/shoot.mjs             # screenshots + runtime-error check
```

(`tools/*` use `playwright-core` driving the system Chromium; they're dev-only
and not required to play.)

---

## About the name

*Doom II* (id Software, 1994) is one of the most influential games ever made; its
engine has powered hundreds of total conversions and indie titles. MOOD is a
small tribute to that lineage — a from-scratch 2.5D shooter that captures the
*feel* (corridors, keycards, shotguns, a snarling status-bar face) using only
original, code-generated assets.

Not affiliated with or endorsed by id Software or Bethesda.
