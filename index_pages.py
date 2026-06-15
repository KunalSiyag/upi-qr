import json
import requests
from google.oauth2 import service_account
import xml.etree.ElementTree as ET
import sys
import os

# Define Scopes
SCOPES = ["https://www.googleapis.com/auth/indexing"]
SERVICE_ACCOUNT_FILE = "service_account.json"

if not os.path.exists(SERVICE_ACCOUNT_FILE):
    print(f"Error: Credentials file '{SERVICE_ACCOUNT_FILE}' not found in the root directory.")
    print("Please rename your downloaded JSON key to 'service_account.json' and place it in the project root.")
    sys.exit(1)

if not os.path.exists("dist/sitemap.xml"):
    print("Error: 'dist/sitemap.xml' not found. Please run 'npm run build' first to generate the sitemap.")
    sys.exit(1)

print("Authenticating with Google Indexing API...")
try:
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    # Get access token
    import google.auth.transport.requests
    auth_req = google.auth.transport.requests.Request()
    creds.refresh(auth_req)
    token = creds.token
except Exception as e:
    print(f"Authentication failed: {e}")
    sys.exit(1)

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {token}"
}

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

print(f"Found {len(urls)} URLs in sitemap.xml. Starting bulk submit...")

endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish"
success_count = 0
failed_count = 0

for idx, url in enumerate(urls):
    data = {
        "url": url,
        "type": "URL_UPDATED"
    }
    try:
        response = requests.post(endpoint, headers=headers, json=data)
        if response.status_code == 200:
            print(f"[{idx+1}/{len(urls)}] SUCCESS: {url}")
            success_count += 1
        else:
            print(f"[{idx+1}/{len(urls)}] FAILED: {url} (Status: {response.status_code})")
            print(f"Response: {response.text}")
            failed_count += 1
    except Exception as e:
        print(f"[{idx+1}/{len(urls)}] ERROR: {url} - {e}")
        failed_count += 1

print("\n--- Indexing Summary ---")
print(f"Total processed: {len(urls)}")
print(f"Successfully submitted: {success_count}")
print(f"Failed submissions: {failed_count}")
print("Googlebot will crawl the successfully submitted URLs shortly!")
