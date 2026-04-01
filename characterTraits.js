/**
 * Character trait definitions, color palettes, and random trait generator.
 * Pure data — no Three.js dependency.
 */

// ── Skin palette (hex) ──────────────────────────────────────────────
const SKIN_COLORS = [
  0xf5d0a9, // light peach
  0xe8b88a, // warm sand
  0xd4a574, // tan
  0xc68c5b, // medium
  0xa0724a, // brown
  0x7b5438, // dark brown
  0x5c3a24, // deep brown
  0xffe0bd, // pale
];

// ── Shirt palette ───────────────────────────────────────────────────
const SHIRT_COLORS = [
  0xe74c3c, // red
  0x3498db, // blue
  0x2ecc71, // green
  0xf39c12, // orange
  0x9b59b6, // purple
  0x1abc9c, // teal
  0xe91e63, // pink
  0x00bcd4, // cyan
  0xff9800, // amber
  0x8bc34a, // light green
  0x607d8b, // blue grey
  0xffffff, // white
];

// ── Pants palette ───────────────────────────────────────────────────
const PANTS_COLORS = [
  0x2c3e50, // dark navy
  0x34495e, // grey navy
  0x4a3728, // dark brown
  0x1a1a2e, // near-black
  0x3b5998, // denim blue
  0x556b2f, // olive
  0x8b4513, // saddle brown
  0x696969, // dim grey
];

// ── Hair palette ────────────────────────────────────────────────────
const HAIR_COLORS = [
  0x1a1a1a, // black
  0x4a3728, // dark brown
  0x8b6914, // medium brown
  0xd4a017, // golden
  0xc0392b, // red
  0xe67e22, // ginger
  0x3498db, // fantasy blue
  0xe91e63, // fantasy pink
];

// ── Shoe palette ────────────────────────────────────────────────────
const SHOE_COLORS = [
  0x1a1a1a, // black
  0x4a3728, // dark brown
  0x8b4513, // brown
  0xffffff, // white sneakers
  0xc0392b, // red
  0x2c3e50, // dark navy
];

/** @typedef {'spiky'|'flat'|'curly'|'bald'|'mohawk'|'ponytail'|'long_straight'|'pigtails'|'bob'} HairStyle */
const HAIR_STYLES_MALE = ['spiky', 'flat', 'curly', 'bald', 'mohawk', 'ponytail'];
const HAIR_STYLES_FEMALE = ['long_straight', 'ponytail', 'pigtails', 'bob', 'curly', 'flat'];

/** @typedef {'none'|'cap'|'chef_hat'|'beanie'|'glasses'|'bow_tie'} AccessoryType */
const ACCESSORY_TYPES_MALE = ['none', 'none', 'none', 'cap', 'chef_hat', 'beanie', 'glasses', 'bow_tie'];
const ACCESSORY_TYPES_FEMALE = ['none', 'none', 'none', 'glasses', 'beanie', 'bow_tie'];

// ── Skirt palette (female) ──────────────────────────────────────────
const SKIRT_COLORS = [
  0xe91e63, // pink
  0x9b59b6, // purple
  0x2c3e50, // dark navy
  0xc0392b, // red
  0x1abc9c, // teal
  0xf39c12, // orange
  0x34495e, // grey navy
  0x8e44ad, // violet
];

/**
 * @typedef {'thin'|'normal'|'wide'|'tall'|'short'} BodyType
 *
 * Each body type maps to scale multipliers applied to the assembled character.
 */
const BODY_TYPE_SCALES = {
  thin:   { sx: 0.82, sy: 1.00, sz: 0.82 },
  normal: { sx: 1.00, sy: 1.00, sz: 1.00 },
  wide:   { sx: 1.25, sy: 0.95, sz: 1.15 },
  tall:   { sx: 0.95, sy: 1.15, sz: 0.95 },
  short:  { sx: 1.05, sy: 0.85, sz: 1.05 },
};
const BODY_TYPES = /** @type {BodyType[]} */ (Object.keys(BODY_TYPE_SCALES));

/**
 * @typedef {'male'|'female'} Gender
 */

/**
 * @typedef {object} CharacterTraits
 * @property {Gender} gender
 * @property {number} skinColor
 * @property {number} shirtColor
 * @property {number} pantsColor
 * @property {number} hairColor
 * @property {number} shoeColor
 * @property {number} [skirtColor]
 * @property {HairStyle} hairStyle
 * @property {BodyType} bodyType
 * @property {AccessoryType} accessory
 * @property {{ sx:number, sy:number, sz:number }} bodyScale
 */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** @returns {CharacterTraits} */
export function generateRandomTraits() {
  const gender = Math.random() < 0.5 ? 'male' : 'female';
  const isFemale = gender === 'female';

  const bodyType = pick(BODY_TYPES);
  const hairStyles = isFemale ? HAIR_STYLES_FEMALE : HAIR_STYLES_MALE;
  const accessoryPool = isFemale ? ACCESSORY_TYPES_FEMALE : ACCESSORY_TYPES_MALE;
  let accessory = pick(accessoryPool);
  const hairStyle = pick(hairStyles);

  if ((accessory === 'cap' || accessory === 'chef_hat' || accessory === 'beanie') && hairStyle !== 'bald') {
    if (Math.random() < 0.5) accessory = 'none';
  }

  return {
    gender,
    skinColor: pick(SKIN_COLORS),
    shirtColor: pick(SHIRT_COLORS),
    pantsColor: pick(PANTS_COLORS),
    hairColor: pick(HAIR_COLORS),
    shoeColor: pick(SHOE_COLORS),
    skirtColor: isFemale ? pick(SKIRT_COLORS) : undefined,
    hairStyle,
    bodyType,
    accessory,
    bodyScale: { ...BODY_TYPE_SCALES[bodyType] },
  };
}

export { BODY_TYPE_SCALES };
