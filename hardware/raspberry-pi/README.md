# Raspberry Pi Trained Face AI

This folder is the real AI path for the drone page.

It uses OpenCV YuNet for face detection and OpenCV SFace for face recognition.
The browser page only displays results. The trained Python AI decides the match.
The SFace scanner sends every detected face in `faces[]`, so multiple people in
one camera frame can be drawn and reviewed together.

There is also an optional FaceNet path using MTCNN + InceptionResnetV1
(`facenet-pytorch`). This path supports multiple faces in one frame and sends
the original AI bounding boxes to the drone page through the same
`/api/pi/matches` endpoint.

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

Optional FaceNet install:

```bash
pip install -r requirements-facenet.txt
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

Optional FaceNet install on Windows:

```powershell
pip install -r requirements-facenet.txt
```

## Prepare training photos (Auto-collect from YOLO)

You can automatically collect face images using the YOLO person detector. This script finds people, crops them, and checks if a face is visible before saving.

```bash
python scripts/collect_faces_from_yolo.py --person-id HY-001 --camera-index 0
```

- Press **'s'** to save a single face.
- Press **'a'** to toggle **AUTO-SAVE** (saves every 0.5s when a face is found).
- Press **'q'** to quit.

Images will be saved to `data/faces/HY-001/`.

## Manual training layout

If you already have photos, put them in this layout:

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

## Train and run FaceNet multi-face scanner

FaceNet uses the same training photo layout:

```bash
python scripts/train_facenet_model.py --dataset data/faces --output models
```

The command creates:

```text
models/facenet_embeddings.npz
models/facenet_meta.json
models/web_facenet_db.json
```

Run the scanner:

```bash
python scripts/facenet_rescue_scanner.py --config config.json --model-dir models --preview
```

The scanner detects every face found by MTCNN in the frame, compares each face
against the FaceNet database, and posts one event containing `faces[]`. The drone
page draws each box from the original AI bbox with a simple detector-style
rectangle, without applying the browser-side compact face box transform.

On this Windows machine, use the ready venv from the trained model project:

```powershell
cd C:\Users\Administrator\OneDrive\เดสก์ท็อป\drone2\hardware\raspberry-pi
.\train_facenet_model.ps1
.\run_facenet_scanner.ps1
```

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

## Run YOLO flood-water level detector

This is separate from the drone control page. It uses an Ultralytics YOLO water/flood model to detect the water region or waterline, converts the detected line to centimeters using a simple image calibration, then posts events to:

```text
/api/yolo/water-level
```

Example config values:

```json
{
  "water_yolo_model_path": "models/flood_water_level.pt",
  "water_reference_height_cm": 200,
  "water_reference_top_y": 80,
  "water_reference_bottom_y": 460,
  "water_alert_cm": 80,
  "water_critical_cm": 120
}
```

Run:

```bash
cd hardware/raspberry-pi
python scripts/yolo_water_level_detector.py --config config.json --preview
```

On this Windows machine:

```powershell
cd C:\Users\Administrator\OneDrive\เดสก์ท็อป\drone2\hardware\raspberry-pi
.\run_water_level_detector.ps1
```

Open `water-level.html` on the public site and set the endpoint to `http://127.0.0.1:4173/api/yolo/water-level` or the Pi/server IP.
