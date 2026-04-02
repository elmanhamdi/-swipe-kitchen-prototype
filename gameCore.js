/**
 * Session timer, combo multiplier, and scoring rules.
 */

export const START_TIME_SECONDS = 45;
export const TIME_BONUS_PER_DELIVERY = 10;
export const COMBO_MAX = 3;

/** Optional flat bonus when scoring at max multiplier (before combo steps up). */
export const BONUS_AT_MAX_COMBO = 1;

/** FAST: first ingredient → hit customer within this many seconds (inclusive). */
export const FAST_BUILD_MAX_SEC = 4;

/** INSANE: throw in air longer than this (exclusive) to qualify. */
export const INSANE_AIR_MIN_SEC = 3;


export class GameSession {
  constructor() {
    this.timeLeft = START_TIME_SECONDS;
    this.gameOver = false;
    /** Until player taps “Open”, timer and throws stay off. */
    this.shopIsOpen = false;
    /** Info modal open — pauses timer / gameplay. */
    this.hudInfoOpen = false;
    /** 1, 2, or 3 — applies to the *current* delivery, then steps up on success. */
    this.combo = 1;
    this.totalCoins = 0;
    this.customersServed = 0;

    /** performance.now() when current burger got its first ingredient; null = idle / cleared. */
    this._burgerBuildStartMs = null;
    /** performance.now() when projectile left the slingshot. */
    this._throwAirStartMs = null;
  }

  /**
   * @param {number} dt
   */
  tick(dt) {
    if (this.gameOver || !this.shopIsOpen || this.hudInfoOpen) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameOver = true;
    }
  }

  resetCombo() {
    this.combo = 1;
  }

  /** Ground splat, wall splat, wrong customer hit path sets combo to 1 (wrong also handled here before 30% leave). */
  onComboBreakEvent() {
    this.resetCombo();
  }

  /** Call when the plate gets its first layer (after successful add). */
  notifyFirstIngredientPlaced() {
    if (this._burgerBuildStartMs == null) {
      this._burgerBuildStartMs = performance.now();
    }
  }

  /** Call when the burger leaves the slingshot. */
  notifyThrowLaunched() {
    this._throwAirStartMs = performance.now();
  }

  /** Missed throw / splat / dog clear / serve — abandon FAST / INSANE windows. */
  clearBurgerTiming() {
    this._burgerBuildStartMs = null;
    this._throwAirStartMs = null;
  }

  /**
   * Exact-match correct delivery (serve or thrown burger).
   * Throw FAST/INSANE: each qualifying bonus adds `combo` coins (stacks with multiplier).
   * @param {number} baseReward from customer mood (e.g. 2 happy / 1 other)
   * @param {number} [extraBonuses] additional flat coins (not multiplied)
   * @param {{ fast?: boolean, insane?: boolean }} [throwBonuses] only for successful throw hits
   * @returns {{ earned: number, comboAfter: number, comboApplied: number }}
   */
  applyCorrectDelivery(baseReward, extraBonuses = 0, throwBonuses = {}) {
    if (this.gameOver) {
      return { earned: 0, comboAfter: this.combo, comboApplied: 1 };
    }
    const mult = Math.min(COMBO_MAX, Math.max(1, this.combo));
    const maxComboBonus = mult === COMBO_MAX ? BONUS_AT_MAX_COMBO : 0;
    const tb =
      (throwBonuses.fast ? 1 : 0) + (throwBonuses.insane ? 1 : 0);
    const stackedThrowCoins = tb * mult;
    const earned = Math.floor(baseReward * mult) + stackedThrowCoins + extraBonuses + maxComboBonus;
    this.totalCoins += earned;
    this.customersServed++;
    this.combo = Math.min(COMBO_MAX, this.combo + 1);
    return { earned, comboAfter: this.combo, comboApplied: mult };
  }

  /**
   * Thrown burger hit a customer: exact stack vs order.
   * @param {string[]} thrownStack
   * @param {number} entryIndex index into customerManager.entries
   * @param {import('./customerManager.js').CustomerManager} customerManager
   * @returns {{ correct: boolean, fast?: boolean, insane?: boolean, earned?: number, comboAfter?: number, comboApplied?: number, timeBonus?: number }}
   */
  resolveThrowVsCustomer(thrownStack, entryIndex, customerManager) {
    const entry = customerManager.entries[entryIndex];
    if (!entry || entry.phase !== 'seated') {
      this.onComboBreakEvent();
      return { correct: false };
    }

    if (entry.customer.orderMatches(thrownStack)) {
      const now = performance.now();
      let fast = false;
      let insane = false;
      if (this._burgerBuildStartMs != null) {
        fast = (now - this._burgerBuildStartMs) / 1000 <= FAST_BUILD_MAX_SEC;
      }
      if (this._throwAirStartMs != null) {
        insane = (now - this._throwAirStartMs) / 1000 > INSANE_AIR_MIN_SEC;
      }

      const base = entry.customer.getCoinReward();
      const { earned, comboAfter, comboApplied } = this.applyCorrectDelivery(base, 0, { fast, insane });
      const timeBonus = TIME_BONUS_PER_DELIVERY;
      this.timeLeft += timeBonus;
      customerManager.onSuccessfulDelivery(entryIndex);
      return { correct: true, fast, insane, earned, comboAfter, comboApplied, timeBonus };
    }

    this.onComboBreakEvent();
    return { correct: false };
  }

  /** Start round after “Open” button (timer + throws + picks). */
  openShop() {
    if (this.gameOver) return;
    this.shopIsOpen = true;
  }

  /** Pause timer while info panel is visible. */
  setHudInfoOpen(v) {
    this.hudInfoOpen = Boolean(v);
  }

  canPlay() {
    return !this.gameOver && this.shopIsOpen && !this.hudInfoOpen;
  }

  /** Full reset for Play Again (timer, combo, timing flags; keeps total coins). */
  resetForNewGame() {
    this.timeLeft = START_TIME_SECONDS;
    this.gameOver = false;
    this.shopIsOpen = false;
    this.hudInfoOpen = false;
    this.combo = 1;
    this.customersServed = 0;
    this._burgerBuildStartMs = null;
    this._throwAirStartMs = null;
  }

  /**
   * Thrown burger hit the ground (no customer): fail only, no customer removal.
   */
  notifyThrowHitGround() {
    this.onComboBreakEvent();
  }

  /** Wall / counter splat (no customer). */
  notifyThrowHitObstacle() {
    this.onComboBreakEvent();
  }
}
