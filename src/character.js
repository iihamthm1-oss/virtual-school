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

  // ── ขา ──
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.48, 0);
    body.add(hip);
    const legColor = o.kind === 'long' ? o.bottom : skin;
    part(new THREE.CylinderGeometry(0.1, 0.09, 0.32, 7), legColor, 0, -0.26, 0, hip);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.3), o.extra === 'astro' ? '#ff8f3a' : o.extra === 'bear' ? '#7a5233' : '#2b2b33', 0, -0.44, 0.04, hip);
    if (o.kind !== 'long') part(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 7), '#ffffff', 0, -0.36, 0, hip);
    legs.push(hip);
  }
  // ── ช่วงล่าง ──
  if (o.kind === 'skirt') part(new THREE.CylinderGeometry(0.24, 0.36, 0.3, 8), o.bottom, 0, 0.46, 0);
  else part(new THREE.CylinderGeometry(0.26, 0.28, 0.2, 8), o.bottom, 0, 0.5, 0);
  // ── ลำตัว ──
  part(new THREE.CylinderGeometry(0.22, 0.27, 0.42, 8), o.shirt, 0, 0.78, 0);
  part(new THREE.BoxGeometry(0.3, 0.06, 0.12), o.shirt, 0, 0.98, 0.12);
  if (!o.extra) part(new THREE.BoxGeometry(0.07, 0.07, 0.02), '#2f3a6b', 0.11, 0.86, 0.24); // ตราโรงเรียน
  // ── ของตกแต่งตามชุด ──
  switch (o.extra) {
    case 'stripe': part(new THREE.CylinderGeometry(0.245, 0.255, 0.07, 8), '#ffffff', 0, 0.8, 0); break;
    case 'scout': {
      const sc = part(new THREE.ConeGeometry(0.16, 0.3, 4), '#d9534f', 0, 0.86, 0.2); sc.rotation.x = Math.PI;
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6), '#f2c94c', 0, 0.95, 0.22);
      break;
    }
    case 'sash': {
      const sa = part(new THREE.BoxGeometry(0.1, 0.55, 0.52), '#7c3aed', 0, 0.78, 0); sa.rotation.z = 0.7; sa.scale.z = 1;
      part(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 8), '#f2c94c', 0, 0.58, 0);
      break;
    }
    case 'doctor': {
      part(new THREE.CylinderGeometry(0.25, 0.32, 0.55, 8), '#ffffff', 0, 0.66, 0);
      const stc = part(new THREE.TorusGeometry(0.12, 0.02, 4, 10, Math.PI), '#3b3355', 0, 0.86, 0.22); stc.rotation.z = Math.PI;
      break;
    }
    case 'astro': {
      part(new THREE.BoxGeometry(0.36, 0.42, 0.18), '#d9dde8', 0, 0.8, -0.28);
      part(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 8), '#ff8f3a', 0, 0.62, 0);
      part(new THREE.BoxGeometry(0.12, 0.1, 0.02), '#4fc3e8', 0.08, 0.86, 0.25);
      break;
    }
    case 'hero': {
      const cape = part(new THREE.BoxGeometry(0.48, 0.75, 0.04), '#d9333f', 0, 0.62, -0.27); cape.rotation.x = 0.12;
      part(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 5), '#ffd66b', 0, 0.84, 0.25).rotation.x = Math.PI / 2;
      part(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 8), '#ffd66b', 0, 0.58, 0);
      break;
    }
  }
  // ── แขน ──
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.3, 0.94, 0);
    body.add(sh);
    const sleeve = o.extra === 'doctor' || o.kind === 'long' ? 0.22 : 0.16;
    part(new THREE.CylinderGeometry(0.085, 0.085, sleeve, 7), o.extra === 'doctor' ? '#ffffff' : o.shirt, 0, -sleeve / 2 + 0.01, 0, sh);
    part(new THREE.CylinderGeometry(0.07, 0.065, 0.22, 7), o.extra === 'astro' ? '#f3f3f7' : o.extra === 'bear' ? o.shirt : skin, 0, -0.24, 0, sh);
    part(new THREE.SphereGeometry(0.075, 7, 5), o.extra === 'astro' ? '#ff8f3a' : skin, 0, -0.37, 0, sh);
    sh.rotation.z = s * 0.12;
    arms.push(sh);
  }
  // ── หัว + ผม ──
  const head = new THREE.Group();
  head.position.y = 1.38;
  body.add(head);
  part(new THREE.IcosahedronGeometry(0.43, 1), skin, 0, 0, 0, head);
  const H = (geo, x, y, z) => part(geo, hairColor, x, y, z, head);
  const cap = H(new THREE.SphereGeometry(0.46, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.04, -0.03);
  cap.rotation.x = -0.25;
  switch (hairStyle) {
    case 1: // ทรงหนาม
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const sp = H(new THREE.ConeGeometry(0.1, 0.26, 5), Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2 - 0.05); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      H(new THREE.BoxGeometry(0.5, 0.1, 0.16), 0, 0.26, 0.33);
      break;
    case 2: // บ็อบ
      for (const s of [-1, 1]) H(new THREE.BoxGeometry(0.16, 0.5, 0.5), s * 0.38, -0.05, -0.04);
      H(new THREE.BoxGeometry(0.66, 0.16, 0.22), 0, 0.22, 0.31);
      break;
    case 3: // ยาว
      H(new THREE.BoxGeometry(0.78, 0.72, 0.28), 0, -0.18, -0.26);
      H(new THREE.BoxGeometry(0.62, 0.14, 0.2), 0, 0.22, 0.32);
      break;
    case 4: { // หางม้า
      H(new THREE.BoxGeometry(0.62, 0.14, 0.2), 0, 0.22, 0.32);
      const tail = H(new THREE.CylinderGeometry(0.09, 0.05, 0.55, 6), 0, -0.05, -0.55); tail.rotation.x = 0.5;
      part(new THREE.TorusGeometry(0.08, 0.025, 4, 8), '#ff8fab', 0, 0.2, -0.45, head).rotation.x = 0.5;
      break;
    }
    case 5: // มวยจุก
      H(new THREE.SphereGeometry(0.17, 8, 6), 0, 0.52, -0.02);
      part(new THREE.TorusGeometry(0.1, 0.03, 4, 10), '#ff8fab', 0, 0.42, -0.02, head).rotation.x = Math.PI / 2;
      H(new THREE.BoxGeometry(0.62, 0.12, 0.2), 0, 0.22, 0.32);
      break;
    default: // สั้นเรียบ
      H(new THREE.BoxGeometry(0.62, 0.14, 0.2), 0, 0.22, 0.32);
  }
  // หน้า
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.06, 8, 6), '#2a2238', s * 0.15, -0.02, 0.38, head).scale.set(0.9, 1.2, 0.6);
    part(new THREE.SphereGeometry(0.02, 6, 4), '#ffffff', s * 0.15 + 0.02, 0.02, 0.42, head);
    part(new THREE.SphereGeometry(0.06, 8, 6), '#ffa4b0', s * 0.25, -0.12, 0.33, head).scale.set(1, 0.6, 0.4);
  }
  part(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI), '#7a3b45', 0, -0.14, 0.4, head).rotation.z = Math.PI;
  // หมวก/ของบนหัว
  if (o.extra === 'chef') { part(new THREE.CylinderGeometry(0.28, 0.25, 0.3, 10), '#ffffff', 0, 0.5, -0.02, head); part(new THREE.SphereGeometry(0.33, 10, 7), '#ffffff', 0, 0.72, -0.02, head); }
  if (o.extra === 'scout') { part(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 14), '#a8844e', 0, 0.3, 0, head); part(new THREE.CylinderGeometry(0.3, 0.36, 0.25, 10), '#a8844e', 0, 0.44, 0, head); }
  if (o.extra === 'bear') for (const s of [-1, 1]) { part(new THREE.SphereGeometry(0.13, 8, 6), o.shirt, s * 0.3, 0.4, -0.02, head); part(new THREE.SphereGeometry(0.07, 6, 4), '#e8b99a', s * 0.3, 0.4, 0.06, head); }
  if (o.extra === 'astro') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), new THREE.MeshStandardMaterial({ color: '#cfefff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false }));
    head.add(helmet);
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
      lerpTo(arms[0], 'z', -0.12, k); lerpTo(arms[1], 'z', 0.12, k);
      body.rotation.z = 0;
      const moving = speed > 0.5;
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
