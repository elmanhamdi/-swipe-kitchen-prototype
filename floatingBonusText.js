/**
 * Screen-space floating labels tied to world positions (rise + fade).
 */

import * as THREE from 'three';

/**
 * @typedef {{ duration?: number, riseSpeed?: number, className?: string, comboPulse?: boolean }} FloatTextOpts
 */

export class FloatingBonusLayer {
  /**
   * @param {HTMLElement} stageEl #canvas-stage
   * @param {THREE.Camera} camera
   */
  constructor(stageEl, camera) {
    this.stage = stageEl;
    this.camera = camera;
    /** @type {{ el: HTMLElement, world: THREE.Vector3, rise: number, age: number, duration: number, riseSpeed: number, screenDriftY: number, comboPulse?: boolean }[]} */
    this._items = [];
    this._root = document.createElement('div');
    this._root.id = 'floating-bonus-layer';
    this._root.setAttribute('aria-hidden', 'true');
    this._root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:18;overflow:hidden;';
    stageEl.appendChild(this._root);
  }

  /**
   * @param {THREE.Vector3} worldPosition
   * @param {string} text
   * @param {string} [color]
   * @param {FloatTextOpts} [opts]
   */
  spawn(worldPosition, text, color = '#ffffff', opts = {}) {
    const el = document.createElement('div');
    el.className = ['floating-bonus-text', opts.className].filter(Boolean).join(' ');
    el.textContent = text;
    el.style.color = color;
    this._root.appendChild(el);
    this._items.push({
      el,
      world: worldPosition.clone(),
      rise: 0,
      age: 0,
      duration: opts.duration ?? 1.35,
      riseSpeed: opts.riseSpeed ?? 1.15,
      screenDriftY: 0,
      comboPulse: opts.comboPulse === true,
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    const rect = this.stage.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;

    for (let i = this._items.length - 1; i >= 0; i--) {
      const it = this._items[i];
      it.age += dt;
      it.rise += it.riseSpeed * dt;
      it.screenDriftY -= 42 * dt;

      const v = new THREE.Vector3(it.world.x, it.world.y + it.rise, it.world.z);
      v.project(this.camera);

      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h + it.screenDriftY;

      const u = it.age / it.duration;
      const opacity = Math.max(0, 1 - u * u);

      let transform = 'translate(-50%, -120%)';
      if (it.comboPulse) {
        const pop = Math.min(1, it.age * 5.5);
        const ease = 1 - Math.pow(1 - pop, 2.4);
        const scale = pop < 1 ? 0.42 + 0.58 * ease : 1;
        transform += ` scale(${scale})`;
      }

      it.el.style.opacity = String(opacity);
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.transform = transform;

      if (it.age >= it.duration || v.z > 1) {
        it.el.remove();
        this._items.splice(i, 1);
      }
    }
  }
}
