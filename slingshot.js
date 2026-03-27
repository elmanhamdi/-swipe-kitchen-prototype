/**
 * Slingshot aim + flying burger physics (gravity, air drag, room + customer collisions).
 */

import * as THREE from 'three';
import { buildFlyingBurgerGroup, disposeObject3D, getStackMetrics } from './burgerVisuals.js';
import { getCounterAabb, hitsFloor, resolveWalls, sphereVsAabb } from './roomCollisions.js';
import { ROOM } from './roomConstants.js';

const GRAVITY = new THREE.Vector3(0, -28, 0);
const AIR_FRICTION = 1.25;

const _ray = new THREE.Raycaster();
const _tmp = new THREE.Vector3();
const _tmpPull = new THREE.Vector3();
const _wallN = new THREE.Vector3();

function integrateAir(velocity, dt) {
  velocity.addScaledVector(GRAVITY, dt);
  const k = Math.exp(-AIR_FRICTION * dt);
  velocity.multiplyScalar(k);
}

function simulateTrajectoryPoints(start, vel0, maxTime, step) {
  const pts = [];
  const p = start.clone();
  const v = vel0.clone();
  let t = 0;
  while (t < maxTime && pts.length < 120) {
    pts.push(p.clone());
    integrateAir(v, step);
    p.addScaledVector(v, step);
    t += step;
    if (p.y < 0.08) break;
    if (p.z < ROOM.zBack + 0.25) break;
  }
  return pts;
}

function createSplashBurst(scene, position) {
  const group = new THREE.Group();
  group.name = 'Splash';
  const colors = [0xf4d35e, 0xc49a6c, 0x8b5a2b, 0xe8f0dc];
  const n = 18;
  const data = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.07, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize();
    data.push({
      mesh: m,
      vel: dir.multiplyScalar(2 + Math.random() * 4),
      life: 0.55 + Math.random() * 0.2,
    });
    m.position.copy(position);
    group.add(m);
  }
  scene.add(group);
  return { group, data, t: 0 };
}

function updateSplash(splash, dt) {
  if (!splash) return true;
  splash.t += dt;
  let alive = false;
  for (const d of splash.data) {
    const u = splash.t / d.life;
    if (u >= 1) {
      d.mesh.visible = false;
      continue;
    }
    alive = true;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.vel.y -= 10 * dt;
    d.mesh.material.opacity = 1 - u;
    d.mesh.scale.setScalar(1 + u * 0.8);
  }
  if (!alive || splash.t > 1.2) {
    splash.group.removeFromParent();
    disposeObject3D(splash.group);
    return true;
  }
  return false;
}

