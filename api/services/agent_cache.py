"""
Agent result caching: read/write AgentResult rows.
Also provides the recycler lookup shared by the agent tools.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from sqlalchemy import select

from api.db.models import AgentResult, Recycler


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(min(1.0, math.sqrt(a)))


# Public alias — the HTTP route uses the async session directly.
haversine_km = _haversine_km


def _row_to_dict(r: Recycler, distance_km: float | None) -> dict:
    return {
        "name": r.name, "city": r.city, "state": r.state,
        "address": r.address,
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
        "lat": float(r.lat), "lng": float(r.lng),
        "accepts": r.accepts or [], "phone": r.phone,
        "email": r.email, "website": r.website,
        "cpcb_reg_no": r.cpcb_reg_no,
        "cpcb_valid_until": r.cpcb_valid_until.isoformat() if r.cpcb_valid_until else None,
        "min_quantity_kg": r.min_quantity_kg,
        "processing_types": r.processing_types or [],
        "verified": r.verified,
    }


def _collect(
    with_dist: list, radius_km: float, accepts_class: str | None
) -> list[dict]:
    """Fallback chain: radius + material, radius only, then nearest five."""
    def collect(max_km: float | None, accepts: str | None) -> list[dict]:
        out = []
        for d, r in with_dist:
            if max_km is not None and d > max_km:
                continue
            if accepts and r.accepts and accepts not in r.accepts:
                continue
            out.append(_row_to_dict(r, d))
        return out

    out = collect(radius_km, accepts_class)
    if not out:
        out = collect(radius_km, None)
    if not out:
        out = collect(None, None)[:5]
    return out


def _ranked(rows, lat: float, lng: float) -> list:
    with_dist = []
    for r in rows:
        try:
            d = _haversine_km(lat, lng, float(r.lat), float(r.lng))
        except (TypeError, ValueError):
            continue
        with_dist.append((d, r))
    with_dist.sort(key=lambda x: x[0])
    return with_dist


async def query_recyclers(
    lat: float, lng: float, radius_km: float, accepts_class: str | None,
) -> list[dict]:
    """Async recycler lookup on the app's async engine."""
    from api.core.database import async_session_factory

    try:
        async with async_session_factory() as session:
            rows = (await session.execute(
                select(Recycler).where(Recycler.verified.is_(True))
            )).scalars().all()
    except Exception:  # noqa: BLE001 - DB unavailable in dev/CI
        return []
    return _collect(_ranked(rows, lat, lng), radius_km, accepts_class)


async def get_or_create_result(image_id: str, db) -> AgentResult:
    row = (await db.execute(
        select(AgentResult).where(AgentResult.image_id == image_id)
    )).scalar_one_or_none()
    if row is None:
        row = AgentResult(image_id=image_id, status="pending", result=None)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def mark_streaming(image_id: str, db) -> None:
    row = await get_or_create_result(image_id, db)
    row.status = "streaming"
    await db.commit()


async def save_result(image_id: str, result: dict, duration_ms: int, db) -> None:
    row = await get_or_create_result(image_id, db)
    row.result = result
    row.status = "done"
    row.completed_at = datetime.now(timezone.utc)
    row.duration_ms = duration_ms
    await db.commit()


async def save_error(image_id: str, error: str, partial: dict | None, db) -> None:
    row = await get_or_create_result(image_id, db)
    row.status = "partial" if partial else "error"
    row.result = partial
    row.error_detail = error
    row.completed_at = datetime.now(timezone.utc)
    await db.commit()
