import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat, box, cyl, makeLabel, rand, pick } from './util.js';

// พาเลตพาสเทล
const C = {
  grass: '#a3d977', road: '#8e8aa0', line: '#ffffff', paving: '#f1e7d6',
  wall: '#fff6e6', accent1: '#f6a6b2', accent2: '#9fd3e6', accent3: '#c7b6f0', accent4: '#ffd59a',
  roof: '#ee8f6e', roof2: '#7cc6b6', window: '#8ec9ea', door: '#7a6a90', trunk: '#a8775a',
  leaf: ['#7cc96b', '#6dbb63', '#93d67a', '#5fae5e'], pink: '#f7a8c8', yellow: '#ffd66b',
  track: '#e2735e', field: '#86cf6a', water: '#6ccbe8', stone: '#d9d2c5', wood: '#c99a6b',
};

export const WORLD_HALF = 117;  // ขอบเขตเดินได้
const WALL = 120;                // แนวรั้ว

// ── ผังโรงเรียน (หน่วยเมตร +z คือทิศใต้ ประตูอยู่ทิศใต้) ──
const L = {
  plaza: { x: 0, z: 58, r: 12 },
  b1: { x: 0, z: 20 }, b2: { x: -62, z: 2 }, b3: { x: 62, z: 2 },
  library: { x: 0, z: -10 }, canteen: { x: -22, z: -58 }, hall: { x: 26, z: -60 },
  track: { x: -66, z: 82 }, pond: { x: 66, z: 84, r: 14 }, sala: { x: 43, z: 84 },
  shop: { x: 22, z: 60 }, court: { x: -84, z: -52 }, garden: { x: 84, z: -56 }, bikes: { x: 24, z: 106 },
  stage: { x: -19, z: 58 }, carpark: { x: -24, z: 106 }, playground: { x: -33, z: 56 }, tower: { x: -24, z: -96 },
};

const ROADS = [
  { x1: 0, z1: 41, x2: 0, z2: WALL, w: 7 },     // ถนนทางเข้า
  { x1: -98, z1: 38, x2: 98, z2: 38, w: 6 },    // ถนนหน้าอาคาร
  { x1: -45, z1: 35, x2: -45, z2: -80, w: 6 },  // ถนนฝั่งตะวันตก
  { x1: 45, z1: 35, x2: 45, z2: -80, w: 6 },    // ถนนฝั่งตะวันออก
  { x1: -42, z1: -32, x2: 42, z2: -32, w: 6 },  // ถนนหลังอาคาร
];
const PATHS = [
  { x1: 3.5, z1: 84, x2: 39, z2: 84, w: 3 },    // ทางเดินไปศาลา
  { x1: -3.5, z1: 84, x2: -36, z2: 84, w: 3 },  // ทางเดินไปสนาม
  { x1: -27, z1: 27, x2: 27, z2: 27, w: 6 },    // ลานหน้าอาคาร 1
  { x1: -52, z1: -16, x2: -52, z2: 20, w: 5 },  // ทางเดินหน้าอาคาร 2
  { x1: 52, z1: -16, x2: 52, z2: 20, w: 5 },    // ทางเดินหน้าอาคาร 3
  { x1: 0, z1: -3, x2: 0, z2: 13, w: 3.5 },     // ทางเดินห้องสมุด
  { x1: -54, z1: 16, x2: -25.2, z2: 16, w: 3.6 }, // ทางเดินมีหลังคา ฝั่งตะวันตก
  { x1: 25.2, z1: 16, x2: 54, z2: 16, w: 3.6 },   // ทางเดินมีหลังคา ฝั่งตะวันออก
];

export const QUEST_SPOTS = [
  { name: 'ลานเสาธง', x: 10, z: 64 },
  { name: 'หน้าอาคาร 1 (ฝั่งซ้าย)', x: -16, z: 30 },
  { name: 'หน้าอาคาร 1 (ฝั่งขวา)', x: 16, z: 30 },
  { name: 'หน้าอาคาร 2', x: -51, z: 8 },
  { name: 'หน้าอาคาร 3', x: 51, z: -4 },
  { name: 'ห้องสมุด', x: 4, z: -1 },
  { name: 'โรงอาหาร', x: -22, z: -58 },
  { name: 'หน้าหอประชุม', x: 26, z: -46 },
  { name: 'ศาลาริมน้ำ', x: 43, z: 84 },
  { name: 'ริมบ่อน้ำ', x: 66, z: 104 },
  { name: 'ลู่วิ่งโค้งตะวันตก', x: -95, z: 82 },
  { name: 'กลางสนามฟุตบอล', x: -66, z: 82 },
  { name: 'สนามบาสเกตบอล', x: -84, z: -52 },
  { name: 'สวนวิทยาศาสตร์', x: 84, z: -50 },
  { name: 'ประตูโรงเรียน', x: 9, z: 112 },
];
export const SPAWN = { x: 0, z: 104 };

