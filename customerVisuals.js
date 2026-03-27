/**
 * Three.js visuals for customers (links to Customer data).
 */

import * as THREE from 'three';
import { buildOrderPreviewGroup, disposeObject3D } from './burgerVisuals.js';

const MOOD_VISUAL = {
  happy: { color: 0x8fd18f, emissive: 0x224422, emissiveIntensity: 0.18 },
  neutral: { color: 0xc2bdb8, emissive: 0x222222, emissiveIntensity: 0.06 },
  angry: { color: 0xd97a7a, emissive: 0x551010, emissiveIntensity: 0.22 },
};

function createCustomerBodyMaterial(state) {
  const v = MOOD_VISUAL[state] ?? MOOD_VISUAL.neutral;
  return new THREE.MeshStandardMaterial({
    color: v.color,
    roughness: 0.65,
    metalness: 0.08,
    emissive: v.emissive,
    emissiveIntensity: v.emissiveIntensity,
  });
}

/**
 * Simple stylized figure + floating order stack above.
 */
export class CustomerView {
  /**
   * @param {import('./customerData.js').Customer} customer
   */
  constructor(customer) {
    this.customer = customer;
    this.root = new THREE.Group();
    this.root.name = `Customer_slot${customer.slotIndex}`;

    this._baseX = customer.position.x;
    this._baseZ = customer.position.z;

    this._idlePhase = 'wait';
    this._idleWait = 0.8 + Math.random() * 1.4;
    this._idleTargetX = this._baseX;
    this._swayX = 0;

    /** Brief flash when hit by a thrown burger. */
    this._hitFlash = 0;

    this._bodyMat = createCustomerBodyMaterial(customer.state);
    /** @type {THREE.MeshStandardMaterial[]} */
    this._moodMaterials = [this._bodyMat];
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 6, 12), this._bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'CustomerBody';
    this.root.add(body);

    const headMat = this._bodyMat.clone();
    this._moodMaterials.push(headMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), headMat);
    head.position.y = 1.12;
    head.castShadow = true;
    head.receiveShadow = true;
    head.name = 'CustomerHead';
    this.root.add(head);

    this._orderGroup = buildOrderPreviewGroup(customer.order, 0.34);
    this._orderGroup.position.set(0, 1.85, 0);
    this.root.add(this._orderGroup);

    this.root.position.set(this._baseX, 0, this._baseZ);
  }

  /** @param {import('./customerData.js').CustomerState} state */
  _applyMoodMaterial(state) {
    const v = MOOD_VISUAL[state] ?? MOOD_VISUAL.neutral;
    for (const mat of this._moodMaterials) {
      mat.color.setHex(v.color);
      mat.emissive.setHex(v.emissive);
      mat.emissiveIntensity = v.emissiveIntensity;
    }
  }

  syncFromCustomer() {
    if (this._hitFlash > 0.01) return;
    this._applyMoodMaterial(this.customer.state);
  }

  playHitFlash() {
    this._hitFlash = 0.45;
  }

  /**
   * @param {number} dt
   */
  updateHitFlash(dt) {
    if (this._hitFlash <= 0) return;
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    const w = Math.min(1, this._hitFlash * 3);
    for (const mat of this._moodMaterials) {
      mat.emissive.setRGB(0.35 + 0.5 * w, 0.25 + 0.45 * w, 0.15 + 0.35 * w);
      mat.emissiveIntensity = 0.35 + 0.55 * w;
    }
    if (this._hitFlash <= 0.001) {
      this._hitFlash = 0;
      this.syncFromCustomer();
    }
  }

  /**
   * Optional idle: small lateral drift, pause, new target.
   * @param {number} dt
   */
  updateIdle(dt) {
    if (this._idlePhase === 'wait') {
      this._idleWait -= dt;
      if (this._idleWait <= 0) {
        this._idlePhase = 'move';
        const span = 0.22;
        this._idleTargetX = this._baseX + (Math.random() * 2 - 1) * span;
      }
    } else {
      const speed = 0.35;
      this._swayX = THREE.MathUtils.lerp(this._swayX, this._idleTargetX - this._baseX, 1 - Math.exp(-speed * dt * 10));
      if (Math.abs(this._swayX - (this._idleTargetX - this._baseX)) < 0.012) {
        this._swayX = this._idleTargetX - this._baseX;
        this._idlePhase = 'wait';
        this._idleWait = 0.9 + Math.random() * 2.2;
      }
    }
    this.root.position.x = this._baseX + this._swayX;
    this.root.position.z = this._baseZ + Math.sin(this.customer.patienceTimer * 0.55) * 0.04;
  }

  dispose() {
    disposeObject3D(this.root);
  }
}
