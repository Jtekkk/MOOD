// touch.js — on-screen controls for phones/tablets. Like the gamepad layer,
// touches are synthesized into the existing keyboard/mouse model: the virtual
// stick sets movement codes in input.touchDown, the fire pad sets
// input.touchFire, and dragging the look zone feeds input.mouseDX directly.
//
// initTouch() is a no-op on non-touch devices, so desktop is unaffected.

export function initTouch(input, game, hooks = {}) {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return null;
  document.body.classList.add('touch');

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="tc-look"></div>
    <div id="tc-move"><div id="tc-stick"></div></div>
    <div class="tc-btn" id="tc-fire">FIRE</div>
    <div class="tc-btn" id="tc-use">USE</div>
    <div class="tc-btn" id="tc-wpn">WPN</div>
    <div class="tc-btn tc-small" id="tc-map">MAP</div>
    <div class="tc-btn tc-small" id="tc-pause">II</div>
  `;
  document.body.appendChild(root);

  const el = (id) => root.querySelector('#' + id);
  const moveBase = el('tc-move'), stick = el('tc-stick'), lookZone = el('tc-look');

  // Active touches keyed by identifier → role + bookkeeping.
  const active = new Map();
  const DEAD = 0.28;           // stick dead-zone (fraction of radius)
  const RUN = 0.92;            // push past this → run
  const LOOK_SENS = 0.55;      // px of drag → yaw units (matches mouse feel)

  const setMove = (nx, ny) => {
    // nx,ny in [-1,1] (already clamped). Update held movement codes.
    const td = input.touchDown;
    td.clear();
    const mag = Math.hypot(nx, ny);
    if (mag < DEAD) { stick.style.transform = 'translate(-50%,-50%)'; return; }
    if (ny < -0.35) td.add('KeyW');
    if (ny > 0.35) td.add('KeyS');
    if (nx > 0.35) td.add('KeyD');
    if (nx < -0.35) td.add('KeyA');
    if (mag > RUN) td.add('ShiftLeft');
    stick.style.transform = `translate(calc(-50% + ${nx * 34}px), calc(-50% + ${ny * 34}px))`;
  };

  const onMoveTouch = (t, rect) => {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    let nx = (t.clientX - cx) / r, ny = (t.clientY - cy) / r;
    const m = Math.hypot(nx, ny);
    if (m > 1) { nx /= m; ny /= m; }
    setMove(nx, ny);
  };

  // First touch anywhere unlocks audio + advances the front-end (tap to start).
  const frontEndTap = () => {
    if (hooks.unlockAudio) hooks.unlockAudio();
    const s = game.state;
    if (s === 'title' || s === 'victory' || s === 'paused' || s === 'intermission') {
      input.pressed.add('Enter');
    }
  };

  const claim = (t, role, extra = {}) => active.set(t.identifier, { role, ...extra });

  const start = (e) => {
    for (const t of e.changedTouches) {
      frontEndTap();
      const tgt = document.elementFromPoint(t.clientX, t.clientY);
      const id = tgt && tgt.closest ? (tgt.closest('.tc-btn,#tc-move') || {}).id : null;
      if (id === 'tc-move') {
        claim(t, 'move'); onMoveTouch(t, moveBase.getBoundingClientRect());
      } else if (id === 'tc-fire') { claim(t, 'fire'); input.touchFire = true; el('tc-fire').classList.add('on'); }
      else if (id === 'tc-use') { claim(t, 'btn'); input.pressed.add('KeyE'); }
      else if (id === 'tc-wpn') { claim(t, 'btn'); input.pressed.add('KeyQ'); }
      else if (id === 'tc-map') { claim(t, 'btn'); if (hooks.toggleMap) hooks.toggleMap(); }
      else if (id === 'tc-pause') { claim(t, 'btn'); if (hooks.pause) hooks.pause(); }
      else { claim(t, 'look', { lx: t.clientX, ly: t.clientY }); }   // bare area = look
    }
    e.preventDefault();
  };

  const move = (e) => {
    for (const t of e.changedTouches) {
      const a = active.get(t.identifier);
      if (!a) continue;
      if (a.role === 'move') onMoveTouch(t, moveBase.getBoundingClientRect());
      else if (a.role === 'look') {
        input.mouseDX += (t.clientX - a.lx) * LOOK_SENS;
        a.lx = t.clientX; a.ly = t.clientY;
      }
    }
    e.preventDefault();
  };

  const end = (e) => {
    for (const t of e.changedTouches) {
      const a = active.get(t.identifier);
      if (!a) continue;
      if (a.role === 'move') { input.touchDown.clear(); stick.style.transform = 'translate(-50%,-50%)'; }
      else if (a.role === 'fire') { input.touchFire = false; el('tc-fire').classList.remove('on'); }
      active.delete(t.identifier);
    }
    e.preventDefault();
  };

  // Listen on the overlay (covers the viewport) with passive:false so we can
  // suppress scrolling/zoom while playing.
  const opts = { passive: false };
  root.addEventListener('touchstart', start, opts);
  root.addEventListener('touchmove', move, opts);
  root.addEventListener('touchend', end, opts);
  root.addEventListener('touchcancel', end, opts);

  return {
    // Toggle which controls show, based on game state.
    update(state) {
      const playing = state === 'playing' || state === 'paused';
      root.classList.toggle('playing', playing);
    },
    root,
  };
}
