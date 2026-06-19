$Python = "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\.venv\Scripts\python.exe"
$Script = Join-Path $PSScriptRoot "scripts\yolo_water_level_detector.py"
$Model = Join-Path $PSScriptRoot "models\flood_water_level.pt"

& $Python $Script `
  --model $Model `
  --conf 0.25 `
  --imgsz 640 `
  --server-url "http://127.0.0.1:4173/api/yolo/water-level" `
  --reference-height-cm 200 `
  --reference-top-y 80 `
  --reference-bottom-y 460 `
  --preview
