/**
 * Three.js AudioListener + Audio, procedural buffers (no external files).
 * Call tryUnlockOnGesture() once after user interaction for browser autoplay policy.
 */

import * as THREE from 'three';

/** Global / group gains (0–1 typical). Per-effect gains multiply into SFX. */
export const AUDIO_LEVELS = {
  master: 1,
  /** Background music loop */
  music: 0.22,
  timeUp: 0.55,
  /** All one-shot SFX multiplier */
  sfx: 0.85,
  tap: 0.55,
  throw: 0.52,
  correct: 0.58,
  wrongSplat: 0.68,
  missThud: 0.32,
  trash: 0.52,
  timeGain: 0.46,
  coinTick: 0.48,
};

/**
 * @param {AudioContext} ctx
 * @param {number} durationSec
 */
function createTapBuffer(ctx, durationSec = 0.035) {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * durationSec));
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 180);
    const click = (Math.random() * 2 - 1) * 0.35;
    const tone = Math.sin(2 * Math.PI * 1850 * t) * 0.25;
    d[i] = (click + tone) * env;
  }
  return buffer;
}

function createWhooshBuffer(ctx, durationSec = 0.38) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.sin(t * Math.PI) * (1 - t * 0.2);
    const f = 400 + 2200 * (1 - t) * (1 - t);
    phase += (2 * Math.PI * f) / sr;
    const noise = (Math.random() * 2 - 1) * 0.55;
    d[i] = (noise * 0.65 + Math.sin(phase) * 0.18) * env * 0.45;
  }
  return buffer;
}

/** Short pleasant "plin" (two partials). */
function createPlinBuffer(ctx, durationSec = 0.22) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const f1 = 523.25;
  const f2 = 783.99;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 9) * (1 - Math.min(1, t / durationSec) * 0.15);
    d[i] =
      env *
      0.22 *
      (Math.sin(2 * Math.PI * f1 * t) * 0.55 + Math.sin(2 * Math.PI * f2 * t) * 0.45);
  }
  return buffer;
}

function createSplatBuffer(ctx, durationSec = 0.32) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 5.5) * (1 - t);
    const nse = (Math.random() * 2 - 1) * 0.9;
    const thump = Math.sin(2 * Math.PI * 95 * (i / sr)) * Math.exp(-(i / sr) * 18) * 0.45;
    d[i] = (nse * 0.5 + thump) * env * 0.55;
  }
  return buffer;
}

function createThudBuffer(ctx, durationSec = 0.12) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 38);
    d[i] = env * 0.4 * Math.sin(2 * Math.PI * 120 * t);
  }
  return buffer;
}

function createTrashBuffer(ctx, durationSec = 0.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 12);
    const slide = Math.sin(2 * Math.PI * (420 - t * 900) * t) * 0.35;
    const scrape = (Math.random() * 2 - 1) * 0.25;
    d[i] = (slide + scrape) * env * 0.5;
  }
  return buffer;
}

/** Upbeat funky loop (~2.4s) — driving bass, hats, bright stabs. */
function createFunkyLoopBuffer(ctx, durationSec = 2.4) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(2, n, sr);
  const bpm = 126;
  const beatDur = 60 / bpm;

  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    const pan = ch === 0 ? 0.94 : 1.06;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beat = t / beatDur;
      const beatPhase = beat % 1;
      const step = Math.floor(beat) % 4;

      let s = 0;
      const bassFreq = [82.4, 82.4, 98, 73.4][step];
      const ba = Math.min(1, beatPhase * 36) * (1 - beatPhase);
      s += 0.15 * pan * ba * Math.sin(2 * Math.PI * bassFreq * t);

      if (beatPhase > 0.5 && beatPhase < 0.58) {
        s += (Math.random() * 2 - 1) * 0.09 * pan;
      }
      if (beatPhase > 0.02 && beatPhase < 0.09) {
        s += (Math.random() * 2 - 1) * 0.045;
      }
      if (beatPhase > 0.25 && beatPhase < 0.31) {
        s += (Math.random() * 2 - 1) * 0.035;
      }

      s += 0.055 * pan * Math.sin(2 * Math.PI * 196 * t);
      s += 0.042 * pan * Math.sin(2 * Math.PI * 246.94 * t);
      s += 0.032 * pan * Math.sin(2 * Math.PI * 293.66 * t);

      d[i] = Math.max(-1, Math.min(1, s * 0.72));
    }
  }
  return buffer;
}

/**
 * More "gamey" / less harsh music loop (~3.2s).
 * - lighter percussion (less noise)
 * - simple major pentatonic melody + soft bass
 * - avoids piercing highs to reduce listener fatigue
 */
