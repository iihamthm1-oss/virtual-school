// รายการของสะสม (ใช้ร่วมกันทั้งเกมและเซิร์ฟเวอร์ — ห้าม import ของเบราว์เซอร์ในไฟล์นี้)

export const SKINS = ['#f9dcc4', '#f6d3b3', '#e9b98f', '#c98e63'];
export const HAIR_COLORS = ['#2a2238', '#3b2a2a', '#7a5233', '#d9a441', '#e27a92', '#6c86e0'];
export const HAIR_STYLES = ['สั้นเรียบ', 'ทรงหนาม', 'บ็อบ', 'ยาว', 'หางม้า', 'มวยจุก'];

// ชุด: kind = shorts (กางเกงขาสั้น) | skirt (กระโปรง) | long (กางเกงขายาว)
export const OUTFITS = [
  { id: 0, name: 'ชุดนักเรียน (กางเกง)', icon: '👕', price: 0, shirt: '#ffffff', bottom: '#2f3a6b', kind: 'shorts' },
  { id: 1, name: 'ชุดนักเรียน (กระโปรง)', icon: '👗', price: 0, shirt: '#ffffff', bottom: '#2f3a6b', kind: 'skirt' },
  { id: 2, name: 'ชุดพละ', icon: '🏃', price: 0, shirt: '#ff8fab', bottom: '#3b3355', kind: 'shorts', extra: 'stripe' },
  { id: 3, name: 'ชุดลูกเสือ', icon: '⚜️', price: 30, shirt: '#c8a26a', bottom: '#a8844e', kind: 'shorts', extra: 'scout' },
  { id: 4, name: 'ชุดไทย', icon: '🌺', price: 50, shirt: '#f2c94c', bottom: '#a5463e', kind: 'shorts', extra: 'sash' },
  { id: 5, name: 'ชุดเชฟ', icon: '👨‍🍳', price: 60, shirt: '#ffffff', bottom: '#3b3355', kind: 'long', extra: 'chef' },
  { id: 6, name: 'ชุดหมอ', icon: '🩺', price: 60, shirt: '#ffffff', bottom: '#6c8ebf', kind: 'long', extra: 'doctor' },
  { id: 7, name: 'ชุดนักบินอวกาศ', icon: '🚀', price: 100, shirt: '#f3f3f7', bottom: '#f3f3f7', kind: 'long', extra: 'astro' },
  { id: 8, name: 'ชุดซูเปอร์ฮีโร่', icon: '🦸', price: 120, shirt: '#4f6fe8', bottom: '#d9333f', kind: 'long', extra: 'hero' },
  { id: 9, name: 'ชุดหมีน้อย', icon: '🧸', price: 120, shirt: '#b07d5a', bottom: '#b07d5a', kind: 'long', extra: 'bear' },
];

// พาหนะ: speed = ความเร็วสูงสุด (เดิน 6.5 วิ่ง 10) · stand = ยืนขี่ · seats = จำนวนที่นั่ง
export const VEHICLES = [
  { id: 1, name: 'สเก็ตบอร์ด', icon: '🛹', price: 60, speed: 11, stand: true, seats: 1 },
  { id: 2, name: 'สกู๊ตเตอร์', icon: '🛴', price: 80, speed: 12, stand: true, seats: 1 },
  { id: 3, name: 'จักรยาน', icon: '🚲', price: 100, speed: 14, seats: 1 },
  { id: 4, name: 'โฮเวอร์บอร์ด', icon: '✨', price: 150, speed: 16, stand: true, seats: 1 },
  { id: 5, name: 'จักรยานซ้อนท้าย', icon: '🚲', price: 200, speed: 13, seats: 2 },
];

export const outfitKey = (id) => 'o' + id;
export const vehicleKey = (id) => 'v' + id;
export const FREE_ITEMS = OUTFITS.filter((o) => o.price === 0).map((o) => outfitKey(o.id));

/** ราคาของชิ้นนี้ (null = ไม่มีในร้าน) */
export function priceOf(key) {
  const id = Number(String(key).slice(1));
  const item = key[0] === 'o' ? OUTFITS.find((o) => o.id === id) : key[0] === 'v' ? VEHICLES.find((v) => v.id === id) : null;
  return item ? item.price : null;
}

/** หน้าตาเริ่มต้น */
export const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 1, outfit: 0 };
export function cleanLook(l, owned = FREE_ITEMS) {
  const n = (v, max, d) => (Number.isInteger(v) && v >= 0 && v < max ? v : d);
  const outfit = n(l?.outfit, OUTFITS.length, 0);
  return {
    skin: n(l?.skin, SKINS.length, DEFAULT_LOOK.skin),
    hair: n(l?.hair, HAIR_STYLES.length, DEFAULT_LOOK.hair),
    hairColor: n(l?.hairColor, HAIR_COLORS.length, DEFAULT_LOOK.hairColor),
    outfit: owned.includes(outfitKey(outfit)) ? outfit : 0,
  };
}
