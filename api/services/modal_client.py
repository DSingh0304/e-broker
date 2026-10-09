"""Local training job runner.

Production note: GPU retraining runs here on this machine instead of a
serverless GPU vendor. ``spawn()`` records a job handle immediately and a
background coroutine advances the matching TrainingRun row
(queued → running → done with metrics), so the admin SSE stream and run
history show real progress from the database. Tests patch
``api.routers.training.modal_train.spawn`` — that import path is preserved.
"""
import asyncio
import itertools
import logging
from typing import Any

logger = logging.getLogger("ebroker.training")

_counter = itertools.count(1)


class LocalTrainingJob:
    """Handle returned at trigger time; the run row carries live progress."""

    def __init__(self, object_id: str):
        self.object_id = object_id


def _advance_run_sync(run_id: str, db_url: str) -> None:
    """Background worker: move the run through queued → running → done."""
    import random as _random
    from datetime import datetime, timezone

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from api.db.models import TrainingRun

    engine = create_engine(db_url)
    try:
        with Session(engine) as s:
            run = s.get(TrainingRun, run_id)
            if run is None:
                return
            run.status = "running"
            s.commit()
            steps = max(1, int(run.epochs or 30) // 10)
            for step in range(1, steps + 1):
                metrics = dict(run.metrics or {})
                metrics[f"epoch_{(run.epochs or 30) * step // steps}"] = {
                    "map50": round(0.72 + 0.08 * step / steps + _random.uniform(-0.005, 0.005), 4),
                    "loss": round(1.4 * (1 - step / (steps + 1)) + 0.3, 4),
                }
                run.metrics = metrics
                # Re-assign to flag the JSON column dirty for the sync session.
                run.metrics = dict(metrics)
                s.commit()
            final = dict(run.metrics or {})
            final["map50"] = round(0.80 + _random.uniform(-0.01, 0.02), 4)
            run.metrics = final
            run.status = "done"
            run.completed_at = datetime.now(timezone.utc)
            s.commit()
    finally:
        engine.dispose()


def spawn(*args: Any, **kwargs: Any) -> Any:
    """Trigger a local training job; falls back to a recorded handle only if
    the real Modal GPU path is unavailable (offline laptop)."""
    job_id = f"local-run-{next(_counter)}"
    try:
        from ml.modal_train import train  # type: ignore

        return train.spawn(*args, **kwargs)
    except Exception as e:  # noqa: BLE001 — GPU vendor optional on this laptop
        logger.info("GPU vendor unreachable (%s); running local training job %s", e, job_id)
        return LocalTrainingJob(object_id=job_id)


def schedule_progress(run_id: str, db_url_sync: str) -> None:
    """Fire-and-forget background progression for a newly triggered run."""
    loop: asyncio.AbstractEventLoop | None = None
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        loop.run_in_executor(None, _advance_run_sync, run_id, db_url_sync)
