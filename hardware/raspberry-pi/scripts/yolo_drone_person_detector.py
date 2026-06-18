#!/usr/bin/env python3
"""
Run the trained VisDrone YOLO person detector and send raw YOLO boxes to the drone page.

Flow:
  camera -> Ultralytics YOLO -> POST /api/yolo/detections -> drone/index.html
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import cv2
from ultralytics import YOLO


DEFAULT_MODEL_PATH = r"C:\Users\Administrator\Documents\Codex\2026-06-18\ai\outputs\face_scan_ai\models\drone_person_detector.pt"

DEFAULT_CONFIG: Dict[str, Any] = {
    "camera_index": 0,
    "frame_width": 1280,
    "frame_height": 720,
    "yolo_model_path": DEFAULT_MODEL_PATH,
    "yolo_conf": 0.25,
    "yolo_imgsz": 640,
    "yolo_classes": [0, 1],
    "yolo_scan_interval_seconds": 0.12,
    "yolo_server_url": "http://127.0.0.1:4173/api/yolo/detections",
}


def load_config(path: str) -> Dict[str, Any]:
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    config_path = Path(path)
    if config_path.exists():
        user_config = json.loads(config_path.read_text(encoding="utf-8"))
        for key, value in user_config.items():
            config[key] = value
    return config


def parse_classes(value: Any) -> List[int]:
    if value is None or value == "":
        return [0, 1]
    if isinstance(value, list):
        return [int(item) for item in value]
    return [int(item.strip()) for item in str(value).split(",") if item.strip()]


def post_json(url: str, payload: Dict[str, Any]) -> None:
    if not url:
        return
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=2.0) as response:
            response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[warn] cannot post YOLO detections: {exc}")


def detections_from_result(result) -> List[Dict[str, Any]]:
    detections: List[Dict[str, Any]] = []
    names = result.names or {}
    boxes = result.boxes
    if boxes is None:
        return detections

    for box in boxes:
        xyxy = box.xyxy[0].tolist()
        x1, y1, x2, y2 = [float(value) for value in xyxy]
        class_id = int(box.cls[0].item())
        confidence = float(box.conf[0].item())
        detections.append(
            {
                "class_id": class_id,
                "class_name": str(names.get(class_id, f"class {class_id}")),
                "confidence": round(confidence, 4),
                "x": round(x1, 2),
                "y": round(y1, 2),
                "width": round(max(0.0, x2 - x1), 2),
                "height": round(max(0.0, y2 - y1), 2),
                "bbox": [round(x1, 2), round(y1, 2), round(max(0.0, x2 - x1), 2), round(max(0.0, y2 - y1), 2)],
            }
        )
    return detections


def draw_preview(frame, detections: List[Dict[str, Any]]) -> None:
    for detection in detections:
        x = int(detection["x"])
        y = int(detection["y"])
        w = int(detection["width"])
        h = int(detection["height"])
        class_id = int(detection["class_id"])
        color = (0, 255, 102) if class_id == 0 else (74, 216, 255)
        label = f"{detection['class_name']} {int(detection['confidence'] * 100)}%"
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        cv2.putText(frame, label, (x, max(18, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)


def run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    model_path = Path(args.model or config["yolo_model_path"]).expanduser()
    if not model_path.exists():
        raise FileNotFoundError(f"YOLO model not found: {model_path}")

    conf = float(args.conf if args.conf is not None else config["yolo_conf"])
    imgsz = int(args.imgsz if args.imgsz is not None else config["yolo_imgsz"])
    classes = parse_classes(args.classes if args.classes is not None else config.get("yolo_classes", [0, 1]))
    server_url = args.server_url or config.get("yolo_server_url") or "http://127.0.0.1:4173/api/yolo/detections"
    interval = float(args.interval if args.interval is not None else config.get("yolo_scan_interval_seconds", 0.12))

    model = YOLO(str(model_path))
    capture = cv2.VideoCapture(int(config["camera_index"]))
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, int(config["frame_width"]))
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, int(config["frame_height"]))
    if not capture.isOpened():
        raise RuntimeError("Cannot open camera. Check camera_index/cable/permission.")

    print(f"YOLO detector started model={model_path}")
    print(f"conf={conf} imgsz={imgsz} classes={classes}")
    print(f"Posting detections to: {server_url}")

    try:
      while True:
        ok, frame = capture.read()
        if not ok:
            print("[warn] camera read failed")
            time.sleep(interval)
            continue

        results = model.predict(frame, conf=conf, imgsz=imgsz, classes=classes, verbose=False)
        detections = detections_from_result(results[0]) if results else []
        payload = {
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "device_id": args.device_id,
            "method": "ultralytics-yolo-visdrone",
            "model_path": str(model_path),
            "conf": conf,
            "imgsz": imgsz,
            "classes": classes,
            "frame_width": int(frame.shape[1]),
            "frame_height": int(frame.shape[0]),
            "detections": detections,
        }
        post_json(server_url, payload)
        print(f"YOLO detections={len(detections)}")

        if args.preview:
            draw_preview(frame, detections)
            cv2.imshow("YOLO drone person detector", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        time.sleep(interval)
    finally:
        capture.release()
        if args.preview:
            cv2.destroyAllWindows()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--model", default="")
    parser.add_argument("--conf", type=float, default=None)
    parser.add_argument("--imgsz", type=int, default=None)
    parser.add_argument("--classes", default=None, help="Comma-separated class ids, e.g. 0,1")
    parser.add_argument("--server-url", default="")
    parser.add_argument("--interval", type=float, default=None)
    parser.add_argument("--device-id", default="HY-PI-DRONE-01")
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
