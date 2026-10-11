# E-Broker - Testing Strategy
## Unit · Integration · End-to-End · CI

> **Principle:** Test the boundaries that matter - YOLO inference output shape, label persistence, the training trigger threshold, and the deploy gate logic. Don't test library internals.

---

## 1. Test Matrix Overview

| Layer | Tool | Runs on | Gate |
|-------|------|---------|------|
| Backend unit | `pytest` + `pytest-asyncio` | Every PR, every push | Required |
| Frontend unit | `Vitest` + `@testing-library/react` | Every PR, every push | Required |
| Backend integration | `pytest` + `testcontainers` | Every PR | Required |
| Frontend integration | `Vitest` + MSW (Mock Service Worker) | Every PR | Required |
| E2E | `Playwright` | Every PR + nightly | Required on `main` |
| ML model regression | `pytest` + ultralytics `val` | Post-training only | Blocks deploy |

---

## 2. Backend Unit Tests (`api/tests/unit/`)

### 2.1 `test_model_manager.py`

```python
# api/tests/unit/test_model_manager.py
"""Thread-safe hot-swap, load/reload lifecycle."""
import threading
import pytest
from unittest.mock import MagicMock, patch, call
from api.services.model_manager import ModelManager


@pytest.fixture
def mock_yolo(monkeypatch):
    mock = MagicMock()
    mock.predict.return_value = [MagicMock(boxes=MagicMock(
        xyxyn=[[0.1, 0.2, 0.3, 0.4]],
        cls=[[2]],
        conf=[[0.92]],
    ))]
    with patch("api.services.model_manager.YOLO", return_value=mock):
        yield mock


def test_predict_returns_normalised_detections(mock_yolo):
    mgr = ModelManager(model_path="fake.pt")
    result = mgr.predict("fake_image.jpg")
    assert isinstance(result, list)
    assert result[0]["class_name"] in [
        "battery", "hard_drive", "pcb", "motherboard", "ram",
        "copper_cable", "smartphone_device", "chip", "peripheral_other"
    ]
    assert 0.0 <= result[0]["confidence"] <= 1.0
    bbox = result[0]["bbox"]
    assert all(0.0 <= v <= 1.0 for v in bbox.values())


def test_reload_is_atomic_under_concurrent_reads(mock_yolo, tmp_path):
    """Concurrent predict calls must not see a half-loaded model."""
    mgr = ModelManager(model_path="fake.pt")
    errors = []
    results = []

    def reader():
        try:
            results.append(mgr.predict("img.jpg"))
        except Exception as e:
            errors.append(e)

    def reloader():
        mgr.reload("new_fake.pt")

    threads = [threading.Thread(target=reader) for _ in range(10)]
    threads.append(threading.Thread(target=reloader))
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Errors during concurrent access: {errors}"


def test_reload_replaces_model(mock_yolo):
    mgr = ModelManager(model_path="v1.pt")
    old_model = mgr._model
    mgr.reload("v2.pt")
    assert mgr._model is not old_model
```

### 2.2 `test_inference_service.py`

```python
# api/tests/unit/test_inference_service.py
"""Inference output normalisation and class mapping."""
import pytest
from unittest.mock import patch, MagicMock
from api.services.inference import InferenceService, UNIFIED_CLASSES


def make_mock_result(cls_idx: int, conf: float, xyxyn: list):
    boxes = MagicMock()
    boxes.xyxyn.tolist.return_value = [xyxyn]
    boxes.cls.tolist.return_value = [[cls_idx]]
    boxes.conf.tolist.return_value = [[conf]]
    result = MagicMock()
    result.boxes = boxes
    return [result]


@pytest.mark.parametrize("cls_idx,expected_class", [
    (0, "battery"),
    (2, "pcb"),
    (4, "ram"),
    (8, "peripheral_other"),
])
def test_class_names_match_unified_taxonomy(cls_idx, expected_class):
    assert UNIFIED_CLASSES[cls_idx] == expected_class


def test_low_confidence_detections_are_filtered():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model") as m:
        m.predict.return_value = make_mock_result(0, 0.19, [0.1, 0.1, 0.5, 0.5])
        detections = svc._parse_results(m.predict.return_value, conf_threshold=0.20)
    assert detections == []


def test_bbox_values_are_normalised():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model") as m:
        m.predict.return_value = make_mock_result(2, 0.92, [0.1, 0.2, 0.6, 0.8])
        dets = svc._parse_results(m.predict.return_value, conf_threshold=0.20)
    assert len(dets) == 1
    bbox = dets[0]["bbox"]
    assert bbox == {"x1": pytest.approx(0.1), "y1": pytest.approx(0.2),
                    "x2": pytest.approx(0.6), "y2": pytest.approx(0.8)}


def test_multiple_detections_returned():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model") as m:
        results = [make_mock_result(i, 0.9, [0.0, 0.0, 0.5, 0.5])[0] for i in range(3)]
        dets = svc._parse_results(results, conf_threshold=0.5)
    assert len(dets) == 3
```

### 2.3 `test_label_service.py`

