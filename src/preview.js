// ภาพตัวอย่างชุด/ทรงผม/พาหนะ (เรนเดอร์จากโมเดลจริงในเกม) + หุ่นตัวอย่าง 3D หมุนดูได้
import * as THREE from 'three';
import { createCharacter } from './character.js';
import { createVehicle } from './vehicles.js';

function studio() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#b9c7d9', 1.7));
  const key = new THREE.DirectionalLight('#fff1d6', 2.4);
  key.position.set(2.5, 4, 3.5);
  const rim = new THREE.DirectionalLight('#cfe6ff', 1.0);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim);
  return scene;
}
function dispose(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

// ── ภาพนิ่ง (เรนเดอร์ครั้งเดียว เก็บไว้ใช้ซ้ำ) ──
let tr = null;
const cache = new Map();
function snapshot(key, build, camPos, target, fov = 30) {
  if (cache.has(key)) return cache.get(key);
  if (!tr) {
    tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    tr.setPixelRatio(1);
    tr.setSize(200, 200);
    tr.toneMapping = THREE.ACESFilmicToneMapping;
  }
  const scene = studio();
  const obj = build();
  scene.add(obj);
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
  cam.position.set(...camPos);
  cam.lookAt(...target);
  tr.render(scene, cam);
  const url = tr.domElement.toDataURL('image/png');
  dispose(obj);
  cache.set(key, url);
  return url;
}
const char = (look) => {
  const c = createCharacter({ look });
  c.blob.visible = false;
  c.animate(0.016, 0, false, 0.6);
  c.root.rotation.y = 0.4;
  return c.root;
};
/** ภาพเต็มตัวของชุด (ใส่กับสีผิว/ผมของผู้เล่นเอง) */
export const outfitThumb = (look) => snapshot('o' + JSON.stringify(look), () => char(look), [0, 1.0, 3.7], [0, 0.9, 0]);
/** ภาพใกล้หน้า ไว้เลือกทรงผม */
export const hairThumb = (look) => snapshot('h' + JSON.stringify(look), () => char(look), [0.4, 1.55, 2.0], [0, 1.4, 0]);
/** ภาพพาหนะ (มุมกล้องตามขนาดแต่ละคัน) */
const VEH_CAM = {
  1: [[1.3, 0.9, 1.6], [0, 0.1, 0]],
  2: [[1.9, 1.3, 2.3], [0, 0.5, 0]],
  3: [[2.5, 1.5, 3.0], [0, 0.55, 0]],
  4: [[1.0, 0.85, 1.25], [0, 0.3, 0]],
  5: [[4.1, 2.3, 4.7], [0, 0.55, -0.3]],
};
export const vehicleThumb = (id) => snapshot('v' + id, () => {
  const g = createVehicle(id).group;
  g.rotation.y = -0.7;
  if (id === 4) g.position.y = 0.3;
  return g;
}, VEH_CAM[id][0], VEH_CAM[id][1]);

// ── หุ่นตัวอย่าง 3D (ลากหมุนได้) ──
export function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = studio();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshStandardMaterial({ color: '#efeafe', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  let c = null, veh = 0, yaw = 0.5, spin = true, running = false, last = 0, drag = null, key = '';

  canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; spin = false; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag === null) return; yaw += (e.clientX - drag) * 0.012; drag = e.clientX; });
  const up = () => { drag = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    if (spin) yaw += dt * 0.5;
    if (c) {
      c.root.rotation.y = yaw;
      c.animate(dt, veh ? 3 : 0, false, now / 1000);
    }
    const far = veh === 5 ? 6.6 : veh ? 5.6 : 5.0;
    cam.position.set(0, 1.25, far);
    cam.lookAt(0, veh ? 0.85 : 1.0, 0);
    renderer.render(scene, cam);
  }
  return {
    /** เปลี่ยนหน้าตา/พาหนะที่โชว์ */
    set(look, vehicle = 0) {
      const k = JSON.stringify(look) + '|' + vehicle;
      if (k === key) return;
      key = k;
      if (c) { scene.remove(c.root); dispose(c.root); }
      c = createCharacter({ look });
      c.blob.visible = false;
      veh = vehicle;
      if (veh) c.setRide(veh);
      scene.add(c.root);
    },
    start() { if (running) return; running = true; spin = true; last = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
  };
}