export function buildWorld(scene) {
  const colliders = [];
  const updaters = [];
  const windTime = { value: 0 };
  updaters.push((t) => { windTime.value = t; });
  const root = new THREE.Group();
  scene.add(root);

  // โซน: สร้างของในพิกัดท้องถิ่น แล้วเลื่อนทั้งกลุ่มไปวางในผัง
  let O = { x: 0, z: 0 };
  const zone = (p) => { const g = new THREE.Group(); g.position.set(p.x, 0, p.z); root.add(g); O = p; return g; };
  const addBox = (minX, maxX, minZ, maxZ) => colliders.push({ t: 'b', minX: minX + O.x, maxX: maxX + O.x, minZ: minZ + O.z, maxZ: maxZ + O.z });
  const addCircle = (x, z, r) => colliders.push({ t: 'c', x: x + O.x, z: z + O.z, r });
  const absolute = () => { O = { x: 0, z: 0 }; };

  const flat = (parent, w, d, color, x, z, y = 0.02) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const strip = (s, color, y, dashed) => {
    const horiz = s.z1 === s.z2;
    const len = horiz ? Math.abs(s.x2 - s.x1) : Math.abs(s.z2 - s.z1);
    const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
    flat(root, horiz ? len : s.w, horiz ? s.w : len, color, cx, cz, y);
    if (!dashed) return;
    const n = Math.floor(len / 4.5);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      flat(root, horiz ? 1.8 : 0.2, horiz ? 0.2 : 1.8, C.line, s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t, y + 0.01);
    }
  };

  // ── ท้องฟ้า ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#7cc8f5') }, bottom: { value: new THREE.Color('#fff1df') } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.45, h)), 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat));

  // ── พื้นหญ้า ถนน ทางเดิน ──
  flat(root, 1400, 1400, C.grass, 0, 0, 0);
  ROADS.forEach((r) => strip(r, C.road, 0.02, true));
  PATHS.forEach((p) => strip(p, C.paving, 0.025, false));

  // ── ลานเสาธง ──
  {
    const g = zone(L.plaza);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(L.plaza.r, 12), mat(C.paving));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadow = true; g.add(plaza);
    const ring = new THREE.Mesh(new THREE.RingGeometry(L.plaza.r - 0.6, L.plaza.r, 12), mat('#e4d6c1'));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.045; g.add(ring);
    box(g, 3.6, 0.35, 3.6, '#ffffff');
    box(g, 2.6, 0.35, 2.6, '#f3ede4', 0, 0.35);
    box(g, 1.6, 0.35, 1.6, '#ffffff', 0, 0.7);
    addCircle(0, 0, 2.0);
    cyl(g, 0.08, 0.12, 13, '#f4f4f4', 0, 1.05, 0, 8);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#f2c94c', { metalness: 0.4, roughness: 0.4 }));
    ball.position.set(0, 14.15, 0); g.add(ball);
    // ธงไตรรงค์ สัดส่วน 1:1:2:1:1
    const fc = document.createElement('canvas');
    fc.width = 180; fc.height = 120;
    const fg = fc.getContext('2d');
    [['#A51931', 0, 20], ['#F4F5F8', 20, 20], ['#2D2A4A', 40, 40], ['#F4F5F8', 80, 20], ['#A51931', 100, 20]].forEach(([c, y, h]) => { fg.fillStyle = c; fg.fillRect(0, y, 180, h); });
    const ftex = new THREE.CanvasTexture(fc);
    ftex.colorSpace = THREE.SRGBColorSpace;
    const flagGeo = new THREE.PlaneGeometry(3, 2, 14, 6);
    flagGeo.translate(1.5, 0, 0);
    const flagBase = flagGeo.attributes.position.array.slice();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: ftex, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(0.1, 12.6, 0);
    flag.castShadow = true;
    flag.userData.dynamic = true;
    g.add(flag);
    updaters.push((t) => {
      const p = flagGeo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const x = flagBase[i];
        p[i + 2] = Math.sin(x * 2.2 - t * 5) * 0.12 * x + Math.sin(x * 4 - t * 7) * 0.03 * x;
      }
      flagGeo.attributes.position.needsUpdate = true;
      flagGeo.computeVertexNormals();
    });
    // ม้านั่งรอบลาน
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const bx = Math.cos(a) * (L.plaza.r + 2), bz = Math.sin(a) * (L.plaza.r + 2);
      const b = box(g, 2.4, 0.45, 0.7, C.wood, bx, 0, bz);
      b.rotation.y = -a + Math.PI / 2;
      addCircle(bx, bz, 1.0);
    }
  }

  // ── อาคารเรียน: เดินได้ทุกชั้น มีบันไดหักกลับที่ปลายระเบียง ──
  // แต่ละชั้นแยกเป็นกลุ่ม (โครง + ของในห้อง) เพื่อซ่อนชั้นที่สูงกว่าตอนผู้เล่นอยู่ข้างใน
  const buildings = [];
  const FH = 3.2; // ความสูงต่อชั้น
  const ROOM_FLOORS = ['#fbe3e8', '#e3f0fb', '#e8f5de', '#fdf3da', '#efe8fb'];
  function roomSign(parent, text, px, pz, y, color) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 96;
    const g2 = c.getContext('2d');
    g2.fillStyle = color; g2.beginPath(); g2.roundRect(0, 0, 320, 96, 20); g2.fill();
    g2.fillStyle = '#ffffff'; g2.font = '600 44px Mitr, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText(text, 160, 52, 300);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(px, y, pz);
    parent.add(m);
  }
  // ลูกศรบนพื้นบอกทางขึ้น/ลงบันได
  const arrowTex = {};
  function floorArrow(parent, text, color, px, y, pz) {
    if (!arrowTex[text]) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 96;
      const g2 = c.getContext('2d');
      g2.fillStyle = color; g2.beginPath(); g2.roundRect(0, 0, 256, 96, 18); g2.fill();
      g2.fillStyle = '#ffffff'; g2.font = '700 52px Mitr, sans-serif'; g2.textBaseline = 'middle';
      g2.fillText(text, 22, 52);
      g2.beginPath(); g2.moveTo(170, 18); g2.lineTo(236, 48); g2.lineTo(170, 78); g2.closePath(); g2.fill();
      arrowTex[text] = new THREE.CanvasTexture(c);
      arrowTex[text].colorSpace = THREE.SRGBColorSpace;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: arrowTex[text], transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(px, y + 0.14, pz);
    parent.add(m);
  }
  // เนื้อหาบนกระดาน (วาดครั้งเดียวต่อแบบ ใช้ซ้ำทุกห้อง)
  const BOARDS = {
    algo: { bg: '#ffffff', ink: '#2f3a6b', title: 'วิทยาการคำนวณ: อัลกอริทึม', lines: ['1. ทำความเข้าใจปัญหา', '2. วางแผนแก้ปัญหา', '3. ลงมือทำ', '4. ตรวจสอบผล'] },
    loop: { bg: '#ffffff', ink: '#2f3a6b', title: 'การทำซ้ำ (Loop)', lines: ['ทำซ้ำ 4 ครั้ง', '    เดิน 10 ก้าว', '    หมุนขวา 90 องศา', '= ได้รูปสี่เหลี่ยม!'] },
    safe: { bg: '#ffffff', ink: '#2f3a6b', title: 'ใช้อินเทอร์เน็ตอย่างปลอดภัย', lines: ['• ไม่บอกรหัสผ่านใคร', '• ไม่ให้ข้อมูลส่วนตัว', '• ตรวจสอบข่าวก่อนแชร์', '• ใช้คำสุภาพเสมอ'] },
    comp: { bg: '#2f2a45', ink: '#ffffff', title: 'Scratch: เมื่อคลิกธงเขียว', lines: ['ทำซ้ำตลอดไป', '   ถ้า แตะขอบ แล้ว', '       หันกลับ', '   เคลื่อนที่ 10 ก้าว'] },
    sci: { bg: '#ffffff', ink: '#2f5a3a', title: 'การทดลอง: พืชกับแสง', lines: ['สมมติฐาน: พืชต้องใช้แสง', 'ตัวแปรต้น: ปริมาณแสง', 'ตัวแปรตาม: ความสูงของพืช', 'ผลการทดลอง: ...'] },
  };
  const boardTex = {};
  function boardFace(parent, kind, bw, bh, px, py, pz) {
    if (!boardTex[kind]) {
      const b = BOARDS[kind];
      const c = document.createElement('canvas'); c.width = 768; c.height = 384;
      const g2 = c.getContext('2d');
      g2.fillStyle = b.bg; g2.fillRect(0, 0, 768, 384);
      g2.fillStyle = b.ink; g2.font = '600 44px Mitr, sans-serif'; g2.fillText(b.title, 30, 62);
      g2.fillStyle = kind === 'comp' ? '#ffd66b' : '#e2735e'; g2.fillRect(30, 80, 708, 4);
      g2.fillStyle = b.ink; g2.font = '400 36px Mitr, sans-serif';
      b.lines.forEach((l, i) => g2.fillText(l, 40, 140 + i * 58));
      boardTex[kind] = new THREE.CanvasTexture(c);
      boardTex[kind].colorSpace = THREE.SRGBColorSpace;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: boardTex[kind] }));
    m.position.set(px, py, pz);
    parent.add(m);
  }
  const signColor = (label) => (label.includes('คอม') ? '#4fc3e8' : label.includes('วิทย') ? '#a6c75a' : label.includes('สมุด') ? '#b49ae0' : '#ff8fab');

  function building({ x, z, w, d, floors, rotY = 0, wall = C.wall, accent = C.accent1, roof = C.roof, name, rooms = [], open = false, clock = false }) {
    const g = new THREE.Group();
    const fh = FH, H = floors * fh, cd = 2.4, front = d / 2, t = 0.25;
    const SX = w / 2, RUN = 3.2, LAND = 1.3, TW = SX + RUN + LAND; // หอบันไดอยู่ช่วง x = SX..TW
    const LANE = cd / 2, ZA0 = front + LANE, ZA1 = front + cd, ZB0 = front, ZB1 = front + LANE;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const toWorld = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    const toLocal = (wx, wz) => { const dx = wx - x, dz = wz - z; return [dx * cos - dz * sin, dx * sin + dz * cos]; };
    const solid = (lx1, lx2, lz1, lz2, y0 = -99, y1 = 2.7) => {
      const [ax, az] = toWorld(lx1, lz1), [bx, bz] = toWorld(lx2, lz2);
      colliders.push({ t: 'b', minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), y0, y1 });
    };
    const solidC = (lx, lz, r, y0 = -99, y1 = 2.7) => { const [wx, wz] = toWorld(lx, lz); colliders.push({ t: 'c', x: wx, z: wz, r, y0, y1 }); };
    const surfaces = [];
    const surf = (x0, x1, z0, z1, h) => surfaces.push({ x0, x1, z0, z1, h: typeof h === 'number' ? () => h : h });
    const mk = () => { const gr = new THREE.Group(); gr.userData.dynamic = true; g.add(gr); return gr; };
    const roofG = mk();
    const shells = [], furns = [];

    // แบ่งห้อง: ห้องโถงกลาง + ห้องสองข้าง
    const spans = [];
    if (open) spans.push({ a: -w / 2, b: w / 2, door: 3, main: true });
    else {
      const half = w / 2 - 3, n = Math.max(1, Math.round(half / 10)), rw = half / n;
      for (let i = 0; i < n; i++) spans.push({ a: -w / 2 + i * rw, b: -w / 2 + (i + 1) * rw });
      spans.push({ a: -3, b: 3, lobby: true, door: 3 });
      for (let i = 0; i < n; i++) spans.push({ a: 3 + i * rw, b: 3 + (i + 1) * rw });
    }
    for (const sp of spans) { sp.door ??= 1.8; sp.c = (sp.a + sp.b) / 2; }

    const posters = ['#ff8fab', '#4fc3e8', '#ffd66b', '#a6e07a', '#c7a6ff'];
    const nWin = Math.floor(w / 3.4);

    for (let L = 0; L < floors; L++) {
      const sh = mk(), fu = mk();
      shells.push(sh); furns.push(fu);
      const Y = L * fh, y0 = L === 0 ? -99 : Y - 0.5, y1 = Y + fh - 0.5;
      const S = (a1, a2, b1, b2) => solid(a1, a2, b1, b2, y0, y1);
      const SC = (px, pz, r) => solidC(px, pz, r, y0, y1);
      const B = (parent, bw, bh, bd, col, px, py, pz, opts) => box(parent, bw, bh, bd, col, px, Y + py, pz, opts);
      const wallSeg = (lx1, lx2, lz1, lz2) => {
        if (lx2 - lx1 < 0.05) return;
        B(sh, lx2 - lx1, fh, lz2 - lz1, wall, (lx1 + lx2) / 2, 0, (lz1 + lz2) / 2);
        S(lx1, lx2, lz1, lz2);
      };
      const labels = Array.isArray(rooms[L]) ? rooms[L] : [];
      let k = 0;
      for (const sp of spans) sp.label = sp.lobby ? 'ห้องโถง' : sp.main ? (L === 0 ? name : `${name} ชั้น ${L + 1}`) : labels[k++] || `ห้อง ${L + 1}0${k}`;

      // ── พื้น ──
      if (L === 0) B(sh, w + 0.3, 0.1, d + cd + 0.3, '#e6d7c3', 0, 0, cd / 2);
      else {
        B(sh, w, 0.3, d, '#e9e1d4', 0, -0.3, 0);
        B(sh, w, 0.3, cd, '#f3ece2', 0, -0.3, front + cd / 2);
        B(sh, w + 0.25, 0.28, d + 0.25, accent, 0, -0.16, 0);
        surf(-SX, SX, -front, front + cd, Y);
        // ราวกันตกหน้าระเบียง + ปลายระเบียงฝั่งไม่มีบันได
        B(sh, w, 0.9, 0.14, accent, 0, 0, front + cd - 0.07);
        B(sh, w + 0.05, 0.1, 0.26, '#ffffff', 0, 0.9, front + cd - 0.07);
        S(-SX, SX, front + cd - 0.2, front + cd + 0.1);
        B(sh, 0.14, 0.9, cd, accent, -SX + 0.07, 0, front + cd / 2);
        S(-SX - 0.1, -SX + 0.2, front, front + cd);
        for (let i = 0; i < Math.floor(w / 6); i++) {
          const px = -w / 2 + 3 + i * 6;
          B(sh, 0.5, 0.35, 0.35, '#d98c6b', px, 1.0, front + cd - 0.07);
          const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(pick(C.leaf), { name: 'leaf' }));
          pl.position.set(px, Y + 1.55, front + cd - 0.07);
          sh.add(pl);
        }
      }

      // ── ผนัง (บาง มีช่องประตูเข้าห้องจากระเบียง) ──
      wallSeg(-w / 2, w / 2, -front, -front + t);
      wallSeg(-w / 2, -w / 2 + t, -front + t, front);
      wallSeg(w / 2 - t, w / 2, -front + t, front);
      spans.slice(0, -1).forEach((sp) => wallSeg(sp.b - t / 2, sp.b + t / 2, -front + t, front - t));
      let cursor = -w / 2 + t;
      for (const sp of spans) { wallSeg(cursor, sp.c - sp.door / 2, front - t, front); cursor = sp.c + sp.door / 2; }
      wallSeg(cursor, w / 2 - t, front - t, front);
      for (const sp of spans) {
        B(sh, sp.door + 0.3, 0.25, t + 0.1, accent, sp.c, 2.45, front - t / 2);
        if (!sp.lobby) roomSign(sh, sp.label, sp.c, front + 0.03, Y + 2.95, signColor(sp.label));
      }
      // หน้าต่าง
      for (let i = 0; i < nWin; i++) {
        const wx = -w / 2 + (i + 0.5) * (w / nWin);
        for (const side of [1, -1]) {
          if (side === 1 && spans.some((sp) => Math.abs(wx - sp.c) < sp.door / 2 + 1.1)) continue;
          B(sh, 1.7, 1.4, 0.12, C.window, wx, 1.1, side * (front + 0.02), { emissive: '#2a5a78', emissiveIntensity: 0.15 });
          B(sh, 1.9, 0.12, 0.25, '#ffffff', wx, 1.0, side * (front + 0.06));
          B(sh, 1.6, 1.3, 0.04, '#d6f1ff', wx, 1.15, side * (front - t - 0.02), { emissive: '#c4ecff', emissiveIntensity: 0.6 });
          B(sh, 1.75, 0.08, 0.16, '#ffffff', wx, 1.05, side * (front - t - 0.06));
        }
      }
      // เสาระเบียงช่วงชั้นนี้
      const nCol = Math.max(2, Math.round(w / 4.5));
      for (let i = 0; i < nCol; i++) B(sh, 0.42, fh, 0.42, '#ffffff', -w / 2 + 0.25 + (i * (w - 0.5)) / nCol, 0, front + cd - 0.21);

      // ── บันไดหักกลับ จากชั้นนี้ขึ้นชั้นถัดไป ──
      const tw = (TW - SX);
      B(sh, tw + 0.25, fh, 0.25, wall, SX + tw / 2, 0, front - 0.12);                 // ผนังด้านใน
      B(sh, 0.25, fh, cd + 0.5, wall, TW + 0.12, 0, front + cd / 2);                   // ผนังปลาย
      B(sh, tw + 0.25, 1.1, 0.25, wall, SX + tw / 2, 0, front + cd + 0.12);            // ผนังเตี้ยด้านนอก
      B(sh, tw + 0.25, 0.25, 0.3, accent, SX + tw / 2, 1.1, front + cd + 0.12);
      for (const px of [SX + 0.6, TW - 0.4]) B(sh, 0.25, fh - 1.1, 0.25, '#ffffff', px, 1.1, front + cd + 0.12);
      if (L < floors - 1) {
        const steps = 10, rise = fh / 2 / steps, dep = RUN / steps, slope = Math.atan2(fh / 2, RUN);
        for (let i = 0; i < steps; i++) {
          B(sh, dep + 0.02, 0.16, LANE - 0.12, '#f7f1e8', SX + (i + 0.5) * dep, (i + 1) * rise - 0.16, (ZA0 + ZA1) / 2);
          B(sh, dep + 0.02, 0.16, LANE - 0.12, '#f7f1e8', SX + RUN - (i + 0.5) * dep, fh / 2 + (i + 1) * rise - 0.16, (ZB0 + ZB1) / 2);
        }
        for (const [zc, dir, base] of [[(ZA0 + ZA1) / 2, 1, 0], [(ZB0 + ZB1) / 2, -1, fh / 2]]) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(RUN, fh / 2), 0.14, LANE - 0.12), mat('#d9d0c2'));
          st.position.set(SX + RUN / 2, Y + base + fh / 4 - 0.2, zc);
          st.rotation.z = dir * slope;
          st.castShadow = true;
          sh.add(st);
        }
        B(sh, LAND, 0.2, cd, '#f7f1e8', SX + RUN + LAND / 2, fh / 2 - 0.2, front + cd / 2);
        B(sh, RUN, 1.0, 0.1, '#ffffff', SX + RUN / 2, fh / 2 - 0.2, front + LANE);    // ราวกั้นกลาง
        surf(SX, SX + RUN, ZA0, ZA1, (lx) => Y + ((lx - SX) / RUN) * (fh / 2));
        surf(SX + RUN, TW, ZB0, ZA1, Y + fh / 2);
        surf(SX, SX + RUN, ZB0, ZB1, (lx) => Y + fh - ((lx - SX) / RUN) * (fh / 2));
        // ห้ามมุดใต้บันไดขาลงจากชั้นนี้ (กันเฉพาะคนที่ยืนระดับพื้นชั้นนี้ คนที่กำลังเดินลงจากชั้นบนผ่านได้)
        solid(SX + 1.6, SX + RUN, ZB0, ZB1, Y - 0.3, Y + 0.8);
        floorArrow(sh, 'ขึ้น', '#7c6cf0', SX - 1.3, Y, (ZA0 + ZA1) / 2);
      } else {
        solid(SX, SX + 0.3, ZA0, ZA1, Y - 0.5, 99);      // ชั้นบนสุด: ไม่มีบันไดขึ้นต่อ
      }
      if (L > 0) floorArrow(sh, 'ลง', '#ff8fab', SX - 1.3, Y, (ZB0 + ZB1) / 2);

      // ── ของในห้อง ──
      const chairDesk = (px, pz, col) => {
        B(fu, 0.9, 0.06, 0.55, '#f6e3c6', px, 0.68, pz);
        B(fu, 0.8, 0.6, 0.42, col, px, 0.08, pz);
        B(fu, 0.45, 0.06, 0.42, col, px, 0.42, pz + 0.6);
        B(fu, 0.45, 0.45, 0.06, col, px, 0.48, pz + 0.82);
        SC(px, pz + 0.2, 0.5);
      };
      const ceil = L < floors - 1 ? fh - 0.3 : fh; // ความสูงเพดานของชั้นนี้
      const fan = (px, pz) => {
        cyl(fu, 0.03, 0.03, 0.35, '#dddddd', px, Y + ceil - 0.35, pz, 5);
        cyl(fu, 0.12, 0.12, 0.12, '#ffffff', px, Y + ceil - 0.45, pz, 8);
        for (let q = 0; q < 3; q++) {
          const bl = B(fu, 1.1, 0.03, 0.18, '#ffffff', px, ceil - 0.4, pz);
          bl.rotation.y = (q * Math.PI * 2) / 3;
          bl.position.x += Math.cos(-q * 2.094) * 0.55; bl.position.z += Math.sin(-q * 2.094) * 0.55;
        }
      };
      for (const sp of spans) {
        // ไฟเพดาน
        for (const lx of [sp.c - (sp.b - sp.a) / 4, sp.c + (sp.b - sp.a) / 4]) for (const lz of [-front / 2.5, front / 2.5]) B(fu, 1.2, 0.05, 0.28, '#ffffff', lx, ceil - 0.05, lz, { emissive: '#fff6dd', emissiveIntensity: 0.9 });
        const inA = sp.a + t, inB = sp.b - t, back = -front + t, fr = front - t, cx = sp.c, rw = inB - inA;
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(rw, fr - back), mat(sp.lobby ? '#efe6d8' : pick(ROOM_FLOORS)));
        fl.rotation.x = -Math.PI / 2; fl.position.set(cx, Y + 0.12, (back + fr) / 2); fl.receiveShadow = true; fu.add(fl);
        if (sp.lobby) {
          B(fu, 3.2, 1.6, 0.08, '#c99a6b', cx, 0.9, back + 0.05);
          for (let q = 0; q < 5; q++) B(fu, 0.5, 0.6, 0.02, posters[q], cx - 1.2 + q * 0.6, 1.4 - (q % 2) * 0.5, back + 0.1);
          for (const sx of [inA + 0.5, inB - 0.5]) {
            B(fu, 0.5, 0.45, 0.5, '#d98c6b', sx, 0, back + 0.5);
            const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat('#6dbb63', { name: 'leaf' }));
            pl.position.set(sx, Y + 0.85, back + 0.5); fu.add(pl);
            SC(sx, back + 0.5, 0.4);
          }
          continue;
        }
        B(fu, 0.05, 0.7, 0.9, pick(posters), inA + 0.03, 1.5, back + 2);
        B(fu, 0.05, 0.7, 0.9, pick(posters), inB - 0.03, 1.5, back + 3.2);
        if (sp.label.includes('สมุด')) {
          const shelf = (px, pz, rot) => {
            const sg = new THREE.Group(); sg.position.set(px, Y, pz); sg.rotation.y = rot; fu.add(sg);
            box(sg, 1.8, 2.1, 0.45, C.wood);
            for (let r = 0; r < 3; r++) for (let q = 0; q < 7; q++) box(sg, 0.2, 0.42, 0.32, pick(posters), -0.72 + q * 0.24, 0.25 + r * 0.65, 0.08);
            SC(px, pz, 0.95);
          };
          for (let sx = inA + 1.2; sx < inB - 1; sx += 2.1) shelf(sx, back + 0.3, 0);
          for (const sx of [cx - 3, cx + 3]) { shelf(sx, back + 2.6, 0); shelf(sx, back + 3.1, Math.PI); }
          for (const tx of [cx - 3.5, cx, cx + 3.5]) {
            B(fu, 2.2, 0.08, 1.1, '#f6e3c6', tx, 0.72, fr - 1.8);
            B(fu, 2.0, 0.64, 0.9, C.accent3, tx, 0.08, fr - 1.8);
            S(tx - 1.1, tx + 1.1, fr - 2.35, fr - 1.25);
          }
          fan(cx - 3, 0); fan(cx + 3, 0);
          continue;
        }
        if (sp.label.includes('วิทย')) {
          for (const bz of [back + 2.2, back + 4.4]) {
            B(fu, rw - 3, 0.88, 1.1, '#ffffff', cx, 0, bz);
            B(fu, rw - 2.9, 0.06, 1.2, '#3b3355', cx, 0.88, bz);
            for (let q = 0; q < Math.floor(rw - 4); q++) cyl(fu, 0.08, 0.12, 0.28, pick(['#7fe0c4', '#ffb3d1', '#ffe07a', '#9fd3e6']), cx - (rw - 4) / 2 + q + 0.5, Y + 0.94, bz, 6);
            S(cx - (rw - 3) / 2, cx + (rw - 3) / 2, bz - 0.55, bz + 0.55);
          }
          B(fu, 1.4, 0.9, 0.7, '#cfd8e6', inB - 1, 0, back + 0.4);
          B(fu, 2.8, 1.2, 0.06, '#ffffff', cx, 1.0, back + 0.04);
          boardFace(fu, 'sci', 2.7, 1.1, cx, Y + 1.6, back + 0.08);
          fan(cx, fr - 1.5);
          continue;
        }
        const comp = sp.label.includes('คอม');
        const bw = Math.min(rw * 0.6, 5);
        B(fu, bw + 0.2, 1.5, 0.05, '#c7b6f0', cx, 0.9, back + 0.03);
        B(fu, bw, 1.3, 0.06, comp ? '#2f2a45' : '#ffffff', cx, 1.0, back + 0.06, comp ? { emissive: '#1e3a5a', emissiveIntensity: 0.6 } : undefined);
        boardFace(fu, comp ? 'comp' : pick(['algo', 'loop', 'safe']), bw - 0.1, 1.2, cx, Y + 1.65, back + 0.1);
        B(fu, 1.5, 0.78, 0.7, C.wood, cx + bw / 2 - 0.6, 0, back + 1.3);
        S(cx + bw / 2 - 1.35, cx + bw / 2 + 0.15, back + 0.95, back + 1.65);
        const col = pick(['#9fd3e6', '#f6a6b2', '#a6e07a', '#ffd59a']);
        const z0 = back + 2.6, z1 = fr - 1.8, x0 = inA + 1.0, x1 = inB - 1.0;
        const nc = Math.max(1, Math.floor((x1 - x0) / 1.45) + 1), nr = Math.max(1, Math.floor((z1 - z0) / 1.75) + 1);
        for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
          const px = nc === 1 ? cx : x0 + (c * (x1 - x0)) / (nc - 1), pz = z0 + r * 1.75;
          if (Math.abs(px - cx) < 0.6 && nc > 2) continue;
          chairDesk(px, pz, col);
          if (comp) {
            B(fu, 0.56, 0.38, 0.05, '#2f2a45', px, 0.82, pz - 0.15);
            B(fu, 0.5, 0.31, 0.02, '#7fd3f7', px, 0.855, pz - 0.12, { emissive: '#4fa9d6', emissiveIntensity: 0.7 });
            B(fu, 0.46, 0.03, 0.16, '#e9e4f2', px, 0.72, pz + 0.12);
          }
        }
        fan(cx, (z0 + z1) / 2);
      }
    }

    // ── ผนังหอบันได เสาระเบียง (ชนได้ทุกความสูง) ──
    solid(SX, TW, front - 0.25, front, -99, 99);
    solid(TW, TW + 0.25, front, front + cd, -99, 99);
    solid(SX, TW + 0.25, front + cd, front + cd + 0.25, -99, 99);
    solid(SX, SX + RUN, front + LANE - 0.06, front + LANE + 0.06, -99, 99);
    const nCol = Math.max(2, Math.round(w / 4.5));
    for (let i = 0; i < nCol; i++) solidC(-w / 2 + 0.25 + (i * (w - 0.5)) / nCol, front + cd - 0.21, 0.35, -99, 99);

    // ── หลังคา ──
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 10), mat('#ffd66b'));
    badge.rotation.x = Math.PI / 2; badge.position.set(0, H - 1.0, front + 0.1); roofG.add(badge);
    const rg = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    rg.rotateY(Math.PI / 4);
    const r = new THREE.Mesh(rg, mat(roof));
    r.scale.set(w + 1.8, 3.4, d + cd + 1.8);
    r.position.set(0, H + 1.7, cd / 2);
    r.castShadow = true;
    roofG.add(r);
    box(roofG, w + 1.9, 0.25, d + cd + 1.9, '#ffffff', 0, H, cd / 2);
    box(roofG, TW - SX + 0.6, 0.3, cd + 0.8, roof, SX + (TW - SX) / 2, H, front + cd / 2); // หลังคาหอบันได
    let labelY = H + 1.0;
    if (clock) {
      const gz = front + cd + 0.75;
      box(roofG, 7, 3.3, 0.4, wall, 0, H, gz);
      box(roofG, 7.4, 0.3, 0.6, accent, 0, H + 3.3, gz);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 24), mat('#ffffff'));
      face.rotation.x = Math.PI / 2; face.position.set(0, H + 1.65, gz + 0.25); roofG.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 24), mat(accent));
      rim.position.set(0, H + 1.65, gz + 0.3); roofG.add(rim);
      for (let q = 0; q < 12; q++) {
        const a = (q / 12) * Math.PI * 2;
        box(roofG, 0.08, 0.2, 0.04, '#3b3355', Math.sin(a) * 0.95, H + 1.55 + Math.cos(a) * 0.95, gz + 0.32);
      }
      const hand = (len, wd) => {
        const hg = new THREE.Group(); hg.userData.dynamic = true; hg.position.set(0, H + 1.65, gz + 0.36);
        const hm = new THREE.Mesh(new THREE.BoxGeometry(wd, len, 0.04), mat('#3b3355'));
        hm.position.y = len / 2 - 0.08; hg.add(hm); roofG.add(hg); return hg;
      };
      const hh = hand(0.62, 0.12), mh = hand(0.95, 0.07);
      updaters.push(() => {
        const now = new Date();
        const m = now.getMinutes() + now.getSeconds() / 60;
        mh.rotation.z = -(m / 60) * Math.PI * 2;
        hh.rotation.z = -(((now.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
      });
      labelY = H + 4.3;
    }
    if (name) {
      const lab = makeLabel(name, { size: 2.6, bg: 'rgba(255,255,255,0.96)' });
      lab.position.set(0, labelY, front + cd + 1.2);
      roofG.add(lab);
    }

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
    g.updateMatrixWorld(true);
    [roofG, ...shells, ...furns].forEach(bakeStatic);
    const [cx, cz] = toWorld((TW - SX) / 2, cd / 2);
    buildings.push({
      name, floors, roof: roofG, shells, furns, cx, cz, radius: Math.hypot(w / 2 + 6, d / 2 + 4),
      /** สถานะผู้เล่นในอาคาร: อยู่ชั้นไหน ต้องตัดชั้นบนออกไหม */
      probe(wx, wz, wy) {
        const [lx, lz] = toLocal(wx, wz);
        if (lx < -SX - 0.3 || lx > TW + 0.3 || lz < -front - 0.3 || lz > front + cd + 0.3) return null;
        const level = Math.max(0, Math.min(floors - 1, Math.floor((wy + 0.8) / fh)));
        const inBody = lx > -SX && lx < SX && lz > -front && lz < front;
        const inTower = lx > SX && lx < TW && lz > front && lz < front + cd;
        let room = null;
        if (inBody) {
          const sp = spans.find((q) => lx >= q.a && lx <= q.b);
          if (sp) {
            const [ax, az] = toWorld(sp.a + t, -front + t), [bx, bz] = toWorld(sp.b - t, front - t);
            const RY = level * fh;
            room = { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), floor: RY, ceil: RY + (level < floors - 1 ? fh - 0.3 : fh) };
          }
        }
        return { level, cut: inBody || inTower || wy > 1.0, room };
      },
      heightAt(wx, wz, wy) {
        const [lx, lz] = toLocal(wx, wz);
        let best = -Infinity;
        for (const s of surfaces) {
          if (lx < s.x0 || lx > s.x1 || lz < s.z0 || lz > s.z1) continue;
          const h = s.h(lx, lz);
          if (h <= wy + 0.55 && h > best) best = h;
        }
        return best;
      },
    });
  }
  building({ ...L.b1, w: 50, d: 11, floors: 3, name: 'อาคาร 1', clock: true, rooms: [
    ['ป.1/1', 'ป.2/1', 'ห้องคอมพิวเตอร์ 1', 'ป.3/1'],
    ['ป.4/1', 'ป.4/2', 'ห้องวิทยาศาสตร์ 1', 'ป.5/1'],
    ['ป.5/2', 'ป.6/1', 'ห้องคอมพิวเตอร์ 3', 'ป.6/2'],
  ] });
  building({ ...L.b2, w: 40, d: 11, floors: 3, rotY: Math.PI / 2, accent: C.accent2, roof: C.roof2, name: 'อาคาร 2', rooms: [
    ['ม.1/1', 'ม.1/2', 'ห้องวิทยาศาสตร์ 2', 'ม.2/1'],
    ['ม.2/2', 'ม.3/1', 'ห้องคอมพิวเตอร์ 4', 'ม.3/2'],
    ['ห้องสมุดภาษา', 'ม.1/3', 'ม.2/3', 'ม.3/3'],
  ] });
  building({ ...L.b3, w: 40, d: 11, floors: 3, rotY: -Math.PI / 2, accent: C.accent4, roof: '#e7a35d', name: 'อาคาร 3', rooms: [
    ['ม.4/1', 'ห้องคอมพิวเตอร์ 2', 'ม.4/2', 'ม.5/1'],
    ['ม.5/2', 'ม.6/1', 'ห้องวิทยาศาสตร์ 3', 'ม.6/2'],
    ['ม.4/3', 'ม.5/3', 'ห้องคอมพิวเตอร์ 5', 'ม.6/3'],
  ] });
  building({ ...L.library, w: 18, d: 10, floors: 2, accent: C.accent3, roof: '#b49ae0', name: 'ห้องสมุด', open: true });

  // ── หอประชุม ──
  {
    const g = zone(L.hall);
    const w = 32, d = 20, H = 7.5;
    box(g, w, H, d, '#fdf0f3');
    box(g, w + 0.4, 0.6, d + 0.4, '#e6d7c3');
    box(g, w + 0.3, 0.4, d + 0.3, C.accent1, 0, H - 0.4, 0);
    for (let i = 0; i < 7; i++) for (const side of [1, -1]) {
      const wx = -w / 2 + (i + 0.5) * (w / 7);
      if (side === 1 && Math.abs(wx) < 4) continue;
      box(g, 2.2, 3.6, 0.12, C.window, wx, 2.2, side * (d / 2 + 0.02), { emissive: '#2a5a78', emissiveIntensity: 0.15 });
    }
    box(g, 5, 4, 0.2, C.door, 0, 0, d / 2 + 0.02);
    box(g, 8, 0.35, 3, C.accent1, 0, 4.4, d / 2 + 1.5);
    for (const sx of [-3.6, 3.6]) { cyl(g, 0.22, 0.22, 4.4, '#ffffff', sx, 0, d / 2 + 2.7, 8); addCircle(sx, d / 2 + 2.7, 0.35); }
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2 - 1.2, 0); tri.lineTo(d / 2 + 1.2, 0); tri.lineTo(0, 5); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: w + 1.6, bevelEnabled: false });
    rg.translate(0, 0, -(w + 1.6) / 2);
    rg.rotateY(Math.PI / 2);
    const rm = new THREE.Mesh(rg, mat('#d97a8a'));
    rm.position.y = H; rm.castShadow = true; g.add(rm);
    const lab = makeLabel('หอประชุม', { size: 2.4 });
    lab.position.set(0, 5.6, d / 2 + 3.2);
    g.add(lab);
    addBox(-w / 2 - 0.2, w / 2 + 0.2, -d / 2 - 0.2, d / 2 + 0.2);
  }

  // ── โรงอาหาร (เปิดโล่ง) ──
  {
    const g = zone(L.canteen);
    const w = 22, d = 14;
    box(g, w, 0.15, d, '#e9dccb');
    for (const px of [-w / 2 + 0.5, 0, w / 2 - 0.5]) for (const pz of [-d / 2 + 0.5, d / 2 - 0.5]) {
      cyl(g, 0.3, 0.3, 4.6, '#ffffff', px, 0, pz, 8);
      addCircle(px, pz, 0.45);
    }
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2 - 1.2, 0); tri.lineTo(d / 2 + 1.2, 0); tri.lineTo(0, 3); tri.closePath();
    const rg = new THREE.ExtrudeGeometry(tri, { depth: w + 1.6, bevelEnabled: false });
    rg.translate(0, 0, -(w + 1.6) / 2);
    rg.rotateY(Math.PI / 2);
    const roofM = new THREE.Mesh(rg, mat('#f5b971'));
    roofM.position.y = 4.6; roofM.castShadow = true; g.add(roofM);
    for (let i = 0; i < 3; i++) for (const tz of [-3.5, 3.5]) {
      const tx = -6.5 + i * 6.5;
      box(g, 4, 0.12, 1.4, '#ffffff', tx, 0.85, tz);
      cyl(g, 0.08, 0.08, 0.85, '#bbb', tx - 1.6, 0, tz, 5);
      cyl(g, 0.08, 0.08, 0.85, '#bbb', tx + 1.6, 0, tz, 5);
      box(g, 4, 0.1, 0.4, C.accent2, tx, 0.45, tz - 1.0);
      box(g, 4, 0.1, 0.4, C.accent2, tx, 0.45, tz + 1.0);
      addBox(tx - 2, tx + 2, tz - 1.2, tz + 1.2);
    }
    // ร้านอาหาร 3 ร้านด้านหลัง
    [['ข้าวมันไก่', '#ff8fab'], ['ก๋วยเตี๋ยว', '#4fc3e8'], ['น้ำปั่น', '#a6c75a']].forEach(([food, color], i) => {
      const sx = -7 + i * 7;
      box(g, 4.5, 1.0, 1.2, '#ffffff', sx, 0, -9.5);
      box(g, 4.6, 0.08, 1.3, color, sx, 1.0, -9.5);
      box(g, 4.5, 2.4, 0.3, '#fdf3e7', sx, 0, -11.4);
      for (let k = 0; k < 6; k++) box(g, 0.75, 0.1, 1.4, k % 2 ? '#ffffff' : color, sx - 1.9 + k * 0.76, 2.55, -10.3);
      for (let k = 0; k < 3; k++) cyl(g, 0.25, 0.22, 0.3, pick(['#c0c0c8', '#ffd66b', '#ff9e7a']), sx - 1.2 + k * 1.2, 1.08, -9.6, 8);
      const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 90;
      const cg = c2.getContext('2d'); cg.fillStyle = color; cg.fillRect(0, 0, 320, 90);
      cg.fillStyle = '#fff'; cg.font = '600 46px Mitr, sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(food, 160, 48);
      const tx = new THREE.CanvasTexture(c2); tx.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.73), new THREE.MeshBasicMaterial({ map: tx }));
      sign.position.set(sx, 3.1, -9.6); g.add(sign);
      addBox(sx - 2.25, sx + 2.25, -11.6, -8.9);
    });
    // โต๊ะร่มด้านข้าง
    for (const [ux, uz] of [[-15, -3], [-15, 3.5], [15, -3], [15, 3.5]]) {
      cyl(g, 0.9, 0.9, 0.08, '#ffffff', ux, 0.72, uz, 10);
      cyl(g, 0.05, 0.05, 2.4, '#9a94b0', ux, 0, uz, 5);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8), mat(pick(['#ff8fab', '#ffd66b', '#9fd3e6'])));
      um.position.set(ux, 2.6, uz); um.castShadow = true; g.add(um);
      for (let k = 0; k < 4; k++) cyl(g, 0.2, 0.2, 0.45, '#c7b6f0', ux + Math.cos(k * 1.57) * 1.25, 0, uz + Math.sin(k * 1.57) * 1.25, 8);
      addCircle(ux, uz, 1.0);
    }
    const lab = makeLabel('โรงอาหาร', { size: 2.2 });
    lab.position.set(0, 5.4, d / 2 + 1.5);
    g.add(lab);
  }

  // ── ลู่วิ่งและสนามฟุตบอล ──
  {
    const g = zone(L.track);
    const HL = 15, RO = 16, RI = 12;
    const stadium = (hl, r) => {
      const s = new THREE.Shape();
      s.moveTo(-hl, -r); s.lineTo(hl, -r);
      s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(-hl, r);
      s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
      return s;
    };
    const outer = stadium(HL, RO);
    outer.holes.push(stadium(HL, RI));
    const tg = new THREE.ShapeGeometry(outer, 24);
    tg.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(tg, mat(C.track));
    track.position.y = 0.03; track.receiveShadow = true; g.add(track);
    for (const lr of [13, 14, 15]) {
      const pts = stadium(HL, lr).getPoints(40);
      const lg = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, -p.y)));
      const line = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: '#fff3ee' }));
      line.position.y = 0.05;
      g.add(line);
    }
    const fg2 = new THREE.ShapeGeometry(stadium(HL, RI), 24);
    fg2.rotateX(-Math.PI / 2);
    const field = new THREE.Mesh(fg2, mat(C.field));
    field.position.y = 0.025; field.receiveShadow = true; g.add(field);
    flat(g, 0.2, 2 * RI, '#ffffff', 0, 0, 0.04);
    const cc = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.0, 24), mat('#ffffff'));
    cc.rotation.x = -Math.PI / 2; cc.position.y = 0.045; g.add(cc);
    for (const side of [-1, 1]) {
      const gx = side * (HL + RI - 4);
      const gg = new THREE.Group();
      cyl(gg, 0.08, 0.08, 2.2, '#ffffff', 0, 0, -2.5, 6);
      cyl(gg, 0.08, 0.08, 2.2, '#ffffff', 0, 0, 2.5, 6);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), mat('#ffffff'));
      bar.rotation.x = Math.PI / 2; bar.position.y = 2.2; gg.add(bar);
      gg.position.set(gx, 0, 0);
      g.add(gg);
      addCircle(gx, -2.5, 0.3); addCircle(gx, 2.5, 0.3);
    }
    for (let i = 0; i < 3; i++) box(g, 30, 0.5, 1.2, ['#c7b6f0', '#9fd3e6', '#f6a6b2'][i], 0, i * 0.5, RO + 3 + i * 1.2);
    addBox(-15, 15, RO + 2.4, RO + 6.6);
  }

  // ── บ่อน้ำ ──
  {
    const g = zone(L.pond);
    const R = L.pond.r;
    const waterMat = new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.12, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.9 });
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += (sin(position.x * 0.9 + uTime * 1.8) + cos(position.y * 0.7 + uTime * 1.3)) * 0.07;`);
    };
    const water = new THREE.Mesh(new THREE.RingGeometry(0.01, R, 40, 10), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.y = 0.06; water.receiveShadow = true; g.add(water);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.6, 1.0), 0), mat(pick([C.stone, '#cfc6b6', '#e4ddd0'])));
      s.position.set(Math.cos(a) * (R + 0.3), 0.15, Math.sin(a) * (R + 0.3));
      s.scale.y = 0.55; s.rotation.y = rand(0, 3); s.castShadow = true;
      g.add(s);
    }
    addCircle(0, 0, R + 0.6);
    const pads = [];
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), r = rand(2, R - 2.5);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 0.9), 7), mat('#5fb06a'));
      pad.rotation.x = -Math.PI / 2;
      pad.userData.dynamic = true;
      pad.position.set(Math.cos(a) * r, 0.09, Math.sin(a) * r);
      g.add(pad);
      if (i % 2 === 0) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.35, 6), mat('#ffb3d1'));
        fl.position.set(pad.position.x, 0.25, pad.position.z);
        g.add(fl);
      }
      pads.push({ m: pad, p: rand(0, 6) });
    }
    updaters.push((t) => pads.forEach(({ m, p }) => { m.position.y = 0.09 + Math.sin(t * 1.3 + p) * 0.02; }));
  }

  // ── ศาลาไทย ──
  {
    const g = zone(L.sala);
    box(g, 6.4, 0.15, 6.4, C.wood);
    for (const px of [-2.8, 2.8]) for (const pz of [-2.8, 2.8]) {
      cyl(g, 0.18, 0.18, 3.2, '#a5463e', px, 0, pz, 8);
      addCircle(px, pz, 0.3);
    }
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.6, 4), mat('#c4524a'));
    roof1.rotation.y = Math.PI / 4; roof1.position.y = 4.0; roof1.castShadow = true; g.add(roof1);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 4), mat('#3f8f6e'));
    roof2.rotation.y = Math.PI / 4; roof2.position.y = 5.3; roof2.castShadow = true; g.add(roof2);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 6), mat('#f2c94c', { metalness: 0.5, roughness: 0.4 }));
    spire.position.y = 7.0; g.add(spire);
    box(g, 6.0, 0.08, 0.4, '#e8c07a', 0, 3.2, 3.0);
    box(g, 6.0, 0.08, 0.4, '#e8c07a', 0, 3.2, -3.0);
    box(g, 3, 0.4, 0.8, C.wood, 0, 0.15, -2.2);
    addBox(-1.7, 1.7, -2.6, -1.8);
  }

  // ── ร้านค้า ──
  {
    const g = zone(L.shop);
    box(g, 5, 2.8, 3.6, '#fff1f4');
    box(g, 5.2, 0.25, 3.8, '#ffffff', 0, 2.8, 0);
    for (let i = 0; i < 6; i++) box(g, 0.86, 0.12, 1.6, i % 2 ? '#ffffff' : '#f58fa5', -2.15 + i * 0.86, 2.55, 2.4);
    box(g, 4.2, 0.9, 0.6, '#f7c6d1', 0, 0, 2.0);
    const lab = makeLabel('ร้านค้า', { size: 1.8, bg: '#ff8fab', fg: '#ffffff' });
    lab.position.set(0, 3.6, 1.0);
    g.add(lab);
    addBox(-2.7, 2.7, -2, 2.4);
  }

  // ── สนามบาสเกตบอล ──
  {
    const g = zone(L.court);
    flat(g, 15, 26, '#f3a96a', 0, 0, 0.03);
    flat(g, 14, 25, '#e7924f', 0, 0, 0.035);
    flat(g, 14, 0.15, '#ffffff', 0, 0, 0.04);
    const cc = new THREE.Mesh(new THREE.RingGeometry(1.8, 1.95, 20), mat('#ffffff'));
    cc.rotation.x = -Math.PI / 2; cc.position.y = 0.045; g.add(cc);
    for (const side of [-1, 1]) {
      const z = side * 12.5;
      cyl(g, 0.12, 0.12, 3.4, '#6c6a80', 0, 0, z + side * 0.6, 6);
      box(g, 1.8, 1.1, 0.1, '#ffffff', 0, 3.0, z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 12), mat('#ff6b3d'));
      rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, z - side * 0.35); g.add(rim);
      addCircle(0, z + side * 0.6, 0.3);
    }
  }

  // ── สวนวิทยาศาสตร์ ──
  {
    const g = zone(L.garden);
    for (let i = 0; i < 4; i++) {
      const px = -9 + i * 6;
      box(g, 4, 0.6, 2, C.wood, px, 0, -6);
      for (let k = 0; k < 4; k++) {
        const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(pick(['#7cc96b', '#ffd66b', '#f7a8c8', '#c7b6f0'])));
        pl.position.set(px - 1.4 + k * 0.95, 0.85, -6);
        pl.castShadow = true;
        g.add(pl);
      }
      addBox(px - 2, px + 2, -7, -5);
    }
    // เรือนเพาะชำ
    box(g, 6, 2.6, 4, '#dff3ea', 0, 0, -12, { transparent: false });
    const gr = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), mat('#bfe6d4'));
    gr.geometry.rotateY(Math.PI / 4); gr.scale.set(6.6, 1.6, 4.6); gr.position.set(0, 3.4, -12); gr.castShadow = true; g.add(gr);
    addBox(-3.2, 3.2, -14.2, -9.8);
    cyl(g, 0.08, 0.08, 4, '#ffffff', -12, 0, 2, 6);
    const vane = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), mat('#9fd3e6'));
      cup.position.set(Math.cos(i * 2.094) * 0.5, 0, Math.sin(i * 2.094) * 0.5);
      vane.add(cup);
    }
    vane.userData.dynamic = true;
    vane.position.set(-12, 4, 2);
    g.add(vane);
    updaters.push((t) => { vane.rotation.y = t * 3; });
    addCircle(-12, 2, 0.3);
    const lab = makeLabel('สวนวิทยาศาสตร์', { size: 1.6 });
    lab.position.set(0, 2.6, -3.5);
    g.add(lab);
  }

  // ── ลานจอดจักรยาน (เตรียมไว้สำหรับพาหนะในช่วงที่ 4) ──
  {
    const g = zone(L.bikes);
    box(g, 16, 0.1, 7, '#e8e2f0');
    for (const px of [-7.5, 0, 7.5]) for (const pz of [-3, 3]) { cyl(g, 0.12, 0.12, 2.8, '#9a94b0', px, 0, pz, 6); addCircle(px, pz, 0.25); }
    box(g, 16.8, 0.2, 7.6, '#9fd3e6', 0, 2.8, 0);
    const bikeCols = ['#ff8fab', '#4fc3e8', '#ffd66b', '#a6e07a', '#c7a6ff', '#ffb38a'];
    for (let i = 0; i < 6; i++) {
      const bx = -6 + i * 2.4;
      for (const wz of [-0.55, 0.55]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 14), mat('#3b3355'));
        wheel.rotation.y = Math.PI / 2; wheel.position.set(bx, 0.38, wz); g.add(wheel);
      }
      const frame = box(g, 0.08, 0.08, 1.1, bikeCols[i], bx, 0.6, 0);
      frame.rotation.x = 0.1;
      box(g, 0.25, 0.06, 0.35, '#3b3355', bx, 0.85, 0.35);
      box(g, 0.5, 0.05, 0.05, '#3b3355', bx, 0.95, -0.5);
    }
    addBox(-7.2, 7.2, -1, 1);
    const lab = makeLabel('ลานจอดจักรยาน', { size: 1.6 });
    lab.position.set(0, 3.6, 3.9);
    g.add(lab);
  }

  // ── ลานจอดรถครู ──
  {
    const g = zone(L.carpark);
    flat(g, 19, 11, '#8e8aa0', 0, 0, 0.03);
    for (let i = 0; i <= 5; i++) flat(g, 0.15, 5, '#ffffff', -8.75 + i * 3.5, -2.5, 0.04);
    const cars = ['#ff8fab', '#9fd3e6', '#ffd66b', '#ffffff', '#c7a6ff'];
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue; // ช่องว่าง
      const cx = -7 + i * 3.5, cz = -2.6;
      box(g, 1.75, 0.7, 3.8, cars[i], cx, 0.25, cz);
      box(g, 1.55, 0.6, 2.0, cars[i], cx, 0.95, cz + 0.2);
      box(g, 1.6, 0.45, 1.9, '#8ec9ea', cx, 1.02, cz + 0.2, { emissive: '#2a5a78', emissiveIntensity: 0.15 });
      for (const [wx, wz] of [[-0.85, -1.2], [0.85, -1.2], [-0.85, 1.2], [0.85, 1.2]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10), mat('#3b3355'));
        wh.rotation.z = Math.PI / 2; wh.position.set(cx + wx, 0.32, cz + wz); wh.castShadow = true; g.add(wh);
      }
      box(g, 0.4, 0.15, 0.05, '#fff6c8', cx - 0.55, 0.6, cz - 1.92);
      box(g, 0.4, 0.15, 0.05, '#fff6c8', cx + 0.55, 0.6, cz - 1.92);
      addBox(cx - 0.95, cx + 0.95, cz - 2, cz + 2);
    }
    const lab = makeLabel('ที่จอดรถครู', { size: 1.5 });
    lab.position.set(0, 2.8, 2.5);
    g.add(lab);
  }

  // ── รั้วและประตูโรงเรียน ──
  {
    absolute();
    const H = 1.4;
    // รั้วแบบฐานปูน + เสา + ซี่เหล็ก
    const wall = (x, z, w, d) => {
      box(root, w, 0.7, d, '#f3e8f7', x, 0, z);
      box(root, w + 0.15, 0.12, d + 0.15, '#c7b6f0', x, 0.7, z);
      box(root, w, 0.08, d * 0.4, '#8f88a8', x, 1.25, z);
      box(root, w, 0.08, d * 0.4, '#8f88a8', x, 1.8, z);
      const len = Math.max(w, d), along = w > d;
      for (let i = 0; i <= len / 3; i++) {
        const o = -len / 2 + i * 3;
        box(root, 0.35, 2.0, 0.35, '#ffffff', along ? x + o : x, 0, along ? z : z + o);
        if (i < len / 3 - 1) for (let k = 1; k < 6; k++) {
          const bo = o + k * 0.5;
          box(root, 0.05, 1.3, 0.05, '#8f88a8', along ? x + bo : x, 0.7, along ? z : z + bo);
        }
      }
    };
    wall(0, -WALL, 2 * WALL, 0.5);
    wall(-WALL, 0, 0.5, 2 * WALL);
    wall(WALL, 0, 0.5, 2 * WALL);
    wall(-(WALL + 6) / 2, WALL, WALL - 6, 0.5);
    wall((WALL + 6) / 2, WALL, WALL - 6, 0.5);
    for (const side of [-1, 1]) {
      box(root, 1.2, 4.5, 1.2, '#ffffff', side * 4.6, 0, WALL);
      box(root, 1.4, 0.3, 1.4, '#c7b6f0', side * 4.6, 4.5, WALL);
      addCircle(side * 4.6, WALL, 0.9);
    }
    box(root, 10.4, 0.9, 0.6, '#c7b6f0', 0, 4.4, WALL);
    const lab = makeLabel('โรงเรียนเสมือน 3D', { size: 2.2, bg: '#ffffff' });
    lab.position.set(0, 6.0, WALL + 0.4);
    root.add(lab);
  }

  // ── ทางเดินมีหลังคาเชื่อมอาคาร ──
  {
    absolute();
    const covered = (x1, x2, z) => {
      const len = x2 - x1, cx = (x1 + x2) / 2;
      box(root, len, 0.22, 4, '#9fd3e6', cx, 2.9, z);
      box(root, len, 0.12, 4.2, '#ffffff', cx, 2.8, z);
      for (let x = x1 + 1; x <= x2 - 1; x += 4) {
        if (Math.abs(Math.abs(x) - 45) < 4) continue; // ไม่ปักเสากลางถนน
        for (const dz of [-1.75, 1.75]) { cyl(root, 0.12, 0.12, 2.9, '#ffffff', x, 0, z + dz, 6); addCircle(x, z + dz, 0.2); }
      }
    };
    covered(-54, -25.2, 16);
    covered(25.2, 54, 16);
  }

  // ── เวทีกิจกรรมข้างลานเสาธง ──
  {
    const g = zone(L.stage);
    box(g, 6, 1, 11, C.wood);
    box(g, 6.1, 0.12, 11.1, '#e8c07a', 0, 1, 0);
    box(g, 1.4, 0.5, 3, '#d9b48a', 3.7, 0, 0);
    box(g, 0.4, 4, 11, C.accent3, -2.8, 1, 0);
    for (const pz of [-5.3, 5.3]) cyl(g, 0.14, 0.14, 4.2, '#ffffff', 2.7, 1, pz, 6);
    box(g, 6.8, 0.3, 11.8, '#c4524a', -0.1, 5.1, 0);
    for (let i = 0; i < 9; i++) box(g, 0.2, 0.6, 1.1, i % 2 ? '#ffd66b' : '#f6a6b2', 3.2, 4.5, -4.8 + i * 1.2); // ธงราว
    const lab = makeLabel('เวทีกิจกรรม', { size: 1.6 });
    lab.position.set(1, 6, 0);
    g.add(lab);
    addBox(-3.1, 4.5, -5.6, 5.6);
  }

  // ── สนามเด็กเล่น ──
  {
    const g = zone(L.playground);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(7.5, 14), mat('#f4dfb0'));
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.03; sand.receiveShadow = true; g.add(sand);
    // ชิงช้า
    for (const sx of [-3.2, 0.2]) cyl(g, 0.1, 0.1, 3, '#ff8fab', sx, 0, -3.5, 6);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 6), mat('#ff8fab'));
    top.rotation.z = Math.PI / 2; top.position.set(-1.5, 3, -3.5); g.add(top);
    const seats = [];
    for (const sx of [-2.3, -0.7]) {
      const sw = new THREE.Group(); sw.position.set(sx, 3, -3.5); sw.userData.dynamic = true;
      for (const o of [-0.3, 0.3]) box(sw, 0.03, 2.3, 0.03, '#6c6a80', o, -2.3, 0);
      box(sw, 0.8, 0.08, 0.35, '#ffd66b', 0, -2.35, 0);
      g.add(sw); seats.push(sw);
    }
    updaters.push((t) => seats.forEach((s2, i) => { s2.rotation.x = Math.sin(t * 1.6 + i * 1.7) * 0.35; }));
    addCircle(-3.2, -3.5, 0.3); addCircle(0.2, -3.5, 0.3);
    // สไลเดอร์
    box(g, 1.6, 2, 1.6, '#4fc3e8', 3.5, 0, -1);
    box(g, 1.7, 0.1, 1.7, '#ffffff', 3.5, 2, -1);
    const slide = box(g, 0.9, 0.12, 3.6, '#ffd66b', 3.5, 0.95, 1.7);
    slide.rotation.x = 0.55;
    addBox(2.6, 4.4, -1.9, -0.1);
    // ไม้กระดก
    cyl(g, 0.2, 0.25, 0.5, '#c7a6ff', -2, 0, 3, 6);
    const see = new THREE.Group(); see.position.set(-2, 0.55, 3); see.userData.dynamic = true;
    box(see, 3.6, 0.12, 0.35, '#a6e07a', 0, 0, 0);
    g.add(see);
    updaters.push((t) => { see.rotation.z = Math.sin(t * 1.4) * 0.22; });
    addCircle(-2, 3, 0.4);
    const lab = makeLabel('สนามเด็กเล่น', { size: 1.5 });
    lab.position.set(0, 3.8, 5.5);
    g.add(lab);
  }

  // ── หอถังน้ำประจำโรงเรียน ──
  {
    const g = zone(L.tower);
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { box(g, 0.35, 11, 0.35, '#e9e4f2', lx, 0, lz); addCircle(lx, lz, 0.35); }
    for (let y = 2.5; y < 11; y += 3) { box(g, 3.6, 0.15, 0.15, '#cfc8e3', 0, y, -1.6); box(g, 3.6, 0.15, 0.15, '#cfc8e3', 0, y, 1.6); }
    cyl(g, 2.6, 2.4, 3.4, '#9fd3e6', 0, 11, 0, 12);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 12), mat('#7cc6b6'));
    cap.position.y = 15; cap.castShadow = true; g.add(cap);
    const lab = makeLabel('หอถังน้ำ', { size: 1.4 });
    lab.position.set(0, 3, 2.6);
    g.add(lab);
  }

  // ── ก๊อกน้ำดื่มและอ่างล้างมือ ──
  {
    absolute();
    const tap = (x, z) => {
      box(root, 4, 0.9, 0.9, '#e9e4f2', x, 0, z);
      box(root, 4, 0.15, 1.0, '#9fd3e6', x, 0.9, z);
      for (let i = 0; i < 4; i++) cyl(root, 0.05, 0.05, 0.35, '#b8b4c6', x - 1.5 + i, 1.0, z, 5);
      addBox(x - 2.1, x + 2.1, z - 0.55, z + 0.55);
    };
    tap(-36, -50);
    tap(-10, 3);
  }

  // ── บอร์ดประชาสัมพันธ์ ──
  {
    absolute();
    const board = (x, z, rotY, title, lines) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 320;
      const g2 = c.getContext('2d');
      g2.fillStyle = '#fffdf6'; g2.fillRect(0, 0, 512, 320);
      g2.fillStyle = '#7c6cf0'; g2.fillRect(0, 0, 512, 70);
      g2.fillStyle = '#ffffff'; g2.font = '600 40px Mitr, sans-serif'; g2.textAlign = 'center'; g2.fillText(title, 256, 50);
      g2.fillStyle = '#3b3355'; g2.font = '400 28px Mitr, sans-serif'; g2.textAlign = 'left';
      lines.forEach((l, i) => g2.fillText(l, 28, 118 + i * 48));
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group();
      box(grp, 3.4, 2.4, 0.15, '#c99a6b', 0, 0.9, 0);
      for (const sx of [-1.5, 1.5]) box(grp, 0.15, 0.9, 0.15, '#a8775a', sx, 0, 0);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.94), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      face.position.set(0, 2.1, 0.09); grp.add(face);
      grp.position.set(x, 0, z); grp.rotation.y = rotY; root.add(grp);
      addCircle(x, z, 1.4);
    };
    board(-8, 31.5, 0, 'ข่าวโรงเรียน', ['• ตามหาคริสตัลภารกิจให้ครบ', '• ตอบถูกรับเหรียญ', '• สัปดาห์หน้า: กีฬาสี!', '• อ่านหนังสือวันละ 15 นาที']);
    board(-22, -48.5, 0, 'เมนูวันนี้', ['• ข้าวมันไก่', '• ก๋วยเตี๋ยวต้มยำ', '• ข้าวผัดกะเพรา', '• ผลไม้ตามฤดูกาล']);
  }

  // ── ป้ายบอกทาง ──
  {
    absolute();
    const sign = (x, z, rotY, rows) => {
      const grp = new THREE.Group();
      cyl(grp, 0.1, 0.1, 3.4, '#ffffff', 0, 0, 0, 6);
      rows.forEach(([text, color], i) => {
        const c = document.createElement('canvas'); c.width = 512; c.height = 72;
        const g2 = c.getContext('2d');
        g2.fillStyle = color; g2.fillRect(0, 0, 512, 72);
        g2.fillStyle = '#ffffff'; g2.font = '600 34px Mitr, sans-serif'; g2.textBaseline = 'middle'; g2.fillText(text, 14, 38);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const b2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.45), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
        b2.position.set(0, 3.1 - i * 0.55, 0.12); grp.add(b2);
      });
      grp.position.set(x, 0, z); grp.rotation.y = rotY; root.add(grp);
      addCircle(x, z, 0.3);
    };
    sign(5, 44.5, 0, [['↑ อาคาร 1 · ห้องสมุด · หอประชุม', '#7c6cf0'], ['← อาคาร 2 · โรงอาหาร · สนามบาส', '#4fc3e8'], ['→ อาคาร 3 · สวนวิทยาศาสตร์', '#ff8fab']]);
    sign(-6, 90, 0, [['↑ ลานเสาธง · อาคารเรียน', '#7c6cf0'], ['← สนามฟุตบอล · ลู่วิ่ง', '#4fc3e8'], ['→ ศาลาริมน้ำ · บ่อน้ำ', '#ff8fab']]);
  }

  // ── พื้นที่ห้ามปลูกต้นไม้ ──
  const keepOut = [
    ...[...ROADS, ...PATHS].map((s) => [Math.min(s.x1, s.x2) - s.w / 2, Math.max(s.x1, s.x2) + s.w / 2, Math.min(s.z1, s.z2) - s.w / 2, Math.max(s.z1, s.z2) + s.w / 2]),
    [L.track.x - 32, L.track.x + 32, L.track.z - 17, L.track.z + 24],
    [L.court.x - 9, L.court.x + 9, L.court.z - 15, L.court.z + 15],
    [L.garden.x - 13, L.garden.x + 13, L.garden.z - 15, L.garden.z + 0],
    [L.bikes.x - 9, L.bikes.x + 9, L.bikes.z - 4.5, L.bikes.z + 6],
    [L.shop.x - 4, L.shop.x + 4, L.shop.z - 3, L.shop.z + 6],
    [L.hall.x - 6, L.hall.x + 6, L.hall.z + 10, L.hall.z + 17],
    [L.stage.x - 4, L.stage.x + 6, L.stage.z - 7, L.stage.z + 7],
    [L.carpark.x - 10, L.carpark.x + 10, L.carpark.z - 6, L.carpark.z + 6],
    [L.canteen.x - 18, L.canteen.x + 18, L.canteen.z - 13, L.canteen.z + 9],
    [L.playground.x - 8, L.playground.x + 8, L.playground.z - 8, L.playground.z + 8],
    [L.tower.x - 4, L.tower.x + 4, L.tower.z - 4, L.tower.z + 5],
  ];
  const blocked = (x, z, m) => {
    for (const c of colliders) {
      if (c.t === 'b' && x > c.minX - m && x < c.maxX + m && z > c.minZ - m && z < c.maxZ + m) return true;
      if (c.t === 'c' && Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
    }
    for (const [a, b, c2, d] of keepOut) if (x > a - m && x < b + m && z > c2 - m && z < d + m) return true;
    if (Math.hypot(x - L.plaza.x, z - L.plaza.z) < L.plaza.r + 4 + m) return true;
    for (const s of QUEST_SPOTS) if (Math.hypot(x - s.x, z - s.z) < 4) return true;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 5) return true;
    return false;
  };

  // ── เสาไฟริมถนน ──
  absolute();
  for (const r of ROADS) {
    const horiz = r.z1 === r.z2;
    const a = horiz ? Math.min(r.x1, r.x2) : Math.min(r.z1, r.z2), b = horiz ? Math.max(r.x1, r.x2) : Math.max(r.z1, r.z2);
    for (let v = a + 6; v < b - 4; v += 16) {
      const x = horiz ? v : r.x1 + r.w / 2 + 1.2, z = horiz ? r.z1 + r.w / 2 + 1.2 : v;
      if (blocked(x, z, 0.6)) continue;
      cyl(root, 0.1, 0.14, 4.6, '#6c6a80', x, 0, z, 6);
      box(root, horiz ? 0.1 : 0.9, 0.1, horiz ? 0.9 : 0.1, '#6c6a80', x - (horiz ? 0 : 0.4), 4.5, z - (horiz ? 0.4 : 0));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mat('#fff6c8', { emissive: '#ffe9a0', emissiveIntensity: 0.6 }));
      lamp.position.set(x - (horiz ? 0 : 0.8), 4.35, z - (horiz ? 0.8 : 0));
      root.add(lamp);
      addCircle(x, z, 0.25);
    }
  }

  // ── ถังขยะแยกประเภท 4 สี ──
  for (const [x, z] of [[14, 74], [-10, -48], [36, -46], [-4.5, 31.5], [52, 24], [-30, 70]]) {
    if (blocked(x, z, 0.2)) continue;
    ['#4f8fe8', '#5cc06a', '#ffd04f', '#f2727f'].forEach((c, i) => {
      cyl(root, 0.32, 0.28, 0.9, c, x - 1.05 + i * 0.7, 0, z, 8);
      cyl(root, 0.35, 0.35, 0.08, '#ffffff', x - 1.05 + i * 0.7, 0.9, z, 8);
    });
    addBox(x - 1.5, x + 1.5, z - 0.4, z + 0.4);
  }

  // ── แนวพุ่มไม้ ──
  const hedge = (x1, z1, x2, z2, gap) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 1.3);
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      if (gap && gap(x, z)) continue;
      if (QUEST_SPOTS.some((q) => Math.hypot(q.x - x, q.z - z) < 3.2)) continue;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.6, 0.8), 0), mat(pick(['#6dbb63', '#5fae5e', '#7cc96b']), { name: 'leaf' }));
      b.position.set(x, 0.45, z); b.scale.y = 0.8; b.rotation.y = rand(0, 3); b.castShadow = true;
      root.add(b);
      if (i % 4 === 2) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(pick(['#ff9ecb', '#ffe07a', '#ffffff'])));
        f.position.set(x + 0.2, 1.0, z + 0.2);
        root.add(f);
      }
    }
  };
  hedge(-27, 31, 27, 31, (x) => Math.abs(x) < 5 || Math.abs(x + 8) < 2.4);
  hedge(-49.3, -16, -49.3, 21, (x, z) => Math.abs(z - 2) < 4 || Math.abs(z - 16) < 3);
  hedge(49.3, -16, 49.3, 21, (x, z) => Math.abs(z - 2) < 4 || Math.abs(z - 16) < 3);
  hedge(-9, -16.5, 9, -16.5, (x) => Math.abs(x) < 2.5);

  // ── หย่อมหญ้าสีต่างกันเล็กน้อย ──
  for (let i = 0; i < 90; i++) {
    const x = rand(-WORLD_HALF, WORLD_HALF), z = rand(-WORLD_HALF, WORLD_HALF);
    if (blocked(x, z, 3)) continue;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(rand(3, 8), 7), mat(pick(['#98d36f', '#ade07f', '#93cc6a'])));
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = rand(0, 3); patch.position.set(x, 0.01, z);
    root.add(patch);
  }

  // ── ต้นไม้ ──
  absolute();
  function tree(x, z, kind) {
    const g = new THREE.Group();
    const s = rand(0.85, 1.35);
    cyl(g, 0.22, 0.32, 2.2, C.trunk, 0, 0, 0, 6);
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.4, 1.6, 7), mat(C.leaf[3], { name: 'leaf' }));
        c.position.y = 2.8 + i * 0.9; c.castShadow = true; g.add(c);
      }
    } else {
      const col = kind === 'pink' ? C.pink : kind === 'yellow' ? C.yellow : pick(C.leaf);
      for (const [bx, by, bz, br] of [[0, 1.2, 0, 1.5], [0.9, 0.8, 0.3, 1.0], [-0.8, 0.9, -0.4, 1.1], [0.1, 2.0, -0.2, 1.0]]) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 0), mat(col, { name: 'leaf' }));
        b.position.set(bx, by + 2.2, bz);
        b.rotation.set(rand(0, 3), rand(0, 3), 0);
        b.castShadow = true;
        g.add(b);
      }
    }
    g.scale.setScalar(s);
    g.position.set(x, 0, z);
    g.rotation.y = rand(0, Math.PI * 2);
    root.add(g);
    addCircle(x, z, 0.45 * s);
  }
  // แถวต้นไม้ริมถนนทางเข้าและถนนหน้าอาคาร
  for (let z = 72; z <= 114; z += 7) {
    if (!blocked(-7, z, 0.3)) tree(-7, z, 'pink');
    if (!blocked(7.5, z + 3.5, 0.3)) tree(7.5, z + 3.5, 'yellow');
  }
  for (let x = -92; x <= 92; x += 12) if (Math.abs(x) > 14) { if (!blocked(x, 43.5, 0.5)) tree(x, 43.5, 'green'); }
  let placed = 0, tries = 0;
  while (placed < 230 && tries < 9000) {
    tries++;
    const x = rand(-WORLD_HALF, WORLD_HALF), z = rand(-WORLD_HALF, WORLD_HALF);
    if (blocked(x, z, 2.4)) continue;
    const r = Math.random();
    tree(x, z, r < 0.15 ? 'pink' : r < 0.25 ? 'yellow' : r < 0.38 ? 'pine' : 'green');
    placed++;
  }

  // ── ดอกไม้เป็นหย่อม ──
  {
    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    const colors = ['#ff9ecb', '#ffe07a', '#ffffff', '#c7a6ff', '#ff8f8f'];
    const count = 1100;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), count);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0, guard = 0;
    while (n < count && guard < 30000) {
      guard++;
      const cx = rand(-WORLD_HALF, WORLD_HALF), cz = rand(-WORLD_HALF, WORLD_HALF);
      if (blocked(cx, cz, 1)) continue;
      const c = pick(colors);
      for (let k = 0; k < 8 && n < count; k++) {
        m4.makeTranslation(cx + rand(-1.2, 1.2), 0.18, cz + rand(-1.2, 1.2));
        im.setMatrixAt(n, m4);
        im.setColorAt(n, col.set(c));
        n++;
      }
    }
    im.count = n;
    root.add(im);
  }

  // ── เมฆ ──
  const clouds = new THREE.Group();
  scene.add(clouds);
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(2.5, 4.5), 0), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.25 }));
      b.position.set(k * 3.2 - 5, rand(-0.6, 0.8), rand(-1.5, 1.5));
      g.add(b);
    }
    g.position.set(rand(-260, 260), rand(40, 58), rand(-260, 260));
    clouds.add(g);
  }
  updaters.push((t, dt) => clouds.children.forEach((c) => { c.position.x += dt * 1.5; if (c.position.x > 280) c.position.x = -280; }));

  bakeStatic(root);

  // ใบไม้ไหวตามลม (คำนวณในการ์ดจอ ไม่กินแรงเครื่อง)
  root.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || m.name !== 'leaf' || m.userData.wind) return;
    m.userData.wind = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float wh = max(0.0, position.y - 1.6);
        float wp = position.x * 0.13 + position.z * 0.11;
        transformed.x += sin(uTime * 1.7 + wp) * wh * 0.04;
        transformed.z += cos(uTime * 1.3 + wp) * wh * 0.03;`);
    };
    m.customProgramCacheKey = () => 'wind';
  });

  // ── ผีเสื้อ ──
  {
    const wing = new THREE.PlaneGeometry(0.22, 0.16);
    wing.translate(0.11, 0, 0);
    const mats = ['#ff9ecb', '#ffe07a', '#c7a6ff', '#ffffff', '#9fd3e6'].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    const flies = [];
    for (let i = 0; i < 40; i++) {
      let hx = 0, hz = 0;
      for (let k = 0; k < 30; k++) { hx = rand(-100, 100); hz = rand(-100, 100); if (!blocked(hx, hz, 1)) break; }
      const g = new THREE.Group();
      const m = pick(mats);
      const l = new THREE.Mesh(wing, m), r = new THREE.Mesh(wing, m);
      r.scale.x = -1;
      g.add(l, r);
      scene.add(g);
      flies.push({ g, l, r, hx, hz, p: rand(0, 20), s: rand(0.4, 0.8) });
    }
    updaters.push((t) => {
      for (const f of flies) {
        const a = t * f.s + f.p;
        f.g.position.set(f.hx + Math.sin(a) * 3 + Math.sin(a * 2.3) * 1.2, 1.1 + Math.sin(a * 3.1) * 0.5, f.hz + Math.cos(a * 0.8) * 3);
        f.g.rotation.y = -a * 0.9;
        const flap = Math.sin(t * 18 + f.p) * 1.1;
        f.l.rotation.y = flap;
        f.r.rotation.y = -flap;
      }
    });
  }

  // ── ฝูงนกบินวนบนฟ้า ──
  {
    const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.25), new THREE.Vector3(1.1, 0, 0.1), new THREE.Vector3(0, 0, 0.3)]);
    wing.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: '#5b5470', side: THREE.DoubleSide });
    const flocks = [];
    for (let fi = 0; fi < 2; fi++) {
      const flock = new THREE.Group();
      const birds = [];
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Group();
        const l = new THREE.Mesh(wing, bm), r = new THREE.Mesh(wing, bm);
        r.scale.x = -1;
        b.add(l, r);
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        b.position.set(side * row * 2.2, 0, row * 2.4);
        flock.add(b);
        birds.push({ l, r, p: i * 0.7 });
      }
      scene.add(flock);
      flocks.push({ flock, birds, R: 90 + fi * 50, y: 30 + fi * 8, sp: 0.05 + fi * 0.02, off: fi * 3 });
    }
    updaters.push((t) => {
      for (const f of flocks) {
        const a = t * f.sp + f.off;
        f.flock.position.set(Math.cos(a) * f.R, f.y + Math.sin(t * 0.5 + f.off) * 2, Math.sin(a) * f.R);
        f.flock.rotation.y = -a;
        for (const b of f.birds) { const fl = Math.sin(t * 6 + b.p) * 0.6; b.l.rotation.z = fl; b.r.rotation.z = -fl; }
      }
    });
  }

  /** ดันวงกลมผู้เล่น (รัศมี r) ออกจากสิ่งกีดขวาง */
  function resolve(pos, r) {
    for (const c of colliders) {
      // ของทั่วไปชนเฉพาะระดับพื้นดิน ผนังในอาคารชนเฉพาะชั้นของตัวเอง
      if (pos.y < (c.y0 ?? -99) || pos.y >= (c.y1 ?? 2.6)) continue;
      if (c.t === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const dist = Math.hypot(dx, dz), min = c.r + r;
        if (dist < min && dist > 1e-5) { pos.x = c.x + (dx / dist) * min; pos.z = c.z + (dz / dist) * min; }
      } else {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const dist = Math.hypot(dx, dz);
        if (dist < r) {
          if (dist > 1e-5) { pos.x = cx + (dx / dist) * r; pos.z = cz + (dz / dist) * r; }
          else {
            const opts = [[c.minX - r - pos.x, 0], [c.maxX + r - pos.x, 0], [0, c.minZ - r - pos.z], [0, c.maxZ + r - pos.z]];
            opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            pos.x += opts[0][0]; pos.z += opts[0][1];
          }
        }
      }
    }
    pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, pos.x));
    pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF + 2, pos.z));
  }

  return {
    resolve,
    clouds,
    buildings,
    /** อาคารที่ผู้เล่นอยู่ + ชั้น */
    buildingAt(pos) {
      for (const b of buildings) { const p = b.probe(pos.x, pos.z, pos.y); if (p) return { b, ...p }; }
      return null;
    },
    /** ความสูงพื้นใต้เท้า (พื้นดิน = 0, พื้นชั้นบน, บันได) */
    heightAt(x, z, y) {
      let h = 0;
      for (const b of buildings) { const bh = b.heightAt(x, z, y); if (bh > h) h = bh; }
      return h;
    },
    update(t, dt) { for (const u of updaters) u(t, dt); },
  };
}

/**
 * รวมชิ้นส่วนที่อยู่นิ่งทั้งหมดเป็นก้อนเดียวต่อวัสดุ
 * ลดจำนวนครั้งที่การ์ดจอต้องวาดจากหลักพันเหลือหลักสิบ (สำคัญมากกับมือถือและการ์ดจอออนบอร์ด)
 */
function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.material.map || o.material.transparent) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const key = o.material.uuid + (o.castShadow ? '|s' : '|n');
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, geos: [] });
    groups.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const { material, cast, geos } of groups.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
  }
}

/** หน้าร้านค้า (เดินมาใกล้ ๆ แล้วเปิดร้านได้) */
export const SHOP_FRONT = { x: 22, z: 63.6 };