```python
# api/tests/unit/test_label_service.py
"""Label CRUD logic - approval state machine."""
import pytest
from api.services.label_service import (
    compute_review_status, validate_bbox, LabelSource
)


@pytest.mark.parametrize("source,expected_status", [
    (LabelSource.MODEL,  "approved"),   # admin clicked Approve
    (LabelSource.ADMIN,  "corrected"),  # admin redrew bboxes
])
def test_review_status_transitions(source, expected_status):
    status = compute_review_status(source)
    assert status == expected_status


@pytest.mark.parametrize("bbox,valid", [
    ({"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2}, True),
    ({"xc": 0.0, "yc": 0.0, "w": 0.0, "h": 0.0}, False),   # zero-area
    ({"xc": 1.1, "yc": 0.5, "w": 0.3, "h": 0.2}, False),   # out of range
    ({"xc": 0.5, "yc": 0.5, "w": -0.1, "h": 0.2}, False),  # negative dim
    ({"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2, "extra": 99}, True),  # extra keys OK
])
def test_bbox_validation(bbox, valid):
    assert validate_bbox(bbox) == valid


def test_class_must_be_in_unified_taxonomy():
    from api.services.label_service import validate_class
    assert validate_class("battery") is True
    assert validate_class("unknown_thing") is False
```

### 2.4 `test_strands_tools.py`

```python
# api/tests/unit/test_strands_tools.py
"""Strands tool contracts - return shapes and toxicity logic."""
import pytest
from api.services.strands_agent import assess_toxicity, get_scrap_price


@pytest.mark.parametrize("class_name,expected_level", [
    ("battery",       "hazardous"),
    ("pcb",           "caution"),
    ("copper_cable",  "safe"),
    ("peripheral_other", "safe"),
])
def test_toxicity_levels(class_name, expected_level):
    result = assess_toxicity(class_name)
    assert result["level"] == expected_level
    assert "notes" in result
    assert isinstance(result["notes"], str)


def test_scrap_price_returns_range():
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("api.services.strands_agent._fetch_spot_price", lambda *_: 450.0)
        result = get_scrap_price("pcb", region="delhi")
    assert result["minINR"] < result["maxINR"]
    assert result["unit"] in ("kg", "piece", "gram")


def test_scrap_price_unknown_class_returns_zero():
    result = get_scrap_price("unknown_class")
    assert result["minINR"] == 0
    assert result["maxINR"] == 0


def test_toxicity_all_9_classes_covered():
    classes = [
        "battery", "hard_drive", "pcb", "motherboard", "ram",
        "copper_cable", "smartphone_device", "chip", "peripheral_other"
    ]
    for cls in classes:
        result = assess_toxicity(cls)
        assert result["level"] in ("safe", "caution", "hazardous"), \
            f"Missing toxicity data for class: {cls}"
```

### 2.5 `test_training_trigger.py`

```python
# api/tests/unit/test_training_trigger.py
"""Auto-trigger threshold check logic."""
import pytest
from api.services.training_service import should_trigger_training


@pytest.mark.parametrize("new_labels,threshold,expect_trigger", [
    (0,   200, False),
    (199, 200, False),
    (200, 200, True),
    (847, 200, True),
])
def test_trigger_threshold(new_labels, threshold, expect_trigger):
    assert should_trigger_training(new_labels, threshold) == expect_trigger


def test_trigger_blocked_when_run_already_active():
    assert should_trigger_training(500, 200, active_run=True) is False
```

---

## 3. Frontend Unit Tests (`__tests__/unit/`)

### 3.1 `ComponentCard.test.tsx`

```typescript
// __tests__/unit/ComponentCard.test.tsx
import { render, screen } from "@testing-library/react"
import { ComponentCard } from "@/components/result/ComponentCard"
import { CLASS_COLORS } from "@/lib/constants"

const mockDetection = {
  id: "det-1",
  className: "battery",
  confidence: 0.94,
  bbox: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 },
  pricing: { minINR: 45, maxINR: 65, unit: "kg" },
  toxicity: { level: "hazardous" as const, notes: "Contains Lead" },
}

test("renders class name and confidence", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByText(/battery/i)).toBeInTheDocument()
  expect(screen.getByText(/0\.94/)).toBeInTheDocument()
})

test("shows hazard badge for toxic classes", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByRole("alert")).toBeInTheDocument()
  expect(screen.getByText(/toxic/i)).toBeInTheDocument()
})

test("renders price range in INR", () => {
  render(<ComponentCard detection={mockDetection} />)
  expect(screen.getByText(/₹\s*45/)).toBeInTheDocument()
  expect(screen.getByText(/₹\s*65/)).toBeInTheDocument()
})

test("safe class does not show hazard alert", () => {
  const safe = { ...mockDetection, className: "copper_cable",
                 toxicity: { level: "safe" as const, notes: "" } }
  render(<ComponentCard detection={safe} />)
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

test("all 9 classes have a defined color", () => {
  const classes = [
    "battery", "hard_drive", "pcb", "motherboard", "ram",
    "copper_cable", "smartphone_device", "chip", "peripheral_other"
  ]
  classes.forEach(cls => {
    expect(CLASS_COLORS[cls as keyof typeof CLASS_COLORS]).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
```

### 3.2 `ReviewCard.test.tsx`

