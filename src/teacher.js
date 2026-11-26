// หน้าครู: ห้องเรียนสด · คลังคำถาม · รายชื่อนักเรียน · ผลย้อนหลัง · ตั้งค่า
import { Client } from '@colyseus/sdk';
import QRCode from 'qrcode';
import { SERVER_URL, API_URL, wakeServer } from './config.js';
import { toCSV, parseCSV, download, bankToRows, rowsToQuestions, TEMPLATE_ROWS } from './csv.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TYPE_TH = { mc: 'ปรนัย', tf: 'ถูก/ผิด', order: 'เรียงลำดับ', code: 'อ่านโค้ด' };
const TOPIC_TH = { computing: 'วิทยาการคำนวณ', general: 'ความรู้ทั่วไป' };

// หน้าต่างยืนยันในหน้าเว็บเอง แทน confirm()/alert()/prompt() ของเบราว์เซอร์
// เพราะเบราว์เซอร์ในแอป (LINE, Facebook ฯลฯ) มักไม่แสดงหน้าต่างพวกนั้น แล้วตอบ "ยกเลิก" ให้เองทันที
function dialog(msg, { ok = 'ตกลง', cancel = 'ยกเลิก', input = null, danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dlg-wrap';
    wrap.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">
      <div class="dlg-msg"></div>
      ${input !== null ? '<input class="dlg-input" />' : ''}
      <div class="dlg-btns">${cancel ? '<button class="btn dlg-no"></button>' : ''}<button class="btn ${danger ? 'warn' : 'primary'} dlg-yes"></button></div>
    </div>`;
    wrap.querySelector('.dlg-msg').textContent = msg;
    wrap.querySelector('.dlg-yes').textContent = ok;
    if (cancel) wrap.querySelector('.dlg-no').textContent = cancel;
    const inp = wrap.querySelector('.dlg-input');
    if (inp) inp.value = input;
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const yes = () => done(inp ? inp.value.trim() : true);
    const no = () => done(inp ? null : false);
    const onKey = (e) => { if (e.key === 'Escape') no(); if (e.key === 'Enter') yes(); };
    wrap.querySelector('.dlg-yes').onclick = yes;
    if (cancel) wrap.querySelector('.dlg-no').onclick = no;
    wrap.onclick = (e) => { if (e.target === wrap && cancel) no(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    (inp || wrap.querySelector('.dlg-yes')).focus();
    inp?.select();
  });
}
const ask = (msg, opts) => dialog(msg, opts);
const tell = (msg) => dialog(msg, { cancel: null });

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ── API ──
let token = sessionStorage.getItem('vs-teacher') || '';
async function api(path, opts = {}) {
  const res = await fetch(API_URL + '/api' + path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { logout(); throw new Error(data.error || 'กรุณาเข้าสู่ระบบใหม่'); }
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

// ── เข้าสู่ระบบ ──
async function login() {
  $('login-msg').textContent = '';
  $('login-msg').className = 'msg ok';
  $('btn-login').disabled = true;
  // เซิร์ฟเวอร์ฟรีอาจหลับอยู่: ปลุกก่อน
  const awake = await wakeServer((sec) => { $('login-msg').textContent = `กำลังปลุกเซิร์ฟเวอร์... ${sec} วินาที (ครั้งแรกของวันอาจนานถึง 1 นาที)`; });
  $('btn-login').disabled = false;
  $('login-msg').className = 'msg';
  $('login-msg').textContent = '';
  if (!awake) { $('login-msg').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'; return; }
  try {
    const { token: t } = await api('/login', { method: 'POST', body: { pin: $('pin').value.trim() } });
    token = t;
    sessionStorage.setItem('vs-teacher', t);
    showApp();
  } catch (e) { $('login-msg').textContent = e.message.includes('fetch') ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เปิดเซิร์ฟเวอร์หรือยัง?)' : e.message; }
}
function logout() {
  token = '';
  sessionStorage.removeItem('vs-teacher');
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
}
$('btn-login').onclick = login;
$('pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('btn-logout').onclick = logout;

async function showApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  await loadBankOptions();
  const saved = localStorage.getItem('vs-teacher-room');
  if (saved) joinRoom(saved).catch(() => localStorage.removeItem('vs-teacher-room'));
}

// ── แท็บ ──
document.querySelectorAll('.tabs button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'banks') loadBanks();
    if (b.dataset.tab === 'students') loadStudents();
    if (b.dataset.tab === 'results') loadResults();
  };
});

// ═════════════ ห้องเรียนสด ═════════════
let room = null, bankQuestions = [], stats = [], lastRender = 0, timerStarted = false, currentBankId = '';

async function loadBankOptions() {
  const banks = await api('/banks');
  const opts = banks.map((b) => `<option value="${esc(b.id)}">${esc(b.title)} (${b.count} ข้อ)</option>`).join('');
  $('setup-bank').innerHTML = opts;
  $('live-bank').innerHTML = opts;
  if (currentBankId) $('live-bank').value = currentBankId;
}

$('btn-open').onclick = async () => {
  $('setup-msg').textContent = '';
  try {
    const r = await new Client(SERVER_URL).create('school', { teacher: token, bank: $('setup-bank').value, minutes: $('setup-minutes').value });
    attach(r);
  } catch (e) { $('setup-msg').textContent = 'สร้างห้องไม่ได้: ' + (e.message || e); }
};

async function joinRoom(code) { attach(await new Client(SERVER_URL).joinById(code, { teacher: token })); }

async function attach(r) {
  room = r;
  localStorage.setItem('vs-teacher-room', r.roomId);
  $('live-setup').classList.add('hidden');
  $('live-room').classList.remove('hidden');
  $('room-code').textContent = r.roomId;
  // ลิงก์ + QR ให้นักเรียนสแกน (ถ้าเปิดด้วย localhost ใช้ IP เครื่องแทน มือถือจะได้เข้าถึง)
  let host = location.host;
  if (/^(localhost|127\.)/.test(location.hostname)) {
    const { ips } = await api('/info').catch(() => ({ ips: [] }));
    if (ips[0]) {
      host = `${ips[0]}${location.port ? ':' + location.port : ''}`;
      $('lan-hint').innerHTML = `ลิงก์นี้ใช้ได้กับเครื่องที่ต่อ Wi-Fi เดียวกันเท่านั้น และต้องเปิดเกมด้วยคำสั่ง <b>npm run dev</b> (ที่เปิดให้เครื่องอื่นเข้าได้)`;
      $('lan-hint').classList.remove('hidden');
    }
  }
  const link = `${location.protocol}//${host}/?room=${r.roomId}`;
  $('room-link').value = link;
  $('qr').src = await QRCode.toDataURL(link, { width: 400, margin: 1, color: { dark: '#3b3355' } });

  r.onMessage('bank', (b) => {
    bankQuestions = b.questions;
    currentBankId = b.id || currentBankId;
    if (currentBankId) $('live-bank').value = currentBankId;
    $('bank-name').textContent = `📚 ${b.title} · ${b.questions.length} ข้อ`;
  });
  r.onMessage('notice', (m) => toast(m.msg));
  r.onMessage('stats', (s) => { stats = s; renderHard(); });
  r.onMessage('results', (res) => {
    toast(`จบรอบแล้ว · บันทึกผลเรียบร้อย (${res.total} คน)`);
    renderHard();
  });
  r.onMessage('*', () => {});
  r.send('getBank');
  r.onLeave(() => { toast('ออกจากห้องแล้ว'); resetLive(); });
  r.onDrop(() => toast('เน็ตหลุด กำลังเชื่อมต่อใหม่...'));
  r.onReconnect(() => toast('เชื่อมต่อกลับมาแล้ว'));
  r.onStateChange(() => { if (performance.now() - lastRender > 300) { lastRender = performance.now(); renderLive(); } });
  if (!timerStarted) { timerStarted = true; setInterval(renderTimer, 500); }
}

function resetLive() {
  room = null;
  localStorage.removeItem('vs-teacher-room');
  $('live-room').classList.add('hidden');
  $('live-setup').classList.remove('hidden');
}

const sortedPlayers = () => {
  const list = [];
  room?.state?.players?.forEach((p, id) => list.push({ id, p }));
  return list.sort((a, b) => b.p.solved - a.p.solved || b.p.coins - a.p.coins || a.p.wrong - b.p.wrong);
};

function renderLive() {
  if (!room?.state) return;
  const st = room.state;
  const phaseTh = { lobby: 'รอเริ่มรอบ', play: 'กำลังเล่น', ended: 'จบรอบแล้ว' }[st.phase] || st.phase;
  $('phase').textContent = phaseTh;
  $('phase').className = 'badge ' + st.phase;
  $('btn-start').textContent = st.phase === 'ended' ? '▶ เริ่มรอบใหม่' : '▶ เริ่มรอบ';
  $('btn-start').disabled = st.phase === 'play';
  $('btn-end').disabled = $('btn-extend').disabled = st.phase !== 'play';
  $('live-bank').disabled = st.phase === 'play';
  const list = sortedPlayers();
  $('count').textContent = list.length;
  $('empty-players').classList.toggle('hidden', list.length > 0);
  const medals = ['🥇', '🥈', '🥉'];
  $('players').innerHTML = list.map(({ id, p }, i) => `
    <tr class="${p.online ? '' : 'off'}">
      <td>${st.phase !== 'lobby' && i < 3 && p.solved > 0 ? `<span class="medal">${medals[i]}</span>` : i + 1}</td>
      <td>${esc(p.name)} ${p.coded ? '<span title="เข้าด้วยรหัสนักเรียน">🔑</span>' : ''}</td>
      <td class="num">${p.solved}/${st.total}</td>
      <td class="num">${p.wrong}</td>
      <td class="num">${p.coins}</td>
      <td>${p.online ? '🟢 ออนไลน์' : '🟠 หลุด'}</td>
      <td class="act">
        <button class="icon" data-act="bonus" data-id="${id}" title="ให้โบนัส 10 เหรียญ">🎁</button>
        <button class="icon ${p.muted ? 'on' : ''}" data-act="mute" data-id="${id}" title="${p.muted ? 'เปิดแชท' : 'ปิดแชท'}">${p.muted ? '🔇' : '💬'}</button>
        <button class="icon" data-act="kick" data-id="${id}" title="นำออกจากห้อง">🚪</button>
      </td>
    </tr>`).join('');
}

$('players').onclick = (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b || !room) return;
  const p = room.state.players.get(b.dataset.id);
  if (!p) return;
  if (b.dataset.act === 'bonus') { room.send('bonus', { id: b.dataset.id, coins: 10 }); toast(`ให้โบนัส ${p.name} 10 เหรียญ`); }
  if (b.dataset.act === 'mute') room.send('mute', { id: b.dataset.id, on: !p.muted });
  if (b.dataset.act === 'kick') ask(`นำ ${p.name} ออกจากห้อง?`, { ok: 'นำออก', danger: true }).then((y) => y && room?.send('kick', { id: b.dataset.id }));
};

