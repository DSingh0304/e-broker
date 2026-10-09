"""Full upload → detect pipeline over a real DB."""
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import respx

FIXTURE_IMAGE = Path("api/tests/fixtures/test_pcb.jpg")


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
    from sqlalchemy import select

    from api.db.models import Image
    result = await db_session.execute(
        select(Image).where(Image.id == data["imageId"])
    )
    img = result.scalar_one_or_none()
    assert img is not None
    assert img.review_status == "pending"


async def test_detect_stores_detections(client, db_session):
    """POST /detect/:id → detections written to DB."""
    mock_detections = [
        {"class_name": "pcb", "confidence": 0.92,
         "bbox": {"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}}
    ]
    with patch("api.services.inference.InferenceService.predict",
               return_value=mock_detections), patch("api.services.strands_agent.run_agent",
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
    from sqlalchemy import select

    from api.db.models import Detection
    result = await db_session.execute(
        select(Detection).where(Detection.image_id == image_id)
    )
    dets = result.scalars().all()
    assert len(dets) == 1
    assert dets[0].class_name == "pcb"
