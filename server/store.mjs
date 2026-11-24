// ที่เก็บข้อมูล: ถ้าตั้งค่า SUPABASE_URL + SUPABASE_SERVICE_KEY จะใช้ Supabase (ฐานข้อมูลบนคลาวด์)
// ถ้าไม่ได้ตั้ง จะเก็บเป็นไฟล์ในโฟลเดอร์ data/ (ใช้ตอนทดสอบในเครื่อง)
// ทุกฟังก์ชันเป็น async และหน้าตาเหมือนกันทั้งสองแบบ
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SEED = join(process.cwd(), 'seed');
export const MAX_QUESTIONS = 50;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ไม่มี 0/O 1/I ที่สับสนง่าย
const safeId = (id) => String(id).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
const hashPin = (pin, salt) => scryptSync(String(pin), salt, 32).toString('hex');

// ───────────────── แบ็กเอนด์: Supabase ─────────────────
const sb = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null;
export const backend = sb ? 'supabase' : 'file';
const must = ({ data, error }) => { if (error) throw new Error('ฐานข้อมูล: ' + error.message); return data; };

// ───────────────── แบ็กเอนด์: ไฟล์ ─────────────────
const DATA = join(process.cwd(), 'data');
if (!sb) for (const d of ['', 'banks', 'results']) mkdirSync(join(DATA, d), { recursive: true });
const read = (f, fallback) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fallback; } };
const write = (f, v) => { writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); renameSync(f + '.tmp', f); };
const F = { config: join(DATA, 'config.json'), banks: join(DATA, 'banks'), students: join(DATA, 'students.json'), results: join(DATA, 'results') };

// ── ค่าตั้ง (รหัสครู) ──
async function getConfig() {
  if (sb) return must(await sb.from('vs_config').select('value').eq('key', 'main').maybeSingle())?.value || {};
  return read(F.config, {});
}
async function setConfig(v) {
  if (sb) return must(await sb.from('vs_config').upsert({ key: 'main', value: v }));
  write(F.config, v);
}

