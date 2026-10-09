"""Training trigger check endpoint + Modal spawn integration."""
from unittest.mock import MagicMock, patch


async def test_trigger_check_returns_new_label_count(client, db_session, seed_approved_labels):
    """GET /internal/training/trigger-check returns correct count."""
    resp = await client.get(
        "/internal/training/trigger-check",
        headers={"X-Internal-Key": "test-internal-key"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "new_labels" in data
    assert isinstance(data["new_labels"], int)


async def test_trigger_spawns_modal_job(client):
    with patch("api.routers.training.modal_train.spawn") as mock_spawn:
        mock_call = MagicMock()
        mock_call.object_id = "modal-run-abc123"
        mock_spawn.return_value = mock_call

        resp = await client.post(
            "/admin/training/trigger",
            headers={"Authorization": "Bearer admin-test-token"}
        )
    assert resp.status_code == 200
    assert resp.json()["modalRunId"] == "modal-run-abc123"
    mock_spawn.assert_called_once()


async def test_duplicate_trigger_blocked_when_run_active(client, db_session, seed_active_run):
    resp = await client.post(
        "/admin/training/trigger",
        headers={"Authorization": "Bearer admin-test-token"}
    )
    assert resp.status_code == 409
    assert "already running" in resp.json()["detail"].lower()


async def test_metrics_endpoint_updates_run_record(client, db_session, seed_queued_run):
    payload = {"type": "epoch", "epoch": 5, "total": 30, "loss": 2.14, "mAP50": 0.731}
    resp = await client.post(
        "/internal/training/metrics",
        json={"runId": seed_queued_run, **payload},
        headers={"X-Internal-Key": "test-internal-key"}
    )
    assert resp.status_code == 200

    from sqlalchemy import select

    from api.db.models import TrainingRun
    result = await db_session.execute(select(TrainingRun).where(TrainingRun.id == seed_queued_run))
    run = result.scalar_one()
    assert run.status == "running"
