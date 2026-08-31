#!/usr/bin/env python3
"""Back-compat wrapper. Use scripts/gsc_search_report.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gsc_search_report import main

if __name__ == "__main__":
    raise SystemExit(main())
