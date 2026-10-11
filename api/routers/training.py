"""Training trigger + run history + live progress. Local job runner lives here."""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.config import settings
from api.core.database import get_db
from api.core.security import AdminIdentity, require_admin, require_internal_key
from api.services import modal_client as modal_train

router = APIRouter()

log = logging.getLogger("ebroker.training")


@router.post("/admin/training/trigger")
async def trigger(db: AsyncSession = Depends(get_db),
                  admin: AdminIdentity = Depends(require_admin)):
    from api.db.models import Label, TrainingRun

    new_labels = (await db.execute(
        select(func.count()).select_from(Label).where(Label.is_active.is_(True))
    )).scalar() or 0
    # Only recent queued/running rows block a new trigger - seeded or crashed
    # runs from previous sessions go stale after 6h and stop blocking.
    stale_after = datetime.now(timezone.utc) - timedelta(hours=6)
    active = (await db.execute(select(func.count()).select_from(TrainingRun).where(
        TrainingRun.status.in_(["queued", "running"]),
        TrainingRun.triggered_at >= stale_after,
    ))).scalar()
    if active:
        raise HTTPException(409, "A training run is already active")
    from api.services.training_service import should_trigger_training

    if not should_trigger_training(int(new_labels), settings.TRAINING_TRIGGER_THRESHOLD):
        raise HTTPException(
            422,
            f"Not enough new labels: {int(new_labels)} / {settings.TRAINING_TRIGGER_THRESHOLD} - "
            "approve more annotations in the review queue first",
        )
    call = modal_train.spawn()
    run = TrainingRun(modal_run_id=getattr(call, "object_id", "local"),
                      triggered_by=admin.email, status="queued", epochs=30,
                      dataset_images=int(new_labels))
    db.add(run)
    await db.commit()
    await db.refresh(run)
    modal_train.schedule_progress(run.id, settings.DATABASE_URL_SYNC)
    from api.core.cache import stats_cache as _stats_cache

    _stats_cache.invalidate("admin_stats")
    return {"runId": run.id, "modalRunId": run.modal_run_id}


@router.get("/admin/training/runs")
async def run_history(limit: int = 10,
                      db: AsyncSession = Depends(get_db),
                      admin: AdminIdentity = Depends(require_admin)):
    """Recent training runs for the admin history table (no hardcoded rows)."""
    from api.db.models import TrainingRun

    _ = admin
    rows = (await db.execute(
        select(TrainingRun).order_by(desc(TrainingRun.triggered_at)).limit(min(limit, 50))
    )).scalars().all()
    return {"runs": [
        {
            "id": r.id,
            "status": r.status,
            "epochs": r.epochs,
            "dataset_images": r.dataset_images,
            "triggered_at": r.triggered_at.isoformat() if r.triggered_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "map50": (r.metrics or {}).get("map50") if isinstance(r.metrics, dict) else None,
        }
        for r in rows
    ]}


@router.get("/admin/training/{run_id}/stream")
async def stream_training(
    run_id: str,
    admin: AdminIdentity = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream for training run progress."""
    _ = admin
    async def event_generator():
        from api.db.models import TrainingRun
        while True:
            stmt = select(TrainingRun).where(TrainingRun.id == run_id)
            result = await db.execute(stmt)
            run = result.scalar_one_or_none()

            if not run:
                yield f"event: error\ndata: {json.dumps({'message': 'Run not found'})}\n\n"
                return

            yield f"event: status\ndata: {json.dumps({'status': run.status, 'metrics': run.metrics or {}})}\n\n"

            if run.status in ("done", "failed"):
                yield f"event: complete\ndata: {json.dumps({'status': run.status, 'metrics': run.metrics or {}})}\n\n"
                return

            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/internal/training/trigger-check")
async def trigger_check(db: AsyncSession = Depends(get_db),
                        _key: None = Depends(require_internal_key)):
    from api.db.models import Label

    count = (await db.execute(select(func.count()).select_from(Label)
                              .where(Label.is_active == True))).scalar()
    return {"new_labels": count}


@router.post("/internal/training/metrics")
async def metrics(payload: dict, db: AsyncSession = Depends(get_db),
                  _key: None = Depends(require_internal_key)):
    from api.db.models import TrainingRun

    run = (await db.execute(select(TrainingRun).where(TrainingRun.id == payload.get("runId")))).scalar_one_or_none()
    if run is None:
        raise HTTPException(404, "Run not found")
    run.status = "running"
    metrics = dict(run.metrics or {})
    metrics[f"epoch_{payload.get('epoch')}"] = {k: v for k, v in payload.items() if k != "runId"}
    run.metrics = metrics
    if payload.get("type") == "done":
        run.status = "done"
        run.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}
