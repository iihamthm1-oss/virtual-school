import * as THREE from 'three';
import { makeLabel, pick, rand } from './util.js';

export const ACTIVE_MAX = 3;
export const COOLDOWN_SEC = 15;
export const REWARD_FIRST = 10;
export const REWARD_RETRY = 5;
export const BONUS_ALL = 100;
export const NEAR_DIST = 3.2;

const TOPIC = {
  computing: { label: 'วิทยาการคำนวณ', color: '#4fc3e8' },
  general: { label: 'ความรู้ทั่วไป', color: '#ff8fb8' },
};
export const topicInfo = (t) => TOPIC[t] || TOPIC.general;

/** ระบบภารกิจ: ค้างทีละ 3 ข้อ ตอบถูกหาย แล้วสุ่มข้อใหม่จากคลังที่ยังไม่ใช้ */
export class QuestManager {
  constructor(scene, bank, spots) {
    this.scene = scene;
    this.bank = bank.questions;
    this.spots = spots;
    this.active = [];
    this.used = new Set();
    this.solved = 0;
    this.coins = 0;
    this.finished = false;
    this.fx = [];
    this.listeners = [];
    this.viewScale = 1;
  }

  /** เริ่มรอบใหม่ด้วยชุดคำถามใหม่ */
  reset(questions) {
    this.clear();
    this.bank = questions;
    this.used = new Set();
    this.solved = 0;
    this.coins = 0;
    this.finished = false;
  }
  /** เก็บคริสตัลทั้งหมด (รอเริ่มรอบ / จบรอบ) */
  clear() {
    for (const a of this.active) this.scene.remove(a.marker.g);
    this.active = [];
    this.emit('change');
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  fill(playerPos) {
    while (this.active.length < ACTIVE_MAX) {
      const pool = this.bank.filter((q) => !this.used.has(q.id));
      if (!pool.length) break;
      const q = pick(pool);
      this.used.add(q.id);
      const taken = new Set(this.active.map((a) => a.spot));
      let free = this.spots.filter((s) => !taken.has(s));
      // พยายามไม่ให้ภารกิจใหม่โผล่ใต้เท้าผู้เล่น
      if (playerPos) {
        const far = free.filter((s) => Math.hypot(s.x - playerPos.x, s.z - playerPos.z) > 8);
        if (far.length) free = far;
      }
      const quest = { q, spot: pick(free), attempts: 0, cooldownUntil: 0, born: performance.now() };
      quest.marker = this.makeMarker(quest);
      this.active.push(quest);
    }
    if (!this.active.length && !this.finished && this.used.size >= this.bank.length) {
      this.finished = true;
      this.coins += BONUS_ALL;
      this.emit('finished', { bonus: BONUS_ALL });
    }
    this.emit('change');
  }

  makeMarker(quest) {
    const { color, label } = topicInfo(quest.q.topic);
    const g = new THREE.Group();
    g.position.set(quest.spot.x, 0, quest.spot.z);

    const crystalMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, flatShading: true, roughness: 0.3, transparent: true });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), crystalMat);
    // จุดในอาคารเพดานต่ำ: ลดระดับคริสตัลลงไม่ให้ทะลุเพดาน
    const cy = quest.spot.indoor ? 1.6 : 2.2;
    crystal.scale.y = quest.spot.indoor ? 1.25 : 1.5;
    crystal.position.y = cy;
    crystal.castShadow = true;
    g.add(crystal);

    const q = makeLabel('?', { size: 1.6, bg: 'rgba(0,0,0,0)', fg: '#ffffff', weight: 700 });
    q.position.y = cy;
    q.material.depthTest = false;
    q.renderOrder = 2;
    g.add(q);

    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    g.add(ring);

    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 40, 16, 1, true), beamMat);
    beam.position.y = 20;
    g.add(beam);

    const tag = makeLabel(label, { size: 0.8, bg: color, fg: '#ffffff' });
    tag.position.y = quest.spot.indoor ? 2.55 : 3.55;
    g.add(tag);

    const cd = makeLabel(' ', { size: 0.9 });
    cd.visible = false;
    g.add(cd);

    g.scale.setScalar(0.01);
    this.scene.add(g);
    return { g, cy, crystal, crystalMat, ring, ringMat, beam, tag, cd, cdText: '', baseColor: new THREE.Color(color), phase: rand(0, 6) };
  }

  setCooldownLabel(m, text) {
    if (m.cdText === text) return;
    m.cdText = text;
    m.g.remove(m.cd);
    m.cd.material.map.dispose();
    m.cd = makeLabel(text, { size: 0.9, bg: 'rgba(59,51,85,0.85)', fg: '#ffffff' });
    m.cd.position.y = m.cy + (m.cy < 2 ? 1.25 : 2.2);
    m.g.add(m.cd);
  }

  cooldownLeft(quest) { return Math.max(0, Math.ceil((quest.cooldownUntil - performance.now()) / 1000)); }

  nearest(pos) {
    let best = null, bd = Infinity;
    for (const a of this.active) {
      if (pos.y > 1.6) continue; // จุดภารกิจอยู่ชั้นล่างทั้งหมด คนที่อยู่ชั้นบนตอบไม่ได้
      const d = Math.hypot(a.spot.x - pos.x, a.spot.z - pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best ? { quest: best, dist: bd } : null;
  }

  /** บันทึกผลการตอบ คืนค่าจำนวนเหรียญที่ได้ (0 ถ้าผิด) */
  submit(quest, correct) {
    quest.attempts++;
    if (!correct) {
      quest.cooldownUntil = performance.now() + COOLDOWN_SEC * 1000;
      this.emit('change');
      return 0;
    }
    const reward = quest.attempts === 1 ? REWARD_FIRST : REWARD_RETRY;
    this.coins += reward;
    this.solved++;
    this.active = this.active.filter((a) => a !== quest);
    this.burst(quest);
    return reward;
  }

  burst(quest) {
    const m = quest.marker;
    const colors = ['#ffd66b', '#ff8fb8', '#4fc3e8', '#a6e07a', '#c7a6ff', '#ffffff'];
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    for (let i = 0; i < 46; i++) {
      const p = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: pick(colors), transparent: true }));
      p.position.set(quest.spot.x, m.cy, quest.spot.z);
      const a = rand(0, Math.PI * 2), s = rand(2, 6);
      this.fx.push({ m: p, v: new THREE.Vector3(Math.cos(a) * s, rand(4, 10), Math.sin(a) * s), life: 1.4, spin: rand(-8, 8) });
      this.scene.add(p);
    }
    this.fx.push({ marker: m, life: 0.45 });
  }

  update(t, dt) {
    for (const a of this.active) {
      const m = a.marker;
      m.grow = Math.min(1, (m.grow ?? 0.01) + dt * 2.5);
      m.g.scale.setScalar(m.grow * this.viewScale);
      m.beam.scale.set(1 / this.viewScale, 1, 1 / this.viewScale); // ลำแสงไม่อ้วนเกินในมุมกว้าง
      m.crystal.rotation.y += dt * 1.6;
      m.crystal.position.y = m.cy + Math.sin(t * 2.2 + m.phase) * 0.18;
      const pulse = 1 + Math.sin(t * 3 + m.phase) * 0.08;
      m.ring.scale.set(pulse, pulse, 1);
      const left = this.cooldownLeft(a);
      const cooling = left > 0;
      m.crystalMat.color.copy(cooling ? new THREE.Color('#b8b4c6') : m.baseColor);
      m.crystalMat.emissive.copy(cooling ? new THREE.Color('#555066') : m.baseColor);
      m.beam.visible = !cooling;
      m.cd.visible = cooling;
      if (cooling) this.setCooldownLabel(m, `รอ ${left} วิ`);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.marker) {
        f.marker.g.scale.setScalar(1 + (0.45 - f.life) * 3);
        f.marker.g.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, f.life / 0.45) * (o.material.userData.o ??= o.material.opacity); } });
        if (f.life <= 0) { this.scene.remove(f.marker.g); this.fx.splice(i, 1); }
        continue;
      }
      f.v.y -= 18 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.spin * dt; f.m.rotation.y += f.spin * dt;
      if (f.m.position.y < 0.1) { f.m.position.y = 0.1; f.v.multiplyScalar(0.4); f.v.y = Math.abs(f.v.y) * 0.3; }
      f.m.material.opacity = Math.min(1, f.life * 2);
      if (f.life <= 0) { this.scene.remove(f.m); f.m.material.dispose(); this.fx.splice(i, 1); }
    }
  }
}