function createBouncyLoopBuffer(ctx, durationSec = 3.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(2, n, sr);
  const bpm = 118;
  const beatDur = 60 / bpm;

  // C major pentatonic-ish set (C D E G A) around middle C.
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0];
  const melodySteps = [0, 2, 1, 3, 2, 4, 3, 1];
  const bassSteps = [0, 0, 3, 0, 4, 0, 3, 0];

  // Simple 8th-note grid.
  const stepDur = beatDur / 2;
  const stepCount = Math.max(1, Math.floor(durationSec / stepDur));

  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    const pan = ch === 0 ? 0.96 : 1.04;

    let melPhase = 0;
    let bassPhase = 0;

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const step = Math.floor(t / stepDur) % stepCount;
      const u = (t / stepDur) % 1; // 0..1 within step

      // Note envelopes (fast attack, short decay).
      const env = Math.min(1, u * 18) * Math.exp(-u * 6.5);
      const envSoft = Math.min(1, u * 10) * Math.exp(-u * 3.2);

      const melIdx = melodySteps[step % melodySteps.length];
      const bassIdx = bassSteps[step % bassSteps.length];

      // Slightly vary octaves to keep it playful.
      const melOct = step % 8 === 7 ? 2 : 1;
      const melFreq = scale[melIdx] * melOct;
      const bassFreq = (scale[bassIdx] / 2) * (step % 4 === 2 ? 1.0 : 0.5);

      melPhase += (2 * Math.PI * melFreq) / sr;
      bassPhase += (2 * Math.PI * bassFreq) / sr;

      // Soft bass (sine + tiny 2nd harmonic).
      let s = 0;
      s += 0.16 * pan * envSoft * (Math.sin(bassPhase) + 0.18 * Math.sin(bassPhase * 2));

      // Melody (triangle-ish via harmonics; kept gentle).
      const tri =
        0.68 * Math.sin(melPhase) +
        0.22 * Math.sin(melPhase * 3) +
        0.10 * Math.sin(melPhase * 5);
      s += 0.11 * pan * env * tri;

      // Light kick on beats 0 and 2.
      const beat = t / beatDur;
      const beatPhase = beat % 1;
      const beatStep = Math.floor(beat) % 4;
      if ((beatStep === 0 || beatStep === 2) && beatPhase < 0.12) {
        const kenv = Math.sin((beatPhase / 0.12) * Math.PI) * (1 - beatPhase / 0.12);
        s += 0.09 * pan * kenv * Math.sin(2 * Math.PI * (95 - beatPhase * 420) * t);
      }

      // Very light hat ticks (reduced noise; short).
      if (beatPhase > 0.48 && beatPhase < 0.52) {
        const hn = (Math.random() * 2 - 1);
        const henv = 1 - Math.abs((beatPhase - 0.5) / 0.02);
        s += 0.012 * pan * hn * henv;
      }

      // Gentle limiter.
      d[i] = Math.max(-1, Math.min(1, s * 0.92));
    }
  }
  return buffer;
}

/** Short cheerful “time up” sting. */
function createTimeUpBuffer(ctx, durationSec = 0.52) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const freqs = [392, 493.88, 587.33, 659.25];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 2.2) * (1 - t / durationSec);
    let s = 0;
    freqs.forEach((f, k) => {
      const st = k * 0.09;
      if (t >= st) s += Math.sin(2 * Math.PI * f * (t - st)) * (0.12 - k * 0.018);
    });
    d[i] = s * env;
  }
  return buffer;
}

/** Tiny positive blip for gained seconds. */
function createTimeGainBuffer(ctx, durationSec = 0.16) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 14) * (1 - t / durationSec);
    const s =
      Math.sin(2 * Math.PI * 880 * t) * 0.22 +
      Math.sin(2 * Math.PI * 1320 * t) * 0.11;
    d[i] = s * env;
  }
  return buffer;
}

function playOneShot(audio, vol) {
  if (!audio || !audio.buffer) return;
  try {
    audio.stop();
  } catch (_) {
    /* not started yet */
  }
  audio.setVolume(vol);
  audio.play();
}

export class GameAudio {
  constructor() {
    /** @type {THREE.AudioListener | null} */
    this.listener = null;
    this.levels = { ...AUDIO_LEVELS };
    /** @type {Record<string, AudioBuffer>} */
    this._buffers = {};
    /** @type {THREE.Audio[]} */
    this._tapPool = [];
    this._tapIdx = 0;
    /** @type {THREE.Audio | null} */
    this._throw = null;
    this._correct = null;
    this._wrong = null;
    this._thud = null;
    this._trash = null;
    /** @type {THREE.Audio | null} */
    this._timeUp = null;
    this._timeGain = null;
    /** @type {THREE.Audio | null} */
    this._music = null;
    this._musicStarted = false;
    this._unlocked = false;
  }

