# คู่มือเอาเกมขึ้นเว็บจริง (ช่วงที่ 6)

เมื่อทำครบทุกขั้น นักเรียนจะเล่นได้จากที่ไหนก็ได้ผ่านลิงก์ เช่น `https://virtual-school.pages.dev`
ไม่ต้องเปิดคอมเครื่องนี้ทิ้งไว้ และ**ไม่มีค่าใช้จ่าย** (ใช้บริการแบบฟรีทั้งหมด)

| ส่วน | ใช้บริการ | หน้าที่ |
|---|---|---|
| โค้ดทั้งหมด | **GitHub** | เก็บโค้ด เมื่ออัปเดตโค้ด เว็บจะอัปเดตตามเอง |
| ฐานข้อมูล | **Supabase** | คลังคำถาม รายชื่อนักเรียน เหรียญ ผลคะแนน |
| เซิร์ฟเวอร์เกม | **Render** | ห้องออนไลน์ 50 คน + ระบบหน้าครู |
| หน้าเว็บเกม | **Cloudflare Pages** | หน้าเกม + หน้าครู |

ใช้เวลาประมาณ 30–45 นาที ทำตามลำดับ 1 → 5

> ⚠️ ทุกบัญชีต้องสมัครด้วยตัวคุณเอง (ผู้ช่วยสมัครแทนไม่ได้) แนะนำให้สมัคร Render และ Cloudflare ด้วยบัญชี GitHub จะได้ไม่ต้องจำรหัสหลายชุด

---

## 1. GitHub: เก็บโค้ด

1. สมัคร/เข้าสู่ระบบที่ https://github.com
2. มุมขวาบนกด **+** → **New repository**
   - Repository name: `virtual-school`
   - เลือก **Private** (ส่วนตัว ไม่มีใครเห็นโค้ด)
   - **ไม่ต้อง**ติ๊ก Add README / .gitignore / license
   - กด **Create repository**
3. GitHub จะแสดงลิงก์ของ repo เช่น `https://github.com/ชื่อคุณ/virtual-school.git` — คัดลอกไว้
4. ส่งโค้ดขึ้น GitHub (บอกผู้ช่วยให้ทำ หรือรันเองใน PowerShell):
   ```powershell
   git -C D:\virtual-school remote add origin https://github.com/ชื่อคุณ/virtual-school.git
   git -C D:\virtual-school push -u origin master
   ```
   ครั้งแรกจะมีหน้าต่างให้เข้าสู่ระบบ GitHub ผ่านเบราว์เซอร์

> ไฟล์ข้อมูลจริงในเครื่อง (`server/data/` รหัสครู รายชื่อนักเรียน) และไฟล์ `.env` **ไม่ถูกส่งขึ้น** GitHub ตั้งค่ากันไว้แล้ว

---

## 2. Supabase: ฐานข้อมูล

1. สมัครที่ https://supabase.com → **New project**
   - Name: `virtual-school`
   - Database Password: ตั้งรหัสยาว ๆ แล้ว**จดเก็บไว้** (ไม่ต้องใช้ในเกม แต่ห้ามลืม)
   - Region: **Southeast Asia (Singapore)** (ใกล้ไทยที่สุด)
   - กด **Create new project** รอประมาณ 1–2 นาที
2. เมนูซ้ายกด **SQL Editor** → **New query**
   - เปิดไฟล์ `D:\virtual-school\server\supabase.sql` คัดลอกทั้งหมดไปวาง → กด **Run**
   - ขึ้น "Success. No rows returned" = สำเร็จ
3. เมนูซ้ายกด **Project Settings** → **API** (หรือ **Data API** / **API Keys**) แล้วจด 2 ค่านี้:
   - **Project URL** เช่น `https://abcdefgh.supabase.co`
   - **service_role** key (กด Reveal) — ⚠️ **เป็นความลับ** ใครได้ไปจะแก้ข้อมูลทั้งหมดได้ ห้ามส่งให้ใคร ห้ามใส่ในหน้าเว็บ

### (ไม่บังคับ) ย้ายข้อมูลที่ทำไว้ในเครื่องขึ้นไปด้วย
ถ้าอยากเก็บรายชื่อนักเรียน/คลังคำถามที่แก้ไว้ และใช้รหัสครูเดิม:
1. สร้างไฟล์ `D:\virtual-school\server\.env` มีเนื้อหา 2 บรรทัด (ใส่ค่าจริงของคุณ):
   ```
   SUPABASE_URL=https://abcdefgh.supabase.co
   SUPABASE_SERVICE_KEY=คีย์-service_role-ของคุณ
   ```
2. รัน:
   ```powershell
   node D:\virtual-school\server\migrate.mjs
   ```
   ถ้าไม่ย้าย ระบบจะใส่คลังคำถาม 4 ชุดให้เองตอนเซิร์ฟเวอร์เริ่มครั้งแรก

---

## 3. Render: เซิร์ฟเวอร์เกม

