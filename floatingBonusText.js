/**
 * Screen-space floating labels tied to world positions (fade + rise).
 */

import * as THREE from 'three';

export class FloatingBonusLayer {
  /**
   * @param {HTMLElement} stageEl #canvas-stage
   * @param {THREE.Camera} camera
   */
  constructor(stageEl, camera) {
    this.stage = stageEl;
    this.camera = camera;
    /** @type {{ el: HTMLElement, world: THREE.Vector3, rise: number, age: number, duration: number }[]} */
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
   */
  spawn(worldPosition, text, color = '#ffffff') {
    const el = document.createElement('div');
    el.className = 'floating-bonus-text';
    el.textContent = text;
    el.style.color = color;
    this._root.appendChild(el);
    this._items.push({
      el,
      world: worldPosition.clone(),
      rise: 0,
      age: 0,
      duration: 1.2,
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
      it.rise += 0.95 * dt;

      const v = new THREE.Vector3(it.world.x, it.world.y + it.rise, it.world.z);
      v.project(this.camera);

      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;

      const u = it.age / it.duration;
      const opacity = Math.max(0, 1 - u * u);

      it.el.style.opacity = String(opacity);
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.transform = 'translate(-50%, -120%)';

      if (it.age >= it.duration || v.z > 1) {
        it.el.remove();
        this._items.splice(i, 1);
      }
    }
  }
}
