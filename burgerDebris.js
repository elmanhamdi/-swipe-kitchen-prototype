/**
 * Flying burger break-apart: per-layer meshes with simple gravity + bounce (no external physics lib).
 */

import * as THREE from 'three';
import { createIngredientMesh, disposeObject3D, getLayerHeight, STACK_GAP } from './burgerVisuals.js';
import { getCounterAabb, hitsFloor, resolveWalls } from './roomCollisions.js';

const GRAVITY = new THREE.Vector3(0, -32, 0);
const AIR_K = 0.85;
const LIFE_PHYSICS = 3;
const LIFE_FADE = 0.55;

const _n = new THREE.Vector3();

function integrate(vel, dt) {
  vel.addScaledVector(GRAVITY, dt);
  vel.multiplyScalar(Math.exp(-AIR_K * dt));
}

/**
 * @param {THREE.Scene} scene
 */
export class BurgerDebrisSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.counterBox = getCounterAabb();
    /** @type {{ mesh: THREE.Object3D, pos: THREE.Vector3, vel: THREE.Vector3, angVel: THREE.Vector3, radius: number, t: number }[]} */
    this._pieces = [];
  }

  /**
   * @param {string[]} stack
   * @param {THREE.Vector3} worldCenter projectile center at impact
   * @param {THREE.Vector3 | null} [wallNormal]
   */
  spawnFromStack(stack, worldCenter, wallNormal = null) {
    if (!stack.length) return;
    let y = 0;
    const gap = STACK_GAP;
    stack.forEach((type) => {
      const h = getLayerHeight(type);
      y += h / 2;
      y += h / 2 + gap;
    });
    y -= gap;
    const totalH = y;
    let cy = 0;
    stack.forEach((type) => {
      const h = getLayerHeight(type);
      cy += h / 2;
      const localY = cy - totalH / 2;
      const mesh = createIngredientMesh(type);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(worldCenter).add(new THREE.Vector3(0, localY, 0));
      mesh.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.4,
      );
      this.scene.add(mesh);

      const outward = new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        0.55 + Math.random() * 0.9,
        (Math.random() - 0.5) * 2.4,
      );
      if (wallNormal && wallNormal.lengthSq() > 1e-6) {
        outward.add(wallNormal.clone().multiplyScalar(1.8 + Math.random() * 1.5));
      }
      outward.normalize().multiplyScalar(5 + Math.random() * 8);
      outward.y += 4 + Math.random() * 5;

      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );

      this._pieces.push({
        mesh,
        pos: mesh.position.clone(),
        vel: outward,
        angVel,
        radius: 0.22,
        t: 0,
      });

      cy += h / 2 + gap;
    });
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    for (let i = this._pieces.length - 1; i >= 0; i--) {
      const p = this._pieces[i];
      p.t += dt;

      if (p.t < LIFE_PHYSICS) {
        integrate(p.vel, dt);
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.angVel.x * dt;
        p.mesh.rotation.y += p.angVel.y * dt;
        p.mesh.rotation.z += p.angVel.z * dt;

        if (hitsFloor(p.pos, p.radius)) {
          p.pos.y = p.radius + 0.02;
          p.vel.y = Math.abs(p.vel.y) * 0.38;
          p.vel.x *= 0.82;
          p.vel.z *= 0.82;
        }

        if (resolveWalls(p.pos, p.radius, _n)) {
          const vn = p.vel.dot(_n);
          if (vn < 0) p.vel.addScaledVector(_n, -1.35 * vn);
          p.vel.multiplyScalar(0.75);
        }

        const b = this.counterBox;
        if (
          p.pos.x + p.radius > b.min.x &&
          p.pos.x - p.radius < b.max.x &&
          p.pos.y + p.radius > b.min.y &&
          p.pos.y - p.radius < b.max.y &&
          p.pos.z + p.radius > b.min.z &&
          p.pos.z - p.radius < b.max.z
        ) {
          if (p.pos.y > b.max.y) {
            p.pos.y = b.max.y + p.radius + 0.02;
            p.vel.y = Math.abs(p.vel.y) * 0.25;
          } else {
            p.pos.x = THREE.MathUtils.clamp(p.pos.x, b.min.x - p.radius, b.max.x + p.radius);
            p.pos.z = THREE.MathUtils.clamp(p.pos.z, b.min.z - p.radius, b.max.z + p.radius);
            p.vel.multiplyScalar(0.6);
          }
        }

        p.mesh.position.copy(p.pos);
      } else {
        const u = Math.min(1, (p.t - LIFE_PHYSICS) / LIFE_FADE);
        const s = 1 - u;
        p.mesh.scale.setScalar(Math.max(0.001, s));
        p.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh && o.material) {
            const m = o.material;
            if (!Array.isArray(m)) {
              m.transparent = true;
              m.opacity = s;
            }
          }
        });
        if (u >= 1) {
          p.mesh.removeFromParent();
          disposeObject3D(p.mesh);
          this._pieces.splice(i, 1);
        }
      }
    }
  }

  clear() {
    for (const p of this._pieces) {
      p.mesh.removeFromParent();
      disposeObject3D(p.mesh);
    }
    this._pieces.length = 0;
  }
}
