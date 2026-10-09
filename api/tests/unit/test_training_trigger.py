"""Auto-trigger threshold check logic."""
import pytest

from api.services.training_service import should_trigger_training


@pytest.mark.parametrize("new_labels,threshold,expect_trigger", [
    (0, 200, False),
    (199, 200, False),
    (200, 200, True),
    (847, 200, True),
])
def test_trigger_threshold(new_labels, threshold, expect_trigger):
    assert should_trigger_training(new_labels, threshold) == expect_trigger


def test_trigger_blocked_when_run_already_active():
    assert should_trigger_training(500, 200, active_run=True) is False
