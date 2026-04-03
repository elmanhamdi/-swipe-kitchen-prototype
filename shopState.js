/**
 * Cosmetic shop: catalog, ownership, equipped selections, localStorage persistence.
 */

const LS_KEY = 'swipeKitchenShop_v7';

export const SHOP_CATALOG = {
  walls: [
    { id: 'wall_default',  name: 'Classic Brick',   price: 0,   brickHex: 0xb06a55 },
    { id: 'wall_cream',    name: 'Cream Brick',     price: 30,  brickHex: 0xc4a882 },
    { id: 'wall_sand',     name: 'Sandy Brick',     price: 40,  brickHex: 0xc8a870 },
    { id: 'wall_blue',     name: 'Ocean Brick',     price: 50,  brickHex: 0x5577aa },
    { id: 'wall_green',    name: 'Forest Brick',    price: 50,  brickHex: 0x6a9a5b },
    { id: 'wall_teal',     name: 'Teal Brick',      price: 60,  brickHex: 0x4a8a8a },
    { id: 'wall_pink',     name: 'Candy Brick',     price: 70,  brickHex: 0xc47a8a },
    { id: 'wall_coral',    name: 'Coral Brick',     price: 70,  brickHex: 0xd0705a },
    { id: 'wall_dark',     name: 'Charcoal Brick',  price: 80,  brickHex: 0x4a4040 },
    { id: 'wall_slate',    name: 'Slate Brick',     price: 80,  brickHex: 0x607078 },
    { id: 'wall_terracotta', name: 'Terracotta',    price: 90,  brickHex: 0xc06040 },
    { id: 'wall_lavender', name: 'Lavender Brick',  price: 90,  brickHex: 0x9080b0 },
    { id: 'wall_purple',   name: 'Royal Brick',     price: 100, brickHex: 0x7a5599 },
    { id: 'wall_wine',     name: 'Wine Brick',      price: 100, brickHex: 0x7a3040 },
    { id: 'wall_rust',     name: 'Rust Brick',      price: 120, brickHex: 0x9a4a28 },
    { id: 'wall_ice',      name: 'Ice Brick',       price: 120, brickHex: 0x90b8c8 },
    { id: 'wall_gold',     name: 'Golden Brick',    price: 150, brickHex: 0xb8963e },
    { id: 'wall_midnight', name: 'Midnight Brick',  price: 200, brickHex: 0x1a2030 },
  ],
  floor: [
    { id: 'floor_default',  name: 'Classic Tile',   price: 0,   tileHexes: [0x9e8874, 0x907c6c, 0x807070] },
    { id: 'floor_warm',     name: 'Warm Oak',       price: 30,  tileHexes: [0xb08860, 0xa07850, 0x906848] },
    { id: 'floor_sand',     name: 'Sandy Stone',    price: 40,  tileHexes: [0xc0a880, 0xb09870, 0xa08860] },
    { id: 'floor_blue',     name: 'Ocean Tile',     price: 50,  tileHexes: [0x6888a8, 0x587898, 0x486878] },
    { id: 'floor_green',    name: 'Jade Tile',      price: 50,  tileHexes: [0x6a9a78, 0x5a8a68, 0x4a7a58] },
    { id: 'floor_teal',     name: 'Teal Floor',     price: 60,  tileHexes: [0x4a8888, 0x3a7878, 0x2a6868] },
    { id: 'floor_pink',     name: 'Rose Floor',     price: 70,  tileHexes: [0xb88088, 0xa87078, 0x986068] },
    { id: 'floor_terracotta', name: 'Terracotta',   price: 70,  tileHexes: [0xb87050, 0xa86040, 0x985838] },
    { id: 'floor_marble',   name: 'Marble White',   price: 80,  tileHexes: [0xc8c0b8, 0xb8b0a8, 0xa8a098] },
    { id: 'floor_dark',     name: 'Slate Dark',     price: 80,  tileHexes: [0x585050, 0x504848, 0x484040] },
    { id: 'floor_honey',    name: 'Honey Wood',     price: 90,  tileHexes: [0xc89848, 0xb88838, 0xa87828] },
    { id: 'floor_lavender', name: 'Lavender Tile',  price: 90,  tileHexes: [0x887898, 0x786888, 0x685878] },
    { id: 'floor_cherry',   name: 'Cherry Wood',    price: 100, tileHexes: [0xa05040, 0x904030, 0x803828] },
    { id: 'floor_royal',    name: 'Royal Purple',   price: 100, tileHexes: [0x6a5088, 0x5a4078, 0x4a3868] },
    { id: 'floor_ice',      name: 'Ice Floor',      price: 120, tileHexes: [0x98b8c8, 0x88a8b8, 0x7898a8] },
    { id: 'floor_obsidian', name: 'Obsidian',       price: 150, tileHexes: [0x282028, 0x201820, 0x181018] },
    { id: 'floor_gold',     name: 'Golden Floor',   price: 200, tileHexes: [0xc0a040, 0xb09030, 0xa08028] },
  ],
  tables: [
    { id: 'table_default',  name: 'Classic Wood',   price: 0,   color: 0x8b6b4a, chairColor: 0x6b4a30, cushionColor: 0x8b3535 },
    { id: 'table_light',    name: 'Light Maple',    price: 30,  color: 0xc4a060, chairColor: 0xa48040, cushionColor: 0x7a9955 },
    { id: 'table_birch',    name: 'Birch',          price: 40,  color: 0xd4c098, chairColor: 0xb4a078, cushionColor: 0x6688aa },
    { id: 'table_dark',     name: 'Dark Oak',       price: 50,  color: 0x3a2a1a, chairColor: 0x2a1a0a, cushionColor: 0x6a4444 },
    { id: 'table_white',    name: 'Modern White',   price: 50,  color: 0xd8d0c8, chairColor: 0xa8a098, cushionColor: 0x5588aa },
    { id: 'table_olive',    name: 'Olive Wood',     price: 60,  color: 0x6a7a3a, chairColor: 0x4a5a2a, cushionColor: 0xc4a050 },
    { id: 'table_cherry',   name: 'Cherry Red',     price: 70,  color: 0x8a3a2a, chairColor: 0x6a2a1a, cushionColor: 0xdda855 },
    { id: 'table_teal',     name: 'Teal Set',       price: 70,  color: 0x3a6a6a, chairColor: 0x2a5a5a, cushionColor: 0xd0a050 },
    { id: 'table_blue',     name: 'Navy Blue',      price: 80,  color: 0x2a3a5a, chairColor: 0x1a2a4a, cushionColor: 0xc8a860 },
    { id: 'table_rose',     name: 'Rose Wood',      price: 80,  color: 0x9a5060, chairColor: 0x7a3848, cushionColor: 0xe8c870 },
    { id: 'table_walnut',   name: 'Walnut',         price: 90,  color: 0x5a3a28, chairColor: 0x4a2a18, cushionColor: 0x88aa66 },
    { id: 'table_coral',    name: 'Coral Set',      price: 90,  color: 0xc06050, chairColor: 0xa04838, cushionColor: 0xf0d060 },
    { id: 'table_ebony',    name: 'Ebony',          price: 100, color: 0x1a1a1a, chairColor: 0x0a0a0a, cushionColor: 0xcc3333 },
    { id: 'table_purple',   name: 'Royal Purple',   price: 100, color: 0x4a2868, chairColor: 0x3a1858, cushionColor: 0xe0b040 },
    { id: 'table_ice',      name: 'Ice Set',        price: 120, color: 0xa0c0d0, chairColor: 0x80a0b8, cushionColor: 0x334455 },
    { id: 'table_gold',     name: 'Golden Table',   price: 150, color: 0xb89838, chairColor: 0x8a7028, cushionColor: 0x882244 },
    { id: 'table_diamond',  name: 'Diamond Set',    price: 200, color: 0xc8d8e8, chairColor: 0xa0b0c8, cushionColor: 0x2a2a3a },
  ],
  accessories: [
    { id: 'acc_mat',       name: 'Welcome Mat',      price: 30  },
    { id: 'acc_carpet',    name: 'Red Carpet',       price: 40  },
    { id: 'acc_clock',     name: 'Wall Clock',       price: 50  },
    { id: 'acc_plants',    name: 'Hanging Plants',   price: 50  },
    { id: 'acc_vases',     name: 'Flower Vases',     price: 60  },
  ],
};

