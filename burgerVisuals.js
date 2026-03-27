/**
 * Three.js presentation for the burger stack and plate (no game rules).
 */

import * as THREE from 'three';
import { GEO } from './renderQuality.js';

/** Per-layer thickness (Y) and visual tuning. */
const LAYER = {
  bun_bottom: { h: 0.11, color: 0xc4a574 },
  bun_top: { h: 0.1, color: 0xb8956a },
  lettuce: { h: 0.045, color: 0x4a9f5c },
  tomato: { h: 0.035, color: 0xc93c3c },
  cheese: { h: 0.028, color: 0xf0c040 },
  meat: { h: 0.09, color: 0x6b4423 },
};

const STACK_GAP = 0.012;

/**
 * Squash & stretch + scale punch on a layer group (updated each frame).
 * @param {THREE.Group} layerGroup
 * @returns {{ step: (dt: number) => boolean }}
 */
export function createTapFeedback(layerGroup) {
  const state = {
    t: 0,
    duration: 0.44,
    baseScale: new THREE.Vector3(1, 1, 1),
  };

  layerGroup.scale.copy(state.baseScale);

  const step = (dt) => {
    state.t += dt;
    const u = Math.min(1, state.t / state.duration);

    if (u < 0.22) {
      // Squash down, widen XZ
      const p = u / 0.22;
      const squashY = THREE.MathUtils.lerp(1, 0.72, p);
      const widen = THREE.MathUtils.lerp(1, 1.14, p);
      layerGroup.scale.set(widen, squashY, widen);
    } else if (u < 0.55) {
      // Stretch up overshoot
      const p = (u - 0.22) / (0.55 - 0.22);
      const stretchY = THREE.MathUtils.lerp(0.72, 1.18, p);
      const narrow = THREE.MathUtils.lerp(1.14, 0.96, p);
      layerGroup.scale.set(narrow, stretchY, narrow);
    } else {
      // Settle with slight punch above 1
      const p = (u - 0.55) / (1 - 0.55);
      const punch = Math.sin(p * Math.PI) * 0.08;
      const s = 1 + punch * (1 - p);
      layerGroup.scale.set(s, s, s);
    }

    if (u >= 1) {
      layerGroup.scale.copy(state.baseScale);
      return true;
    }
    return false;
  };

  return { step, state };
}

function makeBunMesh(h, color, isTop) {
  const geo = new THREE.CylinderGeometry(0.38, 0.4, h, GEO.bunCylinder);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (isTop) {
    const seedGeo = new THREE.SphereGeometry(0.06, GEO.seedSphere, GEO.seedSphere);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(seedGeo, mat);
      const a = (i / 14) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.28, h * 0.35, Math.sin(a) * 0.28);
      s.scale.setScalar(0.35 + (i % 3) * 0.08);
      mesh.add(s);
    }
  }
  return mesh;
}

