"""Label CRUD logic — approval state machine."""
import pytest

from api.services.label_service import (
    LabelSource,
    compute_review_status,
    validate_bbox,
    validate_class,
)


@pytest.mark.parametrize("source,expected_status", [
    (LabelSource.MODEL, "approved"),   # admin clicked Approve
    (LabelSource.ADMIN, "corrected"),  # admin redrew bboxes
])
def test_review_status_transitions(source, expected_status):
    status = compute_review_status(source)
    assert status == expected_status


@pytest.mark.parametrize("bbox,valid", [
    ({"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2}, True),
    ({"xc": 0.0, "yc": 0.0, "w": 0.0, "h": 0.0}, False),   # zero-area
    ({"xc": 1.1, "yc": 0.5, "w": 0.3, "h": 0.2}, False),   # out of range
    ({"xc": 0.5, "yc": 0.5, "w": -0.1, "h": 0.2}, False),  # negative dim
    ({"xc": 0.5, "yc": 0.5, "w": 0.3, "h": 0.2, "extra": 99}, True),  # extra keys OK
])
def test_bbox_validation(bbox, valid):
    assert validate_bbox(bbox) == valid


def test_class_must_be_in_unified_taxonomy():
    assert validate_class("battery") is True
    assert validate_class("unknown_thing") is False
