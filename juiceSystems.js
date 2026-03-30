/**
 * Screen shake, coin flyout to HUD, helpers.
 */

import * as THREE from 'three';

const _driftBase = new THREE.Vector3();

/**
 * Sub-millimeter camera sway on the ScreenShake rest pose (alive, subtle).
 */
export class AmbientCameraDrift {
  /**
   * @param {ScreenShake} screenShake
   * @param {THREE.Vector3} restPosition
   */
  constructor(screenShake, restPosition) {
    this.screenShake = screenShake;
    this._rest = restPosition.clone();
    this._phase = Math.random() * Math.PI * 2;
    this._reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (this._reduced) {
      this.screenShake.setBase(this._rest);
      return;
    }
    this._phase += dt;
    const a = 0.026;
    const nx = Math.sin(this._phase * 0.36) * a + Math.sin(this._phase * 0.88) * (a * 0.32);
    const ny = Math.sin(this._phase * 0.44) * (a * 0.38);
    const nz = Math.cos(this._phase * 0.33) * (a * 0.48);
    _driftBase.set(this._rest.x + nx, this._rest.y + ny, this._rest.z + nz);
    this.screenShake.setBase(_driftBase);
  }
}

export class ScreenShake {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} basePosition world-space rest position
   */
  constructor(camera, basePosition) {
    this.camera = camera;
    this.basePosition = basePosition.clone();
    this._phase = 0;
    this._strength = 0;
    this._duration = 0;
    this._elapsed = 0;
  }

  /** @param {number} amount roughly 0.04–0.25 */
  trigger(amount) {
    this._strength = Math.max(this._strength, amount);
    this._duration = Math.max(this._duration, amount > 0.14 ? 0.42 : 0.28);
    this._elapsed = 0;
  }

  setBase(position) {
    this.basePosition.copy(position);
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (this._duration <= 0 || this._strength <= 0) {
      this.camera.position.copy(this.basePosition);
      return;
    }
    this._elapsed += dt;
    this._phase += dt * 55;
    const u = Math.min(1, this._elapsed / this._duration);
    const env = (1 - u) * (1 - u);
    const s = this._strength * env;
    this.camera.position.set(
      this.basePosition.x + Math.sin(this._phase * 1.7) * s * 0.85,
      this.basePosition.y + Math.cos(this._phase * 2.1) * s * 0.35,
      this.basePosition.z + Math.cos(this._phase * 1.3) * s * 0.75,
    );
    if (u >= 1) {
      this._strength = 0;
      this._duration = 0;
      this._elapsed = 0;
      this.camera.position.copy(this.basePosition);
    }
  }
}

function projectWorldToStage(world, camera, stageRect) {
  const v = world.clone().project(camera);
  const x = (v.x * 0.5 + 0.5) * stageRect.width;
  const y = (-v.y * 0.5 + 0.5) * stageRect.height;
  return { x, y, z: v.z };
}

/** HUD flyouts: do not cull on NDC z — Three.js z convention varies; x/y are enough for 2D overlay. */

/** HUD label fly to timer / coins (seconds). */
const HUD_FLYOUT_DUR = 0.3;

/**
 * Gold coin tokens flying to the coins HUD (ease-out cubic).
 */
export class CoinFlyoutLayer {
  /**
   * @param {HTMLElement} stageEl
   */
  constructor(stageEl) {
    this.stage = stageEl;
    /** @type {{ el: HTMLElement, delay: number, t: number, dur: number, sx: number, sy: number, ex: number, ey: number }[]} */
    this._items = [];
    /** @type {{ el: HTMLElement, t: number, dur: number, sx: number, sy: number, ex: number, ey: number }[]} */
    this._gainTexts = [];
    this._root = document.createElement('div');
    this._root.id = 'coin-flyout-layer';
    this._root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:19;overflow:hidden;';
    stageEl.appendChild(this._root);
  }

  /**
   * "+N" from play area toward the coins counter (same motion as time gain).
   * @param {THREE.Vector3} worldStart
   * @param {THREE.Camera} camera
   * @param {HTMLElement | null} targetEl e.g. #coins-value
   * @param {number} amount
   * @param {number} [durationSec]
   */
  spawnGainText(worldStart, camera, targetEl, amount, durationSec = HUD_FLYOUT_DUR) {
    const rect = this.stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const start = projectWorldToStage(worldStart, camera, rect);
    const el = document.createElement('div');
    el.className = 'coin-gain-flyout';
    el.textContent = `+${Math.max(0, Math.floor(amount))}`;
    el.setAttribute('aria-hidden', 'true');
    this._root.appendChild(el);

    let ex = rect.width * 0.88;
    let ey = rect.height * 0.08;
    if (targetEl) {
      const tr = targetEl.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) {
        ex = tr.left + tr.width / 2 - rect.left;
        ey = tr.top + tr.height / 2 - rect.top;
      }
    }

