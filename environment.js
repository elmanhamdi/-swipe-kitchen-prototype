/**
 * Restaurant room mesh, warm lighting, and atmospheric fog.
 * Visual style: cozy brick-walled burger joint with string lights, dark wood, and warm glow.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM, ZONES, halfWidthAtZ, xLeftAtZ, xRightAtZ } from './roomConstants.js';
import { getRenderProfile } from './renderQuality.js';

const COLORS = {
  floorPlayer: 0x9e8874,
  floorCounter: 0x907c6c,
  floorCustomers: 0x807070,
  walls: 0x8b5a4e,
  counterTop: 0x9a6f4e,
  counterFront: 0x5e4a3c,
};

/* ── Cartoon tile texture (procedural, canvas-based) ───────────────── */

const TILE_WORLD = 0.75;
const TILE_GRID = 4;
const TEX_SPAN = TILE_WORLD * TILE_GRID;

function _clamp01(v) { return Math.min(1, Math.max(0, v)); }

function _rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function createCartoonTileTexture(baseHex, checker = false) {
  const S = 512, G = TILE_GRID, GW = 10;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  const base = new THREE.Color(baseHex);
  const grout = base.clone().multiplyScalar(0.25);

  ctx.fillStyle = '#' + grout.getHexString();
  ctx.fillRect(0, 0, S, S);

  const tw = S / G;
  const hg = GW / 2;

  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const tx = c * tw + hg;
      const ty = r * tw + hg;
      const w = tw - GW;
      const h = tw - GW;

      const col = base.clone();
      const seed = (r * 7 + c * 13) % 5;
      const v = (seed - 2) * 0.025;
      col.r = _clamp01(col.r + v);
      col.g = _clamp01(col.g + v * 0.8);
      col.b = _clamp01(col.b + v * 0.6);
      if (checker && (r + c) % 2 === 1) col.multiplyScalar(0.72);

      ctx.fillStyle = '#' + col.getHexString();
      _rrPath(ctx, tx, ty, w, h, 4);
      ctx.fill();

      /* highlight: top + left inner edge */
      const hi = col.clone();
      hi.r = _clamp01(hi.r + 0.12);
      hi.g = _clamp01(hi.g + 0.1);
      hi.b = _clamp01(hi.b + 0.08);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#' + hi.getHexString();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx + 4, ty + 2);
      ctx.lineTo(tx + w - 4, ty + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx + 2, ty + 4);
      ctx.lineTo(tx + 2, ty + h - 4);
      ctx.stroke();
      ctx.restore();

      /* shadow: bottom + right inner edge */
      const sh = col.clone().multiplyScalar(0.6);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#' + sh.getHexString();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx + 4, ty + h - 2);
      ctx.lineTo(tx + w - 4, ty + h - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx + w - 2, ty + 4);
      ctx.lineTo(tx + w - 2, ty + h - 4);
      ctx.stroke();
      ctx.restore();

      /* small cartoon specular shine */
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(tx + w * 0.3, ty + h * 0.28, w * 0.2, h * 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Cartoon brick texture (procedural, canvas-based) ──────────────── */

const BRICK_COLS = 8;
const BRICK_ROWS = 14;
const BRICK_TEX_SPAN = 2.4;

function createCartoonBrickTexture(baseHex) {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  const base = new THREE.Color(baseHex);
  const mortar = base.clone().multiplyScalar(0.3);
  mortar.r = _clamp01(mortar.r + 0.02);
  mortar.g = _clamp01(mortar.g + 0.02);

  ctx.fillStyle = '#' + mortar.getHexString();
  ctx.fillRect(0, 0, S, S);

  const bw = S / BRICK_COLS;
  const bh = S / BRICK_ROWS;
  const mw = 5;

  for (let row = 0; row < BRICK_ROWS; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col <= BRICK_COLS; col++) {
      const bx = col * bw + off;
      const by = row * bh;
      const x0 = Math.max(0, bx + mw / 2);
      const x1 = Math.min(S, bx + bw - mw / 2);
      const y0 = by + mw / 2;
      const w = x1 - x0;
      const h = bh - mw;
      if (w <= 0) continue;

      const brickCol = base.clone();
      const seed = ((row * 17 + col * 11 + row * col * 3) % 9);
      const v = (seed - 4) * 0.018;
      brickCol.r = _clamp01(brickCol.r + v + Math.sin(seed * 1.7) * 0.012);
      brickCol.g = _clamp01(brickCol.g + v * 0.6);
      brickCol.b = _clamp01(brickCol.b + v * 0.4);

      ctx.fillStyle = '#' + brickCol.getHexString();
      _rrPath(ctx, x0, y0, w, h, 2);
      ctx.fill();

      const hi = brickCol.clone();
      hi.r = _clamp01(hi.r + 0.07);
      hi.g = _clamp01(hi.g + 0.05);
      hi.b = _clamp01(hi.b + 0.03);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#' + hi.getHexString();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 1);
      ctx.lineTo(x0 + w - 2, y0 + 1);
      ctx.stroke();
      ctx.restore();

      const sh = brickCol.clone().multiplyScalar(0.7);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#' + sh.getHexString();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + h - 1);
      ctx.lineTo(x0 + w - 2, y0 + h - 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ── Floor geometry with UVs ───────────────────────────────────────── */

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
  const uvs = new Float32Array([
    xl0 / TEX_SPAN, zNear / TEX_SPAN,
    xr0 / TEX_SPAN, zNear / TEX_SPAN,
    xr1 / TEX_SPAN, zFar / TEX_SPAN,
    xl1 / TEX_SPAN, zFar / TEX_SPAN,
  ]);
  const indices = [0, 1, 2, 0, 2, 3];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02,
    emissive: 0x2a1810,
    emissiveIntensity: 0.12,
    map: createCartoonBrickTexture(0xb06a55),
  });
}

function darkWoodMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x5e4a3c,
    roughness: 0.82,
    metalness: 0.06,
    emissive: 0x1a1210,
    emissiveIntensity: 0.08,
  });
}

