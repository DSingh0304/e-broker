"""Model approval + hot-swap pipeline."""
from unittest.mock import patch


async def test_approve_deploy_promotes_model(client, db_session, seed_candidate_model):
    with patch("api.services.model_manager.ModelManager.reload") as mock_reload:
        resp = await client.post(
            f"/admin/models/{seed_candidate_model}/deploy",
            headers={"Authorization": "Bearer admin-test-token"}
        )
    assert resp.status_code == 200
    mock_reload.assert_called_once()

    from sqlalchemy import select

    from api.db.models import ModelVersion
    result = await db_session.execute(
        select(ModelVersion).where(ModelVersion.id == seed_candidate_model)
    )
    version = result.scalar_one()
    assert version.deployed_at is not None
    assert version.approved_by == "admin@test.com"


async def test_regression_guard_blocks_deploy_on_map_drop(client, seed_regression_candidate):
    """Model with >5% mAP50 drop vs deployed cannot be approved."""
    resp = await client.post(
        f"/admin/models/{seed_regression_candidate}/deploy",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 422
    assert "regression" in resp.json()["detail"].lower()
