// THE HOLLOW — procedural audio engine (Web Audio, no assets)
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.ambience = null;
    this.heartTimer = 0;
    this.lastStep = 0;
    this.hum = null;
    this.ready = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(2.4);
      this.ready = true;
    } catch { /* audio is optional */ }
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.025 * white) / 1.025;
      data[i] = last * 3.4;
    }
    return buffer;
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.06);
  }

  startAmbience() {
    if (!this.ctx || this.ambience) return;
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(this.master);
    bus.gain.setTargetAtTime(0.26, t, 2.2);

    // Low, uneasy drone.
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 41.5;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.14;
    drone.connect(droneGain).connect(bus);
    drone.start();

    const fifth = this.ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.value = 61.8;
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.035;
    fifth.connect(fifthGain).connect(bus);
    fifth.start();

    // Wind.
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 270;
    windFilter.Q.value = 0.5;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.12;
    wind.connect(windFilter).connect(windGain).connect(bus);
    wind.start();

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.067;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain).connect(windGain.gain);
    lfo.start();

    this.ambience = { bus, drone, fifth, wind, lfo };
  }

  setAmbience(mode) {
    if (!this.ctx || !this.ambience) return;
    const t = this.ctx.currentTime;
    const target = mode === 'chase' ? 0.38 : 0.25;
    this.ambience.bus.gain.setTargetAtTime(target, t, 1.2);
    this.ambience.drone.frequency.setTargetAtTime(mode === 'chase' ? 47 : 41.5, t, 1.8);
  }

  stopAmbience() {
    if (!this.ambience || !this.ctx) return;
    const t = this.ctx.currentTime;
    const a = this.ambience;
    this.ambience = null;
    a.bus.gain.setTargetAtTime(0.0001, t, 0.3);
    setTimeout(() => {
      for (const n of [a.drone, a.fifth, a.wind, a.lfo]) { try { n.stop(); } catch {} }
      try { a.bus.disconnect(); } catch {}
    }, 1400);
  }

  tone(freq, duration, opts = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (opts.delay || 0);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + duration);
    const gain = this.ctx.createGain();
    const vol = opts.volume ?? 0.14;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let last = gain;
    if (opts.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.value = opts.cutoff || 1200;
      gain.connect(f);
      last = f;
    }
    osc.connect(gain);
    last.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noise(duration, opts = {}) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + (opts.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = opts.rate || 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 800, t);
    if (opts.slide) filter.frequency.exponentialRampToValueAtTime(opts.slide, t + duration);
    filter.Q.value = opts.q ?? 0.9;
    const gain = this.ctx.createGain();
    const vol = opts.volume ?? 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.2);
    src.stop(t + duration + 0.03);
  }

  ui() {
    this.tone(1300, 0.045, { type: 'square', volume: 0.025, filter: 'highpass', cutoff: 500 });
  }

  choose() {
    this.tone(620, 0.09, { type: 'triangle', volume: 0.05 });
    this.tone(930, 0.13, { type: 'sine', volume: 0.035, delay: 0.04 });
  }

  startMatch() {
    this.tone(58, 1.6, { type: 'sine', volume: 0.22, slide: 36 });
    this.tone(116, 0.9, { type: 'triangle', volume: 0.07, delay: 0.1 });
    this.noise(1.2, { filter: 'lowpass', freq: 500, volume: 0.1, slide: 120 });
    this.noise(0.24, { filter: 'highpass', freq: 2200, volume: 0.025, delay: 0.35 });
  }

  step(running, killer = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStep < (running ? 0.23 : 0.4)) return;
    this.lastStep = now;
    this.noise(0.055, { filter: 'lowpass', freq: killer ? 520 : running ? 700 : 420, volume: killer ? 0.16 : running ? 0.055 : 0.027, rate: killer ? 0.65 : 1.3 });
    if (killer) this.tone(48, 0.09, { type: 'sine', volume: 0.06 });
  }

  heartbeat(intensity) {
    const vol = 0.08 + intensity * 0.14;
    this.tone(53, 0.13, { type: 'sine', volume: vol, slide: 38 });
    this.tone(47, 0.11, { type: 'sine', volume: vol * 0.7, delay: 0.17, slide: 34 });
  }

  swing() {
    this.noise(0.18, { filter: 'bandpass', freq: 1700, slide: 280, q: 1.2, volume: 0.22 });
    this.tone(180, 0.08, { type: 'sawtooth', volume: 0.035, slide: 90, filter: 'lowpass', cutoff: 500 });
  }

  hit() {
    this.noise(0.12, { filter: 'lowpass', freq: 900, slide: 160, volume: 0.32 });
    this.tone(120, 0.2, { type: 'sine', volume: 0.2, slide: 48 });
    this.tone(72, 0.26, { type: 'triangle', volume: 0.12, slide: 41, delay: 0.02 });
  }

  scream() {
    this.tone(430, 0.5, { type: 'sawtooth', volume: 0.065, slide: 210, filter: 'bandpass', cutoff: 900 });
    this.tone(640, 0.36, { type: 'sine', volume: 0.035, slide: 340 });
    this.noise(0.38, { filter: 'bandpass', freq: 1100, volume: 0.06, slide: 380 });
  }

  down() {
    this.tone(150, 0.65, { type: 'sawtooth', volume: 0.085, slide: 55, filter: 'lowpass', cutoff: 650 });
    this.noise(0.28, { filter: 'lowpass', freq: 380, volume: 0.14, slide: 100 });
  }

  spark() {
    this.noise(0.11, { filter: 'highpass', freq: 1800, volume: 0.05, rate: 1.5 });
    this.tone(1600 + Math.random() * 900, 0.07, { type: 'square', volume: 0.015 });
  }

  genComplete() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => {
      this.tone(f, 0.6, { type: 'sine', volume: 0.055, delay: i * 0.13, attack: 0.04 });
      this.tone(f * 2, 0.35, { type: 'triangle', volume: 0.018, delay: i * 0.13 });
    });
    this.noise(0.5, { filter: 'bandpass', freq: 2500, volume: 0.03, delay: 0.1 });
  }

  skillGood() {
    this.tone(880, 0.12, { type: 'sine', volume: 0.07 });
    this.tone(1320, 0.2, { type: 'sine', volume: 0.05, delay: 0.07 });
  }

  skillBad() {
    this.noise(0.42, { filter: 'lowpass', freq: 1500, slide: 120, volume: 0.3 });
    this.tone(86, 0.45, { type: 'sawtooth', volume: 0.13, slide: 38 });
    this.tone(1200, 0.15, { type: 'square', volume: 0.04, delay: 0.02, slide: 500 });
  }

  gatePowered() {
    [220, 277.18, 329.63].forEach(f => this.tone(f, 1.4, { type: 'sine', volume: 0.06, attack: 0.2 }));
    this.tone(55, 1.8, { type: 'sine', volume: 0.15 });
  }

  gateOpen() {
    this.noise(1.3, { filter: 'lowpass', freq: 420, slide: 80, volume: 0.25, attack: 0.2 });
    this.tone(73, 1.3, { type: 'triangle', volume: 0.1, slide: 41 });
    this.tone(329.63, 0.8, { type: 'sine', volume: 0.05, delay: 0.35, attack: 0.1 });
  }

  escape() {
    [261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone(f, 1.2, { type: 'sine', volume: 0.06, delay: i * 0.16, attack: 0.1 }));
    this.noise(0.8, { filter: 'highpass', freq: 1800, volume: 0.03 });
  }

  death() {
    this.tone(65, 1.7, { type: 'sawtooth', volume: 0.13, slide: 25, filter: 'lowpass', cutoff: 300 });
    this.noise(1.1, { filter: 'lowpass', freq: 300, slide: 60, volume: 0.19 });
  }

  killerWin() {
    this.tone(43, 2.8, { type: 'sine', volume: 0.25, slide: 29 });
    [146.83, 155.56, 220].forEach((f, i) => this.tone(f, 2.1, { type: 'sawtooth', volume: 0.03, delay: i * 0.18, filter: 'lowpass', cutoff: 450 }));
    this.noise(1.8, { filter: 'lowpass', freq: 360, volume: 0.12 });
  }

  survivorWin() {
    [196, 261.63, 329.63, 392].forEach((f, i) => this.tone(f, 1.8, { type: 'sine', volume: 0.06, delay: i * 0.2, attack: 0.3 }));
    this.tone(49, 2.1, { type: 'sine', volume: 0.16 });
  }

  sight() {
    this.tone(880, 0.5, { type: 'sine', volume: 0.03, slide: 440 });
    this.tone(1320, 0.35, { type: 'sine', volume: 0.022, slide: 660, delay: 0.04 });
    this.noise(0.3, { filter: 'bandpass', freq: 2400, volume: 0.025 });
  }

  palletDrop() {
    this.noise(0.24, { filter: 'lowpass', freq: 700, slide: 150, volume: 0.3 });
    this.tone(98, 0.3, { type: 'triangle', volume: 0.14, slide: 46 });
    this.tone(1400, 0.1, { type: 'square', volume: 0.02, delay: 0.01 });
  }

  palletBreak() {
    this.noise(0.42, { filter: 'bandpass', freq: 600, slide: 120, volume: 0.28 });
    this.tone(75, 0.45, { type: 'sawtooth', volume: 0.12, slide: 34 });
  }

  vault() {
    this.noise(0.1, { filter: 'lowpass', freq: 600, volume: 0.08 });
    this.tone(240, 0.12, { type: 'sine', volume: 0.03, slide: 340 });
  }
}
