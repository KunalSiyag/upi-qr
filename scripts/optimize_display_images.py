#!/usr/bin/env python3
"""Compress affiliate product photos and emit WebP/AVIF display variants."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "images"

PRODUCTS = [
    ("product-acrylic.png", 520),
    ("product-printer.png", 640),
    ("product-wooden.png", 520),
    ("product-waterproof-stickers.png", 520),
    ("product-table-tent.png", 520),
    ("product-thermal-rolls.png", 520),
    ("product-a5-stand.png", 520),
    ("product-magnetic-sticker.png", 520),
    ("product-payment-speaker.png", 520),
    ("product-a4-frame.png", 520),
    ("product-cab-holder.png", 520),
    ("product-sunboard.png", 520),
]


def save_raster(im: Image.Image, dest: Path, quality: int = 82) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    suffix = dest.suffix.lower()
    if suffix == ".webp":
        rgb.save(dest, "WEBP", quality=quality, method=6)
    elif suffix == ".avif":
        rgb.save(dest, "AVIF", quality=quality)
    elif suffix == ".jpg":
        rgb.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)
    else:
        im.save(dest, "PNG", optimize=True)


def fit(im: Image.Image, max_edge: int) -> Image.Image:
    w, h = im.size
    longest = max(w, h)
    if longest <= max_edge:
        return im
    scale = max_edge / longest
    return im.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)


def main() -> None:
    for name, max_edge in PRODUCTS:
        src = ROOT / name
        im = Image.open(src)
        fitted = fit(im, max_edge)
        stem = src.with_suffix("")
        save_raster(fitted, Path(f"{stem}.webp"))
        save_raster(fitted, Path(f"{stem}.avif"))
        thumb = fit(im, 480)
        save_raster(thumb, Path(f"{stem}-480.webp"))
        save_raster(thumb, Path(f"{stem}-480.avif"))
        print(f"[opt] {name} {im.size} -> display {fitted.size}")

    og_png = ROOT / "og-image.png"
    if og_png.exists():
        with Image.open(og_png) as im:
            rgb = im.convert("RGB")
            rgb.save(ROOT / "og-image.jpg", "JPEG", quality=86, optimize=True, progressive=True)
            print(f"[opt] og-image.png {im.size} ({og_png.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
