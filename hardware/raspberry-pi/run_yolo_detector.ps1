$Python = "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\.venv\Scripts\python.exe"
$Script = Join-Path $PSScriptRoot "scripts\yolo_drone_person_detector.py"
$Model = "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\models\drone_person_detector.pt"

& $Python $Script `
  --model $Model `
  --conf 0.25 `
  --imgsz 640 `
  --classes 0,1 `
  --server-url "http://127.0.0.1:4173/api/yolo/detections" `
  --preview
