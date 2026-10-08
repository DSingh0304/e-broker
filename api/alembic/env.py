"""Alembic env (async engine, metadata autogenerate support)."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from api.db.models import Base

config = context.config


def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url").replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url)

    async def _run():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_run())


run_migrations_online()
