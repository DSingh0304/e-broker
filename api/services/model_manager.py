"""Thread-safe YOLO model holder with atomic hot-swap (canary promotion)."""
import threading
from typing import Any

from ultralytics import YOLO  # patch point: api.services.model_manager.YOLO


def _scalar(v: Any) -> float:
    if isinstance(v, (list, tuple)):
        return float(v[0])
    return float(v)


class _ModelRef:
    """Holder coupling a loaded model with its source path (fresh per load)."""

    def __init__(self, model: Any, path: str):
        self.model = model
        self.path = path

    def predict(self, *args: Any, **kwargs: Any) -> Any:
        return self.model.predict(*args, **kwargs)


class ModelManager:
    def __init__(self, model_path: str | None = None):
        from api.core.config import settings as _settings

        self._lock = threading.RLock()
        resolved = model_path or _settings.ACTIVE_MODEL_PATH
        self._model = _ModelRef(YOLO(resolved), resolved)
        self.model_path = resolved

    def predict(self, image: Any, conf: float = 0.20, max_det: int = 50) -> list[dict]:
        with self._lock:
            results = self._model.predict(image, conf=conf, max_det=max_det, verbose=False)
        out: list[dict] = []
        for r in results:
            boxes = r.boxes
            for i, row in enumerate(boxes.xyxyn):
                x1, y1, x2, y2 = (float(v) for v in row)
                out.append({
                    "class_name": self._class_name(int(_scalar(boxes.cls[i]))),
                    "confidence": float(_scalar(boxes.conf[i])),
                    "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                })
        return out

    def reload(self, new_path: str) -> None:
        new_model = _ModelRef(YOLO(new_path), new_path)  # load outside the lock
        with self._lock:
            self._model = new_model  # atomic swap
            self.model_path = new_path

    @staticmethod
    def _class_name(idx: int) -> str:
        from api.core.config import UNIFIED_CLASSES

        if 0 <= idx < len(UNIFIED_CLASSES):
            return UNIFIED_CLASSES[idx]
        return "peripheral_other"
