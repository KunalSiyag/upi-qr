#!/usr/bin/env python3
"""Fail if public image extensions disagree with file magic or OG size."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "images"
OG_DIRS = {"blog", "diagrams", "print-formats"}


def kind(data: bytes) -> str | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:2] == b"\xff\xd8":
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if len(data) > 8 and data[4:8] == b"ftyp":
        return "avif"
    return None


def main() -> int:
    errors = []
    checked = 0
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in {".png", ".jpg", ".jpeg", ".webp", ".avif"}:
            continue
        if path.parent.name == "template" and ext in {".png"}:
            # Full-size poster masters; thumbs are webp/avif.
            continue
        data = path.read_bytes()[:16]
        detected = kind(data)
        expected = {"png": "png", "jpg": "jpeg", "jpeg": "jpeg", "webp": "webp", "avif": "avif"}[ext.lstrip(".")]
        if detected != expected:
            errors.append(f"{path.relative_to(ROOT.parent)}: extension {ext} but file is {detected}")
            continue
        checked += 1
        if path.parent.name in OG_DIRS or path.name.startswith("og-image"):
            if "-480" in path.name or "-800" in path.name:
                continue
            with Image.open(path) as im:
                if im.size != (1200, 630):
                    errors.append(f"{path.relative_to(ROOT.parent)}: {im.size}, expected 1200x630")
    print(f"[image-mime] checked {checked} files")
    for error in errors:
        print(f"[image-mime] ERROR: {error}")
    if errors:
        return 1
    print("[image-mime] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
