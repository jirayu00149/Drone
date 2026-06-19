#!/usr/bin/env python3
"""Run YOLO flood-water detection and post water-level events."""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

DEFAULT_CONFIG: Dict[str, Any] = {
    "camera_index": 0,
    "frame_width": 1280,
    "frame_height": 720,
    "water_yolo_model_path": "models/flood_water_level.pt",
    "water_yolo_conf": 0.25,
    "water_yolo_imgsz": 640,
    "water_yolo_classes": [],
    "water_yolo_labels": ["water", "flood", "flood-water"],
    "water_scan_interval_seconds": 0.5,
    "water_level_server_url": "http://127.0.0.1:4173/api/yolo/water-level",
    "water_ingest_token": "",
    "water_reference_height_cm": 200,
    "water_reference_top_y": 80,
    "water_reference_bottom_y": 640,
    "water_alert_cm": 80,
    "water_critical_cm": 120,
}


def load_config(path: str) -> Dict[str, Any]:
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    config_path = Path(path)
    if config_path.exists():
        config.update(json.loads(config_path.read_text(encoding="utf-8")))
    return config


def parse_classes(value: Any) -> Optional[List[int]]:
    if value is None or value == "":
        return None
    if isinstance(value, list):
        return [int(item) for item in value] if value else None
    classes = [int(item.strip()) for item in str(value).split(",") if item.strip()]
    return classes or None


def post_json(url: str, payload: Dict[str, Any], ingest_token: str = "") -> None:
    if not url:
        return
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if ingest_token:
        headers["X-Water-Ingest-Token"] = ingest_token
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=2.0) as response:
            response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[warn] cannot post water level: {exc}")


def class_matches(class_id: int, class_name: str, labels: Iterable[str], classes: Optional[List[int]]) -> bool:
    if classes is not None and class_id in classes:
        return True
    wanted = [str(item).lower() for item in labels]
    return not wanted or any(item in class_name.lower() for item in wanted)


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def severity(level_cm: Optional[float], alert_cm: float, critical_cm: float) -> str:
    if level_cm is None:
        return "unknown"
    if level_cm >= critical_cm:
        return "critical"
    if level_cm >= alert_cm:
        return "warning"
    if level_cm > 0:
        return "watch"
    return "normal"


def polygon_area(points: Optional[np.ndarray]) -> float:
    if points is None or len(points) < 3:
        return 0.0
    return float(abs(cv2.contourArea(points.astype(np.float32))))


def detections_from_result(result, labels: List[str], classes: Optional[List[int]]) -> List[Dict[str, Any]]:
    detections: List[Dict[str, Any]] = []
    names = result.names or {}
    boxes = result.boxes
    masks_xy = getattr(result.masks, "xy", None) if result.masks is not None else None
    if boxes is None:
        return detections

    for index, box in enumerate(boxes):
        class_id = int(box.cls[0].item())
        class_name = str(names.get(class_id, f"class {class_id}"))
        if not class_matches(class_id, class_name, labels, classes):
            continue

        confidence = float(box.conf[0].item())
        x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
        polygon = None
        if masks_xy is not None and index < len(masks_xy):
            polygon = np.asarray(masks_xy[index], dtype=np.float32)
        waterline_y = float(np.min(polygon[:, 1])) if polygon is not None and len(polygon) else y1
        area = polygon_area(polygon) if polygon is not None else max(0.0, x2 - x1) * max(0.0, y2 - y1)
        detections.append({
            "class_id": class_id,
            "class_name": class_name,
            "confidence": round(confidence, 4),
            "x": round(x1, 2),
            "y": round(y1, 2),
            "width": round(max(0.0, x2 - x1), 2),
            "height": round(max(0.0, y2 - y1), 2),
            "bbox": [round(x1, 2), round(y1, 2), round(max(0.0, x2 - x1), 2), round(max(0.0, y2 - y1), 2)],
            "waterline_y": round(waterline_y, 2),
            "area": round(area, 2),
            "source": "mask" if polygon is not None else "box",
        })
    return detections


def estimate_level(detections: List[Dict[str, Any]], top_y: float, bottom_y: float, height_cm: float) -> Tuple[Optional[float], Optional[float], Optional[float], float]:
    if not detections:
        return None, None, None, 0.0
    best = max(detections, key=lambda item: float(item.get("area", 0.0)) * max(0.01, float(item.get("confidence", 0.0))))
    waterline_y = float(best["waterline_y"])
    span = max(1.0, bottom_y - top_y)
    level_percent = clamp(((bottom_y - waterline_y) / span) * 100.0, 0.0, 100.0)
    level_cm = (level_percent / 100.0) * height_cm
    confidence = max(float(item.get("confidence", 0.0)) for item in detections)
    return waterline_y, level_cm, level_percent, confidence


