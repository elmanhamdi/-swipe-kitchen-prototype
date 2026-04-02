/**
 * 3D ingredient piles + trash can; raycast pick helper.
 */

import * as THREE from 'three';
import { createIngredientMesh } from './burgerVisuals.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

const PILE_SCALE = 0.38 * 3;
const PILE_LAYER_Y = 0.06 * 3;
const TRASH_SHAKE_DURATION = 0.34;

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
    if (o.userData?.isTrash) return { kind: 'trash', root: o };
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
    this._trashShakeT = 0;
    this._trashLid = null;
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
    this._addIngredientPile('lettuce', -1.5, 0.5, pileY);
    this._addIngredientPile('tomato', -1.7, 1.5, pileY);

    this._addIngredientPile('cheese', 1.7, 1.5, pileY);
    this._addIngredientPile('meat', 1.4, -0.8, pileY);
    this._addIngredientPile('bun', 1.5, 0.5, pileY);

    this._introAnims = [];
    this._introPlaying = false;
    this._onIntroTick = null;

    const trashMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d89,
      roughness: 0.66,
      metalness: 0.28,
      emissive: 0x102a33,
      emissiveIntensity: 0.12,
    });
    const trashX = -1.3;
    const trashZ = 2.75;
    const trashRoot = new THREE.Group();
    trashRoot.position.set(trashX, 0, trashZ);
    this.group.add(trashRoot);

    const trash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * 2, 0.26 * 2, 0.42 * 2, 16),
      trashMat,
    );
    trash.position.set(0, 0.27 * 2, 0);
    trash.castShadow = true;
    trash.receiveShadow = true;
    trash.userData.isTrash = true;
    trashRoot.add(trash);
    this._meshes.push(trash);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.44 * 2 + 0.02, 0);
    trashRoot.add(lidPivot);
    this._trashLid = lidPivot;

    const lidCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.215 * 2, 0.215 * 2, 0.03 * 2, 18),
      trashMat,
    );
    lidCap.position.set(0, 0.01, 0);
    lidCap.castShadow = true;
    lidCap.receiveShadow = true;
    lidCap.userData.isTrash = true;
    lidPivot.add(lidCap);
    this._meshes.push(lidCap);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.22 * 2, 0.028 * 2, 8, 22),
      trashMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.02, 0);
    rim.userData.isTrash = true;
    lidPivot.add(rim);
    this._meshes.push(rim);

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

  triggerTrashShake() {
    this._trashShakeT = TRASH_SHAKE_DURATION;
  }

  resetTransientState() {
    this._trashShakeT = 0;
    if (this._trashLid) {
      this._trashLid.rotation.set(0, 0, 0);
      this._trashLid.position.y = 0.44 * 2 + 0.02;
    }
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
   * @returns {{ trash?: boolean, ingredient?: string, openShop?: boolean, origin?: THREE.Vector3 } | null}
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
    if (info.kind === 'trash') return { trash: true };
    if (info.kind === 'ingredient') {
      const origin = new THREE.Vector3();
      info.root.getWorldPosition(origin);
      return { ingredient: info.type, origin };
    }
    return null;
  }

  update(dt) {
    this._updateIntroAnim(dt);

    if (!this._trashLid) return;
    if (this._trashShakeT <= 0 || dt <= 0) {
      this._trashLid.rotation.x = 0;
      this._trashLid.rotation.z = 0;
      this._trashLid.position.y = 0.44 * 2 + 0.02;
      return;
    }
    this._trashShakeT = Math.max(0, this._trashShakeT - dt);
    const u = 1 - this._trashShakeT / TRASH_SHAKE_DURATION;
    const decay = 1 - u;
    const wobble = Math.sin(u * Math.PI * 8) * 0.2 * decay;
    this._trashLid.rotation.x = wobble * 0.35;
    this._trashLid.rotation.z = wobble;
    this._trashLid.position.y = 0.44 * 2 + 0.02 + Math.abs(wobble) * 0.02;
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
