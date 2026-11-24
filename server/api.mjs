// API สำหรับหน้าครู (ต้องเข้าสู่ระบบด้วยรหัสครูก่อน)
import express from 'express';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import * as store from './store.mjs';

const tokens = new Map(); // token -> หมดอายุ (ms)
const TTL = 12 * 60 * 60 * 1000;
export const isTeacher = (t) => { const exp = tokens.get(t); if (!exp || exp < Date.now()) { tokens.delete(t); return false; } return true; };

// กันเดารหัสครู: ผิด 5 ครั้งใน 10 นาที พัก 10 นาที
const fails = new Map();
const limited = (ip) => { const f = fails.get(ip); return f && f.n >= 5 && Date.now() - f.t < 10 * 60 * 1000; };

export function mountApi(app) {
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    // หน้าเว็บอยู่คนละพอร์ตกับเซิร์ฟเวอร์ตอนพัฒนา
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'content-type, authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.post('/api/login', (req, res) => {
    const ip = req.ip;
    if (limited(ip)) return res.status(429).json({ error: 'ใส่รหัสผิดหลายครั้ง รออีก 10 นาที' });
    if (!store.checkPin(req.body?.pin)) {
      const f = fails.get(ip) || { n: 0, t: Date.now() };
      fails.set(ip, { n: f.n + 1, t: Date.now() });
      return res.status(401).json({ error: 'รหัสครูไม่ถูกต้อง' });
    }
    fails.delete(ip);
    const token = randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + TTL);
    res.json({ token });
  });

  // ทุกเส้นทางด้านล่างต้องเป็นครู
  // ใช้หัว Authorization มาตรฐาน (Colyseus ตอบ CORS preflight เอง และอนุญาตเฉพาะหัวมาตรฐาน)
  const auth = (req, res, next) => (isTeacher((req.get('authorization') || '').replace(/^Bearer /, '')) ? next() : res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' }));

  app.post('/api/pin', auth, (req, res) => {
    const pin = String(req.body?.pin || '');
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'รหัสครูต้องเป็นตัวเลข 6 หลัก' });
    store.setPin(pin);
    res.json({ ok: true });
  });

  // ที่อยู่ IP ของเครื่องในวง LAN (ให้ QR ใช้ตอนเปิดหน้าครูด้วย localhost)
  app.get('/api/info', auth, (req, res) => {
    const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    res.json({ ips });
  });
  app.get('/api/banks', auth, (req, res) => res.json(store.listBanks()));
  app.get('/api/banks/:id', auth, (req, res) => { const b = store.getBank(req.params.id); return b ? res.json(b) : res.status(404).json({ error: 'ไม่พบคลังคำถาม' }); });
  app.put('/api/banks/:id', auth, (req, res) => res.json(store.saveBank({ ...req.body, id: req.params.id })));
  app.post('/api/banks', auth, (req, res) => res.json(store.saveBank({ ...req.body, id: null })));
  app.delete('/api/banks/:id', auth, (req, res) => { store.deleteBank(req.params.id); res.json({ ok: true }); });

  app.get('/api/students', auth, (req, res) => res.json(store.listStudents()));
  app.post('/api/students', auth, (req, res) => res.json(store.addStudents(req.body?.names || [], req.body?.klass)));
  app.delete('/api/students/:code', auth, (req, res) => { store.deleteStudent(req.params.code); res.json({ ok: true }); });

  app.get('/api/results', auth, (req, res) => res.json(store.listResults()));
  app.get('/api/results/:id', auth, (req, res) => { const r = store.getResult(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'ไม่พบผล' }); });

  // นักเรียนตรวจรหัสนักเรียน (ไม่ต้องเป็นครู) — คืนแค่ชื่อ
  app.get('/api/student/:code', (req, res) => {
    const s = store.findStudent(req.params.code);
    return s ? res.json({ name: s.name, coins: s.coins }) : res.status(404).json({ error: 'ไม่พบรหัสนักเรียนนี้' });
  });
}
