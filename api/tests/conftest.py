import os

# Real env beats .env.local in pydantic-settings — pin test credentials
# BEFORE any api.* import instantiates Settings.
os.environ["ADMIN_JWT_BYPASS"] = "true"
os.environ["ADMIN_JWT_BYPASS_TOKEN"] = "admin-test-token"
os.environ["INTERNAL_API_KEY"] = "test-internal-key"

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from api.db.models import Base, Image, Label, ModelVersion, TrainingRun
from api.main import app as fastapi_app


@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16") as pg:
        yield pg


@pytest.fixture(scope="session")
async def db_engine(postgres):
    url = postgres.get_connection_url().replace("psycopg2", "asyncpg")
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    Session = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


@pytest.fixture(autouse=True)
def mock_yolo():
    from unittest.mock import MagicMock, patch
    with patch("api.services.model_manager.YOLO", return_value=MagicMock()) as mock:
        yield mock

@pytest.fixture
async def client(db_engine, db_session):
    from api.core.database import get_db

    async def _override():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _override
    fastapi_app.state.session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()



@pytest.fixture
async def seed_pending_image(db_session):
    img = Image(s3_key="raw/seed.jpg", s3_url="http://test/seed.jpg",
                uploader_id="seed", width=640, height=640, review_status="pending")
    db_session.add(img)
    await db_session.commit()
    return img.id


@pytest.fixture
async def seed_approved_labels(db_session):
    img = Image(s3_key="raw/a.jpg", s3_url="http://test/a.jpg", uploader_id="s",
                width=64, height=64, review_status="approved")
    db_session.add(img)
    await db_session.flush()
    db_session.add(Label(image_id=img.id, class_name="pcb",
                         bbox={"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2},
                         source="model", created_by="m", is_active=True))
    await db_session.commit()
    return img.id


@pytest.fixture
async def seed_active_run(db_session):
    run = TrainingRun(modal_run_id="modal-active", triggered_by="admin@test.com",
                      status="running", epochs=30)
    db_session.add(run)
    await db_session.commit()
    return run.id


@pytest.fixture
async def seed_queued_run(db_session):
    run = TrainingRun(modal_run_id="modal-q", triggered_by="admin@test.com",
                      status="queued", epochs=30)
    db_session.add(run)
    await db_session.commit()
    return run.id


def _per_class(v: float) -> dict:
    return {c: v for c in ["battery", "hard_drive", "pcb", "motherboard", "ram",
                           "copper_cable", "smartphone_device", "chip", "peripheral_other"]}


@pytest.fixture
async def seed_candidate_model(db_session):
    mv = ModelVersion(s3_key="models/cand.pt", map50=0.85, map50_95=0.60,
                      per_class=_per_class(0.85))
    db_session.add(mv)
    await db_session.commit()
    return mv.id


@pytest.fixture
async def seed_regression_candidate(db_session):
    from datetime import datetime, timezone

    base = ModelVersion(s3_key="models/base.pt", map50=0.90, map50_95=0.70,
                        per_class=_per_class(0.90), deployed_at=datetime.now(timezone.utc))
    db_session.add(base)
    await db_session.flush()
    cand = ModelVersion(s3_key="models/bad.pt", map50=0.80, map50_95=0.60,
                        per_class=_per_class(0.80))
    db_session.add(cand)
    await db_session.commit()
    return cand.id


# ── Agent fixtures (SSE stream + polling fallback) ──────────────────────────

@pytest.fixture
async def seed_image_no_dets(db_session):
    img = Image(s3_key="raw/nodets.jpg", s3_url="http://test/nodets.jpg",
                uploader_id="seed", width=640, height=640, review_status="pending")
    db_session.add(img)
    await db_session.commit()
    return {"id": img.id}


@pytest.fixture
async def seed_image_with_dets(db_session):
    from api.db.models import Detection
    img = Image(s3_key="raw/dets.jpg", s3_url="http://test/dets.jpg",
                uploader_id="seed", width=640, height=640, review_status="pending")
    db_session.add(img)
    await db_session.flush()
    db_session.add(Detection(image_id=img.id, class_name="pcb",
                             confidence=0.92,
                             bbox={"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}))
    await db_session.commit()
    return {"id": img.id}


@pytest.fixture
async def seed_image_with_agent_result(db_session):
    from api.db.models import AgentResult, Detection
    img = Image(s3_key="raw/agent.jpg", s3_url="http://test/agent.jpg",
                uploader_id="seed", width=640, height=640, review_status="pending")
    db_session.add(img)
    await db_session.flush()
    db_session.add(Detection(image_id=img.id, class_name="pcb",
                             confidence=0.92,
                             bbox={"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}))
    db_session.add(AgentResult(image_id=img.id, status="done",
                               result={"summary": "cached", "pricing": {}},
                               duration_ms=123))
    await db_session.commit()
    return {"id": img.id}


@pytest.fixture
async def seed_image_streaming(db_session):
    from api.db.models import AgentResult, Detection
    img = Image(s3_key="raw/streaming.jpg", s3_url="http://test/streaming.jpg",
                uploader_id="seed", width=640, height=640, review_status="pending")
    db_session.add(img)
    await db_session.flush()
    db_session.add(Detection(image_id=img.id, class_name="pcb",
                             confidence=0.92,
                             bbox={"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}))
    db_session.add(AgentResult(image_id=img.id, status="streaming", result=None))
    await db_session.commit()
    return {"id": img.id}
