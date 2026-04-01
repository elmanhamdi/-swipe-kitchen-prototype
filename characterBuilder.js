/**
 * Procedural 3D character mesh factory.
 * Builds stylised low-poly figures from shared cached geometries.
 */

import * as THREE from 'three';
import { GEO } from './renderQuality.js';

// ─── Geometry cache (lazy-init, shared across all characters) ───────
const _gc = {};

function _ensureCache() {
  if (_gc.ready) return;

  // Head
  _gc.head = new THREE.SphereGeometry(0.22, GEO.headSphere, GEO.headHeight);

  // Eyes
  _gc.eyeWhite = new THREE.SphereGeometry(0.038, GEO.charEye, GEO.charEye);
  _gc.eyePupil = new THREE.SphereGeometry(0.02, GEO.charEye, GEO.charEye);

  // Nose
  _gc.nose = new THREE.SphereGeometry(0.026, GEO.charNose, GEO.charNose);

  // Mouth (thin box, scaled per-mood at runtime)
  _gc.mouth = new THREE.BoxGeometry(0.07, 0.014, 0.015);

  // Neck
  _gc.neck = new THREE.CylinderGeometry(0.08, 0.1, 0.14, GEO.charArm);

  // Skirt (female)
  _gc.skirt = new THREE.CylinderGeometry(0.12, 0.24, 0.22, GEO.capsuleRad);

  // Eyelash
  _gc.eyelash = new THREE.BoxGeometry(0.06, 0.012, 0.008);

  // Torso (rounded-ish box via capsule)
  _gc.torso = new THREE.CapsuleGeometry(0.2, 0.28, GEO.capsuleRad, GEO.capsuleHeight);

  // Arms (two-piece: upper arm + forearm)
  _gc.upperArm = new THREE.CapsuleGeometry(0.058, 0.1, GEO.charArm, GEO.charArm);
  _gc.forearm = new THREE.CapsuleGeometry(0.05, 0.1, GEO.charArm, GEO.charArm);
  _gc.hand = new THREE.SphereGeometry(0.048, GEO.charHand, GEO.charHand);

  // Legs
  _gc.leg = new THREE.CapsuleGeometry(0.065, 0.22, GEO.charLeg, GEO.charLeg);
  _gc.shoe = new THREE.BoxGeometry(0.1, 0.05, 0.14);

  // Hair primitives (larger for denser look)
  _gc.hairCone = new THREE.ConeGeometry(0.07, 0.16, GEO.charHairCone);
  _gc.hairSphere = new THREE.SphereGeometry(0.075, GEO.charHairSphere, GEO.charHairSphere);
  _gc.hairFlat = new THREE.SphereGeometry(0.23, GEO.charHairSphere, GEO.charHairSphere);
  _gc.hairMohawkBlock = new THREE.BoxGeometry(0.07, 0.14, 0.07);

  // Accessories
  _gc.capCrown = new THREE.CylinderGeometry(0.18, 0.19, 0.1, GEO.charHairCone);
  _gc.capBrim = new THREE.CylinderGeometry(0.22, 0.24, 0.02, GEO.charHairCone);
  _gc.chefHat = new THREE.CylinderGeometry(0.15, 0.17, 0.28, GEO.charHairCone);
  _gc.beanie = new THREE.SphereGeometry(0.2, GEO.charHairSphere, GEO.charHairSphere);
  _gc.glassLens = new THREE.TorusGeometry(0.05, 0.008, 6, GEO.charHairCone);
  _gc.glassBridge = new THREE.BoxGeometry(0.06, 0.012, 0.016);
  _gc.bowTie = new THREE.BoxGeometry(0.08, 0.05, 0.03);

  _gc.ready = true;
}

// ─── Material helpers ───────────────────────────────────────────────

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.04,
    ...opts,
  });
}

function skinMat(color) {
  return mat(color, { roughness: 0.78, metalness: 0.02 });
}

// ─── Part builders ──────────────────────────────────────────────────

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 * @returns {{ group: THREE.Group, mouthMesh: THREE.Mesh, skinMats: THREE.MeshStandardMaterial[] }}
 */
