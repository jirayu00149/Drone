#!/usr/bin/env python3
"""
Run real-time face matching with a trained OpenCV SFace database.

This script is the bridge from trained Python AI into the web UI:
  camera -> YuNet/SFace -> POST /api/pi/matches -> drone.html/admin.html
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Tuple

import cv2

from face_ai_common import (
    create_sface_recognizer,
    create_yunet_detector,
    detect_best_face,
    ensure_opencv_face_models,
    extract_sface_feature,
    load_sface_database,
    match_sface_feature,
)


DEFAULT_CONFIG: Dict[str, Any] = {
    "camera_index": 0,
    "frame_width": 1280,
    "frame_height": 720,
    "scan_interval_seconds": 0.6,
    "match_threshold_percent": 60,
    "detection_threshold": 0.18,
    "server_url": "http://127.0.0.1:4173/api/pi/matches",
    "gps": {
        "mode": "fixed",
        "fixed_lat": 7.0086,
        "fixed_lng": 100.4747,
    },
}


def load_config(path: str) -> Dict[str, Any]:
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    config_path = Path(path)
    if config_path.exists():
        user_config = json.loads(config_path.read_text(encoding="utf-8"))
        for key, value in user_config.items():
            if isinstance(value, dict) and isinstance(config.get(key), dict):
                config[key].update(value)
            else:
                config[key] = value
    return config


def get_gps(config: Dict[str, Any]) -> Tuple[float, float]:
    gps = config.get("gps", {})
    return float(gps.get("fixed_lat", 7.0086)), float(gps.get("fixed_lng", 100.4747))


def post_json(url: str, payload: Dict[str, Any]) -> None:
    if not url:
        return
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=2.5) as response:
            response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[warn] cannot post match: {exc}")


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def draw_preview(frame, detection, match, threshold: float) -> None:
    x, y, w, h = detection.bbox
    color = (46, 220, 255) if match["score"] < threshold else (80, 230, 120)
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
    text = f"{match['person_id']} {match['score']}%"
    cv2.putText(frame, text, (x, max(20, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)


def run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    model_dir = Path(args.model_dir).resolve()
    yunet_path, sface_path = ensure_opencv_face_models(model_dir / "opencv_zoo")
    detector = create_yunet_detector(yunet_path, score_threshold=float(config["detection_threshold"]))
    recognizer = create_sface_recognizer(sface_path)
    database = load_sface_database(model_dir)

    capture = cv2.VideoCapture(int(config["camera_index"]))
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, int(config["frame_width"]))
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, int(config["frame_height"]))
    if not capture.isOpened():
        raise RuntimeError("Cannot open camera. Check camera_index/cable/permission.")

    threshold = float(config["match_threshold_percent"])
    interval = float(config["scan_interval_seconds"])
    last_sent: Dict[str, float] = {}
    log_path = Path(args.log)

    print(f"SFace scanner started people={len(database)} threshold={threshold}%")
    print(f"Posting matches to: {config.get('server_url') or '(disabled)'}")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                print("[warn] camera read failed")
                time.sleep(interval)
                continue

            detection = detect_best_face(detector, frame)
            if detection is None:
                print("no face")
                if args.preview:
                    cv2.imshow("Hatyai SFace scanner", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                time.sleep(interval)
                continue

            feature = extract_sface_feature(recognizer, frame, detection.face)
            match = match_sface_feature(feature, database)
            if not match:
                print("no match")
                time.sleep(interval)
                continue

            lat, lng = get_gps(config)
            is_match = match["score"] >= threshold
            payload = {
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "device_id": args.device_id,
                "person_id": match["person_id"],
                "score": match["score"],
                "threshold": threshold,
                "is_match": is_match,
                "method": match["method"],
                "cosine": match["cosine"],
                "detector": f"YuNet {detection.pass_name}",
                "lat": lat,
                "lng": lng,
                "bbox": detection.bbox,
                "frame_width": int(frame.shape[1]),
                "frame_height": int(frame.shape[0]),
            }
            print(f"{payload['person_id']} score={payload['score']}% cosine={payload['cosine']} match={is_match} pass={detection.pass_name}")
            append_jsonl(log_path, payload)

            now = time.time()
            if is_match and now - last_sent.get(match["person_id"], 0) > args.resend_seconds:
                post_json(config.get("server_url", ""), payload)
                last_sent[match["person_id"]] = now

            if args.preview:
                draw_preview(frame, detection, match, threshold)
                cv2.imshow("Hatyai SFace scanner", frame)
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
    parser.add_argument("--model-dir", default="models")
    parser.add_argument("--log", default="logs/sface_matches.jsonl")
    parser.add_argument("--device-id", default="HY-PI-DRONE-01")
    parser.add_argument("--resend-seconds", type=float, default=20)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
