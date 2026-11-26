// เซิร์ฟเวอร์ออนไลน์ โรงเรียนห้องสื่อครูอัง 3D (Colyseus 0.18)
// รัน: npm start  (พอร์ต 2567) · หน้าครูเรียก API ที่ /api/*
import { Server, Room } from 'colyseus';
import { schema, t } from '@colyseus/schema';
import * as store from './store.mjs';
import { mountApi, isTeacher } from './api.mjs';
import { priceOf, cleanLook, FREE_ITEMS, VEHICLES, vehicleKey } from '../src/catalog.js';

export const MAX_PLAYERS = 50;
const CHAT_PRESETS = 12; // ต้องตรงกับฝั่งเกม src/chat.js
const CHAT_EMOJIS = 8;
const REWARD_FIRST = 10, REWARD_RETRY = 5, BONUS_ALL = 100;

const Player = schema({
  name: t.string(),
  x: t.int16(), y: t.int16(), z: t.int16(),
  ry: t.uint8(), spd: t.uint8(), air: t.boolean(),
  skin: t.uint8(), hair: t.uint8(), hairColor: t.uint8(), outfit: t.uint8(), // หน้าตา (ดู src/catalog.js)
  veh: t.uint8(),      // พาหนะที่ขี่อยู่ (0 = เดิน)
  seat: t.string(),    // นั่งซ้อนท้ายใคร (sessionId ของคนขับ)
  wallet: t.uint16(),  // เหรียญในกระเป๋า (ใช้ซื้อของ)
  solved: t.uint8(),   // ภารกิจที่ทำได้ในรอบนี้
  wrong: t.uint16(),   // ตอบผิดกี่ครั้ง
  coins: t.uint16(),   // เหรียญที่ได้ในรอบนี้
  muted: t.boolean(),  // ครูปิดแชท
  online: t.boolean(), // หลุดเน็ตชั่วคราว = false
  coded: t.boolean(),  // เข้าด้วยรหัสนักเรียน (เหรียญสะสมข้ามรอบ)
}, 'Player');

const State = schema({
  players: t.map(Player),
  phase: t.string(),   // lobby | play | ended
  endsAt: t.number(),  // เวลาจบรอบ (ms ของเซิร์ฟเวอร์)
  now: t.number(),     // เวลาเซิร์ฟเวอร์ ไว้เทียบนาฬิกา
  bank: t.string(),    // ชื่อชุดคำถาม
  total: t.uint8(),    // จำนวนข้อในชุด
}, 'SchoolState');

const usedCodes = new Set();
function newCode() {
  for (;;) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!usedCodes.has(c)) { usedCodes.add(c); return c; }
  }
}
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'นักเรียน';
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);

class SchoolRoom extends Room {
  maxClients = MAX_PLAYERS + 3; // + ครู
  patchRate = 100;

  async onCreate(options) {
    if (!isTeacher(options?.teacher)) throw new Error('เฉพาะครูเท่านั้นที่สร้างห้องได้');
    const bank = await store.getBank(options.bank);
    if (!bank || !bank.questions.length) throw new Error('ไม่พบชุดคำถาม');
    this.roomId = newCode();
    this.bankData = bank;
    this.bankId = bank.id;
    this.minutes = num(Number(options.minutes) || 30, 5, 90);
    this.autoDispose = false; // ครูรีเฟรชหน้าได้ ห้องไม่หาย
    this.state = new State();
    this.state.phase = 'lobby';
    this.state.bank = bank.title;
    this.state.total = bank.questions.length;
    this.lastChat = new Map();
    this.teachers = new Set();
    this.meta = new Map(); // sessionId -> { studentCode, attempts:{qid:n}, solvedIds:Set }
    this.qstats = new Map(); // qid -> { right, wrong }
    this.invites = new Map(); // ผู้ถูกชวน -> { from, at }
    this.idleSince = Date.now();
    this.ticks = 0;
    this.clock.setInterval(() => this.tick(), 1000);
    this.onMessages();
    console.log(`[${this.roomId}] ครูสร้างห้อง · ${bank.title} · ${this.minutes} นาที`);
  }

