/**
 * Spawns and updates customers (data + views), door entrance walk-in / exit walk-out.
 */

import * as THREE from 'three';
import {
  Customer,
  generateCustomerOrder,
  pickRandomFreeSlot,
} from './customerData.js';
import { CustomerView } from './customerVisuals.js';
import { ROOM } from './roomConstants.js';

/** Left / center / right slots in the back (customer) zone. */
const SLOT_X = [-1.42, 0, 1.42];
const SLOT_Z = -1.8;
/** Start at door opening (walk into / out of room). */
const DOOR_START_Z = ROOM.zBack + 0.12;
const WALK_DURATION = 0.8;
const CELEBRATE_DURATION = 1;
const BASE_ACTIVE_CUSTOMERS = 1;
const RAMP_INTERVAL_SEC = 10;
const RAMP_MAX_CUSTOMERS = 3;

/**
 * @typedef {'seated' | 'celebrate'} EntryPhase
 */

/**
 * @typedef {{
 *   customer: Customer,
 *   view: CustomerView,
 *   phase: EntryPhase,
 *   celebrateT: number,
 * }} CustomerEntry
 */

export class CustomerManager {
  /**
   * @param {import('three').Scene} scene
   * @param {{ setOpen: (t: number) => void } | null} [backDoor]
   */
  constructor(scene, backDoor = null) {
    this.scene = scene;
    this.backDoor = backDoor;
    this.group = new THREE.Group();
    this.group.name = 'Customers';
    scene.add(this.group);

    /** @type {Set<number>} */
    this.usedSlots = new Set();
    /** @type {CustomerEntry[]} */
    this.entries = [];

    /** @type {{ customer: Customer, view: CustomerView, slotIndex: number }[]} */
    this._walkQueue = [];
    /** @type {null | { customer: Customer, view: CustomerView, slotIndex: number, phase: string, t: number, walkT: number }} */
    this._activeWalk = null;

    /** @type {{ customer: Customer, view: CustomerView, slotIndex: number, startX: number, startZ: number, phase: string, t: number, walkT: number }[]} */
    this._exitQueue = [];
    /** @type {null | { customer: Customer, view: CustomerView, slotIndex: number, startX: number, startZ: number, phase: string, t: number, walkT: number }} */
    this._activeExit = null;

    /** When false, no walk-ins or seated updates. */
    this._gameplayActive = false;
    this._gameplayElapsed = 0;
  }

  /** Call when player taps Open — starts spawning / walk-ins. */
  beginGameplay() {
    this._gameplayActive = true;
    this._gameplayElapsed = 0;
    this.fillToMax();
  }

  _desiredMaxCustomers() {
    const ramped = BASE_ACTIVE_CUSTOMERS + Math.floor(this._gameplayElapsed / RAMP_INTERVAL_SEC);
    return Math.min(RAMP_MAX_CUSTOMERS, Math.max(1, ramped));
  }

  _totalOccupied() {
    return (
      this.entries.length +
      this._walkQueue.length +
      (this._activeWalk ? 1 : 0) +
      this._exitQueue.length +
      (this._activeExit ? 1 : 0)
    );
  }

  spawnOne() {
    if (!this._gameplayActive) return;
    if (this._totalOccupied() >= this._desiredMaxCustomers()) return;
    // Start centered while one customer is active, then expand as difficulty ramps.
    let slot = 1;
    if (this._desiredMaxCustomers() > 1 || this.usedSlots.has(slot)) {
      const maybe = pickRandomFreeSlot(this.usedSlots);
      if (maybe === null) return;
      slot = maybe;
    }

    this.usedSlots.add(slot);
    const customer = new Customer({
      slotIndex: slot,
      position: { x: SLOT_X[slot], z: SLOT_Z },
      order: generateCustomerOrder(),
    });
    const view = new CustomerView(customer);
    view.syncFromCustomer();
    view.root.position.set(0, 0, DOOR_START_Z);
    this.group.add(view.root);
    this._walkQueue.push({ customer, view, slotIndex: slot });
  }

  fillToMax() {
    while (this._totalOccupied() < this._desiredMaxCustomers()) {
      this.spawnOne();
    }
  }

  /**
   * @param {number} index
   */
  removeAt(index) {
    const e = this.entries[index];
    if (!e) return;
    this.usedSlots.delete(e.customer.slotIndex);
    this.group.remove(e.view.root);
    e.view.dispose();
    this.entries.splice(index, 1);
  }

  spawnOneIfSpace() {
    if (this._totalOccupied() < this._desiredMaxCustomers()) {
      this.spawnOne();
    }
  }

  /**
   * Correct throw: celebrate at slot, then exit through door; replacement walks in after.
   * @param {number} index
   */
  onSuccessfulDelivery(index) {
    const e = this.entries[index];
    if (!e || e.phase !== 'seated') return;
    e.phase = 'celebrate';
    e.celebrateT = 0;
    e.customer.state = 'happy';
    e.view.enterCelebrateMode();
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (!this._gameplayActive) return;
    this._gameplayElapsed += dt;
    this.fillToMax();

    this._updateCelebrations(dt);
    this._updateWalkIn(dt);
    this._updateExit(dt);
    this._tryStartDoorSequence();

    for (const e of this.entries) {
      if (e.phase !== 'seated') continue;
      e.customer.update(dt);
      e.view.updateSquash(dt);
      e.view.updateHitFlash(dt);
      e.view.syncFromCustomer();
      e.view.updateIdle(dt);
    }
  }

