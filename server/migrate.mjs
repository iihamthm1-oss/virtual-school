// ย้ายข้อมูลจากโฟลเดอร์ data/ (ในเครื่อง) ขึ้น Supabase
// ใช้: ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_KEY ในไฟล์ server/.env แล้วรัน  node migrate.mjs
// รันซ้ำได้: ข้อมูลที่มีรหัสเดียวกันจะถูกเขียนทับด้วยข้อมูลในเครื่อง
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

process.chdir(dirname(fileURLToPath(import.meta.url)));
// อ่าน .env เอง (สคริปต์นี้ไม่ได้รันผ่าน Colyseus)
if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.log('ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_KEY ใน server/.env'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const must = ({ error }, what) => { if (error) { console.log(`❌ ${what}: ${error.message}`); process.exit(1); } };

if (!existsSync('data')) { console.log('ไม่มีโฟลเดอร์ data/ ไม่มีอะไรต้องย้าย'); process.exit(0); }

if (existsSync('data/config.json')) { must(await sb.from('vs_config').upsert({ key: 'main', value: read('data/config.json') }), 'รหัสครู'); console.log('✅ รหัสครู (ใช้รหัสเดิมได้เลย)'); }

const banks = existsSync('data/banks') ? readdirSync('data/banks').filter((f) => f.endsWith('.json')).map((f) => read(join('data/banks', f))) : [];
if (banks.length) { must(await sb.from('vs_banks').upsert(banks.map((b) => ({ id: b.id, title: b.title, questions: b.questions }))), 'คลังคำถาม'); console.log(`✅ คลังคำถาม ${banks.length} ชุด`); }

const students = existsSync('data/students.json') ? read('data/students.json') : [];
if (students.length) {
  must(await sb.from('vs_students').upsert(students.map((s) => ({ code: s.code, name: s.name, klass: s.klass || '', coins: s.coins || 0, rounds: s.rounds || 0, solved: s.solved || 0, owned: s.owned || [], equip: s.equip || null }))), 'นักเรียน');
  console.log(`✅ นักเรียน ${students.length} คน`);
}

const results = existsSync('data/results') ? readdirSync('data/results').filter((f) => f.endsWith('.json')).map((f) => read(join('data/results', f))) : [];
if (results.length) { must(await sb.from('vs_results').upsert(results.map((r) => ({ id: r.id, code: r.code, bank: r.bank, started_at: r.startedAt, data: r }))), 'ผลย้อนหลัง'); console.log(`✅ ผลย้อนหลัง ${results.length} รอบ`); }

console.log('เสร็จแล้ว');