function addWallMesh(group, wallMat, name, positions, index, uvAxis = 'z') {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const n = positions.length / 3;
  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uvs[i * 2] = (uvAxis === 'z' ? positions[i * 3 + 2] : positions[i * 3]) / BRICK_TEX_SPAN;
    uvs[i * 2 + 1] = positions[i * 3 + 1] / BRICK_TEX_SPAN;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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
    emissiveIntensity: 2.5,
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

    const glow = new THREE.PointLight(0xffcc55, 0.45, 5, 2);
    glow.position.copy(bulb.position);
    group.add(glow);
  }
}

/* ── Pendant dome lights (half-sphere hanging from ceiling) ─────────── */

function buildPendantDomeLight(x, z) {
  const g = new THREE.Group();
  g.name = 'PendantLight';
  const ceilingY = ROOM.wallHeight;
  const rodLen = 1.1;
  const metalMat = standardMat({ color: 0x5a4a3e, roughness: 0.35, metalness: 0.45 });

  const mount = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12),
    metalMat,
  );
  mount.position.y = ceilingY - 0.025;
  g.add(mount);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, rodLen, 6),
    metalMat,
  );
  rod.position.y = ceilingY - rodLen / 2;
  g.add(rod);

  const shadeY = ceilingY - rodLen - 0.02;
  const outerR = 0.38;

  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xf5e6c8,
    emissive: 0xffdd88,
    emissiveIntensity: 0.7,
    roughness: 0.4,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(outerR, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    shadeMat,
  );
  dome.rotation.x = Math.PI;
  dome.position.y = shadeY;
  dome.castShadow = true;
  g.add(dome);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(outerR, 0.02, 8, 24),
    metalMat,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = shadeY;
  g.add(rim);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d0,
    emissive: 0xffdd66,
    emissiveIntensity: 2.8,
    roughness: 0.1,
    transparent: true,
    opacity: 0.92,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat);
  bulb.position.y = shadeY - 0.06;
  g.add(bulb);

  const pendantLight = new THREE.PointLight(0xffcc55, 1.0, 7, 1.8);
  pendantLight.position.y = shadeY - 0.14;
  g.add(pendantLight);

  g.position.set(x, 0, z);
  return g;
}

