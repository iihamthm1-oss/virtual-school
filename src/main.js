import * as THREE from 'three';
import { buildWorld, QUEST_SPOTS, SPAWN } from './world.js';
import { createCharacter, Controls, Player } from './player.js';
import { QuestManager, topicInfo, NEAR_DIST } from './quests.js';
import { openQuestion, toast, banner, sfx } from './ui.js';
import { makeLabel } from './util.js';
import bank from './data/bank-p4-6.js';
import { createNPCs } from './npc.js';
import { Net, lookFromName, lookStyle, showBubble } from './net.js';
import { PRESETS, EMOJIS } from './chat.js';
import { API_URL } from './config.js';

const $ = (id) => document.getElementById(id);

// รอฟอนต์ไทยก่อนวาดป้าย (ไม่เกิน 2.5 วิ ถ้าออฟไลน์ใช้ฟอนต์สำรอง)
await Promise.race([document.fonts.load('600 64px Mitr'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});

// ── เรนเดอร์ ──
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // ระดับภาพอัตโนมัติจะทำในช่วงที่ 5
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const FOG = { near: 90, far: 300 };
scene.fog = new THREE.Fog('#e9f4fb', FOG.near, FOG.far);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);

scene.add(new THREE.HemisphereLight('#fff6e8', '#9ccf86', 1.25));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const roomLight = new THREE.AmbientLight('#fff8ee', 0); // ไฟในห้อง (สว่างขึ้นตอนอยู่ในห้อง)
scene.add(roomLight);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ── โลกและผู้เล่น ──
const world = buildWorld(scene);
const controls = new Controls(canvas);
controls.enabled = false;
let character = createCharacter({});
scene.add(character.root);
let player = new Player(character, world);
const quests = new QuestManager(scene, bank, QUEST_SPOTS);
const npcs = createNPCs(scene, world);

// ลูกศรนำทางรอบเท้า
const arrowShape = new THREE.Shape();
arrowShape.moveTo(0, 0.55); arrowShape.lineTo(0.42, -0.1); arrowShape.lineTo(0.15, -0.1);
arrowShape.lineTo(0.15, -0.45); arrowShape.lineTo(-0.15, -0.45); arrowShape.lineTo(-0.15, -0.1); arrowShape.lineTo(-0.42, -0.1);
const arrowGeo = new THREE.ShapeGeometry(arrowShape);
arrowGeo.rotateX(-Math.PI / 2);
arrowGeo.rotateY(Math.PI); // ปลายลูกศรชี้ไปทาง +z
const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#7c6cf0', transparent: true, opacity: 0.85, depthWrite: false }));
arrow.visible = false;
scene.add(arrow);

// ── สถานะเกม ──
const state = { overview: false, started: false, startTime: 0, trackedId: null, modalOpen: false, near: null };
const isTouch = matchMedia('(pointer: coarse)').matches;

