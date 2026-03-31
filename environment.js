/**
 * Restaurant room mesh, warm lighting, and atmospheric fog.
 * Visual style: cozy brick-walled burger joint with string lights, dark wood, and warm glow.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM, ZONES, halfWidthAtZ, xLeftAtZ, xRightAtZ } from './roomConstants.js';
import { getRenderProfile } from './renderQuality.js';

const COLORS = {
  floorPlayer: 0x3d2c1e,
  floorCounter: 0x4a3524,
  floorCustomers: 0x34292a,
  walls: 0x6b3a2e,
  counterTop: 0x7a4f2e,
  counterFront: 0x3e2a1c,
};

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

function brickWallMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x7a3b2a,
    roughness: 0.94,
    metalness: 0.02,
    emissive: 0x1a0c08,
    emissiveIntensity: 0.06,
  });
}

function darkWoodMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x3e2a1c,
    roughness: 0.86,
    metalness: 0.06,
    emissive: 0x120908,
    emissiveIntensity: 0.04,
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
      color: 0x3c2e26,
      roughness: 0.55,
      metalness: 0.12,
    });
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

function createStringLights(group, y, zStart, zEnd, xOffset, count) {
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
  const wireGeo = new THREE.CylinderGeometry(0.012, 0.012, Math.abs(zEnd - zStart), 4);
  wireGeo.rotateX(Math.PI / 2);
  const wire = new THREE.Mesh(wireGeo, wireMat);
  wire.position.set(xOffset, y, (zStart + zEnd) / 2);
  group.add(wire);

  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a0,
    emissive: 0xffcc44,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.0,
    transparent: true,
    opacity: 0.95,
  });

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(xOffset, y - 0.08, z);
    bulb.scale.setScalar(0.8 + Math.sin(i * 1.7) * 0.15);
    group.add(bulb);

    const glow = new THREE.PointLight(0xffcc55, 0.12, 3.0, 2);
    glow.position.copy(bulb.position);
    group.add(glow);
  }
}

/**
 * Trapezoidal room: merged floor, windowed walls, counter, back door.
 * @returns {{ group: THREE.Group, backDoor: BackDoor }}
 */
