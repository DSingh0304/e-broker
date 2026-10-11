"""Public routes: upload + detect + recyclers. No auth (device fingerprint only)."""
import asyncio
import io
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image as PILImage
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.cache import recycler_cache
from api.core.config import UNIFIED_CLASSES
from api.core.database import get_db
from api.core.security import fingerprint_uploader, is_safe_url
from api.db.models import Detection, Image, Recycler
from api.services import storage
from api.services.inference import InferenceService, dedupe_detections

router = APIRouter()

MAX_REMOTE_BYTES = 10 * 1024 * 1024

_inference: InferenceService | None = None


def get_inference() -> InferenceService:
    global _inference
    if _inference is None:
        _inference = InferenceService()
    return _inference


@router.post("/upload")
async def upload(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10MB)")
    try:
        storage.validate_image_bytes(raw)
        clean, width, height = storage.strip_exif_and_resize(raw)
    except ValueError as e:
        raise HTTPException(400, str(e))
    upload_id = str(uuid.uuid4())
    s3_key = f"raw/{upload_id}.jpg"
    s3_url = storage.put_object(s3_key, clean)
    img = Image(id=upload_id, s3_key=s3_key, s3_url=s3_url,
                uploader_id=fingerprint_uploader(file.filename or "?", "0.0.0.0",
                                                 datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")),
                width=width, height=height, review_status="pending")
    db.add(img)
    await db.commit()
    return {"imageId": upload_id, "s3Url": s3_url}


class ScanUrlIn(BaseModel):
    url: str


@router.post("/scan-url")
async def scan_url(payload: ScanUrlIn, db: AsyncSession = Depends(get_db)):
    """Fetch a remote image server-side (avoids browser CORS issues) with an
    SSRF guard, then run it through the normal upload pipeline."""
    url = payload.url.strip()
    if not url:
        raise HTTPException(400, "URL is empty - paste a direct image link")
    if not await asyncio.to_thread(is_safe_url, url):
        raise HTTPException(400, "URL host is not allowed")
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
    except Exception:  # noqa: BLE001 - DNS/TLS/connection failures
        raise HTTPException(400, "Could not fetch that URL - check the link")
    if resp.status_code != 200:
        raise HTTPException(400, f"URL returned HTTP {resp.status_code}")
    ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            400, "That link is not an image file (paste a direct .jpg/.png link, "
                 "not a web page)")
    raw = resp.content
    if len(raw) > MAX_REMOTE_BYTES:
        raise HTTPException(413, "Remote image too large (max 10MB)")
    try:
        storage.validate_image_bytes(raw)
        clean, width, height = storage.strip_exif_and_resize(raw)
    except ValueError as e:
        raise HTTPException(400, str(e))
    upload_id = str(uuid.uuid4())
    s3_key = f"raw/{upload_id}.jpg"
    s3_url = storage.put_object(s3_key, clean)
    img = Image(id=upload_id, s3_key=s3_key, s3_url=s3_url,
                uploader_id=fingerprint_uploader(url, "0.0.0.0",
                                                 datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")),
                width=width, height=height, review_status="pending")
    db.add(img)
    await db.commit()
    return {"imageId": upload_id, "s3Url": s3_url}


@router.get("/recyclers")
async def list_recyclers(
    lat: float | None = Query(default=None, ge=6.0, le=37.5),
    lng: float | None = Query(default=None, ge=68.0, le=98.0),
    radius_km: float = Query(default=200.0, gt=0, le=500),
    accepts: str | None = Query(default=None, description="Filter by accepted class"),
    db: AsyncSession = Depends(get_db),
):
    """Public CPCB-certified recycler directory. Geo-sorted when lat/lng given.

    Responses are memoized for 5 minutes (request cache) and marked
    cacheable for shared caches (response cache)."""
    if accepts is not None and accepts not in UNIFIED_CLASSES:
        raise HTTPException(400, f"Unknown class '{accepts}'")
    from fastapi.responses import JSONResponse

    lat_key = f"{round(lat, 3)}" if lat is not None else "-"
    lng_key = f"{round(lng, 3)}" if lng is not None else "-"
    cache_key = f"recyclers:{lat_key}:{lng_key}:{radius_km}:{accepts or '-'}"

    async def _load():
        if lat is not None and lng is not None:
            return await _geo_recyclers(lat, lng, radius_km, accepts, db)
        return await _all_recyclers(accepts, db)

    payload = await recycler_cache.get_or_load(cache_key, _load)
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=300"},
    )


async def _geo_recyclers(
    lat: float, lng: float, radius_km: float, accepts: str | None,
    db: AsyncSession,
) -> dict:
    from api.services.agent_cache import _row_to_dict, haversine_km

    rows = (await db.execute(
        select(Recycler).where(Recycler.verified.is_(True)))).scalars().all()
    ranked = sorted(
        (haversine_km(lat, lng, float(r.lat), float(r.lng)), r) for r in rows
    )

    def collect(max_km: float | None, only_accepts: bool) -> list:
        out = []
        for d, r in ranked:
            if max_km is not None and d > max_km:
                continue
            if only_accepts and accepts and r.accepts and accepts not in r.accepts:
                continue
            out.append(_row_to_dict(r, d))
        return out

    # Fallback chain: in-radius + material, in-radius, then nearest
    # overall - a search always returns somewhere to go.
    out = collect(radius_km, True)
    if not out:
        out = collect(radius_km, False)
    if not out:
        out = collect(None, False)
    return {"recyclers": out, "count": len(out)}


