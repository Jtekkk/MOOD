// audio.js — all sound is synthesized with the WebAudio API at runtime.
// No external audio files, so the whole game stays self-contained.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.musicTimer = null;
    this._musicStep = 0;
  }

  // Must be called from a user gesture (browsers block autoplay otherwise).
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _now() { return this.ctx.currentTime; }

  // Generic short noise burst (explosions, shotguns).
  _noise(dur, { type = 'lowpass', freq = 1200, q = 1, gain = 0.5, decay = 0.9 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay * 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.gain.setTargetAtTime(0.0001, this._now() + dur * 0.5, dur * 0.3);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
    src.stop(this._now() + dur);
  }

  _tone(freq, dur, { type = 'square', gain = 0.3, slideTo = null, attack = 0.005 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this._now());
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), this._now() + dur);
    g.gain.setValueAtTime(0.0001, this._now());
    g.gain.exponentialRampToValueAtTime(gain, this._now() + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this._now() + dur);
    osc.connect(g); g.connect(this.master);
    osc.start();
    osc.stop(this._now() + dur + 0.02);
  }

  // ---- Named effects -------------------------------------------------
  play(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'pistol':   this._noise(0.12, { freq: 2600, gain: 0.5, decay: 1.4 }); this._tone(420, 0.07, { type: 'square', gain: 0.18, slideTo: 120 }); break;
      case 'shotgun':  this._noise(0.28, { freq: 1500, gain: 0.8, decay: 0.7 }); this._tone(160, 0.12, { type: 'sawtooth', gain: 0.25, slideTo: 50 }); break;
      case 'supershotgun': this._noise(0.42, { freq: 1100, gain: 0.95, decay: 0.6 }); this._tone(120, 0.18, { type: 'sawtooth', gain: 0.3, slideTo: 40 }); break;
      case 'chaingun': this._noise(0.07, { freq: 3000, gain: 0.45, decay: 1.6 }); break;
      case 'rocket':   this._noise(0.4, { freq: 700, gain: 0.5, decay: 0.5 }); this._tone(220, 0.3, { type: 'sawtooth', gain: 0.2, slideTo: 60 }); break;
      case 'explosion':this._noise(0.6, { freq: 500, gain: 0.95, q: 0.5, decay: 0.4 }); this._tone(80, 0.4, { type: 'sawtooth', gain: 0.4, slideTo: 25 }); break;
      case 'punch':    this._noise(0.1, { freq: 800, gain: 0.4, decay: 1.0 }); break;
      case 'pickup':   this._tone(660, 0.08, { type: 'square', gain: 0.25 }); this._tone(990, 0.1, { type: 'square', gain: 0.22 }); break;
      case 'weapon':   this._tone(330, 0.08, { gain: 0.25 }); this._tone(550, 0.09, { gain: 0.25 }); this._tone(770, 0.12, { gain: 0.25 }); break;
      case 'health':   this._tone(523, 0.09, { type: 'sine', gain: 0.3 }); this._tone(784, 0.12, { type: 'sine', gain: 0.3 }); break;
      case 'door':     this._noise(0.5, { freq: 380, gain: 0.25, q: 4, decay: 0.3 }); break;
      case 'switch':   this._tone(220, 0.08, { gain: 0.3 }); this._tone(330, 0.12, { gain: 0.3 }); break;
      case 'nokey':    this._tone(140, 0.18, { type: 'square', gain: 0.3, slideTo: 90 }); break;
      case 'pain':     this._tone(300, 0.18, { type: 'sawtooth', gain: 0.35, slideTo: 140 }); break;
      case 'death':    this._tone(260, 0.5, { type: 'sawtooth', gain: 0.4, slideTo: 50 }); this._noise(0.4, { freq: 700, gain: 0.3, decay: 0.6 }); break;
      case 'monster_sight': this._tone(110, 0.3, { type: 'sawtooth', gain: 0.3, slideTo: 220 }); break;
      case 'monster_attack': this._tone(180, 0.18, { type: 'square', gain: 0.28, slideTo: 90 }); break;
      case 'monster_death':  this._tone(200, 0.4, { type: 'sawtooth', gain: 0.35, slideTo: 40 }); this._noise(0.3, { freq: 600, gain: 0.25, decay: 0.8 }); break;
      case 'oof':      this._tone(180, 0.12, { type: 'square', gain: 0.3, slideTo: 110 }); break;
      case 'menu':     this._tone(440, 0.05, { gain: 0.2 }); break;
      case 'levelend': this._tone(523, 0.15, { type: 'square', gain: 0.3 }); this._tone(659, 0.15, { type: 'square', gain: 0.3 }); this._tone(784, 0.3, { type: 'square', gain: 0.3 }); break;
      default: break;
    }
  }

  // A simple ominous driving bassline loop, E-minor-ish, à la a certain shooter.
  startMusic() {
    if (!this.ctx || !this.enabled || this.musicTimer) return;
    const notes = [82.41, 82.41, 98.00, 82.41, 110.0, 82.41, 92.50, 87.31]; // E2 walk
    const beat = 0.16;
    const stepFn = () => {
      const f = notes[this._musicStep % notes.length];
      this._musicStep++;
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + beat * 0.9);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 600;
      osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
      osc.start(); osc.stop(ctx.currentTime + beat);
    };
    this.musicTimer = setInterval(stepFn, beat * 1000);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.6 : 0;
    return this.enabled;
  }
}
