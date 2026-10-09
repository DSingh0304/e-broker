"""Marketplace listings + bids over a real DB (demo identity headers)."""
import itertools
from pathlib import Path

import httpx
import pytest
import respx

_uid = itertools.count(100)


def _kab():
    n = next(_uid)
    return {"X-User-Phone": f"+919{n:09d}", "X-User-Role": "KABADIWALA"}


def _ven():
    n = next(_uid)
    return {"X-User-Phone": f"+911{n:09d}", "X-User-Role": "VENDOR"}


FIXTURE_IMAGE = Path("api/tests/fixtures/test_pcb.jpg")


@pytest.fixture
async def scanned_image(client):
    up = await client.post(
        "/upload",
        files={"file": ("img.jpg", FIXTURE_IMAGE.read_bytes(), "image/jpeg")},
    )
    assert up.status_code == 200
    return up.json()["imageId"]


async def test_create_and_browse_listing(client, scanned_image):
    kab = _kab()
    r = await client.post("/market/listings", json={
        "image_id": scanned_image, "total_weight_kg": 12.5, "asking_price": 4500,
    }, headers=kab)
    assert r.status_code == 200, r.text
    listing = r.json()
    assert listing["status"] == "ACTIVE"
    assert listing["total_weight_kg"] == 12.5

    feed = await client.get("/market/listings")
    assert feed.status_code == 200
    assert any(item["id"] == listing["id"] for item in feed.json())


async def test_create_listing_rejects_unknown_image(client):
    r = await client.post("/market/listings", json={
        "image_id": "00000000-0000-0000-0000-000000000000",
        "total_weight_kg": 1.0, "asking_price": 100,
    }, headers=_kab())
    assert r.status_code == 404


async def test_vendor_cannot_create_listing(client, scanned_image):
    r = await client.post("/market/listings", json={
        "image_id": scanned_image, "total_weight_kg": 1.0, "asking_price": 100,
    }, headers=_ven())
    assert r.status_code == 403


async def test_bid_accept_flow(client, scanned_image):
    kab, ven = _kab(), _ven()
    listing = (await client.post("/market/listings", json={
        "image_id": scanned_image, "total_weight_kg": 10.0, "asking_price": 5000,
    }, headers=kab)).json()

    # vendor bids
    bid = (await client.post("/market/bids", json={
        "listing_id": listing["id"], "bid_amount": 4800,
    }, headers=ven))
    assert bid.status_code == 200, bid.text
    bid_id = bid.json()["id"]

    # kabadiwala sees it in inbox
    inbox = (await client.get("/market/bids/inbox", headers=kab)).json()
    assert any(b["id"] == bid_id for b in inbox)

    # accept closes the deal
    acc = await client.post(f"/market/bids/{bid_id}/accept", headers=kab)
    assert acc.status_code == 200
    assert acc.json()["transaction_started"] is True

    # second bid now rejected with 409
    again = await client.post("/market/bids", json={
        "listing_id": listing["id"], "bid_amount": 4900,
    }, headers=ven)
    assert again.status_code == 409


async def test_vendor_my_bids_and_overview(client, scanned_image):
    kab, ven = _kab(), _ven()
    listing = (await client.post("/market/listings", json={
        "image_id": scanned_image, "total_weight_kg": 5.0, "asking_price": 2000,
    }, headers=kab)).json()
    await client.post("/market/bids", json={
        "listing_id": listing["id"], "bid_amount": 1900,
    }, headers=ven)

    mine = (await client.get("/market/bids/mine", headers=ven)).json()
    assert len(mine) == 1
    assert mine[0]["bid_amount"] == 1900

    ov = (await client.get("/market/overview", headers=kab)).json()
    assert ov["active_listings"] >= 1
    assert ov["bids_received"] >= 1


async def test_market_requires_identity(client):
    r = await client.post("/market/listings", json={
        "image_id": "x", "total_weight_kg": 1.0, "asking_price": 100,
    })
    assert r.status_code == 401


async def test_scan_url_rejects_non_image(client):
    with respx.mock:
        respx.get("https://example.com/page").mock(
            return_value=httpx.Response(200, text="<html>not an image</html>",
                                        headers={"content-type": "text/html"})
        )
        r = await client.post("/scan-url", json={"url": "https://example.com/page"})
    assert r.status_code == 400
    assert "not an image" in r.json()["detail"]


async def test_scan_url_blocks_metadata_ip(client):
    r = await client.post("/scan-url", json={"url": "http://169.254.169.254/latest/meta-data"})
    assert r.status_code == 400


async def test_scan_url_happy_path(client):
    img_bytes = FIXTURE_IMAGE.read_bytes()
    with respx.mock:
        respx.get("https://example.com/photo.jpg").mock(
            return_value=httpx.Response(200, content=img_bytes,
                                        headers={"content-type": "image/jpeg"})
        )
        r = await client.post("/scan-url", json={"url": "https://example.com/photo.jpg"})
    assert r.status_code == 200, r.text
    assert "imageId" in r.json()