const CATEGORIES = Object.keys(SHOP_CATALOG);

function defaultState() {
  const owned = [];
  const equipped = {};
  for (const cat of CATEGORIES) {
    if (cat === 'accessories') {
      equipped[cat] = [];
      continue;
    }
    const def = SHOP_CATALOG[cat][0];
    owned.push(def.id);
    equipped[cat] = def.id;
  }
  return { coins: 0, owned, equipped };
}

let _state = defaultState();

export function loadShopState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const def = defaultState();
      _state = {
        coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
        owned: Array.isArray(parsed.owned)
          ? [...new Set([...def.owned, ...parsed.owned])]
          : def.owned,
        equipped: { ...def.equipped, ...(parsed.equipped || {}) },
      };
      if (!Array.isArray(_state.equipped.accessories)) {
        _state.equipped.accessories = [];
      }
    }
  } catch (_) {
    _state = defaultState();
  }
  return _state;
}

export function saveShopState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_state));
  } catch (_) { /* quota or private mode */ }
}

export function getShopState() { return _state; }

export function syncCoins(totalCoins) {
  _state.coins = totalCoins;
  saveShopState();
}

export function getCoins() { return _state.coins; }

export function isOwned(itemId) { return _state.owned.includes(itemId); }

export function isEquipped(category, itemId) {
  if (category === 'accessories') return _state.equipped.accessories.includes(itemId);
  return _state.equipped[category] === itemId;
}

