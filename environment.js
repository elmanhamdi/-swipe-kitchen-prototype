/**
 * Restaurant room mesh, warm lighting, and atmospheric fog.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM, ZONES, halfWidthAtZ, xLeftAtZ, xRightAtZ } from './roomConstants.js';
import { getRenderProfile } from './renderQuality.js';

const COLORS = {
  floorPlayer: 0x3f4a38,
  floorCounter: 0x4f4840,
  floorCustomers: 0x3e4552,
  walls: 0xe8ddd2,
  counterTop: 0x725340,
  counterFront: 0x5c4638,
};

/**
 * Builds one floor strip between zNear (closer to player, larger Z) and zFar.
 */
function createFloorStripGeometry(zNear, zFar) {
  const xl0 = xLeftAtZ(zNear);
  const xr0 = xRightAtZ(zNear);
  const xl1 = xLeftAtZ(zFar);
  const xr1 = xRightAtZ(zFar);

  const positions = new Float32Array([
    xl0, 0, zNear,
    xr0, 0, zNear,
    xr1, 0, zFar,
    xl1, 0, zFar,
  ]);
  const indices = [0, 1, 2, 0, 2, 3];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function standardMat(opts) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.82,
    metalness: 0.04,
    ...opts,
  });
}

function addWallMesh(group, wallMat, name, positions, index) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, wallMat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = name;
  group.add(mesh);
}

const WIN_Y0 = 1.08;
const WIN_Y1 = 2.72;

/** Double sliding panels at back wall (customer entrance). */
export class BackDoor {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'BackDoor';
    const frameMat = standardMat({
      color: 0x5c5348,
      roughness: 0.55,
      metalness: 0.12,
    });
    /** Each leaf ~2× wider than original. */
    this._panelW = 1.04;
    const panelW = this._panelW;
    const panelH = 2.38;
    const panelD = 0.07;
    this.leftPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelD), frameMat);
    this.rightPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelD), frameMat);
    this.leftPanel.castShadow = true;
    this.rightPanel.castShadow = true;
    const halfGap = 0.02;
    this._closedLeftX = -panelW / 2 - halfGap;
    this._closedRightX = panelW / 2 + halfGap;
    this.leftPanel.position.set(this._closedLeftX, panelH / 2 + 0.02, 0);
    this.rightPanel.position.set(this._closedRightX, panelH / 2 + 0.02, 0);
    this.group.add(this.leftPanel, this.rightPanel);
    this.group.position.set(0, 0, ROOM.zBack + 0.07);
    this._open = 0;
  }

  /** @param {number} u 0 closed — 1 open */
  setOpen(u) {
    this._open = THREE.MathUtils.clamp(u, 0, 1);
    const slide = this._open * 0.88;
    this.leftPanel.position.x = this._closedLeftX - slide;
    this.rightPanel.position.x = this._closedRightX + slide;
  }
}

/**
 * Trapezoidal room: merged floor, windowed walls, counter, back door.
 * @returns {{ group: THREE.Group, backDoor: BackDoor }}
 */
