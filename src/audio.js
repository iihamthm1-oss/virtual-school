// เสียงทั้งหมดสร้างด้วย Web Audio (ไม่มีไฟล์เสียง ไม่มีลิขสิทธิ์ ไม่เพิ่มขนาดเกม)
// เพลงพื้นหลังสบาย ๆ · เสียงบรรยากาศ (นก ลม) · เสียงเอฟเฟกต์ · ออดโรงเรียน

let ac = null, master, musicBus, sfxBus, ambBus;
const settings = Object.assign({ music: true, sfx: true }, JSON.parse(localStorage.getItem('vs-audio') || '{}'));
const save = () => localStorage.setItem('vs-audio', JSON.stringify(settings));

/** ต้องเรียกหลังผู้ใช้กดปุ่มครั้งแรก (นโยบายเบราว์เซอร์) */
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new AudioContext(); } catch { return; }
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = settings.music ? 0.32 : 0; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = settings.sfx ? 1 : 0; sfxBus.connect(master);
  ambBus = ac.createGain(); ambBus.gain.value = settings.sfx ? 0.5 : 0; ambBus.connect(master);
  startMusic();
  startAmbience();
}
export const audioSettings = () => ({ ...settings });
export function setMusic(on) { settings.music = on; save(); if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ac.currentTime, 0.3); }
export function setSfx(on) { settings.sfx = on; save(); if (sfxBus) { sfxBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05); ambBus.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.3); } }
/** ในอาคารเสียงนกเบาลง */
export function setOutdoors(out) { if (ambBus && settings.sfx) ambBus.gain.setTargetAtTime(out ? 0.5 : 0.12, ac.currentTime, 0.6); }

// ── ตัวสร้างเสียงพื้นฐาน ──
function tone(freq, t0, dur, { type = 'sine', vol = 0.2, bus = sfxBus, attack = 0.01, glide = 0, detune = 0 } = {}) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
/** เสียงคล้ายมาริมบา (ไซน์ + ฮาร์มอนิกจาง ๆ) */
function mallet(freq, t0, vol, bus) {
  tone(freq, t0, 0.9, { vol, bus, attack: 0.005 });
  tone(freq * 4, t0, 0.18, { vol: vol * 0.25, bus, attack: 0.002 });
}
let noiseBuf = null;
function noise(t0, dur, { vol = 0.1, freq = 800, q = 0.7, bus = sfxBus, type = 'bandpass' } = {}) {
  if (!ac) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t0); s.stop(t0 + dur + 0.05);
}

// ── เพลงพื้นหลัง: เพนทาโทนิกสดใส วนไม่รู้จบ ไม่ซ้ำแบบเดิมทุกห้อง ──
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]; // C Am F G
const SCALE = [72, 74, 76, 79, 81, 84, 86];
function startMusic() {
  const bpm = 92, beat = 60 / bpm;
  let next = ac.currentTime + 0.3, step = 0, last = 3;
  const sched = () => {
    while (next < ac.currentTime + 0.6) {
      const bar = Math.floor(step / 8) % CHORDS.length, chord = CHORDS[bar], inBar = step % 8;
      if (inBar === 0) for (const n of chord) tone(NOTE(n - 12), next, beat * 7.5, { type: 'triangle', vol: 0.05, bus: musicBus, attack: 0.4 }); // แพดนุ่ม ๆ
      if (inBar % 4 === 0) tone(NOTE(chord[0] - 24), next, beat * 1.8, { type: 'sine', vol: 0.12, bus: musicBus, attack: 0.02 }); // เบส
      // ทำนองเดินทีละขั้นในบันไดเสียง เว้นจังหวะบ้าง
      if (Math.random() < (inBar % 2 ? 0.45 : 0.8)) {
        last = Math.max(0, Math.min(SCALE.length - 1, last + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        mallet(NOTE(SCALE[last]), next, 0.07, musicBus);
      }
      next += beat / 2;
      step++;
    }
  };
  setInterval(sched, 150);
}

// ── บรรยากาศ: นกร้องเป็นช่วง ๆ + ลมเบา ๆ ──
function startAmbience() {
  const chirp = () => {
    const t0 = ac.currentTime, base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(base * (1 + Math.random() * 0.2), t0 + i * 0.11, 0.09, { vol: 0.035, bus: ambBus, glide: base * 1.4, attack: 0.005 });
    setTimeout(chirp, 2500 + Math.random() * 6000);
  };
  setTimeout(chirp, 2000);
  const wind = () => { noise(ac.currentTime, 4, { vol: 0.02, freq: 400, q: 0.4, bus: ambBus, type: 'lowpass' }); setTimeout(wind, 3500); };
  wind();
}

// ── เสียงเอฟเฟกต์ ──
export function play(kind) {
  if (!ac) return;
  const t = ac.currentTime;
  switch (kind) {
    case 'good': [523, 659, 784, 1046].forEach((f, i) => mallet(f, t + i * 0.08, 0.16, sfxBus)); break;
    case 'bad': tone(330, t, 0.22, { type: 'triangle', vol: 0.15 }); tone(247, t + 0.13, 0.3, { type: 'triangle', vol: 0.15 }); break;
    case 'open': tone(660, t, 0.12, { vol: 0.1 }); tone(990, t + 0.06, 0.15, { vol: 0.08 }); break;
    case 'coin': tone(988, t, 0.08, { type: 'square', vol: 0.05 }); tone(1319, t + 0.07, 0.25, { type: 'square', vol: 0.05 }); break;
    case 'buy': [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.2, { type: 'square', vol: 0.04 })); break;
    case 'ride': tone(220, t, 0.25, { type: 'sawtooth', vol: 0.04, glide: 440 }); noise(t, 0.25, { vol: 0.05, freq: 1500 }); break;
    case 'whoosh': noise(t, 0.35, { vol: 0.08, freq: 900, q: 1.5 }); break;
    case 'pop': tone(600, t, 0.08, { vol: 0.12, glide: 1200 }); break;
    case 'firework': noise(t, 0.6, { vol: 0.12, freq: 300, q: 0.5, type: 'lowpass' }); noise(t + 0.02, 0.3, { vol: 0.05, freq: 3000, q: 0.8 }); break;
    case 'launch': tone(300, t, 0.6, { type: 'sine', vol: 0.04, glide: 1400 }); break;
    case 'bell': // ออดโรงเรียน (ทำนองระฆังแบบเวสต์มินสเตอร์)
      [[64, 0], [60, 0.55], [62, 1.1], [55, 1.65], [55, 2.6], [62, 3.15], [64, 3.7], [60, 4.25]].forEach(([n, d]) => {
        tone(NOTE(n + 12), t + d, 1.6, { vol: 0.14, attack: 0.005 });
        tone(NOTE(n + 24) * 1.003, t + d, 0.9, { vol: 0.04, attack: 0.005 });
      });
      break;
    case 'fanfare': [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [76, 0.7], [79, 0.85]].forEach(([n, d]) => tone(NOTE(n), t + d, d > 0.8 ? 0.9 : 0.2, { type: 'square', vol: 0.06 })); break;
  }
}