function buildHead(t) {
  _ensureCache();
  const group = new THREE.Group();
  group.name = 'CharHead';
  const skinMats = [];

  // Base head sphere
  const headMat = skinMat(t.skinColor);
  skinMats.push(headMat);
  const head = new THREE.Mesh(_gc.head, headMat);
  head.castShadow = true;
  group.add(head);

  // Eyes (embedded flush with head surface)
  const whiteMat = mat(0xffffff, { roughness: 0.3 });
  const pupilMat = mat(0x111111, { roughness: 0.2 });
  for (const side of [-1, 1]) {
    const eyeW = new THREE.Mesh(_gc.eyeWhite, whiteMat);
    eyeW.position.set(side * 0.075, 0.04, 0.17);
    group.add(eyeW);
    const eyeP = new THREE.Mesh(_gc.eyePupil, pupilMat);
    eyeP.position.set(side * 0.075, 0.04, 0.19);
    group.add(eyeP);
  }

  // Nose (sits on surface, not floating)
  const noseMat = skinMat(t.skinColor);
  noseMat.color.offsetHSL(0, 0, -0.04);
  skinMats.push(noseMat);
  const nose = new THREE.Mesh(_gc.nose, noseMat);
  nose.position.set(0, -0.02, 0.19);
  group.add(nose);

  // Mouth (flush with face)
  const mouthColor = t.gender === 'female' ? 0xd4556b : 0xc0392b;
  const mouthMat = mat(mouthColor, { roughness: 0.5 });
  const mouthMesh = new THREE.Mesh(_gc.mouth, mouthMat);
  mouthMesh.position.set(0, -0.08, 0.17);
  group.add(mouthMesh);

  // Eyelashes (female only)
  if (t.gender === 'female') {
    const lashMat = mat(0x111111, { roughness: 0.3 });
    for (const side of [-1, 1]) {
      const lash = new THREE.Mesh(_gc.eyelash, lashMat);
      lash.position.set(side * 0.075, 0.068, 0.17);
      lash.rotation.z = side * 0.15;
      group.add(lash);
    }
  }

  return { group, mouthMesh, skinMats };
}

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 */
function buildHair(t) {
  _ensureCache();
  const group = new THREE.Group();
  group.name = 'CharHair';
  const hairMat = mat(t.hairColor, { roughness: 0.85 });

  switch (t.hairStyle) {
    case 'spiky': {
      const positions = [
        [0, 0.2, 0], [-0.1, 0.17, 0.06], [0.1, 0.17, 0.06],
        [0, 0.18, -0.08], [-0.08, 0.19, -0.05], [0.08, 0.19, -0.05],
        [-0.13, 0.14, 0], [0.13, 0.14, 0], [0, 0.15, 0.1],
        [-0.05, 0.21, 0.03], [0.05, 0.21, 0.03], [0, 0.17, -0.12],
      ];
      for (const [x, y, z] of positions) {
        const spike = new THREE.Mesh(_gc.hairCone, hairMat);
        spike.position.set(x, y, z);
        spike.rotation.x = (Math.random() - 0.5) * 0.35;
        spike.rotation.z = (Math.random() - 0.5) * 0.35;
        group.add(spike);
      }
      break;
    }
    case 'flat': {
      const cap = new THREE.Mesh(_gc.hairFlat, hairMat);
      cap.scale.set(1.05, 0.5, 1.05);
      cap.position.y = 0.1;
      group.add(cap);
      const fringe = new THREE.Mesh(_gc.hairSphere, hairMat);
      fringe.scale.set(1.8, 0.5, 0.8);
      fringe.position.set(0, 0.06, 0.15);
      group.add(fringe);
      break;
    }
    case 'curly': {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = 0.14 + Math.random() * 0.05;
        const ball = new THREE.Mesh(_gc.hairSphere, hairMat);
        ball.position.set(Math.cos(angle) * r, 0.12 + Math.random() * 0.08, Math.sin(angle) * r);
        group.add(ball);
      }
      for (let i = 0; i < 4; i++) {
        const a2 = (i / 4) * Math.PI * 2 + 0.4;
        const top = new THREE.Mesh(_gc.hairSphere, hairMat);
        top.position.set(Math.cos(a2) * 0.06, 0.22 + Math.random() * 0.03, Math.sin(a2) * 0.06);
        group.add(top);
      }
      break;
    }
    case 'mohawk': {
      for (let i = 0; i < 8; i++) {
        const block = new THREE.Mesh(_gc.hairMohawkBlock, hairMat);
        block.position.set(0, 0.18 + Math.sin(i * 0.6) * 0.02, -0.12 + i * 0.04);
        group.add(block);
      }
      break;
    }
    case 'ponytail': {
      const topKnot = new THREE.Mesh(_gc.hairSphere, hairMat);
      topKnot.scale.set(2, 0.8, 2);
      topKnot.position.set(0, 0.14, 0);
      group.add(topKnot);
      const bun = new THREE.Mesh(_gc.hairSphere, hairMat);
      bun.scale.set(1.2, 1.2, 1.2);
      bun.position.set(0, 0.08, -0.16);
      group.add(bun);
      const tail = new THREE.Mesh(_gc.forearm, hairMat);
      tail.position.set(0, -0.04, -0.24);
      tail.rotation.x = 0.7;
      group.add(tail);
      break;
    }
    case 'long_straight': {
      const mainHair = new THREE.Mesh(_gc.hairFlat, hairMat);
      mainHair.scale.set(1.1, 0.55, 1.1);
      mainHair.position.y = 0.1;
      group.add(mainHair);
      for (const side of [-1, 0, 1]) {
        const strand = new THREE.Mesh(_gc.forearm, hairMat);
        strand.scale.set(1.2, 1.4, 1.2);
        strand.position.set(side * 0.1, -0.08, -0.1);
        strand.rotation.x = 0.15;
        group.add(strand);
      }
      const fringe = new THREE.Mesh(_gc.hairSphere, hairMat);
      fringe.scale.set(2, 0.45, 0.7);
      fringe.position.set(0, 0.08, 0.14);
      group.add(fringe);
      break;
    }
    case 'pigtails': {
      const topHair = new THREE.Mesh(_gc.hairFlat, hairMat);
      topHair.scale.set(1, 0.5, 1);
      topHair.position.y = 0.1;
      group.add(topHair);
      for (const side of [-1, 1]) {
        const ball = new THREE.Mesh(_gc.hairSphere, hairMat);
        ball.scale.set(1.5, 1.5, 1.5);
        ball.position.set(side * 0.2, 0.04, -0.04);
        group.add(ball);
        const tail = new THREE.Mesh(_gc.forearm, hairMat);
        tail.scale.set(0.9, 1.1, 0.9);
        tail.position.set(side * 0.2, -0.1, -0.06);
        group.add(tail);
      }
      break;
    }
    case 'bob': {
      const mainBob = new THREE.Mesh(_gc.hairFlat, hairMat);
      mainBob.scale.set(1.15, 0.6, 1.15);
      mainBob.position.y = 0.08;
      group.add(mainBob);
      for (const side of [-1, 1]) {
        const sideHair = new THREE.Mesh(_gc.hairSphere, hairMat);
        sideHair.scale.set(1, 1.6, 1.2);
        sideHair.position.set(side * 0.14, -0.02, 0);
        group.add(sideHair);
      }
      const fringe = new THREE.Mesh(_gc.hairSphere, hairMat);
      fringe.scale.set(2, 0.4, 0.6);
      fringe.position.set(0, 0.1, 0.14);
      group.add(fringe);
      break;
    }
    case 'bald':
    default:
      break;
  }

  return group;
}

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 */
function buildTorso(t) {
  _ensureCache();
  const shirtMat = mat(t.shirtColor);
  const mesh = new THREE.Mesh(_gc.torso, shirtMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'CharTorso';

  // Skirt for female characters
  if (t.gender === 'female') {
    const skirtMat = mat(t.skirtColor ?? t.pantsColor);
    const skirt = new THREE.Mesh(_gc.skirt, skirtMat);
    skirt.position.y = -0.24;
    skirt.castShadow = true;
    mesh.add(skirt);
  }

  return { mesh, shirtMat };
}

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 * @returns {{ group: THREE.Group, leftPivot: THREE.Group, rightPivot: THREE.Group, leftElbow: THREE.Group, rightElbow: THREE.Group, skinMats: THREE.MeshStandardMaterial[] }}
 */
function buildArms(t) {
  _ensureCache();
  const group = new THREE.Group();
  group.name = 'CharArms';
  const shirtMat = mat(t.shirtColor);
  const forearmMat = skinMat(t.skinColor);
  const handMat = skinMat(t.skinColor);
  const skinMats = [forearmMat, handMat];

  const isFemale = t.gender === 'female';
  const limbScale = isFemale ? 0.85 : 1;
  const pivots = [];
  const elbows = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (isFemale ? 0.24 : 0.26), 0, 0);

    // Upper arm (shirt-colored)
    const upperMesh = new THREE.Mesh(_gc.upperArm, shirtMat);
    upperMesh.position.y = -0.08;
    upperMesh.scale.set(limbScale, 1, limbScale);
    upperMesh.castShadow = true;
    pivot.add(upperMesh);

    // Elbow pivot (forearm hangs from here)
    const elbowPivot = new THREE.Group();
    elbowPivot.position.y = -0.17;
    elbowPivot.rotation.x = -0.12;
    pivot.add(elbowPivot);

    // Forearm (skin-colored)
    const forearmMesh = new THREE.Mesh(_gc.forearm, forearmMat);
    forearmMesh.position.y = -0.08;
    forearmMesh.scale.set(limbScale, 1, limbScale);
    forearmMesh.castShadow = true;
    elbowPivot.add(forearmMesh);

    // Hand
    const handMesh = new THREE.Mesh(_gc.hand, handMat);
    handMesh.position.y = -0.17;
    elbowPivot.add(handMesh);

    group.add(pivot);
    pivots.push(pivot);
    elbows.push(elbowPivot);
  }

  return { group, leftPivot: pivots[0], rightPivot: pivots[1], leftElbow: elbows[0], rightElbow: elbows[1], skinMats };
}

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 * @returns {{ group: THREE.Group, leftPivot: THREE.Group, rightPivot: THREE.Group }}
 */
