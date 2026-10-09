"""Production seed wrapper for the E-Broker database.

Usage:
    python -m api.scripts.seed_production [--db-url ...] [--images N]
    python api/scripts/seed_production.py [--db-url ...] [--images N]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.core.config import settings
from api.scripts.seed_demo import main as seed_main

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Seed the E-Broker production database")
    ap.add_argument("--db-url", default=settings.DATABASE_URL)
    ap.add_argument("--images", type=int, default=15)
    ap.add_argument("--image-dir", default="data_processed/ebroker_yolo26",
                    help="sample image bytes from this dir (training dataset)")
    ap.add_argument("--listings", type=int, default=55)
    ap.add_argument("--agent-results", type=int, default=55)
    ap.add_argument("--recyclers", type=int, default=55)
    ap.add_argument("--runs", type=int, default=55)
    args = ap.parse_args()
    print("Seeding production database...")
    asyncio.run(seed_main(args.db_url, args.images, args.image_dir,
                          args.listings, args.agent_results,
                          args.recyclers, args.runs))
    print("Seeding completed successfully.")