function makePattyMesh(h, color) {
  const geo = new THREE.CylinderGeometry(0.36, 0.37, h, GEO.pattyCylinder);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeLettuceMesh(h, color) {
  const geo = new THREE.CylinderGeometry(0.42, 0.4, h, GEO.lettuceCylinder);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeTomatoMesh(h, color) {
  const geo = new THREE.CylinderGeometry(0.37, 0.37, h, GEO.tomatoCylinder);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCheeseMesh(h, color) {
  const geo = new THREE.BoxGeometry(0.76, h, 0.76);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.12,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function disposeObject3D(root) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
}

/**
 * Vertical mini-burger for order display (e.g. above customers). Caller owns disposal.
 * @param {string[]} order ingredient ids
 * @param {number} scale uniform scale vs. player stack
 */
export function buildOrderPreviewGroup(order, scale = 0.68) {
  const root = new THREE.Group();
  root.name = 'OrderPreview';
  let y = -1;
  /* Extra air between layers so each ingredient reads clearly */
  const gap = STACK_GAP * scale * 3.1;
  order.forEach((type) => {
    const rawH = getLayerHeight(type);
    const h = rawH * scale;
    const layer = new THREE.Group();
    const mesh = createIngredientMesh(type);
    mesh.scale.setScalar(scale);
    layer.add(mesh);
    y += h / 2;
    layer.position.y = y;
    y += h / 2 + gap;
    root.add(layer);
  });
  return root;
}

/**
 * @param {string} type
 * @returns {THREE.Object3D}
 */
export function createIngredientMesh(type) {
  const spec = LAYER[type];
  if (!spec) return new THREE.Group();

  switch (type) {
    case 'bun_bottom':
      return makeBunMesh(spec.h, spec.color, false);
    case 'bun_top':
      return makeBunMesh(spec.h, spec.color, true);
    case 'meat':
      return makePattyMesh(spec.h, spec.color);
    case 'lettuce':
      return makeLettuceMesh(spec.h, spec.color);
    case 'tomato':
      return makeTomatoMesh(spec.h, spec.color);
    case 'cheese':
      return makeCheeseMesh(spec.h, spec.color);
    default:
      return new THREE.Group();
  }
}

export function getLayerHeight(type) {
  return LAYER[type]?.h ?? 0.08;
}

/**
 * @param {string[]} stack
 * @returns {{ totalHeight: number, centerY: number }}
 */
export function getStackMetrics(stack) {
  let y = 0;
  stack.forEach((type) => {
    const h = getLayerHeight(type);
    y += h / 2;
    y += h / 2 + STACK_GAP;
  });
  if (stack.length) y -= STACK_GAP;
  const totalHeight = y;
  const centerY = totalHeight > 0 ? totalHeight / 2 : 0;
  return { totalHeight, centerY };
}

/**
 * Single rigid group for thrown burger; origin at stack geometric center (local Y).
 * @param {string[]} stack
 */
export function buildFlyingBurgerGroup(stack) {
  const group = new THREE.Group();
  group.name = 'FlyingBurger';
  const { totalHeight, centerY } = getStackMetrics(stack);
  let y = 0;
  stack.forEach((type) => {
    const h = getLayerHeight(type);
    y += h / 2;
    const layer = new THREE.Group();
    layer.name = `Fly_${type}`;
    const mesh = createIngredientMesh(type);
    layer.add(mesh);
    layer.position.y = y - centerY;
    group.add(layer);
    y += h / 2 + STACK_GAP;
  });
  group.userData.radius = 0.42;
  group.userData.halfHeight = totalHeight / 2;
  return group;
}

/**
 * Plate mesh in the player zone (sits on the floor).
 * @returns {THREE.Group}
 */
export function createPlate() {
  const group = new THREE.Group();
  group.name = 'Plate';

  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xf2f0ec,
    roughness: 0.35,
    metalness: 0.15,
  });
  const rimGeo = new THREE.CylinderGeometry(0.58, 0.52, 0.06, GEO.plateRim);
  const rim = new THREE.Mesh(rimGeo, dishMat);
  rim.position.y = 0.05;
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const innerGeo = new THREE.CylinderGeometry(0.48, 0.45, 0.04, GEO.plateInner);
  const inner = new THREE.Mesh(innerGeo, dishMat);
  inner.position.y = 0.09;
  inner.receiveShadow = true;
  group.add(inner);

  return group;
}

/**
 * Keeps 3D stack in sync with data stack and runs tap feedback tweens.
 */
export class BurgerStackView {
  /**
   * @param {THREE.Group} anchor world-space parent (positioned over plate)
   */
  constructor(anchor) {
    this.anchor = anchor;
    this.stackRoot = new THREE.Group();
    this.stackRoot.name = 'BurgerStack';
    this.anchor.add(this.stackRoot);
    /** @type {{ step: (dt: number) => boolean }[]} */
    this._feedbacks = [];
  }

  /**
   * Rebuild meshes from stack. If animateLast, runs squash/stretch on the top layer.
   * @param {string[]} stack
   * @param {{ animateLast?: boolean }} opts
   */
  rebuildFromStack(stack, opts = {}) {
    while (this.stackRoot.children.length) {
      const c = this.stackRoot.children[0];
      this.stackRoot.remove(c);
      disposeObject3D(c);
    }

    let y = 0;
    const animateLast = Boolean(opts.animateLast);

    stack.forEach((type, index) => {
      const h = getLayerHeight(type);
      y += h / 2;
      const layerGroup = new THREE.Group();
      layerGroup.name = `Layer_${type}_${index}`;
      const mesh = createIngredientMesh(type);
      layerGroup.add(mesh);
      layerGroup.position.y = y;
      this.stackRoot.add(layerGroup);
      y += h / 2 + STACK_GAP;

      const isLast = index === stack.length - 1;
      if (animateLast && isLast) {
        const fb = createTapFeedback(layerGroup);
        this._feedbacks.push(fb);
      }
    });
  }

  /**
   * @param {number} dt seconds
   */
  update(dt) {
    this._feedbacks = this._feedbacks.filter((fb) => !fb.step(dt));
  }

  clearFeedbacks() {
    this._feedbacks.length = 0;
  }
}
