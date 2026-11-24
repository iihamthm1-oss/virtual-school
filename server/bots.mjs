// บอทจำลองนักเรียน ไว้ทดสอบว่าเซิร์ฟเวอร์รับคนพร้อมกันไหว
// ใช้: node bots.mjs <รหัสห้อง> [จำนวนบอท=49] [วินาที=60]
import { Client } from '@colyseus/sdk';

const [code, nArg = '49', secArg = '60'] = process.argv.slice(2);
const URL = process.env.SERVER || 'ws://localhost:2567';
const N = Number(nArg), SECONDS = Number(secArg);
if (!/^\d{6}$/.test(code || '')) { console.log('ใช้: node bots.mjs <รหัสห้อง 6 หลัก> [จำนวน] [วินาที]'); process.exit(1); }

// จุดบนถนน (ตรงกับผังโรงเรียน)
const POINTS = [[0, 104], [0, 84], [0, 72], [-7, 58], [7, 58], [0, 44], [0, 38], [-45, 38], [45, 38], [-80, 38], [80, 38],
  [-45, 0], [45, 0], [-45, -32], [45, -32], [0, -32], [-30, 84], [30, 84], [-16, 31.5], [16, 31.5]];
const NAMES = ['มะปราง', 'ต้นกล้า', 'น้ำใส', 'ภูผา', 'ขนุน', 'ใบเตย', 'ฟ้าใส', 'ข้าวหอม', 'ทะเล', 'มะลิ'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let received = 0, bytes = 0, joined = 0, failed = 0;
const bots = [];

async function spawn(i) {
  try {
    const room = await new Client(URL).joinById(code, { name: `บอท${pick(NAMES)}${i + 1}`, look: Math.floor(Math.random() * 256) });
    room.onMessage('chat', () => { received++; });
    room.onMessage('bank', (b) => { bot.qids = b.questions.map((q) => q.id); });
    for (const t of ['phase', 'results', 'bonus', 'kicked', 'closed']) room.onMessage(t, () => {});
    room.onStateChange(() => { received++; });
    const ws = room.connection?.transport?.ws;
    ws?.addEventListener?.('message', (e) => { bytes += e.data?.byteLength || e.data?.length || 0; });
    const [sx, sz] = pick(POINTS);
    var bot = { room, x: sx, z: sz, target: pick(POINTS), speed: 2 + Math.random() * 4, solved: 0, qids: Array.from({ length: 50 }, (_, k) => k + 1), skill: 0.4 + Math.random() * 0.5 };
    bots.push(bot);
    joined++;
  } catch (e) {
    failed++;
    console.log(`บอท ${i + 1} เข้าไม่ได้: ${e.message}`);
  }
}

for (let i = 0; i < N; i++) { await spawn(i); await new Promise((r) => setTimeout(r, 60)); }
console.log(`เข้าห้องแล้ว ${joined}/${N} ตัว (ล้มเหลว ${failed})`);

const DT = 0.1;
const tick = setInterval(() => {
  for (const b of bots) {
    const [tx, tz] = b.target;
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.5) b.target = pick(POINTS);
    else { const s = Math.min(d, b.speed * DT); b.x += (dx / d) * s; b.z += (dz / d) * s; }
    b.room.send('move', { x: +b.x.toFixed(1), y: 0, z: +b.z.toFixed(1), ry: Math.atan2(dx, dz), spd: b.speed, air: false });
    if (Math.random() < 0.004) b.room.send('chat', { p: Math.floor(Math.random() * 12) });
    // ตอบคำถามแบบสุ่ม (บอทเก่งไม่เท่ากัน)
    if (b.qids.length && Math.random() < 0.01) b.room.send('answer', { qid: pick(b.qids), correct: Math.random() < b.skill });
  }
}, DT * 1000);

const t0 = Date.now();
const report = setInterval(() => {
  const s = (Date.now() - t0) / 1000;
  const mem = process.memoryUsage().rss / 1048576;
  console.log(`${s.toFixed(0)} วิ · บอทออนไลน์ ${bots.length} · อัปเดตที่บอททุกตัวได้รับรวม ${received} · ข้อมูลเข้า ${(bytes / 1024).toFixed(0)} KB · RAM บอท ${mem.toFixed(0)} MB`);
}, 10000);

setTimeout(async () => {
  clearInterval(tick); clearInterval(report);
  const s = (Date.now() - t0) / 1000;
  console.log(`จบการทดสอบ ${s.toFixed(0)} วิ · เฉลี่ยข้อมูลต่อบอท ${(bytes / 1024 / Math.max(1, bots.length) / s).toFixed(1)} KB/วินาที`);
  for (const b of bots) await b.room.leave().catch(() => {});
  process.exit(0);
}, SECONDS * 1000);