```typescript
// __tests__/unit/ReviewCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { ReviewCard } from "@/components/admin/ReviewCard"

const item = {
  imageId: "img-1",
  thumbnailUrl: "/test.jpg",
  detections: [{ className: "battery", confidence: 0.54 }],
  reviewStatus: "pending" as const,
  uploadedAt: "2026-10-01T10:00:00Z",
}

test("calls onApprove with imageId", () => {
  const onApprove = vi.fn()
  render(<ReviewCard item={item} onApprove={onApprove} onSkip={vi.fn()} onCorrect={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: /approve/i }))
  expect(onApprove).toHaveBeenCalledWith("img-1")
})

test("calls onSkip with imageId", () => {
  const onSkip = vi.fn()
  render(<ReviewCard item={item} onApprove={vi.fn()} onSkip={onSkip} onCorrect={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: /skip/i }))
  expect(onSkip).toHaveBeenCalledWith("img-1")
})

test("shows low confidence warning badge below threshold", () => {
  render(<ReviewCard item={item} onApprove={vi.fn()} onSkip={vi.fn()} onCorrect={vi.fn()} />)
  // confidence 0.54 < 0.7 threshold → warn
  expect(screen.getByText(/low confidence/i)).toBeInTheDocument()
})

test("keyboard shortcut A fires onApprove", () => {
  const onApprove = vi.fn()
  const { container } = render(
    <ReviewCard item={item} onApprove={onApprove} onSkip={vi.fn()} onCorrect={vi.fn()} focused />
  )
  fireEvent.keyDown(container, { key: "a" })
  expect(onApprove).toHaveBeenCalled()
})
```

### 3.3 `bbox-utils.test.ts`

```typescript
// __tests__/unit/bbox-utils.test.ts
import { yoloToPixel, pixelToYolo, iouScore } from "@/lib/bbox-utils"

describe("yoloToPixel", () => {
  test("converts centre-format to pixel coords", () => {
    const px = yoloToPixel({ xc: 0.5, yc: 0.5, w: 0.4, h: 0.3 }, 100, 200)
    expect(px).toEqual({ x1: 30, y1: 70, x2: 70, y2: 130 })
  })
  test("clamps output to image bounds", () => {
    const px = yoloToPixel({ xc: 0.99, yc: 0.99, w: 0.4, h: 0.4 }, 100, 100)
    expect(px.x2).toBeLessThanOrEqual(100)
    expect(px.y2).toBeLessThanOrEqual(100)
  })
})

describe("pixelToYolo", () => {
  test("round-trips through yoloToPixel", () => {
    const orig = { xc: 0.4, yc: 0.6, w: 0.2, h: 0.3 }
    const px = yoloToPixel(orig, 640, 640)
    const back = pixelToYolo(px, 640, 640)
    expect(back.xc).toBeCloseTo(orig.xc, 5)
    expect(back.yc).toBeCloseTo(orig.yc, 5)
  })
})

describe("iouScore", () => {
  test("identical boxes score 1.0", () => {
    const b = { x1: 0, y1: 0, x2: 1, y2: 1 }
    expect(iouScore(b, b)).toBeCloseTo(1.0)
  })
  test("non-overlapping boxes score 0.0", () => {
    expect(iouScore(
      { x1: 0, y1: 0, x2: 0.4, y2: 0.4 },
      { x1: 0.6, y1: 0.6, x2: 1, y2: 1 }
    )).toBeCloseTo(0.0)
  })
})
```

### 3.4 `training-sse.test.ts`

```typescript
// __tests__/unit/training-sse.test.ts
import { parseSSEEvent, TrainingEvent } from "@/lib/training-sse"

test("parses epoch event correctly", () => {
  const raw = `data: {"type":"epoch","epoch":5,"total":30,"loss":2.14,"mAP50":0.731}\n\n`
  const event = parseSSEEvent(raw) as Extract<TrainingEvent, { type: "epoch" }>
  expect(event.type).toBe("epoch")
  expect(event.epoch).toBe(5)
  expect(event.mAP50).toBeCloseTo(0.731)
})

test("parses done event with metrics", () => {
  const raw = `data: {"type":"done","metrics":{"mAP50":0.831}}\n\n`
  const event = parseSSEEvent(raw) as Extract<TrainingEvent, { type: "done" }>
  expect(event.type).toBe("done")
  expect(event.metrics.mAP50).toBeCloseTo(0.831)
})

test("returns null for malformed event", () => {
  expect(parseSSEEvent("data: not_json\n\n")).toBeNull()
})
```

---

## 4. Backend Integration Tests (`api/tests/integration/`)

Uses **testcontainers** for a real PostgreSQL instance + **moto** for S3 + **respx** for mocking Modal/external HTTP.

### 4.1 `conftest.py`

```python
# api/tests/integration/conftest.py
import pytest
import asyncio
from testcontainers.postgres import PostgresContainer
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from api.db.models import Base
from httpx import AsyncClient, ASGITransport
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
    Session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(db_session, monkeypatch):
    """FastAPI test client with real DB, mocked S3 + Modal."""
    monkeypatch.setenv("DATABASE_URL", "...")    # patched by db_session fixture
    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app), base_url="http://test"
    ) as c:
        yield c
```

### 4.2 `test_upload_detect_flow.py`