/* ── Entrance wall decorations (brick pillars, arch, paintings) ────── */

function buildEntranceDecor(group) {
  const backZ = ROOM.zBack;
  const doorLeft = -1.12;
  const doorRight = 1.12;
  const woodMat = standardMat({ color: 0x6a4e36, roughness: 0.5, metalness: 0.1 });
  const brickMat = brickWallMat();

  const pillarW = 0.30;
  const pillarH = WIN_Y1 + 0.3;
  const pillarD = 0.15;

  [-1, 1].forEach(side => {
    const px = side === -1
      ? doorLeft - pillarW * 0.5 - 0.04
      : doorRight + pillarW * 0.5 + 0.04;

    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(pillarW, pillarH, pillarD),
      brickMat,
    );
    pillar.position.set(px, pillarH / 2, backZ + pillarD / 2 + 0.03);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    const capMat = standardMat({ color: 0x7a5e42, roughness: 0.45, metalness: 0.15 });
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(pillarW + 0.08, 0.08, pillarD + 0.06),
      capMat,
    );
    cap.position.set(px, pillarH, backZ + pillarD / 2 + 0.03);
    cap.castShadow = true;
    group.add(cap);

    const baseCap = new THREE.Mesh(
      new THREE.BoxGeometry(pillarW + 0.06, 0.06, pillarD + 0.04),
      capMat,
    );
    baseCap.position.set(px, 0.03, backZ + pillarD / 2 + 0.03);
    group.add(baseCap);
  });

  const archW = doorRight - doorLeft + pillarW * 2 + 0.16;
  const arch = new THREE.Mesh(
    new THREE.BoxGeometry(archW, 0.14, pillarD + 0.04),
    woodMat,
  );
  arch.position.set(0, WIN_Y1 + 0.22, backZ + pillarD / 2 + 0.02);
  arch.castShadow = true;
  group.add(arch);

  const signBoardMat = standardMat({
    color: 0x2a5a3a,
    roughness: 0.75,
    metalness: 0.02,
    emissive: 0x0a1a0a,
    emissiveIntensity: 0.05,
  });
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.35, 0.03),
    signBoardMat,
  );
  signBoard.position.set(0, WIN_Y1 + 0.58, backZ + 0.12);
  signBoard.castShadow = true;
  group.add(signBoard);

  const signFrameMat = standardMat({ color: 0x5a3e26, roughness: 0.5, metalness: 0.1 });
  [WIN_Y1 + 0.76, WIN_Y1 + 0.40].forEach(fy => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.04, 0.04),
      signFrameMat,
    );
    bar.position.set(0, fy, backZ + 0.12);
    group.add(bar);
  });
  [-0.47, 0.47].forEach(fx => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.40, 0.04),
      signFrameMat,
    );
    bar.position.set(fx, WIN_Y1 + 0.58, backZ + 0.12);
    group.add(bar);
  });

  const textMat = standardMat({
    color: 0xffe8a0,
    emissive: 0xffcc55,
    emissiveIntensity: 0.15,
    roughness: 0.6,
    metalness: 0,
  });
  const textStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.08, 0.005),
    textMat,
  );
  textStrip.position.set(0, WIN_Y1 + 0.62, backZ + 0.14);
  group.add(textStrip);

  const dot1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), textMat);
  dot1.position.set(-0.15, WIN_Y1 + 0.52, backZ + 0.14);
  group.add(dot1);
  const dot2 = dot1.clone();
  dot2.position.set(0.15, WIN_Y1 + 0.52, backZ + 0.14);
  group.add(dot2);

  const backPicSpecs = [
    { x: -3.2, y: 2.1, w: 0.52, h: 0.42 },
    { x: -2.0, y: 1.5, w: 0.40, h: 0.34 },
    { x: -3.9, y: 1.35, w: 0.36, h: 0.30 },
    { x: 3.2, y: 2.1, w: 0.52, h: 0.42 },
    { x: 2.0, y: 1.5, w: 0.40, h: 0.34 },
    { x: 3.9, y: 1.35, w: 0.36, h: 0.30 },
  ];

  backPicSpecs.forEach(({ x, y, w, h }) => {
    const pic = buildWallPicture(w, h);
    pic.position.set(x, y, backZ + 0.06);
    group.add(pic);
  });

  const entranceLight = new THREE.PointLight(0xffd090, 1.0, 8, 2);
  entranceLight.position.set(0, 2.8, backZ + 0.5);
  group.add(entranceLight);
}

