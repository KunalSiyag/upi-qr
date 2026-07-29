#!/usr/bin/env python3
"""
GSC Query Mining & CTR Optimizer Tool for Pro UPI QR
Identifies high-opportunity queries (High Impressions, Low CTR, Position 8-20)
and suggests Meta Title & H1 power modifiers to boost organic clicks.
"""

import sys
import os
import csv
import json

def analyze_gsc_data(csv_filepath=None):
    print("🔍 Pro UPI QR - GSC Query Mining & CTR Optimizer")
    print("=" * 60)

    if not csv_filepath or not os.path.exists(csv_filepath):
        print("💡 Usage: python3 scripts/gsc_query_mining.py [path_to_gsc_queries.csv]")
        print("   If no CSV file is provided, displaying optimization rules and power-modifier strategy:\n")
        print_ctr_strategy()
        return

    opportunities = []
    with open(csv_filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            query = row.get("Top queries", row.get("Query", "")).strip()
            try:
                clicks = int(row.get("Clicks", 0))
                impressions = int(row.get("Impressions", 0))
                ctr = float(row.get("CTR", "0").replace("%", ""))
                position = float(row.get("Position", 0))
            except ValueError:
                continue

            # Filter for Position 8-20 with high impressions
            if 8 <= position <= 25 and impressions >= 50 and ctr < 5.0:
                opportunities.append({
                    "query": query,
                    "clicks": clicks,
                    "impressions": impressions,
                    "ctr": ctr,
                    "position": round(position, 1)
                })

    opportunities.sort(key=lambda x: x["impressions"], reverse=True)

    print(f"🎯 Found {len(opportunities)} High-Potential CTR Optimization Candidates:\n")
    for idx, item in enumerate(opportunities[:15], 1):
        print(f"[{idx}] Query: '{item['query']}'")
        print(f"    Impressions: {item['impressions']} | Clicks: {item['clicks']} | CTR: {item['ctr']}% | Position: {item['position']}")
        print(f"    💡 Action: Add bracket modifier to title: '[2026 Free] {item['query'].title()} - Instant Download'\n")

def print_ctr_strategy():
    print("✨ Recommended Title Power Modifiers for Pro UPI QR:")
    print("  1. Year & Free Tag: '[2026 Free] Universal UPI QR Generator'")
    print("  2. No Signup Tag: 'SBI UPI QR Generator [No Signup Required]'")
    print("  3. Format Modifier: 'Free Paytm QR Poster [Instant Vector SVG/PDF]'")
    print("  4. Trust Tag: 'UPI QR Generator for Shop [100% Client-Side Private]'")

if __name__ == "__main__":
    filepath = sys.argv[1] if len(sys.argv) > 1 else None
    analyze_gsc_data(filepath)
