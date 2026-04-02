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
import { ROOM, halfWidthAtZ } from './roomConstants.js';
import { sphereVsAabb } from './roomCollisions.js';

/** Left / center / right slots in the back (customer) zone. */
const SLOT_X = [-1.42, 0, 1.42];
const SLOT_Z = -0.8;
/** Start at door opening (walk into / out of room). */
const DOOR_START_Z = ROOM.zBack + 0.12;
const WALK_DURATION = 0.8;
const CELEBRATE_DURATION = 1;
const BASE_ACTIVE_CUSTOMERS = 1;
const RAMP_INTERVAL_SEC = 10;
const RAMP_MAX_CUSTOMERS = 3;

/**
 * @typedef {'seated' | 'celebrate' | 'knockback' | 'ko_ground' | 'recover'} EntryPhase
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
   * @param {import('./audioSystem.js').GameAudio | null} [gameAudio]
   */
  constructor(scene, backDoor = null, gameAudio = null) {
    this.scene = scene;
    this.backDoor = backDoor;
    this._gameAudio = gameAudio;
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
    /** @type {string[] | null} */
    this._forcedNextOrder = null;

    /** Table AABBs for knockback collision (set externally from main). */
    this._tableAabbs = [];
    /** @type {((tableIndex: number, impactPos: THREE.Vector3) => void) | null} */
    this._onKnockbackTableHit = null;
    this._knockbackTmpPos = new THREE.Vector3();
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
      order: this._forcedNextOrder ?? generateCustomerOrder(),
    });
    this._forcedNextOrder = null;
    const view = new CustomerView(customer);
    view.syncFromCustomer();
    view.root.position.set(0, 0, DOOR_START_Z);
    this.group.add(view.root);
    this._walkQueue.push({ customer, view, slotIndex: slot });
  }

  /**
   * Force the very next spawned customer to use a specific order.
   * @param {string[]} order
   */
  setNextCustomerOrder(order) {
    this._forcedNextOrder = Array.isArray(order) ? [...order] : null;
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

    this._updateKnockbacks(dt);
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

      const voice = e.view.consumeMumble();
      if (voice && this._gameAudio) this._gameAudio.playMumble(voice);
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
        view.setFacingTarget(Math.PI);
        this.entries.splice(i, 1);
        this._exitQueue.push({ customer, view, slotIndex, startX, startZ });
      }
    }
  }

  /**
   * Knockback physics: slide with friction, bounce off walls/tables, then recover.
   * @param {number} dt
   */
  _updateKnockbacks(dt) {
    const FRICTION = 0.06;
    const MAX_T = 1.5;
    const MIN_SPEED = 0.4;
    const CUST_R = 0.45;
    const RECOVER_DUR = 0.8;
    const KO_GROUND_DUR = 1.5;
    const KO_RECOVER_DUR = 1.5;

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];

      if (e.phase === 'knockback') {
        e.knockbackT += dt;

        const k = Math.exp(-FRICTION * dt * 60);
        e.knockbackVelX *= k;
        e.knockbackVelZ *= k;

        e.view.root.position.x += e.knockbackVelX * dt;
        e.view.root.position.z += e.knockbackVelZ * dt;

        const px = e.view.root.position.x;
        const pz = e.view.root.position.z;

        const hw = halfWidthAtZ(pz) - CUST_R - 0.1;
        if (px < -hw) {
          e.view.root.position.x = -hw;
          e.knockbackVelX = Math.abs(e.knockbackVelX) * 0.3;
        } else if (px > hw) {
          e.view.root.position.x = hw;
          e.knockbackVelX = -Math.abs(e.knockbackVelX) * 0.3;
        }

        const backLimit = ROOM.zBack + CUST_R + 0.15;
        if (e.view.root.position.z < backLimit) {
          e.view.root.position.z = backLimit;
          e.knockbackVelZ = Math.abs(e.knockbackVelZ) * 0.3;
        }
        const fwdLimit = SLOT_Z + 0.3;
        if (e.view.root.position.z > fwdLimit) {
          e.view.root.position.z = fwdLimit;
          e.knockbackVelZ = -Math.abs(e.knockbackVelZ) * 0.3;
        }

        for (let ti = 0; ti < this._tableAabbs.length; ti++) {
          const box = this._tableAabbs[ti];
          if (!box) continue;
          this._knockbackTmpPos.set(e.view.root.position.x, 0.5, e.view.root.position.z);
          if (sphereVsAabb(this._knockbackTmpPos, CUST_R, box)) {
            const impactPos = new THREE.Vector3(e.view.root.position.x, 0.5, e.view.root.position.z);
            this._onKnockbackTableHit?.(ti, impactPos);
            e.knockbackVelX *= -0.3;
            e.knockbackVelZ *= -0.3;
            const cx = (box.min.x + box.max.x) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            const dx = e.view.root.position.x - cx;
            const dz = e.view.root.position.z - cz;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            e.view.root.position.x += (dx / dist) * 0.35;
            e.view.root.position.z += (dz / dist) * 0.35;
            break;
          }
        }

        e.view.updateKnockback(dt);

        const speed = Math.sqrt(e.knockbackVelX ** 2 + e.knockbackVelZ ** 2);
        if (speed < MIN_SPEED || e.knockbackT > MAX_T) {
          if (e.knockbackIsKO) {
            e.phase = 'ko_ground';
            e.koGroundT = 0;
            e.view.startDizzyStars();
          } else {
            e.phase = 'recover';
            e.recoverT = 0;
            e.recoverStartX = e.view.root.position.x;
            e.recoverStartZ = e.view.root.position.z;
            e.view.startDizzyStars();
          }
        }
      }

      if (e.phase === 'ko_ground') {
        e.koGroundT += dt;
        e.view.updateKOGround(dt);
        e.view.updateDizzyStars(dt);
        if (e.koGroundT >= KO_GROUND_DUR) {
          e.phase = 'recover';
          e.recoverT = 0;
          e.recoverStartX = e.view.root.position.x;
          e.recoverStartZ = e.view.root.position.z;
        }
      }

      if (e.phase === 'recover') {
        e.recoverT += dt;
        const dur = e.knockbackIsKO ? KO_RECOVER_DUR : RECOVER_DUR;
        const u = Math.min(1, e.recoverT / dur);
        const ease = 1 - (1 - u) * (1 - u);

        if (e.knockbackShouldLeave) {
          e.view.updateRecover(dt, u);
          if (u >= 1) {
            const { customer, view } = e;
            const slotIndex = customer.slotIndex;
            const startX = view.root.position.x;
            const startZ = view.root.position.z;
            view.endKnockback();
            view.setFacingTarget(Math.PI);
            this.entries.splice(i, 1);
            this._exitQueue.push({ customer, view, slotIndex, startX, startZ });
          }
        } else {
          e.view.root.position.x = THREE.MathUtils.lerp(
            e.recoverStartX, e.customer.position.x, ease);
          e.view.root.position.z = THREE.MathUtils.lerp(
            e.recoverStartZ, e.customer.position.z, ease);
          e.view.updateRecover(dt, u);
          if (u >= 1) {
            e.phase = 'seated';
            e.view.endKnockback();
          }
        }
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
      w.view.updateWalkAnim(dt, true);
      w.view.updateFacing(dt);
      if (u >= 1) {
        w.view.root.position.x = sx;
        w.view.root.position.z = SLOT_Z;
        w.view.updateWalkAnim(0, false);
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
        w.view.showOrder();
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
      w.view.updateWalkAnim(dt, true);
      w.view.updateFacing(dt);
      if (u >= 1) {
        w.view.root.position.set(0, 0, DOOR_START_Z);
        w.view.updateWalkAnim(0, false);
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

  /**
   * Wrong-order splat → knockback with physics. ~20 % chance of full K.O.
   * @param {number} entryIndex
   * @param {{ x: number, z: number }} [impactDir] normalized XZ direction of the projectile
   * @returns {{ isKO: boolean } | null}
   */
  notifyWrongHit(entryIndex, impactDir) {
    const e = this.entries[entryIndex];
    if (!e || e.phase !== 'seated') return null;
    e.view.playHitSquash('hard');
    e.view.playHitFlash();

    const isKO = Math.random() < 0.2;
    const dir = impactDir ?? { x: 0, z: -1 };
    const speed = isKO ? (12 + Math.random() * 5) : (7 + Math.random() * 4);
    const spread = (Math.random() - 0.5) * 0.4;
    e.phase = 'knockback';
    e.knockbackVelX = dir.x * speed + spread;
    e.knockbackVelZ = dir.z * speed;
    e.knockbackT = 0;
    e.knockbackIsKO = isKO;
    e.knockbackShouldLeave = isKO || Math.random() < 0.35;
    e.view.startKnockback(isKO);
    e.customer.state = 'angry';
    return { isKO };
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
    this._forcedNextOrder = null;
  }
}
