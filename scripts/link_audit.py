#!/usr/bin/env python3
"""Crawl built HTML and report internal broken links.

Usage:
    python3 scripts/link_audit.py [build_dir] [--fail-on-broken]

Defaults to dist/client (Astro build output). Exits 1 if --fail-on-broken is set
and broken links are found (excluding known-harmless error-page self links).
"""
import glob
import os
import re
import sys
from urllib.parse import urlparse, unquote

root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "dist/client"
fail_on_broken = "--fail-on-broken" in sys.argv

ALLOWED_HOSTS = {"www.proupiqr.in", "proupiqr.in"}
# Error pages canonicalize to themselves; Vercel never serves /404/ or /500/ as URLs.
IGNORED_PREFIXES = ("/404", "/500")


def exists(url_path: str) -> bool:
    url_path = unquote(url_path)
    base = os.path.join(root, url_path.lstrip("/"))
    if url_path.endswith("/"):
        return os.path.isfile(os.path.join(base, "index.html"))
    return os.path.isfile(base) or os.path.isfile(os.path.join(base, "index.html"))


href_re = re.compile(r'(?:href|src)="([^"]+)"')
html_files = glob.glob(f"{root}/**/*.html", recursive=True)
broken: dict[str, list[str]] = {}
checked = set()

for f in html_files:
    html = open(f, encoding="utf-8", errors="ignore").read()
    for link in href_re.findall(html):
        if link.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        parsed = urlparse(link)
        if parsed.scheme.startswith("http") and parsed.netloc not in ALLOWED_HOSTS:
            continue
        path = parsed.path
        if not path or path in checked:
            continue
        checked.add(path)
        if any(path.startswith(p) for p in IGNORED_PREFIXES):
            continue
        if not exists(path):
            broken.setdefault(path, []).append(os.path.relpath(f, root))

print(f"[link_audit] pages scanned: {len(html_files)}, unique targets: {len(checked)}")
if broken:
    print(f"[link_audit] BROKEN LINKS: {len(broken)}")
    for path, sources in sorted(broken.items()):
        print(f"  {path}  <- {sources[0]}")
    if fail_on_broken:
        sys.exit(1)
else:
    print("[link_audit] OK - no broken internal links")
