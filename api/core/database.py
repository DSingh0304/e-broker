"""Async SQLAlchemy engine + session. Engine is rebound in tests via app.state."""
from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.core.config import settings

_engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
SessionFactory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
# Alias required by the agent SSE router (spec §7b).
async_session_factory = SessionFactory


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    factory = getattr(request.app.state, "session_factory", SessionFactory)
    async with factory() as session:
        yield session
