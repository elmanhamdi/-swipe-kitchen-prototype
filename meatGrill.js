/**
 * Meat grill station: two independent cooking slots + a serve plate.
 * Each slot: idle → cookingSideA → readyToFlip → cookingSideB → cooked → (auto-slide to plate)
 * Tapping the pile starts a patty in the first free slot.
 * Tapping a patty in readyToFlip flips it; tapping a patty on the serve plate picks it up.
 */

import * as THREE from 'three';
import { createIngredientMesh } from './burgerVisuals.js';

const COOK_SIDE_SEC = 1;
const SLIDE_DURATION = 0.3;
const FLIP_DURATION = 0.22;
const PLACE_DURATION = 0.25;

const STATE = /** @type {const} */ ({
  IDLE: 'idle',
  COOKING_A: 'cookingSideA',
  READY_FLIP: 'readyToFlip',
  COOKING_B: 'cookingSideB',
  COOKED: 'cooked',
  SLIDING: 'sliding',
  PLACING: 'placing',
});

const COOKING_COLOR = 0x865332;
const COOKED_COLOR = 0x6b4028;

const BAR_W = 0.42;
const BAR_H = 0.06;
const BAR_D = 0.035;

const RAW_SIDE_COLOR = 0x8b2d1a;
const RAW_FACE_TINT = 0xffc0b0;
const MID_SIDE_COLOR = COOKING_COLOR;
const MID_FACE_TINT = 0xd1a17a;
const COOKED_SIDE_COLOR = COOKED_COLOR;
const COOKED_FACE_TINT = 0xb08060;

function lerpHex(a, b, t) {
  const c0 = new THREE.Color(a);
  const c1 = new THREE.Color(b);
  return c0.lerp(c1, THREE.MathUtils.clamp(t, 0, 1));
}

function _makeTextCanvas(text, fillStyle) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 48);
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fillStyle;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, 64, 24);
  return canvas;
}

