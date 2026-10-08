"""Tiny async-aware TTL cache for hot read paths.

Request-side memoization: repeated identical reads (recycler directory,
admin stats) are served from memory instead of hitting Postgres on every
call. Entries expire by TTL; a stampede guard coalesces concurrent misses
for the same key into a single loader call.
"""

from __future__ import annotations

import asyncio
import functools
import time
from collections.abc import Awaitable, Callable
from typing import Any


class TTLCache:
    def __init__(self, ttl_s: float = 300.0, max_entries: int = 1024):
        self.ttl_s = ttl_s
        self.max_entries = max_entries
        self._store: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self.hits = 0
        self.misses = 0

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    def get(self, key: str) -> tuple[bool, Any]:
        entry = self._store.get(key)
        if entry is None:
            return False, None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            self._store.pop(key, None)
            return False, None
        return True, value

    def set(self, key: str, value: Any) -> None:
        if len(self._store) >= self.max_entries:
            oldest = min(self._store, key=lambda k: self._store[k][0])
            self._store.pop(oldest, None)
        self._store[key] = (time.monotonic() + self.ttl_s, value)

    def invalidate(self, prefix: str = "") -> int:
        doomed = [k for k in self._store if k.startswith(prefix)]
        for k in doomed:
            self._store.pop(k, None)
        return len(doomed)

    async def get_or_load(
        self, key: str, loader: Callable[[], Awaitable[Any]]
    ) -> Any:
        hit, value = self.get(key)
        if hit:
            self.hits += 1
            return value
        async with self._lock_for(key):
            hit, value = self.get(key)
            if hit:
                self.hits += 1
                return value
            self.misses += 1
            value = await loader()
            self.set(key, value)
            return value

    def stats(self) -> dict:
        return {"hits": self.hits, "misses": self.misses,
                "entries": len(self._store), "ttl_s": self.ttl_s}


def cached(cache: TTLCache, key_fn: Callable[..., str]):
    """Decorator: memoize an async function through `cache`."""
    def _decorate(fn: Callable[..., Awaitable[Any]]):
        @functools.wraps(fn)
        async def _wrapper(*args: Any, **kwargs: Any) -> Any:
            return await cache.get_or_load(key_fn(*args, **kwargs), lambda: fn(*args, **kwargs))
        return _wrapper
    return _decorate


# Shared caches (sized for a laptop deployment).
recycler_cache = TTLCache(ttl_s=300.0)
stats_cache = TTLCache(ttl_s=30.0)
