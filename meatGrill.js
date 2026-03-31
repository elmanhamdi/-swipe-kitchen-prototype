/**
 * Meat grill station: dark grill body behind the plate, click-driven
 * cooking flow with 1s timers per side, visual state feedback.
 * Includes a 3D progress bar + label sprite floating above the grill.
 *
 * States: idle → cookingSideA → readyToFlip → cookingSideB → cooked → (serve) → idle
 */

import * as THREE from 'three';
import { createIngredientMesh } from './burgerVisuals.js';

const COOK_SIDE_SEC = 1;

const STATE = /** @type {const} */ ({
  IDLE: 'idle',
  COOKING_A: 'cookingSideA',
  READY_FLIP: 'readyToFlip',
  COOKING_B: 'cookingSideB',
  COOKED: 'cooked',
});

const COOKING_COLOR = 0x8a5530;
const FLIP_COLOR = 0xa06838;
const COOKED_COLOR = 0x3e2210;

const BAR_W = 1.0;
const BAR_H = 0.07;
const BAR_D = 0.04;

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

export class MeatGrill {
  /**
   * @param {THREE.Group} playArea
   * @param {number} plateY
   * @param {number} plateZ
   */
  constructor(playArea, plateY, plateZ) {
    this._playArea = playArea;
    this.state = STATE.IDLE;
    this._timer = 0;

    this._grillGroup = new THREE.Group();
    this._grillGroup.name = 'MeatGrill';

    const grillW = 1.7;
    const grillD = 1.3;
    const grillH = 0.06;  
    const grillY = plateY - 0.1;
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

    this._pattySlotY = grillY + grillH / 2 + 0.05;
    this._pattySlotZ = grillZ;

    /** @type {THREE.Object3D | null} */
    this._pattyMesh = null;
    this._pattyPivot = new THREE.Group();
    this._pattyPivot.position.set(0, this._pattySlotY, this._pattySlotZ);
    this._grillGroup.add(this._pattyPivot);

    // --- 3D progress bar ---
    const barY = grillY + 0.45;
    const barZ = grillZ;

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.7 });
    this._barBg = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, BAR_H, BAR_D), bgMat);
    this._barBg.position.set(0, barY, barZ);
    this._barBg.visible = false;
    this._grillGroup.add(this._barBg);

    const fillMat = new THREE.MeshBasicMaterial({ color: 0xe87a20 });
    this._barFill = new THREE.Mesh(new THREE.BoxGeometry(BAR_W, BAR_H - 0.01, BAR_D + 0.005), fillMat);
    this._barFill.position.set(0, barY, barZ);
    this._barFill.visible = false;
    this._grillGroup.add(this._barFill);

    // Label sprite above the bar
    this._labelCanvas = _makeTextCanvas('', '#ffffff');
    this._labelTex = new THREE.CanvasTexture(this._labelCanvas);
    this._labelTex.colorSpace = THREE.SRGBColorSpace;
    const labelMat = new THREE.SpriteMaterial({ map: this._labelTex, transparent: true, depthTest: false });
    this._labelSprite = new THREE.Sprite(labelMat);
    this._labelSprite.scale.set(0.7, 0.26, 1);
    this._labelSprite.position.set(0, barY + 0.22, barZ);
    this._labelSprite.visible = false;
    this._grillGroup.add(this._labelSprite);
    this._currentLabel = '';

    playArea.add(this._grillGroup);

    /** @type {THREE.Object3D[]} */
    this.raycastTargets = [];
    body.userData.isGrillBody = true;
    this.raycastTargets.push(body);
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

  startFromPile() {
    if (this.isBusy) return false;
    this._spawnPatty();
    this.state = STATE.COOKING_A;
    this._timer = 0;
    this._applyVisualState();
    this._updateBar();
    return true;
  }

  /** @returns {'flipped' | 'served' | 'wait' | 'idle'} */
  onPattyClick() {
    switch (this.state) {
      case STATE.READY_FLIP:
        this.state = STATE.COOKING_B;
        this._timer = 0;
        this._flipPatty();
        this._applyVisualState();
        this._updateBar();
        return 'flipped';
      case STATE.COOKED:
        return 'served';
      case STATE.COOKING_A:
      case STATE.COOKING_B:
        return 'wait';
      default:
        return 'idle';
    }
  }

  completeServe() {
    this._removePatty();
    this.state = STATE.IDLE;
    this._timer = 0;
    this._applyVisualState();
    this._updateBar();
  }

  update(dt) {
    if (dt <= 0) return;
    if (this.state === STATE.COOKING_A) {
      this._timer += dt;
      this._glowLight.intensity = 0.15 + Math.sin(this._timer * 6) * 0.05;
      this._updateBar();
      if (this._timer >= COOK_SIDE_SEC) {
        this.state = STATE.READY_FLIP;
        this._timer = 0;
        this._applyVisualState();
        this._updateBar();
      }
    } else if (this.state === STATE.COOKING_B) {
      this._timer += dt;
      this._glowLight.intensity = 0.15 + Math.sin(this._timer * 6) * 0.05;
      this._updateBar();
      if (this._timer >= COOK_SIDE_SEC) {
        this.state = STATE.COOKED;
        this._timer = 0;
        this._applyVisualState();
        this._updateBar();
      }
    } else if (this.state === STATE.IDLE) {
      this._glowLight.intensity = 0;
    }
  }

  reset() {
    this._removePatty();
    this.state = STATE.IDLE;
    this._timer = 0;
    this._glowLight.intensity = 0;
    this._updateBar();
  }

  // --- 3D bar helpers ---

  _updateBar() {
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
      this._barFill.position.x = -(BAR_W * (1 - p)) / 2;
      this._barFill.material.color.setHex(0xe87a20);
      this._setLabel('');
    } else if (hint === 'flip') {
      this._barFill.scale.x = 1;
      this._barFill.position.x = 0;
      this._barFill.material.color.setHex(0xffcc44);
      this._setLabel('FLIP!', '#ffdd66');
    } else if (hint === 'cooked') {
      this._barFill.scale.x = 1;
      this._barFill.position.x = 0;
      this._barFill.material.color.setHex(0x44bb44);
      this._setLabel('SERVE!', '#66ee66');
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

  // --- patty helpers ---

  _spawnPatty() {
    this._removePatty();
    const mesh = createIngredientMesh('meat');
    mesh.scale.setScalar(1.15);
    mesh.userData.pickGrillPatty = true;
    this._pattyMesh = mesh;
    this._pattyPivot.rotation.set(0, 0, 0);
    this._pattyPivot.add(mesh);
    this.raycastTargets.push(mesh);
  }

  _removePatty() {
    if (this._pattyMesh) {
      const idx = this.raycastTargets.indexOf(this._pattyMesh);
      if (idx >= 0) this.raycastTargets.splice(idx, 1);
      this._pattyMesh.removeFromParent();
      this._pattyMesh = null;
    }
  }

  _flipPatty() {
    this._pattyPivot.rotation.x += Math.PI;
  }

  _applyVisualState() {
    const mat = this._pattyMesh?.material;
    if (!mat) return;
    switch (this.state) {
      case STATE.COOKING_A:
        mat.color?.setHex(COOKING_COLOR);
        mat.emissive?.setHex(0x1a0800);
        mat.emissiveIntensity = 0.12;
        this._glowLight.intensity = 0.15;
        break;
      case STATE.READY_FLIP:
        mat.color?.setHex(FLIP_COLOR);
        mat.emissive?.setHex(0x2a1200);
        mat.emissiveIntensity = 0.18;
        this._glowLight.intensity = 0.1;
        break;
      case STATE.COOKING_B:
        mat.color?.setHex(COOKING_COLOR);
        mat.emissive?.setHex(0x1a0800);
        mat.emissiveIntensity = 0.12;
        this._glowLight.intensity = 0.15;
        break;
      case STATE.COOKED:
        mat.color?.setHex(COOKED_COLOR);
        mat.emissive?.setHex(0x0a0400);
        mat.emissiveIntensity = 0.06;
        this._glowLight.intensity = 0.05;
        break;
      default:
        this._glowLight.intensity = 0;
        break;
    }
  }
}