// ── หน้าเริ่ม: เข้าห้องด้วยรหัส / สร้างห้อง / เล่นคนเดียว ──
const net = new Net(scene);
let online = false;
$('name').value = localStorage.getItem('vs-name') || '';
$('code').value = new URLSearchParams(location.search).get('room') || '';
$('stucode').value = localStorage.getItem('vs-stucode') || '';
$('stucode').addEventListener('input', () => { $('stucode').value = $('stucode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
$('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g, '').slice(0, 6); });
const startMsg = (text, ok = false) => { $('start-msg').textContent = text; $('start-msg').classList.toggle('ok', ok); };
const busy = (on) => ['btn-join', 'btn-solo'].forEach((id) => { $(id).disabled = on; });

async function enter(mode) {
  let name = $('name').value.trim() || 'นักเรียน';
  const studentCode = $('stucode').value.trim().toUpperCase();
  localStorage.setItem('vs-name', $('name').value.trim());
  localStorage.setItem('vs-stucode', studentCode);
  if (mode !== 'solo' && studentCode) {
    // รหัสนักเรียน: ใช้ชื่อตามที่ครูลงทะเบียนไว้
    try {
      const res = await fetch(`${API_URL}/api/student/${encodeURIComponent(studentCode)}`);
      if (!res.ok) return startMsg('ไม่พบรหัสนักเรียนนี้ ลองตรวจอีกครั้ง หรือเว้นว่างไว้');
      name = (await res.json()).name;
    } catch { return startMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'); }
  }
  const look = lookFromName(name);
  if (mode !== 'solo') {
    const code = $('code').value.trim();
    if (!/^\d{6}$/.test(code)) return startMsg('กรอกรหัสห้อง 6 หลักจากครูก่อนนะ');
    busy(true);
    startMsg('กำลังเชื่อมต่อ...', true);
    try {
      await net.connect({ code, name, look, studentCode: studentCode || undefined });
      online = true;
    } catch (e) {
      busy(false);
      const msg = String(e?.message || e);
      return startMsg(msg.includes('not found') ? 'ไม่พบห้องนี้ ลองตรวจรหัสอีกครั้ง' : msg.includes('เต็ม') || msg.includes('full') || msg.includes('locked') ? 'ห้องนี้เต็มแล้ว (50 คน)' : msg.includes('รหัสนักเรียน') ? 'ไม่พบรหัสนักเรียนนี้' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
    }
  }
  scene.remove(character.root);
  character = createCharacter({ name, ...lookStyle(look) });
  scene.add(character.root);
  player = new Player(character, world);
  player.pos.set(SPAWN.x, 0, SPAWN.z);
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('quest-panel').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  if (isTouch || innerWidth < 720) $('quest-panel').classList.add('collapsed');
  if (online) {
    $('room-pill').classList.remove('hidden');
    $('room-code').textContent = net.code;
    $('btn-chat').classList.remove('hidden');
    npcs.setStudents(false); // มีเพื่อนจริงแล้ว ไม่ต้องมีนักเรียน NPC
    history.replaceState(null, '', '?room=' + net.code);
  }
  controls.enabled = true;
  controls.yaw = 0;
  state.started = true;
  state.startTime = performance.now();
  sfx('open');
  if (online) { syncPhase(); toast(`เข้าห้อง ${net.code} แล้ว · ${name}`); }
  else { quests.fill(player.pos); toast('ตามหาคริสตัลภารกิจ ✨ ลูกศรสีม่วงจะนำทาง'); }
}
$('btn-join').onclick = () => enter('join');
$('btn-solo').onclick = () => enter('solo');
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter('join'); });
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('code').value ? enter('join') : $('code').focus()); });
$('room-pill').onclick = () => { navigator.clipboard?.writeText(net.code); toast('คัดลอกรหัสห้อง ' + net.code + ' แล้ว'); };

// ── แชทสำเร็จรูป ──
const chatLog = (text) => {
  const el = document.createElement('div');
  el.className = 'line';
  el.textContent = text;
  $('chat-log').appendChild(el);
  while ($('chat-log').children.length > 5) $('chat-log').firstChild.remove();
  setTimeout(() => el.remove(), 6000);
};
let lastChat = 0;
function sendChat(m) {
  const now = performance.now();
  if (now - lastChat < 1200) return toast('ส่งช้าลงหน่อยนะ');
  lastChat = now;
  net.sendChat(m);
  $('chat-panel').classList.add('hidden');
}
PRESETS.forEach((text, p) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => sendChat({ p }); $('chat-presets').appendChild(b); });
EMOJIS.forEach((text, e) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => sendChat({ e }); $('chat-emojis').appendChild(b); });
$('btn-chat').onclick = () => $('chat-panel').classList.toggle('hidden');
addEventListener('keydown', (e) => {
  if (!online || !state.started || state.modalOpen || e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyT') $('chat-panel').classList.toggle('hidden');
  if (e.code === 'Escape') $('chat-panel').classList.add('hidden');
});
net.on('chat', ({ mine, name, text }) => {
  if (mine) showBubble(character.root, text);
  chatLog(`${mine ? 'ฉัน' : name}: ${text}`);
});
net.on('join', (name) => chatLog(`👋 ${name} เข้ามาในห้อง`));
net.on('leave', (name) => chatLog(`🚪 ${name} ออกจากห้อง`));
// ── รอบเรียน: รอครูเริ่ม → เล่น → จบรอบ ──
let roundBank = null, roundKey = '';
net.on('bank', (b) => { roundBank = b.questions; syncPhase(); });
net.on('phase', () => syncPhase());
function syncPhase() {
  if (!online || !state.started || !roundBank) return;
  const ph = net.phase;
  $('wait-banner').classList.toggle('hidden', ph !== 'lobby');
  const key = ph; // เพิ่มเวลา (endsAt เปลี่ยน) ไม่ถือเป็นรอบใหม่
  if (key === roundKey) return;
  roundKey = key;
  if (ph === 'play') {
    $('results').classList.add('hidden');
    quests.reset(roundBank);
    quests.fill(player.pos);
    state.startTime = performance.now();
    sfx('coin');
    banner('<div class="big">เริ่มรอบแล้ว! 🚀</div><div>ตามหาคริสตัลภารกิจ ลูกศรสีม่วงจะนำทาง</div>', 3000);
  } else quests.clear();
}
net.on('results', (r) => {
  quests.clear();
  const me = r.ranks.find((x) => x.id === net.room.sessionId);
  const order = [r.top[1], r.top[0], r.top[2]];
  $('podium').innerHTML = order.map((p, i) => {
    const place = [2, 1, 3][i];
    return p ? `<div class="col p${place}"><div class="who"></div><div class="score">✅ ${p.solved} ข้อ · 💰 ${p.coins}</div><div class="block">${place}</div></div>` : '<div class="col"></div>';
  }).join('');
  [...$('podium').querySelectorAll('.who')].forEach((el, i) => { el.textContent = order.filter(Boolean)[i]?.name ?? ''; });
  $('my-result').innerHTML = me ? `คุณได้อันดับที่ <b>${me.rank}</b> จาก ${r.total} คน<br>ทำภารกิจได้ ${quests.solved} ข้อ · ได้ ${quests.coins} เหรียญ` : '';
  $('results').classList.remove('hidden');
  sfx('good');
});
$('btn-res-close').onclick = () => $('results').classList.add('hidden');
net.on('bonus', (m) => { quests.coins += m.coins; updateHud(); sfx('coin'); toast(`🎁 ครูให้โบนัส ${m.coins} เหรียญ!`); });
net.on('kicked', () => banner('<div class="big">ครูนำคุณออกจากห้อง</div><div>ถ้าคิดว่าผิดพลาด ให้บอกครูนะ</div>', 10000));
net.on('closed', () => banner('<div class="big">ครูปิดห้องแล้ว</div><div>ขอบคุณที่มาเรียนนะ 👋</div>', 10000));

net.on('status', (s) => {
  if (s === 'drop') toast('เน็ตหลุด กำลังเชื่อมต่อใหม่...');
  if (s === 'back') toast('เชื่อมต่อกลับมาแล้ว ✅');
  if (s === 'left') banner('<div class="big">หลุดจากห้อง</div><div>รีเฟรชหน้าแล้วใส่รหัสห้องเดิมเพื่อกลับเข้าไป</div>', 8000);
});

// ── แผงภารกิจ ──
$('quest-toggle').onclick = () => $('quest-panel').classList.toggle('collapsed');
const tracked = () => quests.active.find((a) => a.q.id === state.trackedId) || quests.nearest(player.pos)?.quest;

function renderQuestList() {
  const list = $('quest-list');
  list.innerHTML = '';
  $('quest-count').textContent = quests.active.length;
  if (!quests.active.length) {
    list.innerHTML = `<li class="empty">${quests.finished ? '🏆 ทำภารกิจครบทุกข้อแล้ว!' : 'ไม่มีภารกิจ'}</li>`;
    return;
  }
  for (const a of quests.active) {
    const li = document.createElement('li');
    li.dataset.id = a.q.id;
    const info = topicInfo(a.q.topic);
    li.innerHTML = `<div class="row"><span class="where"></span><span class="chip ${a.q.topic}">${info.label}</span></div><div class="meta"></div>`;
    li.querySelector('.where').textContent = '📍 ' + a.spot.name;
    li.onclick = () => { state.trackedId = a.q.id; updateQuestMeta(); toast('นำทางไปที่ ' + a.spot.name); };
    list.appendChild(li);
  }
  updateQuestMeta();
}
function updateQuestMeta() {
  const tr = tracked();
  for (const li of $('quest-list').children) {
    const a = quests.active.find((x) => String(x.q.id) === li.dataset.id);
    if (!a) continue;
    li.classList.toggle('tracked', a === tr);
    const d = Math.round(Math.hypot(a.spot.x - player.pos.x, a.spot.z - player.pos.z));
    const left = quests.cooldownLeft(a);
    li.querySelector('.meta').innerHTML = `ห่าง ${d} ม. · ${a.attempts ? 'ได้ 5 เหรียญ' : 'ได้ 10 เหรียญ'}${left ? ` · <span class="cool">รอ ${left} วิ</span>` : ''}`;
  }
}

function updateHud() {
  if (online) syncPhase();
  const left = online ? net.secondsLeft : null;
  const s = left ?? Math.floor((performance.now() - state.startTime) / 1000);
  $('timer').parentElement.classList.toggle('timer-low', left !== null && left <= 60);
  if (online && left === null) { $('timer').textContent = net.phase === 'ended' ? 'จบรอบ' : 'รอเริ่ม'; $('coins').textContent = quests.coins; $('progress').textContent = `${quests.solved}/${quests.bank.length}`; $('online').textContent = net.count; return; }
  $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('coins').textContent = quests.coins;
  $('progress').textContent = `${quests.solved}/${quests.bank.length}`;
  if (online) $('online').textContent = net.count;
}

quests.on((type, data) => {
  if (type === 'change') { renderQuestList(); updateHud(); }
  if (type === 'finished') {
    sfx('coin');
    banner(`<div class="big">🏆 ภารกิจครบ ${bank.questions.length} ข้อ!</div><div>โบนัส +${data.bonus} เหรียญ · เดินเล่นต่อได้เลย</div>`, 5000);
  }
});

// ── ตอบภารกิจ ──
function tryInteract() {
  const n = state.near;
  if (!n || state.modalOpen) return;
  const left = quests.cooldownLeft(n);
  if (left) return toast(`รออีก ${left} วินาทีนะ`);
  state.modalOpen = true;
  controls.enabled = false;
  controls.keys.clear();
  openQuestion(n, {
    onResult: (correct) => {
      const reward = quests.submit(n, correct);
      if (online) net.sendAnswer(n.q.id, correct);
      if (correct) {
        $('coins').parentElement.classList.remove('bump');
        void $('coins').parentElement.offsetWidth;
        $('coins').parentElement.classList.add('bump');
        if (state.trackedId === n.q.id) state.trackedId = null;
      }
      updateHud();
      return reward;
    },
    onClose: () => {
      state.modalOpen = false;
      controls.enabled = true;
      if (!quests.active.includes(n)) quests.fill(player.pos); // ภารกิจใหม่มาแทน
      else renderQuestList();
    },
  });
}
$('prompt').onclick = tryInteract;

// ── มุมมองกว้าง (เห็นทั้งโรงเรียน) ──
const you = makeLabel('▼ คุณอยู่ที่นี่', { size: 9, bg: '#7c6cf0', fg: '#ffffff' });
you.material.depthTest = false;
you.renderOrder = 5;
you.visible = false;
scene.add(you);
function setOverview(on) {
  state.overview = on;
  controls.lockView = on;
  if (on) controls.yaw = 0; // ทิศเดินตรงกับจอ: ดันขึ้น = ไปทางเหนือของแผนที่
  $('btn-view').innerHTML = on ? '<span>🎥</span><span class="tx"> มุมปกติ</span>' : '<span>🗺️</span><span class="tx"> มุมกว้าง</span>';
  if (on) controls.ovZoom = 1;
  $('btn-view').classList.toggle('on', on);
  // เงาครอบทั้งโรงเรียนในมุมกว้าง ครอบรอบตัวในมุมปกติ
  const r = on ? 135 : 38;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: on ? 400 : 140 });
  sun.shadow.camera.updateProjectionMatrix();
}
$('btn-view').onclick = () => setOverview(!state.overview);
addEventListener('keydown', (e) => { if (e.code === 'KeyM' && state.started && !state.modalOpen && e.target.tagName !== 'INPUT') setOverview(!state.overview); });

