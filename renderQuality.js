/**
 * Mobile-oriented render tuning (DPR cap, shadow resolution, geometry LOD).
 * Call `configureForDevice()` once at startup before building meshes.
 */

/** @type {{ pixelRatioMax: number; shadowMapSize: number; mobileCoarse: boolean }} */
let profile = {
  pixelRatioMax: 2,
  shadowMapSize: 2048,
  mobileCoarse: false,
};

/** Radial / height segments — mutated by configureForDevice. */
export const GEO = {
  bunCylinder: 16,
  pattyCylinder: 14,
  lettuceCylinder: 10,
  tomatoCylinder: 14,
  capsuleRad: 10,
  capsuleHeight: 8,
  headSphere: 12,
  headHeight: 10,
  seedSphere: 6,
  plateRim: 28,
  plateInner: 22,
  charArm: 8,
  charLeg: 8,
  charHand: 8,
  charEye: 8,
  charNose: 6,
  charHairCone: 8,
  charHairSphere: 8,
};

export function configureForDevice() {
  const coarse =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ||
      window.innerWidth < 720 ||
      (typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)));

  profile = {
    pixelRatioMax: coarse ? 1.5 : 2,
    shadowMapSize: coarse ? 1024 : 2048,
    mobileCoarse: coarse,
  };

  if (coarse) {
    GEO.bunCylinder = 12;
    GEO.pattyCylinder = 10;
    GEO.lettuceCylinder = 8;
    GEO.tomatoCylinder = 10;
    GEO.capsuleRad = 8;
    GEO.capsuleHeight = 6;
    GEO.headSphere = 10;
    GEO.headHeight = 8;
    GEO.seedSphere = 6;
    GEO.plateRim = 20;
    GEO.plateInner = 16;
    GEO.charArm = 6;
    GEO.charLeg = 6;
    GEO.charHand = 6;
    GEO.charEye = 6;
    GEO.charNose = 5;
    GEO.charHairCone = 6;
    GEO.charHairSphere = 6;
  }
}

export function getRenderProfile() {
  return profile;
}
