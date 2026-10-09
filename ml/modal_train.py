"""E-Broker YOLO26 fine-tune on Modal (modal.com).

Dataset in:  Modal Volume `ebroker-data`  (uploaded once from local zip)
Model out:   same Volume under `runs/` + local download of best.pt

Setup (once):
    pip install modal ultralytics
    modal setup                          # login
    modal volume create ebroker-data
    ./venv/bin/python ml/preprocess.py --zip
    modal volume put ebroker-data data_processed/ebroker_yolo26.zip /

Train:
    modal run ml/modal_train.py --model yolo26m.pt --epochs 50 --img 640 --batch -1
    modal run ml/modal_train.py --model yolo26s.pt --epochs 50 --smoke  # 30-min sanity

The function pulls the Volume at /data, rewrites data.yaml roots to the
mounted path, trains with Ultralytics, writes runs/ back to the Volume.
A `val/`-vs-`valid/` alias is handled automatically (see preprocess.py).
"""
from __future__ import annotations

from pathlib import Path

import modal

app = modal.App("ebroker-yolo26")

VOLUME = modal.Volume.from_name("ebroker-data", create_if_missing=True)
# Volume-side dataset path. Renamed locally to ebroker_yolo26; the volume dir
# keeps its old name until the dataset is next re-uploaded (do not rename
# mid-training — live runs read from here).
DATA_DIR = "/data/ebroker_yolov8"

image = (
    modal.Image.from_registry("pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime")
    .apt_install("libgl1", "libglib2.0-0")  # system libs for opencv-python (ultralytics dep)
    .pip_install("ultralytics>=8.4", "pyyaml", "opencv-python-headless")
    .env({"ULTRALYTICS_SETTINGS_DIR": "/tmp", "YOLO_VERBOSE": "True"})
)


def _fix_yaml() -> str:
    """Point data.yaml at the mounted Volume paths. Returns abs yaml path."""
    import shutil
    from pathlib import Path

    import yaml

    src = Path(DATA_DIR) / "data.yaml"
    cfg = yaml.safe_load(src.read_text())
    root = Path(DATA_DIR)
    # preprocess writes `valid/`; accept `val/` too
    val = root / "valid" / "images"
    if not val.exists() and (root / "val" / "images").exists():
        val = root / "val" / "images"
    cfg["train"] = str(root / "train" / "images")
    cfg["val"] = str(val)
    cfg["test"] = str(root / "test" / "images")
    fixed = Path("/tmp/ebroker_data.yaml")
    fixed.write_text(yaml.safe_dump(cfg))
    # ultralytics resolves a `val` symlink fine; ensure one exists for safety
    alias = root / "val"
    if not alias.exists():
        try:
            alias.symlink_to("valid", target_is_directory=True)
        except OSError:
            shutil.copytree(root / "valid", alias, dirs_exist_ok=True)
    return str(fixed)


@app.function(image=image, gpu="H100", timeout=12 * 3600, volumes={ "/data": VOLUME })
def train(
    model: str = "yolo26m.pt",
    epochs: int = 80,
    img: int = 640,
    batch: int = -1,          # -1 = ultralytics auto-batch (~80% VRAM)
    project: str = "/data/runs",
    name: str = "ebroker_yolo26",
    smoke: bool = False,      # smoke=True: 3 epochs, 10% data, CPU-checkable
):
    from ultralytics import YOLO

    yaml_path = _fix_yaml()
    print("data.yaml ->", Path(yaml_path).read_text())
    m = YOLO(model)
    # H100 = 80GB: yolo26m @640 auto-batch fills VRAM; -1 = auto (~80%).
    # workers=4 (not 8): dataset scan + loading runs off a network Volume;
    # fewer workers avoids CPU contention that starved the worker heartbeat.
    frac = 0.1 if smoke else 1.0
    m.train(
        data=yaml_path,
        epochs=3 if smoke else epochs,
        imgsz=img,
        batch=batch,
        fraction=frac,
        workers=4,
        verbose=True,
        patience=20,
        optimizer="AdamW",
        lr0=0.001,
        cos_lr=True,
        hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
        degrees=15, translate=0.1, scale=0.5, flipud=0.0, fliplr=0.5,
        mosaic=1.0, mixup=0.1, copy_paste=0.1,
        project=project, name=name, exist_ok=True, plots=True,
    )
    VOLUME.commit()
    print(f"done. weights at /data/runs/{name}/weights/best.pt (in Volume ebroker-data)")


@app.function(image=image, gpu="H100", timeout=3600, volumes={"/data": VOLUME})
def val(weights: str = "/data/runs/ebroker_yolo26/weights/best.pt"):
    from ultralytics import YOLO

    print(YOLO(weights).val(data=_fix_yaml()))


@app.local_entrypoint()
def main(model: str = "yolo26m.pt", epochs: int = 80, img: int = 640,
         batch: int = -1, smoke: bool = False, name: str = "ebroker_yolo26"):
    # spawn() (not remote()): returns a FunctionCall immediately so the local
    # client can exit. Combined with `modal run --detach`, the server-side run
    # survives the terminal/laptop going away. remote() would block for hours.
    call = train.spawn(model=model, epochs=epochs, img=img, batch=batch, smoke=smoke, name=name)
    print(f"spawned {call.object_id} -> runs/{name}/ on volume ebroker-data")
