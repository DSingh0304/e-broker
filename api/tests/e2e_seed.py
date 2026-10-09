"""Seeds the E2E database with a reviewed image + labels (CI Playwright runs)."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.db.models import Base, Detection, Image, Label


async def main(url: str) -> None:
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s:
        from sqlalchemy import delete
        # Full wipe: E2E specs assume an isolated queue (approve test needs the
        # seeded image to be the only pending row). Run seed before each project.
        await s.execute(delete(Detection))
        await s.execute(delete(Label))
        await s.execute(delete(Image))
        await s.flush()
        img = Image(id="e2e-img-1", s3_key="raw/e2e.jpg", s3_url="http://test/e2e.jpg",
                    uploader_id="e2e", width=640, height=640, review_status="pending")
        s.add(img)
        await s.flush()
        s.add(Detection(image_id=img.id, class_name="pcb", confidence=0.92,
                        bbox={"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}))
        s.add(Label(image_id=img.id, class_name="battery",
                    bbox={"xc": 0.5, "yc": 0.5, "w": 0.2, "h": 0.2},
                    source="model", created_by="e2e", is_active=True))
        await s.commit()
    await engine.dispose()
    print("e2e seed ok")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else
                     "postgresql+asyncpg://postgres:test@localhost:5432/ebroker_test"))
