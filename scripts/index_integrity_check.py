#!/usr/bin/env python3
"""Validate sitemap and indexing signals in the built site.

Usage:
    python3 scripts/index_integrity_check.py [.vercel/output/static]
"""

import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET


SITE_ORIGIN = "https://www.proupiqr.in"
LOCALES = {"hi", "ta", "te", "mr", "es", "pt", "fr", "de", "id"}
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lang = ""
        self.robots = ""
        self.canonicals = []
        self.alternates = []
        self.json_documents = []
        self.json_errors = []
        self.microdata_breadcrumbs = 0
        self.has_meta_refresh = False
        self._json_buffer = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "html":
            self.lang = attributes.get("lang", "")
        elif tag == "meta":
            name = attributes.get("name", "").lower()
            http_equiv = attributes.get("http-equiv", "").lower()
            if name == "robots":
                self.robots = attributes.get("content", "")
            if http_equiv == "refresh":
                self.has_meta_refresh = True
        elif tag == "link":
            rel = attributes.get("rel", "").lower().split()
            href = attributes.get("href", "")
            if "canonical" in rel:
                self.canonicals.append(href)
            if "alternate" in rel and attributes.get("hreflang"):
                self.alternates.append((attributes["hreflang"].lower(), href))
        elif tag == "script" and attributes.get("type", "").lower() == "application/ld+json":
            self._json_buffer = []

        itemtype = attributes.get("itemtype", "").rstrip("/")
        if itemtype.endswith("/BreadcrumbList"):
            self.microdata_breadcrumbs += 1

    def handle_data(self, data):
        if self._json_buffer is not None:
            self._json_buffer.append(data)

    def handle_endtag(self, tag):
        if tag != "script" or self._json_buffer is None:
            return

        raw_json = "".join(self._json_buffer).strip()
        self._json_buffer = None
        if not raw_json:
            return
        try:
            self.json_documents.append(json.loads(raw_json))
        except json.JSONDecodeError as error:
            self.json_errors.append(str(error))


def normalize_url(value):
    parsed = urlsplit(value)
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{path}"


def route_for_file(build_dir, file_path):
    relative = file_path.relative_to(build_dir)
    if relative.as_posix() == "index.html":
        return "/"
    if relative.name == "index.html":
        return f"/{relative.parent.as_posix()}/"
    return f"/{relative.as_posix()}"


def expected_language(route):
    first_segment = route.strip("/").split("/", 1)[0]
    return first_segment if first_segment in LOCALES else "en"


def find_schema_type(value, schema_type):
    found = []
    if isinstance(value, dict):
        raw_types = value.get("@type", [])
        types = raw_types if isinstance(raw_types, list) else [raw_types]
        if schema_type in types:
            found.append(value)
        for child in value.values():
            found.extend(find_schema_type(child, schema_type))
    elif isinstance(value, list):
        for child in value:
            found.extend(find_schema_type(child, schema_type))
    return found


def item_url(item):
    value = item.get("item", "") if isinstance(item, dict) else ""
    if isinstance(value, dict):
        return value.get("@id", "")
    return value


def header_value(vercel_config, source, name):
    for rule in vercel_config.get("headers", []):
        if rule.get("source") != source:
            continue
        for header in rule.get("headers", []):
            if header.get("key", "").lower() == name.lower():
                return header.get("value", "")
    return ""


