/**
 * 3D ingredient piles + dog character; raycast pick helper.
 */

import * as THREE from 'three';
import { createIngredientMesh } from './burgerVisuals.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

const PILE_SCALE = 0.38 * 3;
const PILE_LAYER_Y = 0.06 * 3;
const DOG_EAT_DURATION = 0.6;

function getPileAccentColor(pickKey) {
  switch (pickKey) {
    case 'lettuce':
      return 0x7acb52;
    case 'tomato':
      return 0xdd5a4e;
    case 'cheese':
      return 0xf2bf4a;
    case 'meat':
      return 0x9b3d24;
    case 'bun':
      return 0xd4a05d;
    default:
      return 0xb78b67;
  }
}

function findPickRoot(obj) {
  let o = obj;
  while (o) {
    if (o.userData?.pickGrillPatty) return { kind: 'grillPatty', root: o };
    if (o.userData?.pickIngredient) return { kind: 'ingredient', type: o.userData.pickIngredient, root: o };
    if (o.userData?.isDog) return { kind: 'dog', root: o };
    if (o.userData?.openShop) return { kind: 'open', root: o };
    o = o.parent;
  }
  return null;
}

export class WorldPickables {
  /**
   * @param {THREE.Group} playArea
   * @param {THREE.Scene} scene
   */
  constructor(playArea, scene) {
    this.playArea = playArea;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'WorldPickables';
    playArea.add(this.group);

    /** @type {THREE.Object3D[]} */
    this._meshes = [];
    this._pileRoots = new Map();
    this._dogEatT = 0;
    this._dogTime = 0;
    this._dogMealsEaten = 0;
    this._dogNextBarkT = 5 + Math.random() * 5;
    this._dogBarkAnimT = 0;
    this._onDogBark = null;
    const deskTex = new THREE.TextureLoader().load('./assets/textures/desk.png');
    deskTex.colorSpace = THREE.SRGBColorSpace;
    deskTex.wrapS = THREE.RepeatWrapping;
    deskTex.wrapT = THREE.RepeatWrapping;
    deskTex.repeat.set(1, 1);
    const woodTableMat = new THREE.MeshStandardMaterial({
      map: deskTex,
      color: 0xddccbb,
      roughness: 0.72,
      metalness: 0.05,
      emissive: 0x1a0e06,
      emissiveIntensity: 0.06,
    });

    const tableW = 6.2;
    const tableH = 0.5;
    const tableD = 4;
    const tableTopThick = 0.3;
    const tableZ = 0;

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(tableW, tableTopThick, tableD),
      woodTableMat,
    );
    tableTop.position.set(0, tableH, tableZ);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    this.group.add(tableTop);

