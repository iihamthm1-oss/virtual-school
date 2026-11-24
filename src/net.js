import * as THREE from 'three';
import { Client } from '@colyseus/sdk';
import { createCharacter } from './player.js';
import { makeLabel } from './util.js';
import { chatText } from './chat.js';

import { SERVER_URL } from './config.js';

const SKINS = ['#f6d3b3', '#e9b98f', '#d9a074', '#f9dcc4'];
const HAIRS = ['#3b2a2a', '#2a2238', '#5a3a2a', '#1f1a24'];
/** หน้าตาชั่วคราวจากชื่อ (ระบบแต่งตัวจริงมาในช่วงที่ 4) */
export function lookFromName(name) {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) & 255;
  return h;
}
export const lookStyle = (look) => ({ skin: SKINS[look & 3], hair: HAIRS[(look >> 2) & 3] });

/** ฟองข้อความเหนือหัว */
export function showBubble(root, text) {
  root.userData.bubble?.removeFromParent();
  const b = makeLabel(text, { size: 0.55, bg: 'rgba(255,255,255,0.97)', fg: '#3b3355' });
  b.position.y = 2.55;
  b.material.depthTest = false;
  b.renderOrder = 4;
  root.add(b);
  root.userData.bubble = b;
  clearTimeout(root.userData.bubbleTimer);
  root.userData.bubbleTimer = setTimeout(() => { b.removeFromParent(); b.material.map.dispose(); }, 4500);
}

const TAU = Math.PI * 2;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Net {
  constructor(scene) {
    this.scene = scene;
    this.remotes = new Map();
    this.room = null;
    this.lastSend = 0;
    this.last = '';
    this.handlers = {};
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { this.handlers[ev]?.(...a); }

  get code() { return this.room?.roomId; }
  get count() { return this.room?.state?.players?.size || 1; }

  async connect({ code, name, look, studentCode }) {
    const client = new Client(SERVER_URL);
    this.room = await client.joinById(code, { name, look, studentCode });
    const room = this.room;
    for (const type of ['bank', 'phase', 'results', 'kicked', 'closed', 'bonus']) room.onMessage(type, (m) => this.emit(type, m));
    room.send('getBank');
    room.onMessage('chat', (m) => {
      const text = chatText(m);
      if (!text) return;
      const r = this.remotes.get(m.id);
      const who = m.id === room.sessionId ? 'me' : r?.name;
      if (r) showBubble(r.c.root, text);
      this.emit('chat', { mine: m.id === room.sessionId, name: who === 'me' ? null : who, text });
    });
    room.onDrop(() => this.emit('status', 'drop'));
    room.onReconnect(() => this.emit('status', 'back'));
    room.onLeave((codeNum) => { if (codeNum !== 4000) this.emit('status', 'left'); });
    return room.roomId;
  }

  sendMove(p, now) {
    if (!this.room || now - this.lastSend < 100) return;
    const msg = { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1), ry: +p.facing.toFixed(2), spd: +p.speed.toFixed(1), air: !p.onGround };
    const key = `${msg.x},${msg.y},${msg.z},${msg.ry},${msg.spd},${msg.air}`;
    if (key === this.last && now - this.lastSend < 1000) return; // ยืนนิ่งไม่ต้องส่งถี่
    this.last = key;
    this.lastSend = now;
    this.room.send('move', msg);
  }
  sendAnswer(qid, correct) { this.room?.send('answer', { qid, correct }); }
  get phase() { return this.room?.state?.phase || 'lobby'; }
  /** วินาทีที่เหลือในรอบ (ชดเชยนาฬิกาเครื่องกับเซิร์ฟเวอร์) */
  get secondsLeft() {
    const st = this.room?.state;
    if (!st || st.phase !== 'play') return null;
    const skew = st.now ? st.now - Date.now() : 0;
    return Math.max(0, Math.round((st.endsAt - (Date.now() + skew)) / 1000));
  }
  sendChat(m) { this.room?.send('chat', m); }

  /** ซิงก์ผู้เล่นคนอื่น: สร้าง/ลบตัวละคร และเลื่อนตำแหน่งอย่างนุ่มนวล */
  update(dt, t) {
    const players = this.room?.state?.players;
    if (!players) return; // ยังไม่ได้รับข้อมูลห้องชุดแรก
    const seen = new Set();
    const k = 1 - Math.exp(-dt * 12);
    players.forEach((p, id) => {
      if (id === this.room.sessionId) return;
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) {
        const c = createCharacter({ name: p.name, lite: true, ...lookStyle(p.look) });
        this.scene.add(c.root);
        r = { c, name: p.name, pos: new THREE.Vector3(p.x / 10, p.y / 10, p.z / 10), ry: (p.ry / 255) * TAU };
        this.remotes.set(id, r);
        this.emit('join', p.name);
      }
      const tx = p.x / 10, ty = p.y / 10, tz = p.z / 10;
      if (Math.hypot(tx - r.pos.x, tz - r.pos.z) > 12) r.pos.set(tx, ty, tz); // ไกลมาก = วาร์ป
      else { r.pos.x += (tx - r.pos.x) * k; r.pos.y += (ty - r.pos.y) * k; r.pos.z += (tz - r.pos.z) * k; }
      r.ry = lerpAngle(r.ry, (p.ry / 255) * TAU, k);
      r.c.root.position.copy(r.pos);
      r.c.root.rotation.y = r.ry;
      r.c.blob.visible = !p.air;
      r.c.animate(dt, p.spd / 10, p.air, t);
    });
    for (const [id, r] of this.remotes) {
      if (seen.has(id)) continue;
      this.scene.remove(r.c.root);
      this.remotes.delete(id);
      this.emit('leave', r.name);
    }
  }
}
