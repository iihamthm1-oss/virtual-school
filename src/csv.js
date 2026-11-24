// อ่าน/เขียน CSV (เปิดใน Excel และ Google Sheet ได้ ภาษาไทยไม่เพี้ยนเพราะใส่ BOM)
export function toCSV(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── แปลงคลังคำถาม ⇄ ตาราง ──
export const BANK_HEADER = ['หมวด', 'ประเภท', 'คำถาม', 'โค้ด', 'ตัวเลือก1 / ขั้นที่1', 'ตัวเลือก2 / ขั้นที่2', 'ตัวเลือก3 / ขั้นที่3', 'ตัวเลือก4 / ขั้นที่4', 'ขั้นที่5', 'ขั้นที่6', 'คำตอบ', 'คำใบ้'];
const TOPIC_TH = { computing: 'วิทยาการคำนวณ', general: 'ความรู้ทั่วไป' };
const TYPE_TH = { mc: 'ปรนัย', tf: 'ถูกผิด', order: 'เรียงลำดับ', code: 'โค้ด' };
const back = (map, v) => Object.keys(map).find((k) => k === v || map[k] === v);

export function bankToRows(bank) {
  return [BANK_HEADER, ...bank.questions.map((q) => {
    const opts = q.type === 'order' ? q.items : q.choices || [];
    const six = [...opts, '', '', '', '', '', ''].slice(0, 6);
    const ans = q.type === 'tf' ? (q.answer ? 'ถูก' : 'ผิด') : q.type === 'order' ? '' : q.answer + 1;
    return [TOPIC_TH[q.topic], TYPE_TH[q.type], q.q, q.code || '', ...six, ans, q.hint || ''];
  })];
}

/** คืน { questions, errors } */
export function rowsToQuestions(rows) {
  const errors = [];
  const questions = [];
  const start = rows[0] && /หมวด|topic/i.test(rows[0][0]) ? 1 : 0;
  rows.slice(start).forEach((r, i) => {
    const line = i + start + 1;
    const [topicRaw, typeRaw, q, code, ...rest] = r.map((c) => (c ?? '').trim());
    const opts = rest.slice(0, 6).filter(Boolean);
    const ansRaw = rest[6] || '', hint = rest[7] || '';
    const topic = back(TOPIC_TH, topicRaw) || (topicRaw.includes('คำนวณ') ? 'computing' : 'general');
    const type = back(TYPE_TH, typeRaw) || ({ 'ถูก/ผิด': 'tf', 'ถูก-ผิด': 'tf' })[typeRaw];
    if (!q) return;
    if (!type) return errors.push(`แถว ${line}: ไม่รู้จักประเภท "${typeRaw}" (ใช้ ปรนัย / ถูกผิด / เรียงลำดับ / โค้ด)`);
    if (type === 'tf') {
      if (!/^(ถูก|ผิด|true|false)$/i.test(ansRaw)) return errors.push(`แถว ${line}: คำตอบต้องเป็น ถูก หรือ ผิด`);
      questions.push({ topic, type, q, hint, answer: /^(ถูก|true)$/i.test(ansRaw) });
    } else if (type === 'order') {
      if (opts.length < 2) return errors.push(`แถว ${line}: เรียงลำดับต้องมีอย่างน้อย 2 ขั้น`);
      questions.push({ topic, type, q, hint, items: opts });
    } else {
      const a = Number(ansRaw) - 1;
      if (opts.length < 2 || !(a >= 0 && a < opts.length)) return errors.push(`แถว ${line}: ต้องมีตัวเลือกอย่างน้อย 2 ข้อ และคำตอบเป็นเลข 1–${Math.max(2, opts.length)}`);
      questions.push({ topic, type, q, hint, choices: opts.slice(0, 4), answer: a, ...(code ? { code } : {}) });
    }
  });
  return { questions, errors };
}

export const TEMPLATE_ROWS = [
  BANK_HEADER,
  ['วิทยาการคำนวณ', 'ปรนัย', 'อุปกรณ์ใดเป็นอุปกรณ์รับข้อมูลเข้า', '', 'จอภาพ', 'ลำโพง', 'เมาส์', 'เครื่องพิมพ์', '', '', '3', 'อุปกรณ์ที่เราใช้สั่งคอมพิวเตอร์'],
  ['ความรู้ทั่วไป', 'ถูกผิด', 'ดวงอาทิตย์ขึ้นทางทิศตะวันออก', '', '', '', '', '', '', '', 'ถูก', 'ดูจากชื่อทิศ'],
  ['วิทยาการคำนวณ', 'เรียงลำดับ', 'เรียงขั้นตอนการแปรงฟัน', '', 'บีบยาสีฟัน', 'แปรงฟันให้ทั่ว', 'บ้วนปาก', 'ล้างแปรง', '', '', '', 'ต้องมียาสีฟันก่อน'],
  ['วิทยาการคำนวณ', 'โค้ด', 'โปรแกรมนี้แสดงผลอะไร', 'x = 2\nprint(x * 3)', '5', '6', '23', '8', '', '', '2', 'คูณ 2 ด้วย 3'],
];
