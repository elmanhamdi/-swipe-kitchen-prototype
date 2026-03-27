/**
 * Spawns and updates customers (data + views), optional serve matching.
 */

import * as THREE from 'three';
import {
  Customer,
  CUSTOMER_MAX_ACTIVE,
  generateCustomerOrder,
  pickRandomFreeSlot,
} from './customerData.js';
import { CustomerView } from './customerVisuals.js';

/** Left / center / right slots in the back (customer) zone. */
const SLOT_X = [-1.42, 0, 1.42];
const SLOT_Z = -3.22;

export class CustomerManager {
  /** @param {import('three').Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Customers';
    scene.add(this.group);

    /** @type {Set<number>} */
    this.usedSlots = new Set();
    /** @type {{ customer: Customer, view: CustomerView }[]} */
    this.entries = [];
    this._spawnCooldown = 0;
  }

  spawnOne() {
    if (this.entries.length >= CUSTOMER_MAX_ACTIVE) return;
    const slot = pickRandomFreeSlot(this.usedSlots);
    if (slot === null) return;

    this.usedSlots.add(slot);
    const customer = new Customer({
      slotIndex: slot,
      position: { x: SLOT_X[slot], z: SLOT_Z },
      order: generateCustomerOrder(),
    });
    const view = new CustomerView(customer);
    view.syncFromCustomer();
    this.group.add(view.root);
    this.entries.push({ customer, view });
  }

  fillToMax() {
    while (this.entries.length < CUSTOMER_MAX_ACTIVE) {
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

  /**
   * @param {number} dt
   */
  update(dt) {
    for (const e of this.entries) {
      e.customer.update(dt);
      e.view.updateHitFlash(dt);
      e.view.syncFromCustomer();
      e.view.updateIdle(dt);
    }

    if (this.entries.length < CUSTOMER_MAX_ACTIVE) {
      this._spawnCooldown -= dt;
      if (this._spawnCooldown <= 0) {
        this.spawnOne();
        this._spawnCooldown = 2.2;
      }
    }
  }

  /**
   * First matching customer wins (stable order: slot order in array).
   * @param {string[]} playerStack
   * @returns {number | null} coins awarded, or null if no match
   */
  /**
   * @returns {{ center: THREE.Vector3, radius: number, index: number }[]}
   */
  getWorldColliders() {
    const p = new THREE.Vector3();
    return this.entries.map((e, index) => {
      e.view.root.getWorldPosition(p);
      p.y += 0.82;
      return { center: p.clone(), radius: 0.52, index };
    });
  }

  /** @param {number} index */
  notifyHit(index) {
    const e = this.entries[index];
    if (e) e.view.playHitFlash();
  }

  tryServe(playerStack) {
    const order = this.entries
      .map((e, i) => ({ i, slot: e.customer.slotIndex }))
      .sort((a, b) => a.slot - b.slot);
    for (const { i } of order) {
      const { customer } = this.entries[i];
      if (customer.orderMatches(playerStack)) {
        const coins = customer.getCoinReward();
        this.removeAt(i);
        return coins;
      }
    }
    return null;
  }
}
