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
  tickTock: 0.4,
  sizzle: 0.07,
  grillDing: 0.5,
  bell: 0.6,
  tableCrash: 0.28,
  mumble: 0.32,
};

const MUSIC_TRACK_URL = './assets/O%20P%20Baron%20-%20Welcome%20to%20Our%20Show.mp3';

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

function createTableCrashBuffer(ctx, durationSec = 0.35) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 8) * (1 - t / durationSec);
    const thump = Math.sin(2 * Math.PI * 80 * t) * 0.3 * Math.exp(-t * 14);
    const rattle = (Math.random() * 2 - 1) * 0.18 * Math.exp(-t * 5);
    const wood = Math.sin(2 * Math.PI * 220 * t) * 0.08 * Math.exp(-t * 18);
    d[i] = (thump + rattle + wood) * env * 0.4;
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
function createBouncyLoopBuffer(ctx, durationSec = 32) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(2, n, sr);
  const bpm = 118;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const stepDur = beatDur / 2;

  const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0, B4 = 493.88;
  const scale = [C4, D4, E4, G4, A4];

  const melodyPhrases = [
    [0, 2, 1, 3, 2, 4, 3, 1],
    [2, 4, 3, 1, 0, 2, 4, 3],
    [4, 3, 2, 0, 1, 3, 4, 2],
    [1, 0, 2, 4, 3, 2, 0, 1],
    [3, 4, 2, 1, 0, 3, 1, 2],
    [0, 1, 3, 2, 4, 0, 2, 3],
    [2, 3, 4, 1, 0, 4, 3, 0],
    [4, 2, 0, 3, 1, 0, 2, 4],
  ];
  const bassPhrases = [
    [0, 0, 3, 0, 4, 0, 3, 0],
    [0, 3, 0, 4, 0, 2, 0, 3],
    [3, 0, 4, 0, 2, 0, 3, 0],
    [4, 0, 3, 0, 0, 4, 0, 3],
    [0, 2, 0, 3, 4, 0, 2, 0],
    [2, 0, 4, 0, 3, 0, 0, 2],
    [0, 4, 3, 0, 2, 0, 4, 0],
    [3, 0, 0, 4, 0, 3, 2, 0],
  ];

  const chordRoots = [C4, F4, G4, C4, A4 / 2, F4, G4, C4];

  const sections = [
    { melVol: 0.04, bassVol: 0.16, kickVol: 0.06, hatVol: 0.008, chordVol: 0.0 },
    { melVol: 0.08, bassVol: 0.16, kickVol: 0.08, hatVol: 0.010, chordVol: 0.02 },
    { melVol: 0.11, bassVol: 0.16, kickVol: 0.09, hatVol: 0.012, chordVol: 0.035 },
    { melVol: 0.12, bassVol: 0.17, kickVol: 0.09, hatVol: 0.014, chordVol: 0.04 },
    { melVol: 0.11, bassVol: 0.16, kickVol: 0.09, hatVol: 0.012, chordVol: 0.035 },
    { melVol: 0.12, bassVol: 0.17, kickVol: 0.09, hatVol: 0.014, chordVol: 0.04 },
    { melVol: 0.10, bassVol: 0.15, kickVol: 0.08, hatVol: 0.010, chordVol: 0.03 },
    { melVol: 0.06, bassVol: 0.14, kickVol: 0.06, hatVol: 0.008, chordVol: 0.01 },
  ];

  const seededRandom = (function () {
    let s = 42;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  })();

  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    const pan = ch === 0 ? 0.96 : 1.04;
    let melPhase = 0, bassPhase = 0, chordPhase1 = 0, chordPhase2 = 0;

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const barIdx = Math.floor(t / barDur) % 8;
      const sec = sections[barIdx];
      const melody = melodyPhrases[barIdx];
      const bass = bassPhrases[barIdx];
      const chordRoot = chordRoots[barIdx];

      const step = Math.floor(t / stepDur);
      const u = (t / stepDur) % 1;

      const env = Math.min(1, u * 18) * Math.exp(-u * 6.5);
      const envSoft = Math.min(1, u * 10) * Math.exp(-u * 3.2);
      const envPad = Math.min(1, u * 5) * Math.exp(-u * 1.2);

      const melIdx = melody[step % melody.length];
      const bassIdx = bass[step % bass.length];

      const melOct = (step % 16 === 7 || step % 16 === 15) ? 2 : 1;
      const melFreq = scale[melIdx] * melOct;
      const bassFreq = (scale[bassIdx] / 2) * (step % 4 === 2 ? 1.0 : 0.5);

      melPhase += (2 * Math.PI * melFreq) / sr;
      bassPhase += (2 * Math.PI * bassFreq) / sr;
      chordPhase1 += (2 * Math.PI * chordRoot) / sr;
      chordPhase2 += (2 * Math.PI * chordRoot * 1.498) / sr;

      let s = 0;
      s += sec.bassVol * pan * envSoft * (Math.sin(bassPhase) + 0.18 * Math.sin(bassPhase * 2));

      const tri =
        0.68 * Math.sin(melPhase) +
        0.22 * Math.sin(melPhase * 3) +
        0.10 * Math.sin(melPhase * 5);
      s += sec.melVol * pan * env * tri;

      s += sec.chordVol * pan * envPad * (
        Math.sin(chordPhase1) * 0.5 +
        Math.sin(chordPhase2) * 0.35 +
        Math.sin(chordPhase1 * 2) * 0.15
      );

      const beat = t / beatDur;
      const beatPhase = beat % 1;
      const beatStep = Math.floor(beat) % 4;
      if ((beatStep === 0 || beatStep === 2) && beatPhase < 0.12) {
        const kenv = Math.sin((beatPhase / 0.12) * Math.PI) * (1 - beatPhase / 0.12);
        s += sec.kickVol * pan * kenv * Math.sin(2 * Math.PI * (95 - beatPhase * 420) * t);
      }

      if (beatPhase > 0.48 && beatPhase < 0.52) {
        const hn = (seededRandom() * 2 - 1);
        const henv = 1 - Math.abs((beatPhase - 0.5) / 0.02);
        s += sec.hatVol * pan * hn * henv;
      }

      if (beatStep === 1 && beatPhase < 0.06) {
        const snEnv = Math.sin((beatPhase / 0.06) * Math.PI) * (1 - beatPhase / 0.06);
        s += 0.03 * pan * snEnv * (seededRandom() * 2 - 1);
      }

      d[i] = Math.max(-1, Math.min(1, s * 0.92));
    }
  }
  return buffer;
}

