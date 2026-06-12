# Hatyai Drone Rescue Web Prototype

เว็บต้นแบบสำหรับแยกงานฝั่งประชาชนออกจากระบบปฏิบัติการโดรน โดยทั้งสองเว็บยังเชื่อมข้อมูลชุดเดียวกันผ่าน localStorage เพื่อทดลอง flow ตรวจสอบใบหน้าและอัปเดตสถานะ

## โครงหน้า

- `index.html` หน้าแรกและประกาศก่อนตรวจรายชื่อ
- `search.html` หน้าตรวจรายชื่อและสถานะผู้สูญหาย
- `report.html` หน้าแจ้งผู้สูญหายและแนบรูปใบหน้าอ้างอิง
- `drone/index.html` เว็บ Drone Ops แยกสำหรับทีมโดรน ใช้สแกน candidate ตรวจใบหน้า บันทึกพิกัด และส่งสถานะกลับเว็บประชาชน
- `pilot.html` และ `admin.html` เป็นลิงก์เก่าที่ redirect ไป `drone/index.html`
- `shared.js` logic กลางสำหรับข้อมูลเคส, localStorage, embedding จำลอง, สถานะ และ rescue log
- `public.js` logic สำหรับหน้า public
- `admin.js` logic สำหรับเว็บ Drone Ops
- `styles.css` style ของเว็บประชาชนและ component กลาง
- `drone/drone.css` style เฉพาะเว็บ Drone Ops

## URL

- หน้าแรก: `http://127.0.0.1:4174/`
- ตรวจรายชื่อ: `http://127.0.0.1:4174/search.html`
- แจ้งผู้สูญหาย: `http://127.0.0.1:4174/report.html`
- Drone Ops: `http://127.0.0.1:4174/drone/index.html`

## Deploy เป็น Web Service

โปรเจกต์มี `package.json` แล้ว จึง deploy เป็น Node web service ได้:

- Build command: เว้นว่างไว้ หรือใช้ `yarn install`
- Start command: `yarn start`
- Server จะอ่าน `PORT` จาก host เช่น Render และ bind ที่ `0.0.0.0`

## Deploy บน Cloudflare Pages

Cloudflare Pages เหมาะกับโปรเจกต์นี้กว่า Render เพราะเว็บเป็น static site และไม่มี server ที่ต้องรอ wake up:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: เว้นว่าง
- Production branch: `master`

รัน deploy จากเครื่องนี้ได้ด้วย:

```bash
npm run pages:deploy
```

สคริปต์ build จะ copy เฉพาะไฟล์เว็บลง `dist/` เพื่อไม่เผยแพร่ไฟล์ setup/database ภายในโปรเจกต์

## Tubelight navigation

- เว็บ production ตอนนี้ใช้ `tubelight-nav.js` กับ CSS ใน `styles.css`
- React/shadcn component ที่ขออยู่ที่ `components/ui/tubelight-navbar.tsx`
- รายละเอียดการ migrate เป็น React + Tailwind + TypeScript อยู่ใน `docs/react-shadcn-setup.md`

## Supabase database

เริ่มเพิ่มฐานข้อมูล Supabase แล้วใน `supabase/`:

- `supabase/setup.sql` สร้างตาราง, indexes, RLS policies, grants และ private Storage buckets
- `supabase/seed.sql` เพิ่มข้อมูล demo ชุดเดียวกับ prototype
- `docs/supabase-database.md` อธิบายขั้นตอนนำ SQL ไป run ใน Supabase SQL Editor

โปรเจกต์หน้าเว็บยังใช้ `localStorage` อยู่เพื่อให้ demo เดิมเปิดได้ทันที ขั้นถัดไปคือเพิ่ม backend API/ Supabase client เพื่อย้ายการอ่านเขียนข้อมูลจริงออกจาก browser storage

## Flow

1. ประชาชนเข้า `search.html` เพื่อตรวจรายชื่อและสถานะ
2. ถ้ายังไม่มีข้อมูล ให้ไป `report.html` เพื่อแจ้งผู้สูญหายและแนบรูปอ้างอิง
3. ทีมโดรนเข้า `drone/index.html` ซึ่งเป็นเว็บแยก แต่ยังอ่านข้อมูลจากฐานเดียวกัน
4. เมื่อระบบโดรนตรวจพบ candidate และเจ้าหน้าที่ยืนยัน สถานะใน `search.html` จะอัปเดตเป็น `พบแล้ว` พร้อมพิกัดล่าสุด

## Responsible AI

- AI เป็นตัวช่วยเสนอ candidate ไม่ใช่ผู้ตัดสินสุดท้าย
- ควรมีเจ้าหน้าที่ตรวจสอบก่อนเปลี่ยนสถานะเป็นพบแล้วในระบบจริง
- รูปใบหน้าและพิกัดเป็นข้อมูลอ่อนไหว ควรเก็บเท่าที่จำเป็นและลบหลังจบภารกิจ
- ระบบจริงควรเพิ่มสิทธิ์ผู้ใช้, audit log, consent, และ backend ที่ปลอดภัย
