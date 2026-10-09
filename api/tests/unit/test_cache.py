"""TTL request-cache contracts: hits, expiry, stampede guard, invalidation."""
import asyncio

import pytest

from api.core.cache import TTLCache


@pytest.mark.asyncio
async def test_cache_hit_avoids_loader():
    cache = TTLCache(ttl_s=60.0)
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return {"n": 1}

    assert await cache.get_or_load("k", loader) == {"n": 1}
    assert await cache.get_or_load("k", loader) == {"n": 1}
    assert calls == 1
    assert cache.stats()["hits"] == 1


@pytest.mark.asyncio
async def test_cache_expiry_reloads():
    cache = TTLCache(ttl_s=0.01)
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        return calls

    assert await cache.get_or_load("k", loader) == 1
    await asyncio.sleep(0.02)
    assert await cache.get_or_load("k", loader) == 2
    assert calls == 2


@pytest.mark.asyncio
async def test_cache_stampede_single_flight():
    cache = TTLCache(ttl_s=60.0)
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return "v"

    results = await asyncio.gather(*[cache.get_or_load("k", loader) for _ in range(10)])
    assert results == ["v"] * 10
    assert calls == 1


def test_cache_invalidate_prefix():
    cache = TTLCache(ttl_s=60.0)
    cache.set("a:1", 1)
    cache.set("a:2", 2)
    cache.set("b:1", 3)
    assert cache.invalidate("a:") == 2
    assert cache.get("b:1") == (True, 3)
