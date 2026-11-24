// API สำหรับหน้าครู (ต้องเข้าสู่ระบบด้วยรหัสครูก่อน)
import express from 'express';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import * as store from './store.mjs';

const tokens = new Map(); // token -> หมดอายุ (ms)
const TTL = 12 * 60 * 60 * 1000;
export const isTeacher = (t) => { const exp = tokens.get(t); if (!exp || exp < Date.now()) { tokens.delete(t); return false; } return true; };

// จำกัดจำนวนครั้งต่อ IP (กันเดารหัส)
function limiter(max, windowMs) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now(), h = hits.get(ip);
    if (!h || now - h.t > windowMs) { hits.set(ip, { n: 1, t: now }); return false; }
    h.n++;
    return h.n > max;
  };
}
const loginFail = new Map();
const studentLookup = limiter(30, 60 * 1000); // ตรวจรหัสนักเรียนได้ 30 ครั้ง/นาที/IP

// ครอบ route แบบ async ให้ส่งข้อผิดพลาดเป็นภาษาไทย ไม่ให้เซิร์ฟเวอร์ล่ม
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(e); res.status(500).json({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ ลองใหม่อีกครั้ง' }); });

export function mountApi(app) {
  app.set('trust proxy', 1); // อยู่หลัง proxy ของผู้ให้บริการโฮสต์ (Render) → ได้ IP จริงของผู้ใช้
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.set('Access-Control-Allow-Headers', 'content-type, authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ไว้ปลุกเซิร์ฟเวอร์ฟรีที่หลับอยู่ และเช็กว่ายังทำงาน
  app.get('/api/health', (req, res) => res.json({ ok: true, backend: store.backend }));

  app.post('/api/login', wrap(async (req, res) => {
    const ip = req.ip, f = loginFail.get(ip);
    if (f && f.n >= 5 && Date.now() - f.t < 10 * 60 * 1000) return res.status(429).json({ error: 'ใส่รหัสผิดหลายครั้ง รออีก 10 นาที' });
    if (!(await store.checkPin(req.body?.pin))) {
      loginFail.set(ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
      return res.status(401).json({ error: 'รหัสครูไม่ถูกต้อง' });
    }
    loginFail.delete(ip);
    const token = randomBytes(24).toString('hex');
    tokens.set(token, Date.now() + TTL);
    res.json({ token });
  }));

  // ทุกเส้นทางด้านล่างต้องเป็นครู (หัว Authorization มาตรฐาน — Colyseus ตอบ CORS preflight เอง)
  const auth = (req, res, next) => (isTeacher((req.get('authorization') || '').replace(/^Bearer /, '')) ? next() : res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' }));

  app.post('/api/pin', auth, wrap(async (req, res) => {
    const pin = String(req.body?.pin || '');
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'รหัสครูต้องเป็นตัวเลข 6 หลัก' });
    await store.setPin(pin);
    res.json({ ok: true });
  }));

  // ที่อยู่ IP ของเครื่องในวง LAN (ให้ QR ใช้ตอนเปิดหน้าครูด้วย localhost)
  app.get('/api/info', auth, (req, res) => {
    const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    res.json({ ips });
  });

  app.get('/api/banks', auth, wrap(async (req, res) => res.json(await store.listBanks())));
  app.get('/api/banks/:id', auth, wrap(async (req, res) => { const b = await store.getBank(req.params.id); return b ? res.json(b) : res.status(404).json({ error: 'ไม่พบคลังคำถาม' }); }));
  app.put('/api/banks/:id', auth, wrap(async (req, res) => res.json(await store.saveBank({ ...req.body, id: req.params.id }))));
  app.post('/api/banks', auth, wrap(async (req, res) => res.json(await store.saveBank({ ...req.body, id: null }))));
  app.delete('/api/banks/:id', auth, wrap(async (req, res) => { await store.deleteBank(req.params.id); res.json({ ok: true }); }));

  app.get('/api/students', auth, wrap(async (req, res) => res.json(await store.listStudents())));
  app.post('/api/students', auth, wrap(async (req, res) => res.json(await store.addStudents(req.body?.names || [], req.body?.klass))));
  app.delete('/api/students/:code', auth, wrap(async (req, res) => { await store.deleteStudent(req.params.code); res.json({ ok: true }); }));

  app.get('/api/results', auth, wrap(async (req, res) => res.json(await store.listResults())));
  app.get('/api/results/:id', auth, wrap(async (req, res) => { const r = await store.getResult(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'ไม่พบผล' }); }));

  // นักเรียนตรวจรหัสนักเรียน (ไม่ต้องเป็นครู) — คืนแค่ชื่อ
  app.get('/api/student/:code', wrap(async (req, res) => {
    if (studentLookup(req.ip)) return res.status(429).json({ error: 'ลองบ่อยเกินไป รอสักครู่' });
    const s = await store.findStudent(req.params.code);
    return s ? res.json({ name: s.name }) : res.status(404).json({ error: 'ไม่พบรหัสนักเรียนนี้' });
  }));
}
