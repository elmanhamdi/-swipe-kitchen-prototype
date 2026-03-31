/**
 * 3D ingredient piles + trash can + Open shop button; raycast pick helper.
 */

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { createIngredientMesh } from './burgerVisuals.js';
import { ROOM } from './roomConstants.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

const FONT_URL = 'https://unpkg.com/three@0.169.0/examples/fonts/helvetiker_bold.typeface.json';

const PILE_SCALE = 0.38 * 3;
const PILE_LAYER_Y = 0.065 * 3;
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
      return 0x8a5737;
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
    this._trashShakeT = 0;
    this._trashLid = null;

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x865b41,
      roughness: 0.62,
      metalness: 0.08,
      emissive: 0x2a140b,
      emissiveIntensity: 0.08,
    });

    const woodTableMat = new THREE.MeshStandardMaterial({
      color: 0x6e4a2a,
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

    const pileY = tableH + tableTopThick / 2 + 0.08;
    this._addIngredientPile('lettuce', -1.5, 0.6, pileY);
    this._addIngredientPile('tomato', -1.7, 1.5, pileY);

    this._addIngredientPile('cheese', 1.7, 1.5, pileY);
    this._addIngredientPile('meat', 1.3, -0.5, pileY);
    this._addIngredientPile('bun', 1.5, 0.6, pileY);

    const trashMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d89,
      roughness: 0.66,
      metalness: 0.28,
      emissive: 0x102a33,
      emissiveIntensity: 0.12,
    });
    const trashX = -2.95;
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

    const openGroup = new THREE.Group();
    openGroup.userData.openShop = true;

    const boardW = 2.1;
    const boardH = 1.12;
    const boardD = 0.14;

    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x1a1424,
      roughness: 0.92,
      metalness: 0.04,
      emissive: 0x0a0612,
      emissiveIntensity: 0.05,
    });
    const openBoard = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, boardD), boardMat);
    openBoard.castShadow = true;
    openBoard.receiveShadow = true;
    openBoard.userData.openShop = true;
    openGroup.add(openBoard);

    const neonFrameMat = new THREE.MeshStandardMaterial({
      color: 0x22aaff,
      emissive: 0x22aaff,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
    });
    const frameInset = 0.06;
    const frameDepth = 0.04;
    const fW = boardW - frameInset * 2;
    const fH = boardH - frameInset * 2;
    const tubeR = 0.022;
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(fW, tubeR * 2, frameDepth), neonFrameMat);
    topBar.position.set(0, fH / 2, boardD / 2 + 0.01);
    topBar.userData.openShop = true;
    openGroup.add(topBar);
    const botBar = topBar.clone();
    botBar.position.y = -fH / 2;
    botBar.userData.openShop = true;
    openGroup.add(botBar);
    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(tubeR * 2, fH, frameDepth), neonFrameMat);
    leftBar.position.set(-fW / 2, 0, boardD / 2 + 0.01);
    leftBar.userData.openShop = true;
    openGroup.add(leftBar);
    const rightBar = leftBar.clone();
    rightBar.position.x = fW / 2;
    rightBar.userData.openShop = true;
    openGroup.add(rightBar);

    const neonGlow = new THREE.PointLight(0x44bbff, 0.42, 4.5, 2);
    neonGlow.position.set(0, 0, boardD / 2 + 0.3);
    openGroup.add(neonGlow);

    const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8);
    const leg1 = new THREE.Mesh(legGeo, shelfMat);
    leg1.position.set(-0.78, -0.62, 0);
    leg1.userData.openShop = true;
    const leg2 = new THREE.Mesh(legGeo, shelfMat);
    leg2.position.set(0.78, -0.62, 0);
    leg2.userData.openShop = true;
    openGroup.add(leg1, leg2);
    openGroup.position.set(0, 1.06, ROOM.zBack + 0.58);
    openGroup.scale.setScalar(1.15);
    scene.add(openGroup);
    this._openGroup = openGroup;
    openGroup.traverse((ch) => {
      if (ch instanceof THREE.Mesh) this._meshes.push(ch);
    });

    const burgerTextMat = new THREE.MeshStandardMaterial({
      color: 0xffc832,
      emissive: 0xffaa22,
      emissiveIntensity: 1.2,
      roughness: 0.18,
      metalness: 0.0,
    });
    const openTextMat = new THREE.MeshStandardMaterial({
      color: 0xffe8c0,
      emissive: 0xffcc44,
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.0,
    });
    const loader = new FontLoader();
    loader.load(
      FONT_URL,
      (font) => {
        const burgerGeo = new TextGeometry('BURGER', {
          font,
          size: 0.22,
          depth: 0.002,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.015,
          bevelSize: 0.012,
          bevelSegments: 2,
        });
        burgerGeo.computeBoundingBox();
        const bbb = burgerGeo.boundingBox;
        if (bbb) burgerGeo.translate(-(bbb.max.x + bbb.min.x) / 2, -(bbb.max.y + bbb.min.y) / 2, 0);
        const burgerMesh = new THREE.Mesh(burgerGeo, burgerTextMat);
        burgerMesh.userData.openShop = true;
        burgerMesh.position.set(0, 0.18, boardD / 2 + 0.08);
        openGroup.add(burgerMesh);
        this._meshes.push(burgerMesh);

        const openGeo = new TextGeometry('OPEN', {
          font,
          size: 0.2,
          depth: 0.002,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.015,
          bevelSize: 0.01,
          bevelSegments: 2,
        });
        openGeo.computeBoundingBox();
        const obb = openGeo.boundingBox;
        if (obb) openGeo.translate(-(obb.max.x + obb.min.x) / 2, -(obb.max.y + obb.min.y) / 2, 0);
        const openMesh = new THREE.Mesh(openGeo, openTextMat);
        openMesh.userData.openShop = true;
        openMesh.position.set(0, -0.14, boardD / 2 + 0.08);
        openGroup.add(openMesh);
        this._meshes.push(openMesh);
      },
      undefined,
      () => {
        /* font load failed — board still works */
      },
    );
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

  /** Hide the 3D Open prop after the shop starts (show again on reset). */
  setShopOpened(opened) {
    if (this._openGroup) this._openGroup.visible = !opened;
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
      m.scale.setScalar(PILE_SCALE);
      m.position.y = 0.05 + i * PILE_LAYER_Y;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      this._meshes.push(m);
    }
    g.position.set(lx, ly, lz);
    this.group.add(g);
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
    const info = findPickRoot(hits[0].object);
    if (!info) return null;
    if (info.kind === 'open') return { openShop: true };
    if (info.kind === 'grillPatty') return { grillPatty: true };
    if (info.kind === 'trash') return { trash: true };
    if (info.kind === 'ingredient') {
      const origin = new THREE.Vector3();
      info.root.getWorldPosition(origin);
      return { ingredient: info.type, origin };
    }
    return null;
  }

  update(dt) {
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
}