export function buildRestaurantRoom() {
  const group = new THREE.Group();
  group.name = 'RestaurantRoom';

  const wallMat = brickWallMat();

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
    addWallMesh(group, wallMat, 'WallLeft_Lower',
      new Float32Array([xl0, 0, z0w, xl0, WIN_Y0, z0w, xl1, WIN_Y0, z1w, xl1, 0, z1w]),
      [0, 1, 2, 0, 2, 3]);
    addWallMesh(group, wallMat, 'WallLeft_Upper',
      new Float32Array([xl0, WIN_Y1, z0w, xl0, h, z0w, xl1, h, z1w, xl1, WIN_Y1, z1w]),
      [0, 1, 2, 0, 2, 3]);
  }
  {
    const z0w = ROOM.zFront;
    const z1w = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xr0 = xRightAtZ(z0w);
    const xr1 = xRightAtZ(z1w);
    addWallMesh(group, wallMat, 'WallRight_Lower',
      new Float32Array([xr0, 0, z0w, xr0, WIN_Y0, z0w, xr1, WIN_Y0, z1w, xr1, 0, z1w]),
      [0, 2, 1, 0, 3, 2]);
    addWallMesh(group, wallMat, 'WallRight_Upper',
      new Float32Array([xr0, WIN_Y1, z0w, xr0, h, z0w, xr1, h, z1w, xr1, WIN_Y1, z1w]),
      [0, 2, 1, 0, 3, 2]);
  }
  {
    const z = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xl = xLeftAtZ(z);
    const xr = xRightAtZ(z);
    const xm0 = -1.12;
    const xm1 = 1.12;
    addWallMesh(group, wallMat, 'WallBack_LeftLower',
      new Float32Array([xl, 0, z, xl, WIN_Y0, z, xm0, WIN_Y0, z, xm0, 0, z]),
      [0, 1, 2, 0, 2, 3]);
    addWallMesh(group, wallMat, 'WallBack_LeftUpper',
      new Float32Array([xl, WIN_Y1, z, xl, h, z, xm0, h, z, xm0, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3]);
    addWallMesh(group, wallMat, 'WallBack_RightLower',
      new Float32Array([xm1, 0, z, xm1, WIN_Y0, z, xr, WIN_Y0, z, xr, 0, z]),
      [0, 1, 2, 0, 2, 3]);
    addWallMesh(group, wallMat, 'WallBack_RightUpper',
      new Float32Array([xm1, WIN_Y1, z, xm1, h, z, xr, h, z, xr, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3]);
    addWallMesh(group, wallMat, 'WallBack_Lintel',
      new Float32Array([xm0, WIN_Y1, z, xm0, h, z, xm1, h, z, xm1, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3]);
  }

  const backDoor = new BackDoor();
  group.add(backDoor.group);

  /* --- Counter --- */
  {
    const zPlane = ZONES.counterToCustomers + 0.32;
    const halfW = halfWidthAtZ(zPlane) * 0.92;
    const counterDepth = 0.55;
    const counterHeight = 1.05;
    const baseY = 0;
    const zCenter = zPlane + counterDepth / 2 - 0.08;

    const bodyGeo = new THREE.BoxGeometry(halfW * 2, counterHeight, counterDepth);
    const bodyMat = darkWoodMat();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, baseY + counterHeight / 2, zCenter);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'CounterBody';
    group.add(body);

    const topGeo = new THREE.BoxGeometry(halfW * 2 + 0.15, 0.08, counterDepth + 0.2);
    const topMat = standardMat({
      color: COLORS.counterTop,
      roughness: 0.38,
      metalness: 0.12,
      emissive: 0x2a1808,
      emissiveIntensity: 0.06,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, baseY + counterHeight + 0.04, zCenter);
    top.castShadow = true;
    top.receiveShadow = true;
    top.name = 'CounterTop';
    group.add(top);

    const trimGeo = new THREE.BoxGeometry(halfW * 2 + 0.12, 0.06, 0.04);
    const trimMat = standardMat({
      color: 0x594030,
      roughness: 0.58,
      metalness: 0.14,
      emissive: 0x1a0f08,
      emissiveIntensity: 0.04,
    });
    const trimFront = new THREE.Mesh(trimGeo, trimMat);
    trimFront.position.set(0, baseY + counterHeight * 0.5, zCenter + counterDepth / 2 + 0.02);
    trimFront.castShadow = true;
    group.add(trimFront);

    const trimBottom = new THREE.Mesh(trimGeo, trimMat);
    trimBottom.position.set(0, baseY + 0.03, zCenter + counterDepth / 2 + 0.02);
    trimBottom.castShadow = true;
    group.add(trimBottom);
  }

  /* --- String lights: above counter, along back wall area --- */
  const counterZ = ZONES.counterToCustomers + 0.32 + 0.55 / 2 - 0.08;
  createStringLights(group, 2.1, ROOM.zFront - 0.3, counterZ + 0.8, 0, 12);
  createStringLights(group, 0.68, 2.8, counterZ + 1.0, -0.8, 6);
  createStringLights(group, 0.68, 2.8, counterZ + 1.0, 0.8, 6);

  return { group, backDoor };
}

/**
 * Warm interior fog + background — darker lounge mood.
 * @param {THREE.Scene} scene
 */
export function applyAtmosphere(scene) {
  scene.background = new THREE.Color(0x1e1210);
  scene.fog = new THREE.Fog(0x2a1a14, 12, 32);
}

/**
 * Hemisphere + key + fills. Shadow map size follows render profile.
 * @param {THREE.Scene} scene
 */
export function createRestaurantLights(scene) {
  const { shadowMapSize } = getRenderProfile();

  const hemi = new THREE.HemisphereLight(0xffd8b0, 0x3a2218, 0.36);
  hemi.name = 'HemisphereLight';
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe0b8, 1.0);
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

  const fill = new THREE.PointLight(0xffb070, 0.72, 22, 2);
  fill.name = 'WarmFill';
  fill.position.set(0.6, 3.2, 1.2);
  scene.add(fill);

  const counterGlow = new THREE.PointLight(0xffc85a, 0.56, 14, 2);
  counterGlow.name = 'CounterGlow';
  counterGlow.position.set(0, 2.0, 0.8);
  scene.add(counterGlow);

  const backWarm = new THREE.PointLight(0xff9050, 0.32, 16, 2);
  backWarm.name = 'BackWarm';
  backWarm.position.set(0, 2.6, -2.8);
  scene.add(backWarm);

  const frontAmbient = new THREE.PointLight(0xffcc80, 0.2, 10, 2);
  frontAmbient.name = 'FrontAmbient';
  frontAmbient.position.set(0, 1.4, 3.0);
  scene.add(frontAmbient);

  return { hemi, key, fill };
}
