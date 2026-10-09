"""One-time seed: unzip the uploaded dataset archive inside the Modal Volume.

Run after `modal volume put ebroker-data data_processed/ebroker_yolo26.zip ...`:
    modal run ml/modal_unzip.py
Expects /data/ebroker_yolov8/ with train/valid/test afterwards.
"""
import modal

app = modal.App("ebroker-yolo26-seed")
VOLUME = modal.Volume.from_name("ebroker-data", create_if_missing=True)
image = modal.Image.debian_slim().pip_install("pyyaml")


@app.function(image=image, volumes={"/data": VOLUME}, timeout=3600)
def seed():
    import zipfile
    from pathlib import Path

    zips = sorted(Path("/data").glob("*.zip"))
    assert zips, "no zip found in volume root"
    for z in zips:
        print(f"extracting {z} ({z.stat().st_size / 1e9:.2f} GB)...")
        with zipfile.ZipFile(z) as zf:
            zf.extractall("/data")
        z.unlink()
    VOLUME.commit()
    root = Path("/data/ebroker_yolov8")  # volume path; see modal_train.DATA_DIR
    for split in ("train", "valid", "test"):
        imgs = list((root / split / "images").glob("*"))
        lbls = list((root / split / "labels").glob("*.txt"))
        print(f"{split}: {len(imgs)} images, {len(lbls)} labels")
    print("seed done")


@app.local_entrypoint()
def main():
    seed.remote()