/* ── Dining furniture (oval tables + chairs) ───────────────────────── */

function buildChair(woodMat, seatMat) {
  const chair = new THREE.Group();
  chair.name = 'Chair';

  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 10), seatMat);
  seat.position.y = 0.56;
  seat.castShadow = true;
  chair.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.04), woodMat);
  back.position.set(0, 0.78, -0.2);
  back.rotation.x = 0.08;
  back.castShadow = true;
  chair.add(back);

  const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 6), woodMat);
  topRail.rotation.z = Math.PI / 2;
  topRail.position.set(0, 0.98, -0.21);
  topRail.castShadow = true;
  chair.add(topRail);

  const legGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.54, 6);
  [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(lx, 0.27, lz);
    leg.castShadow = true;
    chair.add(leg);
  });

  return chair;
}

function buildOvalTableSet(x, z, rotY = 0) {
  const g = new THREE.Group();
  g.name = 'TableSet';

  const tableMat = standardMat({ color: 0x8b6b4a, roughness: 0.6, metalness: 0.06, emissive: 0x1a0e08, emissiveIntensity: 0.03 });
  const pedestalMat = standardMat({ color: 0x2a2220, roughness: 0.45, metalness: 0.3 });
  const chairWood = standardMat({ color: 0x6b4a30, roughness: 0.7, metalness: 0.05 });
  const cushionMat = standardMat({ color: 0x8b3535, roughness: 0.85, metalness: 0 });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.65, 0.06, 16), tableMat);
  top.scale.set(1.3, 1, 0.9);
  top.position.y = 0.96;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.88, 8), pedestalMat);
  ped.position.y = 0.48;
  ped.castShadow = true;
  g.add(ped);

  const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 12), pedestalMat);
  baseMesh.position.y = 0.025;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  g.add(baseMesh);

  [1, -1].forEach((side) => {
    const chair = buildChair(chairWood, cushionMat);
    chair.position.set(side * 0.95, 0, 0);
    chair.rotation.y = -side * Math.PI / 2;
    g.add(chair);
  });

  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

/* ── Wall decorations (picture frames) ─────────────────────────────── */

const FRAME_COLORS = [0x3a2a1c, 0x4a3828, 0x2c2018, 0x50382a];
const PAINTING_COLORS = [
  0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12,
  0x8e44ad, 0x16a085, 0xd35400, 0x2c3e50,
];

function buildWallPicture(w, h) {
  const g = new THREE.Group();
  g.name = 'WallPicture';

  const frameCol = FRAME_COLORS[Math.floor(Math.random() * FRAME_COLORS.length)];
  const frameMat = standardMat({ color: frameCol, roughness: 0.5, metalness: 0.12 });
  const frameD = 0.03;
  const border = 0.04;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(w + border * 2, h + border * 2, frameD),
    frameMat,
  );
  back.castShadow = true;
  g.add(back);

  const canvasCol = PAINTING_COLORS[Math.floor(Math.random() * PAINTING_COLORS.length)];
  const canvasCol2 = PAINTING_COLORS[Math.floor(Math.random() * PAINTING_COLORS.length)];
  const canvasMat = standardMat({ color: canvasCol, roughness: 0.88, metalness: 0, emissive: canvasCol, emissiveIntensity: 0.04 });
  const canvas = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.005),
    canvasMat,
  );
  canvas.position.z = frameD / 2 + 0.003;
  g.add(canvas);

  const accentMat = standardMat({ color: canvasCol2, roughness: 0.85, metalness: 0 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, h) * 0.22, 8, 6), accentMat);
  blob.scale.set(1 + Math.random() * 0.6, 0.7 + Math.random() * 0.5, 0.15);
  blob.position.set(
    (Math.random() - 0.5) * w * 0.3,
    (Math.random() - 0.5) * h * 0.2,
    frameD / 2 + 0.01,
  );
  g.add(blob);

  return g;
}