function buildLegs(t) {
  _ensureCache();
  const group = new THREE.Group();
  group.name = 'CharLegs';
  const isFemale = t.gender === 'female';
  const pantsMat = mat(t.pantsColor);
  const shoeMat = mat(t.shoeColor, { roughness: 0.55 });
  const legThick = isFemale ? 0.85 : 1;

  const pivots = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (isFemale ? 0.08 : 0.1), 0, 0);

    const legMesh = new THREE.Mesh(_gc.leg, pantsMat);
    legMesh.position.y = -0.15;
    legMesh.scale.set(legThick, 1, legThick);
    legMesh.castShadow = true;
    pivot.add(legMesh);

    const shoeMesh = new THREE.Mesh(_gc.shoe, shoeMat);
    shoeMesh.position.set(0, -0.3, 0.02);
    pivot.add(shoeMesh);

    group.add(pivot);
    pivots.push(pivot);
  }

  return { group, leftPivot: pivots[0], rightPivot: pivots[1] };
}

/**
 * @param {import('./characterTraits.js').CharacterTraits} t
 * @returns {THREE.Group | null}
 */
function buildAccessory(t) {
  _ensureCache();
  if (t.accessory === 'none') return null;

  const group = new THREE.Group();
  group.name = 'CharAccessory';

  switch (t.accessory) {
    case 'cap': {
      const capMat = mat(t.shirtColor, { roughness: 0.6 });
      const crown = new THREE.Mesh(_gc.capCrown, capMat);
      crown.position.y = 0.2;
      group.add(crown);
      const brim = new THREE.Mesh(_gc.capBrim, capMat);
      brim.position.set(0, 0.16, 0.12);
      brim.rotation.x = -0.15;
      group.add(brim);
      break;
    }
    case 'chef_hat': {
      const hatMat = mat(0xf5f5f5, { roughness: 0.5 });
      const hat = new THREE.Mesh(_gc.chefHat, hatMat);
      hat.position.y = 0.32;
      group.add(hat);
      break;
    }
    case 'beanie': {
      const beanieMat = mat(t.hairColor, { roughness: 0.85 });
      const bean = new THREE.Mesh(_gc.beanie, beanieMat);
      bean.scale.set(1, 0.55, 1);
      bean.position.y = 0.16;
      group.add(bean);
      break;
    }
    case 'glasses': {
      const frameMat = mat(0x222222, { roughness: 0.3, metalness: 0.4 });
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(_gc.glassLens, frameMat);
        lens.position.set(side * 0.08, 0.04, 0.22);
        group.add(lens);
      }
      const bridge = new THREE.Mesh(_gc.glassBridge, frameMat);
      bridge.position.set(0, 0.04, 0.22);
      group.add(bridge);
      break;
    }
    case 'bow_tie': {
      const tieMat = mat(0xc0392b, { roughness: 0.5 });
      const tie = new THREE.Mesh(_gc.bowTie, tieMat);
      tie.rotation.z = Math.PI / 4;
      tie.position.set(0, -0.2, 0.18);
      group.add(tie);
      break;
    }
    default:
      return null;
  }

  return group;
}

