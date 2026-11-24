import * as THREE from 'three';
import { createCharacter } from './player.js';
import { pick, rand } from './util.js';
import { mat } from './util.js';

// จุดทางเดินของ NPC (เดินตามถนนและทางเดิน ไม่ตัดผ่านอาคาร)
const N = {
  G: [0, 110], B: [0, 84], S: [0, 72], P1: [-7, 58], P2: [7, 58], N: [0, 44], X: [0, 38],
  XW: [-45, 38], XWW: [-80, 38], XE: [45, 38], XEE: [80, 38], F1: [-16, 31.5], F2: [16, 31.5],
  W1: [-45, 0], W2: [-45, -32], W3: [-45, -70], E1: [45, 0], E2: [45, -32], E3: [45, -70],
  M: [0, -32], L: [0, 0], CN: [-28, -45], H: [26, -42], PW: [-30, 84], PE: [30, 84], PG: [-33, 47],
};
const E = [
  ['G', 'B'], ['B', 'S'], ['B', 'PW'], ['B', 'PE'], ['S', 'P1'], ['S', 'P2'], ['P1', 'N'], ['P2', 'N'], ['N', 'X'],
  ['X', 'XW'], ['X', 'XE'], ['X', 'F1'], ['X', 'F2'], ['XW', 'XWW'], ['XE', 'XEE'], ['XW', 'PG'],
  ['XW', 'W1'], ['W1', 'W2'], ['W2', 'W3'], ['XE', 'E1'], ['E1', 'E2'], ['E2', 'E3'],
  ['W2', 'M'], ['M', 'E2'], ['W1', 'L'], ['L', 'E1'], ['W2', 'CN'], ['E2', 'H'],
];
const ADJ = {};
for (const [a, b] of E) { (ADJ[a] ??= []).push(b); (ADJ[b] ??= []).push(a); }

const SKINS = ['#f6d3b3', '#e9b98f', '#d9a074', '#f9dcc4'];
const HAIRS = ['#3b2a2a', '#2a2238', '#5a3a2a', '#1f1a24'];

function student() {
  const girl = Math.random() < 0.5;
  return createCharacter({ skin: pick(SKINS), hair: pick(HAIRS), bottom: girl ? '#2f3a6b' : pick(['#2f3a6b', '#5a4a3a']), skirt: girl, hairLong: girl && Math.random() < 0.7, lite: true });
}