class GrillSlot {
  /**
   * @param {THREE.Group} grillGroup
   * @param {number} slotX
   * @param {number} slotY
   * @param {number} slotZ
   * @param {THREE.Object3D[]} raycastTargets
   */
  constructor(grillGroup, slotX, slotY, slotZ, raycastTargets) {
    this.state = STATE.IDLE;
    this._timer = 0;
    this._raycastTargets = raycastTargets;
    this._cookA = 0;
    this._cookB = 0;
    this._flipAnim = null;

    this._pivot = new THREE.Group();
    this._pivot.position.set(slotX, slotY, slotZ);
    grillGroup.add(this._pivot);

    /** @type {THREE.Object3D | null} */
    this._pattyMesh = null;

    const barY = slotY + 0.38;

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.7 });
    this._barBg = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, BAR_H, BAR_D), bgMat);
    this._barBg.position.set(slotX, barY, slotZ);
    this._barBg.visible = false;
    grillGroup.add(this._barBg);

    const fillMat = new THREE.MeshBasicMaterial({ color: 0xe87a20 });
    this._barFill = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, BAR_H - 0.01, BAR_D + 0.004), fillMat);
    this._barFill.position.set(slotX, barY, slotZ);
    this._barFill.visible = false;
    grillGroup.add(this._barFill);

    this._labelCanvas = _makeTextCanvas('', '#ffffff');
    this._labelTex = new THREE.CanvasTexture(this._labelCanvas);
    this._labelTex.colorSpace = THREE.SRGBColorSpace;
    const labelMat = new THREE.SpriteMaterial({ map: this._labelTex, transparent: true, depthTest: false });
    this._labelSprite = new THREE.Sprite(labelMat);
    this._labelSprite.scale.set(0.55, 0.2, 1);
    this._labelSprite.position.set(slotX, barY + 0.18, slotZ);
    this._labelSprite.visible = false;
    grillGroup.add(this._labelSprite);
    this._currentLabel = '';
  }

  get isBusy() {
    return this.state !== STATE.IDLE;
  }

  getProgress01() {
    if (this.state === STATE.COOKING_A || this.state === STATE.COOKING_B) {
      return Math.min(1, this._timer / COOK_SIDE_SEC);
    }
    return 0;
  }

  /** @returns {'cooking' | 'flip' | 'cooked' | null} */
  getHudHint() {
    switch (this.state) {
      case STATE.COOKING_A:
      case STATE.COOKING_B:
        return 'cooking';
      case STATE.READY_FLIP:
        return 'flip';
      case STATE.COOKED:
        return 'cooked';
      default:
        return null;
    }
  }

  startCooking() {
    if (this.isBusy) return false;
    this._spawnPatty();
    this.state = STATE.COOKING_A;
    this._timer = 0;
    this._applyVisualState();
    this._updateBar();
    return true;
  }

  reserve() {
    if (this.isBusy) return false;
    this.state = STATE.PLACING;
    return true;
  }

  confirmPlacement() {
    if (this.state !== STATE.PLACING) return false;
    this._spawnPatty();
    this.state = STATE.COOKING_A;
    this._timer = 0;
    this._applyVisualState();
    this._updateBar();
    return true;
  }

  /** @returns {'flipped' | 'wait' | 'idle'} */
  onPattyClick() {
    switch (this.state) {
      case STATE.READY_FLIP:
        this.state = STATE.COOKING_B;
        this._timer = 0;
        this._startFlipAnimation();
        this._applyVisualState();
        this._updateBar();
        return 'flipped';
      case STATE.COOKING_A:
      case STATE.COOKING_B:
        return 'wait';
      default:
        return 'idle';
    }
  }

  /** @returns {'none' | 'sideA_done' | 'cooked'} */
  update(dt) {
    if (dt <= 0) return 'none';
    this._advanceFlipAnimation(dt);
    if (this.state === STATE.COOKING_A) {
      this._timer += dt;
      this._cookA = Math.min(1, this._timer / COOK_SIDE_SEC);
      this._updateBar();
      if (this._timer >= COOK_SIDE_SEC) {
        this.state = STATE.READY_FLIP;
        this._timer = 0;
        this._cookA = 1;
        this._applyVisualState();
        this._updateBar();
        return 'sideA_done';
      }
    } else if (this.state === STATE.COOKING_B) {
      this._timer += dt;
      this._cookB = Math.min(1, this._timer / COOK_SIDE_SEC);
      this._updateBar();
      if (this._timer >= COOK_SIDE_SEC) {
        this.state = STATE.COOKED;
        this._timer = 0;
        this._cookB = 1;
        this._applyVisualState();
        this._updateBar();
        return 'cooked';
      }
    }
    return 'none';
  }

  /** Remove patty from grill slot (for slide animation or reset). Returns the mesh or null. */
  detachPatty() {
    const mesh = this._pattyMesh;
    if (mesh) {
      const idx = this._raycastTargets.indexOf(mesh);
      if (idx >= 0) this._raycastTargets.splice(idx, 1);
      mesh.removeFromParent();
      this._pattyMesh = null;
    }
    this.state = STATE.IDLE;
    this._timer = 0;
    this._cookA = 0;
    this._cookB = 0;
    this._flipAnim = null;
    this._updateBar();
    return mesh;
  }

  reset() {
    this._removePatty();
    this.state = STATE.IDLE;
    this._timer = 0;
    this._cookA = 0;
    this._cookB = 0;
    this._flipAnim = null;
    this._updateBar();
  }

  _spawnPatty() {
    this._removePatty();
    const mesh = createIngredientMesh('meat');
    mesh.scale.setScalar(1.15);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.userData.pickGrillPatty = true;
    this._pattyMesh = mesh;
    this._cookA = 0;
    this._cookB = 0;
    this._flipAnim = null;
    this._pivot.rotation.set(0, 0, 0);
    this._pivot.add(mesh);
    this._raycastTargets.push(mesh);
  }

  _removePatty() {
    if (this._pattyMesh) {
      const idx = this._raycastTargets.indexOf(this._pattyMesh);
      if (idx >= 0) this._raycastTargets.splice(idx, 1);
      this._pattyMesh.removeFromParent();
      this._pattyMesh = null;
    }
    this._flipAnim = null;
  }

  _startFlipAnimation() {
    this._flipAnim = {
      t: 0,
      startX: this._pivot.rotation.x,
      endX: this._pivot.rotation.x + Math.PI,
    };
  }

  _advanceFlipAnimation(dt) {
    if (!this._flipAnim || !this._pattyMesh) return;
    this._flipAnim.t += dt;
    const u = THREE.MathUtils.clamp(this._flipAnim.t / FLIP_DURATION, 0, 1);
    const e = u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2;
    this._pivot.rotation.x = THREE.MathUtils.lerp(this._flipAnim.startX, this._flipAnim.endX, e);
    this._pattyMesh.position.y = Math.sin(u * Math.PI) * 0.12;
    this._pattyMesh.rotation.z = Math.sin(u * Math.PI) * 0.2;
    if (u >= 1) {
      this._pivot.rotation.x = this._flipAnim.endX;
      this._pattyMesh.position.y = 0;
      this._pattyMesh.rotation.z = 0;
      this._flipAnim = null;
    }
  }

  _applyVisualState() {
    if (!this._pattyMesh) return;
    this._setCookVisual(this._cookA, this._cookB);
  }

  _setCookVisual(cookA01, cookB01) {
    const mats = this._pattyMesh?.material;
    const materials = Array.isArray(mats) ? mats : mats ? [mats] : [];
    if (materials.length < 3) return;

    const cookA = THREE.MathUtils.clamp(cookA01, 0, 1);
    const cookB = THREE.MathUtils.clamp(cookB01, 0, 1);
    const sideCook = (cookA + cookB) * 0.5;

    const sideColor = sideCook < 0.55
      ? lerpHex(RAW_SIDE_COLOR, MID_SIDE_COLOR, sideCook / 0.55)
      : lerpHex(MID_SIDE_COLOR, COOKED_SIDE_COLOR, (sideCook - 0.55) / 0.45);
    const sideEmissive = sideCook < 0.5
      ? lerpHex(0x3b1d12, 0x30170a, sideCook / 0.5)
      : lerpHex(0x30170a, 0x160b06, (sideCook - 0.5) / 0.5);

    const faceStyle = (u) => ({
      color: u < 0.55
        ? lerpHex(RAW_FACE_TINT, MID_FACE_TINT, u / 0.55)
        : lerpHex(MID_FACE_TINT, COOKED_FACE_TINT, (u - 0.55) / 0.45),
      emissive: u < 0.5
        ? lerpHex(0x3b1d12, 0x32180b, u / 0.5)
        : lerpHex(0x32180b, 0x181009, (u - 0.5) / 0.5),
      emissiveIntensity: THREE.MathUtils.lerp(0.07, 0.045, u),
    });

    const faceA = faceStyle(cookA);
    const faceB = faceStyle(cookB);

    materials[0].color?.copy(sideColor);
    materials[0].emissive?.copy(sideEmissive);
    materials[0].emissiveIntensity = THREE.MathUtils.lerp(0.07, 0.045, sideCook);

    materials[1].color?.copy(faceA.color);
    materials[1].emissive?.copy(faceA.emissive);
    materials[1].emissiveIntensity = faceA.emissiveIntensity;

    materials[2].color?.copy(faceB.color);
    materials[2].emissive?.copy(faceB.emissive);
    materials[2].emissiveIntensity = faceB.emissiveIntensity;

    materials.forEach((mat) => {
      if (!mat) return;
      mat.needsUpdate = true;
    });
  }

  _updateBar() {
    if (this.state === STATE.COOKING_A) {
      this._setCookVisual(this.getProgress01(), this._cookB);
    } else if (this.state === STATE.COOKING_B) {
      this._setCookVisual(this._cookA, this.getProgress01());
    }

    const hint = this.getHudHint();
    if (!hint) {
      this._barBg.visible = false;
      this._barFill.visible = false;
      this._labelSprite.visible = false;
      return;
    }

    this._barBg.visible = true;
    this._barFill.visible = true;

    if (hint === 'cooking') {
      const p = this.getProgress01();
      this._barFill.scale.x = Math.max(0.001, p);
      this._barFill.position.x = this._pivot.position.x - (BAR_W * (1 - p)) / 2;
      this._barFill.material.color.setHex(0xe87a20);
      this._setLabel('');
    } else if (hint === 'flip') {
      this._barFill.scale.x = 1;
      this._barFill.position.x = this._pivot.position.x;
      this._barFill.material.color.setHex(0xffcc44);
      this._setLabel('FLIP!', '#ffdd66');
    } else if (hint === 'cooked') {
      this._barFill.scale.x = 1;
      this._barFill.position.x = this._pivot.position.x;
      this._barFill.material.color.setHex(0x44bb44);
      this._setLabel('DONE', '#66ee66');
    }
  }

  _setLabel(text, color = '#ffffff') {
    if (text === this._currentLabel) return;
    this._currentLabel = text;
    if (!text) {
      this._labelSprite.visible = false;
      return;
    }
    const canvas = _makeTextCanvas(text, color);
    this._labelTex.image = canvas;
    this._labelTex.needsUpdate = true;
    this._labelSprite.visible = true;
  }
}