/**
 * Trapezoidal room: merged floor, windowed walls, counter, back door.
 * @returns {{ group: THREE.Group, backDoor: BackDoor, tableAabbs: Array<{min:THREE.Vector3,max:THREE.Vector3}> }}
 */
export function buildRestaurantRoom() {
  const group = new THREE.Group();
  group.name = 'RestaurantRoom';

  const wallMat = brickWallMat();

  const floorMats = [
    standardMat({ color: 0xffffff, roughness: 0.88, metalness: 0, map: createCartoonTileTexture(COLORS.floorPlayer, true) }),
    standardMat({ color: 0xffffff, roughness: 0.88, metalness: 0, map: createCartoonTileTexture(COLORS.floorCounter) }),
    standardMat({ color: 0xffffff, roughness: 0.88, metalness: 0, map: createCartoonTileTexture(COLORS.floorCustomers) }),
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
      [0, 1, 2, 0, 2, 3], 'x');
    addWallMesh(group, wallMat, 'WallBack_LeftUpper',
      new Float32Array([xl, WIN_Y1, z, xl, h, z, xm0, h, z, xm0, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3], 'x');
    addWallMesh(group, wallMat, 'WallBack_RightLower',
      new Float32Array([xm1, 0, z, xm1, WIN_Y0, z, xr, WIN_Y0, z, xr, 0, z]),
      [0, 1, 2, 0, 2, 3], 'x');
    addWallMesh(group, wallMat, 'WallBack_RightUpper',
      new Float32Array([xm1, WIN_Y1, z, xm1, h, z, xr, h, z, xr, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3], 'x');
    addWallMesh(group, wallMat, 'WallBack_Lintel',
      new Float32Array([xm0, WIN_Y1, z, xm0, h, z, xm1, h, z, xm1, WIN_Y1, z]),
      [0, 1, 2, 0, 2, 3], 'x');
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

  /* --- Wall pictures --- */
  const picY = 1.9;
  const picSpecs = [
    { z: -1.2, side: 'left', w: 0.52, h: 0.40 },
    { z: -3.4, side: 'left', w: 0.44, h: 0.56 },
    { z: -1.2, side: 'right', w: 0.44, h: 0.56 },
    { z: -3.4, side: 'right', w: 0.52, h: 0.40 },
    { z: -2.2, side: 'left', w: 0.36, h: 0.36 },
  ];
  picSpecs.forEach(({ z: pz, side, w, h }) => {
    const pic = buildWallPicture(w, h);
    const wallX = (side === 'left' ? xLeftAtZ(pz) : xRightAtZ(pz));
    const inset = side === 'left' ? 0.04 : -0.04;
    pic.position.set(wallX + inset, picY + (Math.random() - 0.5) * 0.15, pz);
    pic.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    group.add(pic);
  });

  /* --- String lights --- */
  createStringLights(group, 2.9, ROOM.zFront - 0.5, ROOM.zBack + 1.0, xLeftAtZ(-1.0) + 0.25, 7);
  createStringLights(group, 2.9, ROOM.zFront - 0.5, ROOM.zBack + 1.0, xRightAtZ(-1.0) - 0.25, 7);

  /* --- Wall sconces (warm glow lamps) --- */
  const sconceMat = standardMat({ color: 0x3a2a1e, roughness: 0.5, metalness: 0.2 });
  const sconceGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b0,
    emissive: 0xffcc55,
    emissiveIntensity: 3.5,
    roughness: 0.15,
    transparent: true,
    opacity: 0.9,
  });
  [
    { z: -0.5, side: 'left' },
    { z: -2.5, side: 'left' },
    { z: -0.5, side: 'right' },
    { z: -2.5, side: 'right' },
  ].forEach(({ z: sz, side }) => {
    const sx = (side === 'left' ? xLeftAtZ(sz) : xRightAtZ(sz));
    const inset = side === 'left' ? 0.12 : -0.12;
    const sconce = new THREE.Group();
    sconce.name = 'WallSconce';

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.14), sconceMat);
    sconce.add(arm);

    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.12, 8), sconceGlowMat);
    shade.position.z = 0.08;
    shade.position.y = -0.02;
    sconce.add(shade);

    const light = new THREE.PointLight(0xffcc55, 0.9, 6.5, 2);
    light.position.set(0, -0.05, 0.1);
    sconce.add(light);

    sconce.position.set(sx + inset, 2.1, sz);
    sconce.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    group.add(sconce);
  });

  /* --- Dining tables (customer zone sides) --- */
  const tablePositions = [
    { x: -2.9, z: -4.0, rotY: 0.15 },
    { x: 2.9, z: -4.0, rotY: -0.15 },
  ];
  const tableAabbs = [];
  const tableGroups = [];
  tablePositions.forEach(({ x, z, rotY }) => {
    const tg = buildOvalTableSet(x, z, rotY);
    group.add(tg);
    tableGroups.push(tg);
    const hw = 0.95, hd = 0.65, th = 1.02;
    tableAabbs.push({
      min: new THREE.Vector3(x - hw, 0, z - hd),
      max: new THREE.Vector3(x + hw, th, z + hd),
    });
  });

  /* --- Pendant dome lights above tables --- */
  tablePositions.forEach(({ x, z }) => {
    group.add(buildPendantDomeLight(x, z));
  });

  /* --- Entrance wall decorations --- */
  buildEntranceDecor(group);

  return { group, backDoor, tableAabbs, tableGroups };
}

