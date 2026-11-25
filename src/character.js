import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeLabel } from './util.js';
import { SKINS, HAIR_COLORS, OUTFITS } from './catalog.js';
import { createVehicle, RIDE_POSE } from './vehicles.js';

const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
/** รวมชิ้นส่วนลูกในกลุ่มเป็นชิ้นเดียว (สีเก็บในจุดยอด) ลดภาระการ์ดจอ */
function mergeChildren(group) {
  const geos = [], rm = [];
  for (const c of group.children) {
    if (!c.isMesh || c.material.transparent) continue;
    c.updateMatrix();
    let g = c.geometry.clone().applyMatrix4(c.matrix);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const col = c.material.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g); rm.push(c);
  }
  if (!geos.length) return;
  rm.forEach((c) => group.remove(c));
  const m = new THREE.Mesh(mergeGeometries(geos), vcMat);
  m.castShadow = true;
  group.add(m);
}


// รายละเอียดแต่ละชุด (ชิ้นส่วนจริง) — key ตรงกับ style ใน catalog.js
const OUTFIT_STYLE = {
  boy: { shirt: '#ffffff', sleeve: 'short', collar: 'shirt', buttons: '#e2e2ec', pocket: true, badge: '#2f3a6b', bottom: 'shorts', bottomColor: '#2f3a6b', belt: '#5a3a2a', socks: '#ffffff', shoes: 'leather' },
  girl: { shirt: '#ffffff', sleeve: 'short', collar: 'sailor', bow: '#2f3a6b', badge: '#2f3a6b', bottom: 'pleated', bottomColor: '#2f3a6b', socks: '#ffffff', shoes: 'leather' },
  pe: { shirt: '#ff8fab', sleeve: 'short', collar: 'round', stripe: '#ffffff', badge: '#ffffff', bottom: 'shorts', bottomColor: '#3b3355', sideStripe: '#ffffff', socks: '#ffffff', shoes: 'sneaker', soleColor: '#ff8fab' },
  scout: { shirt: '#c8a26a', sleeve: 'short', collar: 'shirt', buttons: '#8a6a3a', pockets2: true, scarf: '#d9534f', bottom: 'shorts', bottomColor: '#a8844e', belt: '#5a4020', socks: '#a8844e', longSocks: true, shoes: 'leather', hat: 'scout' },
  thai: { shirt: '#f2c94c', sleeve: 'long', cuff: '#d9a441', collar: 'band', collarColor: '#d9a441', buttons: '#ffffff', sash: '#7c3aed', bottom: 'jong', bottomColor: '#a5463e', belt: '#d9a441', buckle: '#f2e0a0', shoes: 'sandal' },
  chef: { shirt: '#ffffff', sleeve: 'long', cuff: '#e8e8f0', collar: 'band', buttons: '#3b3355', double: true, neckerchief: '#e2735e', apron: true, bottom: 'long', bottomColor: '#3b3355', shoes: 'leather', hat: 'chef' },
  doctor: { shirt: '#7fc6d9', sleeve: 'long', cuff: '#ffffff', coat: '#ffffff', stetho: true, bottom: 'long', bottomColor: '#7fc6d9', shoes: 'sneaker', soleColor: '#7fc6d9' },
  astro: { shirt: '#f3f3f7', sleeve: 'long', collar: 'ring', puffy: true, stripes: '#ff8f3a', pack: true, gloves: '#ff8f3a', bottom: 'long', bottomColor: '#f3f3f7', shoes: 'boot', bootColor: '#d9dde8', helmet: true },
  hero: { shirt: '#4f6fe8', sleeve: 'long', emblem: '#ffd66b', cape: '#d9333f', trunks: '#d9333f', belt: '#ffd66b', buckle: '#ffe9a0', bottom: 'long', bottomColor: '#4f6fe8', shoes: 'boot', bootColor: '#d9333f', mask: '#d9333f', gloves: '#d9333f' },
  bear: { shirt: '#b07d5a', sleeve: 'long', belly: '#ecd2b4', tail: true, bottom: 'long', bottomColor: '#b07d5a', shoes: 'paw', gloves: 'paw', hood: true },
};

