import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, makeLabel } from './util.js';

const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
/** รวมชิ้นส่วนลูกในกลุ่มเป็นชิ้นเดียว (สีเก็บในจุดยอด) ลดภาระการ์ดจอสำหรับ NPC */
function mergeChildren(group) {
  const geos = [], rm = [];
  for (const c of group.children) {
    if (!c.isMesh) continue;
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

/** ตัวละครหัวโตในชุดนักเรียนไทย สร้างจากรูปทรงพื้นฐาน */
export function createCharacter({ name = '', skin = '#f6d3b3', hair = '#3b2a2a', bottom = '#2f3a6b', shirt = '#ffffff', skirt = false, long = false, hairLong = false, lite = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const part = (geo, color, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // ขา (หมุนรอบสะโพก)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.48, 0);
    body.add(hip);
    part(new THREE.CylinderGeometry(0.1, 0.09, 0.32, 7), long ? bottom : skin, 0, -0.26, 0, hip);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.3), '#2b2b33', 0, -0.44, 0.04, hip); // รองเท้า
    part(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 7), '#ffffff', 0, -0.36, 0, hip); // ถุงเท้า
    legs.push(hip);
  }
  // กางเกงขาสั้น หรือกระโปรง
  if (skirt) part(new THREE.CylinderGeometry(0.24, 0.36, 0.3, 8), bottom, 0, 0.46, 0);
  else part(new THREE.CylinderGeometry(0.26, 0.28, 0.2, 8), bottom, 0, 0.5, 0);
  // ลำตัว เสื้อนักเรียนสีขาว
  part(new THREE.CylinderGeometry(0.22, 0.27, 0.42, 8), shirt, 0, 0.78, 0);
  part(new THREE.BoxGeometry(0.3, 0.06, 0.12), shirt, 0, 0.98, 0.12); // ปกเสื้อ
  part(new THREE.BoxGeometry(0.07, 0.07, 0.02), '#2f3a6b', 0.11, 0.86, 0.24); // ตราโรงเรียน
  // แขน
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.3, 0.94, 0);
    body.add(sh);
    part(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 7), shirt, 0, -0.07, 0, sh);
    part(new THREE.CylinderGeometry(0.07, 0.065, 0.22, 7), skin, 0, -0.24, 0, sh);
    part(new THREE.SphereGeometry(0.075, 7, 5), skin, 0, -0.37, 0, sh);
    sh.rotation.z = s * 0.12;
    arms.push(sh);
  }
  // หัวโต
  const head = new THREE.Group();
  head.position.y = 1.38;
  body.add(head);
  part(new THREE.IcosahedronGeometry(0.43, 1), skin, 0, 0, 0, head);
  const hairCap = part(new THREE.SphereGeometry(0.46, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.04, -0.03, head);
  hairCap.rotation.x = -0.25;
  part(new THREE.BoxGeometry(0.62, 0.14, 0.2), hair, 0, 0.22, 0.32, head); // หน้าม้า
  if (hairLong) part(new THREE.BoxGeometry(0.72, 0.6, 0.28), hair, 0, -0.12, -0.28, head);
  // ตา แก้ม ปาก
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.06, 8, 6), '#2a2238', s * 0.15, -0.02, 0.38, head).scale.set(0.9, 1.2, 0.6);
    part(new THREE.SphereGeometry(0.02, 6, 4), '#ffffff', s * 0.15 + 0.02, 0.02, 0.42, head);
    part(new THREE.SphereGeometry(0.06, 8, 6), '#ffa4b0', s * 0.25, -0.12, 0.33, head).scale.set(1, 0.6, 0.4);
  }
  part(new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI), '#7a3b45', 0, -0.14, 0.4, head).rotation.z = Math.PI;

  if (name) {
    const lab = makeLabel(name, { size: 0.42, bg: 'rgba(59,51,85,0.75)', fg: '#ffffff' });
    lab.position.y = 2.0;
    g.add(lab);
  }

  if (lite) [body, head, ...legs, ...arms].forEach(mergeChildren);

  // เงาวงกลมใต้เท้า (ช่วยให้เห็นตำแหน่งตอนกระโดด)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  g.add(blob);

  let phase = 0;
  return {
    root: g, body, blob, legs, arms, head,
    animate(dt, speed, airborne, t) {
      const moving = speed > 0.5;
      phase += dt * (moving ? 6 + speed * 0.9 : 0);
      const swing = airborne ? 0.5 : moving ? Math.sin(phase) * Math.min(1, speed / 6) * 0.8 : 0;
      legs[0].rotation.x += ((airborne ? -0.6 : swing) - legs[0].rotation.x) * Math.min(1, dt * 15);
      legs[1].rotation.x += ((airborne ? 0.3 : -swing) - legs[1].rotation.x) * Math.min(1, dt * 15);
      arms[0].rotation.x += ((airborne ? -2.4 : -swing) - arms[0].rotation.x) * Math.min(1, dt * 15);
      arms[1].rotation.x += ((airborne ? -2.4 : swing) - arms[1].rotation.x) * Math.min(1, dt * 15);
      const bob = moving && !airborne ? Math.abs(Math.sin(phase)) * 0.06 : Math.sin(t * 2) * 0.012;
      body.position.y = bob;
      head.rotation.z = moving ? Math.sin(phase) * 0.05 : Math.sin(t * 1.3) * 0.03;
    },
  };
}