  /**
   * @param {number} dt
   */
  _updateCelebrations(dt) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.phase !== 'celebrate') continue;
      e.celebrateT += dt;
      e.view.updateCelebrate(dt);
      e.view.syncFromCustomer();
      if (e.celebrateT >= CELEBRATE_DURATION) {
        const { customer, view } = e;
        const slotIndex = customer.slotIndex;
        const startX = view.root.position.x;
        const startZ = view.root.position.z;
        view.exitCelebrateMode();
        this.entries.splice(i, 1);
        this._exitQueue.push({ customer, view, slotIndex, startX, startZ });
      }
    }
  }

  _tryStartDoorSequence() {
    if (this._activeWalk || this._activeExit) return;
    if (this._exitQueue.length > 0) {
      const next = this._exitQueue.shift();
      this._activeExit = {
        customer: next.customer,
        view: next.view,
        slotIndex: next.slotIndex,
        startX: next.startX,
        startZ: next.startZ,
        phase: 'door_open',
        t: 0,
        walkT: 0,
      };
      this.backDoor?.setOpen(0);
      return;
    }
    if (this._walkQueue.length > 0) {
      const next = this._walkQueue.shift();
      this._activeWalk = {
        customer: next.customer,
        view: next.view,
        slotIndex: next.slotIndex,
        phase: 'door_open',
        t: 0,
        walkT: 0,
      };
      this.backDoor?.setOpen(0);
    }
  }

  /**
   * @param {number} dt
   */
  _updateWalkIn(dt) {
    if (!this._activeWalk) return;
    const w = this._activeWalk;
    if (w.phase === 'door_open') {
      w.t += dt;
      const u = Math.min(1, w.t / 0.18);
      this.backDoor?.setOpen(u);
      if (w.t >= 0.18) {
        w.phase = 'walk';
        w.walkT = 0;
      }
    } else if (w.phase === 'walk') {
      w.walkT += dt;
      const u = Math.min(1, w.walkT / WALK_DURATION);
      const sx = SLOT_X[w.slotIndex];
      w.view.root.position.x = THREE.MathUtils.lerp(0, sx, u);
      w.view.root.position.z = THREE.MathUtils.lerp(DOOR_START_Z, SLOT_Z, u);
      w.view.root.position.y = 0;
      if (u >= 1) {
        w.view.root.position.x = sx;
        w.view.root.position.z = SLOT_Z;
        w.phase = 'door_close';
        w.t = 0;
      }
    } else if (w.phase === 'door_close') {
      w.t += dt;
      const u = Math.max(0, 1 - w.t / 0.18);
      this.backDoor?.setOpen(u);
      if (w.t >= 0.18) {
        this.backDoor?.setOpen(0);
        this.entries.push({
          customer: w.customer,
          view: w.view,
          phase: 'seated',
          celebrateT: 0,
        });
        this._activeWalk = null;
      }
    }
  }

  /**
   * @param {number} dt
   */
  _updateExit(dt) {
    if (!this._activeExit) return;
    const w = this._activeExit;
    if (w.phase === 'door_open') {
      w.t += dt;
      const u = Math.min(1, w.t / 0.18);
      this.backDoor?.setOpen(u);
      if (w.t >= 0.18) {
        w.phase = 'walk';
        w.walkT = 0;
      }
    } else if (w.phase === 'walk') {
      w.walkT += dt;
      const u = Math.min(1, w.walkT / WALK_DURATION);
      w.view.root.position.x = THREE.MathUtils.lerp(w.startX, 0, u);
      w.view.root.position.z = THREE.MathUtils.lerp(w.startZ, DOOR_START_Z, u);
      w.view.root.position.y = 0;
      if (u >= 1) {
        w.view.root.position.set(0, 0, DOOR_START_Z);
        w.phase = 'door_close';
        w.t = 0;
      }
    } else if (w.phase === 'door_close') {
      w.t += dt;
      const u = Math.max(0, 1 - w.t / 0.18);
      this.backDoor?.setOpen(u);
      if (w.t >= 0.18) {
        this.backDoor?.setOpen(0);
        this.usedSlots.delete(w.slotIndex);
        this.group.remove(w.view.root);
        w.view.dispose();
        this._activeExit = null;
        this.spawnOneIfSpace();
      }
    }
  }

  /**
   * @returns {{ center: THREE.Vector3, radius: number, index: number }[]}
   * `index` is the `entries` array index (only seated customers).
   */
  getWorldColliders() {
    const p = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.phase !== 'seated') continue;
      e.view.root.getWorldPosition(p);
      p.y += 0.82;
      out.push({ center: p.clone(), radius: 0.52, index: i });
    }
    return out;
  }

  /** @param {number} entryIndex */
  notifyHit(entryIndex) {
    const e = this.entries[entryIndex];
    if (e) e.view.playHitFlash();
  }

  /** Wrong-order splat: flash + big squash. */
  notifyWrongHit(entryIndex) {
    const e = this.entries[entryIndex];
    if (!e || e.phase !== 'seated') return;
    e.view.playHitSquash('hard');
    e.view.playHitFlash();
  }

  /** Play Again: clear customers; player must tap Open again. */
  resetGame() {
    for (const e of this.entries) {
      this.group.remove(e.view.root);
      e.view.dispose();
    }
    this.entries.length = 0;
    while (this._walkQueue.length) {
      const w = this._walkQueue.pop();
      this.group.remove(w.view.root);
      w.view.dispose();
    }
    if (this._activeWalk) {
      this.group.remove(this._activeWalk.view.root);
      this._activeWalk.view.dispose();
      this._activeWalk = null;
    }
    this._exitQueue.length = 0;
    if (this._activeExit) {
      this.group.remove(this._activeExit.view.root);
      this._activeExit.view.dispose();
      this._activeExit = null;
    }
    this.usedSlots.clear();
    this.backDoor?.setOpen(0);
    this._gameplayActive = false;
    this._gameplayElapsed = 0;
  }
}