export class MeatGrill {
  /**
   * @param {THREE.Group} playArea
   * @param {number} plateY
   * @param {number} plateZ
   */
  constructor(playArea, plateY, plateZ) {
    this._playArea = playArea;

    this._grillGroup = new THREE.Group();
    this._grillGroup.name = 'MeatGrill';

    const grillW = 1.7;
    const grillD = 1.3;
    const grillH = 0.2;
    const grillY = plateY - 0.5;
    const grillZ = plateZ - 1.6;

    const grillMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.85,
      metalness: 0.35,
      emissive: 0x0a0404,
      emissiveIntensity: 0.08,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(grillW, grillH, grillD), grillMat);
    body.position.set(0, grillY, grillZ);
    body.castShadow = true;
    body.receiveShadow = true;
    this._grillGroup.add(body);

    const barCount = 8;
    const barMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.5 });
    const barGeo = new THREE.BoxGeometry(grillW - 0.08, 0.015, 0.03);
    for (let i = 0; i < barCount; i++) {
      const bar = new THREE.Mesh(barGeo, barMat);
      const t = (i + 0.5) / barCount;
      bar.position.set(0, grillY + grillH / 2 + 0.008, grillZ - grillD / 2 + grillD * t);
      this._grillGroup.add(bar);
    }

    const glowLight = new THREE.PointLight(0xff4400, 0, 2.5, 2);
    glowLight.position.set(0, grillY - 0.05, grillZ);
    this._grillGroup.add(glowLight);
    this._glowLight = glowLight;

    /** @type {THREE.Object3D[]} */
    this.raycastTargets = [];
    body.userData.isGrillBody = true;
    this.raycastTargets.push(body);

    const slotY = grillY + grillH / 2 + 0.05;
    const slotZ = grillZ;
    this._slots = [
      new GrillSlot(this._grillGroup, -0.38, slotY, slotZ, this.raycastTargets),
      new GrillSlot(this._grillGroup, 0.38, slotY, slotZ, this.raycastTargets),
    ];

    // --- Serve plate to the left of the grill ---
    const servePlateY = grillY + grillH / 2 + 0.01;
    const servePlateZ = grillZ - 0.30;
    const servePlateX = -(grillW / 2 + 0.55);
    this._servePlatePos = new THREE.Vector3(servePlateX, servePlateY, servePlateZ);

    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xf2f0ec,
      roughness: 0.35,
      metalness: 0.15,
    });
    const plateRim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.48, 0.04, 24), plateMat);
    plateRim.position.copy(this._servePlatePos);
    plateRim.castShadow = true;
    plateRim.receiveShadow = true;
    this._grillGroup.add(plateRim);

    const plateInner = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.42, 0.03, 24), plateMat);
    plateInner.position.copy(this._servePlatePos).add(new THREE.Vector3(0, 0.025, 0));
    plateInner.receiveShadow = true;
    this._grillGroup.add(plateInner);

    /** @type {THREE.Object3D[]} */
    this._serveStack = [];
    this._STACK_Y_OFFSET = 0.09;
    this._serveMeshPivot = new THREE.Group();
    this._serveMeshPivot.position.copy(this._servePlatePos).add(new THREE.Vector3(0, 0.06, 0));
    this._grillGroup.add(this._serveMeshPivot);

    /** @type {{ mesh: THREE.Object3D, startPos: THREE.Vector3, endPos: THREE.Vector3, t: number } | null} */
    this._slideAnim = null;
    /** @type {{ mesh: THREE.Object3D, slot: GrillSlot, startPos: THREE.Vector3, endPos: THREE.Vector3, t: number } | null} */
    this._placeAnim = null;

    playArea.add(this._grillGroup);

    this._pattyPivot = this._serveMeshPivot;
  }

  get isBusy() {
    return !this._slots.some(s => !s.isBusy);
  }

  get hasServedPatty() {
    return this._serveStack.length > 0;
  }

  get isAnyCooking() {
    return this._slots.some(s =>
      s.state === STATE.COOKING_A || s.state === STATE.COOKING_B
    );
  }

  getPrimarySlotState() {
    return this._slots[0]?.state ?? STATE.IDLE;
  }

  /**
   * @param {THREE.Vector3} [out]
   */
  getPrimarySlotWorldPosition(out = new THREE.Vector3()) {
    this._slots[0]?._pivot.getWorldPosition(out);
    out.y += 0.12;
    return out;
  }

  /**
   * @param {THREE.Vector3} [out]
   */
  getServePlateWorldPosition(out = new THREE.Vector3()) {
    this._serveMeshPivot.getWorldPosition(out);
    out.y += 0.12;
    return out;
  }

  startFromPile() {
    for (const slot of this._slots) {
      if (!slot.isBusy) {
        slot.startCooking();
        return true;
      }
    }
    return false;
  }

  startFromPileAnimated(sourceWorldPos) {
    if (this._placeAnim) return false;
    let targetSlot = null;
    for (const slot of this._slots) {
      if (!slot.isBusy) {
        targetSlot = slot;
        break;
      }
    }
    if (!targetSlot) return false;

    targetSlot.reserve();

    const localSource = this._grillGroup.worldToLocal(sourceWorldPos.clone());
    const localTarget = targetSlot._pivot.position.clone();

    const mesh = createIngredientMesh('meat');
    mesh.scale.setScalar(1.15);
    this._grillGroup.add(mesh);
    mesh.position.copy(localSource);

    this._placeAnim = {
      mesh,
      slot: targetSlot,
      startPos: localSource.clone(),
      endPos: localTarget.clone(),
      t: 0,
    };
    return true;
  }

  /** @returns {'flipped' | 'served' | 'wait' | 'idle'} */
  onPattyClick(hitMesh) {
    if (hitMesh && this._serveStack.includes(hitMesh)) {
      return 'served';
    }
    for (const slot of this._slots) {
      if (slot.state === STATE.READY_FLIP && (!hitMesh || slot._pattyMesh === hitMesh)) {
        slot.onPattyClick();
        return 'flipped';
      }
    }
    if (this._serveStack.length > 0) {
      return 'served';
    }
    for (const slot of this._slots) {
      const r = slot.onPattyClick();
      if (r !== 'idle') return r;
    }
    return 'idle';
  }

  completeServe() {
    if (this._serveStack.length === 0) return;
    const top = this._serveStack.pop();
    const idx = this.raycastTargets.indexOf(top);
    if (idx >= 0) this.raycastTargets.splice(idx, 1);
    top.removeFromParent();
    this._repositionServeStack();
  }

  update(dt) {
    if (dt <= 0) return false;

    let anyDing = false;
    for (const slot of this._slots) {
      const result = slot.update(dt);
      if (result === 'cooked' && !this._slideAnim) {
        this._startSlideToPlate(slot);
      }
      if (result === 'sideA_done' || result === 'cooked') {
        anyDing = true;
      }
    }

    if (!this._slideAnim) {
      for (const slot of this._slots) {
        if (slot.state === STATE.COOKED) {
          this._startSlideToPlate(slot);
          break;
        }
      }
    }

    if (this._placeAnim) {
      this._placeAnim.t += dt;
      const u = Math.min(1, this._placeAnim.t / PLACE_DURATION);
      const e = 1 - (1 - u) ** 3;
      const p = this._placeAnim.startPos.clone().lerp(this._placeAnim.endPos, e);
      p.y += Math.sin(u * Math.PI) * 0.18;
      this._placeAnim.mesh.position.copy(p);
      this._placeAnim.mesh.rotation.x = Math.sin(u * Math.PI) * 0.3;
      if (u >= 1) {
        this._placeAnim.mesh.removeFromParent();
        this._placeAnim.slot.confirmPlacement();
        this._placeAnim = null;
      }
    }

    if (this._slideAnim) {
      this._slideAnim.t += dt;
      const u = Math.min(1, this._slideAnim.t / SLIDE_DURATION);
      const e = 1 - (1 - u) ** 3;
      const p = this._slideAnim.startPos.clone().lerp(this._slideAnim.endPos, e);
      p.y += Math.sin(u * Math.PI) * 0.12;
      this._slideAnim.mesh.position.copy(p);
      if (u >= 1) {
        this._placeOnServePlate(this._slideAnim.mesh);
        this._slideAnim = null;
      }
    }

    const anyActive = this._slots.some(s => s.state !== STATE.IDLE);
    this._glowLight.intensity = anyActive
      ? 0.15 + Math.sin(performance.now() * 0.006) * 0.05
      : 0;
    return anyDing;
  }

  reset() {
    if (this._placeAnim) {
      this._placeAnim.mesh.removeFromParent();
      this._placeAnim = null;
    }
    for (const slot of this._slots) slot.reset();
    for (const m of this._serveStack) {
      const idx = this.raycastTargets.indexOf(m);
      if (idx >= 0) this.raycastTargets.splice(idx, 1);
      m.removeFromParent();
    }
    this._serveStack.length = 0;
    if (this._slideAnim) {
      this._slideAnim.mesh.removeFromParent();
      this._slideAnim = null;
    }
    this._glowLight.intensity = 0;
  }

  _startSlideToPlate(slot) {
    const startPos = slot._pivot.position.clone();
    const mesh = slot.detachPatty();
    if (!mesh) return;

    const endPos = this._serveMeshPivot.position.clone();
    endPos.y += this._serveStack.length * this._STACK_Y_OFFSET;

    mesh.userData.pickGrillPatty = false;
    this._grillGroup.add(mesh);
    mesh.position.copy(startPos);

    this._slideAnim = { mesh, startPos: startPos.clone(), endPos, t: 0 };
  }

  _placeOnServePlate(mesh) {
    mesh.removeFromParent();
    const stackIdx = this._serveStack.length;
    mesh.position.set(0, stackIdx * this._STACK_Y_OFFSET, 0);
    mesh.userData.pickGrillPatty = true;
    this._serveMeshPivot.add(mesh);
    this._serveStack.push(mesh);
    this.raycastTargets.push(mesh);
  }

  _repositionServeStack() {
    for (let i = 0; i < this._serveStack.length; i++) {
      this._serveStack[i].position.set(0, i * this._STACK_Y_OFFSET, 0);
    }
  }
}