    const legW = 0.12;
    const legH = tableH - tableTopThick / 2;
    const tableLegGeo = new THREE.BoxGeometry(legW, legH, legW);
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x5a3c22,
      roughness: 0.78,
      metalness: 0.04,
    });
    const legOffX = tableW / 2 - 0.18;
    const legOffZ = tableD / 2 - 0.18;
    const legPositions = [
      [-legOffX, legH / 2, tableZ - legOffZ],
      [legOffX, legH / 2, tableZ - legOffZ],
      [-legOffX, legH / 2, tableZ + legOffZ],
      [legOffX, legH / 2, tableZ + legOffZ],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const leg = new THREE.Mesh(tableLegGeo, legMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      this.group.add(leg);
    }

    const underPanelW = tableW - 0.5;
    const underPanelH = 10*legH - 0.06;
    const underPanelD = tableD - 0.5;
    const underPanelMat = new THREE.MeshStandardMaterial({
      color: 0x9e8870,
      roughness: 0.8,
      metalness: 0.04,
    });
    const underPanel = new THREE.Mesh(
      new THREE.BoxGeometry(underPanelW, underPanelH, underPanelD),
      underPanelMat,
    );
    underPanel.position.set(0, -1.2, tableZ+0.23);
    /**underPanel.rotation.x = Math.PI / 6;*/
    underPanel.castShadow = true;
    underPanel.receiveShadow = true;
    underPanel.name = 'UnderTablePanel';
    this.group.add(underPanel);
    this._underPanelMesh = underPanel;

    const pileY = tableH + tableTopThick / 2 + 0.08;
    this._pileItems = [];
    this._addIngredientPile('lettuce', -1.4, 0.5, pileY);
    this._addIngredientPile('tomato', -1.5, 1.5, pileY);

    this._addIngredientPile('cheese', 1.5, 1.5, pileY);
    this._addIngredientPile('meat', 1.4, -0.8, pileY);
    this._addIngredientPile('bun', 1.4, 0.5, pileY);

    this._introAnims = [];
    this._introPlaying = false;
    this._onIntroTick = null;

    this._buildDog();
  }

  _buildDog() {
    const furMat = new THREE.MeshStandardMaterial({
      color: 0xc8943e, roughness: 0.82, metalness: 0.05,
      emissive: 0x2a1a08, emissiveIntensity: 0.08,
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xe8c080, roughness: 0.85, metalness: 0.03,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.4, metalness: 0.15,
    });
    const tongueMat = new THREE.MeshStandardMaterial({
      color: 0xe85070, roughness: 0.7, metalness: 0.0,
    });
    const eyeHighlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.2, metalness: 0.1,
      emissive: 0xffffff, emissiveIntensity: 0.3,
    });

    const dogRoot = new THREE.Group();
    dogRoot.position.set(-1.3, 0, 2.7);
    dogRoot.rotation.z = Math.PI * 0.1;
    dogRoot.rotation.y = Math.PI * 0.2;
    dogRoot.rotation.x = Math.PI * -0.3;
    dogRoot.scale.setScalar(1.8);
    this.group.add(dogRoot);
    this._dogRoot = dogRoot;

    const dogBody = new THREE.Group();
    dogRoot.add(dogBody);
    this._dogBody = dogBody;

    const _m = (geo, mat, pos, scale, rot) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(...pos);
      if (scale) {
        if (typeof scale === 'number') m.scale.setScalar(scale);
        else m.scale.set(...scale);
      }
      if (rot) m.rotation.set(...rot);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.isDog = true;
      this._meshes.push(m);
      return m;
    };

    const bodySphere = new THREE.SphereGeometry(0.22, 14, 10);
    const body = _m(bodySphere, furMat, [0, 0.38, 0], [1, 0.85, 1.3]);
    dogBody.add(body);
    this._dogBodyMesh = body;

    const bellyMesh = _m(new THREE.SphereGeometry(0.14, 10, 8), bellyMat, [0, 0.32, 0.06], [0.9, 0.75, 1.0]);
    dogBody.add(bellyMesh);
    this._dogBellyMesh = bellyMesh;

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.55, 0.22);
    dogBody.add(headPivot);
    this._dogHeadPivot = headPivot;

    const headMesh = _m(new THREE.SphereGeometry(0.17, 12, 10), furMat, [0, 0, 0]);
    headPivot.add(headMesh);

    const snout = _m(new THREE.SphereGeometry(0.09, 10, 8), furMat, [0, -0.04, 0.14], [0.8, 0.65, 1.0]);
    headPivot.add(snout);

    const nose = _m(new THREE.SphereGeometry(0.038, 8, 6), darkMat, [0, -0.02, 0.21]);
    headPivot.add(nose);

    const eyeGeo = new THREE.SphereGeometry(0.038, 8, 6);
    headPivot.add(_m(eyeGeo, darkMat, [-0.075, 0.045, 0.12]));
    headPivot.add(_m(eyeGeo, darkMat, [0.075, 0.045, 0.12]));

    const hlGeo = new THREE.SphereGeometry(0.014, 6, 4);
    const hlL = new THREE.Mesh(hlGeo, eyeHighlightMat);
    hlL.position.set(-0.065, 0.055, 0.145);
    headPivot.add(hlL);
    const hlR = new THREE.Mesh(hlGeo, eyeHighlightMat);
    hlR.position.set(0.085, 0.055, 0.145);
    headPivot.add(hlR);

    const earGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const earInnerMat = new THREE.MeshStandardMaterial({
      color: 0xd4886a, roughness: 0.75, metalness: 0.03,
    });
    const earInnerGeo = new THREE.SphereGeometry(0.065, 8, 6);

    const earL = _m(earGeo, furMat, [-0.15, -0.01, -0.01], [0.45, 1.3, 0.75], [0, 0, 0.35]);
    headPivot.add(earL);
    const earInnerL = _m(earInnerGeo, earInnerMat, [-0.15, -0.03, 0.01], [0.3, 0.9, 0.5], [0, 0, 0.35]);
    headPivot.add(earInnerL);

    const earR = _m(earGeo, furMat, [0.15, -0.01, -0.01], [0.45, 1.3, 0.75], [0, 0, -0.35]);
    headPivot.add(earR);
    const earInnerR = _m(earInnerGeo, earInnerMat, [0.15, -0.03, 0.01], [0.3, 0.9, 0.5], [0, 0, -0.35]);
    headPivot.add(earInnerR);

    const tongue = _m(new THREE.SphereGeometry(0.04, 8, 6), tongueMat, [0, -0.09, 0.17], [0.7, 0.3, 1.0]);
    headPivot.add(tongue);
    this._dogTongue = tongue;

    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.44, -0.26);
    dogBody.add(tailPivot);
    this._dogTailPivot = tailPivot;

    const tail = _m(new THREE.CylinderGeometry(0.025, 0.042, 0.22, 8), furMat, [0, 0.11, 0], null, [-0.4, 0, 0]);
    tailPivot.add(tail);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.048, 0.26, 8);
    dogBody.add(_m(legGeo, furMat, [-0.1, 0.19, 0.15]));
    dogBody.add(_m(legGeo, furMat, [0.1, 0.19, 0.15]));

    const haunchGeo = new THREE.SphereGeometry(0.085, 8, 6);
    dogBody.add(_m(haunchGeo, furMat, [-0.14, 0.24, -0.12], [0.7, 0.6, 1.0]));
    dogBody.add(_m(haunchGeo, furMat, [0.14, 0.24, -0.12], [0.7, 0.6, 1.0]));

    const pawGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const pawMat = new THREE.MeshStandardMaterial({
      color: 0xb07830, roughness: 0.8, metalness: 0.04,
    });
    dogBody.add(_m(pawGeo, pawMat, [-0.1, 0.06, 0.15], [1, 0.5, 1.1]));
    dogBody.add(_m(pawGeo, pawMat, [0.1, 0.06, 0.15], [1, 0.5, 1.1]));
  }

  /** Add external meshes to the raycast pick list (e.g. grill targets). */
  registerRaycastTargets(objects) {
    for (const obj of objects) {
      if (!this._meshes.includes(obj)) this._meshes.push(obj);
    }
  }

  /** Remove external meshes from the raycast pick list. */
  unregisterRaycastTarget(obj) {
    const idx = this._meshes.indexOf(obj);
    if (idx >= 0) this._meshes.splice(idx, 1);
  }

  /**
   * @param {boolean} opened
   * @param {(() => void)|null} [onTick] called each time an item lands
   */
  setShopOpened(opened, onTick = null) {
    if (!opened) return;
    this._onIntroTick = onTick;
    this._introAnims = [];
    const dropDur = 0.35;
    const layerStagger = 0.14;
    for (let i = 0; i < this._pileItems.length; i++) {
      const item = this._pileItems[i];
      const layerIdx = i % 4;
      item.mesh.scale.setScalar(0);
      item.mesh.position.y = item.targetY + 0.6;
      this._introAnims.push({
        mesh: item.mesh,
        targetScale: item.targetScale,
        targetY: item.targetY,
        delay: layerIdx * layerStagger,
        dur: dropDur,
        t: 0,
        done: false,
      });
    }
    this._introPlaying = true;
  }

  triggerDogEat() {
    this._dogEatT = DOG_EAT_DURATION;
    this._dogMealsEaten++;
    this._applyDogGrowth();
  }

  _applyDogGrowth() {
    const m = Math.min(this._dogMealsEaten, 8);
    if (this._dogBodyMesh) {
      const bs = 1 + m * 0.07;
      this._dogBodyMesh.scale.set(bs, 0.85 * bs, 1.3 * bs);
    }
    if (this._dogBellyMesh) {
      const gs = 1 + m * 0.18;
      this._dogBellyMesh.scale.set(0.9 * gs, 0.75 * gs * 1.2, 1.0 * gs);
    }
  }

  getDogMouthWorldPos(out = new THREE.Vector3()) {
    if (!this._dogHeadPivot) return out.set(0, 0, 0);
    this._dogHeadPivot.getWorldPosition(out);
    return out;
  }

  resetTransientState() {
    this._dogEatT = 0;
    this._dogTime = 0;
    this._dogMealsEaten = 0;
    this._dogNextBarkT = 5 + Math.random() * 5;
    this._applyDogGrowth();
    if (this._dogHeadPivot) this._dogHeadPivot.rotation.set(0, 0, 0);
    if (this._dogTailPivot) this._dogTailPivot.rotation.set(0, 0, 0);
    if (this._dogRoot) this._dogRoot.position.y = 0;
    this._introPlaying = false;
    this._introAnims = [];
    for (const item of this._pileItems) {
      item.mesh.visible = true;
      item.mesh.scale.setScalar(item.targetScale);
      item.mesh.position.y = item.targetY;
    }
  }

  /**
   * @param {string} pickKey
   * @param {THREE.Vector3} [out]
   */
  getIngredientWorldPosition(pickKey, out = new THREE.Vector3()) {
    const root = this._pileRoots.get(pickKey);
    if (!root) return out.set(0, 0, 0);
    root.getWorldPosition(out);
    out.y += 0.26;
    return out;
  }

  /**
   * @param {string} pickKey `bun` | ingredient id
   * @param {number} lx
   * @param {number} lz
   * @param {number} [ly]
   */
  _addIngredientPile(pickKey, lx, lz, ly = 0.98) {
    const g = new THREE.Group();
    g.userData.pickIngredient = pickKey;
    const visualType = pickKey === 'bun' ? 'bun_bottom' : pickKey;
    const accent = getPileAccentColor(pickKey);
    const trayBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.09, 0.72),
      new THREE.MeshStandardMaterial({
        color: 0x6f5a51,
        roughness: 0.72,
        metalness: 0.16,
      }),
    );
    trayBase.position.y = -0.06;
    trayBase.castShadow = true;
    trayBase.receiveShadow = true;
    g.add(trayBase);

    const trayInset = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.03, 0.6),
      new THREE.MeshStandardMaterial({
        color: accent,
        roughness: 0.48,
        metalness: 0.1,
        emissive: accent,
        emissiveIntensity: 0.1,
      }),
    );
    trayInset.position.y = 0.005;
    trayInset.castShadow = true;
    trayInset.receiveShadow = true;
    g.add(trayInset);

    const n = 4;
    for (let i = 0; i < n; i++) {
      const m = createIngredientMesh(visualType);
      const targetScale = PILE_SCALE;
      const targetY = 0.05 + i * PILE_LAYER_Y;
      m.scale.setScalar(targetScale);
      m.position.y = targetY;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      this._meshes.push(m);
      this._pileItems.push({ mesh: m, targetScale, targetY });
    }
    g.position.set(lx, ly, lz);
    this.group.add(g);
    this._pileRoots.set(pickKey, g);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Camera} camera
   * @param {HTMLElement} domElement
   * @returns {{ dog?: boolean, ingredient?: string, openShop?: boolean, origin?: THREE.Vector3 } | null}
   */
  tryPick(clientX, clientY, camera, domElement) {
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObjects(this._meshes, true);
    if (!hits.length) return null;
    let info = null;
    for (const hit of hits) {
      info = findPickRoot(hit.object);
      if (info) break;
    }
    if (!info) return null;
    if (info.kind === 'open') return { openShop: true };
    if (info.kind === 'grillPatty') return { grillPatty: true, grillPattyMesh: info.root };
    if (info.kind === 'dog') return { dog: true };
    if (info.kind === 'ingredient') {
      const origin = new THREE.Vector3();
      info.root.getWorldPosition(origin);
      return { ingredient: info.type, origin };
    }
    return null;
  }

  update(dt) {
    this._updateIntroAnim(dt);
    this._updateDog(dt);
  }

  _updateDog(dt) {
    if (!this._dogTailPivot || dt <= 0) return;
    this._dogTime += dt;
    const t = this._dogTime;

    if (this._dogEatT > 0) {
      this._dogEatT = Math.max(0, this._dogEatT - dt);
      const u = 1 - this._dogEatT / DOG_EAT_DURATION;

      const jumpPhase = Math.max(0, 1 - u * 5);
      this._dogRoot.position.y = Math.sin(jumpPhase * Math.PI) * 0.06;

      let headDip = 0;
      if (u < 0.15) {
        headDip = 0;
      } else if (u < 0.55) {
        headDip = Math.sin(((u - 0.15) / 0.4) * Math.PI) * 0.4;
      }
      this._dogHeadPivot.rotation.x = -headDip;

      const chompFreq = u > 0.15 && u < 0.6 ? Math.sin(u * Math.PI * 18) * 0.15 : 0;
      this._dogHeadPivot.rotation.x += chompFreq;

      if (this._dogTongue) {
        this._dogTongue.visible = u > 0.15 && u < 0.6;
      }

      const tailSpeed = 2 + u * 22;
      this._dogTailPivot.rotation.z = Math.sin(t * tailSpeed) * 0.5;

      if (this._dogBody) {
        const hopAmplitude = u < 0.7 ? 0 : Math.sin((u - 0.7) / 0.3 * Math.PI * 2) * 0.02;
        this._dogBody.position.y = hopAmplitude;
      }
    } else {
      this._dogRoot.position.y = 0;
      if (this._dogBody) this._dogBody.position.y = 0;

      this._dogTailPivot.rotation.z = Math.sin(t * 4.5) * 0.25;

      this._dogHeadPivot.rotation.y = Math.sin(t * 0.8) * 0.06;
      this._dogHeadPivot.rotation.z = Math.sin(t * 0.6) * 0.03;

      if (this._dogBody) {
        const breathe = Math.sin(t * 2.2) * 0.008;
        this._dogBody.scale.set(1, 1 + breathe, 1);
      }

      if (this._dogTongue) this._dogTongue.visible = true;

      this._dogNextBarkT -= dt;
      if (this._dogNextBarkT <= 0) {
        this._dogNextBarkT = 8 + Math.random() * 12;
        this._dogBarkAnimT = 0.25;
        if (this._onDogBark) this._onDogBark();
      }
      if (this._dogBarkAnimT > 0) {
        this._dogBarkAnimT -= dt;
        const bu = 1 - Math.max(0, this._dogBarkAnimT) / 0.25;
        this._dogHeadPivot.rotation.x = Math.sin(bu * Math.PI) * -0.15;
        this._dogRoot.position.y = Math.sin(bu * Math.PI) * 0.02;
      }
    }
  }

  _updateIntroAnim(dt) {
    if (!this._introPlaying) return;
    let allDone = true;
    let justLanded = false;
    for (const a of this._introAnims) {
      if (a.done) continue;
      if (a.delay > 0) { a.delay -= dt; allDone = false; continue; }
      a.t += dt;
      const p = Math.min(a.t / a.dur, 1);
      const ease = 1 - (1 - p) * (1 - p);
      a.mesh.scale.setScalar(a.targetScale * ease);
      a.mesh.position.y = a.targetY + 0.6 * (1 - ease);
      if (p >= 1) {
        a.done = true;
        a.mesh.scale.setScalar(a.targetScale);
        a.mesh.position.y = a.targetY;
        justLanded = true;
      } else {
        allDone = false;
      }
    }
    if (justLanded && this._onIntroTick) this._onIntroTick();
    if (allDone) this._introPlaying = false;
  }
}
