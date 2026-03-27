/**
 * Burger stacking rules (data only — no Three.js).
 */

/** Canonical list of ingredient type ids used by the game. */
export const INGREDIENT_TYPES = [
  'bun_bottom',
  'bun_top',
  'lettuce',
  'tomato',
  'cheese',
  'meat',
];

export class Burger {
  constructor() {
    /** @type {string[]} */
    this._ingredients = [];
  }

  /**
   * @param {string} type
   * @returns {{ ok: boolean, reason?: string }}
   */
  addIngredient(type) {
    if (!INGREDIENT_TYPES.includes(type)) {
      return { ok: false, reason: 'unknown_type' };
    }
    if (this._ingredients.length >= 6) {
      return { ok: false, reason: 'max_layers' };
    }
    if (this._isSealed()) {
      return { ok: false, reason: 'already_complete' };
    }

    if (this._ingredients.length === 0) {
      if (type !== 'bun_bottom') {
        return { ok: false, reason: 'need_bun_bottom_first' };
      }
    } else if (type === 'bun_bottom') {
      return { ok: false, reason: 'bun_bottom_only_first' };
    }

    if (type === 'bun_top' && this._ingredients[0] !== 'bun_bottom') {
      return { ok: false, reason: 'need_bun_bottom_first' };
    }

    this._ingredients.push(type);
    return { ok: true };
  }

  /** Stack is closed after a top bun is placed (no further adds). */
  _isSealed() {
    const n = this._ingredients.length;
    return n > 0 && this._ingredients[n - 1] === 'bun_top';
  }

  reset() {
    this._ingredients.length = 0;
  }

  /** @returns {string[]} shallow copy */
  getStack() {
    return [...this._ingredients];
  }

  /** Valid finished burger: bottom bun first, top bun last, ≤6 items. */
  isComplete() {
    const s = this._ingredients;
    if (s.length < 2 || s.length > 6) return false;
    return s[0] === 'bun_bottom' && s[s.length - 1] === 'bun_top';
  }
}