/** Short cheerful “time up” sting. */
function createTimeUpBuffer(ctx, durationSec = 0.45) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fadeIn = Math.min(1, t / 0.02);
    const fadeOut = Math.max(0, 1 - Math.max(0, t - (durationSec - 0.08)) / 0.08);
    const env = fadeIn * fadeOut;
    const buzz = Math.sign(Math.sin(2 * Math.PI * 120 * t)) * 0.12;
    const tone = Math.sin(2 * Math.PI * 185 * t) * 0.10;
    const hi = Math.sin(2 * Math.PI * 370 * t) * 0.04;
    d[i] = (buzz + tone + hi) * env * 0.55;
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

/** Short clock tick — metallic click with resonance. */
function createTickTockBuffer(ctx, durationSec = 0.06) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 65);
    const click = Math.sin(2 * Math.PI * 3200 * t) * 0.3;
    const body = Math.sin(2 * Math.PI * 1200 * t) * 0.2;
    const ring = Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 35) * 0.15;
    d[i] = (click + body + ring) * env;
  }
  return buffer;
}

/** Bright oven-timer ding — two quick bell tones. */
function createGrillDingBuffer(ctx, durationSec = 0.35) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const f1 = 1568;
  const f2 = 2093;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env1 = t < 0.15 ? Math.exp(-t * 18) : 0;
    const env2 = t > 0.1 ? Math.exp(-(t - 0.1) * 20) : 0;
    const bell1 = Math.sin(2 * Math.PI * f1 * t) * 0.35 + Math.sin(2 * Math.PI * f1 * 2.0 * t) * 0.12;
    const bell2 = Math.sin(2 * Math.PI * f2 * t) * 0.30 + Math.sin(2 * Math.PI * f2 * 2.0 * t) * 0.10;
    d[i] = Math.max(-1, Math.min(1, bell1 * env1 + bell2 * env2));
  }
  return buffer;
}