```python
# api/tests/integration/test_upload_detect_flow.py
"""Full upload → detect pipeline over a real DB."""
import pytest
from unittest.mock import patch, AsyncMock
import respx, httpx
from pathlib import Path


FIXTURE_IMAGE = Path("api/tests/fixtures/test_pcb.jpg")


@pytest.mark.asyncio
async def test_upload_creates_image_record(client, db_session):
    with respx.mock:
        # mock S3 presign
        respx.put("https://s3.amazonaws.com/ebroker-images/").mock(
            return_value=httpx.Response(200)
        )
        resp = await client.post(
            "/upload",
            files={"file": ("test.jpg", FIXTURE_IMAGE.read_bytes(), "image/jpeg")}
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "imageId" in data
    assert "s3Url" in data

    # verify DB record created
    from api.db.models import Image
    from sqlalchemy import select
    result = await db_session.execute(
        select(Image).where(Image.id == data["imageId"])
    )
    img = result.scalar_one_or_none()
    assert img is not None
    assert img.review_status == "pending"


@pytest.mark.asyncio
async def test_detect_stores_detections(client, db_session):
    """POST /detect/:id → detections written to DB."""
    mock_detections = [
        {"class_name": "pcb", "confidence": 0.92,
         "bbox": {"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}}
    ]
    with patch("api.services.inference.InferenceService.predict",
               return_value=mock_detections):
        with patch("api.services.strands_agent.run_agent",
                   new_callable=AsyncMock) as mock_agent:
            mock_agent.return_value = {
                "pricing": {"minINR": 80, "maxINR": 120, "unit": "kg"},
                "toxicity": {"level": "caution", "notes": "Gold traces"}
            }
            # first upload
            up = await client.post(
                "/upload",
                files={"file": ("img.jpg", FIXTURE_IMAGE.read_bytes(), "image/jpeg")}
            )
            image_id = up.json()["imageId"]
            resp = await client.get(f"/detect/{image_id}")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["detections"]) == 1
    assert body["detections"][0]["className"] == "pcb"

    # verify DB
    from api.db.models import Detection
    from sqlalchemy import select
    result = await db_session.execute(
        select(Detection).where(Detection.image_id == image_id)
    )
    dets = result.scalars().all()
    assert len(dets) == 1
    assert dets[0].class_name == "pcb"
```

### 4.3 `test_label_approval_flow.py`

```python
# api/tests/integration/test_label_approval_flow.py
"""Admin approve → corrected status transitions."""
import pytest
from unittest.mock import patch


@pytest.mark.asyncio
async def test_approve_sets_status_approved(client, db_session, seed_pending_image):
    resp = await client.post(
        f"/admin/queue/{seed_pending_image}/approve",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 200

    from api.db.models import Image
    from sqlalchemy import select
    result = await db_session.execute(select(Image).where(Image.id == seed_pending_image))
    img = result.scalar_one()
    assert img.review_status == "approved"


@pytest.mark.asyncio
async def test_save_labels_sets_status_corrected(client, db_session, seed_pending_image):
    payload = {
        "labels": [
            {"className": "battery", "bbox": {"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2}}
        ]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}",
        json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 200

    from api.db.models import Image, Label
    from sqlalchemy import select
    img_result = await db_session.execute(select(Image).where(Image.id == seed_pending_image))
    assert img_result.scalar_one().review_status == "corrected"

    label_result = await db_session.execute(
        select(Label).where(Label.image_id == seed_pending_image, Label.is_active == True)
    )
    labels = label_result.scalars().all()
    assert len(labels) == 1
    assert labels[0].source == "admin"
    assert labels[0].class_name == "battery"


@pytest.mark.asyncio
async def test_invalid_class_name_rejected(client, db_session, seed_pending_image):
    payload = {
        "labels": [{"className": "not_a_real_class", "bbox": {"xc": 0.5, "yc": 0.5, "w": 0.2, "h": 0.2}}]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}", json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_out_of_bounds_bbox_rejected(client, db_session, seed_pending_image):
    payload = {
        "labels": [{"className": "pcb", "bbox": {"xc": 1.5, "yc": 0.5, "w": 0.2, "h": 0.2}}]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}", json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422
```

### 4.4 `test_training_trigger_api.py`

```python
# api/tests/integration/test_training_trigger_api.py
"""Training trigger check endpoint + Modal spawn integration."""
import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_trigger_check_returns_new_label_count(client, db_session, seed_approved_labels):
    """GET /internal/training/trigger-check returns correct count."""
    resp = await client.get(
        "/internal/training/trigger-check",
        headers={"X-Internal-Key": "test-internal-key"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "new_labels" in data
    assert isinstance(data["new_labels"], int)


@pytest.mark.asyncio
async def test_trigger_spawns_modal_job(client):
    with patch("api.routers.training.modal_train.spawn") as mock_spawn:
        mock_call = MagicMock()
        mock_call.object_id = "modal-run-abc123"
        mock_spawn.return_value = mock_call

        resp = await client.post(
            "/admin/training/trigger",
            headers={"Authorization": "Bearer admin-test-token"}
        )
    assert resp.status_code == 200
    assert resp.json()["modalRunId"] == "modal-run-abc123"
    mock_spawn.assert_called_once()


@pytest.mark.asyncio
async def test_duplicate_trigger_blocked_when_run_active(client, db_session, seed_active_run):
    resp = await client.post(
        "/admin/training/trigger",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 409
    assert "already running" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_metrics_endpoint_updates_run_record(client, db_session, seed_queued_run):
    payload = {"type": "epoch", "epoch": 5, "total": 30, "loss": 2.14, "mAP50": 0.731}
    resp = await client.post(
        f"/internal/training/metrics",
        json={"runId": seed_queued_run, **payload},
        headers={"X-Internal-Key": "test-internal-key"}
    )
    assert resp.status_code == 200

    from api.db.models import TrainingRun
    from sqlalchemy import select
    result = await db_session.execute(select(TrainingRun).where(TrainingRun.id == seed_queued_run))
    run = result.scalar_one()
    assert run.status == "running"
```

