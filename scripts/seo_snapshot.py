#!/usr/bin/env python3
"""SEO snapshot of a static build, and a before/after diff for redesigns.

    python3 scripts/seo_snapshot.py snapshot .vercel/output/static > before.json
    ... redesign, rebuild ...
    python3 scripts/seo_snapshot.py snapshot .vercel/output/static > after.json
    python3 scripts/seo_snapshot.py compare before.json after.json

Per indexable page it records what search engines read: title, meta
description, canonical, robots, H1, H2s, JSON-LD types, visible word count
inside <main> (navigation excluded), and internal links. `compare` fails (exit 1) when a page disappears, or its
title, description, canonical, robots, H1, H2 set or schema types change, or
its visible text shrinks by more than 10%; it also lists pages that lose
internal inlinks, so a simpler navigation can't quietly orphan a page.
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

SKIP_TEXT = {"script", "style", "noscript", "template", "svg"}
# Site chrome: its text is navigation, not page content.
CHROME = {"header", "nav", "footer"}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta = {}
        self.canonical = ""
        self.h1 = []
        self.h2 = []
        self.schema_types = set()
        self.links = set()
        self.words = 0
        self.main_words = 0
        self.content_words = 0
        self._main = 0
        self._chrome = 0
        self._skip = 0
        self._capture = None
        self._buf = []
        self._jsonld = False
        self._jsonbuf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP_TEXT:
            self._skip += 1
        if tag == "main":
            self._main += 1
        if tag in CHROME:
            self._chrome += 1
        if tag == "script" and (a.get("type") or "") == "application/ld+json":
            self._jsonld = True
            self._jsonbuf = []
        if tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key in ("description", "robots", "og:title", "og:description"):
                self.meta[key] = (a.get("content") or "").strip()
        if tag == "link" and (a.get("rel") or "").lower() == "canonical":
            self.canonical = (a.get("href") or "").strip()
        if tag == "a":
            href = (a.get("href") or "").strip()
            if href.startswith("/") and not href.startswith("//"):
                path = href.split("#", 1)[0].split("?", 1)[0]
                if path:
                    self.links.add(path)
        if tag in ("title", "h1", "h2"):
            self._capture = tag
            self._buf = []

    def handle_endtag(self, tag):
        if tag in SKIP_TEXT and self._skip:
            self._skip -= 1
        if tag == "main" and self._main:
            self._main -= 1
        if tag in CHROME and self._chrome:
            self._chrome -= 1
        if tag == "script" and self._jsonld:
            self._jsonld = False
            try:
                self._collect_types(json.loads("".join(self._jsonbuf)))
            except ValueError:
                pass
        if self._capture == tag:
            text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if tag == "title":
                self.title = text
            elif tag == "h1":
                self.h1.append(text)
            else:
                self.h2.append(text)
            self._capture = None

    def handle_data(self, data):
        if self._jsonld:
            self._jsonbuf.append(data)
            return
        if self._capture:
            self._buf.append(data)
        if not self._skip:
            count = len(re.findall(r"\w+", data))
            self.words += count
            if self._main:
                self.main_words += count
            if not self._chrome:
                self.content_words += count

    def _collect_types(self, node):
        if isinstance(node, list):
            for item in node:
                self._collect_types(item)
        elif isinstance(node, dict):
            t = node.get("@type")
            if isinstance(t, str):
                self.schema_types.add(t)
            elif isinstance(t, list):
                self.schema_types.update(x for x in t if isinstance(x, str))
            for value in node.values():
                if isinstance(value, (dict, list)):
                    self._collect_types(value)


def snapshot(root):
    pages = {}
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".html"):
                continue
            full = os.path.join(dirpath, name)
            rel = "/" + os.path.relpath(full, root).replace(os.sep, "/")
            path = rel[: -len("index.html")] if rel.endswith("/index.html") else rel
            with open(full, encoding="utf-8", errors="replace") as fh:
                parser = PageParser()
                parser.feed(fh.read())
            robots = parser.meta.get("robots", "")
            pages[path] = {
                "title": parser.title,
                "description": parser.meta.get("description", ""),
                "canonical": parser.canonical,
                "robots": robots,
                "indexable": "noindex" not in robots.lower(),
                "h1": parser.h1,
                "h2": sorted(set(parser.h2)),
                "schema": sorted(parser.schema_types),
                # Content words: inside <main> when the page has one, else outside header/nav/footer.
                "words": parser.main_words or parser.content_words,
                "links": sorted(parser.links),
            }
    return pages


def inlinks(pages):
    counts = {path: 0 for path in pages}
    for path, page in pages.items():
        for target in page["links"]:
            if target != path and target in counts:
                counts[target] += 1
    return counts


def compare(before, after):
    problems, notes = [], []
    for path, old in sorted(before.items()):
        if not old["indexable"]:
            continue
        new = after.get(path)
        if new is None:
            problems.append(f"{path}: page missing")
            continue
        for key in ("title", "description", "canonical", "robots", "h1", "h2", "schema"):
            if old[key] != new[key]:
                problems.append(f"{path}: {key} changed: {old[key]!r} -> {new[key]!r}")
        if old["words"] and new["words"] < old["words"] * 0.9:
            problems.append(f"{path}: visible text shrank {old['words']} -> {new['words']} words")
    before_in, after_in = inlinks(before), inlinks(after)
    lost = []
    for path, count in before_in.items():
        if not before[path]["indexable"]:
            continue
        now = after_in.get(path, 0)
        if now < count:
            lost.append((count - now, path, count, now))
        if count > 0 and now == 0:
            problems.append(f"{path}: no internal links point here any more (was {count})")
    lost.sort(reverse=True)
    for _drop, path, count, now in lost[:40]:
        notes.append(f"inlinks {path}: {count} -> {now}")
    return problems, notes


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "snapshot":
        json.dump(snapshot(sys.argv[2]), sys.stdout, ensure_ascii=False, indent=1, sort_keys=True)
        return 0
    if len(sys.argv) == 4 and sys.argv[1] == "compare":
        with open(sys.argv[2], encoding="utf-8") as fa, open(sys.argv[3], encoding="utf-8") as fb:
            before, after = json.load(fa), json.load(fb)
        problems, notes = compare(before, after)
        indexable = sum(1 for p in before.values() if p["indexable"])
        print(f"[seo-snapshot] {indexable} indexable pages compared")
        for line in notes:
            print(f"  · {line}")
        for line in problems:
            print(f"  ✗ {line}")
        print("[seo-snapshot] OK" if not problems else f"[seo-snapshot] {len(problems)} SEO regression(s)")
        return 1 if problems else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
