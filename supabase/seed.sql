insert into public.missing_persons (
  case_code,
  full_name,
  age,
  priority,
  last_seen_text,
  reporter_contact,
  note,
  initials,
  status
)
values
  (
    'HY-001',
    'นางมาลี ใจดี',
    72,
    'high',
    'ชุมชนคลองเต้ย ใกล้คลองอู่ตะเภา',
    'ญาติผู้แจ้ง 08x-xxx-1001',
    'ผู้สูงอายุ เดินช้า สวมเสื้อสีฟ้า',
    'มล',
    'searching'
  ),
  (
    'HY-014',
    'นายธนากร ศรีสุข',
    41,
    'medium',
    'ย่านตลาดกิมหยง',
    'ศูนย์ชุมชน 08x-xxx-1014',
    'ติดต่อไม่ได้หลังน้ำขึ้นช่วงเช้า',
    'ธก',
    'searching'
  ),
  (
    'HY-022',
    'เด็กหญิงอารีนา',
    10,
    'high',
    'ชุมชนริมทางรถไฟหาดใหญ่',
    'ผู้ปกครอง 08x-xxx-1022',
    'เด็ก ต้องตรวจสอบกับผู้ปกครองก่อนเผยแพร่รายละเอียด',
    'อร',
    'searching'
  )
on conflict (case_code) do update
set
  full_name = excluded.full_name,
  age = excluded.age,
  priority = excluded.priority,
  last_seen_text = excluded.last_seen_text,
  reporter_contact = excluded.reporter_contact,
  note = excluded.note,
  initials = excluded.initials,
  status = excluded.status,
  updated_at = now();
