"""E-Broker preprocessing: raw Roboflow exports -> unified YOLO26 detection set.

What it fixes (found by ml/eda.py):
  1. trcproject labels are 100% SEGMENTATION POLYGONS (class + 20-100 xy pairs),
     pc_parts is mixed bbox5 (83%) + polygon (17%). YOLO26 *detect* needs
     `class x_center y_center w h`. -> every polygon is converted to its
     tight bbox (min/max of polygon points), normalized 0-1.
  2. Three datasets have incompatible taxonomies (13 + 14 + 37 classes).
     -> remapped to 1 unified 9-class taxonomy (ml/configs/unified_classes.json).
  3. trcproject images are wild sizes (124px -> 5000px), pc_parts is 640x640.
     -> YOLO handles resize at train time; we only DROP corrupt/unreadable
     images and copy the rest untouched (no re-encoding = no quality loss).
  4. Orphan/empty handling: images with no label are skipped (with warning
     tally); empty label files are skipped; out-of-range coords are clipped.

Output (Modal-ready, YOLO26 layout):
  data_processed/ebroker_yolo26/
    train/images/*.jpg  train/labels/*.txt
    valid/images/...    valid/labels/...     (kept as `valid` + `val` alias)
    test/images/...     test/labels/...
    data.yaml            (names, nc, train/val/test paths)
    manifest.json        (provenance: source file -> new file, class map)
    checksums.sha256

Per-source splits are MERGED per split (train+train, valid+valid, test+test).
Sources are disjoint photo collections so there is no train/test leakage from
merging; stratified re-splitting is intentionally NOT done to preserve the
publishers' original splits.

Usage:
    ./venv/bin/python ml/preprocess.py
    ./venv/bin/python ml/preprocess.py --out data_processed/ebroker_yolo26 --zip
    ./venv/bin/python ml/preprocess.py --sources trcproject   # single source
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from tqdm import tqdm

REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "data_processed" / "ebroker_yolo26"
CONFIG = Path(__file__).resolve().parent / "configs" / "unified_classes.json"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


# ---------------------------------------------------------------- helpers

def load_taxonomy() -> tuple[list[str], dict[str, dict[str, str]]]:
    cfg = json.loads(CONFIG.read_text())
    unified = cfg["unified_classes"]
    maps = {src: cfg[src]["map"] for src in ("trcproject", "pc_parts", "balanced_ewaste", "pcb_components", "electrocom61_yolo") if src in cfg}
    return unified, maps


def load_source_names(root: Path) -> list[str]:
    import yaml

    cfg = yaml.safe_load((root / "data.yaml").read_text()) or {}
    names = cfg.get("names", [])
    if isinstance(names, dict):  # {0: 'cat', ...} form
        return [names[k] for k in sorted(names)]
    return [str(n) for n in names]


def polygon_to_bbox(nums: list[float]) -> tuple[float, float, float, float] | None:
    """Flat [x1,y1,x2,y2,...] (normalized) -> (xc,yc,w,h). Returns None if degenerate."""
    if len(nums) < 6 or len(nums) % 2:
        return None
    xs = nums[0::2]
    ys = nums[1::2]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0 or w > 1 or h > 1:
        return None
    return ((x0 + x1) / 2, (y0 + y1) / 2, w, h)


def parse_label_line(line: str) -> tuple[int, tuple[float, float, float, float] | None, str]:
    """-> (src_class, bbox_or_None, kind). kind in {bbox, poly2bbox, bad}."""
    parts = line.split()
    src_cls = int(float(parts[0]))
    nums = [float(v) for v in parts[1:]]
    if len(nums) == 4:
        xc, yc, w, h = nums
        if w <= 0 or h <= 0:
            return src_cls, None, "bad"
        return src_cls, (xc, yc, w, h), "bbox"
    box = polygon_to_bbox(nums)
    return src_cls, box, ("poly2bbox" if box else "bad")


def clip01(v: float) -> float:
    return min(1.0, max(0.0, v))


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- main

def process_source(
    src: str,
    root: Path,
    out: Path,
    unified: list[str],
    class_map: dict[str, str],
    manifest: list[dict],
    stats: Counter,
) -> None:
    from PIL import Image

    uidx = {c: i for i, c in enumerate(unified)}
    src_names = load_source_names(root)
    # src class name -> unified idx
    remap: dict[int, int] = {}
    for i, name in enumerate(src_names):
        uni = class_map.get(name)
        if uni is None:
            stats[f"{src}.unmapped_class:{name}"] += 1
            continue
        remap[i] = uidx[uni]

    for split in ("train", "valid", "test"):
        idir, ldir = root / split / "images", root / split / "labels"
        if not idir.exists():
            continue
        for img in tqdm(sorted(idir.iterdir()), desc=f"{src}/{split}", unit="img"):
            if img.suffix.lower() not in IMG_EXTS:
                continue
            lab = ldir / (img.stem + ".txt")
            if not lab.exists():
                stats[f"{src}.{split}.image_without_label"] += 1
                continue
            # validate image readable
            try:
                with Image.open(img) as im:
                    im.verify()
            except Exception:  # noqa: BLE001
                stats[f"{src}.{split}.corrupt_image"] += 1
                continue
            rows: list[str] = []
            if lab.read_text().strip():
                for line in lab.read_text().splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        sc, box, kind = parse_label_line(line)
                    except (ValueError, IndexError):
                        stats[f"{src}.{split}.malformed_line"] += 1
                        continue
                    if box is None:
                        stats[f"{src}.{split}.degenerate_{kind}"] += 1
                        continue
                    if sc not in remap:
                        stats[f"{src}.{split}.unmapped_src_class"] += 1
                        continue
                    xc, yc, w, h = (clip01(v) for v in box)
                    if w <= 0 or h <= 0:
                        stats[f"{src}.{split}.degenerate_clip"] += 1
                        continue
                    rows.append(f"{remap[sc]} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
                    stats[f"{src}.{split}.{kind}"] += 1
                    stats[f"unified.{unified[remap[sc]]}"] += 1
            if not rows:
                stats[f"{src}.{split}.empty_after_convert"] += 1
                continue
            # unique name keeps provenance + avoids stem collisions across sources
            new_stem = f"{src}_{split}_{img.stem}"
            ext = img.suffix.lower()
            oimg = out / split / "images" / f"{new_stem}{ext}"
            olab = out / split / "labels" / f"{new_stem}.txt"
            shutil.copy2(img, oimg)
            olab.write_text("\n".join(rows) + "\n")
            manifest.append(
                {"src": src, "split": split, "orig": str(img.relative_to(REPO)),
                 "new_image": str(oimg.relative_to(out)), "boxes": len(rows)}
            )
            stats[f"{src}.{split}.kept_images"] += 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--sources", nargs="+", default=["trcproject", "pc_parts", "balanced_ewaste", "pcb_components", "electrocom61_yolo"],
                    choices=["trcproject", "pc_parts", "balanced_ewaste", "pcb_components", "electrocom61_yolo"])
    ap.add_argument("--zip", action="store_true", help="also write <out>.zip for Modal upload")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists():
        print(f"Clearing existing {out}")
        shutil.rmtree(out)
    for split in ("train", "valid", "test"):
        (out / split / "images").mkdir(parents=True, exist_ok=True)
        (out / split / "labels").mkdir(parents=True, exist_ok=True)

    unified, maps = load_taxonomy()
    manifest: list[dict] = []
    stats: Counter = Counter()
    for src in args.sources:
        root = REPO / "dataset" / src
        if not root.exists():
            print(f"SKIP {src}: {root} missing")
            continue
        process_source(src, root, out, unified, maps[src], manifest, stats)

    # data.yaml (paths absolute -> Modal job rewrites root; keep relative-safe form)
    (out / "data.yaml").write_text(
        "names:\n"
        + "".join(f"  - {c}\n" for c in unified)
        + f"nc: {len(unified)}\n"
        + f"train: {out / 'train' / 'images'}\n"
        + f"val: {out / 'valid' / 'images'}\n"
        + f"test: {out / 'test' / 'images'}\n"
    )
    # val alias: some tooling expects `val/` instead of `valid/`
    val_alias = out / "val"
    if not val_alias.exists():
        try:
            val_alias.symlink_to("valid", target_is_directory=True)
        except OSError:
            pass  # Windows without privilege - harmless, train script handles both
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (out / "stats.json").write_text(json.dumps(dict(sorted(stats.items())), indent=1))

    # checksums
    with open(out / "checksums.sha256", "w") as f:
        for p in sorted((out).rglob("*")):
            if p.is_file() and p.name != "checksums.sha256":
                f.write(f"{sha256(p)}  {p.relative_to(out)}\n")

    print("\n==== STATS ====")
    for k in sorted(stats):
        print(f"  {k}: {stats[k]}")
    n_img = sum(1 for _ in (out).rglob("images/*"))
    print(f"\nUnified set: {n_img} images, {len(manifest)} manifest rows")
    print(f"Output: {out}")

    if args.zip:
        zp = shutil.make_archive(str(out), "zip", root_dir=out.parent, base_dir=out.name)
        print(f"Zip for Modal upload: {zp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
