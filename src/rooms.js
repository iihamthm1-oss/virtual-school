// ของตกแต่งห้องพิเศษ: ห้องบริหาร ห้องดนตรี-ศิลปะ ห้องอนุบาล สหกรณ์ โรงยิม
// เลือกแบบห้องจากชื่อห้อง (ป้ายหน้าห้อง) แล้ววางของในพิกัดของห้องนั้น
import * as THREE from 'three';
import { mat, box, cyl, pick, fillCentered } from './util.js';

const KINDS = [
  ['ยิม', 'gym'], ['สหกรณ์', 'coop'], ['ผู้อำนวยการ', 'director'], ['ธุรการ', 'office'], ['วิชาการ', 'office'],
  ['พยาบาล', 'nurse'], ['แนะแนว', 'guide'], ['ประชุม', 'meeting'], ['พักครู', 'lounge'],
  ['ดนตรีไทย', 'thaimusic'], ['ซ้อม', 'band'], ['ดนตรี', 'music'], ['นาฏ', 'dance'],
  ['จัดแสดง', 'gallery'], ['ปั้น', 'pottery'], ['ศิลป', 'art'], ['นอน', 'nap'], ['อนุบาล', 'kinder'],
];
export const roomKind = (label) => KINDS.find(([k]) => label.includes(k))?.[1];

export function roomSignColor(label) {
  const k = roomKind(label);
  if (!k) return null;
  return {
    gym: '#ff9e5e', coop: '#4fb36a', director: '#5b7fd6', office: '#7c9cf0', nurse: '#ef6f7f', guide: '#7cc6b6',
    meeting: '#5b7fd6', lounge: '#7c9cf0', thaimusic: '#d98a3a', band: '#f0a04f', music: '#f0a04f', dance: '#e57fd0',
    gallery: '#c46fb0', pottery: '#c97a5a', art: '#e57fd0', nap: '#ffb84f', kinder: '#ffb84f',
  }[k];
}

const POP = ['#ff8fab', '#4fc3e8', '#ffd66b', '#a6e07a', '#c7a6ff', '#ffb38a'];
const WOOD = '#c99a6b', DARK = '#3b3355';

