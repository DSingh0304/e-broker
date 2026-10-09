"""E-Broker EDA: audit raw datasets before preprocessing.

Reads dataset/trcproject + dataset/pc_parts (+ electrocom61 note) and reports:
  - split counts, images vs labels, orphans
  - label format (yolo bbox5 vs segmentation-polygon)
  - per-class instance distribution
  - image size / mode / corruption stats
  - coordinate sanity (out-of-range, degenerate boxes)

Usage:
    ./venv/bin/python ml/eda.py
    ./venv/bin/python ml/eda.py --plots   # also writes PNGs to ml/reports/
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO / "dataset"
REPORT_DIR = Path(__file__).resolve().parent / "reports"

SOURCES = {
    "trcproject": DATASET_DIR / "trcproject",
    "pc_parts": DATASET_DIR / "pc_parts",
    "balanced_ewaste": DATASET_DIR / "balanced_ewaste",
    "pcb_components": DATASET_DIR / "pcb_components",
    "electrocom61_yolo": DATASET_DIR / "electrocom61_yolo",
}

SPLITS = ("train", "valid", "test")
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def load_names(data_yaml: Path) -> list[str]:
    import yaml

    cfg = yaml.safe_load(data_yaml.read_text()) or {}
    names = cfg.get("names", [])
    if isinstance(names, dict):  # {0: 'cat', ...} form
        return [names[k] for k in sorted(names)]
    return [str(n) for n in names]


def audit_labels(label_files: list[Path]) -> dict:
    fmt = Counter()
    per_class = Counter()
    n_empty = 0
    n_lines = 0
    bad_lines: list[str] = []
    out_of_range = 0
    for f in label_files:
        lines = [ln.strip() for ln in f.read_text().splitlines() if ln.strip()]
        if not lines:
            n_empty += 1
            continue
        for ln in lines:
            parts = ln.split()
            n_lines += 1
            try:
                cls = int(float(parts[0]))
            except ValueError:
                bad_lines.append(f"{f.name}: {ln[:80]}")
                continue
            per_class[cls] += 1
            n = len(parts)
            if n == 5:
                fmt["bbox5"] += 1
                try:
                    vals = [float(v) for v in parts[1:5]]
                except ValueError:
                    bad_lines.append(f"{f.name}: {ln[:80]}")
                    continue
                if any(v < 0 or v > 1 for v in vals):
                    out_of_range += 1
            elif n > 5:
                fmt["polygon_seg"] += 1
                try:
                    vals = [float(v) for v in parts[1:]]
                except ValueError:
                    bad_lines.append(f"{f.name}: {ln[:80]}")
                    continue
                if any(v < 0 or v > 1.000001 for v in vals):
                    out_of_range += 1
            else:
                fmt[f"malformed_n{n}"] += 1
    return {
        "label_files": len(label_files),
        "empty_label_files": n_empty,
        "instances": n_lines,
        "format": dict(fmt),
        "per_class": {str(k): v for k, v in sorted(per_class.items())},
        "out_of_range_coords": out_of_range,
        "bad_lines_sample": bad_lines[:10],
    }


def audit_images(img_files: list[Path], sample: int = 400) -> dict:
    from PIL import Image

    sizes: list[tuple[int, int]] = []
    modes = Counter()
    corrupt: list[str] = []
    checked = img_files[:sample] if len(img_files) > sample else img_files
    for f in checked:
        try:
            with Image.open(f) as im:
                im.verify()
            with Image.open(f) as im2:
                sizes.append(im2.size)
                modes[im2.mode] += 1
        except Exception as e:  # noqa: BLE001
            corrupt.append(f"{f.name}: {e}")
    out: dict = {
        "total": len(img_files),
        "checked": len(checked),
        "corrupt": corrupt[:10],
        "n_corrupt": len(corrupt),
        "modes": dict(modes),
    }
    if sizes:
        ws, hs = zip(*sizes)
        out.update(
            {
                "width_min": min(ws),
                "width_max": max(ws),
                "height_min": min(hs),
                "height_max": max(hs),
                "uniform_size": len(set(sizes)) == 1,
                "most_common_size": list(Counter(sizes).most_common(3)),
            }
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plots", action="store_true", help="write PNG charts to ml/reports/")
    args = ap.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict = {"sources": {}}

    for src, root in SOURCES.items():
        print(f"\n===== {src} ({root}) =====")
        if not root.exists():
            print("  MISSING")
            report["sources"][src] = {"missing": True}
            continue
        data_yaml = root / "data.yaml"
        names = load_names(data_yaml) if data_yaml.exists() else []
        print(f"  classes ({len(names)}): {names}")
        src_rep: dict = {"classes": names, "splits": {}}
        for split in SPLITS:
            idir = root / split / "images"
            ldir = root / split / "labels"
            imgs = sorted([p for p in idir.glob("*") if p.suffix.lower() in IMG_EXTS]) if idir.exists() else []
            lbls = sorted(ldir.glob("*.txt")) if ldir.exists() else []
            img_stems = {p.stem for p in imgs}
            lbl_stems = {p.stem for p in lbls}
            la = audit_labels(lbls)
            ia = audit_images(imgs)
            split_rep = {
                "images": len(imgs),
                "labels": len(lbls),
                "images_without_label": sorted(img_stems - lbl_stems)[:10],
                "n_images_without_label": len(img_stems - lbl_stems),
                "labels_without_image": sorted(lbl_stems - img_stems)[:10],
                "n_labels_without_image": len(lbl_stems - img_stems),
                **la,
                "image_stats": ia,
            }
            src_rep["splits"][split] = split_rep
            print(
                f"  [{split}] imgs={len(imgs)} lbls={len(lbls)} "
                f"instances={la['instances']} empty={la['empty_label_files']} "
                f"format={la['format']} orphans(img/lbl)={len(img_stems - lbl_stems)}/{len(lbl_stems - img_stems)}"
            )
            if la["per_class"] and names:
                dist = {names[int(k)] if int(k) < len(names) else k: v for k, v in la["per_class"].items()}
                print(f"    per-class: {dist}")
        report["sources"][src] = src_rep

    # ElectroCom61: repo checkout has no images (notebooks only) - flag it
    elec = DATASET_DIR / "electrocom61"
    report["electrocom61_note"] = (
        "dataset/electrocom61 is the GitHub code repo only (Notebooks/Results/Structure) - "
        "no train images. Download the 2121-image YOLO set from Mendeley Data DOI "
        "10.17632/6scy6h8sjz.2 or Kaggle faiyazabdullah/electrocom61, then add "
        "ml/configs mapping before including it in preprocess."
    )
    print(f"\nNOTE: {report['electrocom61_note']} exists={elec.exists()}")

    out = REPORT_DIR / "eda_report.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"\nWrote {out}")

    if args.plots:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            for src, rep in report["sources"].items():
                if "splits" not in rep or "train" not in rep["splits"]:
                    continue
                pc = rep["splits"]["train"].get("per_class", {})
                names = rep.get("classes", [])
                labels = [names[int(k)] if names and int(k) < len(names) else k for k in pc]
                vals = [pc[k] for k in pc]
                if not vals:
                    continue
                plt.figure(figsize=(10, 4))
                plt.bar(labels, vals)
                plt.xticks(rotation=45, ha="right")
                plt.title(f"{src} train instances per class")
                plt.tight_layout()
                fp = REPORT_DIR / f"eda_{src}_train_dist.png"
                plt.savefig(fp)
                plt.close()
                print(f"Wrote {fp}")
        except ImportError:
            print("matplotlib not installed, skipping plots", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
