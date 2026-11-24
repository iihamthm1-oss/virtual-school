// ที่เก็บข้อมูลแบบไฟล์ (ช่วงที่ 3) — ช่วงที่ 6 จะเปลี่ยนไปใช้ Supabase โดยคงฟังก์ชันเดิมไว้
// โฟลเดอร์ data/ : config.json, banks/*.json, students.json, results/*.json
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, randomInt } from 'node:crypto';

const DATA = join(process.cwd(), 'data');
const SEED = join(process.cwd(), 'seed');
for (const d of ['', 'banks', 'results']) mkdirSync(join(DATA, d), { recursive: true });

const read = (f, fallback) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fallback; } };
// เขียนผ่านไฟล์ชั่วคราวก่อน กันไฟล์เสียถ้าเครื่องดับกลางคัน
const write = (f, v) => { writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); renameSync(f + '.tmp', f); };

// ── รหัสครู ──
const CONFIG = join(DATA, 'config.json');
const hashPin = (pin, salt) => scryptSync(String(pin), salt, 32).toString('hex');
export function ensureTeacherPin() {
  const cfg = read(CONFIG, null);
  if (cfg?.pinHash) return null;
  const pin = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString('hex');
  write(CONFIG, { pinHash: hashPin(pin, salt), salt });
  return pin; // คืนค่าครั้งแรกครั้งเดียว ให้พิมพ์บอกครู
}
export function checkPin(pin) {
  const cfg = read(CONFIG, null);
  if (!cfg?.pinHash) return false;
  const a = Buffer.from(hashPin(pin, cfg.salt), 'hex'), b = Buffer.from(cfg.pinHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function setPin(pin) {
  const salt = randomBytes(16).toString('hex');
  write(CONFIG, { ...read(CONFIG, {}), pinHash: hashPin(pin, salt), salt });
}

// ── คลังคำถาม ──
const BANKS = join(DATA, 'banks');
const safeId = (id) => String(id).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
export function seedBanks() {
  if (readdirSync(BANKS).some((f) => f.endsWith('.json'))) return;
  if (!existsSync(SEED)) return;
  for (const f of readdirSync(SEED)) if (f.endsWith('.json')) write(join(BANKS, f), read(join(SEED, f)));
}
export function listBanks() {
  return readdirSync(BANKS).filter((f) => f.endsWith('.json')).map((f) => {
    const b = read(join(BANKS, f), null);
    return b && { id: b.id, title: b.title, count: b.questions.length };
  }).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'th'));
}
export const getBank = (id) => read(join(BANKS, safeId(id) + '.json'), null);
export function saveBank(bank) {
  const id = safeId(bank.id) || 'bank-' + randomBytes(3).toString('hex');
  const clean = { id, title: String(bank.title || 'คลังคำถามใหม่').slice(0, 60), questions: validateQuestions(bank.questions || []) };
  write(join(BANKS, id + '.json'), clean);
  return clean;
}
export function deleteBank(id) { const f = join(BANKS, safeId(id) + '.json'); if (existsSync(f)) unlinkSync(f); }

export const MAX_QUESTIONS = 50;
export function validateQuestions(list) {
  const out = [];
  for (const q of list.slice(0, MAX_QUESTIONS)) {
    const base = { id: out.length + 1, topic: q.topic === 'computing' ? 'computing' : 'general', type: q.type, q: String(q.q || '').slice(0, 300), hint: String(q.hint || '').slice(0, 200) };
    if (!base.q) continue;
    if (q.code) base.code = String(q.code).slice(0, 400);
    if (q.type === 'mc' || q.type === 'code') {
      const choices = (q.choices || []).map((c) => String(c).slice(0, 120)).filter(Boolean).slice(0, 4);
      if (choices.length < 2 || !(q.answer >= 0 && q.answer < choices.length)) continue;
      out.push({ ...base, choices, answer: Number(q.answer) });
    } else if (q.type === 'tf') {
      out.push({ ...base, answer: q.answer === true || q.answer === 'true' });
    } else if (q.type === 'order') {
      const items = (q.items || []).map((c) => String(c).slice(0, 120)).filter(Boolean).slice(0, 6);
      if (items.length < 2) continue;
      out.push({ ...base, items });
    }
  }
  return out;
}

// ── รายชื่อนักเรียน + รหัสนักเรียน + เหรียญสะสม ──
const STUDENTS = join(DATA, 'students.json');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ไม่มี 0/O 1/I ที่สับสนง่าย
export const listStudents = () => read(STUDENTS, []);
export function addStudents(names, klass) {
  const all = listStudents();
  const used = new Set(all.map((s) => s.code));
  const added = [];
  for (const raw of names) {
    const name = String(raw).trim().slice(0, 16);
    if (!name) continue;
    let code;
    do { code = Array.from({ length: 5 }, () => ALPHA[randomInt(ALPHA.length)]).join(''); } while (used.has(code));
    used.add(code);
    const s = { code, name, klass: String(klass || '').slice(0, 20), coins: 0, rounds: 0, solved: 0, owned: [], equip: null };
    all.push(s);
    added.push(s);
  }
  write(STUDENTS, all);
  return added;
}
export const findStudent = (code) => listStudents().find((s) => s.code === String(code || '').toUpperCase().trim()) || null;
export function deleteStudent(code) { write(STUDENTS, listStudents().filter((s) => s.code !== code)); }
export function updateStudents(updates) {
  // updates: [{code, solved}] ตอนจบรอบ (เหรียญบันทึกแยกด้วย saveProfile)
  const all = listStudents();
  for (const u of updates) {
    const s = all.find((x) => x.code === u.code);
    if (!s) continue;
    s.solved += u.solved || 0;
    s.rounds += 1;
  }
  write(STUDENTS, all);
}
/** บันทึกกระเป๋าเหรียญ ของที่มี และการแต่งตัวของนักเรียน */
export function saveProfile(code, { coins, owned, equip }) {
  const all = listStudents();
  const s = all.find((x) => x.code === code);
  if (!s) return;
  s.coins = Math.max(0, Math.floor(coins));
  s.owned = [...new Set(owned)];
  s.equip = equip;
  write(STUDENTS, all);
}

// ── ผลแต่ละรอบ ──
const RESULTS = join(DATA, 'results');
export function saveResult(r) {
  const id = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${r.code}`;
  write(join(RESULTS, id + '.json'), { id, ...r });
  return id;
}
export function listResults() {
  return readdirSync(RESULTS).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 100).map((f) => {
    const r = read(join(RESULTS, f), null);
    return r && { id: r.id, code: r.code, bank: r.bank, startedAt: r.startedAt, players: r.players.length };
  }).filter(Boolean);
}
export const getResult = (id) => read(join(RESULTS, safeId(id) + '.json'), null);
