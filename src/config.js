// ที่อยู่เซิร์ฟเวอร์: ตอนขึ้นเว็บจริงตั้งค่า VITE_SERVER_URL (wss://...) · ตอนทดสอบใช้เครื่องเดียวกับหน้าเว็บ พอร์ต 2567
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
export const API_URL = SERVER_URL.replace(/^ws/, 'http');

/**
 * ปลุกเซิร์ฟเวอร์ (แบบฟรีจะหลับเมื่อไม่มีคนใช้ 15 นาที ตื่นช้าได้ถึง ~1 นาที)
 * onWait(วินาทีที่รอ) ถูกเรียกระหว่างรอ · คืน true เมื่อพร้อม
 */
export async function wakeServer(onWait, maxSeconds = 90) {
  const t0 = Date.now();
  for (;;) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(API_URL + '/api/health', { signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch { /* ยังไม่ตื่น */ }
    const waited = Math.round((Date.now() - t0) / 1000);
    if (waited > maxSeconds) return false;
    onWait?.(waited);
    await new Promise((r) => setTimeout(r, 2500));
  }
}