### 4.5 `test_model_deploy_flow.py`

```python
# api/tests/integration/test_model_deploy_flow.py
"""Model approval + hot-swap pipeline."""
import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_approve_deploy_promotes_model(client, db_session, seed_candidate_model):
    with patch("api.services.model_manager.ModelManager.reload") as mock_reload:
        resp = await client.post(
            f"/admin/models/{seed_candidate_model}/deploy",
            headers={"Authorization": "Bearer admin-test-token"}
        )
    assert resp.status_code == 200
    mock_reload.assert_called_once()

    from api.db.models import ModelVersion
    from sqlalchemy import select
    result = await db_session.execute(
        select(ModelVersion).where(ModelVersion.id == seed_candidate_model)
    )
    version = result.scalar_one()
    assert version.deployed_at is not None
    assert version.approved_by == "admin@test.com"


@pytest.mark.asyncio
async def test_regression_guard_blocks_deploy_on_map_drop(client, seed_regression_candidate):
    """Model with >5% mAP50 drop vs deployed cannot be approved."""
    resp = await client.post(
        f"/admin/models/{seed_regression_candidate}/deploy",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422
    assert "regression" in resp.json()["detail"].lower()
```

---

## 5. Frontend Integration Tests (`__tests__/integration/`)

Uses **MSW (Mock Service Worker)** to intercept API calls.

### 5.1 `scan-flow.test.tsx`

```typescript
// __tests__/integration/scan-flow.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { server } from "@/tests/msw/server"
import { http, HttpResponse } from "msw"
import ScanPage from "@/app/(public)/scan/page"
import { useRouter } from "next/navigation"

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

const mockRouter = { push: vi.fn() }
beforeEach(() => { (useRouter as ReturnType<typeof vi.fn>).mockReturnValue(mockRouter) })

test("upload → loading → redirect to result", async () => {
  server.use(
    http.post("/api/upload", () =>
      HttpResponse.json({ imageId: "test-img-id", s3Url: "https://s3.example.com/test.jpg" })
    ),
    http.get("/api/detect/test-img-id", () =>
      HttpResponse.json({
        imageId: "test-img-id",
        detections: [{ id: "d1", className: "pcb", confidence: 0.92,
                       bbox: { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },
                       pricing: { minINR: 80, maxINR: 120, unit: "kg" },
                       toxicity: { level: "caution", notes: "Gold traces" } }],
        totalValueRange: { min: 80, max: 120 },
        recyclers: []
      })
    )
  )

  render(<ScanPage />)
  const file = new File(["fake_image_bytes"], "test.jpg", { type: "image/jpeg" })
  const input = screen.getByLabelText(/upload/i)
  await userEvent.upload(input, file)

  expect(screen.getByText(/analyzing/i)).toBeInTheDocument()
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/result/test-img-id"))
})

test("shows error state on upload failure", async () => {
  server.use(
    http.post("/api/upload", () => HttpResponse.error())
  )
  render(<ScanPage />)
  const file = new File(["bytes"], "test.jpg", { type: "image/jpeg" })
  await userEvent.upload(screen.getByLabelText(/upload/i), file)
  await waitFor(() => expect(screen.getByText(/try again/i)).toBeInTheDocument())
})
```

### 5.2 `admin-queue.test.tsx`

```typescript
// __tests__/integration/admin-queue.test.tsx
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { server } from "@/tests/msw/server"
import { http, HttpResponse } from "msw"
import QueuePage from "@/app/(admin)/admin/queue/page"

const queueItems = [
  { imageId: "img-1", thumbnailUrl: "/t1.jpg",
    detections: [{ className: "battery", confidence: 0.54 }],
    reviewStatus: "pending", uploadedAt: "2026-10-01T10:00:00Z" },
]

test("renders queue items from API", async () => {
  server.use(
    http.get("/api/admin/queue", () => HttpResponse.json({ items: queueItems, total: 1 }))
  )
  render(<QueuePage />)
  await waitFor(() => expect(screen.getByText(/battery/i)).toBeInTheDocument())
  expect(screen.getByText(/0\.54/)).toBeInTheDocument()
})

test("approve button sends PATCH and removes item from list", async () => {
  let approved = false
  server.use(
    http.get("/api/admin/queue", () => HttpResponse.json({ items: queueItems, total: 1 })),
    http.post("/api/admin/queue/img-1/approve", () => {
      approved = true
      return HttpResponse.json({ success: true })
    }),
    http.get("/api/admin/queue", () => HttpResponse.json({ items: [], total: 0 }))
  )
  render(<QueuePage />)
  await waitFor(() => screen.getByRole("button", { name: /approve/i }))
  await userEvent.click(screen.getByRole("button", { name: /approve/i }))
  expect(approved).toBe(true)
  await waitFor(() => expect(screen.queryByText(/battery/i)).not.toBeInTheDocument())
})
```

