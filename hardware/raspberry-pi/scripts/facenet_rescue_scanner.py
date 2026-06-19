#!/usr/bin/env python3
"""
Run real-time multi-face matching with a trained FaceNet database.

This script bridges Python AI into the web UI:
  camera -> MTCNN/FaceNet -> POST /api/pi/matches -> drone/index.html
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2

from facenet_ai_common import (
    FACENET_SIMILARITY_THRESHOLD,
    create_facenet_models,
    detect_facenet_faces,
    image_from_bgr,
    load_facenet_database,
    match_facenet_feature,
    select_device,
)


DEFAULT_CONFIG: Dict[str, Any] = {
    "camera_index": 0,
    "frame_width": 1280,
    "frame_height": 720,
    "scan_interval_seconds": 0.6,
    "match_threshold_percent": 60,
    "facenet_similarity_threshold": FACENET_SIMILARITY_THRESHOLD,
    "min_face_size": 40,
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
        print(f"[warn] cannot post FaceNet match: {exc}")


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def draw_preview(frame, face_events: List[Dict[str, Any]], threshold: float) -> None:
    for face_event in face_events:
        left, top, width, height = [int(value) for value in face_event["bbox"]]
        color = (46, 220, 255) if face_event["score"] < threshold else (80, 230, 120)
        cv2.rectangle(frame, (left, top), (left + width, top + height), color, 2)
        text = f"{face_event['person_id']} {face_event['score']}%"
        cv2.putText(frame, text, (left, max(20, top - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)


def build_face_events(
    faces,
    database,
    similarity_threshold: float,
    match_threshold_percent: float,
    lat: float,
    lng: float,
    frame_width: int,
    frame_height: int,
) -> List[Dict[str, Any]]:
    face_events: List[Dict[str, Any]] = []
    for face_index, face in enumerate(faces, start=1):
        match = match_facenet_feature(face.embedding, database, threshold=similarity_threshold)
        if not match:
            continue
        is_match = match["score"] >= match_threshold_percent
        face_events.append(
            {
                "face_index": face_index,
                "person_id": match["person_id"],
                "score": match["score"],
                "threshold": match_threshold_percent,
                "similarity_threshold": similarity_threshold,
                "is_match": is_match,
                "method": "facenet_pytorch",
                "similarity": match["similarity"],
                "detector": f"MTCNN face {face_index}",
                "detection_confidence": round(face.detection_confidence, 4),
                "lat": lat,
                "lng": lng,
                "bbox": list(face.bbox),
                "frame_width": frame_width,
                "frame_height": frame_height,
            }
        )
    return face_events


def run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    model_dir = Path(args.model_dir).resolve()
    device = select_device(args.device)
    detector, embedder = create_facenet_models(device, min_face_size=int(config["min_face_size"]))
    database = load_facenet_database(model_dir)

    capture = cv2.VideoCapture(int(config["camera_index"]))
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, int(config["frame_width"]))
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, int(config["frame_height"]))
    if not capture.isOpened():
        raise RuntimeError("Cannot open camera. Check camera_index/cable/permission.")

    match_threshold = float(config["match_threshold_percent"])
    similarity_threshold = float(config.get("facenet_similarity_threshold", FACENET_SIMILARITY_THRESHOLD))
    interval = float(config["scan_interval_seconds"])
    last_sent: Dict[str, float] = {}
    log_path = Path(args.log)

    print(f"FaceNet scanner started people={len(database)} threshold={match_threshold}% device={device}")
    print(f"Posting matches to: {config.get('server_url') or '(disabled)'}")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                print("[warn] camera read failed")
                time.sleep(interval)
                continue

            image = image_from_bgr(frame)
            faces = detect_facenet_faces(detector, embedder, image, device)
            if not faces:
                print("no face")
                if args.preview:
                    cv2.imshow("Hatyai FaceNet scanner", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                time.sleep(interval)
                continue

            lat, lng = get_gps(config)
            frame_height, frame_width = frame.shape[:2]
            face_events = build_face_events(
                faces,
                database,
                similarity_threshold,
                match_threshold,
                lat,
                lng,
                frame_width,
                frame_height,
            )
            if not face_events:
                print(f"faces={len(faces)} no database match")
                time.sleep(interval)
                continue

            best = max(face_events, key=lambda item: item["score"])
            payload = {
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "device_id": args.device_id,
                "person_id": best["person_id"],
                "score": best["score"],
                "threshold": match_threshold,
                "is_match": any(item["is_match"] for item in face_events),
                "method": "facenet_pytorch",
                "similarity": best["similarity"],
                "detector": "MTCNN multi-face",
                "lat": lat,
                "lng": lng,
                "bbox": best["bbox"],
                "frame_width": frame_width,
                "frame_height": frame_height,
                "faces": face_events,
            }
            append_jsonl(log_path, payload)

            summary = ", ".join(
                f"face{item['face_index']}={item['person_id']} {item['score']}%" for item in face_events
            )
            print(f"faces={len(face_events)} best={best['person_id']} {best['score']}% matches=[{summary}]")

            now = time.time()
            should_post = args.post_candidates or payload["is_match"]
            recent_key = "|".join(sorted(item["person_id"] for item in face_events if item["is_match"])) or "candidate"
            if should_post and now - last_sent.get(recent_key, 0) > args.resend_seconds:
                post_json(config.get("server_url", ""), payload)
                last_sent[recent_key] = now

            if args.preview:
                draw_preview(frame, face_events, match_threshold)
                cv2.imshow("Hatyai FaceNet scanner", frame)
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
    parser.add_argument("--log", default="logs/facenet_matches.jsonl")
    parser.add_argument("--device-id", default="HY-PI-DRONE-01")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--resend-seconds", type=float, default=20)
    parser.add_argument("--post-candidates", action="store_true")
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
