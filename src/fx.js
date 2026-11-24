import * as THREE from 'three';
import { makeLabel, rand, pick } from './util.js';
import { play } from './audio.js';

// เอฟเฟกต์: ตัวเลขลอย (+10 💰) และพลุ
let spark = null;
function sparkTex() {
  if (spark) return spark;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  spark = new THREE.CanvasTexture(c);
  return spark;
}

export function createFx(scene) {
  const floats = [], bursts = [], rockets = [];
  const COLORS = ['#ffd66b', '#ff8fab', '#4fc3e8', '#a6e07a', '#c7a6ff', '#ffffff', '#ff9e7a'].map((c) => new THREE.Color(c));

  function floatText(text, x, y, z, color = '#f2a33a') {
    const s = makeLabel(text, { size: 1.1, bg: 'rgba(255,255,255,0.92)', fg: color, weight: 700 });
    s.position.set(x, y, z);
    s.material.depthTest = false;
    s.renderOrder = 6;
    scene.add(s);
    floats.push({ s, life: 1.4, base: s.scale.clone() });
  }

  function explode(pos) {
    const n = 140, geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), v = [];
    const col = pick(COLORS), col2 = pick(COLORS);
    for (let i = 0; i < n; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const k = i % 3 ? col : col2;
      c.set([k.r, k.g, k.b], i * 3);
      // กระจายเป็นทรงกลม
      const u = rand(-1, 1), th = rand(0, Math.PI * 2), sp = rand(9, 14), r = Math.sqrt(1 - u * u);
      v.push(new THREE.Vector3(r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    // ประกายกลมขอบนุ่ม สีสด (กลางวันฟ้าสว่าง ถ้าใช้แบบเรืองแสงบวกสีจะกลายเป็นขาว)
    const mat = new THREE.PointsMaterial({ size: 1.3, map: sparkTex(), alphaTest: 0.05, vertexColors: true, transparent: true, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    bursts.push({ pts, v, life: 2.2 });
    play('firework');
  }

  /** ยิงพลุ n ลูกรอบจุด (x,z) */
  function fireworks(x, z, n = 8) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }));
        m.position.set(x + rand(-14, 14), 1, z + rand(-14, 14));
        scene.add(m);
        rockets.push({ m, vy: rand(22, 28), life: rand(1.0, 1.3) });
        play('launch');
      }, i * rand(250, 450));
    }
  }

  function update(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.s.position.y += dt * 1.4;
      const k = Math.min(1, f.life / 0.4);
      f.s.material.opacity = k;
      const pop = 1 + Math.max(0, f.life - 1.2) * 2;
      f.s.scale.copy(f.base).multiplyScalar(pop);
      if (f.life <= 0) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); floats.splice(i, 1); }
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.life -= dt;
      r.vy -= 12 * dt;
      r.m.position.y += r.vy * dt;
      if (r.life <= 0) { explode(r.m.position); scene.remove(r.m); rockets.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      const p = b.pts.geometry.attributes.position.array;
      for (let k = 0; k < b.v.length; k++) {
        const v = b.v[k];
        v.y -= 6 * dt; v.multiplyScalar(1 - dt * 1.2);
        p[k * 3] += v.x * dt; p[k * 3 + 1] += v.y * dt; p[k * 3 + 2] += v.z * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life / 0.8);
      if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
    }
  }
  return { floatText, fireworks, update };
}
