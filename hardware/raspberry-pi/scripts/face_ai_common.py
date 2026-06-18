#!/usr/bin/env python3
"""Shared OpenCV YuNet + SFace utilities for training and scanning."""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import cv2
import numpy as np


YUNET_URL = "https://cdn.jsdelivr.net/gh/opencv/opencv_zoo@main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://cdn.jsdelivr.net/gh/opencv/opencv_zoo@main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
YUNET_NAME = "face_detection_yunet_2023mar.onnx"
SFACE_NAME = "face_recognition_sface_2021dec.onnx"
SCAN_SIZE = (640, 640)
SFACE_COSINE_THRESHOLD = 0.363


@dataclass(frozen=True)
class ScanPass:
    name: str
    x: float
    y: float
    w: float
    h: float


@dataclass
class FaceDetection:
    face: np.ndarray
    bbox: Tuple[int, int, int, int]
    score: float
    pass_name: str


SCAN_PASSES: Tuple[ScanPass, ...] = (
    ScanPass("full frame", 0.0, 0.0, 1.0, 1.0),
    ScanPass("center zoom 1.8x", 0.22, 0.12, 0.56, 0.76),
    ScanPass("center zoom 2.7x", 0.31, 0.20, 0.38, 0.52),
    ScanPass("upper body zoom", 0.18, 0.04, 0.64, 0.62),
    ScanPass("left distance crop", 0.02, 0.08, 0.48, 0.72),
    ScanPass("right distance crop", 0.50, 0.08, 0.48, 0.72),
    ScanPass("top distance crop", 0.20, 0.00, 0.60, 0.55),
)


def download_file(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 100_000:
        return
    print(f"[download] {url}")
    with urllib.request.urlopen(url, timeout=60) as response:
        path.write_bytes(response.read())


def ensure_opencv_face_models(model_cache: Path) -> Tuple[Path, Path]:
    model_cache.mkdir(parents=True, exist_ok=True)
    yunet_path = model_cache / YUNET_NAME
    sface_path = model_cache / SFACE_NAME
    download_file(YUNET_URL, yunet_path)
    download_file(SFACE_URL, sface_path)
    return yunet_path, sface_path


def create_yunet_detector(yunet_path: Path, score_threshold: float = 0.22):
    return cv2.FaceDetectorYN_create(
        str(yunet_path),
        "",
        SCAN_SIZE,
        float(score_threshold),
        0.30,
        5000,
    )


def create_sface_recognizer(sface_path: Path):
    return cv2.FaceRecognizerSF_create(str(sface_path), "")


def crop_for_pass(frame: np.ndarray, scan_pass: ScanPass) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    height, width = frame.shape[:2]
    x0 = int(width * scan_pass.x)
    y0 = int(height * scan_pass.y)
    cw = max(1, int(width * scan_pass.w))
    ch = max(1, int(height * scan_pass.h))
    x0 = max(0, min(width - 1, x0))
    y0 = max(0, min(height - 1, y0))
    cw = min(cw, width - x0)
    ch = min(ch, height - y0)
    crop = frame[y0 : y0 + ch, x0 : x0 + cw]
    resized = cv2.resize(crop, SCAN_SIZE, interpolation=cv2.INTER_LINEAR)
    return resized, (x0, y0, cw, ch)


def map_face_to_frame(face: np.ndarray, crop_rect: Tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, cw, ch = crop_rect
    sx = cw / SCAN_SIZE[0]
    sy = ch / SCAN_SIZE[1]
    mapped = face.astype(np.float32).copy()
    mapped[0] = x0 + mapped[0] * sx
    mapped[1] = y0 + mapped[1] * sy
    mapped[2] = mapped[2] * sx
    mapped[3] = mapped[3] * sy
    for index in range(4, 14, 2):
        mapped[index] = x0 + mapped[index] * sx
        mapped[index + 1] = y0 + mapped[index + 1] * sy
    return mapped


def detect_best_face(detector, frame: np.ndarray) -> Optional[FaceDetection]:
    best: Optional[FaceDetection] = None
    for scan_pass in SCAN_PASSES:
        scan_image, crop_rect = crop_for_pass(frame, scan_pass)
        detector.setInputSize(SCAN_SIZE)
        _, faces = detector.detect(scan_image)
        if faces is None or len(faces) == 0:
            continue
        for face in faces:
            mapped = map_face_to_frame(face, crop_rect)
            x, y, w, h = mapped[:4]
            score = float(mapped[14]) if len(mapped) > 14 else 0.0
            area = max(1.0, float(w * h))
            rank = score * 10_000.0 + area
            if best is None or rank > best.score * 10_000.0 + best.bbox[2] * best.bbox[3]:
                best = FaceDetection(
                    face=mapped,
                    bbox=(int(x), int(y), int(w), int(h)),
                    score=score,
                    pass_name=scan_pass.name,
                )
    return best


def l2_normalize(vector: np.ndarray) -> np.ndarray:
    vector = np.asarray(vector, dtype=np.float32).reshape(-1)
    norm = np.linalg.norm(vector) or 1.0
    return vector / norm


def extract_sface_feature(recognizer, frame: np.ndarray, face: np.ndarray) -> np.ndarray:
    aligned = recognizer.alignCrop(frame, face)
    feature = recognizer.feature(aligned)
    return l2_normalize(feature)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / ((np.linalg.norm(a) or 1.0) * (np.linalg.norm(b) or 1.0)))


def cosine_to_percent(cosine: float, threshold: float = SFACE_COSINE_THRESHOLD) -> float:
    if cosine >= threshold:
        score = 60.0 + ((cosine - threshold) / max(1e-6, 1.0 - threshold)) * 40.0
    else:
        score = (cosine / max(1e-6, threshold)) * 60.0
    return round(max(0.0, min(100.0, score)), 2)


def save_sface_database(output_dir: Path, embeddings_by_person: Dict[str, List[np.ndarray]], metadata: Dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    arrays = {person_id: np.vstack(embeddings).astype(np.float32) for person_id, embeddings in embeddings_by_person.items() if embeddings}
    if not arrays:
        raise RuntimeError("No embeddings to save")
    np.savez_compressed(output_dir / "sface_embeddings.npz", **arrays)
    (output_dir / "sface_meta.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    web_export = {
        "mode": "opencv_sface",
        "persons": [
            {"person_id": person_id, "samples": int(arrays[person_id].shape[0])}
            for person_id in sorted(arrays)
        ],
        "cosine_threshold": SFACE_COSINE_THRESHOLD,
        "note": "Use sface_rescue_scanner.py for inference; browser receives matches through /api/pi/matches.",
    }
    (output_dir / "web_face_db.json").write_text(json.dumps(web_export, ensure_ascii=False, indent=2), encoding="utf-8")


def load_sface_database(model_dir: Path) -> Dict[str, np.ndarray]:
    path = model_dir / "sface_embeddings.npz"
    if not path.exists():
        raise RuntimeError(f"Missing {path}. Run train_sface_model.py first.")
    npz = np.load(path)
    return {key: np.asarray(npz[key], dtype=np.float32) for key in npz.files}


def match_sface_feature(feature: np.ndarray, database: Dict[str, np.ndarray]) -> Optional[Dict]:
    best = None
    for person_id, embeddings in database.items():
        similarities = [cosine_similarity(feature, row) for row in embeddings]
        cosine = max(similarities) if similarities else -1.0
        score = cosine_to_percent(cosine)
        if best is None or score > best["score"]:
            best = {
                "person_id": person_id,
                "score": score,
                "cosine": round(cosine, 5),
                "method": "opencv_sface",
            }
    return best
