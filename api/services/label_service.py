"""Label domain logic: review state machine + bbox/class validation."""
import enum

from api.core.config import UNIFIED_CLASSES


class LabelSource(str, enum.Enum):
    MODEL = "model"
    ADMIN = "admin"
    IMPORT = "import"


def compute_review_status(source: LabelSource | str) -> str:
    """Admin clicked Approve (model labels stand) vs redrew boxes (admin labels)."""
    src = LabelSource(source)
    if src == LabelSource.MODEL:
        return "approved"
    return "corrected"


def validate_bbox(bbox: dict) -> bool:
    try:
        xc, yc, w, h = float(bbox["xc"]), float(bbox["yc"]), float(bbox["w"]), float(bbox["h"])
    except (KeyError, TypeError, ValueError):
        return False
    if not all(0.0 <= v <= 1.0 for v in (xc, yc, w, h)):
        return False
    return w > 0 and h > 0


def validate_class(class_name: str) -> bool:
    return class_name in UNIFIED_CLASSES