/** สร้าง NPC ทั้งหมด: นักเรียน ครู ภารโรง แม่ค้า เด็กเตะบอล */
export function createNPCs(scene, world) {
  const actors = [];
  const add = (c) => { scene.add(c.root); return c; };

  // คนเดินตามเส้นทาง
  const walkers = [];
  const keys = Object.keys(N);
  const spawnWalker = (c, speed) => {
    const from = pick(keys);
    const w = { c: add(c), pos: new THREE.Vector3(N[from][0], 0, N[from][1]), prev: null, at: from, to: pick(ADJ[from]), wait: rand(0, 3), speed, facing: 0 };
    walkers.push(w);
  };
  for (let i = 0; i < 9; i++) spawnWalker(student(), rand(1.6, 2.4));
  const studentWalkers = walkers.slice();
  spawnWalker(createCharacter({ shirt: '#c7b6f0', bottom: '#4a4560', long: true, hair: '#2a2238', hairLong: true, skin: pick(SKINS), lite: true }), 1.3);
  spawnWalker(createCharacter({ shirt: '#9fd3e6', bottom: '#3b3355', long: true, hair: '#1f1a24', skin: pick(SKINS), lite: true }), 1.3);

  // ภารโรงกวาดลานเสาธง
  const janitor = add(createCharacter({ shirt: '#6c8ebf', bottom: '#3b3355', long: true, hair: '#5a5a5a', skin: '#d9a074', lite: true }));
  const broom = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), mat('#c99a6b'));
  stick.position.y = -0.5;
  const brush = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 6), mat('#e8c07a'));
  brush.position.y = -1.2;
  broom.add(stick, brush);
  broom.position.set(0, -0.3, 0.15);
  broom.rotation.x = 0.5;
  janitor.arms[1].add(broom);
  const jan = { pos: new THREE.Vector3(6, 0, 66), target: new THREE.Vector3(6, 0, 66), wait: 0, facing: 0 };

  // แม่ค้าโรงอาหาร
  const vendor = add(createCharacter({ shirt: '#ff9e7a', bottom: '#3b3355', long: true, hair: '#2a2238', hairLong: true, skin: '#e9b98f', lite: true }));
  vendor.root.position.set(-29, 0, -68.7);

  // เด็กเตะบอลในสนาม
  const kidA = add(student()), kidB = add(student());
  kidA.root.position.set(-72, 0, 76); kidB.root.position.set(-60, 0, 76);
  kidA.root.rotation.y = Math.PI / 2; kidB.root.rotation.y = -Math.PI / 2;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat('#ffffff'));
  ball.castShadow = true;
  scene.add(ball);
  const kick = { t: 0, dir: 1, dur: 1.4 };

  const tmp = new THREE.Vector3();
  function moveToward(pos, tx, tz, speed, dt) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return { arrived: true, vx: 0, vz: 0 };
    const s = Math.min(d, speed * dt);
    pos.x += (dx / d) * s; pos.z += (dz / d) * s;
    world.resolve(pos, 0.3);
    return { arrived: false, vx: dx / d, vz: dz / d };
  }
  const turn = (cur, want, dt) => cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 8);

  return {
    /** ซ่อน/แสดงนักเรียน NPC (ตอนออนไลน์มีเพื่อนจริงแทน) */
    setStudents(on) { for (const w of studentWalkers) { w.c.root.visible = on; w.hidden = !on; } },
    update(dt, t) {
      for (const w of walkers) {
        if (w.hidden) continue;
        let speed = 0;
        if (w.wait > 0) w.wait -= dt;
        else {
          const [tx, tz] = N[w.to];
          const r = moveToward(w.pos, tx, tz, w.speed, dt);
          if (r.arrived) {
            const options = ADJ[w.to].filter((k) => k !== w.at);
            w.at = w.to;
            w.to = pick(options.length ? options : ADJ[w.to]);
            if (Math.random() < 0.3) w.wait = rand(1, 4);
          } else {
            speed = w.speed;
            w.facing = turn(w.facing, Math.atan2(r.vx, r.vz), dt);
          }
        }
        w.c.root.position.copy(w.pos);
        w.c.root.rotation.y = w.facing;
        w.c.animate(dt, speed, false, t);
      }

      // ภารโรง: เดินช้า ๆ รอบลาน แล้วหยุดกวาด
      let js = 0;
      if (jan.wait > 0) jan.wait -= dt;
      else {
        const r = moveToward(jan.pos, jan.target.x, jan.target.z, 0.9, dt);
        if (r.arrived) {
          const a = rand(0, Math.PI * 2), rr = rand(5, 10);
          jan.target.set(Math.cos(a) * rr, 0, 58 + Math.sin(a) * rr);
          jan.wait = rand(2, 5);
        } else { js = 0.9; jan.facing = turn(jan.facing, Math.atan2(r.vx, r.vz), dt); }
      }
      janitor.root.position.copy(jan.pos);
      janitor.root.rotation.y = jan.facing;
      janitor.animate(dt, js, false, t);
      if (js === 0) janitor.arms[1].rotation.x = -0.4 + Math.sin(t * 4) * 0.35; // ท่ากวาด

      // แม่ค้า: ยืนขายของ โบกมือเป็นระยะ
      vendor.animate(dt, 0, false, t);
      if (Math.sin(t * 0.7) > 0.85) vendor.arms[1].rotation.x = -2.6 + Math.sin(t * 9) * 0.3;

      // เด็กเตะบอลส่งกัน
      kick.t += dt;
      if (kick.t > kick.dur + 0.4) { kick.t = 0; kick.dir *= -1; }
      const k = Math.min(1, kick.t / kick.dur);
      const ax = kidA.root.position.x + 0.7, bx = kidB.root.position.x - 0.7;
      const fx = kick.dir > 0 ? ax : bx, tx = kick.dir > 0 ? bx : ax;
      ball.position.set(fx + (tx - fx) * k, 0.22 + Math.sin(k * Math.PI) * 0.6, 76);
      ball.rotation.z -= dt * 8 * kick.dir;
      kidA.animate(dt, 0, false, t);
      kidB.animate(dt, 0, false, t);
      const kicker = kick.dir > 0 ? kidA : kidB;
      if (kick.t < 0.25) kicker.legs[1].rotation.x = -1.0;
      void tmp;
    },
  };
}
