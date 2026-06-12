# Raspberry Pi Edge Device

แนะนำใช้ Raspberry Pi 5 RAM 8GB + Raspberry Pi AI HAT+ สำหรับ prototype

หน้าที่บนโดรน:

- รับภาพจากกล้อง
- รัน inference เบื้องต้น
- อ่าน GPS
- ส่ง candidate match และพิกัดไปยัง server
- รับคำสั่งจากหน้าแอดมิน เช่น ลาดตระเวน หยุดนิ่ง กลับฐาน ลงจอด

ไม่แนะนำให้ train โมเดลบน Raspberry Pi โดยตรง ให้ train บนเครื่อง GPU หรือ cloud แล้ว deploy โมเดลมาที่บอร์ด
