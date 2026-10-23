#!/usr/bin/env python3
"""Weekly Search Console digest for Pro UPI QR, as Markdown on stdout.

Sections: week-over-week totals, pages gaining or losing clicks, queries close
to page 1, high-ranking queries with weak CTR, new queries, sitemap health, and
blog posts past their review date. The weekly workflow posts it as an issue.

Usage:
  python3 scripts/gsc_weekly_digest.py > digest.md
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gsc_search_report as gsc  # noqa: E402

SITE = gsc.DEFAULT_SITE
ORIGIN = "https://www.proupiqr.in"
BLOG_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "blog"


def short(url: str) -> str:
    return url.replace(ORIGIN, "") or "/"


def totals(rows: list[dict]) -> tuple[float, float, float]:
    clicks = sum(r["clicks"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    position = sum(r["position"] * r["impressions"] for r in rows) / impressions if impressions else 0
    return clicks, impressions, position


def pct(now: float, before: float) -> str:
    if not before:
        return "new" if now else "–"
    return f"{(now - before) / before * 100:+.0f}%"


def by_query(rows: list[dict]) -> dict[str, dict]:
    """Collapse query+page rows to one entry per query, keeping the page with most impressions."""
    out: dict[str, dict] = defaultdict(lambda: {"clicks": 0.0, "impressions": 0.0, "pw": 0.0, "pages": defaultdict(float)})
    for r in rows:
        q = out[r["query"]]
        q["clicks"] += r["clicks"]
        q["impressions"] += r["impressions"]
        q["pw"] += r["position"] * r["impressions"]
        q["pages"][r["page"]] += r["impressions"]
    for q in out.values():
        q["position"] = q["pw"] / q["impressions"] if q["impressions"] else 0
        q["page"] = max(q["pages"].items(), key=lambda kv: kv[1])[0]
    return out


def table(headers: list[str], rows: list[list[str]], empty: str) -> str:
    if not rows:
        return f"_{empty}_\n"
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines) + "\n"


def sitemaps() -> list[dict]:
    cred_path = next((p for p in gsc.SERVICE_FILES if p and p.exists()), None)
    if not cred_path:
        return []
    from google.oauth2 import service_account
    import google.auth.transport.requests

    creds = service_account.Credentials.from_service_account_file(
        str(cred_path), scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
    )
    creds.refresh(google.auth.transport.requests.Request())
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(SITE, safe='')}/sitemaps"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8")).get("sitemap", [])


def overdue_posts(today: date) -> list[tuple[str, str, int]]:
    """Blog posts whose reviewedOn + reviewIntervalDays has passed: (slug, reviewed, days overdue)."""
    out = []
    for path in sorted(BLOG_DIR.glob("*.md*")):
        text = path.read_text(encoding="utf-8")
        head = text.split("---", 2)[1] if text.startswith("---") else ""
        reviewed = re.search(r"^reviewedOn:\s*['\"]?(\d{4}-\d{2}-\d{2})", head, re.M)
        interval = re.search(r"^reviewIntervalDays:\s*(\d+)", head, re.M)
        if not reviewed or not interval:
            continue
        due = date.fromisoformat(reviewed.group(1)) + timedelta(days=int(interval.group(1)))
        if due < today:
            out.append((path.stem, reviewed.group(1), (today - due).days))
    return sorted(out, key=lambda item: -item[2])


def main() -> None:
    today = gsc.ist_today()
    end = today - timedelta(days=3)  # GSC lag
    week = (end - timedelta(days=6), end)
    prev_week = (week[0] - timedelta(days=7), week[0] - timedelta(days=1))
    month = (end - timedelta(days=27), end)
    prev_month = (month[0] - timedelta(days=28), month[0] - timedelta(days=1))

    out = [f"# Search Console digest: {week[0]:%d %b} to {week[1]:%d %b %Y}\n"]

    w_now, w_before = totals(gsc.api_query(SITE, *week, ["date"])), totals(gsc.api_query(SITE, *prev_week, ["date"]))
    out.append("## This week vs last week\n")
    out.append(table(
        ["", "This week", "Last week", "Change"],
        [
            ["Clicks", f"{w_now[0]:,.0f}", f"{w_before[0]:,.0f}", pct(w_now[0], w_before[0])],
            ["Impressions", f"{w_now[1]:,.0f}", f"{w_before[1]:,.0f}", pct(w_now[1], w_before[1])],
            ["CTR", f"{gsc.ctr_pct(w_now[0], w_now[1]):.2f}%", f"{gsc.ctr_pct(w_before[0], w_before[1]):.2f}%", ""],
            ["Avg position", f"{w_now[2]:.1f}", f"{w_before[2]:.1f}", ""],
        ],
        "No data.",
    ))

    pages_now = {r["page"]: r for r in gsc.api_query(SITE, *month, ["page"])}
    pages_before = {r["page"]: r for r in gsc.api_query(SITE, *prev_month, ["page"])}
    deltas = []
    for page in set(pages_now) | set(pages_before):
        now = pages_now.get(page, {}).get("clicks", 0)
        before = pages_before.get(page, {}).get("clicks", 0)
        if max(now, before) >= 10:
            deltas.append((now - before, page, now, before))
    deltas.sort()
    out.append("\n## Pages losing clicks (28 days vs the 28 before)\n")
    out.append(table(["Page", "Clicks", "Before", "Change"],
                     [[short(p), f"{n:.0f}", f"{b:.0f}", f"{d:+.0f}"] for d, p, n, b in deltas[:8] if d < 0],
                     "No page lost 10+ clicks."))
    out.append("\n## Pages gaining clicks\n")
    out.append(table(["Page", "Clicks", "Before", "Change"],
                     [[short(p), f"{n:.0f}", f"{b:.0f}", f"{d:+.0f}"] for d, p, n, b in reversed(deltas[-8:]) if d > 0],
                     "No page gained 10+ clicks."))

    q_now = by_query(gsc.api_query(SITE, *month, ["query", "page"]))
    q_before = by_query(gsc.api_query(SITE, *prev_month, ["query", "page"]))

    near = sorted((q for q in q_now.items() if 8 <= q[1]["position"] <= 20 and q[1]["impressions"] >= 50),
                  key=lambda q: -q[1]["impressions"])[:15]
    out.append("\n## Close to page 1 (position 8–20, 28 days)\n")
    out.append("Small pushes here (internal links, a sharper title, a section that answers the query) move the most clicks.\n\n")
    out.append(table(["Query", "Impr.", "Clicks", "Pos.", "Page"],
                     [[k, f"{q['impressions']:.0f}", f"{q['clicks']:.0f}", f"{q['position']:.1f}", short(q["page"])] for k, q in near],
                     "None."))

    weak = sorted((q for q in q_now.items()
                   if q[1]["position"] <= 5 and q[1]["impressions"] >= 100 and gsc.ctr_pct(q[1]["clicks"], q[1]["impressions"]) < 1.5),
                  key=lambda q: -q[1]["impressions"])[:12]
    out.append("\n## Ranking well but rarely clicked (position ≤ 5, CTR < 1.5%)\n")
    out.append("Check the title and description match what the searcher wants. Definitions answered on Google itself will stay low.\n\n")
    out.append(table(["Query", "Impr.", "CTR", "Pos.", "Page"],
                     [[k, f"{q['impressions']:.0f}", f"{gsc.ctr_pct(q['clicks'], q['impressions']):.2f}%", f"{q['position']:.1f}", short(q["page"])] for k, q in weak],
                     "None."))

    new = sorted((q for q in q_now.items() if q[0] not in q_before and q[1]["impressions"] >= 30),
                 key=lambda q: -q[1]["impressions"])[:12]
    out.append("\n## New queries (none in the previous 28 days)\n")
    out.append(table(["Query", "Impr.", "Pos.", "Page"],
                     [[k, f"{q['impressions']:.0f}", f"{q['position']:.1f}", short(q["page"])] for k, q in new],
                     "None with 30+ impressions."))

    out.append("\n## Sitemaps\n")
    rows = []
    for s in sitemaps():
        submitted = ", ".join(f"{c.get('submitted')} {c.get('type')}" for c in s.get("contents", []))
        flag = "⚠️ " if int(s.get("errors", 0)) or int(s.get("warnings", 0)) else ""
        rows.append([short(s.get("path", "")), f"{flag}{s.get('errors', 0)} / {s.get('warnings', 0)}", str(s.get("lastDownloaded", ""))[:10], submitted])
    out.append(table(["Sitemap", "Errors / warnings", "Last read", "URLs"], rows, "No sitemaps returned."))

    overdue = overdue_posts(today)
    out.append("\n## Blog posts past their review date\n")
    out.append(table(["Post", "Reviewed", "Overdue"],
                     [[f"/blog/{slug}/", reviewed, f"{days} days"] for slug, reviewed, days in overdue[:15]],
                     "None."))
    if len(overdue) > 15:
        out.append(f"\n_and {len(overdue) - 15} more._\n")

    print("\n".join(out))


if __name__ == "__main__":
    main()