/** Kitchen-timer bell — warm metallic double-ding with shimmer. */
function createBellBuffer(ctx, durationSec = 2.2) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const strikes = [0, 0.3, 0.6, 1.0, 1.3];
  const f0 = 680;
  const partials = [
    { ratio: 1.0,  amp: 0.40, decay: 3.0 },
    { ratio: 1.5,  amp: 0.12, decay: 4.5 },
    { ratio: 2.0,  amp: 0.20, decay: 5.0 },
    { ratio: 2.71, amp: 0.08, decay: 7.0 },
    { ratio: 3.6,  amp: 0.04, decay: 9.0 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (const st of strikes) {
      if (t < st) continue;
      const dt = t - st;
      const hitEnv = Math.min(1, dt * 800) * Math.exp(-dt * 1.5);
      for (const p of partials) {
        s += p.amp * hitEnv * Math.exp(-dt * p.decay) *
          Math.sin(2 * Math.PI * f0 * p.ratio * dt);
      }
    }
    d[i] = Math.max(-1, Math.min(1, s * 0.85));
  }
  return buffer;
}

/**
 * Continuous oil-sizzle loop — filtered noise with random crackle pops.
 * Designed to loop seamlessly.
 */
function createSizzleBuffer(ctx, durationSec = 2.0) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * durationSec);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);

  let seed = 7;
  function rng() {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }

  let lp = 0;
  const lpAlpha = 0.12;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const raw = rng() * 2 - 1;
    lp += lpAlpha * (raw - lp);
    let s = lp * 0.6;

    const hiss = (rng() * 2 - 1) * 0.25;
    s += hiss * Math.max(0, Math.sin(2 * Math.PI * 0.8 * t));

    if (rng() < 0.008) {
      const popLen = Math.floor(sr * (0.003 + rng() * 0.008));
      const popAmp = 0.3 + rng() * 0.4;
      for (let j = 0; j < popLen && (i + j) < n; j++) {
        const pEnv = 1 - j / popLen;
        d[i + j] += (rng() * 2 - 1) * popAmp * pEnv * pEnv;
      }
    }

    const fade = Math.min(1, i / (sr * 0.02)) * Math.min(1, (n - i) / (sr * 0.02));
    d[i] = (d[i] || 0) + s * fade;
  }

  for (let i = 0; i < n; i++) {
    d[i] = Math.max(-1, Math.min(1, d[i]));
  }
  return buffer;
}

/**
 * Procedural gibberish syllable — gender-aware unique voices.
 * Deep grumbly males, sweet high-pitched females, wide variety.
 * @param {AudioContext} ctx
 * @param {{ pitch: number, formantShift: number, breathiness: number, speed: number, warmth: number }} voice
 */
