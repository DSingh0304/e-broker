"""Seed recyclers table from CPCB CSV. Usage: python api/scripts/seed_recyclers.py --csv data/recyclers_cpcb.csv"""
import argparse
import asyncio
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def main(csv_path: str, db_url: str) -> int:
    import asyncio

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from api.db.models import Recycler

    rows = await asyncio.to_thread(_read_csv, csv_path)
    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        for row in rows:
            s.add(Recycler(
                name=row["name"], address=row["address"], city=row["city"],
                state=row["state"], lat=float(row["lat"]), lng=float(row["lng"]),
                phone=row.get("phone") or None, cpcb_reg_no=row.get("cpcb_reg_no") or None,
                accepts=(row.get("accepts") or "").split(";") or None,
            ))
        await s.commit()
    await engine.dispose()
    print(f"seeded {len(rows)} recyclers")
    return 0


def _read_csv(csv_path: str) -> list[dict]:
    with open(csv_path, newline="") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/recyclers_cpcb.csv")
    ap.add_argument("--db", default="postgresql+asyncpg://ebroker:ebroker_dev_password@localhost:5432/ebroker")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.csv, args.db)))