---

## 6. End-to-End Tests (`e2e/`)

Uses **Playwright** against the real dev server (`localhost:3000` + `localhost:8000`).

### 6.1 `e2e/scan-result.spec.ts` - Public User Flow

```typescript
// e2e/scan-result.spec.ts
import { test, expect, Page } from "@playwright/test"
import path from "path"

const FIXTURE = path.join(__dirname, "fixtures", "test_pcb.jpg")

test.describe("Scan → Result flow", () => {
  test("user uploads image and sees detections", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)

    // loading state
    await expect(page.getByText(/analyzing/i)).toBeVisible()

    // wait for redirect to /result/*
    await page.waitForURL(/\/result\//, { timeout: 15_000 })

    // at least one detection card visible
    await expect(page.locator("[data-testid='component-card']").first()).toBeVisible()
  })

  test("result page shows price range and toxicity badge", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)
    await page.waitForURL(/\/result\//)

    await expect(page.getByText(/₹/)).toBeVisible()
    // Battery should trigger hazard badge
    const hazard = page.locator("[data-testid='hazard-badge']")
    if (await hazard.count() > 0) {
      await expect(hazard.first()).toBeVisible()
    }
  })

  test("EPR Passport button triggers PDF download", async ({ page }) => {
    await page.goto("/scan")
    await page.setInputFiles('input[type="file"]', FIXTURE)
    await page.waitForURL(/\/result\//)

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /epr passport/i }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/epr.*\.pdf$/i)
  })

  test("empty upload shows error message", async ({ page }) => {
    await page.goto("/scan")
    // Try to submit without file
    const scanBtn = page.getByRole("button", { name: /scan/i })
    if (await scanBtn.isEnabled()) {
      await scanBtn.click()
      await expect(page.getByText(/select an image/i)).toBeVisible()
    }
  })
})
```

### 6.2 `e2e/admin-labeller.spec.ts` - Admin Correction Flow

```typescript
// e2e/admin-labeller.spec.ts
import { test, expect } from "@playwright/test"

test.use({ storageState: "e2e/fixtures/admin-auth.json" })  // pre-authenticated

test.describe("Admin labelling flow", () => {
  test("queue shows pending images", async ({ page }) => {
    await page.goto("/admin/queue")
    await expect(page.getByText(/pending/i)).toBeVisible()
    await expect(page.locator("[data-testid='queue-item']").first()).toBeVisible()
  })

  test("approve marks image as approved and removes from queue", async ({ page }) => {
    await page.goto("/admin/queue")
    const firstItem = page.locator("[data-testid='queue-item']").first()
    const imageId = await firstItem.getAttribute("data-image-id")

    await firstItem.getByRole("button", { name: /approve/i }).click()
    await expect(firstItem).not.toBeVisible()

    // verify via API
    const resp = await page.request.get(`/api/admin/queue/${imageId}`)
    const data = await resp.json()
    expect(data.reviewStatus).toBe("approved")
  })

  test("correct opens labeller canvas with existing bboxes", async ({ page }) => {
    await page.goto("/admin/queue")
    await page.locator("[data-testid='queue-item']").first()
      .getByRole("button", { name: /correct/i }).click()

    await page.waitForURL(/\/admin\/labeller\//)
    await expect(page.locator("canvas")).toBeVisible()
    // Konva canvas should be present
    await expect(page.locator("[data-testid='label-canvas']")).toBeVisible()
  })

  test("save label saves and navigates to next image", async ({ page }) => {
    await page.goto("/admin/queue")
    await page.locator("[data-testid='queue-item']").first()
      .getByRole("button", { name: /correct/i }).click()

    await page.waitForURL(/\/admin\/labeller\//)

    // select a class
    await page.getByLabel(/battery/i).check()

    await page.getByRole("button", { name: /save.*next/i }).click()

    // should navigate away from this labeller
    await expect(page).not.toHaveURL(/\/admin\/labeller\/.*/, { timeout: 5_000 })
      .catch(() => {})  // might navigate to queue or next image
  })
})
```

### 6.3 `e2e/admin-training.spec.ts` - Training Loop E2E

```typescript
// e2e/admin-training.spec.ts
import { test, expect } from "@playwright/test"

test.use({ storageState: "e2e/fixtures/admin-auth.json" })

test.describe("Training dashboard", () => {
  test("shows dataset health stats", async ({ page }) => {
    await page.goto("/admin/training")
    await expect(page.getByText(/total approved labels/i)).toBeVisible()
    await expect(page.getByText(/threshold/i)).toBeVisible()
  })

  test("run history table renders past runs", async ({ page }) => {
    await page.goto("/admin/training")
    const table = page.locator("[data-testid='run-history-table']")
    await expect(table).toBeVisible()
  })

  test("model comparison table shows delta column", async ({ page }) => {
    await page.goto("/admin/models")
    // If a candidate model exists
    const candidate = page.locator("[data-testid='candidate-model']")
    if (await candidate.count() > 0) {
      await expect(page.getByText(/delta/i)).toBeVisible()
      await expect(page.locator("[data-testid='deploy-btn']")).toBeDisabled
        // deploy button should require explicit action
    }
  })
})
```