function renderTimer() {
  if (!room?.state) return;
  const st = room.state;
  if (st.phase !== 'play') { $('timer').textContent = st.phase === 'lobby' ? '' : '00:00'; return; }
  const skew = st.now ? st.now - Date.now() : 0; // ชดเชยนาฬิกาเครื่องครูกับเซิร์ฟเวอร์ (โดยประมาณ)
  const left = Math.max(0, Math.round((st.endsAt - (Date.now() + skew)) / 1000));
  $('timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

function renderHard() {
  const rows = stats
    .map((s) => ({ ...s, q: bankQuestions.find((q) => q.id === s.id), total: s.right + s.wrong }))
    .filter((s) => s.q && s.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong)
    .slice(0, 5);
  $('empty-hard').classList.toggle('hidden', rows.length > 0);
  $('hard').innerHTML = rows.map((s) => {
    const pct = Math.round((s.wrong / s.total) * 100);
    return `<li><div>${esc(s.q.q)}</div><div class="muted small">ผิด ${s.wrong} ครั้ง · ถูก ${s.right} ครั้ง (ผิด ${pct}%)</div><div class="bar"><span style="width:${pct}%"></span></div></li>`;
  }).join('');
}

$('btn-start').onclick = () => room?.send('start', { minutes: Number($('setup-minutes').value), bank: $('live-bank').value });
// เปลี่ยนชุดคำถามระหว่างรอบ (ตอนรอเริ่ม/จบรอบ) — ตอนกำลังเล่นจะล็อกไว้
$('live-bank').onchange = () => { if (room?.state?.phase !== 'play') { room.send('setBank', { bank: $('live-bank').value }); toast('เปลี่ยนชุดคำถามแล้ว'); } };
$('btn-end').onclick = async () => { if (await ask('จบรอบตอนนี้? ระบบจะบันทึกคะแนนของทุกคน', { ok: '⏹ จบรอบ', danger: true })) { room?.send('end'); toast('กำลังจบรอบ...'); } };
$('btn-extend').onclick = () => { room?.send('extend', { minutes: 5 }); toast('เพิ่มเวลา 5 นาที'); };
$('btn-close').onclick = async () => { if (await ask('ปิดห้องนี้? นักเรียนทุกคนจะออกจากห้อง', { ok: 'ปิดห้อง', danger: true })) { room?.send('close'); setTimeout(() => { room?.leave(); resetLive(); }, 800); } };
$('btn-copy').onclick = () => { navigator.clipboard?.writeText($('room-link').value); toast('คัดลอกลิงก์แล้ว'); };
$('btn-export-live').onclick = () => {
  const rows = [['อันดับ', 'ชื่อ', 'รหัสนักเรียน', 'ทำได้ (ข้อ)', 'ตอบผิด (ครั้ง)', 'เหรียญ']];
  sortedPlayers().forEach(({ p }, i) => rows.push([i + 1, p.name, p.coded ? 'มี' : '', p.solved, p.wrong, p.coins]));
  download(`คะแนน-ห้อง-${room.roomId}.csv`, toCSV(rows));
};

// ═════════════ คลังคำถาม ═════════════
let banks = [], editing = null, dirty = false;

async function loadBanks(selectId) {
  banks = await api('/banks');
  $('bank-list').innerHTML = banks.map((b) => `<li data-id="${esc(b.id)}" class="${editing?.id === b.id ? 'active' : ''}"><span>${esc(b.title)}</span><span class="muted">${b.count} ข้อ</span></li>`).join('');
  if (selectId) openBank(selectId);
}
$('bank-list').onclick = (e) => { const li = e.target.closest('li'); if (li) openBank(li.dataset.id); };

async function openBank(id) {
  if (dirty && !(await ask('มีการแก้ไขที่ยังไม่ได้บันทึก ทิ้งการแก้ไขหรือไม่?', { ok: 'ทิ้งการแก้ไข', danger: true }))) return;
  editing = await api('/banks/' + id);
  dirty = false;
  document.querySelectorAll('#bank-list li').forEach((li) => li.classList.toggle('active', li.dataset.id === id));
  renderBank();
}

function renderBank() {
  const b = editing;
  const comp = b.questions.filter((q) => q.topic === 'computing').length;
  $('bank-editor').innerHTML = `
    <div class="card-head">
      <input id="bank-title" value="${esc(b.title)}" style="flex:1;font-size:18px" />
      <div class="bank-actions">
        <span id="dirty" class="dirty ${dirty ? '' : 'hidden'}">● ยังไม่บันทึก</span>
        <button id="b-save" class="btn primary small">💾 บันทึก</button>
      </div>
    </div>
    <div class="card-head">
      <div class="muted small">${b.questions.length}/50 ข้อ · วิทยาการคำนวณ ${comp} · ความรู้ทั่วไป ${b.questions.length - comp}</div>
      <div class="bank-actions">
        <button id="b-add" class="btn small" ${b.questions.length >= 50 ? 'disabled' : ''}>＋ เพิ่มคำถาม</button>
        <label class="btn small" style="margin:0;display:inline-block;color:inherit">⬆️ นำเข้า CSV<input id="b-import" type="file" accept=".csv,text/csv" hidden /></label>
        <button id="b-export" class="btn small">⬇️ ส่งออก CSV</button>
        <button id="b-delete" class="btn danger small">ลบชุดนี้</button>
      </div>
    </div>
    <table class="grid">
      <thead><tr><th>#</th><th>หมวด</th><th>ประเภท</th><th>คำถาม</th><th></th></tr></thead>
      <tbody>${b.questions.map((q, i) => `
        <tr class="qrow"><td>${i + 1}</td><td><span class="chip ${q.topic}">${TOPIC_TH[q.topic]}</span></td><td class="type">${TYPE_TH[q.type]}</td>
        <td>${esc(q.q)}</td>
        <td class="act"><button class="icon" data-edit="${i}" title="แก้ไข">✏️</button> <button class="icon" data-del="${i}" title="ลบ">🗑️</button></td></tr>`).join('')}
      </tbody>
    </table>`;
  $('bank-title').oninput = () => { b.title = $('bank-title').value; markDirty(); };
  $('b-save').onclick = saveBank;
  $('b-add').onclick = () => openQuestion(null);
  $('b-export').onclick = () => download(`${b.title}.csv`, toCSV(bankToRows(b)));
  $('b-delete').onclick = async () => {
    if (!(await ask(`ลบชุด "${b.title}" ทั้งชุด? (ย้อนกลับไม่ได้)`, { ok: 'ลบทั้งชุด', danger: true }))) return;
    await api('/banks/' + b.id, { method: 'DELETE' });
    editing = null; dirty = false;
    $('bank-editor').innerHTML = '<div class="empty">ลบแล้ว</div>';
    loadBanks(); loadBankOptions();
  };
  $('b-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { questions, errors } = rowsToQuestions(parseCSV(await file.text()));
    if (errors.length) await tell('มีบางแถวที่นำเข้าไม่ได้:\n\n' + errors.slice(0, 15).join('\n'));
    if (!questions.length) return;
    const replace = await ask(`พบคำถาม ${questions.length} ข้อ จะใส่แบบไหน?`, { ok: 'แทนที่ของเดิมทั้งหมด', cancel: 'ต่อท้ายของเดิม' });
    b.questions = (replace ? questions : [...b.questions, ...questions]).slice(0, 50);
    if (!replace && b.questions.length === 50) toast('ครบ 50 ข้อแล้ว ข้อที่เกินไม่ได้นำเข้า');
    markDirty(); renderBank();
  };
  $('bank-editor').querySelector('tbody').onclick = (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) openQuestion(Number(ed.dataset.edit));
    if (del) ask('ลบคำถามข้อนี้?', { ok: 'ลบ', danger: true }).then((y) => { if (y) { b.questions.splice(Number(del.dataset.del), 1); markDirty(); renderBank(); } });
  };
}
function markDirty() { dirty = true; $('dirty')?.classList.remove('hidden'); }

async function saveBank() {
  try {
    editing = await api('/banks/' + editing.id, { method: 'PUT', body: editing });
    dirty = false;
    toast('บันทึกแล้ว');
    renderBank(); loadBanks(); loadBankOptions();
  } catch (e) { tell(e.message); }
}

$('btn-new-bank').onclick = async () => {
  const title = await dialog('ชื่อชุดคำถามใหม่', { input: 'คลังคำถามใหม่', ok: 'สร้าง' });
  if (!title) return;
  const b = await api('/banks', { method: 'POST', body: { title, questions: [] } });
  editing = null; dirty = false;
  await loadBanks(b.id);
  loadBankOptions();
};
$('btn-template').onclick = () => download('ตัวอย่างคลังคำถาม.csv', toCSV(TEMPLATE_ROWS));

// ── ฟอร์มแก้ไขคำถาม ──
let editIndex = null;
function openQuestion(i) {
  editIndex = i;
  const q = i === null ? { topic: 'computing', type: 'mc', q: '', choices: ['', '', '', ''], answer: 0, hint: '' } : structuredClone(editing.questions[i]);
  $('q-modal-title').textContent = i === null ? 'เพิ่มคำถาม' : `แก้ไขคำถามข้อ ${i + 1}`;
  $('f-topic').value = q.topic;
  $('f-type').value = q.type;
  $('f-q').value = q.q;
  $('f-code').value = q.code || '';
  $('f-hint').value = q.hint || '';
  const choices = [...(q.choices || []), '', '', '', ''].slice(0, 4);
  $('f-choices').innerHTML = choices.map((c, k) => `<div class="choice-row"><input type="radio" name="f-ans" value="${k}" ${q.answer === k ? 'checked' : ''} /><input type="text" value="${esc(c)}" placeholder="ตัวเลือก ${'กขคง'[k]}" /></div>`).join('');
  document.querySelectorAll('input[name=f-tf]').forEach((r) => { r.checked = r.value === String(q.type === 'tf' ? q.answer : true); });
  $('f-items').value = (q.items || []).join('\n');
  $('f-msg').textContent = '';
  syncForm();
  $('q-modal').classList.remove('hidden');
}
function syncForm() {
  const t = $('f-type').value;
  $('f-code-wrap').classList.toggle('hidden', t !== 'code');
  $('f-choices-wrap').classList.toggle('hidden', !(t === 'mc' || t === 'code'));
  $('f-tf-wrap').classList.toggle('hidden', t !== 'tf');
  $('f-items-wrap').classList.toggle('hidden', t !== 'order');
}
$('f-type').onchange = syncForm;
$('f-cancel').onclick = () => $('q-modal').classList.add('hidden');
$('f-save').onclick = () => {
  const t = $('f-type').value;
  const q = { topic: $('f-topic').value, type: t, q: $('f-q').value.trim(), hint: $('f-hint').value.trim() };
  if (!q.q) return ($('f-msg').textContent = 'ใส่คำถามก่อน');
  if (t === 'mc' || t === 'code') {
    const inputs = [...document.querySelectorAll('#f-choices input[type=text]')].map((x) => x.value.trim());
    const ans = Number(document.querySelector('input[name=f-ans]:checked')?.value ?? -1);
    const choices = inputs.filter(Boolean);
    if (choices.length < 2) return ($('f-msg').textContent = 'ต้องมีตัวเลือกอย่างน้อย 2 ข้อ');
    if (ans < 0 || !inputs[ans]) return ($('f-msg').textContent = 'เลือกคำตอบที่ถูก (วงกลมหน้าตัวเลือกที่มีข้อความ)');
    q.choices = choices;
    q.answer = choices.indexOf(inputs[ans]);
    if (t === 'code') { q.code = $('f-code').value; if (!q.code.trim()) return ($('f-msg').textContent = 'ใส่โค้ดก่อน'); }
  } else if (t === 'tf') {
    q.answer = document.querySelector('input[name=f-tf]:checked')?.value === 'true';
  } else {
    q.items = $('f-items').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    if (q.items.length < 2) return ($('f-msg').textContent = 'ต้องมีอย่างน้อย 2 ขั้น');
  }
  if (editIndex === null) editing.questions.push(q);
  else editing.questions[editIndex] = { ...q, id: editing.questions[editIndex].id };
  $('q-modal').classList.add('hidden');
  markDirty(); renderBank();
};

// ═════════════ รายชื่อนักเรียน ═════════════
let students = [];
async function loadStudents() {
  students = await api('/students');
  const classes = [...new Set(students.map((s) => s.klass).filter(Boolean))];
  const cur = $('stu-filter').value;
  $('stu-filter').innerHTML = `<option value="">ทุกห้อง</option>` + classes.map((c) => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  renderStudents();
}
function filteredStudents() { const f = $('stu-filter').value; return students.filter((s) => !f || s.klass === f); }
function renderStudents() {
  const list = filteredStudents();
  $('stu-count').textContent = list.length;
  $('students').innerHTML = list.map((s) => `<tr><td class="num">${s.code}</td><td>${esc(s.name)}</td><td>${esc(s.klass)}</td><td class="num">${s.coins}</td><td class="num">${s.solved}</td><td class="num">${s.rounds}</td><td class="act"><button class="icon" data-del="${s.code}" title="ลบ">🗑️</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">ยังไม่มีรายชื่อ</td></tr>';
  $('print-cards').innerHTML = list.map((s) => `<div class="pcard"><div class="k">โรงเรียนห้องสื่อครูอัง 3D · ${esc(s.klass)}</div><div class="n">${esc(s.name)}</div><div class="k">รหัสนักเรียน</div><div class="c">${s.code}</div></div>`).join('');
}
$('stu-filter').onchange = renderStudents;
$('students').onclick = async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b || !(await ask('ลบนักเรียนคนนี้? เหรียญสะสมจะหายด้วย', { ok: 'ลบ', danger: true }))) return;
  await api('/students/' + b.dataset.del, { method: 'DELETE' });
  loadStudents();
};
$('btn-add-students').onclick = async () => {
  const names = $('stu-names').value.split('\n').map((x) => x.trim()).filter(Boolean);
  if (!names.length) return toast('ใส่ชื่อนักเรียนก่อน');
  const added = await api('/students', { method: 'POST', body: { names, klass: $('stu-class').value.trim() } });
  $('stu-names').value = '';
  toast(`สร้างรหัสนักเรียน ${added.length} คนแล้ว`);
  loadStudents();
};
$('btn-print').onclick = () => { if (!filteredStudents().length) return toast('ยังไม่มีรายชื่อ'); window.print(); };

// ═════════════ ผลย้อนหลัง ═════════════
async function loadResults() {
  const list = await api('/results');
  $('result-list').innerHTML = list.map((r) => `<li data-id="${r.id}"><span>${new Date(r.startedAt || Date.now()).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}<br><span class="muted">${esc(r.bank)}</span></span><span class="muted">${r.players} คน</span></li>`).join('')
    || '<li class="muted">ยังไม่มีผล</li>';
}
$('result-list').onclick = async (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  document.querySelectorAll('#result-list li').forEach((x) => x.classList.toggle('active', x === li));
  const r = await api('/results/' + li.dataset.id);
  const qs = [...r.questions].filter((q) => q.right + q.wrong > 0).sort((a, b) => b.wrong / (b.right + b.wrong) - a.wrong / (a.right + a.wrong));
  $('result-view').innerHTML = `
    <div class="card-head"><h2>${esc(r.bank)} · ห้อง ${r.code}</h2><button id="r-export" class="btn small">⬇️ ส่งออก Excel</button></div>
    <div class="muted small">${new Date(r.startedAt).toLocaleString('th-TH')} · ${r.minutes} นาที · ${r.players.length} คน</div>
    <table class="grid" style="margin-top:10px"><thead><tr><th>อันดับ</th><th>ชื่อ</th><th>✅ ทำได้</th><th>❌ ผิด</th><th>💰</th></tr></thead>
    <tbody>${r.players.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}${p.code ? ' 🔑' : ''}</td><td class="num">${p.solved}</td><td class="num">${p.wrong}</td><td class="num">${p.coins}</td></tr>`).join('')}</tbody></table>
    <h2 style="margin-top:18px">รายข้อ (เรียงจากข้อที่ผิดมากสุด)</h2>
    <table class="grid"><thead><tr><th>คำถาม</th><th>ถูก</th><th>ผิด</th><th>% ผิด</th></tr></thead>
    <tbody>${qs.map((q) => `<tr><td>${esc(q.q)}</td><td class="num">${q.right}</td><td class="num">${q.wrong}</td><td class="num">${Math.round((q.wrong / (q.right + q.wrong)) * 100)}%</td></tr>`).join('') || '<tr><td colspan="4" class="empty">ไม่มีการตอบในรอบนี้</td></tr>'}</tbody></table>`;
  $('r-export').onclick = () => {
    const rows = [['อันดับ', 'ชื่อ', 'รหัสนักเรียน', 'ทำได้ (ข้อ)', 'ตอบผิด (ครั้ง)', 'เหรียญ'], ...r.players.map((p, i) => [i + 1, p.name, p.code || '', p.solved, p.wrong, p.coins]),
      [], ['คำถาม', 'หมวด', 'ตอบถูก', 'ตอบผิด'], ...r.questions.map((q) => [q.q, TOPIC_TH[q.topic], q.right, q.wrong])];
    download(`ผล-${r.bank}-${r.id}.csv`, toCSV(rows));
  };
};

// ═════════════ ตั้งค่า ═════════════
$('btn-pin').onclick = async () => {
  $('pin-msg').className = 'msg';
  try {
    await api('/pin', { method: 'POST', body: { pin: $('new-pin').value.trim() } });
    $('pin-msg').className = 'msg ok';
    $('pin-msg').textContent = 'เปลี่ยนรหัสครูแล้ว ครั้งหน้าใช้รหัสใหม่';
    $('new-pin').value = '';
  } catch (e) { $('pin-msg').textContent = e.message; }
};

addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

if (token) showApp().catch(() => logout());
