import json
import requests
import xml.etree.ElementTree as ET
import sys
import os

KEY = "7e4c2b9a8f1d4c3ab5d6e7f80a1c2b3d"
HOST = "www.proupiqr.in"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"

SITEMAP_CANDIDATES = [
    "dist/client/sitemap.xml",
    "dist/sitemap.xml",
    ".vercel/output/static/sitemap.xml",
]
SITEMAP_PATH = next((path for path in SITEMAP_CANDIDATES if os.path.exists(path)), None)
if not SITEMAP_PATH:
    print("Error: sitemap.xml not found under dist/. Please run 'npm run build' first.")
    sys.exit(1)

# Parse Sitemap URLs
try:
    tree = ET.parse(SITEMAP_PATH)
    root = tree.getroot()
    # Handle XML Namespace
    ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [loc.text for loc in root.findall(".//ns:loc", ns)]
except Exception as e:
    print(f"Failed to parse sitemap: {e}")
    sys.exit(1)

print(f"Found {len(urls)} URLs in sitemap.xml. Submitting to IndexNow...")

endpoints = [
    "https://api.indexnow.org/indexnow",
    "https://www.bing.com/indexnow",
    "https://yandex.com/indexnow"
]

data = {
    "host": HOST,
    "key": KEY,
    "keyLocation": KEY_LOCATION,
    "urlList": urls
}

headers = {
    "Content-Type": "application/json; charset=utf-8"
}

submitted = False
for endpoint in endpoints:
    try:
        response = requests.post(endpoint, headers=headers, json=data, timeout=10)
        if response.status_code in [200, 202]:
            print("\n--- IndexNow Submission Successful! ---")
            print(f"Successfully submitted {len(urls)} URLs via {endpoint}. (Status Code: {response.status_code})")
            print("Bing, Yandex, and IndexNow engines will crawl these pages shortly.")
            submitted = True
            break
        else:
            print(f"IndexNow ({endpoint}) returned status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Endpoint {endpoint} failed: {e}")

if not submitted:
    print("\nNote: IndexNow key verification propagates once IndexNow crawler re-fetches key file.")
