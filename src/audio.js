// WebAudio instruments and little sound effects, all synthesized.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic: everything sounds nice together
const BASE = { piano: 261.63, xylo: 523.25 };
export const NOTE_NAMES = { piano: ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'], xylo: ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E'], drums: ['Kick', 'Snare', 'Hat', 'Open', 'Tom', 'Tom 2', 'Clap', 'Bell'] };
export const GRID_MS = 75; // light quantization grid (a 32nd at 100 bpm)

export class Audio {
  constructor() {
    this.ctx = null;
    try { this.muted = localStorage.getItem('hh.muted') === '1'; } catch { this.muted = false; }
    this.crackleT = 0;
    this.birdT = 3;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('hh.muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ---------- building blocks ----------
  tone(freq, { type = 'sine', at = 0, attack = 0.005, decay = 0.3, gain = 0.2, slide = 0, out = this.master } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + decay);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
  burst({ at = 0, decay = 0.2, gain = 0.2, type = 'bandpass', freq = 1500, q = 1, slide = 0, out = this.master } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + decay + 0.05);
  }

  // ---------- effects ----------
  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    let vol = 1;
    if (opts.at && opts.listener) {
      const d = Math.hypot(opts.at.x - opts.listener.x, opts.at.z - opts.listener.z);
      vol = Math.max(0, 1 - d / 28);
      if (vol < 0.03) return;
    }
    const g = (x) => x * vol;
    switch (name) {
      case 'pop': this.tone(520, { slide: 1.8, decay: 0.09, gain: g(0.12) }); break;
      case 'hop': this.tone(260, { slide: 2.2, decay: 0.14, gain: g(0.08), type: 'triangle' }); break;
      case 'blip': this.tone(880, { decay: 0.07, gain: g(0.07) }); this.tone(1320, { at: 0.06, decay: 0.08, gain: g(0.06) }); break;
      case 'emote': this.tone(660, { type: 'triangle', decay: 0.3, gain: g(0.07) }); this.tone(990, { type: 'triangle', at: 0.08, decay: 0.35, gain: g(0.06) }); break;
      case 'join': [523, 659, 784].forEach((f, i) => this.tone(f, { type: 'triangle', at: i * 0.09, decay: 0.35, gain: g(0.07) })); break;
      case 'ping': this.tone(1200, { decay: 0.12, gain: g(0.08) }); this.tone(1600, { at: 0.1, decay: 0.2, gain: g(0.07) }); break;
      case 'sip': this.burst({ decay: 0.25, freq: 900, q: 3, slide: 1.6, gain: g(0.12) }); break;
      case 'munch': this.burst({ decay: 0.06, freq: 2500, q: 0.7, gain: g(0.18) }); this.burst({ at: 0.12, decay: 0.06, freq: 2200, q: 0.7, gain: g(0.15) }); break;
      case 'kick': this.tone(150, { slide: 0.4, decay: 0.16, gain: g(0.3) }); this.burst({ decay: 0.04, freq: 3000, gain: g(0.08) }); break;
      case 'bounce': this.tone(110, { slide: 0.6, decay: 0.1, gain: g(0.16 * (opts.k || 1)) }); break;
      case 'splash': this.burst({ decay: 0.45, freq: 1400, q: 0.6, slide: 0.4, gain: g(0.22) }); break;
      case 'bloop': this.tone(420, { slide: 0.5, decay: 0.15, gain: g(0.14) }); break;
      case 'cast': this.burst({ decay: 0.3, type: 'highpass', freq: 1500, slide: 2, gain: g(0.08) }); break;
      case 'catch': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { type: 'triangle', at: i * 0.08, decay: 0.4, gain: g(0.09) })); break;
      case 'miss': this.tone(440, { type: 'triangle', decay: 0.25, gain: g(0.08) }); this.tone(330, { type: 'triangle', at: 0.15, decay: 0.35, gain: g(0.08) }); break;
      case 'whoosh': this.burst({ decay: 0.8, type: 'lowpass', freq: 300, slide: 6, gain: g(0.3) }); break;
      case 'sizzle': this.burst({ decay: 0.5, type: 'highpass', freq: 4000, gain: g(0.06) }); break;
      case 'creak': this.tone(180, { type: 'sawtooth', slide: 1.3, decay: 0.18, gain: g(0.015) }); break;
    }
  }

  // ---------- instruments ----------
  // n: 0..7; roomMs: shared clock, used to nudge notes onto a common grid
  note(inst, n, { roomMs, vol = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    let at = 0;
    if (roomMs !== undefined) {
      const wait = GRID_MS - (roomMs % GRID_MS);
      if (wait < 45) at = wait / 1000;
    }
    if (inst === 'piano') {
      const f = BASE.piano * 2 ** (SCALE[n] / 12);
      this.tone(f, { type: 'triangle', at, decay: 1.4, gain: 0.16 * vol });
      this.tone(f * 2, { at, decay: 0.7, gain: 0.05 * vol });
      this.tone(f * 1.003, { type: 'sine', at, decay: 1.1, gain: 0.08 * vol });
    } else if (inst === 'xylo') {
      const f = BASE.xylo * 2 ** (SCALE[n] / 12);
      this.tone(f, { at, decay: 0.55, gain: 0.2 * vol });
      this.tone(f * 3.98, { at, decay: 0.12, gain: 0.05 * vol });
    } else {
      const v = 0.3 * vol;
      switch (n) {
        case 0: this.tone(120, { at, slide: 0.35, decay: 0.28, gain: v * 1.4 }); break;
        case 1: this.burst({ at, decay: 0.18, freq: 1800, q: 0.7, gain: v }); this.tone(190, { at, decay: 0.1, gain: v * 0.5, type: 'triangle' }); break;
        case 2: this.burst({ at, decay: 0.05, type: 'highpass', freq: 7000, gain: v * 0.6 }); break;
        case 3: this.burst({ at, decay: 0.3, type: 'highpass', freq: 6000, gain: v * 0.5 }); break;
        case 4: this.tone(160, { at, slide: 0.6, decay: 0.3, gain: v }); break;
        case 5: this.tone(240, { at, slide: 0.6, decay: 0.25, gain: v }); break;
        case 6: for (let i = 0; i < 3; i++) this.burst({ at: at + i * 0.012, decay: 0.09, freq: 1200, q: 1.2, gain: v * 0.7 }); break;
        case 7: this.tone(800, { at, type: 'square', decay: 0.2, gain: v * 0.12 }); this.tone(540, { at, type: 'square', decay: 0.2, gain: v * 0.12 }); break;
      }
    }
  }

  // ---------- ambience ----------
  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    this.sea = c.createGain(); this.sea.gain.value = 0;
    src.connect(f).connect(this.sea).connect(this.master);
    src.start();
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 260;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
  }

  update(dt, game) {
    if (!this.ctx || this.muted || !this.sea) return;
    const me = game.me, play = game.mode === 'play';
    const nearSea = play ? Math.max(0, Math.min(1, (-(me.pos.x) - 4) / 14)) : 0.5;
    this.sea.gain.setTargetAtTime(0.02 + nearSea * 0.05, this.ctx.currentTime, 0.5);
    if (!play) return;
    // birds by day, crickets at night
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 3 + Math.random() * 6;
      if (game.sky.night < 0.4) {
        const f = 1800 + Math.random() * 1200;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f * (1 + i * 0.06), { at: i * 0.11, slide: 1.25, decay: 0.07, gain: 0.018 });
      } else {
        for (let i = 0; i < 4; i++) this.tone(4200, { at: i * 0.07, decay: 0.03, gain: 0.008 });
      }
    }
    // crackle when near a lit campfire
    const fire = game.fireInfo;
    if (fire && fire.lit) {
      const d = Math.hypot(me.pos.x - fire.x, me.pos.z - fire.z);
      this.crackleT -= dt;
      if (d < 9 && this.crackleT < 0) {
        this.crackleT = 0.05 + Math.random() * 0.25;
        this.burst({ decay: 0.03, freq: 2000 + Math.random() * 3000, q: 2, gain: 0.05 * (1 - d / 9) });
      }
    }
  }
}