export function canAfford(price) { return _state.coins >= price; }

/**
 * @returns {{ success: boolean, newBalance: number }}
 */
export function buyItem(itemId) {
  let item = null, cat = null;
  for (const c of CATEGORIES) {
    item = SHOP_CATALOG[c].find(i => i.id === itemId);
    if (item) { cat = c; break; }
  }
  if (!item || _state.owned.includes(itemId)) return { success: false, newBalance: _state.coins };
  if (_state.coins < item.price) return { success: false, newBalance: _state.coins };
  _state.coins -= item.price;
  _state.owned.push(itemId);
  if (cat === 'accessories') {
    _state.equipped.accessories.push(itemId);
  } else {
    _state.equipped[cat] = itemId;
  }
  saveShopState();
  return { success: true, newBalance: _state.coins };
}

export function equipItem(category, itemId) {
  if (!_state.owned.includes(itemId)) return false;
  _state.equipped[category] = itemId;
  saveShopState();
  return true;
}

export function toggleAccessory(itemId) {
  if (!_state.owned.includes(itemId)) return false;
  const arr = _state.equipped.accessories;
  const idx = arr.indexOf(itemId);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(itemId);
  saveShopState();
  return true;
}

export function isAccessoryActive(itemId) {
  return _state.equipped.accessories.includes(itemId);
}

export function getEquippedItem(category) {
  if (category === 'accessories') return null;
  const id = _state.equipped[category];
  return SHOP_CATALOG[category].find(i => i.id === id) || SHOP_CATALOG[category][0];
}

export function getActiveAccessories() {
  return _state.equipped.accessories || [];
}

export function findItem(itemId) {
  for (const c of CATEGORIES) {
    const item = SHOP_CATALOG[c].find(i => i.id === itemId);
    if (item) return { category: c, item };
  }
  return null;
}
