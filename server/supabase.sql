-- โรงเรียนเสมือน 3D: สร้างตารางในฐานข้อมูล Supabase
-- วิธีใช้: เปิดโปรเจกต์ Supabase → SQL Editor → New query → วางทั้งไฟล์นี้ → กด Run (รันซ้ำได้ ไม่ลบข้อมูลเดิม)

-- ค่าตั้งของระบบ (รหัสครูแบบเข้ารหัส)
create table if not exists vs_config (
  key text primary key,
  value jsonb not null
);

-- คลังคำถาม (ชุดละไม่เกิน 50 ข้อ เก็บเป็น JSON)
create table if not exists vs_banks (
  id text primary key,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- นักเรียน: รหัส ชื่อ ห้อง เหรียญ ของที่มี ชุดที่ใส่
create table if not exists vs_students (
  code text primary key,
  name text not null,
  klass text not null default '',
  coins integer not null default 0,
  rounds integer not null default 0,
  solved integer not null default 0,
  owned jsonb not null default '[]'::jsonb,
  equip jsonb,
  created_at timestamptz not null default now()
);

-- ผลแต่ละรอบ
create table if not exists vs_results (
  id text primary key,
  code text,
  bank text,
  started_at bigint,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- ความปลอดภัย: เปิด Row Level Security โดยไม่มี policy ใด ๆ
-- = ไม่มีใครอ่าน/เขียนผ่านคีย์สาธารณะ (anon) ได้เลย มีแต่เซิร์ฟเวอร์เกมที่ใช้ service_role key เท่านั้น
alter table vs_config enable row level security;
alter table vs_banks enable row level security;
alter table vs_students enable row level security;
alter table vs_results enable row level security;
