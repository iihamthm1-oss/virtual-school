import { shuffle } from './util.js';
import { topicInfo, COOLDOWN_SEC } from './quests.js';

const $ = (id) => document.getElementById(id);
const KEYS = ['ก', 'ข', 'ค', 'ง'];

// ── เสียง (ดู audio.js) ──
import { play } from './audio.js';
export const sfx = (kind) => play(kind);

// ── อ่านออกเสียงภาษาไทย ──
export function speak(text) {
  if (!('speechSynthesis' in window)) return toast('เครื่องนี้ไม่รองรับการอ่านออกเสียง');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'th-TH';
  u.rate = 0.95;
  const th = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('th'));
  if (th) u.voice = th;
  speechSynthesis.speak(u);
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export function banner(html, ms = 3500) {
  const b = $('banner');
  b.innerHTML = `<div class="inner">${html}</div>`;
  b.classList.remove('hidden');
  setTimeout(() => b.classList.add('hidden'), ms);
}

/**
 * เปิดหน้าต่างคำถาม
 * onResult(correct) ถูกเรียกครั้งเดียวเมื่อผู้เล่นส่งคำตอบ ต้องคืนจำนวนเหรียญที่ได้
 * onClose() เมื่อหน้าต่างปิด
 */
export function openQuestion(quest, { onResult, onClose }) {
  const { q } = quest;
  const info = topicInfo(q.topic);
  const modal = $('modal'), body = $('q-body'), fb = $('q-feedback'), submit = $('q-submit');
  let done = false;

  $('q-topic').textContent = info.label;
  $('q-topic').className = 'chip ' + q.topic;
  $('q-place').textContent = '📍 ' + quest.spot.name + (quest.attempts ? ` · ครั้งที่ ${quest.attempts + 1}` : '');
  $('q-text').textContent = q.q;
  $('q-code').textContent = q.code || '';
  $('q-code').classList.toggle('hidden', !q.code);
  body.innerHTML = '';
  fb.className = 'hidden';
  submit.classList.add('hidden');

  let speechText = q.q;
  if (q.code) speechText += '. ' + q.code.replace(/\n/g, '. ');

  const finish = (correct, markEls) => {
    if (done) return;
    done = true;
    body.querySelectorAll('button').forEach((b) => (b.disabled = true));
    submit.classList.add('hidden');
    markEls?.();
    const reward = onResult(correct);
    fb.classList.remove('hidden');
    if (correct) {
      sfx('good');
      fb.className = 'good';
      fb.innerHTML = `🎉 <b>ถูกต้อง!</b> ได้ ${reward} เหรียญ`;
      setTimeout(close, 1500);
    } else {
      sfx('bad');
      fb.className = 'bad';
      fb.innerHTML = `💡 <b>ยังไม่ถูก ลองอีกครั้งใน ${COOLDOWN_SEC} วินาที</b><br>คำใบ้: ${q.hint || 'ลองคิดอีกนิด'}`;
      submit.textContent = 'เข้าใจแล้ว';
      submit.classList.remove('hidden');
      submit.disabled = false;
      submit.onclick = close;
    }
  };

  if (q.type === 'mc' || q.type === 'code') {
    // สลับตัวเลือก เพื่อไม่ให้จำตำแหน่งคำตอบได้
    const order = shuffle(q.choices.map((_, i) => i));
    order.forEach((ci, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<span class="key">${KEYS[i]}</span><span></span>`;
      b.lastChild.textContent = q.choices[ci];
      b.onclick = () => finish(ci === q.answer, () => b.classList.add(ci === q.answer ? 'right' : 'wrong'));
      body.appendChild(b);
    });
    speechText += '. ' + order.map((ci, i) => `ข้อ ${KEYS[i]}. ${q.choices[ci]}`).join('. ');
  } else if (q.type === 'tf') {
    const wrap = document.createElement('div');
    wrap.className = 'tf';
    [[true, '⭕ ถูก'], [false, '❌ ผิด']].forEach(([val, label]) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.textContent = label;
      b.onclick = () => finish(val === q.answer, () => b.classList.add(val === q.answer ? 'right' : 'wrong'));
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    speechText += '. ถูก หรือ ผิด';
  } else if (q.type === 'order') {
    const n = q.items.length;
    let pool = shuffle(q.items.map((_, i) => i));
    while (n > 1 && pool.every((v, i) => v === i)) pool = shuffle(pool);
    const picked = [];
    const render = () => {
      body.innerHTML = '';
      const l1 = document.createElement('div');
      l1.className = 'order-label';
      l1.textContent = 'แตะขั้นตอนด้านล่างตามลำดับ (แตะช่องที่เลือกแล้วเพื่อเอาออก)';
      body.appendChild(l1);
      const slots = document.createElement('div');
      slots.className = 'order-slots';
      for (let i = 0; i < n; i++) {
        const s = document.createElement('div');
        const has = picked[i] !== undefined;
        s.className = 'slot ' + (has ? 'filled' : 'empty');
        s.innerHTML = `<span class="n">${i + 1}</span><span></span>`;
        if (has) {
          s.lastChild.textContent = q.items[picked[i]];
          s.onclick = () => { if (done) return; pool.push(picked[i]); picked.splice(i, 1); render(); };
        }
        slots.appendChild(s);
      }
      body.appendChild(slots);
      const pl = document.createElement('div');
      pl.className = 'order-pool';
      pool.forEach((ii) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.textContent = q.items[ii];
        b.onclick = () => { picked.push(ii); pool = pool.filter((x) => x !== ii); render(); };
        pl.appendChild(b);
      });
      body.appendChild(pl);
      submit.textContent = 'ส่งคำตอบ';
      submit.classList.toggle('hidden', done);
      submit.disabled = picked.length < n;
      submit.onclick = () => finish(picked.every((v, i) => v === i), () => {
        slots.querySelectorAll('.slot').forEach((s, i) => s.classList.add(picked[i] === i ? 'right' : 'wrong'));
      });
    };
    render();
    speechText += '. ' + pool.map((ii) => q.items[ii]).join('. ');
  }

  function close() {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    onClose?.();
  }
  $('q-close').onclick = close;
  $('q-speak').onclick = () => speak(speechText);
  modal.onclick = (e) => { if (e.target === modal) close(); };
  modal.classList.remove('hidden');
  sfx('open');
  return close;
}
