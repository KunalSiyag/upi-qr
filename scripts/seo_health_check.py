#!/usr/bin/env python3
import os
import sys
import glob
import re
from xml.etree import ElementTree as ET
from html.parser import HTMLParser

DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")

class HTMLPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.in_title = False
        self.meta_desc = ""
        self.canonical = ""
        self.og_title = ""
        self.og_image = ""
        self.json_ld_count = 0
        self.links = []
        self.images_without_alt = 0
        self.h1_count = 0
        self.is_noindex = False

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        if tag == "title":
            self.in_title = True
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "meta":
            name = attr_dict.get("name", "").lower()
            prop = attr_dict.get("property", "").lower()
            content = attr_dict.get("content", "")
            if name == "robots" and "noindex" in content.lower():
                self.is_noindex = True
            elif name == "description":
                self.meta_desc = content
            elif prop == "og:title":
                self.og_title = content
            elif prop == "og:image":
                self.og_image = content
        elif tag == "link":
            rel = attr_dict.get("rel", "").lower()
            if rel == "canonical":
                self.canonical = attr_dict.get("href", "")
        elif tag == "script":
            stype = attr_dict.get("type", "").lower()
            if stype == "application/ld+json":
                self.json_ld_count += 1
        elif tag == "a":
            href = attr_dict.get("href")
            if href:
                self.links.append(href)
        elif tag == "img":
            alt = attr_dict.get("alt")
            if alt is None:
                self.images_without_alt += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data

def run_seo_health_check():
    if not os.path.exists(DIST_DIR):
        print(f"[ERROR] dist/ directory not found at {DIST_DIR}. Please run 'npm run build' first.")
        sys.exit(1)

    html_files = []
    for root, _, files in os.walk(DIST_DIR):
        for f in files:
            if f.endswith(".html"):
                html_files.append(os.path.join(root, f))

    print(f"🔍 Starting Automated SEO Health Audit on {len(html_files)} HTML pages...")
    print("=" * 60)

    total_warnings = 0
    total_errors = 0
    passed_pages = 0

    for filepath in html_files:
        rel_path = os.path.relpath(filepath, DIST_DIR)
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        parser = HTMLPageParser()
        parser.feed(content)

        page_errors = []
        page_warnings = []

        # Skip error checking for noindex utility pages (e.g. embed widgets)
        if parser.is_noindex:
            passed_pages += 1
            continue

        # 1. Title Audit
        title = parser.title.strip()
        if not title:
            page_errors.append("Missing <title> tag")
        elif len(title) < 20 or len(title) > 70:
            page_warnings.append(f"<title> length ({len(title)} chars) outside optimal range (20-70): '{title}'")

        # 2. Meta Description Audit
        desc = parser.meta_desc.strip()
        if not desc:
            page_errors.append("Missing <meta name='description'> tag")
        elif len(desc) < 70 or len(desc) > 170:
            page_warnings.append(f"Description length ({len(desc)} chars) outside optimal range (70-170)")

        # 3. Canonical Audit
        if not parser.canonical:
            page_errors.append("Missing <link rel='canonical'> tag")

        # 4. OpenGraph Audit
        if not parser.og_image:
            page_warnings.append("Missing og:image tag")

        # 5. Schema Markup Audit
        if parser.json_ld_count == 0:
            page_warnings.append("No JSON-LD structured data schema found")

        # 6. Heading H1 Audit
        if parser.h1_count == 0:
            page_warnings.append("Missing <h1> heading tag")
        elif parser.h1_count > 1:
            page_warnings.append(f"Multiple <h1> headings found ({parser.h1_count}) - optimal is exactly 1 per page")

        # 7. Image Alt Audit
        if parser.images_without_alt > 0:
            page_warnings.append(f"Found {parser.images_without_alt} image(s) missing 'alt' attribute")

        # Report results per page
        if page_errors or page_warnings:
            print(f"📄 Page: /{rel_path}")
            for err in page_errors:
                print(f"  ❌ ERROR: {err}")
                total_errors += 1
            for warn in page_warnings:
                print(f"  ⚠️  WARN:  {warn}")
                total_warnings += 1
        else:
            passed_pages += 1

    print("=" * 60)
    print("📊 SEO Health Audit Summary:")
    print(f"  ✅ Passed Cleanly: {passed_pages} / {len(html_files)} pages")
    print(f"  ⚠️  Total Warnings: {total_warnings}")
    print(f"  ❌ Total Errors:   {total_errors}")

    if total_errors > 0:
        print("\n❌ SEO Audit Failed with critical errors. Please address errors before deployment.")
        sys.exit(1)
    else:
        print("\n🎉 SEO Audit Passed! All pages meet indexing and structured data standards.")

if __name__ == "__main__":
    run_seo_health_check()
