"""Inference output normalisation and class mapping."""
from unittest.mock import MagicMock, patch

import pytest

from api.services.inference import UNIFIED_CLASSES, InferenceService


def make_mock_result(cls_idx: int, conf: float, xyxyn: list):
    boxes = MagicMock()
    boxes.xyxyn.tolist.return_value = [xyxyn]
    boxes.cls.tolist.return_value = [[cls_idx]]
    boxes.conf.tolist.return_value = [[conf]]
    result = MagicMock()
    result.boxes = boxes
    return [result]


@pytest.mark.parametrize("cls_idx,expected_class", [
    (0, "battery"),
    (2, "pcb"),
    (4, "ram"),
    (8, "peripheral_other"),
])
def test_class_names_match_unified_taxonomy(cls_idx, expected_class):
    assert UNIFIED_CLASSES[cls_idx] == expected_class


def test_low_confidence_detections_are_filtered():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model", create=True) as m:
        m.predict.return_value = make_mock_result(0, 0.19, [0.1, 0.1, 0.5, 0.5])
        detections, dropped = svc._parse_results(m.predict.return_value, conf_threshold=0.20)
    assert detections == []
    assert dropped == 1


def test_bbox_values_are_normalised():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model", create=True) as m:
        m.predict.return_value = make_mock_result(2, 0.92, [0.1, 0.2, 0.6, 0.8])
        dets, dropped = svc._parse_results(m.predict.return_value, conf_threshold=0.20)
    assert len(dets) == 1
    assert dropped == 0
    bbox = dets[0]["bbox"]
    assert bbox == {"x1": pytest.approx(0.1), "y1": pytest.approx(0.2),
                    "x2": pytest.approx(0.6), "y2": pytest.approx(0.8)}


def test_multiple_detections_returned():
    svc = InferenceService.__new__(InferenceService)
    with patch.object(svc, "_model", create=True):
        results = [make_mock_result(i, 0.9, [0.0, 0.0, 0.5, 0.5])[0] for i in range(3)]
        dets, dropped = svc._parse_results(results, conf_threshold=0.5)
    assert len(dets) == 3
    assert dropped == 0


def test_predict_detailed_sorts_best_first_and_counts_dropped():
    svc = InferenceService.__new__(InferenceService)
    with patch("api.services.inference.settings") as settings:
        settings.INFERENCE_CONF_THRESHOLD = 0.35
        settings.INFERENCE_MAX_DETECTIONS = 50
        settings.INFERENCE_DEDUP_IOU = 0.5
        settings.INFERENCE_PER_CLASS_MAX = 10
        with patch.object(svc, "_manager", create=True) as mgr:
            mgr._model.predict.return_value = [
                make_mock_result(0, 0.40, [0.1, 0.1, 0.5, 0.5])[0],
                make_mock_result(2, 0.95, [0.1, 0.1, 0.5, 0.5])[0],
                make_mock_result(4, 0.20, [0.1, 0.1, 0.5, 0.5])[0],
            ]
            dets, dropped, threshold = svc.predict_detailed("img")
    assert [d["confidence"] for d in dets] == [0.95, 0.40]
    assert dropped == 1
    assert threshold == 0.35


def test_dedupe_merges_overlapping_same_class_boxes():
    from api.services.inference import dedupe_detections

    with patch("api.services.inference.settings") as settings:
        settings.INFERENCE_DEDUP_IOU = 0.5
        settings.INFERENCE_PER_CLASS_MAX = 10
        dets = [
            {"class_name": "chip", "confidence": 0.9, "bbox": {"x1": 0.1, "y1": 0.1, "x2": 0.5, "y2": 0.5}},
            {"class_name": "chip", "confidence": 0.8, "bbox": {"x1": 0.12, "y1": 0.12, "x2": 0.5, "y2": 0.5}},
            {"class_name": "pcb", "confidence": 0.7, "bbox": {"x1": 0.12, "y1": 0.12, "x2": 0.5, "y2": 0.5}},
        ]
        kept, suppressed = dedupe_detections(dets)
    # Overlapping chip merged; same box, different class kept.
    assert [d["confidence"] for d in kept] == [0.9, 0.7]
    assert suppressed == 1


def test_dedupe_caps_instances_per_class():
    from api.services.inference import dedupe_detections

    with patch("api.services.inference.settings") as settings:
        settings.INFERENCE_DEDUP_IOU = 0.5
        settings.INFERENCE_PER_CLASS_MAX = 2
        dets = [
            {"class_name": "chip", "confidence": 0.9 - i * 0.01,
             "bbox": {"x1": i * 0.2, "y1": 0.1, "x2": i * 0.2 + 0.1, "y2": 0.2}}
            for i in range(5)
        ]
        kept, suppressed = dedupe_detections(dets)
    assert len(kept) == 2
    assert suppressed == 3