def draw_preview(frame, detections: List[Dict[str, Any]], waterline_y: Optional[float], level_cm: Optional[float], state: str) -> None:
    for detection in detections:
        x = int(detection["x"])
        y = int(detection["y"])
        w = int(detection["width"])
        h = int(detection["height"])
        cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 180, 0), 2)
        label = f"{detection['class_name']} {int(detection['confidence'] * 100)}%"
        cv2.putText(frame, label, (x, max(18, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 220, 90), 2)
    if waterline_y is not None:
        y = int(waterline_y)
        cv2.line(frame, (0, y), (frame.shape[1], y), (255, 255, 255), 2)
    label = f"level={level_cm:.1f}cm severity={state}" if level_cm is not None else "water not detected"
    cv2.putText(frame, label, (16, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 240, 255), 2)


def run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    model_path = Path(args.model or config["water_yolo_model_path"]).expanduser()
    if not model_path.exists():
        raise FileNotFoundError(f"YOLO water model not found: {model_path}")

    conf = float(args.conf if args.conf is not None else config["water_yolo_conf"])
    imgsz = int(args.imgsz if args.imgsz is not None else config["water_yolo_imgsz"])
    classes = parse_classes(args.classes if args.classes is not None else config.get("water_yolo_classes"))
    labels = [str(item) for item in config.get("water_yolo_labels", [])]
    server_url = args.server_url or config.get("water_level_server_url") or "http://127.0.0.1:4173/api/yolo/water-level"
    ingest_token = args.ingest_token or config.get("water_ingest_token", "")
    interval = float(args.interval if args.interval is not None else config.get("water_scan_interval_seconds", 0.5))
    height_cm = float(args.reference_height_cm if args.reference_height_cm is not None else config.get("water_reference_height_cm", 200))
    top_y = float(args.reference_top_y if args.reference_top_y is not None else config.get("water_reference_top_y", 80))
    bottom_y = float(args.reference_bottom_y if args.reference_bottom_y is not None else config.get("water_reference_bottom_y", 640))
    alert_cm = float(args.alert_cm if args.alert_cm is not None else config.get("water_alert_cm", 80))
    critical_cm = float(args.critical_cm if args.critical_cm is not None else config.get("water_critical_cm", 120))

    model = YOLO(str(model_path))
    capture = cv2.VideoCapture(int(config["camera_index"]))
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, int(config["frame_width"]))
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, int(config["frame_height"]))
    if not capture.isOpened():
        raise RuntimeError("Cannot open camera. Check camera_index/cable/permission.")

    print(f"YOLO water-level detector started model={model_path}")
    print(f"posting to: {server_url}")
    print(f"calibration top_y={top_y} bottom_y={bottom_y} height_cm={height_cm}")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                print("[warn] camera read failed")
                time.sleep(interval)
                continue

            results = model.predict(frame, conf=conf, imgsz=imgsz, classes=classes, verbose=False)
            detections = detections_from_result(results[0], labels, classes) if results else []
            waterline_y, level_cm, level_percent, confidence = estimate_level(detections, top_y, bottom_y, height_cm)
            state = severity(level_cm, alert_cm, critical_cm)
            payload = {
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "device_id": args.device_id,
                "method": "ultralytics-yolo-water-level",
                "model_path": str(model_path),
                "conf": conf,
                "imgsz": imgsz,
                "frame_width": int(frame.shape[1]),
                "frame_height": int(frame.shape[0]),
                "waterline_y": round(waterline_y, 2) if waterline_y is not None else None,
                "level_cm": round(level_cm, 2) if level_cm is not None else None,
                "level_percent": round(level_percent, 2) if level_percent is not None else None,
                "reference_height_cm": height_cm,
                "alert_cm": alert_cm,
                "critical_cm": critical_cm,
                "severity": state,
                "confidence": round(confidence, 4),
                "detections": detections,
            }
            post_json(server_url, payload, ingest_token)
            print(f"water detections={len(detections)} level_cm={payload['level_cm']} severity={state}")

            if args.preview:
                draw_preview(frame, detections, waterline_y, level_cm, state)
                cv2.imshow("YOLO flood-water level", frame)
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
    parser.add_argument("--classes", default=None, help="Comma-separated water class ids, optional")
    parser.add_argument("--server-url", default="")
    parser.add_argument("--ingest-token", default="")
    parser.add_argument("--interval", type=float, default=None)
    parser.add_argument("--device-id", default="HY-WATER-01")
    parser.add_argument("--reference-height-cm", type=float, default=None)
    parser.add_argument("--reference-top-y", type=float, default=None)
    parser.add_argument("--reference-bottom-y", type=float, default=None)
    parser.add_argument("--alert-cm", type=float, default=None)
    parser.add_argument("--critical-cm", type=float, default=None)
    parser.add_argument("--preview", action="store_true")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