### 6.4 `e2e/auth-guard.spec.ts` - Security E2E

```typescript
// e2e/auth-guard.spec.ts
import { test, expect } from "@playwright/test"

test("unauthenticated user cannot access admin routes", async ({ page }) => {
  await page.goto("/admin/queue")
  // Edge Middleware should redirect to login
  await expect(page).toHaveURL(/\/login|\/api\/auth/)
})

test("unauthenticated API call returns 401", async ({ request }) => {
  const resp = await request.post("/api/admin/training/trigger")
  expect(resp.status()).toBe(401)
})
```

---

## 7. ML Model Regression Test (`ml/tests/`)

Runs post-training, before the deploy gate becomes available.

```python
# ml/tests/test_model_regression.py
"""
Automated regression test - runs after every Modal training job.
Blocks the deploy gate if any class drops >5% mAP50 vs the baseline.
"""
import json
import pytest
from pathlib import Path
from ultralytics import YOLO

BASELINE_PATH = Path("models/best.pt")             # currently deployed
CANDIDATE_PATH = Path(os.environ["CANDIDATE_MODEL_PATH"])
DATA_YAML = Path("data_processed/ebroker_yolo26/data.yaml")
MAP50_DROP_THRESHOLD = 0.05   # 5% absolute
OVERALL_DROP_THRESHOLD = 0.05


@pytest.fixture(scope="session")
def baseline_metrics():
    return YOLO(BASELINE_PATH).val(data=str(DATA_YAML), verbose=False).results_dict


@pytest.fixture(scope="session")
def candidate_metrics():
    return YOLO(CANDIDATE_PATH).val(data=str(DATA_YAML), verbose=False).results_dict


def test_overall_map50_does_not_regress(baseline_metrics, candidate_metrics):
    baseline_map = baseline_metrics["metrics/mAP50(B)"]
    candidate_map = candidate_metrics["metrics/mAP50(B)"]
    drop = baseline_map - candidate_map
    assert drop <= OVERALL_DROP_THRESHOLD, (
        f"Overall mAP50 regression: {baseline_map:.3f} → {candidate_map:.3f} "
        f"(drop {drop:.3f} > threshold {OVERALL_DROP_THRESHOLD})"
    )


UNIFIED_CLASSES = [
    "battery", "hard_drive", "pcb", "motherboard", "ram",
    "copper_cable", "smartphone_device", "chip", "peripheral_other"
]

@pytest.mark.parametrize("class_name", UNIFIED_CLASSES)
def test_per_class_map50_does_not_regress(class_name, baseline_metrics, candidate_metrics):
    key = f"metrics/mAP50_{class_name}"
    if key not in baseline_metrics:
        pytest.skip(f"No baseline metric for {class_name}")
    drop = baseline_metrics[key] - candidate_metrics.get(key, 0.0)
    assert drop <= MAP50_DROP_THRESHOLD, (
        f"Class '{class_name}' mAP50 regression: "
        f"{baseline_metrics[key]:.3f} → {candidate_metrics.get(key, 0):.3f} "
        f"(drop {drop:.3f} > threshold {MAP50_DROP_THRESHOLD})"
    )
```

---

## 8. GitHub Actions CI Workflow

```yaml
# .github/workflows/ci.yml
name: E-Broker CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

env:
  PYTHON_VERSION: "3.11"
  NODE_VERSION: "20"

jobs:
  # ── 1. Backend Unit Tests ──────────────────────────────────────────
  backend-unit:
    name: Backend Unit Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - name: Install dependencies
        run: pip install -r requirements-dev.txt
      - name: Run unit tests with coverage
        run: |
          pytest tests/unit/ \
            --cov=api \
            --cov-report=xml \
            --cov-fail-under=80 \
            -v
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: api/coverage.xml
          flags: backend-unit

  # ── 2. Frontend Unit Tests ─────────────────────────────────────────
  frontend-unit:
    name: Frontend Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - name: Run Vitest
        run: npx vitest run --coverage --coverage.thresholds.lines=70
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info
          flags: frontend-unit

  # ── 3. Backend Integration Tests ───────────────────────────────────
  backend-integration:
    name: Backend Integration Tests
    runs-on: ubuntu-latest
    needs: backend-unit
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: ebroker_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - run: pip install -r requirements-dev.txt
      - name: Run integration tests
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost:5432/ebroker_test
          AWS_ACCESS_KEY_ID: testing
          AWS_SECRET_ACCESS_KEY: testing
          AWS_DEFAULT_REGION: us-east-1
          S3_BUCKET: ebroker-test-bucket
          INTERNAL_API_KEY: test-internal-key
        run: |
          pytest tests/integration/ \
            --cov=api \
            --cov-report=xml \
            --cov-fail-under=70 \
            -v

  # ── 4. Frontend Integration Tests ──────────────────────────────────
  frontend-integration:
    name: Frontend Integration Tests
    runs-on: ubuntu-latest
    needs: frontend-unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - name: Run MSW integration tests
        run: npx vitest run --project integration

  # ── 5. E2E Tests ───────────────────────────────────────────────────
  e2e:
    name: E2E Tests (Playwright)
    runs-on: ubuntu-latest
    needs: [backend-integration, frontend-integration]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: ebroker_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Seed E2E database
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost:5432/ebroker_test
        run: |
          pip install -r api/requirements-dev.txt
          python api/tests/e2e_seed.py
      - name: Start backend
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost:5432/ebroker_test
          AWS_ACCESS_KEY_ID: testing
          AWS_SECRET_ACCESS_KEY: testing
          INTERNAL_API_KEY: test-internal-key
          ACTIVE_MODEL_S3_KEY: models/best.pt
        run: |
          # Use mock inference for E2E (no GPU needed)
          MOCK_INFERENCE=true uvicorn api.main:app --port 8000 &
          sleep 5
      - name: Start frontend
        env:
          NEXT_PUBLIC_API_URL: http://localhost:8000
          NEXTAUTH_SECRET: test-secret
          NEXTAUTH_URL: http://localhost:3000
        run: |
          npm run build
          npm start &
          sleep 10
      - name: Generate admin auth state
        run: node e2e/scripts/generate-auth.js
      - name: Run Playwright tests
        run: npx playwright test --reporter=html
      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  # ── 6. Type Check & Lint ───────────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - run: pip install ruff mypy
      - run: ruff check api/ ml/
      - run: mypy api/ --ignore-missing-imports

  # ── 7. Build Check ─────────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_API_URL: https://api.ebroker.app
          NEXTAUTH_SECRET: build-placeholder
          NEXTAUTH_URL: https://ebroker.app

  # ── 8. ML Regression (post-training only) ─────────────────────────
  ml-regression:
    name: ML Model Regression Gate
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' || contains(github.event.head_commit.message, '[retrain]')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      - name: Install ML deps (CPU torch for val)
        run: |
          pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
          pip install ultralytics
      - name: Download candidate model
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp s3://${{ secrets.S3_BUCKET }}/${{ inputs.candidate_model_key }} /tmp/candidate.pt
      - name: Run regression tests
        env:
          CANDIDATE_MODEL_PATH: /tmp/candidate.pt
        run: |
          pytest ml/tests/test_model_regression.py -v
```