  tick() {
    this.state.now = Date.now();
    // ส่งสถิติรายข้อให้ครูทุก 3 วินาที
    if (++this.ticks % 3 === 0) {
      const stats = [...this.qstats].map(([id, st]) => ({ id, ...st }));
      for (const c of this.clients) if (this.teachers.has(c.sessionId)) c.send('stats', stats);
    }
    if (this.state.phase === 'play' && Date.now() >= this.state.endsAt) this.endRound();
    // ไม่มีใครอยู่ 30 นาที = ปิดห้อง
    if (this.clients.length) this.idleSince = Date.now();
    else if (Date.now() - this.idleSince > 30 * 60 * 1000) this.disconnect();
  }

  onMessages() {
    const player = (c) => this.state.players.get(c.sessionId);
    const teacherOnly = (fn) => (client, m) => { if (this.teachers.has(client.sessionId)) fn(client, m || {}); };

    this.onMessage('move', (client, m) => {
      const p = player(client);
      if (!p || !m || p.seat) return; // คนซ้อนท้าย: ตำแหน่งตามคนขับ
      p.x = Math.round(num(m.x, -130, 130) * 10);
      p.y = Math.round(num(m.y, -5, 30) * 10);
      p.z = Math.round(num(m.z, -130, 130) * 10);
      p.ry = Math.round(((num(m.ry, -100, 100) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 255);
      p.spd = Math.round(num(m.spd, 0, 20) * 10);
      p.air = !!m.air;
      // คนซ้อนเกาะไปกับคนขับ
      this.state.players.forEach((q) => {
        if (q.seat !== client.sessionId) return;
        const ry = num(m.ry, -100, 100);
        q.x = Math.round((num(m.x, -130, 130) - Math.sin(ry) * 0.85) * 10);
        q.z = Math.round((num(m.z, -130, 130) - Math.cos(ry) * 0.85) * 10);
        q.y = p.y; q.ry = p.ry; q.spd = p.spd; q.air = false;
      });
    });

    // ผลการตอบ: เซิร์ฟเวอร์คิดเหรียญเอง (10 ครั้งแรก / 5 ครั้งถัดไป / โบนัสครบชุด)
    this.onMessage('answer', (client, m) => {
      const p = player(client), meta = this.meta.get(client.sessionId);
      if (!p || !meta || this.state.phase !== 'play') return;
      const q = this.bankData.questions.find((x) => x.id === m?.qid);
      if (!q || meta.solvedIds.has(q.id)) return;
      const n = (meta.attempts[q.id] || 0) + 1;
      meta.attempts[q.id] = n;
      const st = this.qstats.get(q.id) || { right: 0, wrong: 0 };
      if (m.correct) {
        meta.solvedIds.add(q.id);
        p.solved = meta.solvedIds.size;
        const earn = (n === 1 ? REWARD_FIRST : REWARD_RETRY) + (meta.solvedIds.size >= this.bankData.questions.length ? BONUS_ALL : 0);
        p.coins += earn;
        p.wallet = Math.min(65535, p.wallet + earn);
        st.right++;
      } else { p.wrong++; st.wrong++; }
      this.qstats.set(q.id, st);
    });

    // ขอชุดคำถาม (ส่งซ้ำได้ กันข้อความแรกหลุดตอนเพิ่งเข้าห้อง)
    this.onMessage('getBank', (client) => {
      client.send('bank', { id: this.bankId, title: this.bankData.title, questions: this.bankData.questions });
      const p = player(client), meta = this.meta.get(client.sessionId);
      if (p && meta) client.send('profile', { owned: meta.owned, look: { skin: p.skin, hair: p.hair, hairColor: p.hairColor, outfit: p.outfit }, lastVeh: meta.lastVeh || 0 });
    });

    this.onMessage('emote', (client, m) => {
      const p = player(client);
      const now = Date.now();
      if (!p || !Number.isInteger(m?.e) || m.e < 0 || m.e > 2 || now - (this.lastChat.get(client.sessionId + 'e') || 0) < 1500) return;
      this.lastChat.set(client.sessionId + 'e', now);
      this.broadcast('emote', { id: client.sessionId, e: m.e }, { except: client });
    });

    this.onMessage('chat', (client, m) => {
      const p = player(client);
      if (!p || p.muted) return;
      const now = Date.now();
      if (now - (this.lastChat.get(client.sessionId) || 0) < 1200) return;
      this.lastChat.set(client.sessionId, now);
      if (Number.isInteger(m?.p) && m.p >= 0 && m.p < CHAT_PRESETS) this.broadcast('chat', { id: client.sessionId, p: m.p });
      else if (Number.isInteger(m?.e) && m.e >= 0 && m.e < CHAT_EMOJIS) this.broadcast('chat', { id: client.sessionId, e: m.e });
    });

    // ── ของสะสม ──
    this.onMessage('look', (client, m) => {
      const p = player(client), meta = this.meta.get(client.sessionId);
      if (!p || !meta) return;
      Object.assign(p, cleanLook(m, meta.owned));
      this.saveProfile(client.sessionId);
    });
    this.onMessage('buy', (client, m) => {
      const p = player(client), meta = this.meta.get(client.sessionId);
      const key = String(m?.item || ''), price = priceOf(key);
      if (!p || !meta || price === null) return;
      if (meta.owned.includes(key)) return client.send('buyResult', { ok: false, msg: 'มีของชิ้นนี้แล้ว' });
      if (p.wallet < price) return client.send('buyResult', { ok: false, msg: 'เหรียญไม่พอ' });
      p.wallet -= price;
      meta.owned.push(key);
      this.saveProfile(client.sessionId);
      client.send('profile', { owned: meta.owned });
      client.send('buyResult', { ok: true, item: key });
    });
    this.onMessage('ride', (client, m) => {
      const p = player(client), meta = this.meta.get(client.sessionId);
      const id = Number(m?.veh) || 0;
      if (!p || !meta || p.seat) return;
      if (id && !meta.owned.includes(vehicleKey(id))) return;
      if (id !== p.veh) this.releasePassenger(client.sessionId);
      p.veh = VEHICLES.some((v) => v.id === id) ? id : 0;
      meta.lastVeh = p.veh || meta.lastVeh || 0;
    });
    // ซ้อนท้าย: คนขับชวนคนที่อยู่ใกล้ที่สุด → อีกฝ่ายกดรับ
    this.onMessage('invite', (client) => {
      const d = player(client);
      if (!d || d.veh !== 5 || this.passengerOf(client.sessionId)) return;
      let best = null, bd = 40; // 4 เมตร (หน่วยเดซิเมตร)
      this.state.players.forEach((q, id) => {
        if (id === client.sessionId || q.veh || q.seat || !q.online) return;
        const dist = Math.hypot(q.x - d.x, q.z - d.z);
        if (dist < bd) { bd = dist; best = id; }
      });
      if (!best) return client.send('inviteResult', { ok: false, msg: 'ไม่มีเพื่อนอยู่ใกล้ ๆ (ภายใน 4 เมตร)' });
      this.invites.set(best, { from: client.sessionId, at: Date.now() });
      this.clients.find((x) => x.sessionId === best)?.send('invite', { from: client.sessionId, name: d.name });
      client.send('inviteResult', { ok: true, msg: `ชวน ${this.state.players.get(best).name} แล้ว รอเพื่อนกดรับ` });
    });
    this.onMessage('accept', (client, m) => {
      const inv = this.invites.get(client.sessionId);
      this.invites.delete(client.sessionId);
      const q = player(client), d = this.state.players.get(inv?.from);
      if (!q || !d || !inv || inv.from !== m?.from || Date.now() - inv.at > 20000) return client.send('inviteResult', { ok: false, msg: 'คำชวนหมดเวลาแล้ว' });
      if (d.veh !== 5 || this.passengerOf(inv.from) || Math.hypot(q.x - d.x, q.z - d.z) > 80) return client.send('inviteResult', { ok: false, msg: 'ขึ้นไม่ทันแล้ว ลองให้เพื่อนชวนใหม่' });
      q.veh = 0;
      q.seat = inv.from;
      this.clients.find((x) => x.sessionId === inv.from)?.send('inviteResult', { ok: true, msg: `${q.name} ขึ้นซ้อนท้ายแล้ว 🚲` });
    });
    this.onMessage('unseat', (client) => { const q = player(client); if (q) q.seat = ''; });

    // ── คำสั่งครู ──
    // โหลดชุดคำถามล่าสุดจากคลัง (ครูอาจเพิ่ม/แก้คำถามหลังเปิดห้อง หรือเลือกชุดใหม่)
    const loadBank = async (id) => {
      const bank = await store.getBank(id || this.bankId);
      if (!bank || !bank.questions.length) return false;
      this.bankData = bank;
      this.bankId = bank.id;
      this.state.bank = bank.title;
      this.state.total = bank.questions.length;
      this.broadcast('bank', { id: bank.id, title: bank.title, questions: bank.questions });
      return true;
    };
    this.onMessage('setBank', teacherOnly(async (c, m) => {
      if (this.state.phase === 'play' || this.starting) return c.send('notice', { msg: 'เปลี่ยนชุดคำถามได้เมื่อจบรอบแล้ว' });
      if (!(await loadBank(m.bank))) return c.send('notice', { msg: 'ชุดนี้ยังไม่มีคำถาม' });
      console.log(`[${this.roomId}] เปลี่ยนชุดคำถามเป็น ${this.bankData.title}`);
    }));
    this.onMessage('start', teacherOnly(async (c, m) => {
      if (this.state.phase === 'play' || this.starting) return;
      this.starting = true;
      try {
        if (!(await loadBank(m.bank))) return c.send('notice', { msg: 'ชุดคำถามนี้ยังไม่มีคำถาม เพิ่มคำถามก่อนนะ' });
      } finally { this.starting = false; }
      if (m.minutes) this.minutes = num(Number(m.minutes), 5, 90);
      // เริ่มรอบใหม่: ล้างคะแนนรอบก่อน
      this.state.players.forEach((p, id) => { p.solved = 0; p.wrong = 0; p.coins = 0; const mt = this.meta.get(id); if (mt) { mt.attempts = {}; mt.solvedIds = new Set(); } });
      this.qstats.clear();
      this.startedAt = Date.now();
      this.state.endsAt = Date.now() + this.minutes * 60 * 1000;
      this.state.phase = 'play';
      this.broadcast('phase', { phase: 'play' });
      console.log(`[${this.roomId}] เริ่มรอบ ${this.minutes} นาที · ${this.bankData.title} ${this.bankData.questions.length} ข้อ`);
    }));
    this.onMessage('end', teacherOnly((c) => this.endRound(c)));
    this.onMessage('close', teacherOnly(() => {
      this.endRound();
      for (const c of this.clients) if (!this.teachers.has(c.sessionId)) c.send('closed', {});
      this.clock.setTimeout(() => this.disconnect(), 500);
    }));
    this.onMessage('extend', teacherOnly((c, m) => { if (this.state.phase === 'play') this.state.endsAt += num(Number(m.minutes) || 5, 1, 30) * 60 * 1000; }));
    this.onMessage('kick', teacherOnly((c, m) => {
      const target = this.clients.find((x) => x.sessionId === m.id);
      if (target) { target.send('kicked', {}); target.leave(4100); }
      this.removePlayer(m.id);
    }));
    this.onMessage('mute', teacherOnly((c, m) => { const p = this.state.players.get(m.id); if (p) p.muted = !!m.on; }));
    this.onMessage('bonus', teacherOnly((c, m) => {
      const p = this.state.players.get(m.id);
      const coins = num(Math.floor(m.coins), 1, 100);
      if (!p) return;
      p.coins += coins;
      p.wallet = Math.min(65535, p.wallet + coins);
      this.saveProfile(m.id);
      this.clients.find((x) => x.sessionId === m.id)?.send('bonus', { coins });
    }));
  }

  passengerOf(driverId) {
    let found = null;
    this.state.players.forEach((q, id) => { if (q.seat === driverId) found = id; });
    return found;
  }
  releasePassenger(driverId) {
    this.state.players.forEach((q) => { if (q.seat === driverId) q.seat = ''; });
  }
  /** บันทึกกระเป๋า/ของ/ชุด ของนักเรียนที่มีรหัส */
  saveProfile(id) {
    const p = this.state.players.get(id), meta = this.meta.get(id);
    if (!p || !meta?.studentCode) return;
    store.saveProfile(meta.studentCode, { coins: p.wallet, owned: meta.owned, equip: { skin: p.skin, hair: p.hair, hairColor: p.hairColor, outfit: p.outfit, veh: meta.lastVeh || 0 } })
      .catch((e) => console.error('บันทึกโปรไฟล์ไม่สำเร็จ', e.message));
  }

  async endRound(by) {
    if (this.state.phase !== 'play') { by?.send('notice', { msg: 'รอบนี้จบไปแล้ว' }); return; }
    this.state.phase = 'ended';
    this.broadcast('phase', { phase: 'ended' });
    const players = [];
    this.state.players.forEach((p, id) => players.push({ id, name: p.name, solved: p.solved, wrong: p.wrong, coins: p.coins, code: this.meta.get(id)?.studentCode || null }));
    players.sort((a, b) => b.solved - a.solved || b.coins - a.coins || a.wrong - b.wrong);
    const questions = this.bankData.questions.map((q) => ({ id: q.id, q: q.q, topic: q.topic, ...(this.qstats.get(q.id) || { right: 0, wrong: 0 }) }));
    // บันทึกผลพลาด (เน็ต/ฐานข้อมูล) ต้องไม่ทำให้เซิร์ฟเวอร์ล่ม — รอบยังจบได้ แค่แจ้งครู
    let resultId = null;
    try {
      resultId = await store.saveResult({ code: this.roomId, bank: this.bankData.title, minutes: this.minutes, startedAt: this.startedAt, endedAt: Date.now(), players: players.map(({ id, ...r }) => r), questions });
    } catch (e) {
      console.error(`[${this.roomId}] บันทึกผลรอบไม่สำเร็จ`, e.message);
      for (const c of this.clients) if (this.teachers.has(c.sessionId)) c.send('notice', { msg: '⚠️ จบรอบแล้ว แต่บันทึกผลลงฐานข้อมูลไม่สำเร็จ กดส่งออก Excel เก็บคะแนนไว้ก่อน' });
    }
    // เหรียญสะสมข้ามรอบสำหรับคนที่มีรหัสนักเรียน
    await store.updateStudents(players.filter((p) => p.code).map((p) => ({ code: p.code, solved: p.solved }))).catch((e) => console.error('บันทึกสถิตินักเรียนไม่สำเร็จ', e.message));
    this.state.players.forEach((p, id) => this.saveProfile(id));
    this.broadcast('results', { resultId, top: players.slice(0, 3).map((p) => ({ name: p.name, solved: p.solved, coins: p.coins })), ranks: players.map((p, i) => ({ id: p.id, rank: i + 1 })), total: players.length });
    console.log(`[${this.roomId}] จบรอบ · ${players.length} คน · บันทึก ${resultId}`);
  }

  async onJoin(client, options) {
    // ครู: ไม่มีตัวละคร แค่ดูและสั่งการ
    if (isTeacher(options?.teacher)) {
      this.teachers.add(client.sessionId);
      client.send('bank', { id: this.bankId, title: this.bankData.title, questions: this.bankData.questions });
      return;
    }
    if (this.state.players.size >= MAX_PLAYERS) throw new Error('ห้องเต็มแล้ว');
    let name = clean(options?.name), studentCode = null, stu = null;
    if (options?.studentCode) {
      const s = await store.findStudent(options.studentCode);
      if (!s) throw new Error('ไม่พบรหัสนักเรียนนี้');
      // รหัสเดียวกันเข้าซ้ำ: เตะตัวเก่าออก (เช่นเปลี่ยนเครื่อง)
      for (const [id, mt] of this.meta) if (mt.studentCode === s.code) { this.clients.find((x) => x.sessionId === id)?.leave(4101); this.removePlayer(id); }
      name = s.name; studentCode = s.code; stu = s;
    }
    const p = new Player();
    p.name = name;
    p.x = 0; p.y = 0; p.z = 1040;
    p.ry = 0; p.spd = 0; p.air = false; p.veh = 0; // ค่าเริ่มต้นครบทุกช่อง (ช่องว่าง = NaN ฝั่งเกม)
    // คะแนนรอบนี้ต้องเริ่มที่ 0 เสมอ (คนที่เข้าห้องหลังครูกดเริ่มรอบ ไม่งั้นเป็น undefined → ตอบผิดแล้วกลายเป็น NaN
    // ส่งสถานะห้องไม่ได้ทั้งห้อง หน้าครูค้าง กดจบรอบไม่ได้)
    p.solved = 0; p.wrong = 0; p.coins = 0; p.muted = false;
    // ของที่มี: นักเรียนมีรหัส = ของที่ซื้อไว้ · แขก = ของฟรีอย่างเดียว (ซื้อได้ แต่หายเมื่อออก)
    const owned = [...new Set([...FREE_ITEMS, ...(stu?.owned || [])])];
    Object.assign(p, cleanLook(stu?.equip || options?.look, owned));
    p.wallet = Math.min(65535, stu?.coins || 0);
    p.online = true;
    p.coded = !!studentCode;
    p.seat = '';
    this.state.players.set(client.sessionId, p);
    this.meta.set(client.sessionId, { studentCode, attempts: {}, solvedIds: new Set(), owned, lastVeh: stu?.equip?.veh || 0 });
    client.send('profile', { owned, look: { skin: p.skin, hair: p.hair, hairColor: p.hairColor, outfit: p.outfit }, lastVeh: stu?.equip?.veh || 0 });
    client.send('bank', { id: this.bankId, title: this.bankData.title, questions: this.bankData.questions });
    console.log(`[${this.roomId}] + ${p.name} (${this.state.players.size}/${MAX_PLAYERS})`);
  }

  async onDrop(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.online = false;
    try {
      await this.allowReconnection(client, 30);
      if (p) p.online = true;
    } catch { this.removePlayer(client.sessionId); this.teachers.delete(client.sessionId); }
  }

  onLeave(client) { this.removePlayer(client.sessionId); this.teachers.delete(client.sessionId); }

  removePlayer(id) {
    const p = this.state.players.get(id);
    if (!p) return;
    this.saveProfile(id);
    this.releasePassenger(id);
    this.invites.delete(id);
    this.state.players.delete(id);
    this.lastChat.delete(id);
    console.log(`[${this.roomId}] - ${p.name}`);
  }

  onDispose() { usedCodes.delete(this.roomId); console.log(`[${this.roomId}] ปิดห้อง`); }
}

// ── เริ่มเซิร์ฟเวอร์ ──
console.log(`ที่เก็บข้อมูล: ${store.backend === 'supabase' ? 'Supabase (ฐานข้อมูลบนคลาวด์)' : 'ไฟล์ในโฟลเดอร์ data/'}`);
const seeded = await store.seedBanks();
if (seeded) console.log(`ใส่คลังคำถามเริ่มต้น ${seeded} ชุด`);
const firstPin = await store.ensureTeacherPin(process.env.TEACHER_PIN);
if (firstPin) console.log(`\n🔑 รหัสครู (จดไว้ ใช้เข้าหน้าครู): ${firstPin}\n`);

const port = Number(process.env.PORT || 2567);
const server = new Server({ express: (app) => mountApi(app) });
server.define('school', SchoolRoom);
await server.listen(port, '0.0.0.0');
console.log(`โรงเรียนห้องสื่อครูอัง 3D: เซิร์ฟเวอร์พร้อมที่พอร์ต ${port}`);
