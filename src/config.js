// ที่อยู่เซิร์ฟเวอร์: ตอนขึ้นเว็บจริงตั้งค่า VITE_SERVER_URL (wss://...) · ตอนทดสอบใช้เครื่องเดียวกับหน้าเว็บ พอร์ต 2567
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
export const API_URL = SERVER_URL.replace(/^ws/, 'http');
