// เริ่มเซิร์ฟเวอร์จากโฟลเดอร์ของตัวเองเสมอ (Colyseus อ่านไฟล์ .env จากโฟลเดอร์ที่เริ่มรัน
// ถ้าเริ่มจากโฟลเดอร์อื่น อาจไปอ่านคีย์ลับของโปรเจกต์อื่นเข้ามาโดยไม่จำเป็น)
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(dirname(fileURLToPath(import.meta.url)));
await import('./index.mjs');
