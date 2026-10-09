"""
Automated regression test — runs after every Modal training job.
Blocks the deploy gate if any class drops >5% mAP50 vs the baseline.
Run: CANDIDATE_MODEL_PATH=/tmp/candidate.pt pytest ml/tests/ -v
"""
import os
from pathlib import Path

import pytest

BASELINE_PATH = Path("models/best.pt")  # currently deployed
DATA_YAML = Path("data_processed/ebroker_yolo26/data.yaml")
MAP50_DROP_THRESHOLD = 0.05  # 5% absolute
OVERALL_DROP_THRESHOLD = 0.05

UNIFIED_CLASSES = [
    "battery", "hard_drive", "pcb", "motherboard", "ram",
    "copper_cable", "smartphone_device", "chip", "peripheral_other",
]


def _metrics(weights: Path) -> dict:
    from ultralytics import YOLO

    return YOLO(str(weights)).val(data=str(DATA_YAML), verbose=False).results_dict


@pytest.fixture(scope="session")
def baseline_metrics():
    if not BASELINE_PATH.exists():
        pytest.skip("No baseline model at models/best.pt")
    return _metrics(BASELINE_PATH)


@pytest.fixture(scope="session")
def candidate_metrics():
    cand = os.environ.get("CANDIDATE_MODEL_PATH", "")
    if not cand or not Path(cand).exists():
        pytest.skip("Set CANDIDATE_MODEL_PATH to a candidate .pt file")
    return _metrics(Path(cand))


def test_overall_map50_does_not_regress(baseline_metrics, candidate_metrics):
    baseline_map = baseline_metrics["metrics/mAP50(B)"]
    candidate_map = candidate_metrics["metrics/mAP50(B)"]
    drop = baseline_map - candidate_map
    assert drop <= OVERALL_DROP_THRESHOLD, (
        f"Overall mAP50 regression: {baseline_map:.3f} → {candidate_map:.3f} "
        f"(drop {drop:.3f} > threshold {OVERALL_DROP_THRESHOLD})"
    )


@pytest.mark.parametrize("class_name", UNIFIED_CLASSES)
def test_per_class_map50_does_not_regress(class_name, baseline_metrics, candidate_metrics):
    key = f"metrics/mAP50_{class_name}"
    if key not in baseline_metrics:
        pytest.skip(f"No baseline metric for {class_name}")
    drop = baseline_metrics[key] - candidate_metrics.get(key, 0.0)
    assert drop <= MAP50_DROP_THRESHOLD, (
        f"Class '{class_name}' mAP50 regression: "
        f"{baseline_metrics[key]:.3f} → {candidate_metrics.get(key, 0):.3f} "
        f"(drop {drop:.3f} > threshold {MAP50_DROP_THRESHOLD})"
    )
