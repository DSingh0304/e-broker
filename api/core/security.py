"""Auth: admin JWT (Cognito in prod, static bypass in dev/test) + internal HMAC key."""
import hashlib
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

from fastapi import Depends, Header, HTTPException, Request, status

from api.core.config import settings


@dataclass
class AdminIdentity:
    email: str
    role: str = "admin"


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def require_admin(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AdminIdentity:
    def _check_token(token: str | None) -> AdminIdentity | None:
        if token and settings.ADMIN_JWT_BYPASS and token == settings.ADMIN_JWT_BYPASS_TOKEN:
            return AdminIdentity(email=settings.ADMIN_BYPASS_EMAIL)
        return None

    if authorization and authorization.startswith("Bearer "):
        hit = _check_token(authorization.removeprefix("Bearer ").strip())
        if hit:
            return hit
        # Prod path: Cognito JWT verification goes here (JWKS + PyJWT).
        raise _unauthorized("Invalid admin credentials")
    # EventSource (SSE) cannot send an Authorization header, so browser streams
    # pass ?token= instead. Same static dev bypass, checked the same way.
    hit = _check_token(request.query_params.get("token"))
    if hit:
        return hit
    # Dev/E2E only: logged-in browser (dev-admin cookie)
    # calling the API directly without a Bearer token.
    if settings.ADMIN_JWT_BYPASS and request.cookies.get("ebroker_dev_admin") == "1":
        return AdminIdentity(email=settings.ADMIN_BYPASS_EMAIL)
    # Prod path: Cognito JWT verification goes here (JWKS + PyJWT).
    raise _unauthorized()


async def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    if not x_internal_key or x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bad internal key")


def fingerprint_uploader(user_agent: str, client_ip: str, hour_bucket: str) -> str:
    """Zero-PII uploader id: SHA-256(UA + truncated IP + hour bucket)."""
    raw = f"{user_agent}|{client_ip}|{hour_bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def optional_admin(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AdminIdentity | None:
    try:
        return await require_admin(request, authorization)
    except HTTPException:
        return None


def is_safe_url(url: str) -> bool:
    """SSRF guard for server-side URL fetching: http(s) only, no private/
    loopback/link-local targets (blocks 169.254.169.254 metadata etc.)."""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
            return False
    return True


_ = Depends  # keep import surface stable for routers
