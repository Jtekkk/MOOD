// input.js — keyboard + mouse handling with pointer lock for mouselook.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered (cleared each frame after consume)
    this.mouseDX = 0;
    this.typed = '';            // printable chars typed this frame (terminal text entry)
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.locked = false;
    // gamepad state (synthesized into the same model as kbd/mouse)
    this.padDown = new Set();     // held movement codes from sticks/d-pad
    this.padFire = false;
    this.padTurn = 0;             // right-stick X → yaw rate (-1..1), applied by the game
    this.padStartEdge = false;    // Start pressed this frame (pause toggle)
    this.hasGamepad = false;
    this._prevBtn = [];
    window.addEventListener('gamepadconnected', () => { this.hasGamepad = true; });

    // touch state (on-screen controls fold into the same model — see touch.js)
    this.touchDown = new Set();   // held movement codes from the virtual stick
    this.touchFire = false;

    window.addEventListener('keydown', (e) => {
      const c = e.code;
      // Prevent the page from scrolling on arrows/space/etc while playing.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(c)) {
        e.preventDefault();
      }
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
      if (e.key && e.key.length === 1) this.typed += e.key;   // accumulate printable text
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousedown', (e) => {
      if (!this.mouseButtons.has(e.button)) this.mousePressed.add(e.button);
      this.mouseButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.mouseDX += e.movementX || 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  exitLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code) || this.padDown.has(code) || this.touchDown.has(code); }

  // True only on the frame the key went down.
  justPressed(code) { return this.pressed.has(code); }

  mouseDown(btn) { return this.mouseButtons.has(btn) || (btn === 0 && (this.padFire || this.touchFire)); }
  mouseJustPressed(btn) { return this.mousePressed.has(btn); }

  // Poll the first connected gamepad and fold it into the keyboard/mouse model.
  // Call once at the start of each frame, before game.update().
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.padDown.clear();
    this.padTurn = 0;
    this.padStartEdge = false;
    if (!gp) { this.padFire = false; this._prevBtn = []; return; }
    this.hasGamepad = true;
    const ax = gp.axes, btns = gp.buttons;
    const a = (i) => (ax[i] || 0);
    const dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
    const b = (i) => (btns[i] ? btns[i].pressed : false);

    // --- movement: LEFT stick + d-pad → forward/back + strafe ---
    const lx = dz(a(0)), ly = dz(a(1));
    if (ly < -0.3 || b(12)) this.padDown.add('KeyW');
    if (ly > 0.3 || b(13)) this.padDown.add('KeyS');
    if (lx > 0.3 || b(15)) this.padDown.add('KeyD');
    if (lx < -0.3 || b(14)) this.padDown.add('KeyA');
    if (Math.hypot(lx, ly) > 0.92) this.padDown.add('ShiftLeft');   // push hard to run

    // --- look: RIGHT stick X → rotate/turn (dual-stick), NOT strafe. This is a
    // yaw *rate* the game integrates per-frame, independent of mouse settings. ---
    this.padTurn = dz(a(2));

    // --- fire: right trigger / A ---
    this.padFire = b(7) || b(0);

    // --- edge-triggered buttons → synthetic key presses ---
    const prev = this._prevBtn;
    const edge = (i, code) => { if (b(i) && !prev[i]) this.pressed.add(code); };
    edge(2, 'KeyE'); edge(1, 'KeyE');         // X / B → use
    edge(4, 'KeyQ'); edge(5, 'KeyQ');         // shoulders → cycle weapon
    edge(0, 'Enter'); edge(3, 'KeyM');        // A → confirm, Y → mute
    edge(12, 'ArrowUp'); edge(13, 'ArrowDown'); edge(14, 'ArrowLeft'); edge(15, 'ArrowRight'); // menu nav
    if (b(9) && !prev[9]) { this.pressed.add('Escape'); this.padStartEdge = true; } // Start → pause/back
    this._prevBtn = btns.map((x) => x && x.pressed);
  }

  // Consume per-frame edge state + accumulated mouse delta.
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.typed = '';
  }
}