/**
 * Warm interior fog + background — darker lounge mood.
 * @param {THREE.Scene} scene
 */
export function applyAtmosphere(scene) {
  scene.background = new THREE.Color(0x4e3830);
  scene.fog = new THREE.Fog(0x5a4a3a, 18, 42);
}

/**
 * Hemisphere + key + fills. Shadow map size follows render profile.
 * @param {THREE.Scene} scene
 */
export function createRestaurantLights(scene) {
  const { shadowMapSize } = getRenderProfile();

  const hemi = new THREE.HemisphereLight(0xffecd0, 0x5a3a28, 0.95);
  hemi.name = 'HemisphereLight';
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe0b8, 1.8);
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

  const fill = new THREE.PointLight(0xffb070, 1.5, 22, 2);
  fill.name = 'WarmFill';
  fill.position.set(0.6, 3.2, 1.2);
  scene.add(fill);

  const counterGlow = new THREE.PointLight(0xffc85a, 1.3, 14, 2);
  counterGlow.name = 'CounterGlow';
  counterGlow.position.set(0, 2.0, 0.8);
  scene.add(counterGlow);

  const backWarm = new THREE.PointLight(0xff9050, 0.6, 16, 2);
  backWarm.name = 'BackWarm';
  backWarm.position.set(0, 2.6, -2.8);
  scene.add(backWarm);

  const frontAmbient = new THREE.PointLight(0xffcc80, 1.0, 14, 2);
  frontAmbient.name = 'FrontAmbient';
  frontAmbient.position.set(0, 1.4, 3.0);
  scene.add(frontAmbient);

  const diningWarm = new THREE.PointLight(0xffaa60, 0.45, 10, 2);
  diningWarm.name = 'DiningWarm';
  diningWarm.position.set(0, 2.4, -3.2);
  scene.add(diningWarm);

  const leftAccent = new THREE.PointLight(0xffc070, 0.35, 8, 2);
  leftAccent.name = 'LeftAccent';
  leftAccent.position.set(-2.5, 2.0, -1.5);
  scene.add(leftAccent);

  const rightAccent = new THREE.PointLight(0xffc070, 0.35, 8, 2);
  rightAccent.name = 'RightAccent';
  rightAccent.position.set(2.5, 2.0, -1.5);
  scene.add(rightAccent);

  const ceilingAmbient = new THREE.PointLight(0xffd8a0, 0.55, 16, 2);
  ceilingAmbient.name = 'CeilingAmbient';
  ceilingAmbient.position.set(0, 3.8, 0);
  scene.add(ceilingAmbient);

  return { hemi, key, fill };
}
