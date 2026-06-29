// input.js — keyboard + mouse handling with pointer lock for mouselook.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered (cleared each frame after consume)
    this.mouseDX = 0;
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      const c = e.code;
      // Prevent the page from scrolling on arrows/space/etc while playing.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(c)) {
        e.preventDefault();
      }
      if (!this.keys.has(c)) this.pressed.add(c);
      this.keys.add(c);
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

  down(code) { return this.keys.has(code); }

  // True only on the frame the key went down.
  justPressed(code) { return this.pressed.has(code); }

  mouseDown(btn) { return this.mouseButtons.has(btn); }
  mouseJustPressed(btn) { return this.mousePressed.has(btn); }

  // Consume per-frame edge state + accumulated mouse delta.
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
  }
}
