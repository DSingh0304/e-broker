"""Inference service: YOLO predict → normalised detection dicts."""
from typing import Any

from api.core.config import UNIFIED_CLASSES, settings
from api.services.model_manager import ModelManager

__all__ = ["UNIFIED_CLASSES", "InferenceService"]


def _iou(a: dict, b: dict) -> float:
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a["x2"] - a["x1"]) * max(0.0, a["y2"] - a["y1"])
    area_b = max(0.0, b["x2"] - b["x1"]) * max(0.0, b["y2"] - b["y1"])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def dedupe_detections(detections: list[dict]) -> tuple[list[dict], int]:
    """Best-first de-duplication for serving.

    Input must already be sorted by confidence descending. Keeps the
    strongest box per overlapping same-class cluster (IoU bar) and caps
    instances per class. Returns (kept, suppressed).
    """
    kept: list[dict] = []
    suppressed = 0
    per_class: dict[str, int] = {}
    for d in detections:
        cls = d["class_name"]
        if per_class.get(cls, 0) >= settings.INFERENCE_PER_CLASS_MAX:
            suppressed += 1
            continue
        if any(
            k["class_name"] == cls
            and _iou(k["bbox"], d["bbox"]) > settings.INFERENCE_DEDUP_IOU
            for k in kept
        ):
            suppressed += 1
            continue
        per_class[cls] = per_class.get(cls, 0) + 1
        kept.append(d)
    return kept, suppressed


class InferenceService:
    def __init__(self, model_path: str | None = None):
        self._manager = ModelManager(model_path or settings.ACTIVE_MODEL_PATH)

    def predict(self, image: Any, conf_threshold: float | None = None) -> list[dict]:
        from ultralytics import YOLO  # local import: keeps module import light for tests

        _ = YOLO
        dets, _, _ = self.predict_detailed(image, conf_threshold)
        return dets

    def predict_detailed(
        self, image: Any, conf_threshold: float | None = None
    ) -> tuple[list[dict], int, float]:
        """Predict + best-first ordering. Returns (detections, dropped, threshold).

        Detections below the bar are counted (not guessed at) so callers can
        report how many low-confidence candidates were withheld.
        """
        from ultralytics import YOLO  # local import: keeps module import light for tests

        _ = YOLO
        threshold = conf_threshold or settings.INFERENCE_CONF_THRESHOLD
        results = self._manager._model.predict(image, verbose=False)
        dets, dropped = self._parse_results(results, threshold)
        dets.sort(key=lambda d: d["confidence"], reverse=True)
        kept, suppressed = dedupe_detections(dets)
        kept = kept[: settings.INFERENCE_MAX_DETECTIONS]
        return kept, dropped + suppressed, threshold

    def _parse_results(self, results: Any, conf_threshold: float) -> tuple[list[dict], int]:
        dets: list[dict] = []
        dropped = 0
        for r in results:
            boxes = r.boxes
            xyxyn = boxes.xyxyn.tolist() if hasattr(boxes.xyxyn, "tolist") else boxes.xyxyn
            cls = boxes.cls.tolist() if hasattr(boxes.cls, "tolist") else boxes.cls
            conf = boxes.conf.tolist() if hasattr(boxes.conf, "tolist") else boxes.conf
            for row, c, p in zip(xyxyn, cls, conf):
                c_val = c[0] if isinstance(c, (list, tuple)) else c
                p_val = p[0] if isinstance(p, (list, tuple)) else p
                if float(p_val) < conf_threshold:
                    dropped += 1
                    continue
                x1, y1, x2, y2 = (float(v) for v in row)
                dets.append({
                    "class_name": UNIFIED_CLASSES[int(c_val)],
                    "confidence": float(p_val),
                    "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                })
        return dets, dropped
