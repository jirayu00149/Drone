# backend

พื้นที่สำหรับต่อยอดเป็น backend จริง

- `routes/` API endpoint เช่น `/missing-persons`, `/matches`, `/drone/commands`
- `services/` logic เช่น face matching, drone command service, notification service
- `storage/` adapter เชื่อม database หรือ object storage

เว็บต้นแบบปัจจุบันยังใช้ `localStorage` เพื่อให้เปิดทดสอบได้ทันทีโดยไม่ต้องติดตั้ง database
