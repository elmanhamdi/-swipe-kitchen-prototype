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

function findPickRoot(obj) {
  let o = obj;
  while (o) {
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

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x6a5a4e,
      roughness: 0.78,
      metalness: 0.06,
    });

    const leftShelf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.75), shelfMat);
    leftShelf.position.set(-1.82, 0.88, -0.1);
    leftShelf.castShadow = true;
    leftShelf.receiveShadow = true;
    this.group.add(leftShelf);

    const rightShelf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.75), shelfMat);
    rightShelf.position.set(1.82, 0.88, -0.1);
    rightShelf.castShadow = true;
    rightShelf.receiveShadow = true;
    this.group.add(rightShelf);

    this._addIngredientPile('lettuce', -1.88, 0.5);
    this._addIngredientPile('tomato', -1.88, -0.5);

    this._addIngredientPile('cheese', 1.88, 1.1);
    this._addIngredientPile('meat', 1.88, -0);
    this._addIngredientPile('bun', 1.88, -1.1);

    const trashMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.88,
      metalness: 0.25,
    });
    const trash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * 2, 0.26 * 2, 0.42 * 2, 16),
      trashMat,
    );
    const trashZ = 4.2;
    const trashX = 0;
    trash.position.set(trashX, 0.27 * 2, trashZ);
    trash.castShadow = true;
    trash.receiveShadow = true;
    trash.userData.isTrash = true;
    this.group.add(trash);
    this._meshes.push(trash);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.22 * 2, 0.028 * 2, 8, 22),
      trashMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(trashX, 0.44 * 2, trashZ);
    rim.userData.isTrash = true;
    this.group.add(rim);
    this._meshes.push(rim);

    const openGroup = new THREE.Group();
    openGroup.userData.openShop = true;
    const openMat = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.45,
      metalness: 0.12,
      emissive: 0x332208,
      emissiveIntensity: 0.2,
    });
    const boardW = 1.95;
    const boardH = 0.98;
    const boardD = 0.16;
    const openBoard = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, boardD), openMat);
    openBoard.castShadow = true;
    openBoard.receiveShadow = true;
    openBoard.userData.openShop = true;
    openGroup.add(openBoard);
    const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8);
    const leg1 = new THREE.Mesh(legGeo, shelfMat);
    leg1.position.set(-0.72, -0.58, 0);
    leg1.userData.openShop = true;
    const leg2 = new THREE.Mesh(legGeo, shelfMat);
    leg2.position.set(0.72, -0.58, 0);
    leg2.userData.openShop = true;
    openGroup.add(leg1, leg2);
    openGroup.position.set(0, 1.02, ROOM.zBack + 0.58);
    openGroup.scale.setScalar(1.15);
    scene.add(openGroup);
    this._openGroup = openGroup;
    openGroup.traverse((ch) => {
      if (ch instanceof THREE.Mesh) this._meshes.push(ch);
    });

    const textMat = new THREE.MeshStandardMaterial({
      color: 0x2a1810,
      roughness: 0.35,
      metalness: 0.08,
      emissive: 0x221008,
      emissiveIntensity: 0.08,
    });
    const loader = new FontLoader();
    loader.load(
      FONT_URL,
      (font) => {
        const geo = new TextGeometry('OPEN', {
          font,
          size: 0.34,
          depth: 0.01,
          curveSegments: 8,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.015,
          bevelSegments: 2,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb) {
          const cx = -(bb.max.x + bb.min.x) / 2;
          const cy = -(bb.max.y + bb.min.y) / 2;
          geo.translate(cx, cy, 0);
        }
        const textMesh = new THREE.Mesh(geo, textMat);
        textMesh.userData.openShop = true;
        textMesh.position.set(0, 0.06, boardD / 2 + 0.12);
        textMesh.castShadow = true;
        openGroup.add(textMesh);
        this._meshes.push(textMesh);
      },
      undefined,
      () => {
        /* font load failed — board still works */
      },
    );
  }

  /** Hide the 3D Open prop after the shop starts (show again on reset). */
  setShopOpened(opened) {
    if (this._openGroup) this._openGroup.visible = !opened;
  }

  /**
   * @param {string} pickKey `bun` | ingredient id
   * @param {number} lx
   * @param {number} lz
   */
  _addIngredientPile(pickKey, lx, lz) {
    const g = new THREE.Group();
    g.userData.pickIngredient = pickKey;
    const visualType = pickKey === 'bun' ? 'bun_bottom' : pickKey;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const m = createIngredientMesh(visualType);
      m.scale.setScalar(PILE_SCALE);
      m.position.y = i * PILE_LAYER_Y;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      this._meshes.push(m);
    }
    g.position.set(lx, 0.98, lz);
    this.group.add(g);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Camera} camera
   * @param {HTMLElement} domElement
   * @returns {{ trash?: boolean, ingredient?: string, openShop?: boolean } | null}
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
    if (info.kind === 'trash') return { trash: true };
    if (info.kind === 'ingredient') return { ingredient: info.type };
    return null;
  }
}
