#!/usr/bin/env python3
"""Fail the build if homepage JS still ships jsPDF or duplicate Tailwind CSS,
or if any public page loads the Clerk browser SDK (see ClerkClient.astro)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = [
    ROOT / ".vercel" / "output" / "static" / "index.html",
    ROOT / "dist" / "client" / "index.html",
    ROOT / "dist" / "index.html",
]


# Pages allowed to load Clerk: the dynamic QR tool and the noindex /app/
# workspace keep a signed-in session alive. Sign-in, sign-up, and dashboard
# are server-rendered and not scanned.
CLERK_ALLOWED = re.compile(r"(^|/)(dynamic-qr-generator|app)/index\.html$")
CLERK_MARKER = re.compile(r"@clerk/|clerk\.browser\.js")
JS_REF = re.compile(r"""(?:from|import)\s*\(?\s*["'`](\.{1,2}/[^"'`]+?\.js)["'`]""")
HTML_JS_REF = re.compile(
    r"""(?:<script[^>]+src|<link[^>]+href|component-url|renderer-url|before-hydration-url)=["']([^"']+\.js)["']"""
)


def _js_loads_clerk(path: Path, cache: dict[Path, bool], stack: set[Path]) -> bool:
    if path in cache:
        return cache[path]
    if path in stack or not path.exists():
        return False
    stack.add(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    found = bool(CLERK_MARKER.search(text)) or any(
        _js_loads_clerk((path.parent / ref).resolve(), cache, stack) for ref in JS_REF.findall(text)
    )
    stack.discard(path)
    cache[path] = found
    return found


def public_pages_loading_clerk(static_root: Path) -> list[str]:
    cache: dict[Path, bool] = {}
    offenders: list[str] = []
    for html_path in sorted(static_root.rglob("*.html")):
        rel = html_path.relative_to(static_root).as_posix()
        if CLERK_ALLOWED.search(rel):
            continue
        html = html_path.read_text(encoding="utf-8", errors="ignore")
        inline = "".join(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, flags=re.S))
        loads = bool(CLERK_MARKER.search(inline))
        for ref in HTML_JS_REF.findall(html):
            if loads:
                break
            if ref.startswith("/"):
                loads = _js_loads_clerk((static_root / ref.lstrip("/")).resolve(), cache, set())
        if loads:
            offenders.append(rel)
    return offenders


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

    static_root = html_path.parent
    clerk_pages = public_pages_loading_clerk(static_root)
    print(f"[perf] public pages loading Clerk: {len(clerk_pages)}")
    if clerk_pages:
        sample = ", ".join(clerk_pages[:5])
        errors.append(f"{len(clerk_pages)} public pages load the Clerk SDK (e.g. {sample}); render <ClerkClient /> only where an account session is needed")

    for error in errors:
        print(f"[perf] ERROR: {error}")
    if errors:
        return 1
    print("[perf] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