1. สมัครที่ https://render.com ด้วยบัญชี GitHub (อนุญาตให้ Render เห็น repo `virtual-school`)
2. กด **New** → **Blueprint** → เลือก repo `virtual-school` → กด **Connect**
3. Render อ่านไฟล์ `render.yaml` แล้วขอค่า 3 ช่อง:
   - `SUPABASE_URL` = Project URL จากขั้นที่ 2
   - `SUPABASE_SERVICE_KEY` = service_role key จากขั้นที่ 2
   - `TEACHER_PIN` = รหัสครู 6 หลักที่อยากใช้ (ถ้าย้ายข้อมูลแล้ว จะใช้รหัสเดิมแทน ช่องนี้ใส่อะไรก็ได้)
4. กด **Apply** แล้วรอสร้างเสร็จ (ประมาณ 3–5 นาที)
5. จดที่อยู่เซิร์ฟเวอร์ เช่น `https://virtual-school-server.onrender.com`
6. ทดสอบ: เปิด `https://virtual-school-server.onrender.com/api/health`
   ต้องเห็น `{"ok":true,"backend":"supabase"}` (ถ้าเห็น `"file"` แปลว่าใส่ค่า Supabase ไม่ครบ)

---

## 4. Cloudflare Pages: หน้าเว็บเกม

1. สมัครที่ https://dash.cloudflare.com
2. เมนู **Workers & Pages** → **Create** → แท็บ **Pages** → **Connect to Git** → เลือก repo `virtual-school`
3. ตั้งค่า:
   - Framework preset: **None** (หรือ Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - **Environment variables** เพิ่ม 2 ตัว:
     - `VITE_SERVER_URL` = `wss://virtual-school-server.onrender.com` (ที่อยู่จากขั้นที่ 3 แต่เปลี่ยน `https` เป็น `wss`)
     - `NODE_VERSION` = `22`
4. กด **Save and Deploy** รอประมาณ 2 นาที
5. จะได้ที่อยู่เว็บ เช่น `https://virtual-school.pages.dev`

---

## 5. ทดสอบจริง

1. เปิด `https://virtual-school.pages.dev/teacher.html` → ใส่รหัสครู
   (ครั้งแรกของวันอาจขึ้น "กำลังปลุกเซิร์ฟเวอร์..." นานถึง 1 นาที เป็นเรื่องปกติของแบบฟรี)
2. สร้างห้อง → ใช้มือถือสแกน QR → ใส่ชื่อ → เข้าห้อง
3. ครูกดเริ่มรอบ → นักเรียนเห็นคริสตัล → ตอบคำถาม → คะแนนขึ้นที่หน้าครู

---

## ใช้งานประจำวัน

- **ก่อนเข้าคาบ 1–2 นาที** ให้ครูเปิดหน้าครูและเข้าสู่ระบบก่อน (ปลุกเซิร์ฟเวอร์ที่หลับอยู่)
- **อัปเดตเกม**: เมื่อโค้ดถูกส่งขึ้น GitHub ใหม่ (`git push`) ทั้ง Render และ Cloudflare จะสร้างเวอร์ชันใหม่ให้เอง
  ⚠️ ระหว่าง Render อัปเดต (2–3 นาที) ห้องที่เปิดอยู่จะหลุด — อย่าอัปเดตระหว่างคาบ

## ข้อจำกัดของแบบฟรี (ตรวจราคา/เงื่อนไขล่าสุดที่เว็บผู้ให้บริการอีกครั้ง เพราะเปลี่ยนได้)

| บริการ | ข้อจำกัดหลัก | ผลกับเกม |
|---|---|---|
| Render | หลับเมื่อไม่มีคนใช้ 15 นาที ตื่นช้า ~1 นาที · แบนด์วิดท์ต่อเดือนจำกัด | ต้องปลุกก่อนคาบ · 1 คาบ 50 คน 40 นาที ใช้ประมาณ 0.5 GB |
| Supabase | ฐานข้อมูล 500 MB · **หยุดโปรเจกต์อัตโนมัติถ้าไม่มีคนใช้ ~7 วัน** | ปิดเทอม/หยุดยาว ต้องเข้าไปกด **Restore project** ในหน้า Supabase ก่อนใช้ |
| Cloudflare Pages | แทบไม่มีข้อจำกัดสำหรับเกมนี้ | — |

ถ้าไม่อยากให้เซิร์ฟเวอร์หลับ: อัปเกรด Render เป็นแบบเสียเงิน (ประมาณ 7 ดอลลาร์/เดือน ≈ 250 บาท)

## ความเป็นส่วนตัวของนักเรียน (PDPA)

- ระบบเก็บแค่ **ชื่อเล่น/ชื่อที่ครูพิมพ์ ห้อง เหรียญ และคะแนน** ไม่เก็บอีเมล เบอร์โทร หรือรูป
- ข้อมูลอยู่ในฐานข้อมูล Supabase ที่สิงคโปร์ อ่านได้เฉพาะเซิร์ฟเวอร์เกมเท่านั้น
- แชทเป็นข้อความสำเร็จรูป นักเรียนพิมพ์ข้อความเองไม่ได้
- ลบข้อมูลนักเรียน: หน้าครู → รายชื่อนักเรียน → 🗑️
