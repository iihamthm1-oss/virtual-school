import * as THREE from 'three';

export { createCharacter } from './character.js';

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
    // ขี่พาหนะ: เร็วขึ้นตามชนิด และเร่ง/เลี้ยวนุ่มกว่าเดิน
    const top = this.vehicleSpeed || (controls.run ? 10 : 6.5);
    const target = top * Math.min(1, Math.hypot(m.x, m.y));
    const len = Math.hypot(dx, dz);
    const accel = Math.min(1, dt * (this.vehicleSpeed ? 4 : 12));
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
      this.facing += diff * Math.min(1, dt * (this.vehicleSpeed ? 6 : 12));
    }
    this.c.root.position.copy(this.pos);
    this.c.root.rotation.y = this.facing;
    this.c.blob.position.y = 0.06 + (this.groundH ?? 0) - this.pos.y; // เงาติดพื้นเสมอ
    this.c.blob.scale.setScalar(Math.max(0.4, 1 - (this.pos.y - (this.groundH ?? 0)) * 0.25));
    this.c.animate(dt, this.speed, !this.onGround, t);
  }
}
