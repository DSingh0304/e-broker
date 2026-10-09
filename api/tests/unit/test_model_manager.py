"""Thread-safe hot-swap, load/reload lifecycle."""
import threading
from unittest.mock import MagicMock, patch

import pytest

from api.services.model_manager import ModelManager


@pytest.fixture
def mock_yolo(monkeypatch):
    # NOTE: TESTING.md spells this as MagicMock(boxes=MagicMock(..., cls=[[2]], ...))
    # but `cls=` collides with Mock.__new__'s first parameter (TypeError), so the
    # same shapes are built via attribute assignment instead.
    mock = MagicMock()
    boxes = MagicMock()
    boxes.xyxyn = [[0.1, 0.2, 0.3, 0.4]]
    boxes.cls = [[2]]
    boxes.conf = [[0.92]]
    result = MagicMock()
    result.boxes = boxes
    mock.predict.return_value = [result]
    with patch("api.services.model_manager.YOLO", return_value=mock):
        yield mock


def test_predict_returns_normalised_detections(mock_yolo):
    mgr = ModelManager(model_path="fake.pt")
    result = mgr.predict("fake_image.jpg")
    assert isinstance(result, list)
    assert result[0]["class_name"] in [
        "battery", "hard_drive", "pcb", "motherboard", "ram",
        "copper_cable", "smartphone_device", "chip", "peripheral_other"
    ]
    assert 0.0 <= result[0]["confidence"] <= 1.0
    bbox = result[0]["bbox"]
    assert all(0.0 <= v <= 1.0 for v in bbox.values())


def test_reload_is_atomic_under_concurrent_reads(mock_yolo, tmp_path):
    """Concurrent predict calls must not see a half-loaded model."""
    mgr = ModelManager(model_path="fake.pt")
    errors = []
    results = []

    def reader():
        try:
            results.append(mgr.predict("img.jpg"))
        except Exception as e:  # noqa: BLE001 — spec collects concurrent errors
            errors.append(e)

    def reloader():
        mgr.reload("new_fake.pt")

    threads = [threading.Thread(target=reader) for _ in range(10)]
    threads.append(threading.Thread(target=reloader))
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Errors during concurrent access: {errors}"


def test_reload_replaces_model(mock_yolo):
    mgr = ModelManager(model_path="v1.pt")
    old_model = mgr._model
    mgr.reload("v2.pt")
    assert mgr._model is not old_model