function createMumbleBuffer(ctx, voice) {
  const sr = ctx.sampleRate;
  const syllCount = 1 + Math.floor(Math.random() * 3);
  const syllDur = (0.08 + Math.random() * 0.06) / voice.speed;
  const gapDur = (0.02 + Math.random() * 0.025) / voice.speed;
  const totalDur = syllCount * (syllDur + gapDur) + 0.015;
  const n = Math.floor(sr * totalDur);
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);

  const isDeep = voice.pitch < 250;

  const contour = Math.random();
  const pitches = [];
  for (let si = 0; si < syllCount; si++) {
    let p = voice.pitch;
    if (contour < 0.35) p *= 1 + si * 0.08;
    else if (contour < 0.65) p *= 1.06 - si * 0.05;
    else p *= 1 + Math.sin((si / Math.max(1, syllCount - 1)) * Math.PI) * 0.14;
    p *= 0.93 + Math.random() * 0.14;
    pitches.push(p);
  }

  const w = voice.warmth;
  const vowelSets = isDeep ? [
    // Deep voices: richer harmonics, more 2nd/3rd partial for "grumble" character
    [1.0, 0.60 * w, 0.35 * w, 0.20 * w, 0.10],
    [0.90, 0.70 * w, 0.25 * w, 0.30 * w, 0.08],
    [0.85, 0.50 * w, 0.40 * w, 0.15 * w, 0.12],
    [0.95, 0.55 * w, 0.30 * w, 0.25 * w, 0.06],
  ] : [
    // High voices: fundamental-dominant, gentle upper partials for sweetness
    [1.0, 0.30 * w, 0.08 * w, 0.03],
    [0.92, 0.40 * w, 0.06 * w, 0.05],
    [0.88, 0.22 * w, 0.14 * w, 0.02],
    [0.95, 0.35 * w, 0.10 * w, 0.06],
    [0.85, 0.45 * w, 0.05 * w, 0.04],
  ];

  let phase = 0;
  const period = syllDur + gapDur;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const syllIdx = Math.min(syllCount - 1, Math.floor(t / period));
    const localT = t - syllIdx * period;

    if (localT > syllDur || syllIdx >= syllCount) { d[i] = 0; continue; }

    const u = localT / syllDur;

    // Deep voices: punchier attack; high voices: soft bell
    const env = isDeep
      ? Math.min(1, u * 24) * Math.pow(Math.max(0, 1 - u), 0.55)
      : Math.sin(u * Math.PI) * (1 - u * 0.18);

    // Pitch glide — deep voices drop down, high voices slide up
    const glide = isDeep ? (1 + (1 - u) * 0.04) : (1 - (1 - u) * 0.05);
    const freq = pitches[syllIdx] * glide;
    phase += (2 * Math.PI * freq) / sr;

    const vowel = vowelSets[(syllIdx + Math.floor(voice.pitch * 0.031)) % vowelSets.length];

    let s = 0;
    for (let k = 0; k < vowel.length; k++) {
      s += vowel[k] * Math.sin(phase * (k + 1));
    }
    s *= voice.formantShift;

    // Deep voices: slower wobble; high voices: gentle vibrato
    const vibRate = isDeep ? 14 : 24;
    const vibAmp = isDeep ? 0.07 : 0.04;
    s *= 1 + Math.sin(t * Math.PI * vibRate) * vibAmp;

    s += (Math.random() * 2 - 1) * voice.breathiness * (isDeep ? 0.14 : 0.08);

    d[i] = Math.max(-1, Math.min(1, s * env * 0.55));
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
    this._tickTock = null;
    this._sizzle = null;
    this._sizzlePlaying = false;
    this._grillDing = null;
    this._bell = null;
    /** @type {THREE.Audio | null} */
    this._music = null;
    this._musicReady = false;
    this._musicWanted = false;
    this._unlocked = false;
    this._muted = false;
    this._preMuteMaster = AUDIO_LEVELS.master;
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
      timeUp: createTimeUpBuffer(ctx),
      timeGain: createTimeGainBuffer(ctx),
      tickTock: createTickTockBuffer(ctx),
      sizzle: createSizzleBuffer(ctx),
      grillDing: createGrillDingBuffer(ctx),
      bell: createBellBuffer(ctx),
      tableCrash: createTableCrashBuffer(ctx),
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

    this._tableCrash = new THREE.Audio(this.listener);
    this._tableCrash.setBuffer(this._buffers.tableCrash);

    this._timeUp = new THREE.Audio(this.listener);
    this._timeUp.setBuffer(this._buffers.timeUp);
    this._timeGain = new THREE.Audio(this.listener);
    this._timeGain.setBuffer(this._buffers.timeGain);
    this._tickTock = new THREE.Audio(this.listener);
    this._tickTock.setBuffer(this._buffers.tickTock);

    this._sizzle = new THREE.Audio(this.listener);
    this._sizzle.setBuffer(this._buffers.sizzle);
    this._sizzle.setLoop(true);
    this._sizzle.setVolume(0);

    this._grillDing = new THREE.Audio(this.listener);
    this._grillDing.setBuffer(this._buffers.grillDing);

    this._bell = new THREE.Audio(this.listener);
    this._bell.setBuffer(this._buffers.bell);

    this._music = new THREE.Audio(this.listener);
    this._music.setLoop(true);
    this._applyMusicVolume();

    const musicLoader = new THREE.AudioLoader();
    musicLoader.load(
      MUSIC_TRACK_URL,
      (buffer) => {
        if (!this._music) return;
        this._music.setBuffer(buffer);
        this._musicReady = true;
        if (this._musicWanted && ctx.state === 'running') this.restartMusic();
      },
      undefined,
      () => {
        this._musicReady = false;
      },
    );

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && this._musicWanted) this.restartMusic();
    });
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

  get isMuted() {
    return this._muted;
  }

  toggleMute() {
    if (this._muted) {
      this._muted = false;
      this.levels.master = this._preMuteMaster;
    } else {
      this._preMuteMaster = this.levels.master || AUDIO_LEVELS.master;
      this._muted = true;
      this.levels.master = 0;
    }
    this._applyMusicVolume();
    this._applySizzleVolume();
    return this._muted;
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

  /** Start or restart the selected music track from the beginning. */
  restartMusic() {
    this._musicWanted = true;
    if (!this._music || !this._musicReady) return;
    if (this.listener?.context?.state !== 'running') return;
    try {
      if (this._music.isPlaying) this._music.stop();
      this._music.play();
    } catch (_) {
      /* ignore */
    }
  }

  stopMusic() {
    this._musicWanted = false;
    if (!this._music?.isPlaying) return;
    try {
      this._music.stop();
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

  playTableCrash() {
    playOneShot(this._tableCrash, this._sfxVol('tableCrash'));
  }

  playTimeUp() {
    playOneShot(this._timeUp, this._sfxVol('timeUp'));
  }

  playTimeGain() {
    playOneShot(this._timeGain, this._sfxVol('timeGain'));
  }

  playTickTock() {
    playOneShot(this._tickTock, this._sfxVol('tickTock'));
  }

  playGrillDing() {
    playOneShot(this._grillDing, this._sfxVol('grillDing'));
  }

  playBell() {
    playOneShot(this._bell, this._sfxVol('bell'));
  }

  dimMusic() {
    if (!this._music) return;
    this._music.setVolume(this.levels.master * this.levels.music * 0.35);
  }

  restoreMusicVolume() {
    this._applyMusicVolume();
  }

  startSizzle() {
    if (!this._sizzle || this._sizzlePlaying) return;
    this._sizzlePlaying = true;
    this._sizzle.setVolume(this.levels.master * this.levels.sfx * this.levels.sizzle);
    try { this._sizzle.play(); } catch (_) { /* already playing */ }
  }

  stopSizzle() {
    if (!this._sizzle || !this._sizzlePlaying) return;
    this._sizzlePlaying = false;
    try { this._sizzle.stop(); } catch (_) { /* not playing */ }
  }

  _applySizzleVolume() {
    if (this._sizzle && this._sizzlePlaying) {
      this._sizzle.setVolume(this.levels.master * this.levels.sfx * this.levels.sizzle);
    }
  }

  /**
   * Fire-and-forget procedural gibberish with per-character voice.
   * @param {{ pitch: number, formantShift: number, breathiness: number, speed: number }} voiceProfile
   */
  playMumble(voiceProfile) {
    if (!this.listener) return;
    const ctx = this.listener.context;
    if (ctx.state !== 'running') return;

    const vol = this._sfxVol('mumble');
    if (vol <= 0) return;

    const buf = createMumbleBuffer(ctx, voiceProfile);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this.listener.getInput());
    src.start();
  }
}
