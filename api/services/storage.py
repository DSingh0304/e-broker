"""S3-compatible object storage (MinIO in Docker Compose, AWS S3 in cloud).

boto3 speaks the S3 HTTP API against either endpoint, so this module has no
AWS service dependency — point AWS_ENDPOINT_URL at MinIO for local production.
Callers must tolerate connection errors; uploads fall back to a bounded
in-process store so scans keep working if storage restarts.
"""
import io
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image

from api.core.config import settings

log = logging.getLogger("ebroker.storage")

JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG"


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_DEFAULT_REGION,
        config=Config(
            connect_timeout=2, read_timeout=5, retries={"max_attempts": 1},
            s3={"addressing_style": "path"},
        ),
    )


def ensure_bucket(client, bucket: str) -> None:
    """Create the bucket if missing. MinIO rejects LocationConstraint payloads,
    so try the plain call first and retry with a constraint for real AWS."""
    try:
        client.head_bucket(Bucket=bucket)
        return
    except ClientError as e:
        if int(e.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)) not in (400, 403, 404):
            raise
    except Exception as exc:  # noqa: BLE001 — endpoint unreachable, bucket likely missing
        log.debug("head_bucket failed, will attempt create: %s", exc)
    try:
        client.create_bucket(Bucket=bucket)
    except Exception:  # noqa: BLE001 — retry with AWS-style constraint below
        # Real AWS requires a LocationConstraint outside us-east-1.
        client.create_bucket(
            Bucket=bucket,
            CreateBucketConfiguration={"LocationConstraint": settings.AWS_DEFAULT_REGION},
        )


def validate_image_bytes(data: bytes) -> str:
    """Magic-bytes check. Returns 'jpeg' | 'png', raises ValueError otherwise."""
    if data[:3] == JPEG_MAGIC:
        return "jpeg"
    if data[:4] == PNG_MAGIC:
        return "png"
    raise ValueError("Not a JPEG/PNG image")


def strip_exif_and_resize(data: bytes, max_side: int = 1280) -> tuple[bytes, int, int]:
    """Rebuild pixels (drops EXIF/GPS), downscale longest side, return JPEG bytes + wh."""
    raw_img = Image.open(io.BytesIO(data))
    raw_img.verify()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    if w < 224 or h < 224:
        raise ValueError("Image too small (min 224x224)")
    if w > 8000 or h > 8000 or max(w, h) / max(1, min(w, h)) > 20:
        raise ValueError("Image dimensions out of bounds")
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue(), img.size[0], img.size[1]


def put_object(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    """Upload to S3-compatible storage; on connection failure keep bytes in a
    bounded local fallback store and return a placeholder URL."""
    try:
        client = s3_client()
        ensure_bucket(client, settings.S3_BUCKET)
        client.put_object(Bucket=settings.S3_BUCKET, Key=key, Body=data, ContentType=content_type)
        base = (settings.AWS_ENDPOINT_URL or f"https://{settings.S3_BUCKET}.s3.amazonaws.com").rstrip("/")
        return f"{base}/{settings.S3_BUCKET}/{key}"
    except Exception as exc:  # noqa: BLE001 — storage may be restarting
        log.warning("Object storage unreachable, using fallback store: %s", exc)
        _fallback_put(key, data)
        return f"s3://{settings.S3_BUCKET}/{key}"


# ── Local fallback store (storage restarting) ───────────────────────────────
# Bounded FIFO: only populated when storage writes fail, so a healthy MinIO
# never accumulates memory here.

_FALLBACK_MAX_ENTRIES = 100
_fallback: dict[str, bytes] = {}


def _fallback_put(key: str, data: bytes) -> None:
    if len(_fallback) >= _FALLBACK_MAX_ENTRIES:
        _fallback.pop(next(iter(_fallback)))
    _fallback[key] = data


def get_object(key: str) -> bytes:
    """Download image bytes from storage (or the local fallback store).
    Raises FileNotFoundError when unavailable."""
    try:
        resp = s3_client().get_object(Bucket=settings.S3_BUCKET, Key=key)
        return resp["Body"].read()
    except Exception:  # noqa: BLE001 — try fallback before giving up
        if key in _fallback:
            return _fallback[key]
        raise FileNotFoundError(f"s3://{settings.S3_BUCKET}/{key} unavailable")
