/**
 * Burger stacking rules (data only — no Three.js).
 */

/** Canonical stack ids (orders + internal state). */
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

  _resolveType(type) {
    let resolved = type;
    if (type === 'bun') {
      if (this._ingredients.length === 0) resolved = 'bun_bottom';
      else if (this._isSealed()) return { ok: false, reason: 'already_complete' };
      else resolved = 'bun_top';
    }
    return { ok: true, resolved };
  }

  _validateResolvedType(resolved) {
    if (!INGREDIENT_TYPES.includes(resolved)) {
      return { ok: false, reason: 'unknown_type' };
    }
    // Demo: keep stacks simple and readable — no duplicate ingredients.
    // (Also prevents patterns like meat→meat.)
    if (this._ingredients.includes(resolved)) {
      return { ok: false, reason: 'duplicate_ingredient' };
    }
    if (this._ingredients.length >= 6) {
      return { ok: false, reason: 'max_layers' };
    }
    if (this._isSealed()) {
      return { ok: false, reason: 'already_complete' };
    }

    if (this._ingredients.length === 0) {
      if (resolved !== 'bun_bottom') {
        return { ok: false, reason: 'need_bun_bottom_first' };
      }
    } else if (resolved === 'bun_bottom') {
      return { ok: false, reason: 'bun_bottom_only_first' };
    }

    if (resolved === 'bun_top' && this._ingredients[0] !== 'bun_bottom') {
      return { ok: false, reason: 'need_bun_bottom_first' };
    }
    return { ok: true };
  }

  /**
   * @param {string} type
   * @returns {{ ok: boolean, reason?: string, resolved?: string }}
   */
  canAddIngredient(type) {
    const resolved = this._resolveType(type);
    if (!resolved.ok) return resolved;
    const valid = this._validateResolvedType(resolved.resolved);
    if (!valid.ok) return valid;
    return { ok: true, resolved: resolved.resolved };
  }

  /**
   * @param {string} type — use `bun` for unified bottom/top; or canonical ids.
   * @returns {{ ok: boolean, reason?: string }}
   */
  addIngredient(type) {
    const check = this.canAddIngredient(type);
    if (!check.ok || !check.resolved) return { ok: false, reason: check.reason ?? 'invalid' };
    this._ingredients.push(check.resolved);
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
