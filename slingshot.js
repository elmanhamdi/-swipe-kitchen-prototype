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

/**
 * @param {'ground'|'wall'|'face'} variant
 * @param {{ normal?: THREE.Vector3 }} opts
 */
function createSplash(scene, position, variant, opts = {}) {
  const group = new THREE.Group();
  group.name = `Splash_${variant}`;
  const n = variant === 'face' ? 24 : 20;
  const colors =
    variant === 'face'
      ? [0xc45c48, 0xf0c896, 0x8b4513, 0xe8dcc4, 0xd4a574]
      : [0xf4d35e, 0xc49a6c, 0x8b5a2b, 0xe8f0dc];
  const data = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.SphereGeometry(
      0.045 + Math.random() * (variant === 'face' ? 0.09 : 0.07),
      6,
      6,
    );
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    let dir;
    if (variant === 'ground') {
      dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.5 + Math.random() * 0.65,
        (Math.random() - 0.5) * 0.5,
      ).normalize();
    } else if (variant === 'wall' && opts.normal) {
      const nx = opts.normal.x;
      const ny = opts.normal.y;
      const nz = opts.normal.z;
      dir = new THREE.Vector3(
        nx + (Math.random() - 0.5) * 0.55,
        ny + (Math.random() - 0.5) * 0.4,
        nz + (Math.random() - 0.5) * 0.55,
      ).normalize();
    } else {
      dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.1 + Math.random() * 0.45,
        0.65 + Math.random() * 0.45,
      ).normalize();
    }
    const sp = variant === 'face' ? 2.8 + Math.random() * 4 : 2.2 + Math.random() * 4.2;
    data.push({
      mesh: m,
      vel: dir.multiplyScalar(sp),
      life: (variant === 'face' ? 0.65 : 0.52) + Math.random() * 0.22,
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
   * @param {import('./gameCore.js').GameSession} o.gameSession
   * @param {import('./floatingBonusText.js').FloatingBonusLayer} [o.floatingLayer]
   * @param {{ screenShake?: import('./juiceSystems.js').ScreenShake, coinFlyout?: import('./juiceSystems.js').CoinFlyoutLayer, coinsHudEl?: HTMLElement | null }} [o.juice]
   * @param {import('./audioSystem.js').GameAudio | null} [o.gameAudio]
   * @param {import('./burgerDebris.js').BurgerDebrisSystem | null} [o.debrisSystem]
   * @param {(e: PointerEvent) => boolean} [o.pickInterceptor] return true if event consumed (no aim)
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
    this.gameSession = o.gameSession;
    this.floatingLayer = o.floatingLayer ?? null;
    this.juice = o.juice ?? {};
    this.gameAudio = o.gameAudio ?? null;
    this.debrisSystem = o.debrisSystem ?? null;
    this._pickInterceptor = typeof o.pickInterceptor === 'function' ? o.pickInterceptor : null;
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

    this._aimDashGeom = new THREE.BufferGeometry();
    this._aimDashLine = new THREE.Line(
      this._aimDashGeom,
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.14,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    );
    this._aimDashLine.visible = false;
    this._aimDashLine.frustumCulled = false;
    this.scene.add(this._aimDashLine);

    this._flightTrailGeom = new THREE.BufferGeometry();
    this._flightTrailMat = new THREE.LineBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this._flightTrailLine = new THREE.Line(this._flightTrailGeom, this._flightTrailMat);
    this._flightTrailLine.visible = false;
    this._flightTrailLine.frustumCulled = false;
    this.scene.add(this._flightTrailLine);
    /** @type {number[]} */
    this._flightTrailPts = [];

    /** @type {null | { mesh: THREE.Group, pos: THREE.Vector3, vel: THREE.Vector3, r: number, fadeMats: THREE.Material[], life: number, thrownStack: string[] }} */
    this._proj = null;
    /** @type {null | ReturnType<typeof createSplash>} */
    this._splash = null;

    this._onPointerDown = (e) => {
      if (this._pickInterceptor?.(e)) return;
      if (this.mode !== 'idle' || e.button > 0) return;
      if (!this.gameSession.canPlay()) return;
      if (this.burger.getStack().length === 0) return;
      if (e.target !== this.domElement) return;
      e.preventDefault();
      this.mode = 'aiming';
      this._pointerId = e.pointerId;
      this.domElement.setPointerCapture(e.pointerId);
      this._updateAnchorWorld();
      this._screenToWorldOnPlane(e.clientX, e.clientY, this._anchorWorld.y, this._pullWorld);
      this._refreshAimLines();
      this._bandLine.visible = true;
      this._aimDashLine.visible = true;
    };

    this._onPointerMove = (e) => {
      if (this.mode !== 'aiming' || e.pointerId !== this._pointerId) return;
      if (this.burger.getStack().length === 0) {
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

      if (this.burger.getStack().length === 0) {
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

  /** Drop aim rubber-band if info modal / pause hides mid-drag. */
  cancelAimOnly() {
    if (this.mode === 'aiming') this._cancelAim();
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this._bandGeom.dispose();
    this._bandLine.material.dispose();
    this.scene.remove(this._bandLine);
    this._aimDashGeom.dispose();
    this._aimDashLine.material.dispose();
    this.scene.remove(this._aimDashLine);
    this._flightTrailGeom.dispose();
    this._flightTrailMat.dispose();
    this.scene.remove(this._flightTrailLine);
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
    this._aimDashGeom.setFromPoints(pts);
    this._aimDashGeom.attributes.position.needsUpdate = true;
    this._aimDashLine.computeLineDistances();
  }

  _cancelAim() {
    this.mode = 'idle';
    this._bandLine.visible = false;
    this._aimDashLine.visible = false;
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
    this._aimDashLine.visible = false;
    this.mode = 'busy';

    this._flightTrailPts.length = 0;
    this._flightTrailPts.push(
      this._anchorWorld.x,
      this._anchorWorld.y,
      this._anchorWorld.z,
    );
    this._flightTrailGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this._flightTrailPts, 3),
    );
    this._flightTrailGeom.setDrawRange(0, 1);
    this._flightTrailLine.visible = true;

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
      fadeMats,
      life: 0,
      /** @type {string[]} snapshot for exact match vs customer order */
      thrownStack: stack,
    };
    this.gameSession.notifyThrowLaunched();
    this.gameAudio?.playThrow();
  }

  _finishThrow() {
    this.gameSession.clearBurgerTiming();
    if (this._proj) {
      this._proj.mesh.removeFromParent();
      disposeObject3D(this._proj.mesh);
      this._proj = null;
    }
    this._flightTrailPts.length = 0;
    this._flightTrailLine.visible = false;
    this.stackView.stackRoot.visible = true;
    this.mode = 'idle';
    this._onSettled?.();
  }

  /** Clear flying projectile and splash (Play Again / game reset). */
  resetFlightState() {
    this._cancelAim();
    if (this._proj) {
      this._proj.mesh.removeFromParent();
      disposeObject3D(this._proj.mesh);
      this._proj = null;
    }
    if (this._splash) {
      this._splash.group.removeFromParent();
      disposeObject3D(this._splash.group);
      this._splash = null;
    }
    this._flightTrailPts.length = 0;
    this._flightTrailLine.visible = false;
    this.mode = 'idle';
    this._pointerId = null;
  }

  _updateFlightTrail(pos) {
    const buf = this._flightTrailPts;
    buf.push(pos.x, pos.y, pos.z);
    const maxPts = 14;
    while (buf.length > maxPts * 3) {
      buf.splice(0, 3);
    }
    const attr = new THREE.Float32BufferAttribute(new Float32Array(buf), 3);
    this._flightTrailGeom.setAttribute('position', attr);
    this._flightTrailGeom.setDrawRange(0, buf.length / 3);
    this._flightTrailGeom.computeBoundingSphere();
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {boolean} [breakCombo=true]
   * @param {'ground'|'wall'|'face'} [variant='ground']
   * @param {THREE.Vector3 | null} [wallNormal]
   */
  /**
   * Failed throw: debris + optional particle splash + teardown (validation only at collision).
   * @param {'ground'|'wall'|'face'} variant
   * @param {THREE.Vector3} splatPos particle burst origin
   * @param {THREE.Vector3 | null} wallNormal
   * @param {{ alreadyBrokeCombo?: boolean }} opts
   */
  _failImpact(variant, splatPos, wallNormal = null, opts = {}) {
    const alreadyBrokeCombo = Boolean(opts.alreadyBrokeCombo);
    if (!alreadyBrokeCombo) {
      if (variant === 'ground') this.gameSession.notifyThrowHitGround();
      else this.gameSession.notifyThrowHitObstacle();
    }
    if (variant === 'face') this.gameAudio?.playWrongSplat();
    else this.gameAudio?.playMissThud();
    if (variant === 'ground') this.juice.screenShake?.trigger(0.065);
    if (variant === 'wall') this.juice.screenShake?.trigger(0.055);
    if (variant === 'face') this.juice.screenShake?.trigger(0.22);

    if (this.debrisSystem && this._proj?.thrownStack?.length) {
      this.debrisSystem.spawnFromStack(this._proj.thrownStack, this._proj.pos.clone(), wallNormal);
    }
    this._splash = createSplash(this.scene, splatPos, variant, { normal: wallNormal ?? undefined });
    this._finishThrow();
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

    integrateAir(p.vel, dt);
    p.pos.addScaledVector(p.vel, dt);

    const speed = p.vel.length();
    const stretch = 1 + Math.min(0.14, speed * 0.005);
    p.mesh.scale.setScalar(stretch);
    this._updateFlightTrail(p.pos);

    const colliders = this.customerManager
      .getWorldColliders()
      .map((c) => ({ ...c, _d: p.pos.distanceToSquared(c.center) }))
      .sort((a, b) => a._d - b._d);

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      _tmp.copy(p.pos).sub(c.center);
      if (_tmp.length() < p.r + c.radius) {
        const stack = p.thrownStack;
        const hitEntry = this.customerManager.entries[c.index];
        const hitAnchor = new THREE.Vector3();
        if (hitEntry) {
          hitEntry.view.root.getWorldPosition(hitAnchor);
          hitAnchor.y += 2.05;
        }
        const result = this.gameSession.resolveThrowVsCustomer(stack, c.index, this.customerManager);
        if (result.correct) {
          const coinPos = hitAnchor.clone();
          coinPos.y -= 0.5;
          this.juice.coinFlyout?.spawnBurst(
            coinPos,
            this.camera,
            this.juice.coinsHudEl ?? null,
            result.earned ?? 1,
          );
          if (this.floatingLayer && hitEntry) {
            if (result.fast) {
              this.floatingLayer.spawn(hitAnchor.clone(), 'FAST!', '#8fffac', {
                className: 'floating-bonus-text--pop',
                riseSpeed: 1.25,
              });
            }
            if (result.insane) {
              const w = hitAnchor.clone();
              w.y += 0.38;
              this.floatingLayer.spawn(w, 'INSANE!', '#ff9cf9', {
                className: 'floating-bonus-text--pop',
                riseSpeed: 1.25,
              });
            }
            if (result.comboApplied != null) {
              const comboPos = hitAnchor.clone();
              comboPos.y += 0.52;
              this.floatingLayer.spawn(comboPos, `×${result.comboApplied}`, '#ffd84a', {
                className: 'floating-bonus-text--combo-serve',
                duration: 3,
                riseSpeed: 0.26,
                comboPulse: true,
              });
            }
          }
          this.juice.screenShake?.trigger(0.05);
          this.gameAudio?.playCorrect();
          this._finishThrow();
        } else {
          const facePos = new THREE.Vector3();
          if (hitEntry) {
            hitEntry.view.root.getWorldPosition(facePos);
            facePos.y += 1.18;
          } else {
            facePos.copy(p.pos);
          }
          this.customerManager.notifyWrongHit(c.index);
          this._failImpact('face', facePos, null, { alreadyBrokeCombo: true });
        }
        return;
      }
    }

    if (sphereVsAabb(p.pos, p.r, this.counterBox)) {
      this._failImpact(
        'wall',
        p.pos.clone(),
        new THREE.Vector3(0, 1, 0),
      );
      return;
    }

    if (resolveWalls(p.pos, p.r, _wallN)) {
      this._failImpact(
        'wall',
        p.pos.clone().setY(Math.max(p.r + 0.02, p.pos.y)),
        _wallN.clone(),
      );
      return;
    }

    if (hitsFloor(p.pos, p.r)) {
      p.pos.y = p.r + 0.02;
      this._failImpact('ground', p.pos.clone());
    }

    p.mesh.position.copy(p.pos);
  }
}
