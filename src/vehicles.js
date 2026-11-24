import * as THREE from 'three';
import { mat } from './util.js';

// โมเดลพาหนะโลว์โพลี · ทุกคันหันหน้าไปทาง +z · ตำแหน่งที่นั่ง/ที่ยืนของคนขับอยู่ที่ x=0 z=0
const COL = { 1: '#ff8fab', 2: '#4fc3e8', 3: '#a6e07a', 4: '#c7a6ff', 5: '#ffd66b' };

function wheel(parent, r, w, x, y, z, color = '#3b3355') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), mat(color));
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function part(parent, geo, color, x, y, z, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cy = (r, h, s = 8) => new THREE.CylinderGeometry(r, r, h, s);

function bike(g, c, len, seats) {
  const wheels = [];
  const front = len / 2, back = -len / 2;
  for (const z of [front, back]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 16), mat('#3b3355'));
    t.rotation.y = Math.PI / 2; t.position.set(0, 0.38, z); t.castShadow = true; g.add(t);
    const hub = part(g, cy(0.05, 0.1), '#dddddd', 0, 0.38, z); hub.rotation.z = Math.PI / 2;
    wheels.push(t);
  }
  const bar = part(g, bx(0.07, 0.07, len), c, 0, 0.62, 0); bar.rotation.x = 0;
  part(g, bx(0.06, 0.06, len * 0.7), c, 0, 0.48, -0.05).rotation.x = -0.25;
  for (const sz of seats) {
    part(g, cy(0.035, 0.42), c, 0, 0.62, sz);
    part(g, bx(0.22, 0.06, 0.3), '#3b3355', 0, 0.86, sz);
  }
  const stem = part(g, cy(0.035, 0.6), '#9a94b0', 0, 0.7, front - 0.1); stem.rotation.x = 0.25;
  part(g, bx(0.6, 0.05, 0.05), '#9a94b0', 0, 1.0, front - 0.18);
  for (const s of [-1, 1]) part(g, cy(0.04, 0.12), '#3b3355', s * 0.3, 1.0, front - 0.18).rotation.z = Math.PI / 2;
  if (seats.length > 1) part(g, bx(0.45, 0.05, 0.05), '#9a94b0', 0, 0.98, seats[0] - 0.42); // มือจับคนซ้อน
  return wheels;
}

export function createVehicle(id) {
  const g = new THREE.Group();
  const c = COL[id] || '#ffffff';
  let wheels = [], glow = null;
  if (id === 1) { // สเก็ตบอร์ด
    part(g, bx(0.34, 0.05, 0.95), c, 0, 0.11, 0);
    part(g, bx(0.3, 0.06, 0.12), c, 0, 0.13, 0.48).rotation.x = -0.35;
    part(g, bx(0.3, 0.06, 0.12), c, 0, 0.13, -0.48).rotation.x = 0.35;
    for (const z of [0.32, -0.32]) for (const x of [-0.14, 0.14]) wheels.push(wheel(g, 0.05, 0.05, x, 0.05, z, '#ffd66b'));
  } else if (id === 2) { // สกู๊ตเตอร์
    part(g, bx(0.26, 0.06, 0.8), c, 0, 0.12, -0.05);
    wheels.push(wheel(g, 0.1, 0.06, 0, 0.1, 0.42), wheel(g, 0.1, 0.06, 0, 0.1, -0.45));
    part(g, cy(0.03, 0.95), '#9a94b0', 0, 0.6, 0.38).rotation.x = -0.12;
    part(g, bx(0.5, 0.05, 0.05), '#9a94b0', 0, 1.05, 0.33);
    for (const s of [-1, 1]) part(g, cy(0.035, 0.1), c, s * 0.25, 1.05, 0.33).rotation.z = Math.PI / 2;
  } else if (id === 3) { // จักรยาน
    wheels = bike(g, c, 1.1, [-0.15]);
  } else if (id === 4) { // โฮเวอร์บอร์ด
    part(g, bx(0.55, 0.08, 0.32), c, 0, 0.0, 0);
    for (const s of [-1, 1]) part(g, cy(0.14, 0.09, 12), '#3b3355', s * 0.3, 0, 0);
    glow = part(g, cy(0.3, 0.02, 16), '#8ef0ff', 0, -0.08, 0, { emissive: '#4fe0ff', emissiveIntensity: 1.2 });
  } else if (id === 5) { // จักรยานซ้อนท้าย (ที่นั่งคนขับ z=0 คนซ้อน z=-0.85)
    wheels = bike(g, c, 2.0, [0, -0.85]);
    g.children.forEach((m) => { m.position.z += 0.15; });
  }
  return {
    group: g,
    update(dt, speed, t) {
      for (const w of wheels) w.rotation.x += dt * speed * (id <= 2 ? 6 : 3);
      if (glow) { g.position.y = 0.3 + Math.sin(t * 4) * 0.04; glow.material.emissiveIntensity = 1 + Math.sin(t * 8) * 0.3; }
    },
  };
}

// ท่าทางตอนขี่: ความสูงตัว ท่าแขนขา
export const RIDE_POSE = {
  1: { y: 0.15, stand: true, arms: 'out' },
  2: { y: 0.16, stand: true, arms: 'grip' },
  3: { y: 0.36, sit: true, arms: 'grip' },
  4: { y: 0.42, stand: true, arms: 'out' },
  5: { y: 0.36, sit: true, arms: 'grip' },
  passenger: { y: 0.36, sit: true, arms: 'hold', z: 0 },
};
export const PASSENGER_OFFSET = -0.85; // คนซ้อนนั่งหลังคนขับ (ตามแกนหน้า-หลัง)