def main():
    project_root = Path(__file__).resolve().parents[1]
    build_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else project_root / ".vercel/output/static"
    if not build_dir.is_absolute():
        build_dir = Path.cwd() / build_dir

    sitemap_file = build_dir / "sitemap.xml"
    if not sitemap_file.is_file():
        print(f"[index-integrity] ERROR: sitemap not found at {sitemap_file}")
        return 1

    errors = []
    pages = {}
    for file_path in sorted(build_dir.rglob("*.html")):
        parser = PageParser()
        parser.feed(file_path.read_text(encoding="utf-8", errors="ignore"))
        route = route_for_file(build_dir, file_path)
        pages[route] = parser

        if parser.json_errors:
            errors.append(f"{route}: invalid JSON-LD ({parser.json_errors[0]})")
        if parser.has_meta_refresh:
            errors.append(f"{route}: meta-refresh redirect found; use an HTTP redirect or omit the route")

    tree = ET.parse(sitemap_file)
    sitemap_urls = [node.text.strip() for node in tree.findall("sm:url/sm:loc", SITEMAP_NS) if node.text]
    sitemap_keys = [normalize_url(url) for url in sitemap_urls]
    sitemap_set = set(sitemap_keys)

    if len(sitemap_keys) != len(sitemap_set):
        errors.append("sitemap.xml: duplicate <loc> entries found")

    root = tree.getroot()
    if root.findall("sm:url/sm:priority", SITEMAP_NS):
        errors.append("sitemap.xml: remove ignored <priority> elements")
    if root.findall("sm:url/sm:changefreq", SITEMAP_NS):
        errors.append("sitemap.xml: remove ignored <changefreq> elements")

    indexable_pages = {}
    for route, page in pages.items():
        noindex = "noindex" in page.robots.lower()
        if noindex:
            continue

        if page.lang.lower() != expected_language(route):
            errors.append(f"{route}: html lang is '{page.lang or 'missing'}', expected '{expected_language(route)}'")

        if len(page.canonicals) != 1:
            errors.append(f"{route}: expected one canonical, found {len(page.canonicals)}")
            continue

        canonical = normalize_url(page.canonicals[0])
        expected_canonical = normalize_url(f"{SITE_ORIGIN}{route}")
        if canonical != expected_canonical:
            errors.append(f"{route}: canonical {page.canonicals[0]} does not match the built route")
        if canonical not in sitemap_set:
            errors.append(f"{route}: indexable canonical is missing from sitemap.xml")

        json_breadcrumbs = []
        for document in page.json_documents:
            json_breadcrumbs.extend(find_schema_type(document, "BreadcrumbList"))
        breadcrumb_count = len(json_breadcrumbs) + page.microdata_breadcrumbs
        if breadcrumb_count != 1:
            errors.append(f"{route}: expected one breadcrumb graph, found {breadcrumb_count}")
        elif json_breadcrumbs:
            items = json_breadcrumbs[0].get("itemListElement", [])
            positions = [item.get("position") for item in items if isinstance(item, dict)]
            if not items or positions != list(range(1, len(items) + 1)):
                errors.append(f"{route}: breadcrumb positions are missing or non-sequential")
            elif normalize_url(item_url(items[-1])) != canonical:
                errors.append(f"{route}: final breadcrumb item does not match the canonical URL")

        hreflang_codes = [code for code, _ in page.alternates]
        if len(hreflang_codes) != len(set(hreflang_codes)):
            errors.append(f"{route}: duplicate hreflang language entries found")
        if not any(code == page.lang.lower() and normalize_url(href) == canonical for code, href in page.alternates):
            errors.append(f"{route}: missing self-referencing hreflang for '{page.lang.lower()}'")
        if not any(code == "x-default" for code, _ in page.alternates):
            errors.append(f"{route}: missing x-default hreflang")

        indexable_pages[canonical] = (route, page)

    for sitemap_url, sitemap_key in zip(sitemap_urls, sitemap_keys):
        parsed = urlsplit(sitemap_url)
        if f"{parsed.scheme.lower()}://{parsed.netloc.lower()}" != SITE_ORIGIN:
            errors.append(f"sitemap.xml: off-domain URL {sitemap_url}")
            continue
        path = parsed.path or "/"
        page = pages.get(path)
        if page is None:
            errors.append(f"sitemap.xml: {path} has no built HTML page")
            continue
        if "noindex" in page.robots.lower():
            errors.append(f"sitemap.xml: {path} is marked noindex")
        if len(page.canonicals) != 1 or normalize_url(page.canonicals[0]) != sitemap_key:
            errors.append(f"sitemap.xml: {path} does not self-canonicalize")

    for canonical, (route, page) in indexable_pages.items():
        for code, href in page.alternates:
            target_url = normalize_url(href)
            if target_url not in sitemap_set:
                errors.append(f"{route}: hreflang '{code}' target is not indexable in the sitemap: {href}")
                continue
            if code == "x-default":
                continue
            target = indexable_pages.get(target_url)
            if target is None:
                errors.append(f"{route}: hreflang '{code}' target has no indexable built page: {href}")
                continue
            target_route, target_page = target
            reciprocal = any(
                target_code == page.lang.lower() and normalize_url(target_href) == canonical
                for target_code, target_href in target_page.alternates
            )
            if not reciprocal:
                errors.append(f"{route}: hreflang target {target_route} does not link back")

    vercel_config = json.loads((project_root / "vercel.json").read_text(encoding="utf-8"))
    private_sources = [
        "/embed/:path*",
        "/sign-in/:path*",
        "/sign-up/:path*",
        "/dashboard/:path*",
        "/c/:path*",
        "/api/:path*",
        "/r/:path*",
    ]
    for source in private_sources:
        value = header_value(vercel_config, source, "X-Robots-Tag").lower()
        if "noindex" not in value:
            errors.append(f"vercel.json: {source} is missing an X-Robots-Tag noindex rule")

    feed_sources = ["/rss.xml", "/hi/rss.xml", "/ta/rss.xml", "/te/rss.xml", "/mr/rss.xml"]
    for source in feed_sources:
        value = header_value(vercel_config, source, "X-Robots-Tag").lower()
        if "noindex" not in value:
            errors.append(f"vercel.json: {source} is missing an X-Robots-Tag noindex rule")

    print(
        f"[index-integrity] checked {len(pages)} HTML pages, "
        f"{len(indexable_pages)} indexable canonicals, and {len(sitemap_urls)} sitemap URLs"
    )
    if errors:
        print(f"[index-integrity] FAILED with {len(errors)} error(s):")
        for error in errors:
            print(f"  ERROR: {error}")
        return 1

    print("[index-integrity] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