export function buildRestaurantRoom() {
  const group = new THREE.Group();
  group.name = 'RestaurantRoom';

  const wallMat = standardMat({
    color: COLORS.walls,
    roughness: 0.88,
    metalness: 0.02,
  });

  const floorMats = [
    standardMat({ color: COLORS.floorPlayer, roughness: 0.94, metalness: 0 }),
    standardMat({ color: COLORS.floorCounter, roughness: 0.92, metalness: 0 }),
    standardMat({ color: COLORS.floorCustomers, roughness: 0.92, metalness: 0 }),
  ];

  const z0 = ROOM.zFront;
  const z1 = ZONES.playerToCounter;
  const z2 = ZONES.counterToCustomers;
  const z3 = ROOM.zBack;

  const floorGeos = [
    createFloorStripGeometry(z0, z1),
    createFloorStripGeometry(z1, z2),
    createFloorStripGeometry(z2, z3),
  ];

  const mergedFloor = mergeGeometries(floorGeos, true);
  if (mergedFloor) {
    const floorMesh = new THREE.Mesh(mergedFloor, floorMats);
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = false;
    floorMesh.name = 'FloorMerged';
    group.add(floorMesh);
    floorGeos.forEach((g) => g.dispose());
  } else {
    [
      [z0, z1, 0],
      [z1, z2, 1],
      [z2, z3, 2],
    ].forEach(([zn, zf, matIndex]) => {
      const geo = createFloorStripGeometry(zn, zf);
      const mesh = new THREE.Mesh(geo, floorMats[matIndex]);
      mesh.receiveShadow = true;
      mesh.name = `FloorZone_${matIndex}`;
      group.add(mesh);
    });
    floorGeos.forEach((g) => g.dispose());
  }

  {
    const z0w = ROOM.zFront;
    const z1w = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xl0 = xLeftAtZ(z0w);
    const xl1 = xLeftAtZ(z1w);
    addWallMesh(
      group,
      wallMat,
      'WallLeft_Lower',
      new Float32Array([
        xl0, 0, z0w,
        xl0, WIN_Y0, z0w,
        xl1, WIN_Y0, z1w,
        xl1, 0, z1w,
      ]),
      [0, 1, 2, 0, 2, 3],
    );
    addWallMesh(
      group,
      wallMat,
      'WallLeft_Upper',
      new Float32Array([
        xl0, WIN_Y1, z0w,
        xl0, h, z0w,
        xl1, h, z1w,
        xl1, WIN_Y1, z1w,
      ]),
      [0, 1, 2, 0, 2, 3],
    );
  }
  {
    const z0w = ROOM.zFront;
    const z1w = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xr0 = xRightAtZ(z0w);
    const xr1 = xRightAtZ(z1w);
    addWallMesh(
      group,
      wallMat,
      'WallRight_Lower',
      new Float32Array([
        xr0, 0, z0w,
        xr0, WIN_Y0, z0w,
        xr1, WIN_Y0, z1w,
        xr1, 0, z1w,
      ]),
      [0, 2, 1, 0, 3, 2],
    );
    addWallMesh(
      group,
      wallMat,
      'WallRight_Upper',
      new Float32Array([
        xr0, WIN_Y1, z0w,
        xr0, h, z0w,
        xr1, h, z1w,
        xr1, WIN_Y1, z1w,
      ]),
      [0, 2, 1, 0, 3, 2],
    );
  }
  {
    const z = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xl = xLeftAtZ(z);
    const xr = xRightAtZ(z);
    /* Door opening ~2× wider to match double doors */
    const xm0 = -1.12;
    const xm1 = 1.12;
    addWallMesh(
      group,
      wallMat,
      'WallBack_LeftLower',
      new Float32Array([xl, 0, z, xl, WIN_Y0, z, xm0, WIN_Y0, z, xm0, 0, z]),
      [0, 1, 2, 0, 2, 3],
    );
    addWallMesh(
      group,
      wallMat,
      'WallBack_LeftUpper',
      new Float32Array([xl, WIN_Y1, z, xl, h, z, xm0, h, z, xm0, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3],
    );
    addWallMesh(
      group,
      wallMat,
      'WallBack_RightLower',
      new Float32Array([xm1, 0, z, xm1, WIN_Y0, z, xr, WIN_Y0, z, xr, 0, z]),
      [0, 1, 2, 0, 2, 3],
    );
    addWallMesh(
      group,
      wallMat,
      'WallBack_RightUpper',
      new Float32Array([xm1, WIN_Y1, z, xm1, h, z, xr, h, z, xr, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3],
    );
    addWallMesh(
      group,
      wallMat,
      'WallBack_Lintel',
      new Float32Array([xm0, WIN_Y1, z, xm0, h, z, xm1, h, z, xm1, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3],
    );
  }

  const backDoor = new BackDoor();
  group.add(backDoor.group);

  {
    const zPlane = ZONES.counterToCustomers + 0.32;
    const halfW = halfWidthAtZ(zPlane) * 0.92;
    const counterDepth = 0.55;
    const counterHeight = 1.05;
    const baseY = 0;
    const zCenter = zPlane + counterDepth / 2 - 0.08;

    const bodyGeo = new THREE.BoxGeometry(halfW * 2, counterHeight, counterDepth);
    const bodyMat = standardMat({
      color: COLORS.counterFront,
      roughness: 0.76,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, baseY + counterHeight / 2, zCenter);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'CounterBody';
    group.add(body);

    const topGeo = new THREE.BoxGeometry(halfW * 2 + 0.15, 0.08, counterDepth + 0.2);
    const topMat = standardMat({
      color: COLORS.counterTop,
      roughness: 0.42,
      metalness: 0.18,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, baseY + counterHeight + 0.04, zCenter);
    top.castShadow = true;
    top.receiveShadow = true;
    top.name = 'CounterTop';
    group.add(top);
  }

  return { group, backDoor };
}

/**
 * Warm interior fog + background.
 * @param {THREE.Scene} scene
 */
export function applyAtmosphere(scene) {
  scene.background = new THREE.Color(0x2c2622);
  scene.fog = new THREE.Fog(0x3a322c, 14, 38);
}

/**
 * Hemisphere + key + subtle warm fill. Shadow map size follows render profile.
 * @param {THREE.Scene} scene
 * @returns {{ hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; fill: THREE.PointLight }}
 */
export function createRestaurantLights(scene) {
  const { shadowMapSize } = getRenderProfile();

  const hemi = new THREE.HemisphereLight(0xffebd4, 0x4a3d36, 0.52);
  hemi.name = 'HemisphereLight';
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffecd8, 1.12);
  key.name = 'KeyLight';
  key.position.set(-5.5, 13.5, 7.2);
  key.castShadow = true;
  key.shadow.mapSize.width = shadowMapSize;
  key.shadow.mapSize.height = shadowMapSize;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 42;
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 13;
  key.shadow.camera.bottom = -13;
  key.shadow.bias = -0.00028;
  key.shadow.normalBias = 0.045;
  key.shadow.radius = shadowMapSize >= 2048 ? 3.2 : 2.4;
  scene.add(key);

  const fill = new THREE.PointLight(0xffb878, 0.38, 22, 2);
  fill.name = 'WarmFill';
  fill.position.set(0.8, 3.4, 0.5);
  scene.add(fill);

  return { hemi, key, fill };
}