// ── ภาพวาดในกรอบ (วาดครั้งเดียว ใช้ซ้ำ) ──
const artMats = [];
function artMat(i) {
  i %= 6;
  if (artMats[i]) return artMats[i];
  const c = document.createElement('canvas'); c.width = 160; c.height = 120;
  const g = c.getContext('2d');
  const P = [['#bfe6ff', '#ffd66b', '#7cc96b', '#5fae5e'], ['#ffe0ec', '#ff6b8b', '#4fc3e8', '#ffd66b'], ['#fff3d6', '#e2735e', '#5fae5e', '#7c6cf0'],
    ['#2f2a45', '#ffd66b', '#c7a6ff', '#ffffff'], ['#e8f5de', '#4f8fe8', '#ffb84f', '#ef6f7f'], ['#fdf0f3', '#a6c75a', '#f0a04f', '#5b4fc0']][i];
  g.fillStyle = P[0]; g.fillRect(0, 0, 160, 120);
  if (i % 3 === 0) { // ทิวเขากับพระอาทิตย์
    g.fillStyle = P[1]; g.beginPath(); g.arc(118, 32, 17, 0, 7); g.fill();
    g.fillStyle = P[2]; g.beginPath(); g.moveTo(-10, 120); g.lineTo(50, 48); g.lineTo(100, 120); g.fill();
    g.fillStyle = P[3]; g.beginPath(); g.moveTo(55, 120); g.lineTo(112, 60); g.lineTo(170, 120); g.fill();
  } else if (i % 3 === 1) { // บ้านกับต้นไม้
    g.fillStyle = '#9fdc7a'; g.fillRect(0, 88, 160, 32);
    g.fillStyle = P[3]; g.fillRect(28, 56, 52, 40);
    g.fillStyle = P[1]; g.beginPath(); g.moveTo(20, 58); g.lineTo(54, 28); g.lineTo(88, 58); g.fill();
    g.fillStyle = P[2]; g.fillRect(46, 72, 14, 24);
    g.fillStyle = '#8a5a3c'; g.fillRect(118, 60, 8, 34);
    g.fillStyle = '#5fae5e'; g.beginPath(); g.arc(122, 52, 20, 0, 7); g.fill();
  } else { // ศิลปะนามธรรม
    for (let k = 0; k < 8; k++) {
      g.fillStyle = P[1 + (k % 3)];
      const x = (k * 37) % 150, y = (k * 53) % 110;
      if (k % 2) { g.beginPath(); g.arc(x + 10, y + 10, 10 + (k % 3) * 6, 0, 7); g.fill(); } else g.fillRect(x, y, 22 + k * 3, 14 + k * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  artMats[i] = new THREE.MeshBasicMaterial({ map: tex });
  return artMats[i];
}
/** ภาพวาดมีกรอบ: (px,py,pz) คือจุดกึ่งกลางภาพ หน้าภาพหันไป +z ของมุม rotY */
function painting(parent, w, h, px, py, pz, rotY, i) {
  const grp = new THREE.Group(); grp.position.set(px, py, pz); grp.rotation.y = rotY; parent.add(grp);
  box(grp, w + 0.14, h + 0.14, 0.05, WOOD, 0, -(h + 0.14) / 2, 0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat(i)); m.position.z = 0.03; grp.add(m);
}

/** ป้ายข้อความบนผนัง (คะแนนโรงยิม ป้ายสหกรณ์) */
function textPanel(parent, lines, w, h, px, py, pz, rotY, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 24); g.fill();
  g.fillStyle = fg; g.textBaseline = 'middle';
  lines.forEach(([t, size], k) => { g.font = `700 ${size}px Mitr, sans-serif`; fillCentered(g, t, 256, ((k + 0.5) * c.height) / lines.length, 490); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(px, py, pz); m.rotation.y = rotY; parent.add(m);
}

/**
 * วางของในห้องตามแบบ คืน true ถ้าจัดการห้องนี้แล้ว
 * R: { kind, B, S, SC, fu, Y, cx, inA, inB, back, fr, rw, ceil, fan, accent, boardFace, label }
 */
export function furnishRoom(R) {
  const { kind, B, S, SC, fu, Y, cx, inA, inB, back, fr, rw, ceil, fan, accent, boardFace } = R;
  if (!kind) return false;
  const depth = fr - back;
  const grp = (px, pz, rot = 0) => { const g = new THREE.Group(); g.position.set(px, Y, pz); g.rotation.y = rot; fu.add(g); return g; };
  // เก้าอี้: ค่าเริ่มต้นคนนั่งหันไปทาง -z (พนักพิงอยู่ฝั่ง +z)
  const chair = (px, pz, rot = 0, col = '#9fd3e6', s = 1) => {
    const g = grp(px, pz, rot);
    box(g, 0.45 * s, 0.06, 0.45 * s, col, 0, 0.42 * s, 0);
    box(g, 0.45 * s, 0.5 * s, 0.06, col, 0, 0.48 * s, 0.2 * s);
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) box(g, 0.04, 0.42 * s, 0.04, '#9a94b0', lx * s, 0, lz * s);
    SC(px, pz, 0.3 * s);
  };
  const plant = (px, pz, big = 0.45) => {
    B(fu, 0.5, 0.45, 0.5, '#d98c6b', px, 0, pz);
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(big, 0), mat('#6dbb63', { name: 'leaf' }));
    pl.position.set(px, Y + 0.45 + big, pz); fu.add(pl);
    SC(px, pz, 0.4);
  };
  // โต๊ะทำงานพร้อมคอมพิวเตอร์ (คนนั่งฝั่ง +z)
  const workDesk = (px, pz, withChair = true, top = '#f6e3c6') => {
    B(fu, 1.4, 0.06, 0.7, top, px, 0.74, pz);
    for (const sx of [-0.66, 0.66]) B(fu, 0.06, 0.74, 0.64, '#d8cbb4', px + sx, 0, pz);
    B(fu, 0.42, 0.6, 0.6, '#e9e1d4', px + 0.4, 0.1, pz);
    B(fu, 0.55, 0.36, 0.05, DARK, px - 0.1, 0.86, pz - 0.2);
    B(fu, 0.5, 0.3, 0.02, '#7fd3f7', px - 0.1, 0.89, pz - 0.17, { emissive: '#4fa9d6', emissiveIntensity: 0.6 });
    B(fu, 0.1, 0.06, 0.1, DARK, px - 0.1, 0.8, pz - 0.2);
    B(fu, 0.46, 0.03, 0.16, '#e9e4f2', px - 0.1, 0.8, pz + 0.1);
    B(fu, 0.28, 0.04, 0.22, '#ffffff', px + 0.45, 0.8, pz - 0.05);
    S(px - 0.7, px + 0.7, pz - 0.35, pz + 0.35);
    if (withChair) chair(px - 0.1, pz + 0.7, 0, '#5b7fd6');
  };
  const bookshelf = (px, pz, rot = 0, wdt = 1.8) => {
    const g = grp(px, pz, rot);
    box(g, wdt, 2.0, 0.42, WOOD);
    const n = Math.floor((wdt - 0.2) / 0.24);
    for (let r = 0; r < 3; r++) for (let q = 0; q < n; q++) if ((q + r) % 5 !== 3) box(g, 0.2, 0.36 + ((q * 7) % 3) * 0.04, 0.3, pick(POP), -wdt / 2 + 0.2 + q * 0.24, 0.22 + r * 0.62, 0.08);
    if (rot === 0 || rot === Math.PI) SC(px - wdt / 4, pz, 0.45), SC(px + wdt / 4, pz, 0.45);
    else SC(px, pz - wdt / 4, 0.45), SC(px, pz + wdt / 4, 0.45);
  };
  const sofa = (px, pz, rot, col = '#7cc6b6', len = 1.9) => {
    const g = grp(px, pz, rot);
    box(g, len, 0.42, 0.8, col);
    box(g, len, 0.55, 0.2, col, 0, 0.42, 0.3);
    for (const sx of [-1, 1]) box(g, 0.18, 0.62, 0.8, col, sx * (len / 2 - 0.09), 0, 0);
    for (let q = 0; q < 2; q++) box(g, len / 2 - 0.2, 0.12, 0.55, '#ffffff', -len / 4 + q * (len / 2), 0.42, -0.05);
    SC(px, pz, len / 2);
  };
  const board = (kindName, w = Math.min(rw * 0.6, 4.6), y = 1.0) => {
    B(fu, w + 0.2, 1.5, 0.05, '#c7b6f0', cx, y - 0.1, back + 0.03);
    B(fu, w, 1.3, 0.06, '#ffffff', cx, y, back + 0.06);
    boardFace(fu, kindName, w - 0.1, 1.2, cx, Y + y + 0.65, back + 0.1);
  };
  const rug = (w, d, col, px, pz) => B(fu, w, 0.02, d, col, px, 0.13, pz);

  switch (kind) {
    // ═════════ อาคารอำนวยการ ═════════
    case 'office': {
      const cw = Math.min(3, inB - cx - 1.6);
      B(fu, cw, 1.0, 0.6, '#ffffff', cx + 1.3 + cw / 2, 0, fr - 2.2);
      B(fu, cw + 0.1, 0.06, 0.75, accent, cx + 1.3 + cw / 2, 1.0, fr - 2.2);
      B(fu, 0.5, 0.2, 0.3, '#ffd66b', cx + 1.3 + cw / 2, 1.06, fr - 2.2);
      S(cx + 1.3, cx + 1.3 + cw, fr - 2.55, fr - 1.85);
      const dx = Math.min(1.9, rw / 4.4);
      for (const sx of [-dx, dx]) for (const pz of [back + 1.9, back + 4.1]) workDesk(cx + sx + 0.3, pz);
      for (let i = 0; i < 3; i++) {
        B(fu, 0.55, 1.35, 0.85, '#cfd8e6', inA + 0.3, 0, back + 0.95 + i * 0.9);
        for (const hy of [0.35, 0.75, 1.15]) B(fu, 0.02, 0.05, 0.3, '#8f88a8', inA + 0.58, hy, back + 0.95 + i * 0.9);
      }
      S(inA, inA + 0.6, back + 0.5, back + 3.3);
      B(fu, 0.6, 0.7, 0.5, '#e9e4f2', inB - 0.4, 0, back + 0.4);
      B(fu, 0.5, 0.22, 0.42, '#ffffff', inB - 0.4, 0.7, back + 0.4);
      B(fu, 0.35, 1.0, 0.35, '#ffffff', inB - 0.4, 0, back + 1.25);
      cyl(fu, 0.15, 0.15, 0.4, '#9fd3e6', inB - 0.4, Y + 1.0, back + 1.25, 8);
      S(inB - 0.7, inB, back, back + 1.5);
      B(fu, 2.6, 1.2, 0.05, '#d9b48a', cx, 1.2, back + 0.03);
      for (let q = 0; q < 5; q++) B(fu, 0.38, 0.5, 0.02, POP[q], cx - 1.0 + q * 0.5, 1.45 - (q % 2) * 0.12, back + 0.07);
      plant(inB - 0.5, fr - 0.6);
      fan(cx - rw / 4, 0); fan(cx + rw / 4, 0);
      return true;
    }
    case 'nurse': {
      const nb = rw > 7 ? 3 : 2, sp = (rw - 1.6) / nb;
      for (let i = 0; i < nb; i++) {
        const bx = inA + 0.4 + sp * (i + 0.5);
        B(fu, 1.0, 0.45, 2.0, '#e9e4f2', bx, 0, back + 1.15);
        B(fu, 0.94, 0.16, 1.9, '#ffffff', bx, 0.45, back + 1.2);
        B(fu, 0.96, 0.06, 1.05, '#9fd3e6', bx, 0.61, back + 1.62);
        B(fu, 0.6, 0.12, 0.35, '#ffffff', bx, 0.61, back + 0.45);
        B(fu, 1.0, 0.95, 0.06, '#cfd8e6', bx, 0, back + 0.1);
        S(bx - 0.5, bx + 0.5, back, back + 2.2);
        if (i > 0) {
          B(fu, 0.04, 1.8, 2.1, '#a6e0c8', bx - sp / 2, 0.15, back + 1.15);
          S(bx - sp / 2 - 0.05, bx - sp / 2 + 0.05, back, back + 2.2);
        }
        B(fu, 0.03, 0.03, 2.1, '#d0d0d8', bx - sp / 2, 1.98, back + 1.15);
      }
      B(fu, 0.45, 1.8, 1.2, '#ffffff', inB - 0.25, 0, fr - 3.2);
      B(fu, 0.02, 1.2, 1.0, '#d6f1ff', inB - 0.49, 0.5, fr - 3.2, { emissive: '#c4ecff', emissiveIntensity: 0.3 });
      for (let q = 0; q < 4; q++) B(fu, 0.15, 0.2, 0.12, POP[q], inB - 0.3, 0.8 + (q % 2) * 0.45, fr - 3.55 + q * 0.22);
      S(inB - 0.5, inB, fr - 3.8, fr - 2.6);
      B(fu, 0.03, 0.55, 0.16, '#ef4f5f', inB - 0.03, 2.25, fr - 3.2);
      B(fu, 0.03, 0.16, 0.55, '#ef4f5f', inB - 0.03, 2.445, fr - 3.2);
      workDesk(inA + 1.3, fr - 3.0, true, '#ffffff');
      B(fu, 0.45, 0.06, 0.4, DARK, cx + 1.8, 0.12, fr - 1.9);
      cyl(fu, 0.025, 0.025, 1.9, '#d0d0d8', cx + 1.8, Y + 0.12, fr - 2.08, 5);
      SC(cx + 1.8, fr - 2.0, 0.3);
      B(fu, 0.6, 0.85, 0.45, '#ffffff', inB - 0.4, 0, fr - 1.2);
      B(fu, 0.4, 0.04, 0.3, '#9fd3e6', inB - 0.4, 0.85, fr - 1.2);
      S(inB - 0.7, inB, fr - 1.5, fr - 0.9);
      fan(cx, back + 3.5);
      return true;
    }
    case 'guide': {
      const tz = back + 3.6;
      cyl(fu, 0.9, 0.9, 0.06, '#ffffff', cx, Y + 0.72, tz, 14);
      cyl(fu, 0.08, 0.12, 0.72, '#9a94b0', cx, Y, tz, 6);
      for (let q = 0; q < 4; q++) { const a = q * 1.571 + 0.4; cyl(fu, 0.22, 0.22, 0.45, POP[q], cx + Math.cos(a) * 1.25, Y, tz + Math.sin(a) * 1.25, 10); }
      SC(cx, tz, 1.5);
      bookshelf(cx - 1.4, back + 0.3); bookshelf(cx + 1.4, back + 0.3);
      sofa(inA + 0.55, fr - 2.6, Math.PI / 2, '#f6a6b2');
      B(fu, 0.05, 0.9, 0.7, '#4fc3e8', inB - 0.03, 1.4, back + 2.2);
      B(fu, 0.05, 0.9, 0.7, '#ffd66b', inB - 0.03, 1.4, back + 3.1);
      B(fu, 0.05, 0.9, 0.7, '#a6e07a', inB - 0.03, 1.4, back + 4.0);
      plant(inB - 0.5, fr - 0.6);
      fan(cx, tz);
      return true;
    }
    case 'director': {
      const dz = back + 2.0;
      rug(3.6, 2.8, '#c4524a', cx, dz + 0.6);
      B(fu, 2.3, 0.08, 1.05, '#8a5a3c', cx, 0.76, dz);
      B(fu, 2.2, 0.76, 0.1, '#a8775a', cx, 0, dz + 0.45);
      for (const sx of [-1.05, 1.05]) B(fu, 0.12, 0.76, 1.0, '#a8775a', cx + sx, 0, dz);
      B(fu, 0.7, 0.14, 0.06, '#ffd66b', cx, 0.84, dz + 0.4);
      B(fu, 0.55, 0.36, 0.05, DARK, cx - 0.6, 0.86, dz - 0.25);
      B(fu, 0.5, 0.3, 0.02, '#7fd3f7', cx - 0.6, 0.89, dz - 0.22, { emissive: '#4fa9d6', emissiveIntensity: 0.6 });
      cyl(fu, 0.06, 0.06, 0.14, '#5b7fd6', cx + 0.75, Y + 0.84, dz - 0.2, 8);
      S(cx - 1.15, cx + 1.15, dz - 0.55, dz + 0.55);
      const hc = grp(cx, dz - 0.95, Math.PI);
      box(hc, 0.6, 0.5, 0.6, DARK, 0, 0, 0); box(hc, 0.62, 1.05, 0.12, DARK, 0, 0.5, 0.26);
      SC(cx, dz - 0.95, 0.35);
      chair(cx - 0.6, dz + 1.1, 0, WOOD); chair(cx + 0.6, dz + 1.1, 0, WOOD);
      // เสาธงชาติกับธงโรงเรียน
      for (const [fx, school] of [[cx - 1.9, false], [cx + 1.9, true]]) {
        cyl(fu, 0.03, 0.03, 2.0, '#d9c27a', fx, Y, back + 0.5, 6);
        cyl(fu, 0.2, 0.2, 0.08, '#d9c27a', fx, Y, back + 0.5, 8);
        const stripes = school ? [['#7c6cf0', 0.2], ['#ffd66b', 0.2]] : [['#A51931', 0.07], ['#F4F5F8', 0.07], ['#2D2A4A', 0.13], ['#F4F5F8', 0.07], ['#A51931', 0.07]];
        let fy = 1.95;
        for (const [c, h] of stripes) { fy -= h; B(fu, 0.6, h, 0.02, c, fx + 0.33, fy, back + 0.5); }
        SC(fx, back + 0.5, 0.25);
      }
      B(fu, 0.95, 0.95, 0.05, '#ffd66b', cx, 1.55, back + 0.03);
      cyl(fu, 0.32, 0.32, 0.03, '#7c6cf0', cx, Y + 1.85, back + 0.07, 16).rotation.x = Math.PI / 2;
      bookshelf(inB - 0.25, back + 1.5, -Math.PI / 2);
      sofa(inA + 0.55, fr - 2.4, Math.PI / 2, '#5b7fd6');
      B(fu, 0.65, 0.4, 1.1, '#a8775a', inA + 1.6, 0, fr - 2.4);
      cyl(fu, 0.1, 0.07, 0.18, '#ffffff', inA + 1.6, Y + 0.4, fr - 2.5, 8);
      S(inA + 1.25, inA + 1.95, fr - 2.95, fr - 1.85);
      plant(inB - 0.5, fr - 0.6, 0.55);
      fan(cx, dz + 1.5);
      return true;
    }
    case 'meeting': {
      const tz = back + 4.4, tw = Math.max(3, rw - 3.2);
      B(fu, tw, 0.08, 1.6, '#a8775a', cx, 0.74, tz);
      for (const sx of [-1, 1]) B(fu, 0.12, 0.74, 1.2, '#8a5a3c', cx + sx * (tw / 2 - 0.4), 0, tz);
      S(cx - tw / 2, cx + tw / 2, tz - 0.8, tz + 0.8);
      const n = Math.floor(tw / 1.0);
      for (let q = 0; q < n; q++) {
        const px = cx - ((n - 1) * 1.0) / 2 + q;
        chair(px, tz - 1.15, Math.PI, '#5b7fd6');
        chair(px, tz + 1.15, 0, '#5b7fd6');
        cyl(fu, 0.035, 0.035, 0.2, '#ffffff', px, Y + 0.82, tz + (q % 2 ? 0.45 : -0.45), 6);
      }
      chair(cx - tw / 2 - 0.6, tz, -Math.PI / 2, DARK);
      B(fu, 3.4, 2.0, 0.05, '#ffffff', cx, 0.95, back + 0.04);
      boardFace(fu, 'meet', 3.2, 1.8, cx, Y + 1.95, back + 0.08);
      B(fu, 0.42, 0.16, 0.36, '#e9e4f2', cx, ceil - 0.55, tz - 1.0);
      cyl(fu, 0.02, 0.02, 0.4, '#bbbbbb', cx, Y + ceil - 0.4, tz - 1.0, 5);
      plant(inA + 0.5, back + 0.5); plant(inB - 0.5, back + 0.5);
      return true;
    }
    case 'lounge': {
      const zc = back + 3.4;
      for (const gx of [cx - rw / 4 - 0.2, cx + rw / 4 + 0.2]) {
        B(fu, 2.9, 0.06, 1.5, '#f6e3c6', gx, 0.74, zc);
        B(fu, 2.8, 0.74, 1.3, '#e9e1d4', gx, 0, zc);
        B(fu, 2.8, 0.35, 0.04, accent, gx, 0.8, zc);
        for (const sx of [-0.7, 0.7]) for (const sz of [-1, 1]) {
          B(fu, 0.5, 0.32, 0.04, DARK, gx + sx, 0.82, zc + sz * 0.35);
          B(fu, 0.3, 0.05, 0.22, pick(['#ffffff', '#ffd66b', '#9fd3e6']), gx + sx + 0.35, 0.8, zc + sz * 0.55);
          chair(gx + sx, zc + sz * 1.05, sz > 0 ? 0 : Math.PI, '#7c9cf0');
        }
        S(gx - 1.45, gx + 1.45, zc - 0.75, zc + 0.75);
      }
      B(fu, 0.6, 0.9, 1.9, '#ffffff', inB - 0.3, 0, back + 1.2);
      cyl(fu, 0.12, 0.14, 0.25, '#c0c0c8', inB - 0.3, Y + 0.9, back + 0.7, 8);
      for (let q = 0; q < 3; q++) cyl(fu, 0.05, 0.05, 0.1, POP[q], inB - 0.3, Y + 0.9, back + 1.2 + q * 0.2, 6);
      B(fu, 0.7, 1.65, 0.7, '#cfe7f5', inB - 0.38, 0, back + 2.7);
      S(inB - 0.75, inB, back, back + 3.1);
      sofa(inA + 1.5, fr - 0.6, Math.PI, '#f6a6b2');
      board('duty', Math.min(rw * 0.5, 3.6));
      fan(cx - rw / 4, zc); fan(cx + rw / 4, zc);
      return true;
    }

    // ═════════ อาคารศิลปะ-ดนตรี ═════════
    case 'thaimusic': {
      rug(rw - 1.4, 6, '#e8c07a', cx, back + 3.8);
      const ranat = (px, pz) => {
        B(fu, 0.5, 0.12, 0.36, '#8a3a2a', px, 0, pz);
        B(fu, 1.35, 0.32, 0.46, '#8a3a2a', px, 0.12, pz);
        for (const sx of [-0.62, 0.62]) B(fu, 0.12, 0.22, 0.46, '#a5463e', px + sx, 0.44, pz);
        for (let k = 0; k < 13; k++) B(fu, 0.07, 0.03, 0.4 - k * 0.012, '#e8c07a', px - 0.54 + k * 0.09, 0.47, pz);
        B(fu, 0.45, 0.1, 0.45, '#c4524a', px, 0, pz + 0.75);
        SC(px, pz, 0.75);
      };
      const khong = (px, pz) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 22, Math.PI * 1.65), mat('#a8775a'));
        ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI * 0.67; ring.position.set(px, Y + 0.32, pz); fu.add(ring);
        for (let k = 0; k < 15; k++) {
          const a = Math.PI * 0.67 + (k / 14) * Math.PI * 1.65;
          cyl(fu, 0.085, 0.085, 0.06, '#d9b04a', px + Math.cos(a) * 0.72, Y + 0.35, pz - Math.sin(a) * 0.72, 8);
        }
        B(fu, 0.4, 0.1, 0.4, '#c4524a', px, 0, pz);
        SC(px, pz, 0.85);
      };
      const drum = (px, pz) => {
        cyl(fu, 0.28, 0.3, 0.55, '#8a3a2a', px, Y + 0.25, pz, 10);
        cyl(fu, 0.29, 0.29, 0.03, '#f4ead8', px, Y + 0.8, pz, 10);
        for (const a of [0, 2.1, 4.2]) cyl(fu, 0.03, 0.03, 0.26, '#3b3355', px + Math.cos(a) * 0.2, Y, pz + Math.sin(a) * 0.2, 4);
        SC(px, pz, 0.35);
      };
      khong(cx - 2.2, back + 2.0);
      drum(cx + 1.9, back + 1.8); drum(cx + 2.6, back + 1.8);
      ranat(cx - 1.7, back + 4.3); ranat(cx + 1.7, back + 4.3);
      // ขิมบนขาตั้ง
      B(fu, 0.9, 0.12, 0.45, '#a8775a', cx, 0.6, back + 2.0);
      for (const sx of [-0.38, 0.38]) B(fu, 0.06, 0.6, 0.3, '#8a5a3c', cx + sx, 0, back + 2.0);
      S(cx - 0.5, cx + 0.5, back + 1.75, back + 2.25);
      // ซอแขวนผนัง
      for (let q = 0; q < 3; q++) {
        B(fu, 0.05, 0.95, 0.05, '#8a5a3c', inA + 0.06, 1.0, back + 1.5 + q * 0.5);
        cyl(fu, 0.09, 0.09, 0.18, '#c99a6b', inA + 0.12, Y + 1.0, back + 1.5 + q * 0.5, 8);
      }
      board('thai');
      fan(cx, back + 3.2);
      return true;
    }
    case 'music': {
      const pz = back + 1.6;
      B(fu, 0.62, 1.25, 1.5, DARK, inA + 0.35, 0, pz);
      B(fu, 0.34, 0.08, 1.42, DARK, inA + 0.82, 0.72, pz);
      B(fu, 0.24, 0.03, 1.36, '#ffffff', inA + 0.84, 0.8, pz);
      for (let k = 0; k < 10; k++) if (k % 7 !== 2) B(fu, 0.12, 0.04, 0.05, '#111111', inA + 0.8, 0.83, pz - 0.6 + k * 0.13);
      B(fu, 0.36, 0.48, 0.8, DARK, inA + 1.35, 0, pz);
      S(inA, inA + 1.0, pz - 0.75, pz + 0.75); SC(inA + 1.35, pz, 0.4);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        const px = cx - 1.5 + c * 1.25 + r * 0.6, sz = back + 3.6 + r * 1.7;
        if (px > inB - 0.6) continue;
        chair(px, sz, 0, pick(['#f0a04f', '#ffd66b']));
        cyl(fu, 0.02, 0.02, 1.0, DARK, px, Y, sz - 0.6, 5);
        const st = B(fu, 0.42, 0.3, 0.02, DARK, px, 1.0, sz - 0.6); st.rotation.x = -0.35;
      }
      const guitar = (gx, gz, col) => {
        const g = grp(gx, gz, -0.3);
        const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 12), mat(col)); lo.rotation.x = Math.PI / 2; lo.position.y = 0.42; g.add(lo);
        const hi = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 12), mat(col)); hi.rotation.x = Math.PI / 2; hi.position.y = 0.7; g.add(hi);
        box(g, 0.06, 0.62, 0.04, '#5a3a2a', 0, 0.78, 0); box(g, 0.1, 0.14, 0.05, '#3b2a2a', 0, 1.38, 0);
        box(g, 0.3, 0.06, 0.25, DARK, 0, 0, 0.05);
        SC(gx, gz, 0.3);
      };
      guitar(inB - 0.5, back + 0.6, '#e2735e'); guitar(inB - 1.2, back + 0.6, '#ffd66b');
      B(fu, 0.6, 0.75, 0.4, DARK, inB - 0.45, 0, back + 1.7);
      B(fu, 0.5, 0.5, 0.02, '#6c6a80', inB - 0.45, 0.13, back + 1.91);
      S(inB - 0.75, inB, back + 1.45, back + 1.95);
      board('music');
      fan(cx, back + 4.4);
      return true;
    }
    case 'band': {
      for (let i = 0; i < Math.floor((rw - 0.6) / 0.62); i++) for (let r = 0; r < 3; r++) B(fu, 0.56, 0.56, 0.06, (i + r) % 2 ? '#7c6cf0' : '#5b4fc0', inA + 0.6 + i * 0.62, 0.9 + r * 0.6, back + 0.04);
      rug(3.8, 2.8, '#c4524a', cx, back + 2.0);
      const dz = back + 1.8;
      const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.36, 14), mat('#e2735e')); bd.rotation.x = Math.PI / 2; bd.position.set(cx, Y + 0.48, dz + 0.3); fu.add(bd);
      cyl(fu, 0.35, 0.35, 0.02, '#ffffff', cx, Y + 0.47, dz + 0.49, 14).rotation.x = Math.PI / 2;
      cyl(fu, 0.19, 0.19, 0.13, '#e9e4f2', cx + 0.55, Y + 0.62, dz + 0.45, 12);
      for (const sx of [-0.22, 0.22]) cyl(fu, 0.14, 0.14, 0.18, '#e2735e', cx + sx, Y + 0.85, dz + 0.2, 10);
      for (const [sx, sz] of [[-0.75, 0.1], [0.85, -0.1]]) {
        cyl(fu, 0.015, 0.015, 1.2, '#c0c0c8', cx + sx, Y, dz + sz, 4);
        cyl(fu, 0.27, 0.27, 0.015, '#e8c07a', cx + sx, Y + 1.2, dz + sz, 14);
      }
      cyl(fu, 0.18, 0.18, 0.48, DARK, cx, Y, dz - 0.35, 10);
      SC(cx, dz, 1.0);
      for (const ax of [cx - 2.6, cx + 2.6]) {
        B(fu, 0.65, 0.75, 0.38, DARK, ax, 0, back + 0.6);
        B(fu, 0.55, 0.5, 0.02, '#6c6a80', ax, 0.13, back + 0.8);
        S(ax - 0.35, ax + 0.35, back + 0.4, back + 0.8);
      }
      for (const mx of [cx - 1.4, cx + 1.4]) {
        cyl(fu, 0.15, 0.15, 0.03, DARK, mx, Y, back + 3.3, 8);
        cyl(fu, 0.015, 0.015, 1.45, '#c0c0c8', mx, Y, back + 3.3, 4);
        const mic = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#6c6a80')); mic.position.set(mx, Y + 1.5, back + 3.25); fu.add(mic);
        SC(mx, back + 3.3, 0.2);
      }
      B(fu, 1.25, 0.08, 0.36, DARK, inB - 1.2, 0.85, back + 3.6);
      B(fu, 1.15, 0.03, 0.18, '#ffffff', inB - 1.2, 0.93, back + 3.65);
      for (const sx of [-0.45, 0.45]) B(fu, 0.05, 0.85, 0.3, '#6c6a80', inB - 1.2 + sx, 0, back + 3.6);
      S(inB - 1.85, inB - 0.55, back + 3.4, back + 3.8);
      chair(inA + 1, fr - 1.6, Math.PI / 2, '#f0a04f'); chair(inA + 1, fr - 2.5, Math.PI / 2, '#f0a04f');
      fan(cx, back + 4.5);
      return true;
    }
    case 'dance': {
      B(fu, rw - 0.6, 2.1, 0.04, '#dff4ff', cx, 0.3, back + 0.03, { emissive: '#bfe8ff', emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.1 });
      B(fu, rw - 0.5, 0.08, 0.06, '#ffffff', cx, 2.4, back + 0.04);
      rug(rw - 1, depth - 2.4, '#e8c9a0', cx, back + (depth - 2.4) / 2 + 0.4);
      for (const bx of [inA + 0.22, inB - 0.22]) {
        B(fu, 0.05, 0.05, 5.0, WOOD, bx, 1.0, back + 3.2);
        for (const bz of [back + 1.0, back + 3.2, back + 5.4]) B(fu, 0.2, 0.04, 0.04, '#c0c0c8', bx + (bx < cx ? -0.1 : 0.1), 1.0, bz);
      }
      const rx = inB - 1.2, rz = fr - 1.6;
      for (const sx of [-0.8, 0.8]) cyl(fu, 0.03, 0.03, 1.7, '#c0c0c8', rx + sx, Y, rz, 5);
      B(fu, 1.7, 0.04, 0.04, '#c0c0c8', rx, 1.68, rz);
      ['#ff8fab', '#ffd66b', '#a6e07a', '#c7a6ff', '#ff9e5e', '#4fc3e8'].forEach((c, q) => B(fu, 0.22, 0.95, 0.4, c, rx - 0.65 + q * 0.26, 0.7, rz));
      S(rx - 0.9, rx + 0.9, rz - 0.3, rz + 0.3);
      B(fu, 1.4, 0.8, 0.45, WOOD, inA + 1.0, 0, fr - 1.0);
      for (let q = 0; q < 3; q++) {
        const cr = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 8), mat('#f2c94c', { metalness: 0.4, roughness: 0.4 }));
        cr.position.set(inA + 0.55 + q * 0.45, Y + 1.01, fr - 1.0); fu.add(cr);
      }
      S(inA + 0.3, inA + 1.7, fr - 1.25, fr - 0.75);
      B(fu, 0.45, 0.6, 0.35, DARK, inA + 0.4, 0, back + 0.5); S(inA, inA + 0.65, back, back + 0.7);
      return true;
    }
    case 'art': {
      const easel = (px, pz, i) => {
        const g = grp(px, pz, 0);
        for (const sx of [-0.3, 0.3]) { const l = box(g, 0.05, 1.7, 0.05, WOOD, sx, 0, 0); l.rotation.z = sx > 0 ? 0.08 : -0.08; }
        const bl = box(g, 0.05, 1.6, 0.05, WOOD, 0, 0, -0.35); bl.rotation.x = -0.22;
        box(g, 0.72, 0.04, 0.12, WOOD, 0, 0.85, 0.05);
        box(g, 0.68, 0.52, 0.03, '#ffffff', 0, 0.89, 0.02);
        const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), artMat(i)); cv.position.set(0, 1.15, 0.04); g.add(cv);
        cyl(fu, 0.18, 0.18, 0.5, pick(POP), px, Y, pz + 0.75, 10);
        SC(px, pz, 0.45); SC(px, pz + 0.75, 0.22);
      };
      let i = 0;
      for (const pz of [back + 2.2, back + 4.5]) for (const sx of [-2.4, 0, 2.4]) if (cx + sx > inA + 0.6 && cx + sx < inB - 0.6) easel(cx + sx, pz, i++);
      for (const tx of [cx - 2.4, cx + 2.4]) {
        B(fu, 2.0, 0.06, 1.0, '#ffffff', tx, 0.76, fr - 2.4);
        for (const sx of [-0.85, 0.85]) B(fu, 0.08, 0.76, 0.8, '#d8cbb4', tx + sx, 0, fr - 2.4);
        for (let q = 0; q < 5; q++) cyl(fu, 0.07, 0.07, 0.12, POP[q], tx - 0.6 + q * 0.3, Y + 0.82, fr - 2.55, 8);
        cyl(fu, 0.07, 0.06, 0.2, '#9fd3e6', tx + 0.6, Y + 0.82, fr - 2.2, 8);
        for (let q = 0; q < 3; q++) B(fu, 0.015, 0.3, 0.015, '#a8775a', tx + 0.56 + q * 0.04, 0.95, fr - 2.2);
        S(tx - 1.0, tx + 1.0, fr - 2.9, fr - 1.9);
      }
      B(fu, 0.6, 0.85, 1.2, '#e9e4f2', inB - 0.32, 0, back + 1.0);
      B(fu, 0.45, 0.04, 0.9, '#9fd3e6', inB - 0.32, 0.85, back + 1.0);
      S(inB - 0.65, inB, back + 0.4, back + 1.6);
      painting(fu, 0.9, 0.68, inA + 0.06, Y + 1.6, back + 2.4, Math.PI / 2, 3);
      painting(fu, 0.9, 0.68, inA + 0.06, Y + 1.6, back + 4.0, Math.PI / 2, 4);
      board('art');
      fan(cx, back + 3.4);
      return true;
    }
    case 'pottery': {
      const wheel = (px, pz) => {
        B(fu, 0.7, 0.5, 0.7, '#cfd8e6', px, 0, pz);
        cyl(fu, 0.3, 0.3, 0.05, '#9aa6b8', px, Y + 0.5, pz, 14);
        cyl(fu, 0.11, 0.16, 0.26, '#c97a5a', px, Y + 0.55, pz, 10);
        cyl(fu, 0.17, 0.17, 0.45, '#ffd66b', px, Y, pz + 0.75, 8);
        SC(px, pz, 0.5); SC(px, pz + 0.75, 0.2);
      };
      for (const sx of [-2, 2]) for (const pz of [back + 2.4, back + 4.6]) wheel(cx + sx, pz);
      const sw = Math.min(rw - 1.2, 4.6);
      B(fu, sw, 1.8, 0.06, WOOD, cx, 0, back + 0.06);
      for (const sx of [-1, 1]) B(fu, 0.06, 1.8, 0.5, WOOD, cx + sx * (sw / 2 - 0.03), 0, back + 0.3);
      for (let r = 0; r < 3; r++) {
        B(fu, sw - 0.1, 0.04, 0.42, '#a8775a', cx, 0.45 + r * 0.55, back + 0.3);
        for (let q = 0; q < Math.floor(sw / 0.55); q++) {
          const px = cx - sw / 2 + 0.35 + q * 0.55, kind = (q + r) % 3;
          if (kind === 0) cyl(fu, 0.1, 0.14, 0.3, pick(['#c97a5a', '#e2a37a', '#8fb8d8']), px, Y + 0.49 + r * 0.55, back + 0.3, 8);
          else if (kind === 1) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(pick(['#c97a5a', '#a6c75a', '#e8c07a']))); s.position.set(px, Y + 0.63 + r * 0.55, back + 0.3); fu.add(s); }
          else cyl(fu, 0.16, 0.1, 0.12, pick(['#ffffff', '#c97a5a']), px, Y + 0.49 + r * 0.55, back + 0.3, 8);
        }
      }
      S(cx - sw / 2, cx + sw / 2, back, back + 0.5);
      B(fu, 1.1, 1.25, 1.0, '#8f88a8', inB - 0.65, 0, fr - 1.3);
      B(fu, 0.6, 0.6, 0.04, '#6c6a80', inB - 0.65, 0.3, fr - 0.78);
      cyl(fu, 0.12, 0.12, 1.4, '#6c6a80', inB - 0.4, Y + 1.25, fr - 1.5, 6);
      S(inB - 1.25, inB, fr - 1.85, fr - 0.75);
      B(fu, 2.0, 0.8, 0.9, '#a8775a', inA + 1.3, 0, fr - 2.2);
      for (let q = 0; q < 3; q++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), mat('#b9876a')); s.position.set(inA + 0.8 + q * 0.5, Y + 0.92, fr - 2.2); fu.add(s); }
      S(inA + 0.3, inA + 2.3, fr - 2.65, fr - 1.75);
      fan(cx, back + 3.5);
      return true;
    }
    case 'gallery': {
      let i = 0;
      for (let px = inA + 1.3; px < inB - 1.0; px += 1.9) painting(fu, 1.1, 0.82, px, Y + 1.65, back + 0.05, 0, i++);
      for (const pz of [back + 2.4, back + 4.6, back + 6.8]) {
        if (pz > fr - 1.2) continue;
        painting(fu, 1.1, 0.82, inA + 0.05, Y + 1.65, pz, Math.PI / 2, i++);
        painting(fu, 1.1, 0.82, inB - 0.05, Y + 1.65, pz, -Math.PI / 2, i++);
      }
      const ped = (px, pz, shape) => {
        B(fu, 0.6, 1.0, 0.6, '#ffffff', px, 0, pz);
        const geo = [new THREE.IcosahedronGeometry(0.28, 0), new THREE.TorusKnotGeometry(0.17, 0.06, 40, 6), new THREE.ConeGeometry(0.22, 0.6, 5)][shape];
        const m = new THREE.Mesh(geo, mat(['#c7a6ff', '#ffd66b', '#4fc3e8'][shape], { metalness: 0.3, roughness: 0.4 }));
        m.position.set(px, Y + 1.32, pz); m.castShadow = true; fu.add(m);
        SC(px, pz, 0.45);
      };
      ped(cx - 2.2, back + 3.2, 0); ped(cx + 2.2, back + 3.2, 1); ped(cx, back + 5.4, 2);
      B(fu, 1.8, 0.45, 0.5, WOOD, cx, 0, back + 3.2); S(cx - 0.9, cx + 0.9, back + 2.95, back + 3.45);
      return true;
    }

    // ═════════ อาคารอนุบาล ═════════
    case 'kinder': {
      const tiles = ['#ff8fab', '#ffd66b', '#4fc3e8', '#a6e07a'];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) rug(0.98, 0.98, tiles[(a + b) % 4], cx - 1.5 + a, back + 1.6 + b);
      for (let q = 0; q < 7; q++) B(fu, 0.25, 0.25, 0.25, POP[q % 6], cx - 1.2 + (q % 4) * 0.7, 0.15 + (q > 3 ? 0.25 : 0), back + 2.2 + (q % 2) * 0.5);
      const lowTable = (px, pz, col) => {
        cyl(fu, 0.62, 0.62, 0.05, col, px, Y + 0.48, pz, 14);
        cyl(fu, 0.06, 0.09, 0.48, '#ffffff', px, Y, pz, 6);
        for (let q = 0; q < 4; q++) {
          const a = q * 1.571 + 0.78, sx = px + Math.cos(a) * 0.9, sz = pz + Math.sin(a) * 0.9;
          B(fu, 0.3, 0.26, 0.3, POP[(q + 2) % 6], sx, 0, sz);
        }
        SC(px, pz, 1.05);
      };
      lowTable(cx - 2.0, back + 6.0, '#ffd66b'); lowTable(cx + 2.0, back + 6.0, '#a6e07a');
      for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
        B(fu, 0.38, 0.4, 0.38, ['#ffe0ec', '#e0f2ff', '#fff3c4'][(r + q) % 3], inA + 0.25, 0.1 + r * 0.42, back + 3.6 + q * 0.42);
        B(fu, 0.2, 0.2, 0.2, POP[(r * 3 + q) % 6], inA + 0.3, 0.12 + r * 0.42, back + 3.6 + q * 0.42);
      }
      S(inA, inA + 0.5, back + 3.35, back + 4.65);
      const bear = (px, pz) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#c9905a')); b.position.set(px, Y + 0.35, pz); fu.add(b);
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat('#c9905a')); h.position.set(px, Y + 0.68, pz); fu.add(h);
        for (const sx of [-0.11, 0.11]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat('#c9905a')); e.position.set(px + sx, Y + 0.82, pz); fu.add(e); }
      };
      bear(inB - 0.5, back + 0.5); bear(inB - 1.0, back + 0.45);
      const rh = grp(inB - 0.9, fr - 2.0, -0.5);
      const rk = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 12, Math.PI * 0.6), mat('#ff8fab')); rk.rotation.z = Math.PI * 1.2; rk.position.y = 0.55; rh.add(rk);
      box(rh, 0.25, 0.25, 0.7, '#ffd66b', 0, 0.42, 0); box(rh, 0.2, 0.3, 0.22, '#ffd66b', 0, 0.62, -0.32);
      SC(inB - 0.9, fr - 2.0, 0.45);
      board('kinder', Math.min(rw * 0.55, 3.6), 0.75);
      fan(cx, back + 4);
      return true;
    }
    case 'nap': {
      const cols = ['#ffe0ec', '#e0f2ff', '#fff3c4', '#e3f5d6'];
      const nc = Math.max(2, Math.floor((rw - 1.2) / 1.1));
      for (let r = 0; r < 3; r++) for (let c = 0; c < nc; c++) {
        const px = inA + 0.9 + (c * (rw - 1.8)) / Math.max(1, nc - 1), pz = back + 1.2 + r * 2.3;
        if (r === 2 && Math.abs(px - cx) < 1.2) continue;
        rug(0.8, 1.55, cols[(r + c) % 4], px, pz);
        B(fu, 0.5, 0.1, 0.3, '#ffffff', px, 0.15, pz - 0.55);
        B(fu, 0.82, 0.05, 0.8, POP[(r + c) % 6], px, 0.15, pz + 0.3);
      }
      for (let q = 0; q < 4; q++) {
        const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), mat('#ffd66b', { emissive: '#ffd66b', emissiveIntensity: 0.4 }));
        st.position.set(cx - 0.9 + q * 0.6, Y + ceil - 0.7 - (q % 2) * 0.25, back + 3.5); fu.add(st);
        cyl(fu, 0.004, 0.004, 0.7 + (q % 2) * 0.25, '#ffffff', cx - 0.9 + q * 0.6, Y + ceil - 0.7 - (q % 2) * 0.25, back + 3.5, 3);
      }
      fan(cx, back + 3.5);
      return true;
    }

    // ═════════ สหกรณ์โรงเรียน ═════════
    case 'coop': {
      const cz = back + 2.0;
      B(fu, 3.4, 1.0, 0.7, '#ffffff', cx, 0, cz);
      B(fu, 3.5, 0.06, 0.82, '#5cc06a', cx, 1.0, cz);
      B(fu, 0.45, 0.24, 0.4, DARK, cx - 0.9, 1.06, cz);
      B(fu, 0.32, 0.2, 0.03, '#7fd3f7', cx - 0.9, 1.3, cz + 0.12, { emissive: '#4fa9d6', emissiveIntensity: 0.6 });
      for (let q = 0; q < 3; q++) cyl(fu, 0.12, 0.12, 0.3, ['#ff8fab', '#ffd66b', '#a6e07a'][q], cx + 0.4 + q * 0.32, Y + 1.06, cz, 10);
      S(cx - 1.75, cx + 1.75, cz - 0.4, cz + 0.4);
      chair(cx - 0.4, cz - 0.8, Math.PI, '#5cc06a');
      const shelf = (px, pz, len, rot) => {
        const g = grp(px, pz, rot);
        box(g, len, 1.7, 0.45, '#ffffff');
        for (let r = 0; r < 4; r++) {
          box(g, len - 0.05, 0.03, 0.47, '#5cc06a', 0, 0.12 + r * 0.42, 0);
          for (let q = 0; q < Math.floor(len / 0.3); q++) box(g, 0.22, 0.26 - ((q + r) % 3) * 0.04, 0.3, POP[(q * 3 + r) % 6], -len / 2 + 0.2 + q * 0.3, 0.15 + r * 0.42, 0.06);
        }
        if (Math.abs(Math.sin(rot)) < 0.5) S(px - len / 2, px + len / 2, pz - 0.25, pz + 0.25);
        else S(px - 0.25, px + 0.25, pz - len / 2, pz + len / 2);
      };
      shelf(cx, back + 0.25, Math.min(rw - 2, 6), 0);
      shelf(inA + 0.25, cz + 2.0, 2.6, Math.PI / 2);
      shelf(inB - 0.25, cz + 2.0, 2.6, -Math.PI / 2);
      B(fu, 0.75, 1.9, 0.8, '#cfe7f5', inA + 0.4, 0, back + 0.6);
      B(fu, 0.02, 1.5, 0.7, '#d6f1ff', inA + 0.79, 0.25, back + 0.6, { emissive: '#bfe8ff', emissiveIntensity: 0.4 });
      for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) cyl(fu, 0.05, 0.05, 0.22, POP[(r + q) % 6], inA + 0.6, Y + 0.4 + r * 0.48, back + 0.38 + q * 0.22, 6);
      S(inA, inA + 0.8, back + 0.2, back + 1.0);
      for (let q = 0; q < 3; q++) B(fu, 0.5, 0.22, 0.35, '#ff8fab', inB - 0.6, q * 0.2, fr - 0.6);
      SC(inB - 0.6, fr - 0.6, 0.35);
      textPanel(fu, [['สหกรณ์โรงเรียน', 64], ['ซื้อชุด · พาหนะ ได้ที่นี่', 40]], 2.4, 0.8, cx, Y + 2.3, back + 0.5, 0, '#5cc06a', '#ffffff');
      return true;
    }

    // ═════════ โรงยิม ═════════
    case 'gym': {
      const ccz = back + 3.4 + (depth - 3.4) / 2, cwid = Math.min(rw - 4, 26), cdep = Math.min(depth - 5.6, 13);
      B(fu, rw, 0.02, depth, '#e8b77a', cx, 0.125, back + depth / 2);
      const line = (w, d, px, pz) => B(fu, w, 0.01, d, '#ffffff', px, 0.15, pz);
      line(cwid, 0.08, cx, ccz - cdep / 2); line(cwid, 0.08, cx, ccz + cdep / 2);
      line(0.08, cdep, cx - cwid / 2, ccz); line(0.08, cdep, cx + cwid / 2, ccz); line(0.08, cdep, cx, ccz);
      const cc = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.8, 24), mat('#ffffff')); cc.rotation.x = -Math.PI / 2; cc.position.set(cx, Y + 0.16, ccz); fu.add(cc);
      for (const side of [-1, 1]) {
        B(fu, 4.6, 0.012, 3.6, '#d9785a', cx + side * (cwid / 2 - 2.3), 0.14, ccz);
        const hx = cx + side * (cwid / 2 + 0.9);
        B(fu, 0.3, 3.0, 0.3, '#6c6a80', hx + side * 0.3, 0, ccz);
        B(fu, 0.1, 1.1, 1.8, '#ffffff', hx - side * 0.1, 2.75, ccz);
        B(fu, 0.11, 0.45, 0.6, '#ff6b3d', hx - side * 0.12, 2.9, ccz);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 14), mat('#ff6b3d'));
        rim.rotation.x = Math.PI / 2; rim.position.set(hx - side * 0.45, Y + 3.05, ccz); fu.add(rim);
        SC(hx + side * 0.3, ccz, 0.35);
      }
      // อัฒจันทร์ 3 ขั้นชิดผนังหลัง
      const bl = Math.min(rw - 6, 20);
      ['#ff9e5e', '#ffd66b', '#4fc3e8'].forEach((c, i) => B(fu, bl, 0.45 * (3 - i), 0.95, c, cx, 0, back + 0.5 + i * 0.95));
      S(cx - bl / 2, cx + bl / 2, back, back + 2.85);
      textPanel(fu, [['เจ้าบ้าน   12 : 10   ผู้มาเยือน', 52], ['ควอเตอร์ 3', 36]], 4.2, 1.3, cx, Y + Math.min(ceil - 1.2, 4.6), back + 0.06, 0, '#2f2a45', '#ffd66b');
      // ธงราวสีสันใต้หลังคา
      for (let q = 0; q < 16; q++) B(fu, 0.35, 0.5, 0.02, POP[q % 6], cx - 7.5 + q, ceil - 1.6, ccz);
      // กองเบาะยิมนาสติกและรถเข็นลูกบอล
      for (let q = 0; q < 4; q++) B(fu, 1.9, 0.18, 1.0, q % 2 ? '#4fc3e8' : '#7c6cf0', inA + 1.3, q * 0.18, fr - 1.2);
      S(inA + 0.3, inA + 2.3, fr - 1.75, fr - 0.65);
      B(fu, 1.0, 0.5, 0.6, '#c0c0c8', inB - 1.0, 0.15, fr - 1.0);
      for (let q = 0; q < 6; q++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(q % 2 ? '#ff7a3d' : '#ffffff')); b.position.set(inB - 1.35 + (q % 3) * 0.33, Y + 0.78, fr - 1.15 + Math.floor(q / 3) * 0.3); fu.add(b); }
      S(inB - 1.55, inB - 0.45, fr - 1.35, fr - 0.65);
      for (const sx of [-1, 1]) for (const lz of [ccz - 3, ccz + 3]) B(fu, 1.6, 0.06, 0.3, '#ffffff', cx + sx * 6, ceil - 0.08, lz, { emissive: '#fff6dd', emissiveIntensity: 0.9 });
      return true;
    }
  }
  return false;
}