// ─── Main factory ───────────────────────────────────────────────────

/**
 * Build a complete procedural character from trait data.
 *
 * @param {import('./characterTraits.js').CharacterTraits} traits
 * @returns {{
 *   root: THREE.Group,
 *   headGroup: THREE.Group,
 *   torsoMesh: THREE.Mesh,
 *   leftArm: THREE.Group,
 *   rightArm: THREE.Group,
 *   leftElbow: THREE.Group,
 *   rightElbow: THREE.Group,
 *   leftLeg: THREE.Group,
 *   rightLeg: THREE.Group,
 *   mouthMesh: THREE.Mesh,
 *   skinMaterials: THREE.MeshStandardMaterial[],
 *   shirtMaterial: THREE.MeshStandardMaterial,
 * }}
 */
export function buildCharacter(traits) {
  _ensureCache();

  const root = new THREE.Group();
  root.name = 'Character';

  const allSkinMats = [];

  // Legs (bottom-most)
  const legs = buildLegs(traits);
  legs.group.position.y = 0.32;
  root.add(legs.group);

  // Torso
  const torso = buildTorso(traits);
  torso.mesh.position.y = 0.7;
  root.add(torso.mesh);

  // Arms (attached at torso height)
  const arms = buildArms(traits);
  arms.group.position.y = 0.82;
  root.add(arms.group);
  allSkinMats.push(...arms.skinMats);

  // Neck
  const neckMat = skinMat(traits.skinColor);
  allSkinMats.push(neckMat);
  const neckMesh = new THREE.Mesh(_gc.neck, neckMat);
  neckMesh.position.y = 1.0;
  neckMesh.castShadow = true;
  neckMesh.name = 'CharNeck';
  root.add(neckMesh);

  // Head group (head + face + hair + accessory)
  const head = buildHead(traits);
  head.group.position.y = 1.22;
  root.add(head.group);
  allSkinMats.push(...head.skinMats);

  // Hair (child of head group)
  const hairGroup = buildHair(traits);
  head.group.add(hairGroup);

  // Accessory (child of head group for hats/glasses, or torso for bow_tie)
  const accessoryGroup = buildAccessory(traits);
  if (accessoryGroup) {
    if (traits.accessory === 'bow_tie') {
      torso.mesh.add(accessoryGroup);
    } else {
      head.group.add(accessoryGroup);
    }
  }

  // Apply body-type scaling + overall size boost
  const SCALE = 1.4;
  const s = traits.bodyScale;
  root.scale.set(s.sx * SCALE, s.sy * SCALE, s.sz * SCALE);

  return {
    root,
    headGroup: head.group,
    torsoMesh: torso.mesh,
    leftArm: arms.leftPivot,
    rightArm: arms.rightPivot,
    leftElbow: arms.leftElbow,
    rightElbow: arms.rightElbow,
    leftLeg: legs.leftPivot,
    rightLeg: legs.rightPivot,
    mouthMesh: head.mouthMesh,
    skinMaterials: allSkinMats,
    shirtMaterial: torso.shirtMat,
  };
}
