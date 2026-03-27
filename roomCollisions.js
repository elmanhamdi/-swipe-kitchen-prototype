/**
 * Analytic collisions for flying burger vs room (floor, walls, counter).
 */

import * as THREE from 'three';
import { ROOM, ZONES, xLeftAtZ, xRightAtZ } from './roomConstants.js';

const _v2a = new THREE.Vector2();

/** @returns {{ min: THREE.Vector3, max: THREE.Vector3 }} */
export function getCounterAabb() {
  const zPlane = ZONES.counterToCustomers + 0.32;
  const halfW = (() => {
    const t = (zPlane - ROOM.zFront) / (ROOM.zBack - ROOM.zFront);
    return THREE.MathUtils.lerp(ROOM.halfWidthFront, ROOM.halfWidthBack, t) * 0.92;
  })();
  const counterDepth = 0.55;
  const counterHeight = 1.05;
  const zCenter = zPlane + counterDepth / 2 - 0.08;
  const min = new THREE.Vector3(-halfW, 0, zCenter - counterDepth / 2);
  const max = new THREE.Vector3(halfW, counterHeight + 0.12, zCenter + counterDepth / 2);
  return { min, max };
}

/**
 * Closest point on 2D segment AB to point P; writes into out (x,z components used).
 */
function closestPointOnSegmentXZ(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const abLen2 = abx * abx + abz * abz || 1e-6;
  let t = (apx * abx + apz * abz) / abLen2;
  t = Math.max(0, Math.min(1, t));
  out.x = ax + t * abx;
  out.z = az + t * abz;
}

/**
 * Push sphere out of back + side walls; writes unit normal from wall into room (for reflection).
 * @param {THREE.Vector3} pos
 * @param {number} r
 * @param {THREE.Vector3} outN
 * @returns {boolean} if a correction was applied
 */
export function resolveWalls(pos, r, outN) {
  const margin = 0.07;
  const z0 = ROOM.zFront;
  const z1 = ROOM.zBack;

  if (pos.z - r < ROOM.zBack + margin) {
    pos.z = ROOM.zBack + r + margin;
    outN.set(0, 0, 1);
    return true;
  }

  const xl0 = xLeftAtZ(z0);
  const xl1 = xLeftAtZ(z1);
  closestPointOnSegmentXZ(pos.x, pos.z, xl0, z0, xl1, z1, _v2a);
  let dx = pos.x - _v2a.x;
  let dz = pos.z - _v2a.z;
  let d = Math.hypot(dx, dz);
  if (d < r + margin) {
    const pen = r + margin - d;
    const nx = dx / (d || 1e-6);
    const nz = dz / (d || 1e-6);
    pos.x += nx * pen;
    pos.z += nz * pen;
    outN.set(nx, 0, nz).normalize();
    return true;
  }

  const xr0 = xRightAtZ(z0);
  const xr1 = xRightAtZ(z1);
  closestPointOnSegmentXZ(pos.x, pos.z, xr0, z0, xr1, z1, _v2a);
  dx = pos.x - _v2a.x;
  dz = pos.z - _v2a.z;
  d = Math.hypot(dx, dz);
  if (d < r + margin) {
    const pen = r + margin - d;
    const nx = dx / (d || 1e-6);
    const nz = dz / (d || 1e-6);
    pos.x += nx * pen;
    pos.z += nz * pen;
    outN.set(nx, 0, nz).normalize();
    return true;
  }

  return false;
}

/**
 * @param {THREE.Vector3} pos
 * @param {number} r
 */
export function hitsFloor(pos, r) {
  return pos.y - r <= 0.02;
}

/**
 * @param {THREE.Vector3} pos
 * @param {number} r
 * @param {{ min: THREE.Vector3, max: THREE.Vector3 }} box
 */
export function sphereVsAabb(pos, r, box) {
  const x = Math.max(box.min.x, Math.min(pos.x, box.max.x));
  const y = Math.max(box.min.y, Math.min(pos.y, box.max.y));
  const z = Math.max(box.min.z, Math.min(pos.z, box.max.z));
  const dx = pos.x - x;
  const dy = pos.y - y;
  const dz = pos.z - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  return d2 < r * r;
}

/**
 * Push sphere out of AABB; returns true if was inside.
 * @param {THREE.Vector3} pos
 * @param {number} r
 */
export function resolveSphereAabb(pos, r, box) {
  const x = Math.max(box.min.x, Math.min(pos.x, box.max.x));
  const y = Math.max(box.min.y, Math.min(pos.y, box.max.y));
  const z = Math.max(box.min.z, Math.min(pos.z, box.max.z));
  const dx = pos.x - x;
  const dy = pos.y - y;
  const dz = pos.z - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;
  const pen = r - d;
  pos.x += nx * pen;
  pos.y += ny * pen;
  pos.z += nz * pen;
  return true;
}
