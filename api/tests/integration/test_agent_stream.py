"""Integration tests for SSE agent endpoints."""
import json

import pytest


@pytest.mark.asyncio
async def test_agent_stream_requires_detections_first(client, seed_image_no_dets):
    """Image without detections → 422."""
    resp = await client.get(f"/agent/{seed_image_no_dets['id']}/stream")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_agent_result_pending_before_stream(client, seed_image_with_dets):
    """Poll endpoint returns pending before any stream is opened."""
    resp = await client.get(f"/agent/{seed_image_with_dets['id']}/result")
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_agent_stream_replays_cache(client, seed_image_with_agent_result):
    """If result already in DB (status=done), stream replays instantly."""
    resp = await client.get(f"/agent/{seed_image_with_agent_result['id']}/stream")
    lines = [line for line in resp.text.splitlines() if line.startswith("data:")]
    events = [json.loads(line[len("data: "):]) for line in lines]
    assert any(e["type"] == "status" and e.get("message") == "cached" for e in events)
    assert any(e["type"] == "result" for e in events)


@pytest.mark.asyncio
async def test_agent_stream_concurrent_returns_409(client, seed_image_streaming):
    """If status=streaming already, second request → 409."""
    resp = await client.get(f"/agent/{seed_image_streaming['id']}/stream")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_invalid_image_id_returns_400(client):
    resp = await client.get("/agent/not-a-uuid/stream")
    assert resp.status_code == 400