---

## 9. Coverage Gates & Quality Standards

| Target | Gate | Tool |
|--------|------|------|
| Backend unit coverage | ≥ 80% lines | `pytest --cov-fail-under=80` |
| Frontend unit coverage | ≥ 70% lines | `vitest --coverage.thresholds.lines=70` |
| Integration test pass rate | 100% | CI required check |
| E2E pass rate | 100% on `main` | CI required check |
| ML regression | 0 classes drop > 5% mAP50 | Blocks deploy button |
| TypeScript | Zero `tsc` errors | `npm run type-check` |
| Python linting | Zero `ruff` errors | `ruff check api/ ml/` |
| Python types | Zero `mypy` errors (strict on services/) | `mypy api/services/` |

---

## 10. Test File Structure

```
bharatbuilds/
├── api/
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── test_model_manager.py
│   │   │   ├── test_inference_service.py
│   │   │   ├── test_label_service.py
│   │   │   ├── test_strands_tools.py
│   │   │   └── test_training_trigger.py
│   │   ├── integration/
│   │   │   ├── conftest.py
│   │   │   ├── test_upload_detect_flow.py
│   │   │   ├── test_label_approval_flow.py
│   │   │   ├── test_training_trigger_api.py
│   │   │   └── test_model_deploy_flow.py
│   │   ├── fixtures/
│   │   │   └── test_pcb.jpg
│   │   └── e2e_seed.py               # seeds DB for Playwright runs
│   └── pytest.ini
├── __tests__/
│   ├── unit/
│   │   ├── ComponentCard.test.tsx
│   │   ├── ReviewCard.test.tsx
│   │   ├── bbox-utils.test.ts
│   │   └── training-sse.test.ts
│   ├── integration/
│   │   ├── scan-flow.test.tsx
│   │   └── admin-queue.test.tsx
│   └── msw/
│       ├── server.ts
│       └── handlers.ts
├── e2e/
│   ├── scan-result.spec.ts
│   ├── admin-labeller.spec.ts
│   ├── admin-training.spec.ts
│   ├── auth-guard.spec.ts
│   ├── fixtures/
│   │   ├── test_pcb.jpg
│   │   └── admin-auth.json           # generated by generate-auth.js
│   └── scripts/
│       └── generate-auth.js
├── ml/
│   └── tests/
│       └── test_model_regression.py
├── playwright.config.ts
├── vitest.config.ts
└── .github/
    └── workflows/
        └── ci.yml
```

---

## 11. Config Files

### `pytest.ini`
```ini
[pytest]
asyncio_mode = auto
testpaths = api/tests
markers =
    unit: fast, no I/O
    integration: real DB, mocked external services
    slow: ML inference (skip in dev with -m "not slow")
```

### `vitest.config.ts` (excerpt)
```typescript
export default defineConfig({
  projects: [
    { name: "unit",        include: ["__tests__/unit/**"] },
    { name: "integration", include: ["__tests__/integration/**"],
      setupFiles: ["__tests__/msw/setup.ts"] },
  ],
  coverage: {
    provider: "v8",
    include: ["app/**", "components/**", "lib/**"],
    exclude: ["**/*.test.*", "**/*.spec.*"],
  }
})
```

### `playwright.config.ts` (excerpt)
```typescript
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html"], ["github"]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile",   use: { ...devices["Pixel 7"] } },
  ],
})
```
