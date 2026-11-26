import * as THREE from 'three';
import { buildWorld, QUEST_SPOTS, SPAWN, SHOP_SPOTS } from './world.js';
import { createCharacter, Controls, Player } from './player.js';
import { QuestManager, topicInfo, NEAR_DIST } from './quests.js';
import { openQuestion, toast, banner, sfx } from './ui.js';
import { makeLabel } from './util.js';
import bank from './data/bank-p4-6.js';
import { createNPCs } from './npc.js';
import { Net, showBubble } from './net.js';
import { createLocker } from './locker.js';
import { initAudio, play, setMusic, setSfx, audioSettings, setOutdoors } from './audio.js';
import { createQuality, TIERS } from './quality.js';
import { createFx } from './fx.js';
import { DEFAULT_LOOK, FREE_ITEMS, VEHICLES, cleanLook } from './catalog.js';
import { PRESETS, EMOJIS } from './chat.js';
import { API_URL, wakeServer } from './config.js';

const $ = (id) => document.getElementById(id);

// รอฟอนต์ไทยก่อนวาดป้าย (ไม่เกิน 2.5 วิ ถ้าออฟไลน์ใช้ฟอนต์สำรอง)
// โหลดฟอนต์ทั้งชุดตัวอักษรไทยและละติน ทุกน้ำหนักที่ใช้ ก่อนวาดป้าย (ไม่งั้นวัดความกว้างด้วยฟอนต์สำรอง)
const FONT_SAMPLE = 'กขคอาคารเรียน สนามเด็กเล่น 0123456789 ABCabc';
await Promise.race([
  Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 64px Mitr`, FONT_SAMPLE))),
  new Promise((r) => setTimeout(r, 4000)),
]).catch(() => {});

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
const quality = createQuality({ renderer, sun });
const fx = createFx(scene);

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
// จอสัมผัส: มือถือ ไอแพด (รวมตอนต่อคีย์บอร์ด/แทร็กแพด) และโน้ตบุ๊กจอสัมผัส
let isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
function enableTouchUI() {
  isTouch = true;
  document.body.classList.add('touch');
  if (state.started) $('touch').classList.remove('hidden');
}
if (isTouch) document.body.classList.add('touch');
addEventListener('touchstart', () => { if (!$('touch') || !$('touch').classList.contains('hidden')) return; enableTouchUI(); }, { passive: true });

// ── ของสะสมของเรา: หน้าตา ของที่มี กระเป๋าเหรียญ พาหนะ ──
// ออนไลน์: เซิร์ฟเวอร์เป็นคนเก็บ · เล่นคนเดียว: เก็บในเครื่อง (localStorage)
const SOLO_KEY = 'vs-solo';
const prof = { look: { ...DEFAULT_LOOK }, owned: [...FREE_ITEMS], wallet: 0, veh: 0, riding: 0 };
try { const sv = JSON.parse(localStorage.getItem(SOLO_KEY) || '{}'); Object.assign(prof, { look: cleanLook(sv.look, [...FREE_ITEMS, ...(sv.owned || [])]), owned: [...new Set([...FREE_ITEMS, ...(sv.owned || [])])], wallet: sv.wallet || 0, veh: sv.veh || 0 }); } catch { /* ข้อมูลเสีย ใช้ค่าเริ่มต้น */ }
let myName = '';
const saveSolo = () => { if (!online) localStorage.setItem(SOLO_KEY, JSON.stringify({ look: prof.look, owned: prof.owned, wallet: prof.wallet, veh: prof.veh })); else localStorage.setItem('vs-look', JSON.stringify(prof.look)); };
const wallet = () => (online ? net.me?.wallet ?? 0 : prof.wallet);
const vehicleOf = (id) => VEHICLES.find((v) => v.id === id);

/** สร้างตัวละครเราใหม่ (หลังเปลี่ยนชุด/ทรงผม) */
function rebuildMe() {
  if (!state.started) return;
  scene.remove(character.root);
  character = createCharacter({ name: myName, look: prof.look });
  scene.add(character.root);
  player.c = character;
  shownRide = null;
}
const isIndoors = () => { const h = world.buildingAt(player.pos); return !!(h && (h.cut || h.room)) || player.pos.y > 0.3; };
/** ขึ้น/ลงพาหนะ */
function setRiding(id) {
  if (id && isIndoors()) return toast('ขี่พาหนะได้เฉพาะนอกอาคารนะ');
  if (id !== prof.riding) play(id ? 'ride' : 'whoosh');
  prof.riding = id;
  player.vehicleSpeed = id ? vehicleOf(id).speed : 0;
  if (online) net.ride(id);
  updateRideButtons();
}
let shownRide = null;
function updateRideButtons() {
  const seated = online && net.me?.seat;
  const ownsVehicle = prof.owned.some((k) => k[0] === 'v');
  $('btn-ride').classList.toggle('hidden', !state.started || (!ownsVehicle && !seated));
  $('btn-ride').classList.toggle('on', !!(prof.riding || seated));
  $('btn-ride').textContent = seated ? '⬇️' : prof.riding ? '🚶' : vehicleOf(prof.veh)?.icon || '🛹';
  $('btn-ride').title = seated ? 'ลงจากซ้อนท้าย (R)' : prof.riding ? 'ลงจากพาหนะ (R)' : 'ขึ้นพาหนะ (R)';
  $('btn-invite').classList.toggle('hidden', !(online && prof.riding === 5 && !seated));
}
function toggleRide() {
  if (online && net.me?.seat) { net.unseat(); return; }
  if (prof.riding) return setRiding(0);
  if (!prof.veh) { toast('เลือกพาหนะในตู้เสื้อผ้า 👕 ก่อนนะ'); return locker.openWardrobe(); }
  setRiding(prof.veh);
}
$('btn-ride').onclick = toggleRide;
$('btn-invite').onclick = () => net.invite();

/** ซื้อสำเร็จ: พาหนะใหม่ถูกเลือกไว้พร้อมขี่ และบอกวิธีใช้ */
function afterBuy(key, r) {
  if (!prof.owned.includes(key)) prof.owned.push(key);
  if (key[0] === 'v') {
    prof.veh = Number(key.slice(1));
    saveSolo();
    r.okMsg = `🎉 ซื้อ${vehicleOf(prof.veh).name}แล้ว! ปิดร้านแล้วกดปุ่ม ${vehicleOf(prof.veh).icon} ด้านขวาของจอ${isTouch ? '' : ' (หรือกด R)'} เพื่อขี่`;
  } else {
    r.okMsg = '🎉 ซื้อแล้ว! กด 👕 แต่งตัว เพื่อใส่ชุดนี้';
  }
  updateRideButtons();
}
const locker = createLocker({
  wallet,
  owned: () => prof.owned,
  look: () => prof.look,
  vehicle: () => prof.veh,
  async buy(key) {
    if (online) { const r = await net.buy(key); if (r.ok) { play('buy'); afterBuy(key, r); } return r; }
    const { priceOf } = await import('./catalog.js');
    const price = priceOf(key);
    if (prof.owned.includes(key)) return { ok: false, msg: 'มีของชิ้นนี้แล้ว' };
    if (prof.wallet < price) return { ok: false, msg: 'เหรียญไม่พอ' };
    prof.wallet -= price; prof.owned.push(key); saveSolo(); updateHud();
    play('buy');
    const r = { ok: true };
    afterBuy(key, r);
    return r;
  },
  setLook(look) {
    prof.look = cleanLook(look, prof.owned);
    if (online) net.sendLook(prof.look);
    saveSolo();
    rebuildMe();
  },
  selectVehicle(id) {
    prof.veh = id;
    saveSolo();
    setRiding(id && !isIndoors() ? id : 0);
  },
  onOpen(open) { state.modalOpen = open; controls.enabled = !open; if (open) controls.keys.clear(); },
});
$('btn-wardrobe').onclick = () => locker.openWardrobe();
let lastEmote = 0;
function doEmote(e) {
  if (prof.riding || performance.now() - lastEmote < 1500) return;
  lastEmote = performance.now();
  character.emote(e);
  if (online) net.emote(e);
  play('pop');
  $('chat-panel').classList.add('hidden');
}
$('chat-emotes').onclick = (ev) => { const b = ev.target.closest('[data-emote]'); if (b) doEmote(Number(b.dataset.emote)); };

// ── ตั้งค่า ──
function renderSettings() {
  document.querySelectorAll('#q-seg button').forEach((b) => b.classList.toggle('active', b.dataset.q === quality.mode));
  $('q-now').textContent = `(ตอนนี้: ${TIERS[quality.tier].label} · ${quality.fps} เฟรม/วินาที)`;
  const a = audioSettings();
  $('opt-music').checked = a.music;
  $('opt-sfx').checked = a.sfx;
}
$('btn-settings').onclick = () => { renderSettings(); $('settings').classList.remove('hidden'); state.modalOpen = true; controls.enabled = false; };
const closeSettings = () => { $('settings').classList.add('hidden'); state.modalOpen = false; controls.enabled = true; };
$('settings-close').onclick = closeSettings;
$('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('q-seg').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { quality.set(b.dataset.q); renderSettings(); } };
$('opt-music').onchange = (e) => setMusic(e.target.checked);
$('opt-sfx').onchange = (e) => setSfx(e.target.checked);
addEventListener('keydown', (e) => {
  if (!state.started || e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyC' && !state.modalOpen) locker.openWardrobe();
  if (e.code === 'KeyR' && !state.modalOpen) toggleRide();
  if (e.code === 'KeyF' && online && prof.riding === 5) net.invite();
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code) && !state.modalOpen) doEmote(Number(e.code.slice(5)) - 1);
});

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
  initAudio();
  let name = $('name').value.trim() || 'นักเรียน';
  const studentCode = $('stucode').value.trim().toUpperCase();
  localStorage.setItem('vs-name', $('name').value.trim());
  localStorage.setItem('vs-stucode', studentCode);
  if (mode !== 'solo') {
    if (!/^\d{6}$/.test($('code').value.trim())) return startMsg('กรอกรหัสห้อง 6 หลักจากครูก่อนนะ');
    // เซิร์ฟเวอร์ฟรีอาจหลับอยู่: ปลุกก่อน
    busy(true);
    const awake = await wakeServer((s) => startMsg(`กำลังปลุกเซิร์ฟเวอร์... ${s} วินาที (ครั้งแรกของวันอาจนานถึง 1 นาที)`, true));
    busy(false);
    if (!awake) return startMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
  }
  if (mode !== 'solo' && studentCode) {
    // รหัสนักเรียน: ใช้ชื่อตามที่ครูลงทะเบียนไว้
    try {
      const res = await fetch(`${API_URL}/api/student/${encodeURIComponent(studentCode)}`);
      if (!res.ok) return startMsg('ไม่พบรหัสนักเรียนนี้ ลองตรวจอีกครั้ง หรือเว้นว่างไว้');
      name = (await res.json()).name;
    } catch { return startMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'); }
  }
  if (mode !== 'solo') {
    const code = $('code').value.trim();
    if (!/^\d{6}$/.test(code)) return startMsg('กรอกรหัสห้อง 6 หลักจากครูก่อนนะ');
    busy(true);
    startMsg('กำลังเชื่อมต่อ...', true);
    try {
      let guestLook = prof.look;
      try { guestLook = cleanLook(JSON.parse(localStorage.getItem('vs-look') || 'null') || DEFAULT_LOOK); } catch { /* ใช้ค่าเริ่มต้น */ }
      prof.look = guestLook; prof.owned = [...FREE_ITEMS]; prof.veh = 0;
      await net.connect({ code, name, look: guestLook, studentCode: studentCode || undefined });
      online = true;
    } catch (e) {
      busy(false);
      const msg = String(e?.message || e);
      return startMsg(msg.includes('not found') ? 'ไม่พบห้องนี้ ลองตรวจรหัสอีกครั้ง' : msg.includes('เต็ม') || msg.includes('full') || msg.includes('locked') ? 'ห้องนี้เต็มแล้ว (50 คน)' : msg.includes('รหัสนักเรียน') ? 'ไม่พบรหัสนักเรียนนี้' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
    }
  }
  scene.remove(character.root);
  myName = name;
  character = createCharacter({ name, look: prof.look });
  scene.add(character.root);
  player = new Player(character, world);
  player.pos.set(SPAWN.x, 0, SPAWN.z);
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('quest-panel').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  if (isTouch || innerWidth < 900) $('quest-panel').classList.add('collapsed');
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
  updateRideButtons();
  $('btn-chat').classList.remove('hidden');
  if (!online) $('chat-presets').classList.add('hidden');
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
  if (!state.started || state.modalOpen || e.target.tagName === 'INPUT') return;
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
    play('bell');
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
  play('fanfare');
  fx.fireworks(0, 58, 10);
});
$('btn-res-close').onclick = () => $('results').classList.add('hidden');
net.on('bonus', (m) => { quests.coins += m.coins; updateHud(); sfx('coin'); toast(`🎁 ครูให้โบนัส ${m.coins} เหรียญ!`); });
net.on('profile', (p) => {
  if (Array.isArray(p.owned)) prof.owned = p.owned;
  if (p.lastVeh !== undefined && !prof.veh) prof.veh = p.lastVeh;
  // ข้อความหลังซื้อของมีแค่รายการของ ไม่มีหน้าตา: อย่าเอาค่าว่างไปทับ
  if (p.look) {
    const changed = JSON.stringify(p.look) !== JSON.stringify(prof.look);
    prof.look = cleanLook(p.look, prof.owned);
    if (changed) rebuildMe();
  }
  updateRideButtons();
  locker.refresh();
});
let inviteFrom = null, inviteTimer = 0;
net.on('invite', (m) => {
  inviteFrom = m.from;
  $('invite-text').textContent = `🚲 ${m.name} ชวนนั่งซ้อนท้าย`;
  $('invite-box').classList.remove('hidden');
  sfx('open');
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(() => $('invite-box').classList.add('hidden'), 15000);
});
$('invite-yes').onclick = () => { if (prof.riding) setRiding(0); net.accept(inviteFrom); $('invite-box').classList.add('hidden'); };
$('invite-no').onclick = () => $('invite-box').classList.add('hidden');
net.on('inviteResult', (m) => toast(m.msg));
net.on('kicked', () => banner('<div class="big">ครูนำคุณออกจากห้อง</div><div>ถ้าคิดว่าผิดพลาด ให้บอกครูนะ</div>', 10000));
net.on('closed', () => banner('<div class="big">ครูปิดห้องแล้ว</div><div>ขอบคุณที่มาเรียนนะ 👋</div>', 10000));

net.on('status', (s) => {
  if (s === 'drop') toast('เน็ตหลุด กำลังเชื่อมต่อใหม่...');
  if (s === 'back') toast('เชื่อมต่อกลับมาแล้ว ✅');
  if (s === 'left') banner('<div class="big">หลุดจากห้อง</div><div>รีเฟรชหน้าแล้วใส่รหัสห้องเดิมเพื่อกลับเข้าไป</div>', 8000);
});

// ── แผงภารกิจ ──
$('quest-toggle').onclick = () => $('quest-panel').classList.toggle('collapsed');

// กันแผงภารกิจทับแถบบน: จอแนวนอนของมือถือกว้างพอเข้ากฎจอคอม แต่แถบบนยาวจนชนแผง
// ถ้าชนกันจริง ให้แผงเลื่อนลงมาอยู่ใต้แถบบน (เช็กใหม่ทุกวินาที เพราะความยาวแถบบนเปลี่ยนตามรหัสห้อง/เวลา)
function fitQuestPanel() {
  const qp = $('quest-panel');
  if (qp.classList.contains('hidden')) return;
  qp.style.top = '';
  const h = $('hud').getBoundingClientRect(), q = qp.getBoundingClientRect();
  if (h.width && h.left < q.right + 6 && h.bottom > q.top) qp.style.top = `${Math.ceil(h.bottom + 8)}px`;
  // จอเตี้ย (มือถือแนวนอน): แผงที่กางอยู่ต้องไม่ยาวลงไปทับจอยสติ๊ก ให้รายการเลื่อนดูในแผงแทน
  const joy = $('joystick'), list = $('quest-list');
  qp.style.maxHeight = '';
  list.style.maxHeight = '';
  if (joy && joy.getClientRects().length && !qp.classList.contains('collapsed')) {
    const j = joy.getBoundingClientRect(), top = qp.getBoundingClientRect().top;
    if (j.left < q.right && j.top < qp.getBoundingClientRect().bottom) {
      const room = Math.max(90, j.top - top - 8);
      qp.style.maxHeight = `${room}px`;
      list.style.maxHeight = `${Math.max(40, room - $('quest-toggle').offsetHeight)}px`;
      list.style.overflowY = 'auto';
    }
  }
}
addEventListener('resize', fitQuestPanel);
$('quest-toggle').addEventListener('click', () => requestAnimationFrame(fitQuestPanel));
setInterval(fitQuestPanel, 1000);
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
  if (online && left === null) { $('timer').textContent = net.phase === 'ended' ? 'จบรอบ' : 'รอเริ่ม'; $('coins').textContent = wallet(); $('progress').textContent = `${quests.solved}/${quests.bank.length}`; $('online').textContent = net.count; return; }
  $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('coins').textContent = wallet();
  $('progress').textContent = `${quests.solved}/${quests.bank.length}`;
  if (online) $('online').textContent = net.count;
}

quests.on((type, data) => {
  if (type === 'change') { renderQuestList(); updateHud(); }
  if (type === 'finished') {
    sfx('coin');
    if (!online) { prof.wallet += data.bonus; saveSolo(); }
    play('fanfare');
    fx.fireworks(player.pos.x, player.pos.z - 10, 8);
    banner(`<div class="big">🏆 ภารกิจครบ ${quests.bank.length} ข้อ!</div><div>โบนัส +${data.bonus} เหรียญ · เดินเล่นต่อได้เลย</div>`, 5000);
  }
});

// ── ตอบภารกิจ ──
function tryInteract() {
  const n = state.near;
  if (!n && state.nearShop && !state.modalOpen) return locker.openShop();
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
      else if (reward) { prof.wallet += reward; saveSolo(); }
      if (correct) {
        fx.floatText(`+${reward} 💰`, n.spot.x, 3.4, n.spot.z);
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
  fx.update(dt);
  quality.tick(dt);
  npcs.update(dt, t);
  net.update(dt, t);

  if (state.started) {
    const seated = online && net.me?.seat;
    const wantRide = seated ? 'passenger' : prof.riding;
    if (shownRide !== wantRide) { character.setRide(wantRide); shownRide = wantRide; updateRideButtons(); }
    if (seated) {
      // นั่งซ้อนท้าย: ตำแหน่งตามคนขับที่เซิร์ฟเวอร์ส่งมา
      const me = net.me, k = 1 - Math.exp(-dt * 12);
      player.pos.x += (me.x / 10 - player.pos.x) * k; player.pos.y += (me.y / 10 - player.pos.y) * k; player.pos.z += (me.z / 10 - player.pos.z) * k;
      player.facing = ((me.ry || 0) / 255) * Math.PI * 2;
      character.root.position.copy(player.pos);
      character.root.rotation.y = player.facing;
      character.animate(dt, (me.spd || 0) / 10, false, t);
    } else {
      player.update(dt, controls, t);
      if (online) net.sendMove(player, performance.now());
      if (prof.riding && isIndoors()) { setRiding(0); toast('ลงจากพาหนะก่อนเข้าอาคารนะ 🚶'); }
    }
    if (controls.interactQueued) { controls.interactQueued = false; tryInteract(); }

    // ภารกิจที่อยู่ใกล้
    const nn = quests.nearest(player.pos);
    state.near = nn && nn.dist < NEAR_DIST ? nn.quest : null;
    state.nearShop = player.pos.y < 0.5 && SHOP_SPOTS.some((s) => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 3.4);
    const prompt = $('prompt');
    if (state.near && !state.modalOpen) {
      const left = quests.cooldownLeft(state.near);
      prompt.classList.remove('hidden');
      prompt.classList.toggle('cooling', left > 0);
      prompt.textContent = left ? `⏳ รออีก ${left} วินาที` : `❓ ตอบภารกิจ${isTouch ? '' : ' (E)'}`;
    } else if (state.nearShop && !state.modalOpen) {
      prompt.classList.remove('hidden', 'cooling');
      prompt.textContent = `🛍️ เปิดร้านค้า${isTouch ? '' : ' (E)'}`;
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
    // ป้ายบอกที่อยู่: ไม่แสดงตอนเปิดหน้าต่างใด ๆ อยู่ (บนจอเตี้ยจะลอยทับคำถาม)
    if (key && !document.querySelector('.overlay:not(.hidden)')) toast(`${where.b.name} · ชั้น ${where.level + 1}`);
    setOutdoors(!key);
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
  // ในห้องกล้องอยู่ใกล้ ป้ายชื่อตัวเองจะบังวิว จึงซ่อนไว้
  if (character.root.userData.label) character.root.userData.label.visible = roomK < 0.5;
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
window.__vs = { fx, quality, net, quests, get player() { return player; }, controls, state, renderer };
