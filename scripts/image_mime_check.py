#!/usr/bin/env python3
"""Fail if public image extensions disagree with file magic or OG size.

Dimension checks use PNG/JPEG headers only — no Pillow — so Vercel and CI
can run this after `astro build` without pip installing PIL.
"""

from __future__ import annotations

from pathlib import Path

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


def png_size(data: bytes) -> tuple[int, int] | None:
    if kind(data) != "png" or len(data) < 24 or data[12:16] != b"IHDR":
        return None
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    if kind(data) != "jpeg":
        return None
    index = 2
    length = len(data)
    while index + 9 <= length:
        if data[index] != 0xFF:
            return None
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if index + 2 > length:
            return None
        segment = int.from_bytes(data[index : index + 2], "big")
        if segment < 2:
            return None
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            if segment < 7 or index + 7 > length:
                return None
            height = int.from_bytes(data[index + 3 : index + 5], "big")
            width = int.from_bytes(data[index + 5 : index + 7], "big")
            return width, height
        index += segment
    return None


def image_size(data: bytes) -> tuple[int, int] | None:
    detected = kind(data)
    if detected == "png":
        return png_size(data)
    if detected == "jpeg":
        return jpeg_size(data)
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
        header = path.read_bytes()[:16]
        detected = kind(header)
        expected = {"png": "png", "jpg": "jpeg", "jpeg": "jpeg", "webp": "webp", "avif": "avif"}[ext.lstrip(".")]
        if detected != expected:
            errors.append(f"{path.relative_to(ROOT.parent)}: extension {ext} but file is {detected}")
            continue
        checked += 1
        if path.parent.name in OG_DIRS or path.name.startswith("og-image"):
            if "-480" in path.name or "-800" in path.name:
                continue
            payload = path.read_bytes()
            size = image_size(payload)
            if size is None:
                if detected in {"png", "jpeg"}:
                    errors.append(f"{path.relative_to(ROOT.parent)}: could not read pixel size")
                continue
            if size != (1200, 630):
                errors.append(f"{path.relative_to(ROOT.parent)}: {size}, expected 1200x630")
    print(f"[image-mime] checked {checked} files")
    for error in errors:
        print(f"[image-mime] ERROR: {error}")
    if errors:
        return 1
    print("[image-mime] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
