"""Public recycler directory over a real DB."""
from api.db.models import Recycler


async def _seed(db_session):
    db_session.add(Recycler(name="Near Verified", city="Delhi", state="Delhi",
                            lat=28.61, lng=77.20, phone="+91-1", verified=True,
                            accepts=["battery", "pcb"]))
    db_session.add(Recycler(name="Far Verified", city="Chennai", state="Tamil Nadu",
                            lat=13.08, lng=80.27, phone="+91-2", verified=True,
                            accepts=["pcb"]))
    db_session.add(Recycler(name="Unverified", city="Delhi", state="Delhi",
                            lat=28.61, lng=77.20, phone="+91-3", verified=False,
                            accepts=["battery"]))
    await db_session.flush()


async def test_recyclers_lists_only_verified(client, db_session):
    await _seed(db_session)
    resp = await client.get("/recyclers")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    names = {r["name"] for r in body["recyclers"]}
    assert names == {"Near Verified", "Far Verified"}
    assert body["recyclers"][0]["lat"] is not None


async def test_recyclers_geo_sorted_by_distance(client, db_session):
    await _seed(db_session)
    resp = await client.get("/recyclers?lat=28.61&lng=77.20&radius_km=100")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["recyclers"][0]["name"] == "Near Verified"
    assert body["recyclers"][0]["distance_km"] is not None


async def test_recyclers_accepts_filter(client, db_session):
    await _seed(db_session)
    resp = await client.get("/recyclers?accepts=battery")
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


async def test_recyclers_rejects_unknown_class(client):
    resp = await client.get("/recyclers?accepts=toaster")
    assert resp.status_code == 400


async def test_recyclers_falls_back_to_nearest_when_radius_empty(client, db_session):
    await _seed(db_session)
    # Mumbai is >900 km from both seeded recyclers; radius 5 km matches
    # nothing, so the endpoint falls back to the nearest overall.
    resp = await client.get("/recyclers?lat=19.07&lng=72.87&radius_km=5")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert body["recyclers"][0]["name"] == "Far Verified"  # Chennai nearer Mumbai
    assert body["recyclers"][0]["distance_km"] > 500


async def test_find_recyclers_tool_uses_async_lookup_without_radius_cap(client, db_session):
    from api.services.strands_tools import find_recyclers

    await _seed(db_session)
    # Kanyakumari tip: nothing within 5 km, so the tool falls back to the
    # nearest recyclers instead of returning [].
    result = await find_recyclers.func(8.08, 77.54, 5.0, "battery")
    assert len(result["recyclers"]) >= 1
    dists = [r["distance_km"] for r in result["recyclers"]]
    assert dists == sorted(dists)
    assert all(d > 5 for d in dists)
