$Python = "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\.venv\Scripts\python.exe"
$Script = Join-Path $PSScriptRoot "scripts\facenet_rescue_scanner.py"
$Config = Join-Path $PSScriptRoot "config.json"
$ModelDir = Join-Path $PSScriptRoot "models"

if (-not (Test-Path $Config)) {
  $Config = Join-Path $PSScriptRoot "config.example.json"
}

& $Python $Script `
  --config $Config `
  --model-dir $ModelDir `
  --device auto `
  --preview