async def _all_recyclers(accepts: str | None, db: AsyncSession) -> dict:
    from api.services.agent_cache import _row_to_dict

    q = select(Recycler).where(Recycler.verified.is_(True)).order_by(Recycler.city, Recycler.name)
    rows = (await db.execute(q)).scalars().all()

    out = []
    for r in rows:
        if accepts and r.accepts and accepts not in r.accepts:
            continue
        out.append(_row_to_dict(r, None))
    return {"recyclers": out, "count": len(out)}


@router.get("/images/{image_id}")
async def serve_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the EXIF-stripped upload bytes (result-page canvas + thumbnails)."""
    from fastapi.responses import Response

    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    try:
        data = storage.get_object(img.s3_key)
    except FileNotFoundError as e:
        raise HTTPException(422, str(e))
    # Upload bytes are immutable for an id - browsers/CDN may cache for a year.
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/passport/{image_id}")
async def epr_passport(image_id: str, db: AsyncSession = Depends(get_db)):
    """Generate the EPR Waste Passport PDF for an upload (E2E download target)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen.canvas import Canvas

    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    dets = (await db.execute(select(Detection).where(Detection.image_id == image_id))).scalars().all()
    buf = io.BytesIO()
    pdf = Canvas(buf, pagesize=A4)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(60, 800, "E-Broker - Digital Waste Passport (EPR)")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(60, 775, f"Passport ID: EPR-{img.id[:8].upper()}")
    pdf.drawString(60, 758, f"Uploader: {img.uploader_id[:16]}…  Date: {img.uploaded_at:%Y-%m-%d}")
    pdf.drawString(60, 741, f"Image: {img.width}x{img.height}px  Status: VERIFIED")
    y = 710
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(60, y, "Detected components:")
    pdf.setFont("Helvetica", 11)
    for d in dets:
        y -= 18
        pdf.drawString(80, y, f"- {d.class_name}  conf {d.confidence:.2f}")
    if not dets:
        y -= 18
        pdf.drawString(80, y, "- (no detections above threshold)")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(60, 60, "Generated by E-Broker. Route e-waste via CPCB-certified recyclers only.")
    pdf.showPage()
    pdf.save()
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="epr-{img.id[:8]}.pdf"',
                 "Cache-Control": "public, max-age=60"},
    )


@router.get("/detect/{image_id}")
async def detect(image_id: str, db: AsyncSession = Depends(get_db)):
    img = (await db.execute(select(Image).where(Image.id == image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found")
    # Idempotent: return stored detections when present (curated/seeded data
    # must survive). Only run inference on first call to avoid duplicating rows.
    existing = (await db.execute(
        select(Detection).where(Detection.image_id == image_id))).scalars().all()
    hidden = 0
    threshold = 0.0
    if existing:
        detections = [{"id": str(d.id), "class_name": d.class_name,
                       "confidence": d.confidence, "bbox": d.bbox} for d in existing]
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        detections, suppressed = dedupe_detections(detections)
        hidden += suppressed
    else:
        try:
            image_bytes = storage.get_object(img.s3_key)
        except FileNotFoundError as e:
            raise HTTPException(422, str(e))
        pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        svc = get_inference()
        fresh, hidden, threshold = svc.predict_detailed(pil)
        detections = []
        for d in fresh:
            row = Detection(image_id=image_id, class_name=d["class_name"],
                            confidence=d["confidence"], bbox=d["bbox"])
            db.add(row)
            await db.flush()
            detections.append({"id": str(row.id), "class_name": d["class_name"],
                               "confidence": d["confidence"], "bbox": d["bbox"]})
        await db.commit()
    cards = [
        {"id": d["id"], "className": d["class_name"],
         "confidence": d["confidence"], "bbox": d["bbox"]}
        for d in detections
    ]
    # Detection rows are write-once per image, so the response is cacheable.
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={
            "imageId": image_id,
            "detections": cards,
            # Quality bar: detections below confidenceThreshold are withheld, and
            # hiddenGuesses reports how many candidates were dropped.
            "confidenceThreshold": threshold,
            "hiddenGuesses": hidden,
            # Agent insights (pricing/toxicity/recyclers/EPR) are now on-demand via
            # GET /api/agent/{image_id}/stream (SSE) + GET /api/agent/{image_id}/result.
            "totalValueRange": None,
            "recyclers": [],
            "passportUrl": f"/api/passport/{image_id}",
            "passportId": None,
            "agentStreamUrl": f"/api/agent/{image_id}/stream",
        },
        headers={"Cache-Control": "private, max-age=60"},
    )
