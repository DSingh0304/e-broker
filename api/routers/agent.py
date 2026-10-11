"""Agent router: SSE stream of agent thinking + polling fallback."""
from __future__ import annotations

import asyncio
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_db
from api.db.models import AgentResult, Detection, Image
from api.services import strands_agent
from api.services.agent_cache import (
    mark_streaming,
    save_error,
    save_result,
)

log = logging.getLogger("ebroker.agent_router")
router = APIRouter()

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def _validate_uuid(image_id: str) -> str:
    if not _UUID_RE.match(image_id.lower()):
        raise HTTPException(400, "Invalid image_id format")
    return image_id


async def _get_image_and_detections(image_id: str, db: AsyncSession):
    img = (await db.execute(
        select(Image).where(Image.id == image_id)
    )).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    dets = (await db.execute(
        select(Detection).where(Detection.image_id == image_id)
    )).scalars().all()
    return img, [
        {"class_name": d.class_name, "confidence": d.confidence, "bbox": d.bbox}
        for d in dets
    ]


@router.get("/agent/{image_id}/stream")
async def agent_stream(
    image_id: str,
    lat: float = Query(default=28.6139, ge=6.0, le=37.5),
    lng: float = Query(default=77.2090, ge=68.0, le=98.0),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream of agent events for a given image."""
    _validate_uuid(image_id)
    img, detections = await _get_image_and_detections(image_id, db)

    if not detections:
        raise HTTPException(422, "No detections found. Run GET /detect/{image_id} first.")

    cached = (await db.execute(
        select(AgentResult).where(AgentResult.image_id == image_id)
    )).scalar_one_or_none()

    if cached and cached.status == "done" and cached.result:
        async def _cached_stream():
            yield f"data: {json.dumps({'type': 'status', 'message': 'cached'})}\n\n"
            payload = json.dumps({"type": "result", "data": cached.result,
                                  "duration_ms": cached.duration_ms or 0})
            yield f"data: {payload}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': 'done'})}\n\n"

        return StreamingResponse(
            _cached_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if cached and cached.status == "streaming":
        raise HTTPException(
            409,
            "Agent stream already in progress. "
            "Poll GET /agent/{image_id}/result or try again shortly.",
        )

    await mark_streaming(image_id, db)

    async def _event_generator():
        final_result: dict | None = None
        duration_ms: int = 0
        error_msg: str | None = None

        queue: asyncio.Queue = asyncio.Queue()

        async def _produce():
            nonlocal final_result, duration_ms, error_msg
            async for chunk in strands_agent.stream_agent_events(
                detections=detections,
                uploader_id=img.uploader_id,
                lat=lat,
                lng=lng,
            ):
                await queue.put(chunk)
                try:
                    payload = json.loads(chunk[len("data: "):].strip())
                    if payload.get("type") == "result":
                        final_result = payload.get("data")
                        duration_ms = payload.get("duration_ms", 0)
                    elif payload.get("type") == "error":
                        error_msg = payload.get("message")
                except (json.JSONDecodeError, IndexError, KeyError):
                    log.debug("agent chunk not JSON, skipped")
            await queue.put(None)

        async def _keepalive():
            while True:
                await asyncio.sleep(15)
                await queue.put(": keepalive\n\n")

        prod = asyncio.create_task(_produce())
        keep = asyncio.create_task(_keepalive())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

        keep.cancel()
        await asyncio.gather(prod, return_exceptions=True)

        from api.core.database import async_session_factory
        try:
            async with async_session_factory() as new_db:
                if final_result and not error_msg:
                    await save_result(image_id, final_result, duration_ms, new_db)
                else:
                    await save_error(image_id, error_msg or "unknown", final_result, new_db)
        except Exception as exc:  # noqa: BLE001
            log.warning("agent persist skipped: %s", exc)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/agent/{image_id}/result")
async def agent_result(
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Polling fallback. Returns {status, result} from DB."""
    _validate_uuid(image_id)
    row = (await db.execute(
        select(AgentResult).where(AgentResult.image_id == image_id)
    )).scalar_one_or_none()

    if row is None:
        return {"status": "pending", "result": None, "error_detail": None, "duration_ms": None}

    # Polling endpoint - never cache; the row flips pending→done mid-stream.
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={
            "status": row.status,
            "result": row.result,
            "error_detail": row.error_detail,
            "duration_ms": row.duration_ms,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        },
        headers={"Cache-Control": "no-store"},
    )
