# Raspberry Pi Trained Face AI

This folder is the real AI path for the drone page.

It uses OpenCV YuNet for face detection and OpenCV SFace for face recognition.
The browser page only displays results. The trained Python AI decides the match.

It also supports the trained VisDrone YOLO model for drone-person detection:

```text
C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\models\drone_person_detector.pt
```

## Recommended board

- Raspberry Pi 5 RAM 8GB
- Raspberry Pi Camera Module 3 Wide or USB webcam
- Optional: Raspberry Pi AI HAT+ for heavier future models

## Install

```bash
cd hardware/raspberry-pi
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-pi.txt
cp config.example.json config.json
```

On Windows for testing, use:

```powershell
cd hardware\raspberry-pi
python -m venv .venv
.\.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements-pi.txt
copy config.example.json config.json
```

## Prepare training photos

Put photos in this layout:

```text
data/faces/
  HY-001/
    001.jpg
    002.jpg
  HY-014/
    001.jpg
    002.jpg
```

Use 10-20 clear photos per person if possible.

## Train SFace database

```bash
python scripts/train_sface_model.py --dataset data/faces --output models
```

The command creates:

```text
models/sface_embeddings.npz
models/sface_meta.json
models/web_face_db.json
models/opencv_zoo/*.onnx
```

## Run trained AI scanner

Start the web API first:

```bash
npm start
```

Then run the scanner:

```bash
cd hardware/raspberry-pi
python scripts/sface_rescue_scanner.py --config config.json --model-dir models --preview
```

When score is at least 60%, the scanner posts to:

```text
http://127.0.0.1:4173/api/pi/matches
```

The drone page polls this endpoint and updates the missing person status to found.

## Run YOLO drone-person detector

This uses Ultralytics YOLO with the requested settings:

```text
conf=0.25
imgsz=640
classes=[0,1]
```

Run:

```bash
cd hardware/raspberry-pi
python scripts/yolo_drone_person_detector.py --config config.json --preview
```

On this Windows machine, use the ready venv from the trained model project:

```powershell
cd C:\Users\Administrator\OneDrive\เดสก์ท็อป\drone2\hardware\raspberry-pi
.\run_yolo_detector.ps1
```

Or explicitly:

```bash
python scripts/yolo_drone_person_detector.py \
  --model "C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\models\drone_person_detector.pt" \
  --conf 0.25 \
  --imgsz 640 \
  --classes 0,1 \
  --server-url http://127.0.0.1:4173/api/yolo/detections \
  --preview
```

The drone page draws the raw YOLO bounding boxes from `/api/yolo/detections`.
