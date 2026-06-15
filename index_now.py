import json
import requests
import xml.etree.ElementTree as ET
import sys
import os

KEY = "7e4c2b9a8f1d4c3ab5d6e7f80a1c2b3d"
HOST = "www.proupiqr.in"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"

if not os.path.exists("dist/sitemap.xml"):
    print("Error: 'dist/sitemap.xml' not found. Please run 'npm run build' first to generate the sitemap.")
    sys.exit(1)

# Parse Sitemap URLs
try:
    tree = ET.parse("dist/sitemap.xml")
    root = tree.getroot()
    # Handle XML Namespace
    ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [loc.text for loc in root.findall(".//ns:loc", ns)]
except Exception as e:
    print(f"Failed to parse sitemap: {e}")
    sys.exit(1)

print(f"Found {len(urls)} URLs in sitemap.xml. Submitting to IndexNow...")

endpoint = "https://api.indexnow.org/indexnow"
headers = {
    "Content-Type": "application/json; charset=utf-8"
}
data = {
    "host": HOST,
    "key": KEY,
    "keyLocation": KEY_LOCATION,
    "urlList": urls
}

try:
    response = requests.post(endpoint, headers=headers, json=data)
    if response.status_code in [200, 202]:
        print("\n--- IndexNow Submission Successful! ---")
        print(f"Successfully submitted {len(urls)} URLs. (Status Code: {response.status_code})")
        print("Bing, Yandex, and other search engines will crawl these pages shortly.")
    else:
        print(f"\nFailed to submit to IndexNow. Status code: {response.status_code}")
        print(f"Response: {response.text}")
except Exception as e:
    print(f"\nAn error occurred during submission: {e}")
    sys.exit(1)