/** การบังคับ: คีย์บอร์ด เมาส์ จอยสติ๊กบนจอสัมผัส */
export class Controls {
  constructor(canvas) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 9;
    this.ovZoom = 1;
    this.jumpQueued = false;
    this.interactQueued = false;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'Enter') this.interactQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // ลากเพื่อหมุนกล้อง · ล้อเมาส์หรือจีบสองนิ้วเพื่อซูม (ยกเว้นบนจอยสติ๊ก)
    const drags = new Map();
    let pinch = 0;
    const pinchDist = () => { const [a, b] = [...drags.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', (e) => {
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (drags.size === 2) pinch = pinchDist();
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = drags.get(e.pointerId);
      if (!d) return;
      const px = d.x, py = d.y;
      d.x = e.clientX; d.y = e.clientY;
      if (drags.size === 2) {
        const nd = pinchDist();
        if (pinch > 0) this.zoom(pinch / nd);
        pinch = nd;
        return;
      }
      if (this.lockView) return;
      this.yaw -= (e.clientX - px) * 0.006;
      this.pitch = Math.max(0.08, Math.min(1.45, this.pitch + (e.clientY - py) * 0.004));
    });
    const end = (e) => { drags.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { this.zoom(1 + Math.sign(e.deltaY) * 0.12); e.preventDefault(); }, { passive: false });

    // จอยสติ๊ก
    const joy = document.getElementById('joystick');
    const knob = joy.querySelector('.knob');
    let joyId = null, cx = 0, cy = 0;
    const R = 50;
    joy.addEventListener('pointerdown', (e) => {
      joyId = e.pointerId;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      try { joy.setPointerCapture(e.pointerId); } catch { /* ไม่มีนิ้วจริง */ }
      onJoy(e);
    });
    const onJoy = (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = { x: dx / R, y: -dy / R };
    };
    joy.addEventListener('pointermove', onJoy);
    const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; this.joy = null; knob.style.transform = ''; };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    document.getElementById('btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpQueued = true; });
  }

  zoom(f) {
    // มุมกว้าง: ซูมเข้าหาตัวผู้เล่นได้ · มุมปกติ: ปรับระยะกล้อง
    if (this.lockView) this.ovZoom = Math.max(0.25, Math.min(1, this.ovZoom * f));
    else this.dist = Math.max(4, Math.min(70, this.dist * f));
  }

  read() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.joy) { x = this.joy.x; y = this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy && Math.hypot(this.joy.x, this.joy.y) > 0.92);
    return this.move;
  }
}

/** ฟิสิกส์ผู้เล่นแบบง่าย: เดิน วิ่ง กระโดด ชนสิ่งกีดขวาง */
export class Player {
  constructor(character, world) {
    this.c = character;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 104);
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;
    this.onGround = true;
    this.speed = 0;
  }

  update(dt, controls, t) {
    const m = controls.read();
    const sy = Math.sin(controls.yaw), cy = Math.cos(controls.yaw);
    // ไปข้างหน้าตามมุมกล้อง: forward = (-sin, -cos), right = (cos, -sin)
    const dx = m.x * cy - m.y * sy;
    const dz = -m.x * sy - m.y * cy;
    const target = (controls.run ? 10 : 6.5) * Math.min(1, Math.hypot(m.x, m.y));
    const len = Math.hypot(dx, dz);
    const accel = Math.min(1, dt * 12);
    const wantX = len > 0.01 ? (dx / len) * target : 0;
    const wantZ = len > 0.01 ? (dz / len) * target : 0;
    this.vel.x += (wantX - this.vel.x) * accel;
    this.vel.z += (wantZ - this.vel.z) * accel;

    if (controls.jumpQueued && this.onGround) { this.vel.y = 8.5; this.onGround = false; }
    controls.jumpQueued = false;
    this.vel.y -= 24 * dt;

    this.pos.addScaledVector(this.vel, dt);
    this.world.resolve(this.pos, 0.4);
    // พื้นใต้เท้า: เดินขึ้นลงบันไดได้ ตกจากที่สูงได้
    const gh = this.world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= gh) { this.pos.y = gh; this.vel.y = 0; this.onGround = true; }
    else if (this.onGround && this.vel.y <= 0 && this.pos.y - gh < 0.45) { this.pos.y = gh; this.vel.y = 0; }
    else this.onGround = false;
    this.groundH = gh;

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.4) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let diff = want - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
    }
    this.c.root.position.copy(this.pos);
    this.c.root.rotation.y = this.facing;
    this.c.blob.position.y = 0.06 + (this.groundH ?? 0) - this.pos.y; // เงาติดพื้นเสมอ
    this.c.blob.scale.setScalar(Math.max(0.4, 1 - (this.pos.y - (this.groundH ?? 0)) * 0.25));
    this.c.animate(dt, this.speed, !this.onGround, t);
  }
}
