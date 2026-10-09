"""Validate a processed YOLO26 detection dataset (post-preprocess gate).

Checks:
  - data.yaml parses, nc == len(names), train/val/test dirs exist, non-empty
  - every label line is `cls xc yc w h` (exactly 5 floats), cls in range,
    coords in [0,1], w/h > 0, min box size sane
  - every label has a matching image and vice versa (reports orphans)
  - no polygon lines leaked through

Usage:
    ./venv/bin/python ml/validate.py [data_processed/ebroker_yolo26]
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "data_processed/ebroker_yolo26")
    if not root.is_absolute():
        root = Path.cwd() / root
    errors: list[str] = []
    stats: Counter = Counter()

    import yaml  # local venv has pyyaml

    cfg = yaml.safe_load((root / "data.yaml").read_text())
    nc, names = cfg.get("nc"), cfg.get("names", [])
    if nc != len(names):
        errors.append(f"data.yaml nc={nc} != len(names)={len(names)}")
    print(f"classes ({nc}): {names}")

    ok = True
    for split in ("train", "valid", "test"):
        idir, ldir = root / split / "images", root / split / "labels"
        if not idir.exists() or not ldir.exists():
            errors.append(f"{split}: missing images/ or labels/ dir")
            ok = False
            continue
        imgs = {p.stem: p for p in idir.iterdir() if p.suffix.lower() in IMG_EXTS}
        lbls = {p.stem: p for p in ldir.glob("*.txt")}
        stats[f"{split}.images"] = len(imgs)
        stats[f"{split}.labels"] = len(lbls)
        for stem in sorted(set(imgs) - set(lbls)):
            errors.append(f"{split}: image without label: {imgs[stem].name}")
        for stem in sorted(set(lbls) - set(imgs)):
            errors.append(f"{split}: label without image: {lbls[stem].name}")
        tiny = 0
        for stem, lp in sorted(lbls.items()):
            for i, line in enumerate(lp.read_text().splitlines(), 1):
                parts = line.split()
                if len(parts) != 5:
                    errors.append(f"{split}/{lp.name}:{i} not 5 fields ({len(parts)})")
                    ok = False
                    continue
                try:
                    c, xc, yc, w, h = int(float(parts[0])), *(float(v) for v in parts[1:])
                except ValueError:
                    errors.append(f"{split}/{lp.name}:{i} non-numeric")
                    ok = False
                    continue
                if not (0 <= c < nc):
                    errors.append(f"{split}/{lp.name}:{i} class {c} out of range")
                    ok = False
                if any(v < 0 or v > 1 for v in (xc, yc, w, h)) or w <= 0 or h <= 0:
                    errors.append(f"{split}/{lp.name}:{i} bad coords {line[:60]}")
                    ok = False
                if w < 0.005 or h < 0.005:
                    tiny += 1
                stats[f"class.{names[c] if 0 <= c < nc else c}"] += 1
        stats[f"{split}.tiny_boxes_lt0.5pct"] = tiny
        print(f"[{split}] images={len(imgs)} labels={len(lbls)} tiny_boxes={tiny}")

    print("\nper-class instances:", {k: v for k, v in sorted(stats.items()) if k.startswith("class.")})
    if errors:
        print(f"\n{len(errors)} PROBLEM(S) (showing 30):")
        for e in errors[:30]:
            print("  -", e)
    print("\nRESULT:", "FAIL" if (errors or not ok) else "PASS")
    return 1 if (errors or not ok) else 0


if __name__ == "__main__":
    raise SystemExit(main())
