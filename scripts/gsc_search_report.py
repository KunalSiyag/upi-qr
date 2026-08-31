#!/usr/bin/env python3
"""Search Console performance report for Pro UPI QR.

Produces 28-day comparisons, query-to-page ownership, cannibalization,
directory performance, locales, devices, Image Search, and high-impression
weak-CTR pages. Does not invent title-modifier suggestions.

Sources, in order:
  1. Search Console API if service_account.json or GOOGLE_APPLICATION_CREDENTIALS exists
  2. Exported CSVs in a directory (Queries.csv, Pages.csv, Devices.csv, …)

Usage:
  python3 scripts/gsc_search_report.py
  python3 scripts/gsc_search_report.py --csv-dir ./gsc-exports
  python3 scripts/gsc_search_report.py --site sc-domain:proupiqr.in --days 28
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

IST = timezone(timedelta(hours=5, minutes=30))
DEFAULT_SITE = "sc-domain:proupiqr.in"
SERVICE_FILES = [
    Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]) if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") else None,
    Path("service_account.json"),
    Path("scripts/service_account.json"),
]


def ist_today() -> date:
    return datetime.now(IST).date()


def parse_num(value: str | int | float | None) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def ctr_pct(clicks: float, impressions: float) -> float:
    return (clicks / impressions * 100) if impressions else 0.0


def directory_of(page: str) -> str:
    path = urlparse(page).path if page.startswith("http") else page
    parts = [p for p in path.split("/") if p]
    if not parts:
        return "/"
    if parts[0] in {"hi", "ta", "te", "mr"}:
        if len(parts) == 1:
            return f"/{parts[0]}/"
        return f"/{parts[0]}/{parts[1]}/"
    return f"/{parts[0]}/"


def locale_of(page: str) -> str:
    path = urlparse(page).path if page.startswith("http") else page
    first = next((p for p in path.split("/") if p), "")
    return first if first in {"hi", "ta", "te", "mr"} else "en"


def load_csv_table(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def find_csv(directory: Path, *names: str) -> Path | None:
    files = {p.name.lower(): p for p in directory.glob("*.csv")}
    for name in names:
        if name.lower() in files:
            return files[name.lower()]
    for file in directory.glob("*.csv"):
        lowered = file.name.lower()
        if any(token in lowered for token in names):
            return file
    return None


def rows_from_csv(directory: Path) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    queries = find_csv(directory, "queries.csv", "top queries.csv", "query.csv")
    pages = find_csv(directory, "pages.csv", "top pages.csv", "page.csv")
    devices = find_csv(directory, "devices.csv", "device.csv")
    countries = find_csv(directory, "countries.csv", "country.csv")
    appearance = find_csv(directory, "search appearance.csv", "search-appearance.csv", "appearance.csv")

    def normalize(path: Path | None, key_names: tuple[str, ...], key_out: str) -> list[dict[str, Any]]:
        if not path:
            return []
        rows = []
        for raw in load_csv_table(path):
            key = ""
            for name in key_names:
                for actual in raw:
                    if actual.lower().strip() == name.lower():
                        key = raw[actual]
                        break
                if key:
                    break
            if not key:
                key = next(iter(raw.values()), "")
            rows.append({
                key_out: key,
                "clicks": parse_num(raw.get("Clicks") or raw.get("clicks")),
                "impressions": parse_num(raw.get("Impressions") or raw.get("impressions")),
                "ctr": parse_num(raw.get("CTR") or raw.get("ctr")),
                "position": parse_num(raw.get("Position") or raw.get("position")),
            })
        return rows

    out["queries"] = normalize(queries, ("Top queries", "Query", "query"), "query")
    out["pages"] = normalize(pages, ("Top pages", "Page", "page", "URL"), "page")
    out["devices"] = normalize(devices, ("Device", "device"), "device")
    out["countries"] = normalize(countries, ("Country", "country"), "country")
    out["appearance"] = normalize(appearance, ("Search Appearance", "searchAppearance"), "appearance")
    return out


def api_query(site: str, start: date, end: date, dimensions: list[str], search_type: str = "web", row_limit: int = 25000) -> list[dict[str, Any]]:
    cred_path = next((p for p in SERVICE_FILES if p and p.exists()), None)
    if not cred_path:
        raise FileNotFoundError("No Search Console credentials")

    from google.oauth2 import service_account
    import google.auth.transport.requests
    import urllib.request

    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    creds = service_account.Credentials.from_service_account_file(str(cred_path), scopes=scopes)
    creds.refresh(google.auth.transport.requests.Request())

    body = {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "searchType": search_type,
    }
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    rows = []
    for row in payload.get("rows", []):
        keys = row.get("keys") or []
        item = {
            "clicks": float(row.get("clicks") or 0),
            "impressions": float(row.get("impressions") or 0),
            "ctr": float(row.get("ctr") or 0) * 100,
            "position": float(row.get("position") or 0),
        }
        for index, dim in enumerate(dimensions):
            item[dim] = keys[index] if index < len(keys) else ""
        rows.append(item)
    return rows


def fmt_row(clicks: float, impressions: float, position: float | None = None) -> str:
    ctr = ctr_pct(clicks, impressions)
    pos = f" | pos {position:.1f}" if position else ""
    return f"{int(clicks):,} clicks / {int(impressions):,} impr / {ctr:.2f}% CTR{pos}"


def print_table(title: str, rows: list[tuple[str, str]], limit: int = 15) -> None:
    print(f"\n## {title}")
    if not rows:
        print("No data.")
        return
    for label, stats in rows[:limit]:
        print(f"- {label}: {stats}")


def report_from_api(site: str, days: int) -> None:
    end = ist_today() - timedelta(days=3)  # GSC lag
    current_start = end - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)

    print(f"# Search Console report")
    print(f"Site: {site}")
    print(f"Current: {current_start} → {end} ({days} days)")
    print(f"Previous: {previous_start} → {previous_end}")

    current = api_query(site, current_start, end, [])
    previous = api_query(site, previous_start, previous_end, [])
    cur = current[0] if current else {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
    prev = previous[0] if previous else {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}

    print("\n## 28-day comparison")
    print(f"- Current: {fmt_row(cur['clicks'], cur['impressions'], cur['position'])}")
    print(f"- Previous: {fmt_row(prev['clicks'], prev['impressions'], prev['position'])}")
    click_delta = cur["clicks"] - prev["clicks"]
    impr_delta = cur["impressions"] - prev["impressions"]
    print(f"- Click change: {click_delta:+.0f}")
    print(f"- Impression change: {impr_delta:+.0f}")
    print(f"- CTR change: {cur['ctr'] - prev['ctr']:+.2f} points")

    query_page = api_query(site, current_start, end, ["query", "page"])
    ownership: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in query_page:
        ownership[row["query"]].append(row)

    owners = []
    cannibal = []
    for query, pages in ownership.items():
        pages.sort(key=lambda r: r["impressions"], reverse=True)
        total_impr = sum(p["impressions"] for p in pages)
        total_clicks = sum(p["clicks"] for p in pages)
        top = pages[0]
        owners.append((query, top["page"], total_clicks, total_impr, top["position"]))
        if len(pages) > 1 and pages[1]["impressions"] >= 20 and pages[1]["impressions"] / max(total_impr, 1) >= 0.25:
            share = ", ".join(f"{p['page']} ({int(p['impressions'])})" for p in pages[:4])
            cannibal.append((query, total_impr, share))

    owners.sort(key=lambda r: r[3], reverse=True)
    print_table("Query-to-page ownership (top page per query)", [
        (f"“{q}” → {page}", fmt_row(clicks, impr, pos)) for q, page, clicks, impr, pos in owners
    ], 20)

    cannibal.sort(key=lambda r: r[1], reverse=True)
    print_table("Cannibalization (query with 2+ pages sharing ≥25% impressions)", [
        (f"“{q}”", f"{int(impr):,} impr · {share}") for q, impr, share in cannibal
    ], 15)

    pages = api_query(site, current_start, end, ["page"])
    directories: dict[str, dict[str, float]] = defaultdict(lambda: {"clicks": 0, "impressions": 0})
    locales: dict[str, dict[str, float]] = defaultdict(lambda: {"clicks": 0, "impressions": 0})
    weak = []
    for row in pages:
        page = row["page"]
        directories[directory_of(page)]["clicks"] += row["clicks"]
        directories[directory_of(page)]["impressions"] += row["impressions"]
        locales[locale_of(page)]["clicks"] += row["clicks"]
        locales[locale_of(page)]["impressions"] += row["impressions"]
        ctr = ctr_pct(row["clicks"], row["impressions"])
        if row["impressions"] >= 200 and ctr < 3 and row["position"] <= 15:
            weak.append((page, row["clicks"], row["impressions"], row["position"], ctr))

    print_table("Directory performance", [
        (path, fmt_row(vals["clicks"], vals["impressions"]))
        for path, vals in sorted(directories.items(), key=lambda kv: kv[1]["impressions"], reverse=True)
    ], 20)
    print_table("Locales", [
        (lang, fmt_row(vals["clicks"], vals["impressions"]))
        for lang, vals in sorted(locales.items(), key=lambda kv: kv[1]["impressions"], reverse=True)
    ])

    devices = api_query(site, current_start, end, ["device"])
    print_table("Devices", [
        (row["device"], fmt_row(row["clicks"], row["impressions"], row["position"]))
        for row in sorted(devices, key=lambda r: r["impressions"], reverse=True)
    ])

    try:
        image_rows = api_query(site, current_start, end, ["page"], search_type="image")
        image_total = {
            "clicks": sum(r["clicks"] for r in image_rows),
            "impressions": sum(r["impressions"] for r in image_rows),
        }
        print("\n## Image Search")
        print(f"- Total: {fmt_row(image_total['clicks'], image_total['impressions'])}")
        print_table("Image Search pages", [
            (row["page"], fmt_row(row["clicks"], row["impressions"], row["position"]))
            for row in sorted(image_rows, key=lambda r: r["impressions"], reverse=True)
        ], 10)
    except Exception as exc:
        print(f"\n## Image Search\nUnavailable ({exc}).")

    weak.sort(key=lambda r: r[2], reverse=True)
    print_table("High impressions, weak CTR (impr ≥ 200, CTR < 3%, pos ≤ 15)", [
        (page, fmt_row(clicks, impr, pos)) for page, clicks, impr, pos, _ctr in weak
    ], 20)


def report_from_csv(directory: Path) -> None:
    data = rows_from_csv(directory)
    print("# Search Console report (CSV export)")
    print(f"Directory: {directory}")
    print("API credentials were not used. Export Queries, Pages, Devices, Countries,")
    print("and Search appearance CSVs from Search Console for a fuller report.")

    queries = sorted(data["queries"], key=lambda r: r["impressions"], reverse=True)
    pages = sorted(data["pages"], key=lambda r: r["impressions"], reverse=True)
    print_table("Queries", [
        (f"“{r['query']}”", fmt_row(r["clicks"], r["impressions"], r["position"])) for r in queries
    ], 20)
    print_table("Pages", [
        (r["page"], fmt_row(r["clicks"], r["impressions"], r["position"])) for r in pages
    ], 20)

    directories: dict[str, dict[str, float]] = defaultdict(lambda: {"clicks": 0, "impressions": 0})
    locales: dict[str, dict[str, float]] = defaultdict(lambda: {"clicks": 0, "impressions": 0})
    weak = []
    for row in pages:
        directories[directory_of(row["page"])]["clicks"] += row["clicks"]
        directories[directory_of(row["page"])]["impressions"] += row["impressions"]
        locales[locale_of(row["page"])]["clicks"] += row["clicks"]
        locales[locale_of(row["page"])]["impressions"] += row["impressions"]
        ctr = row["ctr"] if row["ctr"] else ctr_pct(row["clicks"], row["impressions"])
        if row["impressions"] >= 200 and ctr < 3 and (not row["position"] or row["position"] <= 15):
            weak.append(row)
    print_table("Directory performance", [
        (path, fmt_row(vals["clicks"], vals["impressions"]))
        for path, vals in sorted(directories.items(), key=lambda kv: kv[1]["impressions"], reverse=True)
    ], 20)
    print_table("Locales", [
        (lang, fmt_row(vals["clicks"], vals["impressions"]))
        for lang, vals in sorted(locales.items(), key=lambda kv: kv[1]["impressions"], reverse=True)
    ])
    print_table("Devices", [
        (r["device"], fmt_row(r["clicks"], r["impressions"], r["position"]))
        for r in sorted(data["devices"], key=lambda r: r["impressions"], reverse=True)
    ])
    print_table("Search appearance / Image Search proxy", [
        (r["appearance"], fmt_row(r["clicks"], r["impressions"], r["position"]))
        for r in sorted(data["appearance"], key=lambda r: r["impressions"], reverse=True)
    ])
    print_table("High impressions, weak CTR", [
        (r["page"], fmt_row(r["clicks"], r["impressions"], r["position"])) for r in weak
    ], 20)
    print("\nCSV mode cannot compute query-to-page ownership or cannibalization.")
    print("Add a Search Console service account as service_account.json for those sections.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Pro UPI QR Search Console report")
    parser.add_argument("--csv-dir", type=Path, help="Directory of GSC CSV exports")
    parser.add_argument("--site", default=os.environ.get("GSC_SITE", DEFAULT_SITE))
    parser.add_argument("--days", type=int, default=28)
    args = parser.parse_args()

    cred_path = next((p for p in SERVICE_FILES if p and p.exists()), None)
    if cred_path and not args.csv_dir:
        try:
            report_from_api(args.site, args.days)
            return 0
        except Exception as exc:
            print(f"Search Console API failed: {exc}", file=sys.stderr)
            print("Falling back to usage help if no CSVs were given.", file=sys.stderr)
            if not args.csv_dir:
                print_usage()
                return 1

    if args.csv_dir:
        report_from_csv(args.csv_dir)
        return 0

    print_usage()
    return 1


def print_usage() -> None:
    print("Search Console report needs either:")
    print("  1. service_account.json with Search Console access, or")
    print("  2. python3 scripts/gsc_search_report.py --csv-dir ./gsc-exports")
    print()
    print("Export from GSC (Performance → Export): Queries, Pages, Devices,")
    print("Countries, and Search appearance. The report covers 28-day totals,")
    print("directory/locale/device splits, Image Search appearance, and weak-CTR")
    print("pages. It does not suggest bracket title modifiers.")


if __name__ == "__main__":
    raise SystemExit(main())
