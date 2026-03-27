/**
 * Three.js visuals for customers (links to Customer data).
 */

import * as THREE from 'three';
import { buildOrderPreviewGroup, disposeObject3D } from './burgerVisuals.js';
import { GEO } from './renderQuality.js';

const MOOD_VISUAL = {
  happy: { color: 0x8fd18f, emissive: 0x224422, emissiveIntensity: 0.18 },
  neutral: { color: 0xc2bdb8, emissive: 0x222222, emissiveIntensity: 0.06 },
  angry: { color: 0xd97a7a, emissive: 0x551010, emissiveIntensity: 0.22 },
};

function createCustomerBodyMaterial(state) {
  const v = MOOD_VISUAL[state] ?? MOOD_VISUAL.neutral;
  return new THREE.MeshStandardMaterial({
    color: v.color,
    roughness: 0.7,
    metalness: 0.06,
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

    /** Squash & stretch on hit (0 = idle). */
    this._squashT = 0;
    this._squashDur = 0;
    this._squashIntensity = 1;

    this._bodyMat = createCustomerBodyMaterial(customer.state);
    /** @type {THREE.MeshStandardMaterial[]} */
    this._moodMaterials = [this._bodyMat];
    this._body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.75, GEO.capsuleRad, GEO.capsuleHeight),
      this._bodyMat,
    );
    this._body.position.y = 0.55;
    this._body.castShadow = true;
    this._body.receiveShadow = true;
    this._body.name = 'CustomerBody';
    this.root.add(this._body);

    const headMat = this._bodyMat.clone();
    this._moodMaterials.push(headMat);
    this._head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, GEO.headSphere, GEO.headHeight),
      headMat,
    );
    this._head.position.y = 1.12;
    this._head.castShadow = true;
    this._head.receiveShadow = true;
    this._head.name = 'CustomerHead';
    this.root.add(this._head);

    this._orderBaseY = 1.85;
    this._orderGroup = buildOrderPreviewGroup(customer.order, 0.34);
    this._orderGroup.position.set(0, this._orderBaseY, 0);
    this.root.add(this._orderGroup);

    this._idleSeed = Math.random() * Math.PI * 2;
    this._idleAnimT = 0;

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
   * @param {'light' | 'hard'} strength
   */
  playHitSquash(strength = 'light') {
    this._squashIntensity = strength === 'hard' ? 1.35 : 0.85;
    this._squashDur = strength === 'hard' ? 0.38 : 0.28;
    this._squashT = 0;
  }

  /**
   * @param {number} dt
   */
  updateSquash(dt) {
    if (this._squashDur <= 0) return;
    this._squashT += dt;
    const u = Math.min(1, this._squashT / this._squashDur);
    if (u < 0.22) {
      const p = u / 0.22;
      const sy = THREE.MathUtils.lerp(1, 0.68, p) * this._squashIntensity;
      const sxz = THREE.MathUtils.lerp(1, 1.12, p);
      this.root.scale.set(sxz, sy, sxz);
    } else if (u < 0.55) {
      const p = (u - 0.22) / (0.55 - 0.22);
      const sy = THREE.MathUtils.lerp(0.68, 1.14, p);
      const sxz = THREE.MathUtils.lerp(1.12, 0.94, p);
      this.root.scale.set(sxz * this._squashIntensity, sy, sxz * this._squashIntensity);
    } else {
      const p = (u - 0.55) / (1 - 0.55);
      const s = THREE.MathUtils.lerp(1.08, 1, p);
      this.root.scale.set(s, s, s);
    }
    if (u >= 1) {
      this.root.scale.set(1, 1, 1);
      this._squashDur = 0;
    }
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

    this._idleAnimT += dt;
    const inSquash = this._squashDur > 0;
    if (!inSquash) {
      const s = this._idleSeed;
      const t = this._idleAnimT;
      this._head.rotation.z = Math.sin(t * 1.12 + s) * 0.06;
      this._head.rotation.x = Math.sin(t * 0.86 + s * 1.7) * 0.032;
      this._body.rotation.z = Math.sin(t * 0.68 + s * 0.5) * 0.024;
      this._orderGroup.position.y =
        this._orderBaseY + Math.sin(t * 2.05 + s) * 0.045 + Math.sin(t * 3.1 + s * 2) * 0.012;
    }
  }

  dispose() {
    disposeObject3D(this.root);
  }
}