/** สร้างรหัสครูครั้งแรก (ใช้ TEACHER_PIN ถ้าตั้งไว้) คืนรหัสที่สร้างใหม่ หรือ null ถ้ามีอยู่แล้ว */
export async function ensureTeacherPin(initial) {
  const cfg = await getConfig();
  if (cfg.pinHash) return null;
  const pin = /^\d{6}$/.test(initial || '') ? initial : String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString('hex');
  await setConfig({ ...cfg, pinHash: hashPin(pin, salt), salt });
  return pin;
}
export async function checkPin(pin) {
  const cfg = await getConfig();
  if (!cfg.pinHash) return false;
  const a = Buffer.from(hashPin(pin, cfg.salt), 'hex'), b = Buffer.from(cfg.pinHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function setPin(pin) {
  const salt = randomBytes(16).toString('hex');
  await setConfig({ ...(await getConfig()), pinHash: hashPin(pin, salt), salt });
}

// ── คลังคำถาม ──
export async function seedBanks() {
  if ((await listBanks()).length || !existsSync(SEED)) return 0;
  let n = 0;
  for (const f of readdirSync(SEED)) if (f.endsWith('.json')) { await saveBank(read(join(SEED, f))); n++; }
  return n;
}
export async function listBanks() {
  let list;
  if (sb) list = must(await sb.from('vs_banks').select('id, title, questions')).map((b) => ({ id: b.id, title: b.title, count: b.questions.length }));
  else list = readdirSync(F.banks).filter((f) => f.endsWith('.json')).map((f) => read(join(F.banks, f), null)).filter(Boolean).map((b) => ({ id: b.id, title: b.title, count: b.questions.length }));
  return list.sort((a, b) => a.title.localeCompare(b.title, 'th'));
}
export async function getBank(id) {
  if (sb) return must(await sb.from('vs_banks').select('id, title, questions').eq('id', safeId(id)).maybeSingle());
  return read(join(F.banks, safeId(id) + '.json'), null);
}
export async function saveBank(bank) {
  const id = safeId(bank.id) || 'bank-' + randomBytes(3).toString('hex');
  const clean = { id, title: String(bank.title || 'คลังคำถามใหม่').slice(0, 60), questions: validateQuestions(bank.questions || []) };
  if (sb) must(await sb.from('vs_banks').upsert({ ...clean, updated_at: new Date().toISOString() }));
  else write(join(F.banks, id + '.json'), clean);
  return clean;
}
export async function deleteBank(id) {
  if (sb) return must(await sb.from('vs_banks').delete().eq('id', safeId(id)));
  const f = join(F.banks, safeId(id) + '.json');
  if (existsSync(f)) unlinkSync(f);
}

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

// ── นักเรียน: รหัส เหรียญ ของที่มี ชุดที่ใส่ ──
const fileStudents = () => read(F.students, []);
export async function listStudents() {
  if (sb) return must(await sb.from('vs_students').select('code, name, klass, coins, rounds, solved, owned, equip').order('klass').order('name'));
  return fileStudents();
}
export async function addStudents(names, klass) {
  const existing = new Set((await listStudents()).map((s) => s.code));
  const added = [];
  for (const raw of names.slice(0, 300)) {
    const name = String(raw).trim().slice(0, 16);
    if (!name) continue;
    let code;
    do { code = Array.from({ length: 5 }, () => ALPHA[randomInt(ALPHA.length)]).join(''); } while (existing.has(code));
    existing.add(code);
    added.push({ code, name, klass: String(klass || '').slice(0, 20), coins: 0, rounds: 0, solved: 0, owned: [], equip: null });
  }
  if (!added.length) return added;
  if (sb) must(await sb.from('vs_students').insert(added));
  else write(F.students, [...fileStudents(), ...added]);
  return added;
}
export async function findStudent(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{5}$/.test(c)) return null;
  if (sb) return must(await sb.from('vs_students').select('code, name, klass, coins, rounds, solved, owned, equip').eq('code', c).maybeSingle());
  return fileStudents().find((s) => s.code === c) || null;
}
export async function deleteStudent(code) {
  if (sb) return must(await sb.from('vs_students').delete().eq('code', code));
  write(F.students, fileStudents().filter((s) => s.code !== code));
}
/** จบรอบ: เพิ่มจำนวนข้อที่ทำได้และจำนวนรอบ */
export async function updateStudents(updates) {
  if (!updates.length) return;
  if (sb) {
    for (const u of updates) {
      const s = await findStudent(u.code);
      if (s) must(await sb.from('vs_students').update({ solved: s.solved + (u.solved || 0), rounds: s.rounds + 1 }).eq('code', u.code));
    }
    return;
  }
  const all = fileStudents();
  for (const u of updates) { const s = all.find((x) => x.code === u.code); if (s) { s.solved += u.solved || 0; s.rounds += 1; } }
  write(F.students, all);
}
/** บันทึกกระเป๋าเหรียญ ของที่มี และการแต่งตัว */
export async function saveProfile(code, { coins, owned, equip }) {
  const v = { coins: Math.max(0, Math.floor(coins)), owned: [...new Set(owned)], equip };
  if (sb) return must(await sb.from('vs_students').update(v).eq('code', code));
  const all = fileStudents();
  const s = all.find((x) => x.code === code);
  if (s) { Object.assign(s, v); write(F.students, all); }
}

// ── ผลแต่ละรอบ ──
export async function saveResult(r) {
  const id = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${r.code}`;
  if (sb) must(await sb.from('vs_results').upsert({ id, code: r.code, bank: r.bank, started_at: r.startedAt, data: { id, ...r } }));
  else write(join(F.results, id + '.json'), { id, ...r });
  return id;
}
export async function listResults() {
  if (sb) {
    const rows = must(await sb.from('vs_results').select('id, code, bank, started_at, data->players').order('id', { ascending: false }).limit(100));
    return rows.map((r) => ({ id: r.id, code: r.code, bank: r.bank, startedAt: r.started_at, players: (r.players || []).length }));
  }
  return readdirSync(F.results).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 100).map((f) => {
    const r = read(join(F.results, f), null);
    return r && { id: r.id, code: r.code, bank: r.bank, startedAt: r.startedAt, players: r.players.length };
  }).filter(Boolean);
}
export async function getResult(id) {
  if (sb) return must(await sb.from('vs_results').select('data').eq('id', safeId(id)).maybeSingle())?.data || null;
  return read(join(F.results, safeId(id) + '.json'), null);
}
