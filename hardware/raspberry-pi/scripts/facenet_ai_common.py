#!/usr/bin/env python3
"""Shared FaceNet utilities for training and drone-side face matching."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from facenet_pytorch import InceptionResnetV1, MTCNN
from PIL import Image


IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp")
FACENET_SIMILARITY_THRESHOLD = 0.65


@dataclass(frozen=True)
class FaceNetFace:
    bbox: Tuple[int, int, int, int]
    detection_confidence: float
    embedding: np.ndarray

    @property
    def area(self) -> int:
        return max(0, self.bbox[2]) * max(0, self.bbox[3])


def select_device(value: str) -> torch.device:
    if value == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if value == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false.")
    return torch.device(value)


def create_facenet_models(
    device: torch.device,
    min_face_size: int = 40,
) -> Tuple[MTCNN, InceptionResnetV1]:
    detector = MTCNN(
        image_size=160,
        margin=20,
        min_face_size=int(min_face_size),
        thresholds=[0.6, 0.7, 0.7],
        keep_all=True,
        post_process=True,
        device=device,
    )
    embedder = InceptionResnetV1(pretrained="vggface2").eval().to(device)
    return detector, embedder


def l2_normalize(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    if values.ndim == 1:
        values = values.reshape(1, -1)
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    return values / np.clip(norms, 1e-12, None)


def image_from_bgr(frame: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGB")


def read_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return Image.open(path).convert("RGB")


def detect_facenet_faces(
    detector: MTCNN,
    embedder: InceptionResnetV1,
    image: Image.Image,
    device: torch.device,
) -> List[FaceNetFace]:
    rgb_image = image.convert("RGB")
    boxes, probabilities = detector.detect(rgb_image)
    if boxes is None or probabilities is None:
        return []

    face_tensors = detector.extract(rgb_image, boxes, save_path=None)
    if face_tensors is None:
        return []
    if face_tensors.ndim == 3:
        face_tensors = face_tensors.unsqueeze(0)

    with torch.no_grad():
        embeddings = embedder(face_tensors.to(device)).cpu().numpy().astype(np.float32)

    faces: List[FaceNetFace] = []
    for box, probability, embedding in zip(boxes, probabilities, l2_normalize(embeddings)):
        x1, y1, x2, y2 = [int(round(float(value))) for value in box.tolist()]
        faces.append(
            FaceNetFace(
                bbox=(x1, y1, max(1, x2 - x1), max(1, y2 - y1)),
                detection_confidence=float(probability),
                embedding=embedding,
            )
        )
    return faces


def pick_largest_face(faces: List[FaceNetFace]) -> Optional[FaceNetFace]:
    return max(faces, key=lambda face: face.area) if faces else None


def cosine_similarity(vector_a: np.ndarray, vector_b: np.ndarray) -> float:
    vector_a = np.asarray(vector_a, dtype=np.float32).reshape(-1)
    vector_b = np.asarray(vector_b, dtype=np.float32).reshape(-1)
    return float(
        np.dot(vector_a, vector_b)
        / ((np.linalg.norm(vector_a) or 1.0) * (np.linalg.norm(vector_b) or 1.0))
    )


def similarity_to_percent(similarity: float, threshold: float = FACENET_SIMILARITY_THRESHOLD) -> float:
    if similarity >= threshold:
        score = 60.0 + ((similarity - threshold) / max(1e-6, 1.0 - threshold)) * 40.0
    else:
        score = (max(0.0, similarity) / max(1e-6, threshold)) * 60.0
    return round(max(0.0, min(100.0, score)), 2)


def save_facenet_database(output_dir: Path, embeddings_by_person: Dict[str, List[np.ndarray]], metadata: Dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    arrays = {
        person_id: np.vstack(embeddings).astype(np.float32)
        for person_id, embeddings in embeddings_by_person.items()
        if embeddings
    }
    if not arrays:
        raise RuntimeError("No embeddings to save")

    np.savez_compressed(output_dir / "facenet_embeddings.npz", **arrays)
    (output_dir / "facenet_meta.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    web_export = {
        "mode": "facenet_pytorch",
        "persons": [
            {"person_id": person_id, "samples": int(arrays[person_id].shape[0])}
            for person_id in sorted(arrays)
        ],
        "similarity_threshold": FACENET_SIMILARITY_THRESHOLD,
        "note": "Use facenet_rescue_scanner.py for inference; browser receives matches through /api/pi/matches.",
    }
    (output_dir / "web_facenet_db.json").write_text(json.dumps(web_export, ensure_ascii=False, indent=2), encoding="utf-8")


def load_facenet_database(model_dir: Path) -> Dict[str, np.ndarray]:
    path = model_dir / "facenet_embeddings.npz"
    if not path.exists():
        raise RuntimeError(f"Missing {path}. Run train_facenet_model.py first.")
    npz = np.load(path)
    return {key: np.asarray(npz[key], dtype=np.float32) for key in npz.files}


def match_facenet_feature(
    feature: np.ndarray,
    database: Dict[str, np.ndarray],
    threshold: float = FACENET_SIMILARITY_THRESHOLD,
) -> Optional[Dict]:
    best = None
    for person_id, embeddings in database.items():
        similarities = [cosine_similarity(feature, row) for row in embeddings]
        similarity = max(similarities) if similarities else -1.0
        score = similarity_to_percent(similarity, threshold)
        if best is None or score > best["score"]:
            best = {
                "person_id": person_id,
                "score": score,
                "similarity": round(similarity, 5),
                "method": "facenet_pytorch",
            }
    return best
