"""SQLAlchemy ORM - merged ARCHITECTURE.md §6 + Implementation Plan tables."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cognito_sub: Mapped[str] = mapped_column(String(128), unique=True, default=_uuid)
    phone_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(128), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="KABADIWALA")
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    total_value_recovered: Mapped[float] = mapped_column(Float, default=0.0)

class Image(Base):
    __tablename__ = "images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    s3_url: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    uploader_id: Mapped[str] = mapped_column(String(64), default="")
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    review_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|approved|corrected|skipped


class Detection(Base):
    __tablename__ = "detections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    image_id: Mapped[str] = mapped_column(String(36), ForeignKey("images.id", ondelete="CASCADE"), index=True)
    class_name: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    bbox: Mapped[dict] = mapped_column(JSON, nullable=False)  # {x1,y1,x2,y2} normalized
    model_version: Mapped[str] = mapped_column(String(64), default="best.pt")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Label(Base):
    __tablename__ = "labels"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    image_id: Mapped[str] = mapped_column(String(36), ForeignKey("images.id", ondelete="CASCADE"), index=True)
    class_name: Mapped[str] = mapped_column(String(32), nullable=False)
    bbox: Mapped[dict] = mapped_column(JSON, nullable=False)  # {xc,yc,w,h} YOLO format
    source: Mapped[str] = mapped_column(String(16), default="model")  # model|admin|import
    created_by: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TrainingRun(Base):
    __tablename__ = "training_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    modal_run_id: Mapped[str] = mapped_column(String(128), default="")
    triggered_by: Mapped[str] = mapped_column(String(128), default="")
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|done|failed
    epochs: Mapped[int] = mapped_column(Integer, default=30)
    dataset_images: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ModelVersion(Base):
    __tablename__ = "model_versions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("training_runs.id"), nullable=True)
    s3_key: Mapped[str] = mapped_column(Text, default="")
    map50: Mapped[float | None] = mapped_column(Float, nullable=True)
    map50_95: Mapped[float | None] = mapped_column(Float, nullable=True)
    per_class: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    canary_traffic_pct: Mapped[int] = mapped_column(Integer, default=0)


class Recycler(Base):
    __tablename__ = "recyclers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str] = mapped_column(Text, default="")
    city: Mapped[str] = mapped_column(String(64), default="")
    state: Mapped[str] = mapped_column(String(64), default="")
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lng: Mapped[float] = mapped_column(Float, default=0.0)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    website: Mapped[str | None] = mapped_column(String(256), nullable=True)
    cpcb_reg_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cpcb_valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepts: Mapped[list | None] = mapped_column(JSON, nullable=True)
    min_quantity_kg: Mapped[float] = mapped_column(Float, default=0.0)
    processing_types: Mapped[list | None] = mapped_column(JSON, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class AgentResult(Base):
    """
    Cached Strands agent output for a given image. One row per image.
    status values: pending | streaming | done | partial | error
    """

    __tablename__ = "agent_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    image_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False, index=True, unique=True,
    )
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    price_per_kg: Mapped[float] = mapped_column(Float, default=0.0)


class AdminUser(Base):
    __tablename__ = "admin_users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cognito_sub: Mapped[str] = mapped_column(String(128), unique=True, default="")
    role: Mapped[str] = mapped_column(String(32), default="annotator")


class VendorProfile(Base):
    __tablename__ = "vendor_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    cpcb_reg_no: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)


class MarketplaceListing(Base):
    __tablename__ = "listings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    seller_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    image_id: Mapped[str] = mapped_column(String(36), ForeignKey("images.id", ondelete="CASCADE"))
    total_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    asking_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Bid(Base):
    __tablename__ = "bids"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    listing_id: Mapped[str] = mapped_column(String(36), ForeignKey("listings.id", ondelete="CASCADE"))
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    bid_amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
