"""Salted password hashing (PBKDF2-HMAC-SHA256, 200k rounds).

Stored format: ``pbkdf2$200000$<salt-hex>$<hash-hex>``.
Legacy unsalted SHA-256 hex digests (early seed data) still verify, so
existing rows keep working and are upgraded on next login.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ITERATIONS = 200_000
_PREFIX = "pbkdf2"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{_PREFIX}${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    # Modern salted format.
    if stored.startswith(f"{_PREFIX}$"):
        try:
            _, iters, salt_hex, hash_hex = stored.split("$")
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), bytes.fromhex(salt_hex), int(iters)
            )
            return hmac.compare_digest(digest.hex(), hash_hex)
        except (ValueError, TypeError):
            return False
    # Legacy unsalted SHA-256 (early seeds) — accepted, upgraded on login.
    return hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), stored)


def is_legacy_hash(stored: str | None) -> bool:
    return bool(stored) and not stored.startswith(f"{_PREFIX}$")