  /**
   * Attach listener, build all buffers (preload), create Audio nodes.
   * @param {THREE.Camera} camera
   */
  init(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    const ctx = this.listener.context;

    this._buffers = {
      tap: createTapBuffer(ctx),
      throw: createWhooshBuffer(ctx),
      correct: createPlinBuffer(ctx),
      wrongSplat: createSplatBuffer(ctx),
      missThud: createThudBuffer(ctx),
      trash: createTrashBuffer(ctx),
      funk: createBouncyLoopBuffer(ctx),
      timeUp: createTimeUpBuffer(ctx),
      timeGain: createTimeGainBuffer(ctx),
    };

    for (let i = 0; i < 6; i++) {
      const a = new THREE.Audio(this.listener);
      a.setBuffer(this._buffers.tap);
      this._tapPool.push(a);
    }

    this._throw = new THREE.Audio(this.listener);
    this._throw.setBuffer(this._buffers.throw);

    this._correct = new THREE.Audio(this.listener);
    this._correct.setBuffer(this._buffers.correct);

    this._wrong = new THREE.Audio(this.listener);
    this._wrong.setBuffer(this._buffers.wrongSplat);

    this._thud = new THREE.Audio(this.listener);
    this._thud.setBuffer(this._buffers.missThud);

    this._trash = new THREE.Audio(this.listener);
    this._trash.setBuffer(this._buffers.trash);

    this._timeUp = new THREE.Audio(this.listener);
    this._timeUp.setBuffer(this._buffers.timeUp);
    this._timeGain = new THREE.Audio(this.listener);
    this._timeGain.setBuffer(this._buffers.timeGain);

    this._music = new THREE.Audio(this.listener);
    this._music.setBuffer(this._buffers.funk);
    this._music.setLoop(true);
    this._applyMusicVolume();

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.startMusicIfNeeded();
    });
    if (ctx.state === 'running') this.startMusicIfNeeded();
  }

  _sfxVol(key) {
    return this.levels.master * this.levels.sfx * this.levels[key];
  }

  _applyMusicVolume() {
    if (this._music) {
      this._music.setVolume(this.levels.master * this.levels.music);
    }
  }

  setMaster(v) {
    this.levels.master = Math.max(0, Math.min(1, v));
    this._applyMusicVolume();
  }

  setMusic(v) {
    this.levels.music = Math.max(0, Math.min(1, v));
    this._applyMusicVolume();
  }

  setSfx(v) {
    this.levels.sfx = Math.max(0, Math.min(1, v));
  }

  /** Resume AudioContext after user gesture (required on many browsers). */
  async tryUnlock() {
    if (!this.listener) return;
    const ctx = this.listener.context;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this._unlocked = true;
  }

  /** Start jazz loop once context is running (call after tryUnlock). */
  startMusicIfNeeded() {
    if (!this._music || this._musicStarted) return;
    if (this.listener?.context?.state !== 'running') return;
    try {
      this._music.play();
      this._musicStarted = true;
    } catch (_) {
      /* ignore */
    }
  }

  playTap() {
    if (!this._tapPool.length) return;
    const a = this._tapPool[this._tapIdx % this._tapPool.length];
    this._tapIdx++;
    playOneShot(a, this._sfxVol('tap'));
  }

  /** Short coin stack tick (shares tap buffer, different gain). */
  playCoinTick() {
    if (!this._tapPool.length) return;
    const a = this._tapPool[this._tapIdx % this._tapPool.length];
    this._tapIdx++;
    playOneShot(a, this._sfxVol('coinTick'));
  }

  playThrow() {
    playOneShot(this._throw, this._sfxVol('throw'));
  }

  playCorrect() {
    playOneShot(this._correct, this._sfxVol('correct'));
  }

  playWrongSplat() {
    playOneShot(this._wrong, this._sfxVol('wrongSplat'));
  }

  playMissThud() {
    playOneShot(this._thud, this._sfxVol('missThud'));
  }

  playTrash() {
    playOneShot(this._trash, this._sfxVol('trash'));
  }

  playTimeUp() {
    playOneShot(this._timeUp, this._sfxVol('timeUp'));
  }

  playTimeGain() {
    playOneShot(this._timeGain, this._sfxVol('timeGain'));
  }
}