// ── ลูป ──
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
let hudTick = 0;
let ov = 0;
let indoor = 0;
let roomK = 0;
let fpK = 0;
const eye = new THREE.Vector3(), eyeLook = new THREE.Vector3();
const camClamped = new THREE.Vector3();
const camNormal = new THREE.Vector3(), camOver = new THREE.Vector3(), lookAt = new THREE.Vector3();
const overLook = new THREE.Vector3(0, 0, 8);

function frame() {
  requestAnimationFrame(frame); // ขอเฟรมถัดไปก่อน: ถ้ามีข้อผิดพลาดในเฟรมนี้ เกมจะไม่ค้าง
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  world.update(t, dt);
  quests.update(t, dt);
  npcs.update(dt, t);
  net.update(dt, t);

  if (state.started) {
    player.update(dt, controls, t);
    if (online) net.sendMove(player, performance.now());
    if (controls.interactQueued) { controls.interactQueued = false; tryInteract(); }

    // ภารกิจที่อยู่ใกล้
    const nn = quests.nearest(player.pos);
    state.near = nn && nn.dist < NEAR_DIST ? nn.quest : null;
    const prompt = $('prompt');
    if (state.near && !state.modalOpen) {
      const left = quests.cooldownLeft(state.near);
      prompt.classList.remove('hidden');
      prompt.classList.toggle('cooling', left > 0);
      prompt.textContent = left ? `⏳ รออีก ${left} วินาที` : `❓ ตอบภารกิจ${isTouch ? '' : ' (E)'}`;
    } else prompt.classList.add('hidden');

    // ลูกศรนำทาง
    const tr = tracked();
    if (tr) {
      const dx = tr.spot.x - player.pos.x, dz = tr.spot.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      arrow.visible = d > NEAR_DIST + 1;
      const a = Math.atan2(dx, dz);
      arrow.position.set(player.pos.x + Math.sin(a) * 1.4, 0.09, player.pos.z + Math.cos(a) * 1.4);
      arrow.rotation.y = a;
      arrow.material.opacity = 0.6 + Math.sin(t * 5) * 0.25;
    } else arrow.visible = false;

    hudTick -= dt;
    if (hudTick <= 0) { hudTick = 0.25; updateHud(); updateQuestMeta(); }
  } else {
    controls.yaw += dt * 0.08; // หมุนกล้องช้า ๆ บนหน้าเริ่ม
    character.animate(dt, 0, false, t);
  }

  // กล้องบุคคลที่ 3
  camTarget.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), 1 - Math.exp(-dt * 10));
  // ในอาคาร: ซ่อนชั้นที่สูงกว่ากับหลังคา แล้วให้กล้องมองลงจากด้านบน · ของในห้องแสดงเฉพาะอาคารที่อยู่ใกล้
  const here = state.started ? world.buildingAt(player.pos) : null;
  const inRoom = here && here.room && !state.overview ? here.room : null;
  const cut = here && here.cut && !state.overview && !inRoom ? here : null; // ในห้อง: ไม่ตัดชั้นบน ใช้กล้องในห้องแทน
  for (const b of world.buildings) {
    const active = cut && cut.b === b;
    const near = Math.hypot(player.pos.x - b.cx, player.pos.z - b.cz) < b.radius + 25;
    b.roof.visible = !active;
    b.shells.forEach((sh, L) => { sh.visible = !active || L <= cut.level; });
    b.furns.forEach((f, L) => { f.visible = near && (!active || L <= cut.level); });
  }
  const where = here && !state.overview ? here : null;
  const key = where && (where.cut || where.room) ? where.b.name + '|' + where.level : '';
  if (key !== state.insideKey) {
    if (key) toast(`${where.b.name} · ชั้น ${where.level + 1}`);
    state.insideKey = key;
  }
  const inside = cut;
  indoor += ((inside && !state.overview ? 1 : 0) - indoor) * (1 - Math.exp(-dt * 6));
  const d0 = state.started ? controls.dist : 16;
  roomK += ((inRoom ? 1 : 0) - roomK) * (1 - Math.exp(-dt * 6));
  if (inRoom) state.room = inRoom;
  const d1 = THREE.MathUtils.lerp(d0, Math.min(d0, 8), indoor);
  const p1 = THREE.MathUtils.lerp(controls.pitch, Math.max(controls.pitch, 1.05), indoor);
  // ในห้อง: กล้องระดับสายตา ใกล้ตัว มองเห็นกระดาน
  const d = THREE.MathUtils.lerp(d1, Math.min(d0, 4.2), roomK);
  const p = THREE.MathUtils.lerp(p1, THREE.MathUtils.clamp(controls.pitch, 0.12, 0.45), roomK);
  roomLight.intensity = roomK * 0.55;
  camNormal.set(
    camTarget.x + Math.sin(controls.yaw) * Math.cos(p) * d,
    camTarget.y + Math.sin(p) * d,
    camTarget.z + Math.cos(controls.yaw) * Math.cos(p) * d,
  );
  // มุมกว้าง: ถอยกล้องจนเห็นทั้งโรงเรียน (คำนวณตามสัดส่วนจอ จอแนวตั้งต้องถอยไกลกว่า)
  ov += ((state.overview ? 1 : 0) - ov) * (1 - Math.exp(-dt * 4));
  const e = ov * ov * (3 - 2 * ov);
  if (e > 0.001) {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const od = Math.max(280, 135 / (half * camera.aspect)) * controls.ovZoom;
    // ซูมเข้ามากเท่าไร จุดกลางภาพยิ่งเลื่อนไปหาผู้เล่น
    const k = (1 - controls.ovZoom) / 0.75;
    overLook.set(player.pos.x * k, 0, 8 + (player.pos.z - 8) * k);
    camOver.set(overLook.x, Math.sin(0.98) * od, overLook.z + Math.cos(0.98) * od);
    camera.position.lerpVectors(camNormal, camOver, e);
    lookAt.lerpVectors(camTarget, overLook, e);
  } else {
    camera.position.copy(camNormal);
    lookAt.copy(camTarget);
  }
  // กันกล้องทะลุผนัง/เพดานตอนอยู่ในห้อง
  if (roomK > 0.01 && state.room) {
    const r = state.room, m = 0.3;
    camClamped.set(
      THREE.MathUtils.clamp(camera.position.x, r.minX + m, r.maxX - m),
      THREE.MathUtils.clamp(camera.position.y, r.floor + 0.9, r.ceil - 0.35),
      THREE.MathUtils.clamp(camera.position.z, r.minZ + m, r.maxZ - m),
    );
    camera.position.lerp(camClamped, roomK);
  }
  // ห้องแคบจนกล้องชิดหลังตัวละคร → ค่อย ๆ เปลี่ยนเป็นมองผ่านสายตาตัวละคร (บุคคลที่ 1)
  const camDist = camera.position.distanceTo(camTarget);
  const fpT = roomK > 0.01 && state.room ? THREE.MathUtils.clamp((3.0 - camDist) / 1.2, 0, 1) * roomK : 0;
  fpK += (fpT - fpK) * (1 - Math.exp(-dt * 8));
  if (fpK > 0.01) {
    eye.set(player.pos.x, player.pos.y + 1.45, player.pos.z);
    camera.position.lerp(eye, fpK);
    eyeLook.set(eye.x - Math.sin(controls.yaw) * 6, eye.y + (0.35 - controls.pitch) * 4, eye.z - Math.cos(controls.yaw) * 6);
    lookAt.lerp(eyeLook, fpK);
  }
  character.root.visible = fpK < 0.6;
  // ในห้องขยายมุมกล้องให้เห็นทั่วห้อง (โดยเฉพาะจอมือถือแนวตั้ง)
  const fov = 55 + roomK * (camera.aspect < 1 ? 22 : 12);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.lookAt(lookAt);
  scene.fog.near = FOG.near + e * 2000;
  scene.fog.far = FOG.far + e * 3000;
  world.clouds.visible = e < 0.3;
  quests.viewScale = 1 + e * 3.5 * controls.ovZoom;
  you.visible = e > 0.3;
  you.position.set(player.pos.x, 9 + Math.sin(t * 4) * 0.8, player.pos.z);

  // แดดตามผู้เล่นในมุมปกติ อยู่กลางโรงเรียนในมุมกว้าง
  const sx = state.overview ? 0 : player.pos.x, sz = state.overview ? 0 : player.pos.z;
  sun.position.set(sx + 60, 110, sz + 44);
  sun.target.position.set(sx, 0, sz);

  renderer.render(scene, camera);
}
camTarget.set(SPAWN.x, 1.3, SPAWN.z);
player.pos.set(SPAWN.x, 0, SPAWN.z);
requestAnimationFrame(frame);

// ไว้ทดสอบจากคอนโซล
window.__vs = { net, quests, get player() { return player; }, controls, state };
