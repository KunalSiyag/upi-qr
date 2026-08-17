import json
import requests
from google.oauth2 import service_account
import xml.etree.ElementTree as ET
import sys
import os
from datetime import datetime, timedelta

# Define Scopes and Paths
SCOPES = ["https://www.googleapis.com/auth/indexing"]
SERVICE_ACCOUNT_FILE = "service_account.json"
STATE_FILE = ".indexing_state.json"

# Schedule configuration: Submit max 5-6 pages per week (~1 page per build/run if a week has passed or 5 pages per weekly cycle)
MAX_PER_WEEK = 5
DAYS_BETWEEN_BATCHES = 7

if not os.path.exists(SERVICE_ACCOUNT_FILE):
    print(f"Error: Credentials file '{SERVICE_ACCOUNT_FILE}' not found in the root directory.")
    sys.exit(1)

SITEMAP_CANDIDATES = [
    "dist/client/sitemap.xml",
    "dist/sitemap.xml",
    ".vercel/output/static/sitemap.xml",
]
SITEMAP_PATH = next((path for path in SITEMAP_CANDIDATES if os.path.exists(path)), None)
if not SITEMAP_PATH:
    print("Error: sitemap.xml not found under dist/. Please run 'npm run build' first.")
    sys.exit(1)

# Load existing indexing state
state = {
    "last_run_timestamp": 0,
    "submitted_urls": []
}

if os.path.exists(STATE_FILE):
    try:
        with open(STATE_FILE, "r") as f:
            state = json.load(f)
    except Exception as e:
        print(f"Warning: Could not read {STATE_FILE}: {e}")

submitted_set = set(state.get("submitted_urls", []))
last_run_ts = state.get("last_run_timestamp", 0)

# Allow manual override from CLI argument, e.g. python3 index_pages.py 5 or python3 index_pages.py force
force_run = False
custom_limit = None

if len(sys.argv) > 1:
    if sys.argv[1].isdigit():
        custom_limit = int(sys.argv[1])
    elif sys.argv[1].lower() in ["force", "--force", "-f"]:
        force_run = True

# Weekly pacing check
now_ts = datetime.utcnow().timestamp()
days_since_last_run = (now_ts - last_run_ts) / (24 * 3600)

if not force_run and custom_limit is None and last_run_ts > 0 and days_since_last_run < DAYS_BETWEEN_BATCHES:
    remaining_days = round(DAYS_BETWEEN_BATCHES - days_since_last_run, 1)
    print(f"⏳ Weekly Indexing Pacing Active: Submitted a batch {round(days_since_last_run, 1)} days ago.")
    print(f"Next batch of {MAX_PER_WEEK} pages will be submitted in {remaining_days} days (or run 'python3 index_pages.py force' to bypass).")
    sys.exit(0)

# Parse Sitemap URLs
try:
    tree = ET.parse(SITEMAP_PATH)
    root = tree.getroot()
    ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    all_urls = [loc.text for loc in root.findall(".//ns:loc", ns)]
except Exception as e:
    print(f"Failed to parse sitemap: {e}")
    sys.exit(1)

# Filter out already submitted URLs
unsubmitted_urls = [url for url in all_urls if url not in submitted_set]

if not unsubmitted_urls:
    print(f"🎉 All {len(all_urls)} URLs from sitemap.xml have been submitted to Google!")
    print("Resetting state tracker so future updates can cycle through.")
    submitted_set.clear()
    unsubmitted_urls = all_urls

batch_size = custom_limit if custom_limit is not None else MAX_PER_WEEK
target_urls = unsubmitted_urls[:batch_size]

print("Authenticating with Google Indexing API...")
try:
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
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

endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish"
newly_submitted = []

print(f"Progress: {len(submitted_set)}/{len(all_urls)} URLs submitted so far.")
print(f"Submitting weekly batch of {len(target_urls)} high-priority URLs...")

for idx, url in enumerate(target_urls):
    data = {
        "url": url,
        "type": "URL_UPDATED"
    }
    try:
        response = requests.post(endpoint, headers=headers, json=data)
        if response.status_code == 200:
            print(f"[{idx+1}/{len(target_urls)}] SUCCESS: {url}")
            newly_submitted.append(url)
        else:
            print(f"[{idx+1}/{len(target_urls)}] FAILED: {url} (Status: {response.status_code})")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"[{idx+1}/{len(target_urls)}] ERROR: {url} - {e}")

# Save state
submitted_set.update(newly_submitted)
state = {
    "last_run_timestamp": now_ts,
    "submitted_urls": list(submitted_set)
}

with open(STATE_FILE, "w") as f:
    json.dump(state, f, indent=2)

print("\n--- Weekly Indexing Summary ---")
print(f"Total sitemap pages: {len(all_urls)}")
print(f"Submitted in this batch: {len(newly_submitted)}")
print(f"Total pages indexed so far: {len(submitted_set)}/{len(all_urls)}")
print(f"State saved to {STATE_FILE}. Next weekly batch will trigger in 7 days.")
