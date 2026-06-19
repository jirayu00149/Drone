#!/usr/bin/env python3
"""
Train a real face-recognition database using OpenCV YuNet + SFace.

Dataset layout:
  data/faces/<person_id>/*.jpg

Output:
  models/sface_embeddings.npz
  models/sface_meta.json
  models/web_face_db.json
  models/opencv_zoo/*.onnx
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import cv2
import numpy as np

from face_ai_common import (
    SFACE_COSINE_THRESHOLD,
    create_sface_recognizer,
    create_yunet_detector,
    detect_best_face,
    ensure_opencv_face_models,
    extract_sface_feature,
    save_sface_database,
)


IMAGE_EXTENSIONS = ("*.jpg", "*.jpeg", "*.png", "*.webp")


def iter_images(person_dir: Path) -> List[Path]:
    paths: List[Path] = []
    for pattern in IMAGE_EXTENSIONS:
        paths.extend(person_dir.glob(pattern))
    return sorted(paths)


def add_feature(
    detector,
    recognizer,
    image,
    embeddings: List[np.ndarray],
    source_name: str,
) -> bool:
    detection = detect_best_face(detector, image)
    if detection is None:
        print(f"[warn] no face: {source_name}")
        return False
    feature = extract_sface_feature(recognizer, image, detection.face)
    embeddings.append(feature)
    print(f"[ok] {source_name} pass={detection.pass_name} detector={detection.score:.2f}")
    return True


def train(args: argparse.Namespace) -> None:
    dataset_dir = Path(args.dataset).resolve()
    output_dir = Path(args.output).resolve()
    if not dataset_dir.exists():
        raise RuntimeError(f"Dataset folder not found: {dataset_dir}")

    yunet_path, sface_path = ensure_opencv_face_models(output_dir / "opencv_zoo")
    detector = create_yunet_detector(yunet_path, score_threshold=args.detection_threshold)
    recognizer = create_sface_recognizer(sface_path)

    embeddings_by_person: Dict[str, List[np.ndarray]] = {}
    sample_count = 0

    people = sorted([path for path in dataset_dir.iterdir() if path.is_dir()])
    if not people:
        raise RuntimeError(f"No person folders found in {dataset_dir}")

    for person_dir in people:
        person_id = person_dir.name
        embeddings_by_person[person_id] = []
        images = iter_images(person_dir)
        if not images:
            print(f"[warn] no images in {person_dir}")
            continue

        for image_path in images:
            # Use np.fromfile to safely read paths with non-ASCII characters on Windows
            image = cv2.imdecode(np.fromfile(str(image_path), np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                print(f"[warn] cannot read: {image_path}")
                continue
            if add_feature(detector, recognizer, image, embeddings_by_person[person_id], image_path.name):
                sample_count += 1
            if args.augment_flip:
                flipped = cv2.flip(image, 1)
                if add_feature(detector, recognizer, flipped, embeddings_by_person[person_id], f"{image_path.name}:flip"):
                    sample_count += 1

    embeddings_by_person = {person_id: values for person_id, values in embeddings_by_person.items() if values}
    if not embeddings_by_person:
        raise RuntimeError("No usable faces found. Add clear face photos in data/faces/<person_id>/")

    metadata = {
        "mode": "opencv_sface",
        "detector": "YuNet",
        "recognizer": "SFace",
        "cosine_threshold": SFACE_COSINE_THRESHOLD,
        "persons": sorted(embeddings_by_person),
        "samples": sample_count,
        "notes": [
            "Train creates embeddings, not a huge neural-network fine-tune.",
            "For rescue use, keep several clear photos per missing person.",
            "Run sface_rescue_scanner.py to send matches into the web UI.",
        ],
    }
    save_sface_database(output_dir, embeddings_by_person, metadata)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"saved model database to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/faces", help="data/faces/<person_id>/*.jpg")
    parser.add_argument("--output", default="models", help="model output folder")
    parser.add_argument("--detection-threshold", type=float, default=0.18, help="lower value helps small/distant faces")
    parser.add_argument("--augment-flip", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
