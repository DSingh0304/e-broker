"""Admin routes: review queue, label correction, model deploy. Cognito/bypass JWT."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.cache import stats_cache
from api.core.config import settings
from api.core.database import get_db
from api.core.security import AdminIdentity, require_admin
from api.db.models import Detection, Image, Label, ModelVersion
from api.services.label_service import compute_review_status, validate_bbox, validate_class
from api.services.model_manager import ModelManager

router = APIRouter()

log = logging.getLogger("ebroker.admin")

_manager: ModelManager | None = None


def get_manager() -> ModelManager:
    global _manager
    if _manager is None:
        _manager = ModelManager(model_path=settings.ACTIVE_MODEL_PATH)
    return _manager


class LabelsIn(BaseModel):
    labels: list[dict]


def _serialize_model(v: ModelVersion | None) -> dict | None:
    if not v:
        return None
    return {
        "id": v.id,
        "version": v.id[:8],
        "s3_key": v.s3_key,
        "map50": v.map50,
        "map50_95": v.map50_95,
        "precision": None,
        "recall": None,
        "per_class": v.per_class or {},
        "deployed_at": v.deployed_at.isoformat() if v.deployed_at else None,
        "approved_by": v.approved_by,
        "canary_traffic_pct": v.canary_traffic_pct or 0,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.get("/admin/queue")
async def queue(page: int = 1, status: str = "pending",
                db: AsyncSession = Depends(get_db),
                admin: AdminIdentity = Depends(require_admin)):
    _ = admin
    q = select(Image).where(Image.review_status == status).order_by(Image.uploaded_at.desc())
    total = (await db.execute(select(func.count()).select_from(Image).where(Image.review_status == status))).scalar()
    items = (await db.execute(q.limit(50).offset((page - 1) * 50))).scalars().all()
    out = []
    for img in items:
        dets = (await db.execute(select(Detection).where(Detection.image_id == img.id))).scalars().all()
        out.append({
            # Thumbnails stream through the API (Floci/MinIO stay private to
            # the backend network) — never expose storage URLs to browsers.
            "imageId": img.id, "thumbnailUrl": f"/api/images/{img.id}",
            "detections": [{"className": d.class_name, "confidence": d.confidence} for d in dets],
            "reviewStatus": img.review_status, "uploadedAt": img.uploaded_at.isoformat(),
        })
    return {"items": out, "total": total}


@router.get("/admin/queue/{image_id}")
async def queue_item(image_id: str, db: AsyncSession = Depends(get_db),
                     admin: AdminIdentity = Depends(require_admin)):
    _ = admin
    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    dets = (await db.execute(select(Detection).where(Detection.image_id == image_id))).scalars().all()
    labels = (await db.execute(select(Label).where(Label.image_id == image_id, Label.is_active == True))).scalars().all()
    return {
        "imageId": img.id,
        "reviewStatus": img.review_status,
        "thumbnailUrl": f"/api/images/{image_id}",
        "detections": [{"className": d.class_name, "confidence": d.confidence, "bbox": d.bbox} for d in dets],
        "labels": [{"className": l.class_name, "bbox": l.bbox} for l in labels],
    }


@router.post("/admin/queue/{image_id}/approve")
async def approve(image_id: str, db: AsyncSession = Depends(get_db),
                  admin: AdminIdentity = Depends(require_admin)):
    _ = admin
    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    img.review_status = compute_review_status("model")
    await db.commit()
    stats_cache.invalidate("admin_stats")
    return {"success": True, "reviewStatus": img.review_status}


@router.post("/admin/queue/{image_id}/skip")
async def skip(image_id: str, db: AsyncSession = Depends(get_db),
               admin: AdminIdentity = Depends(require_admin)):
    _ = admin
    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    img.review_status = "skipped"
    await db.commit()
    stats_cache.invalidate("admin_stats")
    return {"success": True, "reviewStatus": img.review_status}


@router.post("/admin/labels/{image_id}")
async def save_labels(image_id: str, payload: LabelsIn, db: AsyncSession = Depends(get_db),
                      admin: AdminIdentity = Depends(require_admin)):
    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    for lab in payload.labels:
        if not validate_class(lab.get("className", "")):
            raise HTTPException(422, f"Unknown class: {lab.get('className')}")
        if not validate_bbox(lab.get("bbox", {})):
            raise HTTPException(422, f"Invalid bbox: {lab.get('bbox')}")
    old = (await db.execute(select(Label).where(Label.image_id == image_id, Label.is_active == True))).scalars().all()
    for o in old:
        o.is_active = False
    for lab in payload.labels:
        db.add(Label(image_id=image_id, class_name=lab["className"], bbox=lab["bbox"],
                     source="admin", created_by=admin.email))
    img.review_status = compute_review_status("admin")
    await db.commit()
    stats_cache.invalidate("admin_stats")
    return {"success": True, "reviewStatus": img.review_status}


@router.get("/admin/models")
async def list_models(
    db: AsyncSession = Depends(get_db),
    admin: AdminIdentity = Depends(require_admin),
):
    _ = admin
    stmt = (
        select(ModelVersion)
        .order_by(ModelVersion.deployed_at.desc().nullslast())
    )
    result = await db.execute(stmt)
    versions = result.scalars().all()

    deployed = next((v for v in versions if v.deployed_at), None)
    if not deployed and versions:
        deployed = versions[0]

    candidates = [v for v in versions if v != deployed]

    return {
        "deployed": _serialize_model(deployed),
        "candidates": [_serialize_model(v) for v in candidates],
    }


@router.post("/admin/models/{version_id}/deploy")
async def deploy(version_id: str, db: AsyncSession = Depends(get_db),
                 admin: AdminIdentity = Depends(require_admin)):
    from datetime import datetime, timezone

    cand = (await db.execute(select(ModelVersion).where(ModelVersion.id == version_id))).scalar_one_or_none()
    if cand is None:
        raise HTTPException(404, "Model version not found")
    baseline = (await db.execute(
        select(ModelVersion).where(ModelVersion.deployed_at.is_not(None))
        .order_by(ModelVersion.deployed_at.desc()))).scalars().first()
    if baseline is not None and cand.map50 is not None and baseline.map50 is not None:
        drop = baseline.map50 - cand.map50
        if drop > 0.05:
            raise HTTPException(422, f"Regression blocked: overall mAP50 drops {drop:.3f} "
                                     f"({baseline.map50:.3f} → {cand.map50:.3f})")
        for cls, old in (baseline.per_class or {}).items():
            new = (cand.per_class or {}).get(cls)
            if new is not None and old - new > 0.05:
                raise HTTPException(422, f"Regression blocked: class {cls} mAP50 drops {old - new:.3f}")
    try:
        get_manager().reload(cand.s3_key or version_id)
    except Exception as exc:  # noqa: BLE001 — model file for old rows may not exist locally
        log.warning("Model hot-reload skipped for %s: %s", version_id, exc)
    cand.deployed_at = datetime.now(timezone.utc)
    cand.approved_by = admin.email
    await db.commit()
    return {"success": True, "deployedAt": cand.deployed_at.isoformat()}


@router.post("/admin/models/{version_id}/reject")
async def reject_model(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    admin: AdminIdentity = Depends(require_admin),
):
    _ = admin
    cand = (await db.execute(select(ModelVersion).where(ModelVersion.id == version_id))).scalar_one_or_none()
    if cand is None:
        raise HTTPException(404, "Model version not found")
    cand.canary_traffic_pct = 0
    await db.commit()
    return {"success": True, "status": "rejected"}


@router.get("/admin/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: AdminIdentity = Depends(require_admin),
):
    _ = admin
    from fastapi.responses import JSONResponse

    async def _load():
        return await _compute_stats(db)

    payload = await stats_cache.get_or_load("admin_stats", _load)
    return JSONResponse(content=payload, headers={"Cache-Control": "no-store"})


async def _compute_stats(db: AsyncSession) -> dict:
    pending_count = (await db.execute(select(func.count()).select_from(Image).where(Image.review_status == "pending"))).scalar() or 0
    approved_labels = (await db.execute(select(func.count()).select_from(Label).where(Label.is_active == True))).scalar() or 0

    deployed = (await db.execute(
        select(ModelVersion).where(ModelVersion.deployed_at.is_not(None))
        .order_by(ModelVersion.deployed_at.desc())
    )).scalars().first()

    recent = (await db.execute(
        select(Image).order_by(Image.uploaded_at.desc()).limit(5)
    )).scalars().all()

    recent_activity = []
    for img in recent:
        dets = (await db.execute(select(Detection).where(Detection.image_id == img.id))).scalars().all()
        cls_str = ", ".join({d.class_name for d in dets}) if dets else "No component"
        recent_activity.append({
            "id": img.id,
            "title": f"IMG-{img.id[:6]}",
            "subtitle": f"{cls_str} ({img.review_status})",
            "time": img.uploaded_at.isoformat() if img.uploaded_at else "Just now",
            "status": img.review_status,
        })

    return {
        "pending_count": pending_count,
        "approved_labels": approved_labels,
        "deployed_model": deployed.id[:8] if deployed else None,
        "map50": deployed.map50 if deployed and deployed.map50 is not None else None,
        "training_status": "Idle",
        "recent_activity": recent_activity,
    }
