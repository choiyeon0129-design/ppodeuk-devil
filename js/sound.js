'use strict';

/* =========================================================
 * 사운드 (Web Audio 합성 — 별도 음원 파일 불필요)
 *  - 게임 컨셉(고딕/악마 창문닦기)에 맞춘 SFX + 은은한 앰비언트
 *  - 첫 사용자 입력(게임 시작) 이후 재생 (브라우저 자동재생 정책)
 *  - M 키로 음소거 토글
 * ========================================================= */

const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  _amb: null,
  _bgm: null,

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },

  _env(g, t, atk, dur, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
  },

  tone(freq, dur, type, peak, slideTo) {
    if (!this.enabled) return;
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this._env(g, t, Math.min(0.012, dur * 0.25), dur, peak);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(dur, peak, freq, type) {
    if (!this.enabled) return;
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, dur, peak);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  // ===== 게임 SFX =====
  wipe()  { this.noise(0.13, 0.10, 1700, 'bandpass'); },                 // 뽀득 문지름
  clean() { this.tone(880, 0.12, 'sine', 0.16); setTimeout(() => this.tone(1320, 0.18, 'sine', 0.14), 60); }, // 반짝
  open()  { this.tone(330, 0.35, 'sawtooth', 0.09, 150); this.noise(0.3, 0.04, 500, 'lowpass'); },           // 삐걱 열림
  clear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.16), i * 110)); },
  fail()  { this.tone(300, 0.6, 'sawtooth', 0.16, 90); },
  fall()  { this.tone(720, 0.7, 'square', 0.14, 80); setTimeout(() => this.noise(0.14, 0.18, 200, 'lowpass'), 660); }, // 추락 + 쿵
  step()  { this.tone(220, 0.04, 'square', 0.04); },

  // ===== 은은한 앰비언트 패드 (게임 분위기) =====
  startAmbient() {
    if (!this.enabled) return;
    this.ensure(); if (!this.ctx || this._amb) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0.05; g.connect(this.master);
    const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 98;   // G2
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 146.8; // D3 (5도)
    o2.detune.value = 5;
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o1.connect(g); o2.connect(g);
    o1.start(t); o2.start(t); lfo.start(t);
    this._amb = { o1, o2, lfo, g };
  },

  // ===== 배경 음악 (고딕 단조 아르페지오 루프) =====
  _bgmNote(freq, dur, peak, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  startBGM() {
    if (this._bgm) return;
    this.ensure(); if (!this.ctx) return;
    // Am - G - F - E (단조) 아르페지오
    const seq = [
      220.00, 261.63, 329.63, 261.63,   // Am
      196.00, 246.94, 392.00, 246.94,   // G
      174.61, 220.00, 349.23, 220.00,   // F
      164.81, 207.65, 329.63, 207.65,   // E
    ];
    let i = 0;
    this._bgm = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const f = seq[i % seq.length];
      this._bgmNote(f, 0.5, 0.05, 'triangle');     // 멜로디
      if (i % 4 === 0) this._bgmNote(f / 2, 1.1, 0.05, 'sine'); // 베이스(마디 시작)
      i++;
    }, 320);
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
    if (this.enabled) { this.startAmbient(); this.startBGM(); }
    return this.enabled;
  },
};
