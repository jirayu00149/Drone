$Python = "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\.venv\Scripts\python.exe"
$Script = Join-Path $PSScriptRoot "scripts\train_facenet_model.py"

& $Python $Script `
  --dataset (Join-Path $PSScriptRoot "data\faces") `
  --output (Join-Path $PSScriptRoot "models") `
  --device auto
