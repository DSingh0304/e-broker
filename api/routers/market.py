"""Marketplace: kabadiwala listings + vendor bids, backed by PostgreSQL.

Demo-grade identity: the Next.js client sends the signed-in user's phone and
role (from the NextAuth session) as X-User-Phone / X-User-Role headers. The
backend resolves-or-creates a `users` row by phone — real persistence, demo
trust. Prod would verify a Cognito JWT instead.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_db
from api.db.models import Bid, Detection, Image, MarketplaceListing, User

router = APIRouter(tags=["Marketplace"])


class ListingCreate(BaseModel):
    image_id: str
    total_weight_kg: float = Field(gt=0, le=100000)
    asking_price: float = Field(ge=0, le=100_000_000)


class ListingResponse(BaseModel):
    id: str
    seller_id: str
    seller_name: str | None
    seller_phone: str | None
    image_id: str
    image_url: str | None
    materials: list[str]
    total_weight_kg: float | None
    asking_price: float | None
    bid_count: int
    top_bid: float | None
    status: str
    created_at: datetime | None


class BidCreate(BaseModel):
    listing_id: str
    bid_amount: float = Field(gt=0, le=100_000_000)


class BidResponse(BaseModel):
    id: str
    listing_id: str
    vendor_id: str
    vendor_name: str | None
    asking_price: float | None
    bid_amount: float
    status: str
    created_at: datetime | None


async def get_demo_user(
    x_user_phone: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve-or-create the acting user from session-derived identity headers.

    The Next.js client sends the signed-in user's phone and role (from the
    NextAuth session) as X-User-Phone / X-User-Role. Per-endpoint _require_role
    checks still enforce who may list, bid, or accept.
    """
    role = (x_user_role or "KABADIWALA").upper()
    if role not in ("KABADIWALA", "VENDOR", "ADMIN", "RECYCLER"):
        raise HTTPException(400, "X-User-Role must be KABADIWALA, VENDOR, ADMIN or RECYCLER")
    phone = (x_user_phone or "").strip()
    if not phone:
        raise HTTPException(401, "Missing X-User-Phone — sign in first")
    user = (await db.execute(select(User).where(User.phone_number == phone))).scalar_one_or_none()
    if user is None:
        user = User(phone_number=phone, role=role,
                    full_name="RecycleCorp Ltd." if role == "VENDOR" else "Kabadiwala User")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


def _require_role(user: User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(403, f"Requires role: {'/'.join(roles)}")


async def _listing_payload(listing: MarketplaceListing, db: AsyncSession) -> dict:
    seller = (await db.execute(select(User).where(User.id == listing.seller_id))).scalar_one_or_none()
    dets = (await db.execute(
        select(Detection.class_name).where(Detection.image_id == listing.image_id).distinct()
    )).scalars().all()
    bids = (await db.execute(select(Bid).where(Bid.listing_id == listing.id))).scalars().all()
    amounts = [b.bid_amount for b in bids]
    return {
        "id": listing.id,
        "seller_id": listing.seller_id,
        "seller_name": seller.full_name if seller else None,
        "seller_phone": seller.phone_number if seller else None,
        "image_id": listing.image_id,
        # Browsers can't reach storage directly — stream bytes via the API.
        "image_url": f"/api/images/{listing.image_id}",
        "materials": sorted(set(dets)),
        "total_weight_kg": listing.total_weight_kg,
        "asking_price": listing.asking_price,
        "bid_count": len(bids),
        "top_bid": max(amounts) if amounts else None,
        "status": listing.status,
        "created_at": listing.created_at,
    }


@router.post("/market/listings", response_model=ListingResponse)
async def create_listing(
    listing: ListingCreate,
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(user, "KABADIWALA")
    img = (await db.execute(select(Image).where(Image.id == listing.image_id))).scalar_one_or_none()
    if img is None:
        raise HTTPException(404, "Image not found — scan it first")
    row = MarketplaceListing(seller_id=user.id, image_id=listing.image_id,
                             total_weight_kg=listing.total_weight_kg,
                             asking_price=listing.asking_price, status="ACTIVE")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _listing_payload(row, db)


@router.get("/market/listings", response_model=list[ListingResponse])
async def get_all_active_listings(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.status == "ACTIVE")
        .order_by(desc(MarketplaceListing.created_at))
        .limit(100)
    )).scalars().all()
    return [await _listing_payload(r, db) for r in rows]


@router.get("/market/listings/mine", response_model=list[ListingResponse])
async def get_my_listings(
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MarketplaceListing)
        .where(MarketplaceListing.seller_id == user.id)
        .order_by(desc(MarketplaceListing.created_at))
    )).scalars().all()
    return [await _listing_payload(r, db) for r in rows]