    this._gainTexts.push({
      el,
      t: 0,
      dur: durationSec,
      sx: start.x,
      sy: start.y,
      ex,
      ey,
    });
  }

  /**
   * @param {THREE.Vector3} worldStart
   * @param {THREE.Camera} camera
   * @param {HTMLElement | null} targetEl e.g. #coins-display
   * @param {number} coinCount visual coins (clamped)
   */
  spawnBurst(worldStart, camera, targetEl, coinCount) {
    const rect = this.stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const stageRect = rect;
    const start = projectWorldToStage(worldStart, camera, stageRect);

    let ex = stageRect.width * 0.12;
    let ey = stageRect.height * 0.06;
    if (targetEl) {
      const tr = targetEl.getBoundingClientRect();
      ex = tr.left + tr.width / 2 - rect.left;
      ey = tr.top + tr.height / 2 - rect.top;
    }

    const n = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(Math.max(1, coinCount)))));
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'coin-flyout';
      el.textContent = '🪙';
      el.setAttribute('aria-hidden', 'true');
      this._root.appendChild(el);
      const jitter = 22;
      const sx = start.x + (Math.random() - 0.5) * jitter;
      const sy = start.y + (Math.random() - 0.5) * jitter;
      this._items.push({
        el,
        delay: i * 0.055,
        t: 0,
        dur: 0.52 + i * 0.03,
        sx,
        sy,
        ex,
        ey,
      });
    }
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this._gainTexts.length - 1; i >= 0; i--) {
      const it = this._gainTexts[i];
      it.t += dt;
      const u = Math.min(1, it.t / it.dur);
      const e = 1 - (1 - u) ** 3;
      const amp = (1 - u) * 5;
      const wx = Math.sin(it.t * 52) * amp;
      const wy = Math.cos(it.t * 46) * amp * 0.85;
      const x = it.sx + (it.ex - it.sx) * e + wx;
      const y = it.sy + (it.ey - it.sy) * e + wy;
      const sc = 1.02 - u * 0.12;
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.transform = `translate(-50%, -50%) scale(${sc})`;
      it.el.style.opacity = String(1 - u * 0.15);
      if (u >= 1) {
        it.el.remove();
        this._gainTexts.splice(i, 1);
      }
    }

    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.t += dt;
      const u = Math.min(1, it.t / it.dur);
      const e = 1 - (1 - u) ** 3;
      const x = it.sx + (it.ex - it.sx) * e;
      const y = it.sy + (it.ey - it.sy) * e;
      const sc = 0.75 + 0.45 * Math.sin(u * Math.PI);
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.transform = `translate(-50%, -50%) scale(${sc})`;
      it.el.style.opacity = String(u < 0.88 ? 1 : (1 - u) / 0.12);
      if (u >= 1) {
        it.el.remove();
        this._items.splice(i, 1);
      }
    }
  }
}

/**
 * Floating +time labels that fly to timer HUD with slight jitter.
 */
export class TimeFlyoutLayer {
  /**
   * @param {HTMLElement} stageEl
   */
  constructor(stageEl) {
    this.stage = stageEl;
    /** @type {{ el: HTMLElement, t: number, dur: number, sx: number, sy: number, ex: number, ey: number }[]} */
    this._items = [];
    this._root = document.createElement('div');
    this._root.id = 'time-flyout-layer';
    this._root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
    stageEl.appendChild(this._root);
  }

  /**
   * @param {THREE.Vector3} worldStart
   * @param {THREE.Camera} camera
   * @param {HTMLElement | null} targetEl
   * @param {string} text
   */
  spawn(worldStart, camera, targetEl, text) {
    const rect = this.stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const start = projectWorldToStage(worldStart, camera, rect);
    const el = document.createElement('div');
    el.className = 'floating-bonus-text floating-bonus-text--pop';
    el.textContent = text;
    el.style.color = '#8fffd3';
    this._root.appendChild(el);

    let ex = rect.width * 0.5;
    let ey = rect.height * 0.12;
    if (targetEl) {
      const tr = targetEl.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) {
        ex = tr.left + tr.width / 2 - rect.left;
        ey = tr.top + tr.height / 2 - rect.top;
      }
    }

    this._items.push({
      el,
      t: 0,
      dur: HUD_FLYOUT_DUR,
      sx: start.x,
      sy: start.y,
      ex,
      ey,
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      it.t += dt;
      const u = Math.min(1, it.t / it.dur);
      const e = 1 - (1 - u) ** 3;
      const amp = (1 - u) * 6;
      const wx = Math.sin(it.t * 52) * amp;
      const wy = Math.cos(it.t * 46) * amp * 0.85;
      const x = it.sx + (it.ex - it.sx) * e + wx;
      const y = it.sy + (it.ey - it.sy) * e + wy;
      const sc = 1.05 - u * 0.18;
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.transform = `translate(-50%, -50%) scale(${sc})`;
      it.el.style.opacity = String(1 - u * 0.2);
      if (u >= 1) {
        it.el.remove();
        this._items.splice(i, 1);
      }
    }
  }
}
