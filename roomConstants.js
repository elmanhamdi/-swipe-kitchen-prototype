/**
 * Shared room dimensions (keep in sync with scene geometry in main.js).
 */

import * as THREE from 'three';

export const ROOM = {
  zFront: 3.5,
  zBack: -4.5,
  halfWidthFront: 4.2,
  halfWidthBack: 2.6,
  wallHeight: 4.2,
};

export const ZONES = {
  playerToCounter: 1.2,
  counterToCustomers: -0.4,
};

export function halfWidthAtZ(z) {
  const t = (z - ROOM.zFront) / (ROOM.zBack - ROOM.zFront);
  return THREE.MathUtils.lerp(ROOM.halfWidthFront, ROOM.halfWidthBack, t);
}

export function xLeftAtZ(z) {
  return -halfWidthAtZ(z);
}

export function xRightAtZ(z) {
  return halfWidthAtZ(z);
}