@router.post("/market/bids", response_model=BidResponse)
async def submit_bid(
    bid: BidCreate,
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(user, "VENDOR", "RECYCLER")
    listing = (await db.execute(
        select(MarketplaceListing).where(MarketplaceListing.id == bid.listing_id)
    )).scalar_one_or_none()
    if listing is None:
        raise HTTPException(404, "Listing not found")
    if listing.status != "ACTIVE":
        raise HTTPException(409, f"Listing is {listing.status} — no longer accepting bids")
    if listing.seller_id == user.id:
        raise HTTPException(400, "Cannot bid on your own listing")
    row = Bid(listing_id=listing.id, vendor_id=user.id,
              bid_amount=bid.bid_amount, status="OPEN")
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _bid_payload(row, db)


async def _bid_payload(bid: Bid, db: AsyncSession) -> dict:
    vendor = (await db.execute(select(User).where(User.id == bid.vendor_id))).scalar_one_or_none()
    listing = (await db.execute(
        select(MarketplaceListing).where(MarketplaceListing.id == bid.listing_id)
    )).scalar_one_or_none()
    return {
        "id": bid.id,
        "listing_id": bid.listing_id,
        "vendor_id": bid.vendor_id,
        "vendor_name": vendor.full_name if vendor else None,
        "asking_price": listing.asking_price if listing else None,
        "bid_amount": bid.bid_amount,
        "status": bid.status,
        "created_at": bid.created_at,
    }


@router.get("/market/bids/mine", response_model=list[BidResponse])
async def get_my_bids(
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(user, "VENDOR", "RECYCLER")
    rows = (await db.execute(
        select(Bid).where(Bid.vendor_id == user.id).order_by(desc(Bid.created_at))
    )).scalars().all()
    return [await _bid_payload(r, db) for r in rows]


@router.get("/market/bids/inbox", response_model=list[BidResponse])
async def get_incoming_bids(
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(user, "KABADIWALA")
    my_listing_ids = (await db.execute(
        select(MarketplaceListing.id).where(MarketplaceListing.seller_id == user.id)
    )).scalars().all()
    if not my_listing_ids:
        return []
    rows = (await db.execute(
        select(Bid).where(Bid.listing_id.in_(my_listing_ids)).order_by(desc(Bid.created_at))
    )).scalars().all()
    return [await _bid_payload(r, db) for r in rows]


@router.post("/market/bids/{bid_id}/accept")
async def accept_bid(
    bid_id: str,
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(user, "KABADIWALA")
    bid = (await db.execute(select(Bid).where(Bid.id == bid_id))).scalar_one_or_none()
    if bid is None:
        raise HTTPException(404, "Bid not found")
    listing = (await db.execute(
        select(MarketplaceListing).where(MarketplaceListing.id == bid.listing_id)
    )).scalar_one_or_none()
    if listing is None or listing.seller_id != user.id:
        raise HTTPException(403, "You can only accept bids on your own listings")
    if listing.status != "ACTIVE" or bid.status != "OPEN":
        raise HTTPException(409, "Bid is no longer open")
    bid.status = "ACCEPTED"
    listing.status = "SOLD"
    others = (await db.execute(
        select(Bid).where(Bid.listing_id == listing.id, Bid.id != bid.id, Bid.status == "OPEN")
    )).scalars().all()
    for o in others:
        o.status = "REJECTED"
    # Credit the seller's recovered value.
    seller = (await db.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    if seller is not None:
        seller.total_value_recovered = (seller.total_value_recovered or 0.0) + bid.bid_amount
    await db.commit()
    return {"status": "Bid Accepted", "transaction_started": True,
            "listing_id": listing.id, "bid_id": bid.id, "amount": bid.bid_amount}


@router.get("/market/overview")
async def seller_overview(
    user: User = Depends(get_demo_user),
    db: AsyncSession = Depends(get_db),
):
    """Seller dashboard stats — all from live DB rows."""
    listings = (await db.execute(
        select(MarketplaceListing).where(MarketplaceListing.seller_id == user.id)
    )).scalars().all()
    listing_ids = [row.id for row in listings]
    bids = (await db.execute(
        select(Bid).where(Bid.listing_id.in_(listing_ids))
    )).scalars().all() if listing_ids else []
    image_ids = list({row.image_id for row in listings})
    sold_total = sum(b.bid_amount for b in bids if b.status == "ACCEPTED")
    return {
        "total_scans": len(image_ids),
        "active_listings": sum(1 for row in listings if row.status == "ACTIVE"),
        "sold_listings": sum(1 for row in listings if row.status == "SOLD"),
        "bids_received": len(bids),
        "total_value_recovered": sold_total,
        "top_bid_open": max(
            (b.bid_amount for b in bids if b.status == "OPEN"), default=None),
    }


@router.get("/market/health")
async def market_health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
