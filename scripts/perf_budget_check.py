#!/usr/bin/env python3
"""Fail the build if homepage JS still ships jsPDF or duplicate Tailwind CSS."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = [
    ROOT / ".vercel" / "output" / "static" / "index.html",
    ROOT / "dist" / "client" / "index.html",
    ROOT / "dist" / "index.html",
]


def main() -> int:
    html_path = next((p for p in CANDIDATES if p.exists()), None)
    if not html_path:
        print("[perf] homepage HTML not found; run astro build first")
        return 1

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    errors: list[str] = []

    script_srcs = re.findall(r'<script[^>]+src="([^"]+)"', html)
    if any("jspdf" in src.lower() for src in script_srcs):
        errors.append("homepage script tags include jspdf (should be dynamically imported)")

    css_hrefs = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    css_hrefs += re.findall(r'<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"', html)
    if len(css_hrefs) > 2:
        errors.append(f"homepage has {len(css_hrefs)} stylesheets: {css_hrefs}")

    print(f"[perf] {html_path.relative_to(ROOT)}")
    print(f"[perf] scripts={len(script_srcs)} stylesheets={len(css_hrefs)}")
    for href in css_hrefs:
        print(f"[perf] css {href}")
    for src in script_srcs:
        print(f"[perf] js  {src}")

    for error in errors:
        print(f"[perf] ERROR: {error}")
    if errors:
        return 1
    print("[perf] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
