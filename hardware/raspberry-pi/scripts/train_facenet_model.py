#!/usr/bin/env python3
"""
Train a FaceNet embedding database from consented face photos.

Dataset layout:
  data/faces/<person_id>/*.jpg

Output:
  models/facenet_embeddings.npz
  models/facenet_meta.json
  models/web_facenet_db.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import numpy as np
from PIL import ImageOps

from facenet_ai_common import (
    FACENET_SIMILARITY_THRESHOLD,
    IMAGE_EXTENSIONS,
    create_facenet_models,
    detect_facenet_faces,
    pick_largest_face,
    read_image,
    save_facenet_database,
    select_device,
)


def iter_images(person_dir: Path) -> List[Path]:
    paths: List[Path] = []
    for pattern in IMAGE_EXTENSIONS:
        paths.extend(person_dir.glob(pattern))
    return sorted(paths)


def add_embedding(
    detector,
    embedder,
    device,
    image_path: Path,
    embeddings: List[np.ndarray],
    source_name: str,
) -> bool:
    try:
        image = read_image(image_path)
    except OSError as exc:
        print(f"[warn] cannot read {source_name}: {exc}")
        return False

    faces = detect_facenet_faces(detector, embedder, image, device)
    face = pick_largest_face(faces)
    if face is None:
        print(f"[warn] no face: {source_name}")
        return False

    embeddings.append(face.embedding)
    print(f"[ok] {source_name} detector={face.detection_confidence:.3f}")
    return True


def add_flipped_embedding(
    detector,
    embedder,
    device,
    image_path: Path,
    embeddings: List[np.ndarray],
    source_name: str,
) -> bool:
    try:
        image = ImageOps.mirror(read_image(image_path))
    except OSError as exc:
        print(f"[warn] cannot read {source_name}: {exc}")
        return False

    faces = detect_facenet_faces(detector, embedder, image, device)
    face = pick_largest_face(faces)
    if face is None:
        print(f"[warn] no face: {source_name}")
        return False

    embeddings.append(face.embedding)
    print(f"[ok] {source_name} detector={face.detection_confidence:.3f}")
    return True


def train(args: argparse.Namespace) -> None:
    dataset_dir = Path(args.dataset).resolve()
    output_dir = Path(args.output).resolve()
    if not dataset_dir.exists():
        raise RuntimeError(f"Dataset folder not found: {dataset_dir}")

    device = select_device(args.device)
    detector, embedder = create_facenet_models(device, min_face_size=args.min_face_size)
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
            if add_embedding(detector, embedder, device, image_path, embeddings_by_person[person_id], image_path.name):
                sample_count += 1
            if args.augment_flip and add_flipped_embedding(
                detector,
                embedder,
                device,
                image_path,
                embeddings_by_person[person_id],
                f"{image_path.name}:flip",
            ):
                sample_count += 1

    embeddings_by_person = {person_id: values for person_id, values in embeddings_by_person.items() if values}
    if not embeddings_by_person:
        raise RuntimeError("No usable faces found. Add clear face photos in data/faces/<person_id>/")

    metadata = {
        "mode": "facenet_pytorch",
        "detector": "MTCNN",
        "embedding_model": "InceptionResnetV1(vggface2)",
        "similarity_threshold": FACENET_SIMILARITY_THRESHOLD,
        "persons": sorted(embeddings_by_person),
        "samples": sample_count,
        "device": str(device),
        "notes": [
            "Training creates FaceNet embeddings, not a full neural-network fine-tune.",
            "Keep several clear consented photos per missing person for better matching.",
            "Run facenet_rescue_scanner.py to send matches into the drone web UI.",
        ],
    }
    save_facenet_database(output_dir, embeddings_by_person, metadata)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"saved FaceNet database to {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/faces", help="data/faces/<person_id>/*.jpg")
    parser.add_argument("--output", default="models", help="model output folder")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--min-face-size", type=int, default=40)
    parser.add_argument("--augment-flip", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