/** แปลงหน้าตาจากแคตตาล็อก (ตัวเลข) เป็นสี/แบบ */
export function lookToStyle(look = {}) {
  return {
    skin: SKINS[look.skin ?? 1],
    hairColor: HAIR_COLORS[look.hairColor ?? 1],
    hairStyle: look.hair ?? 0,
    outfit: OUTFITS[look.outfit ?? 0] || OUTFITS[0],
  };
}

/**
 * ตัวละครหัวโต
 * ใช้ได้ 2 แบบ: { look: {skin, hair, hairColor, outfit} } จากแคตตาล็อก
 * หรือกำหนดสีเอง (NPC): { skin, hair, bottom, shirt, skirt, long, hairLong }
 */
export function createCharacter(opts = {}) {
  const st = opts.look ? lookToStyle(opts.look) : {
    skin: opts.skin || '#f6d3b3',
    hairColor: opts.hair || '#3b2a2a',
    hairStyle: opts.hairLong ? 3 : 0,
    outfit: { shirt: opts.shirt || '#ffffff', bottom: opts.bottom || '#2f3a6b', kind: opts.skirt ? 'skirt' : opts.long ? 'long' : 'shorts' },
  };
  const { skin, hairColor, hairStyle, outfit: o } = st;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const part = (geo, color, x, y, z, parent = body, opts2) => {
    const m = new THREE.Mesh(geo, mat(color, opts2));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // ═════════ เสื้อผ้า: ประกอบจากชิ้นจริง (ปก กระดุม กระเป๋า เข็มขัด ถุงเท้า รองเท้า ฯลฯ) ═════════
  const S = OUTFIT_STYLE[o.style] || { ...OUTFIT_STYLE.boy, shirt: o.shirt, bottomColor: o.bottom, bottom: o.kind === 'skirt' ? 'pleated' : o.kind === 'long' ? 'long' : 'shorts', collar: o.kind === 'skirt' ? 'sailor' : 'shirt', bow: o.kind === 'skirt' ? '#2f3a6b' : null };
  const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const CY = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const SP = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const puffy = !!S.puffy;

  // ── ขา ถุงเท้า รองเท้า ──
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.48, 0);
    body.add(hip);
    const covered = S.bottom === 'long';
    part(CY(puffy ? 0.12 : 0.1, puffy ? 0.11 : 0.09, 0.32, 8), covered ? S.bottomColor : skin, 0, -0.26, 0, hip);
    if (S.bottom === 'shorts' || S.bottom === 'jong') {
      // ขากางเกงขาสั้น / โจงกระเบน (บานกว่า ยาวถึงเข่า)
      const jong = S.bottom === 'jong';
      part(CY(jong ? 0.15 : 0.125, jong ? 0.14 : 0.12, jong ? 0.27 : 0.13, 10), S.bottomColor, 0, jong ? -0.13 : -0.07, 0, hip);
      if (S.sideStripe) part(BX(0.02, 0.13, 0.05), S.sideStripe, s * 0.125, -0.07, 0, hip);
    }
    if (S.stripes) part(CY(0.125, 0.125, 0.04, 8), S.stripes, 0, -0.22, 0, hip);
    if (S.socks) {
      const h = S.longSocks ? 0.22 : 0.1;
      part(CY(0.105, 0.1, h, 8), S.socks, 0, -0.42 + h / 2 + 0.02, 0, hip);
      if (S.longSocks) part(BX(0.04, 0.06, 0.02), '#4f7a3a', s * 0.07, -0.24, 0.07, hip); // ป้ายถุงเท้าลูกเสือ
    }
    // รองเท้า
    if (S.shoes === 'sneaker') {
      part(BX(0.2, 0.1, 0.31), '#ffffff', 0, -0.43, 0.04, hip);
      part(BX(0.21, 0.035, 0.32), S.soleColor || '#ff8fab', 0, -0.48, 0.04, hip);
      part(BX(0.08, 0.02, 0.12), '#c9c4d8', 0, -0.375, 0.08, hip);
    } else if (S.shoes === 'boot') {
      part(BX(0.22, 0.2, 0.31), S.bootColor, 0, -0.39, 0.03, hip);
      part(BX(0.23, 0.04, 0.32), '#3b3355', 0, -0.48, 0.03, hip);
    } else if (S.shoes === 'sandal') {
      part(BX(0.19, 0.06, 0.3), skin, 0, -0.44, 0.04, hip);
      part(BX(0.21, 0.03, 0.32), '#8a5a3a', 0, -0.48, 0.04, hip);
      part(BX(0.2, 0.03, 0.04), '#d9a441', 0, -0.43, 0.08, hip);
    } else if (S.shoes === 'paw') {
      part(SP(0.14, 8, 6), S.shirt, 0, -0.42, 0.04, hip).scale.set(1, 0.7, 1.2);
      part(SP(0.07, 6, 4), S.belly, 0, -0.43, 0.17, hip).scale.set(1, 0.7, 0.5);
    } else { // รองเท้าหนังนักเรียน
      part(BX(0.19, 0.1, 0.27), '#24222c', 0, -0.43, 0.02, hip, { roughness: 0.35 });
      part(CY(0.095, 0.095, 0.1, 10), '#24222c', 0, -0.43, 0.15, hip, { roughness: 0.35 }).rotation.x = Math.PI / 2;
      part(BX(0.2, 0.03, 0.3), '#141218', 0, -0.48, 0.04, hip);
    }
    legs.push(hip);
  }

  // ── ช่วงล่าง ──
  if (S.bottom === 'pleated') {
    // กระโปรงจีบรอบตัว
    const geo = CY(0.25, 0.4, 0.32, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.159) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i)), f = 1 + 0.07 * Math.sign(Math.cos(a * 12));
      pos.setX(i, pos.getX(i) * f); pos.setZ(i, pos.getZ(i) * f);
    }
    geo.computeVertexNormals();
    part(geo, S.bottomColor, 0, 0.45, 0);
  } else {
    part(CY(puffy ? 0.3 : 0.26, puffy ? 0.31 : 0.28, 0.2, 10), S.bottomColor, 0, 0.5, 0);
  }
  if (S.trunks) part(CY(0.275, 0.29, 0.16, 10), S.trunks, 0, 0.5, 0);
  if (S.belt) {
    part(CY(0.275, 0.275, 0.05, 12), S.belt, 0, 0.6, 0);
    part(BX(0.08, 0.06, 0.02), S.buckle || '#d9d4c0', 0, 0.6, 0.275, body, { metalness: 0.5, roughness: 0.35 });
  }

  // ── ลำตัว ──
  const rT = puffy ? 0.26 : 0.22, rB = puffy ? 0.3 : 0.27;
  part(CY(rT, rB, 0.42, 12), S.shirt, 0, 0.78, 0);
  const front = (y) => rT + (rB - rT) * ((0.99 - y) / 0.42) + 0.006; // ผิวหน้าอกที่ความสูง y
  // ปกเสื้อ
  switch (S.collar) {
    case 'shirt':
      for (const s of [-1, 1]) { const c = part(BX(0.13, 0.035, 0.11), S.collarColor || S.shirt, s * 0.07, 0.985, 0.16); c.rotation.set(0.5, 0, s * 0.55); }
      break;
    case 'sailor':
      part(BX(0.42, 0.03, 0.2), S.shirt, 0, 0.975, -0.12).rotation.x = -0.35;
      for (const s of [-1, 1]) { const c = part(BX(0.15, 0.03, 0.12), S.shirt, s * 0.08, 0.98, 0.15); c.rotation.set(0.5, 0, s * 0.5); }
      break;
    case 'round': part(new THREE.TorusGeometry(0.14, 0.025, 6, 16), S.stripe || '#ffffff', 0, 0.98, 0.0).rotation.x = Math.PI / 2; break;
    case 'band': part(CY(0.15, 0.16, 0.07, 12), S.collarColor || S.shirt, 0, 0.99, 0); break;
    case 'ring': part(new THREE.TorusGeometry(0.2, 0.045, 6, 16), '#c9cdd8', 0, 1.0, 0).rotation.x = Math.PI / 2; break;
  }
  if (S.bow) { // โบว์นักเรียนหญิง
    for (const s of [-1, 1]) { const b = part(BX(0.09, 0.06, 0.03), S.bow, s * 0.05, 0.94, front(0.94) + 0.01); b.rotation.z = s * 0.35; }
    part(SP(0.025), S.bow, 0, 0.94, front(0.94) + 0.02);
    for (const s of [-1, 1]) { const t = part(BX(0.035, 0.1, 0.02), S.bow, s * 0.025, 0.87, front(0.87) + 0.005); t.rotation.z = s * 0.2; }
  }
  // กระดุม
  if (S.buttons) {
    const cols = S.double ? [-0.06, 0.06] : [0];
    for (const x of cols) for (const y of [0.9, 0.8, 0.7]) part(SP(0.018, 6, 4), S.buttons, x, y, front(y));
  }
  if (S.pocket) part(BX(0.09, 0.08, 0.012), S.shirt === '#ffffff' ? '#f1f1f6' : S.shirt, 0.1, 0.84, front(0.84));
  if (S.badge) part(BX(0.06, 0.06, 0.012), S.badge, -0.1, 0.86, front(0.86) + 0.004); // ตราโรงเรียน
  if (S.pockets2) for (const s of [-1, 1]) {
    part(BX(0.1, 0.09, 0.015), S.shirt, s * 0.1, 0.83, front(0.83) + 0.004);
    part(BX(0.11, 0.03, 0.02), '#a8844e', s * 0.1, 0.88, front(0.88) + 0.008);
  }
  if (S.stripe) part(CY(rT + 0.022, rT + 0.03, 0.06, 12), S.stripe, 0, 0.82, 0);
  if (S.scarf) { // ผ้าพันคอลูกเสือ + ห่วงสวม
    const sc = part(new THREE.ConeGeometry(0.13, 0.26, 3), S.scarf, 0, 0.84, front(0.84) + 0.02); sc.rotation.set(Math.PI, 0, 0); sc.scale.z = 0.3;
    part(new THREE.TorusGeometry(0.035, 0.015, 4, 8), '#8a5a3a', 0, 0.9, front(0.9) + 0.03);
    part(new THREE.TorusGeometry(0.15, 0.03, 4, 12), S.scarf, 0, 0.98, 0).rotation.x = Math.PI / 2;
  }
  if (S.sash) { // สไบเฉียงไหล่
    const sa = part(BX(0.12, 0.6, 0.02), S.sash, 0.02, 0.8, front(0.8) + 0.008); sa.rotation.z = 0.55;
    const sb = part(BX(0.12, 0.6, 0.02), S.sash, 0.02, 0.8, -front(0.8) - 0.008); sb.rotation.z = -0.55;
  }
  if (S.neckerchief) { const nk = part(new THREE.ConeGeometry(0.06, 0.1, 3), S.neckerchief, 0, 0.94, front(0.94) + 0.02); nk.rotation.x = Math.PI; }
  if (S.apron) { part(BX(0.34, 0.42, 0.02), '#ffffff', 0, 0.55, front(0.6) + 0.02); part(BX(0.36, 0.03, 0.02), '#e2735e', 0, 0.75, front(0.75) + 0.02); }
  if (S.coat) { // เสื้อกาวน์ยาวคลุมถึงเข่า เปิดด้านหน้า
    part(CY(0.25, 0.34, 0.66, 12), S.coat, 0, 0.66, -0.01);
    part(BX(0.08, 0.62, 0.02), S.shirt, 0, 0.67, 0.31);
    for (const s of [-1, 1]) { const l = part(BX(0.06, 0.24, 0.02), '#e8e8f0', s * 0.07, 0.87, 0.28); l.rotation.z = -s * 0.35; }
    part(BX(0.1, 0.09, 0.015), '#f1f1f6', 0.15, 0.55, 0.32);
    part(BX(0.07, 0.03, 0.01), '#4f8fe8', -0.13, 0.86, 0.27);
  }
  if (S.stetho) {
    const st = part(new THREE.TorusGeometry(0.16, 0.015, 4, 14, Math.PI), '#3b3355', 0, 0.95, 0.1); st.rotation.set(-0.9, 0, Math.PI);
    part(CY(0.04, 0.04, 0.02, 10), '#b8b4c6', 0.09, 0.78, front(0.78) + 0.03, body, { metalness: 0.6, roughness: 0.3 }).rotation.x = Math.PI / 2;
  }
  if (S.emblem) { // สัญลักษณ์ซูเปอร์ฮีโร่
    part(CY(0.1, 0.1, 0.02, 5), S.emblem, 0, 0.84, front(0.84) + 0.006).rotation.x = Math.PI / 2;
    part(CY(0.06, 0.06, 0.025, 5), S.trunks, 0, 0.84, front(0.84) + 0.012).rotation.x = Math.PI / 2;
  }
  if (S.cape) {
    const cape = part(BX(0.5, 0.8, 0.03), S.cape, 0, 0.6, -0.29); cape.rotation.x = 0.14;
    part(BX(0.5, 0.06, 0.18), S.cape, 0, 0.98, -0.15);
  }
  if (S.belly) part(SP(0.2, 10, 8), S.belly, 0, 0.72, 0.13).scale.set(1, 1.1, 0.5);
  if (S.tail) part(SP(0.08), S.shirt, 0, 0.52, -0.3);
  if (S.pack) { // เป้ออกซิเจนนักบินอวกาศ
    part(BX(0.4, 0.46, 0.18), '#d9dde8', 0, 0.8, -0.34);
    for (const s of [-1, 1]) part(CY(0.06, 0.06, 0.4, 8), '#9aa3b8', s * 0.12, 0.8, -0.45);
    part(BX(0.16, 0.12, 0.02), '#4fc3e8', 0.1, 0.88, front(0.88) + 0.01, body, { emissive: '#1e7fae', emissiveIntensity: 0.4 });
    part(BX(0.06, 0.04, 0.02), '#ff5a5a', -0.1, 0.9, front(0.9) + 0.01);
    part(CY(rB + 0.01, rB + 0.01, 0.05, 12), S.stripes, 0, 0.6, 0);
  }

  // ── แขน ──
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * (puffy ? 0.33 : 0.3), 0.94, 0);
    body.add(sh);
    const sleeveColor = S.coat || S.sleeveColor || S.shirt;
    const r = puffy ? 0.11 : 0.085;
    if (S.sleeve === 'long') {
      part(CY(r, r - 0.01, 0.4, 8), sleeveColor, 0, -0.2, 0, sh);
      if (S.cuff) part(CY(r + 0.01, r + 0.01, 0.05, 8), S.cuff, 0, -0.37, 0, sh);
    } else {
      part(CY(r, r, 0.17, 8), sleeveColor, 0, -0.07, 0, sh);
      part(CY(0.07, 0.065, 0.22, 7), skin, 0, -0.24, 0, sh);
    }
    if (S.stripes) part(CY(r + 0.01, r + 0.01, 0.04, 8), S.stripes, 0, -0.14, 0, sh);
    if (S.gloves === 'paw') { part(SP(0.09, 8, 6), S.shirt, 0, -0.4, 0, sh); part(SP(0.05, 6, 4), S.belly, 0, -0.42, 0.05, sh); }
    else part(SP(S.gloves ? 0.085 : 0.075, 7, 5), S.gloves || skin, 0, -0.4, 0, sh);
    sh.rotation.z = s * 0.12;
    arms.push(sh);
  }

  // ── หัว + ผม ──
  const head = new THREE.Group();
  head.position.y = 1.38;
  body.add(head);
  part(new THREE.IcosahedronGeometry(0.43, 1), skin, 0, 0, 0, head);
  const H = (geo, x, y, z) => part(geo, hairColor, x, y, z, head);
  if (S.hood) { // ฮู้ดหมีคลุมผม
    part(new THREE.SphereGeometry(0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), S.shirt, 0, 0.03, -0.04, head).rotation.x = -0.2;
    part(new THREE.TorusGeometry(0.36, 0.06, 6, 16), S.belly, 0, 0.02, 0.12, head);
    for (const s of [-1, 1]) { part(SP(0.13), S.shirt, s * 0.3, 0.38, -0.02, head); part(SP(0.07, 6, 4), S.belly, s * 0.3, 0.38, 0.06, head).scale.z = 0.5; }
  } else {
    const cap = H(new THREE.SphereGeometry(0.46, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.04, -0.03);
    cap.rotation.x = -0.25;
    switch (hairStyle) {
      case 1: // ทรงหนาม
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const sp = H(new THREE.ConeGeometry(0.1, 0.26, 5), Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2 - 0.05); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
        H(BX(0.5, 0.1, 0.16), 0, 0.26, 0.33);
        break;
      case 2: // บ็อบ
        for (const s of [-1, 1]) H(BX(0.16, 0.5, 0.5), s * 0.38, -0.05, -0.04);
        H(BX(0.66, 0.16, 0.22), 0, 0.22, 0.31);
        break;
      case 3: // ยาว
        H(BX(0.78, 0.72, 0.28), 0, -0.18, -0.26);
        H(BX(0.62, 0.14, 0.2), 0, 0.22, 0.32);
        break;
      case 4: { // หางม้า
        H(BX(0.62, 0.14, 0.2), 0, 0.22, 0.32);
        const tail = H(CY(0.09, 0.05, 0.55, 6), 0, -0.05, -0.55); tail.rotation.x = 0.5;
        part(new THREE.TorusGeometry(0.08, 0.025, 4, 8), '#ff8fab', 0, 0.2, -0.45, head).rotation.x = 0.5;
        break;
      }
      case 5: // มวยจุก
        H(SP(0.17), 0, 0.52, -0.02);
        part(new THREE.TorusGeometry(0.1, 0.03, 4, 10), '#ff8fab', 0, 0.42, -0.02, head).rotation.x = Math.PI / 2;
        H(BX(0.62, 0.12, 0.2), 0, 0.22, 0.32);
        break;
      default: // สั้นเรียบ
        H(BX(0.62, 0.14, 0.2), 0, 0.22, 0.32);
    }
  }
  // หน้า
  if (S.mask) part(BX(0.66, 0.15, 0.06), S.mask, 0, -0.01, 0.35, head);
  for (const s of [-1, 1]) {
    part(SP(0.06), '#2a2238', s * 0.15, -0.02, 0.38, head).scale.set(0.9, 1.2, 0.6);
    part(SP(0.02, 6, 4), '#ffffff', s * 0.15 + 0.02, 0.02, 0.42, head);
    part(SP(0.06), '#ffa4b0', s * 0.25, -0.12, 0.33, head).scale.set(1, 0.6, 0.4);
  }
  part(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI), '#7a3b45', 0, -0.14, 0.4, head).rotation.z = Math.PI;
  // หมวก
  if (S.hat === 'chef') {
    part(CY(0.27, 0.25, 0.32, 12), '#ffffff', 0, 0.48, -0.02, head);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(SP(0.17), '#ffffff', Math.cos(a) * 0.15, 0.7, Math.sin(a) * 0.15 - 0.02, head); }
    part(SP(0.2), '#ffffff', 0, 0.76, -0.02, head);
  }
  if (S.hat === 'scout') {
    part(CY(0.64, 0.64, 0.035, 16), '#a8844e', 0, 0.3, 0, head);
    part(CY(0.3, 0.36, 0.26, 12), '#a8844e', 0, 0.44, 0, head);
    part(CY(0.365, 0.365, 0.05, 12), '#5a4020', 0, 0.34, 0, head);
    for (const s of [-1, 1]) part(BX(0.12, 0.2, 0.02), '#a8844e', s * 0.12, 0.5, 0.05, head).rotation.z = s * 0.6; // รอยบุ๋มหมวก
  }
  if (S.helmet) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3, depthWrite: false }));
    head.add(helmet);
    part(new THREE.TorusGeometry(0.42, 0.05, 6, 20), '#c9cdd8', 0, -0.36, 0, head).rotation.x = Math.PI / 2;
  }

  if (opts.name) {
    const lab = makeLabel(opts.name, { size: 0.42, bg: 'rgba(59,51,85,0.75)', fg: '#ffffff' });
    lab.position.y = 2.0;
    g.add(lab);
    g.userData.label = lab;
  }

  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  g.add(blob);

  if (opts.lite) [body, head, ...legs, ...arms].forEach(mergeChildren);

  let phase = 0;
  let ride = null; // { id, pose, vehicle }
  let emote = null; // { type: 0 โบกมือ | 1 เต้น | 2 ดีใจ, t }
  const lerpTo = (obj, axis, target, k) => { obj.rotation[axis] += (target - obj.rotation[axis]) * k; };

  return {
    root: g, body, blob, legs, arms, head,
    /** ขึ้น/ลงพาหนะ: id = 0 ลง, 1–5 ขี่, 'passenger' = นั่งซ้อน (ไม่มีรถของตัวเอง) */
    setRide(id) {
      if (ride?.vehicle) g.remove(ride.vehicle.group);
      ride = null;
      body.position.z = 0;
      if (!id) return;
      const pose = RIDE_POSE[id];
      const vehicle = id === 'passenger' ? null : createVehicle(id);
      if (vehicle) g.add(vehicle.group);
      ride = { id, pose, vehicle };
    },
    get riding() { return ride?.id || 0; },
    /** ท่าทาง: 0 โบกมือ · 1 เต้น · 2 ดีใจ (เล่น 2.5 วินาที) */
    emote(type) { emote = { type, t: 0 }; },
    animate(dt, speed, airborne, t) {
      const k = Math.min(1, dt * 15);
      if (ride) {
        const p = ride.pose;
        ride.vehicle?.update(dt, speed, t);
        body.position.y = p.y + (ride.id === 4 ? Math.sin(t * 4) * 0.04 : 0);
        phase += dt * speed * 1.4;
        if (p.sit) {
          const pedal = ride.id === 'passenger' ? 0 : Math.sin(phase) * 0.35;
          lerpTo(legs[0], 'x', -1.25 + pedal, k); lerpTo(legs[1], 'x', -1.25 - pedal, k);
        } else {
          lerpTo(legs[0], 'x', -0.15, k); lerpTo(legs[1], 'x', 0.15, k);
        }
        const armX = p.arms === 'grip' ? -1.15 : p.arms === 'hold' ? -0.9 : 0;
        lerpTo(arms[0], 'x', armX, k); lerpTo(arms[1], 'x', armX, k);
        lerpTo(arms[0], 'z', p.arms === 'out' ? -0.9 : -0.12, k); lerpTo(arms[1], 'z', p.arms === 'out' ? 0.9 : 0.12, k);
        body.rotation.z = p.stand ? Math.sin(t * 2.2) * 0.04 : 0;
        head.rotation.z = 0;
        return;
      }
      const moving = speed > 0.5;
      if (emote && !moving && !airborne) {
        emote.t += dt;
        const e = emote.t;
        if (e > 2.5) { emote = null; body.rotation.y = 0; }
        else if (emote.type === 0) { // โบกมือ
          lerpTo(arms[1], 'z', 2.5 + Math.sin(e * 12) * 0.35, k); lerpTo(arms[1], 'x', 0, k);
          lerpTo(arms[0], 'z', -0.12, k); lerpTo(arms[0], 'x', 0, k);
          lerpTo(legs[0], 'x', 0, k); lerpTo(legs[1], 'x', 0, k);
          body.position.y = 0; head.rotation.z = Math.sin(e * 3) * 0.12;
          return;
        } else if (emote.type === 1) { // เต้น
          const b = Math.sin(e * 9);
          lerpTo(arms[0], 'z', -1.4 - b * 0.6, k); lerpTo(arms[1], 'z', 1.4 - b * 0.6, k);
          lerpTo(arms[0], 'x', 0, k); lerpTo(arms[1], 'x', 0, k);
          lerpTo(legs[0], 'x', b * 0.4, k); lerpTo(legs[1], 'x', -b * 0.4, k);
          body.position.y = Math.abs(b) * 0.12; body.rotation.y = Math.sin(e * 4.5) * 0.6; head.rotation.z = b * 0.15;
          return;
        } else { // ดีใจ: กระโดดชูแขน
          const j = Math.abs(Math.sin(e * 6));
          lerpTo(arms[0], 'x', -2.9, k); lerpTo(arms[1], 'x', -2.9, k);
          lerpTo(arms[0], 'z', -0.4, k); lerpTo(arms[1], 'z', 0.4, k);
          lerpTo(legs[0], 'x', -j * 0.5, k); lerpTo(legs[1], 'x', -j * 0.5, k);
          body.position.y = j * 0.45; head.rotation.z = 0;
          return;
        }
      } else if (emote && (moving || airborne)) { emote = null; body.rotation.y = 0; }
      lerpTo(arms[0], 'z', -0.12, k); lerpTo(arms[1], 'z', 0.12, k);
      body.rotation.z = 0;
      phase += dt * (moving ? 6 + speed * 0.9 : 0);
      const swing = airborne ? 0.5 : moving ? Math.sin(phase) * Math.min(1, speed / 6) * 0.8 : 0;
      lerpTo(legs[0], 'x', airborne ? -0.6 : swing, k);
      lerpTo(legs[1], 'x', airborne ? 0.3 : -swing, k);
      lerpTo(arms[0], 'x', airborne ? -2.4 : -swing, k);
      lerpTo(arms[1], 'x', airborne ? -2.4 : swing, k);
      body.position.y = moving && !airborne ? Math.abs(Math.sin(phase)) * 0.06 : Math.sin(t * 2) * 0.012;
      head.rotation.z = moving ? Math.sin(phase) * 0.05 : Math.sin(t * 1.3) * 0.03;
    },
  };
}
