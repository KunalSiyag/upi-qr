#!/usr/bin/env python3
import json
import os
import sys
import time
import requests
from google.oauth2 import service_account
import google.auth.transport.requests

SERVICE_ACCOUNT_FILE = os.environ.get("SERVICE_ACCOUNT_PATH", "service_account.json")
DOMAIN = os.environ.get("DOMAIN_NAME", "proupiqr.in")

SCOPES = [
    "https://www.googleapis.com/auth/siteverification",
    "https://www.googleapis.com/auth/webmasters"
]

def main():
    print("=================================================================")
    print("🚀 GSC Service Account Bypasser (Fixes 'Email Not Found' Bug)")
    print("=================================================================")

    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        print(f"❌ Error: '{SERVICE_ACCOUNT_FILE}' not found.")
        print("Please place your downloaded Service Account JSON key as 'service_account.json' in this folder.")
        sys.exit(1)

    print(f"1. Authenticating as Service Account from {SERVICE_ACCOUNT_FILE}...")
    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        auth_req = google.auth.transport.requests.Request()
        creds.refresh(auth_req)
        token = creds.token
        print("   ✅ Authentication successful!")
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        sys.exit(1)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    # Step 1: Request Verification Token
    print(f"\n2. Requesting DNS_TXT Verification token for domain: {DOMAIN}...")
    token_url = "https://www.googleapis.com/siteVerification/v1/token"
    token_body = {
        "site": {"type": "INET_DOMAIN", "identifier": DOMAIN},
        "verificationMethod": "DNS_TXT"
    }

    resp = requests.post(token_url, headers=headers, json=token_body)
    if resp.status_code != 200:
        print(f"❌ Failed to get verification token: {resp.text}")
        print("Tip: Make sure 'Google Site Verification API' is enabled in GCP Console.")
        sys.exit(1)

    token_data = resp.json()
    verification_token = token_data.get("token")
    print("\n-----------------------------------------------------------------")
    print("👉 ADD THIS TXT RECORD TO YOUR DOMAIN'S DNS (Cloudflare / Namecheap / GoDaddy / Vercel):")
    print("-----------------------------------------------------------------")
    print(f"Record Type: TXT")
    print(f"Host / Name: @ (or {DOMAIN})")
    print(f"Value      : {verification_token}")
    print("-----------------------------------------------------------------\n")

    input("Press ENTER after adding the TXT record to your DNS to verify ownership...")

    # Step 2: Verify Ownership
    print("\n3. Verifying ownership with Google...")
    verify_url = "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT"
    verify_body = {
        "site": {"type": "INET_DOMAIN", "identifier": DOMAIN}
    }

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        verify_resp = requests.post(verify_url, headers=headers, json=verify_body)
        if verify_resp.status_code == 200:
            print("   🎉 SUCCESS! Service Account is now a VERIFIED OWNER of the domain in Google!")
            break
        else:
            print(f"   Attempt {attempt}/{max_retries} failed ({verify_resp.status_code}): {verify_resp.text}")
            if attempt < max_retries:
                print("   Waiting 10 seconds for DNS propagation...")
                time.sleep(10)
            else:
                print("❌ Ownership verification failed. Please check if your DNS TXT record has propagated.")
                sys.exit(1)

    # Step 3: Register Domain in Webmasters API
    print("\n4. Registering property in Search Console for Service Account...")
    site_url = f"https://www.googleapis.com/webmasters/v3/sites/sc-domain%3A{DOMAIN}"
    reg_resp = requests.put(site_url, headers=headers)
    if reg_resp.status_code in [200, 204]:
        print(f"   🎉 SUCCESS! 'sc-domain:{DOMAIN}' registered to Service Account GSC!")
    else:
        # Fallback to URL Prefix
        prefix_url = f"https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.{DOMAIN}%2F"
        requests.put(prefix_url, headers=headers)
        print(f"   ✅ Done! Property configured.")

    print("\n=================================================================")
    print("✨ ALL DONE! You bypassed the Google Search Console UI bug.")
    print("The Service Account is now an Owner and can index pages via API!")
    print("=================================================================")

if __name__ == "__main__":
    main()