export class SlingshotController {
  /**
   * @param {object} o
   * @param {THREE.PerspectiveCamera} o.camera
   * @param {HTMLElement} o.domElement
   * @param {THREE.Scene} o.scene
   * @param {import('./burgerData.js').Burger} o.burger
   * @param {import('./burgerVisuals.js').BurgerStackView} o.stackView
   * @param {THREE.Object3D} o.stackAnchor
   * @param {import('./customerManager.js').CustomerManager} o.customerManager
   * @param {() => void} [o.onSettled] after projectile ends / burger returns to plate
   */
  constructor(o) {
    this.camera = o.camera;
    this.domElement = o.domElement;
    this.scene = o.scene;
    this.burger = o.burger;
    this.stackView = o.stackView;
    this.stackAnchor = o.stackAnchor;
    this.customerManager = o.customerManager;
    this._onSettled = typeof o.onSettled === 'function' ? o.onSettled : null;

    this.counterBox = getCounterAabb();

    this.mode = 'idle';
    this._pointerId = null;
    this._pullWorld = new THREE.Vector3();
    this._anchorWorld = new THREE.Vector3();
    this._dragPlane = new THREE.Plane();
    this._planeHit = new THREE.Vector3();

    this._bandGeom = new THREE.BufferGeometry();
    this._bandLine = new THREE.Line(
      this._bandGeom,
      new THREE.LineBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0.88 }),
    );
    this._bandLine.visible = false;
    this._bandLine.frustumCulled = false;
    this.scene.add(this._bandLine);

    this._trailGeom = new THREE.BufferGeometry();
    this._trailLine = new THREE.Line(
      this._trailGeom,
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.14,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    );
    this._trailLine.visible = false;
    this._trailLine.frustumCulled = false;
    this.scene.add(this._trailLine);

    /** @type {null | { mesh: THREE.Group, pos: THREE.Vector3, vel: THREE.Vector3, r: number, stuckT: number, slide: boolean, fadeMats: THREE.Material[], life: number }} */
    this._proj = null;
    /** @type {null | ReturnType<typeof createSplashBurst>} */
    this._splash = null;

    this._onPointerDown = (e) => {
      if (this.mode !== 'idle' || e.button > 0) return;
      if (!this.burger.isComplete()) return;
      if (e.target !== this.domElement) return;
      e.preventDefault();
      this.mode = 'aiming';
      this._pointerId = e.pointerId;
      this.domElement.setPointerCapture(e.pointerId);
      this._updateAnchorWorld();
      this._screenToWorldOnPlane(e.clientX, e.clientY, this._anchorWorld.y, this._pullWorld);
      this._refreshAimLines();
      this._bandLine.visible = true;
      this._trailLine.visible = true;
    };

    this._onPointerMove = (e) => {
      if (this.mode !== 'aiming' || e.pointerId !== this._pointerId) return;
      if (!this.burger.isComplete()) {
        this._cancelAim();
        return;
      }
      e.preventDefault();
      this._screenToWorldOnPlane(e.clientX, e.clientY, this._anchorWorld.y, this._pullWorld);
      this._refreshAimLines();
    };

    this._onPointerUp = (e) => {
      if (this.mode !== 'aiming' || e.pointerId !== this._pointerId) return;
      e.preventDefault();
      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      this._pointerId = null;

      if (!this.burger.isComplete()) {
        this._cancelAim();
        return;
      }

      const pull = _tmpPull.copy(this._anchorWorld).sub(this._pullWorld);
      pull.y = 0;
      const minPull = 0.12;
      const maxPull = 3.4;
      if (pull.length() < minPull) {
        this._cancelAim();
        return;
      }
      if (pull.length() > maxPull) pull.setLength(maxPull);

      const speed = 8.5;
      const vel = pull.multiplyScalar(speed);
      vel.y += pull.length() * 1.35;
      const maxSpeed = 34;
      if (vel.length() > maxSpeed) vel.setLength(maxSpeed);

      this._launch(vel);
    };

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);
  }

  isBusy() {
    return this.mode !== 'idle';
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this._bandGeom.dispose();
    this._bandLine.material.dispose();
    this.scene.remove(this._bandLine);
    this._trailGeom.dispose();
    this._trailLine.material.dispose();
    this.scene.remove(this._trailLine);
    if (this._proj) {
      this._proj.mesh.removeFromParent();
      disposeObject3D(this._proj.mesh);
    }
  }

  _updateAnchorWorld() {
    this.stackAnchor.updateWorldMatrix(true, true);
    this._anchorWorld.set(0, 0, 0);
    this.stackAnchor.localToWorld(this._anchorWorld);
    const { centerY } = getStackMetrics(this.burger.getStack());
    this._anchorWorld.y += centerY;
  }

  _screenToWorldOnPlane(clientX, clientY, planeY, out) {
    const rect = this.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera({ x, y }, this.camera);
    this._dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, planeY, 0));
    const hit = _ray.ray.intersectPlane(this._dragPlane, this._planeHit);
    if (hit) {
      out.copy(this._planeHit);
    } else {
      out.copy(this._anchorWorld);
    }
  }

  _refreshAimLines() {
    this._bandGeom.setFromPoints([this._anchorWorld, this._pullWorld]);
    this._bandGeom.attributes.position.needsUpdate = true;

    const pull = _tmp.copy(this._anchorWorld).sub(this._pullWorld);
    pull.y = 0;
    const maxPull = 3.4;
    if (pull.length() > maxPull) pull.setLength(maxPull);
    const speed = 8.5;
    const vel = pull.multiplyScalar(speed);
    vel.y += pull.length() * 1.35;
    const maxSpeed = 34;
    if (vel.length() > maxSpeed) vel.setLength(maxSpeed);

    const pts = simulateTrajectoryPoints(this._anchorWorld.clone(), vel, 2.8, 1 / 60);
    this._trailGeom.setFromPoints(pts);
    this._trailGeom.attributes.position.needsUpdate = true;
    this._trailLine.computeLineDistances();
  }

  _cancelAim() {
    this.mode = 'idle';
    this._bandLine.visible = false;
    this._trailLine.visible = false;
  }

  /**
   * @param {THREE.Vector3} vel0
   */
  _launch(vel0) {
    const stack = this.burger.getStack().slice();
    const mesh = buildFlyingBurgerGroup(stack);
    const r = mesh.userData.radius ?? 0.42;

    mesh.position.copy(this._anchorWorld);
    this.scene.add(mesh);

    this.burger.reset();
    this.stackView.clearFeedbacks();
    this.stackView.rebuildFromStack([], { animateLast: false });
    this.stackView.stackRoot.visible = false;

    this._bandLine.visible = false;
    this._trailLine.visible = false;
    this.mode = 'busy';

    const fadeMats = [];
    mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material && !fadeMats.includes(obj.material)) {
        fadeMats.push(obj.material);
      }
    });

    this._proj = {
      mesh,
      pos: this._anchorWorld.clone(),
      vel: vel0.clone(),
      r,
      stuckT: 0,
      slide: false,
      fadeMats,
      life: 0,
    };
  }

  _finishThrow() {
    if (this._proj) {
      this._proj.mesh.removeFromParent();
      disposeObject3D(this._proj.mesh);
      this._proj = null;
    }
    this.stackView.stackRoot.visible = true;
    this.mode = 'idle';
    this._onSettled?.();
  }

  _splatGround(pos) {
    this._splash = createSplashBurst(this.scene, pos);
    this._finishThrow();
  }

  _tryWallBounce(vel, normal) {
    const speed = vel.length();
    if (speed > 6.5 && Math.random() > 0.38) {
      const vn = vel.dot(normal);
      if (vn < 0) {
        vel.addScaledVector(normal, -(1 + 0.35) * vn);
      }
      return true;
    }
    return false;
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (this._splash && updateSplash(this._splash, dt)) {
      this._splash = null;
    }

    if (!this._proj) return;

    const p = this._proj;
    p.life += dt;
    if (p.life > 14) {
      this._finishThrow();
      return;
    }

    if (p.slide) {
      p.pos.y -= 0.55 * dt;
      const fade = Math.min(1, p.stuckT / 1.05);
      for (const m of p.fadeMats) {
        m.transparent = true;
        m.opacity = Math.max(0, 1 - fade);
      }
      p.stuckT += dt;
      p.mesh.position.copy(p.pos);
      if (p.stuckT > 1.1 || p.pos.y < 0.12) {
        this._finishThrow();
      }
      return;
    }

    if (p.stuckT > 0 && !p.slide) {
      p.stuckT += dt;
      p.mesh.position.copy(p.pos);
      if (p.stuckT > 0.45) {
        p.slide = true;
        p.stuckT = 0;
      }
      return;
    }

    integrateAir(p.vel, dt);
    p.pos.addScaledVector(p.vel, dt);

    const colliders = this.customerManager.getWorldColliders();
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      _tmp.copy(p.pos).sub(c.center);
      if (_tmp.length() < p.r + c.radius) {
        this.customerManager.notifyHit(c.index);
        this._splatGround(p.pos.clone().setY(Math.max(p.r * 0.4, p.pos.y)));
        return;
      }
    }

    if (sphereVsAabb(p.pos, p.r, this.counterBox)) {
      p.vel.set(0, 0, 0);
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, this.counterBox.min.x + p.r * 0.85, this.counterBox.max.x - p.r * 0.85);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, this.counterBox.min.z + p.r * 0.5, this.counterBox.max.z - p.r * 0.5);
      p.pos.y = Math.max(p.pos.y, this.counterBox.max.y + p.r * 0.15);
      p.pos.y = Math.min(p.pos.y, this.counterBox.max.y + p.r * 0.55);
      p.stuckT = 0.001;
      p.mesh.position.copy(p.pos);
      return;
    }

    if (resolveWalls(p.pos, p.r, _wallN)) {
      if (!this._tryWallBounce(p.vel, _wallN)) {
        this._splatGround(p.pos.clone().setY(Math.max(p.r + 0.02, p.pos.y)));
        return;
      }
    }

    if (hitsFloor(p.pos, p.r)) {
      p.pos.y = p.r + 0.02;
      this._splatGround(p.pos.clone());
    }

    p.mesh.position.copy(p.pos);
  }
}
