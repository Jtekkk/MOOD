// audio.js — sound effects are synthesized with the WebAudio API at runtime;
// background music streams from per-level MP3 tracks.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.masterVol = 0.6;
    // streamed background music
    this.musicEl = null;
    this.musicTracks = [];
    this.curTrack = -1;
    this.musicVol = 0.42;   // sit under the SFX
  }

  // Must be called from a user gesture (browsers block autoplay otherwise).
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.masterVol : 0;
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
      case 'plasma':   this._tone(900, 0.09, { type: 'square', gain: 0.22, slideTo: 280 }); this._noise(0.06, { freq: 3200, gain: 0.18, decay: 1.5 }); break;
      case 'rocket':   this._noise(0.4, { freq: 700, gain: 0.5, decay: 0.5 }); this._tone(220, 0.3, { type: 'sawtooth', gain: 0.2, slideTo: 60 }); break;
      case 'bfg':      this._tone(110, 0.5, { type: 'sawtooth', gain: 0.4, slideTo: 640 }); this._noise(0.5, { freq: 480, gain: 0.4, decay: 0.5 }); break;
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
      case 'splash':   this._noise(0.16, { freq: 1700, gain: 0.16, q: 1, decay: 1.2 }); break;
      default: break;
    }
  }

  // Sing a phrase: a sequence of note frequencies played as warm, slightly
  // wobbly triangle tones. Used by the Gumbird boss to belt out its tune.
  // Returns the total duration so callers can time the next line.
  singLine(notes, noteDur = 0.32) {
    if (!this.ctx || !this.enabled || !notes || !notes.length) return 0;
    const ctx = this.ctx, t0 = this._now();
    notes.forEach((f, i) => {
      const t = t0 + i * noteDur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const vib = ctx.createOscillator();   // gentle vibrato on the pitch
      const vibg = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      vib.type = 'sine'; vib.frequency.setValueAtTime(5.5, t);
      vibg.gain.setValueAtTime(f * 0.012, t);
      vib.connect(vibg); vibg.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.24, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.12, t + noteDur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur * 0.97);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + noteDur);
      vib.start(t); vib.stop(t + noteDur);
    });
    return notes.length * noteDur;
  }

  // ---- background music (streamed MP3 tracks) ---------------------------
  // Register the list of track URLs (index = level number).
  setTracks(urls) {
    this.musicTracks = urls || [];
    if (!this.musicEl) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      el.volume = this.musicVol;
      el.muted = !this.enabled;
      this.musicEl = el;
    }
  }

  // Play the track for a given level (wraps if there are fewer tracks).
  playTrack(i) {
    const el = this.musicEl, tracks = this.musicTracks;
    if (!el || !tracks.length) return;
    const n = tracks.length;
    const idx = ((i % n) + n) % n;
    if (idx === this.curTrack && !el.paused) return;   // already playing it
    this.curTrack = idx;
    if (!el.src || !el.src.endsWith(tracks[idx])) el.src = tracks[idx];
    el.muted = !this.enabled;
    try { el.currentTime = 0; } catch { /* not loaded yet */ }
    const p = el.play();
    if (p && p.catch) p.catch(() => {});   // autoplay may be blocked until a gesture
  }

  // Resume the current level's track (used after death/restart).
  startMusic() {
    if (this.curTrack < 0) this.playTrack(0); else this.playTrack(this.curTrack);
  }

  stopMusic() {
    if (this.musicEl) this.musicEl.pause();
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? this.masterVol : 0;
    if (this.musicEl) this.musicEl.muted = !this.enabled;
    return this.enabled;
  }

  setMasterVolume(v) {
    this.masterVol = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }
  setMusicVolume(v) {
    this.musicVol = v;
    if (this.musicEl) this.musicEl.volume = v;
  }
}
