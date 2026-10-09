"""Local inference with a trained YOLO26 checkpoint (smoke or full).

Usage:
    ./venv/bin/python ml/predict.py models/best_yolo26_smoke.pt <img...> [--conf 0.25] [--out models/preds]
    ./venv/bin/python ml/predict.py models/best_yolo26_smoke.pt --demo   # 4 diverse test images
Prints detections per image and saves annotated copies to --out.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def pick_demo() -> list[Path]:
    """One test image per target class (pcb, battery, smartphone, motherboard)."""

    want = {"pcb": None, "battery": None, "smartphone_device": None, "motherboard": None}
    names = (REPO / "data_processed/ebroker_yolo26/data.yaml").read_text()
    # parse names from data.yaml quickly
    import yaml

    cfg = yaml.safe_load(names)
    idx = {c: i for i, c in enumerate(cfg["names"])}
    labdir = REPO / "data_processed/ebroker_yolo26/test/labels"
    imgdir = REPO / "data_processed/ebroker_yolo26/test/images"
    for lp in sorted(labdir.glob("*.txt")):
        first = lp.read_text().split()
        if not first:
            continue
        for cls_name, current in want.items():
            if current is None and int(first[0]) == idx[cls_name]:
                for ext in (".jpg", ".jpeg", ".png", ".webp"):
                    cand = imgdir / (lp.stem + ext)
                    if cand.exists():
                        want[cls_name] = cand
                        break
        if all(want.values()):
            break
    return [p for p in want.values() if p is not None]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("weights")
    ap.add_argument("images", nargs="*")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--conf", type=float, default=0.25)
    ap.add_argument("--out", default="models/preds")
    args = ap.parse_args()

    from ultralytics import YOLO

    imgs = [Path(p) for p in args.images] or (pick_demo() if args.demo else [])
    assert imgs, "no images given (pass paths or --demo)"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = YOLO(args.weights)
    results = model.predict([str(p) for p in imgs], conf=args.conf, verbose=False)
    summary = []
    for img, r in zip(imgs, results):
        dets = [
            {"class": r.names[int(b.cls)], "conf": round(float(b.conf), 3),
             "box": [round(float(v), 1) for v in b.xyxy[0].tolist()]}
            for b in r.boxes
        ]
        ann = out / f"pred_{img.name}"
        r.save(filename=str(ann))
        print(f"{img.name}: {len(dets)} detection(s)")
        for d in dets:
            print(f"  - {d['class']} {d['conf']} box={d['box']}")
        summary.append({"image": img.name, "detections": dets, "annotated": str(ann)})
    (out / "preds.json").write_text(json.dumps(summary, indent=1))
    print(f"saved annotated images + preds.json to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
