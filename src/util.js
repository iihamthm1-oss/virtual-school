import * as THREE from 'three';

const matCache = new Map();
/** วัสดุโลว์โพลีแบบเหลี่ยม แคชตามสี */
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}

/** สร้างกล่องแล้ววางไว้ในพาเรนต์ (x,y,z คือจุดกึ่งกลางฐานด้านล่าง) */
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function cyl(parent, rTop, rBot, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * วาดข้อความกึ่งกลางเอง (ไม่พึ่ง textAlign='center')
 * บน Safari มือถือบางรุ่น ข้อความไปเริ่มที่จุดกึ่งกลางแล้วล้นกรอบขวา จึงคำนวณตำแหน่งซ้ายเอง
 * ถ้ายาวเกิน maxW จะบีบแนวนอนให้พอดี
 */
export function fillCentered(g, text, cx, y, maxW) {
  g.textAlign = 'left';
  const w = g.measureText(text).width;
  if (maxW && w > maxW) {
    g.save(); g.translate(cx, y); g.scale(maxW / w, 1); g.fillText(text, -w / 2, 0); g.restore();
  } else g.fillText(text, cx - w / 2, y);
}

/** ป้ายข้อความลอย (Sprite) พื้นหลังโค้งมน */
export function makeLabel(text, { size = 1, bg = 'rgba(255,255,255,0.92)', fg = '#3b3355', font = 'Mitr', weight = 600 } = {}) {
  const px = 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `${weight} ${px}px ${font}, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + px * 0.9;
  const h = Math.ceil(px * 1.55);
  c.width = w;
  c.height = h;
  g.font = `${weight} ${px}px ${font}, sans-serif`;
  g.fillStyle = bg;
  const r = h / 2;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  fillCentered(g, text, w / 2, h / 2 + px * 0.06, w - px * 0.5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const k = (0.55 * size) / px;
  s.scale.set(w * k, h * k, 1);
  return s;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
