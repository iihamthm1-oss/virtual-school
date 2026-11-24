// ระดับภาพ: ต่ำ / กลาง / สูง — โหมดอัตโนมัติวัดความลื่นแล้วลดระดับเองถ้าเครื่องไม่ไหว
export const TIERS = {
  low: { label: 'ต่ำ', pr: 0.75, shadows: false, shadowSize: 512 },
  medium: { label: 'กลาง', pr: 1, shadows: true, shadowSize: 1024 },
  high: { label: 'สูง', pr: 1.5, shadows: true, shadowSize: 2048 },
};
const ORDER = ['low', 'medium', 'high'];

function guess() {
  const mem = navigator.deviceMemory || 8;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && mem <= 4) return 'low';
  if (touch) return 'medium';
  return 'high';
}

export function createQuality({ renderer, sun, onChange }) {
  let mode = localStorage.getItem('vs-quality') || 'auto';
  let tier = null, frames = 0, acc = 0, windowFps = [], cooldown = 4, downgraded = false;
  const q = {
    fps: 0,
    get mode() { return mode; },
    get tier() { return tier; },
    set(m) {
      mode = m;
      localStorage.setItem('vs-quality', m);
      downgraded = false;
      apply(m === 'auto' ? guess() : m);
    },
    /** เรียกทุกเฟรม */
    tick(dt) {
      frames++; acc += dt;
      if (acc < 1) return;
      q.fps = Math.round(frames / acc);
      frames = 0; acc = 0;
      if (document.hidden || mode !== 'auto') return;
      windowFps.push(q.fps);
      if (windowFps.length > 4) windowFps.shift();
      if (--cooldown > 0 || windowFps.length < 4) return;
      const avg = windowFps.reduce((a, b) => a + b, 0) / windowFps.length;
      const i = ORDER.indexOf(tier);
      if (avg < 32 && i > 0) { apply(ORDER[i - 1]); downgraded = true; }
      else if (avg > 58 && i < 2 && !downgraded) apply(ORDER[i + 1]); // ขึ้นระดับได้เฉพาะตอนยังไม่เคยลด (กันสลับไปมา)
    },
  };
  function apply(t) {
    tier = t;
    const c = TIERS[t];
    renderer.setPixelRatio(Math.min(devicePixelRatio, c.pr));
    sun.castShadow = c.shadows;
    if (sun.shadow.mapSize.x !== c.shadowSize) {
      sun.shadow.mapSize.set(c.shadowSize, c.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    windowFps = [];
    cooldown = 4;
    onChange?.(t);
  }
  apply(mode === 'auto' ? guess() : mode);
  return q;
}
