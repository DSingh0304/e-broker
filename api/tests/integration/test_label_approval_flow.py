"""Admin approve → corrected status transitions."""


async def test_approve_sets_status_approved(client, db_session, seed_pending_image):
    resp = await client.post(
        f"/admin/queue/{seed_pending_image}/approve",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 200

    from sqlalchemy import select

    from api.db.models import Image
    result = await db_session.execute(select(Image).where(Image.id == seed_pending_image))
    img = result.scalar_one()
    assert img.review_status == "approved"


async def test_save_labels_sets_status_corrected(client, db_session, seed_pending_image):
    payload = {
        "labels": [
            {"className": "battery", "bbox": {"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2}}
        ]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}",
        json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 200

    from sqlalchemy import select

    from api.db.models import Image, Label
    img_result = await db_session.execute(select(Image).where(Image.id == seed_pending_image))
    assert img_result.scalar_one().review_status == "corrected"

    label_result = await db_session.execute(
        select(Label).where(Label.image_id == seed_pending_image, Label.is_active == True)
    )
    labels = label_result.scalars().all()
    assert len(labels) == 1
    assert labels[0].source == "admin"
    assert labels[0].class_name == "battery"


async def test_invalid_class_name_rejected(client, db_session, seed_pending_image):
    payload = {
        "labels": [{"className": "not_a_real_class", "bbox": {"xc": 0.5, "yc": 0.5, "w": 0.2, "h": 0.2}}]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}", json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422


async def test_out_of_bounds_bbox_rejected(client, db_session, seed_pending_image):
    payload = {
        "labels": [{"className": "pcb", "bbox": {"xc": 1.5, "yc": 0.5, "w": 0.2, "h": 0.2}}]
    }
    resp = await client.post(
        f"/admin/labels/{seed_pending_image}", json=payload,
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422
