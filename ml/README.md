# E-Broker ML: dataset -> Modal training

## Datasets: quality x quantity verdict

| Dataset | Images | Classes | Format | Verdict |
|---|---|---|---|---|
| `dataset/pc_parts` (diggi/pc_parts v4, Roboflow) | **2,943** (2061/443/439) | 14 PC parts | 640x640, 83% YOLO bbox + 17% polygon | **Best local base.** Keep. Has the only `motherboard` + `ram` labels. |
| `dataset/trcproject` (TRCProject e-waste v5, Roboflow) | **1,690** (1184/337/169) | 13 e-waste | mixed resolutions 124px-5000px, **100% segmentation polygons** | **Keep after conversion.** Only source with `PCB`, `Smart Phone`, `cable`, batteries. Polygons -> bbox in `preprocess.py`. |
| `dataset/electrocom61` (GitHub checkout) | 0 images here | 61 | notebooks only | **Not usable as-is.** Images live on Mendeley DOI `10.17632/6scy6h8sjz.2` / Kaggle `faiyazabdullah/electrocom61` (2,121 imgs, 640x640, peer-reviewed in *Data in Brief* 2025). Highest academic quality; add later via KaggleHub + a mapping for its 61 classes. |
| Recommended add: **Balanced E-Waste Dataset** (`electronic-waste-detection/balanced-e-waste-dataset` v3, Roboflow, CC-BY-4.0) | **7,216** (~200/class, 4994/1445/777) | ~30+ e-waste | 640x640, YOLO26-ready | **Highest ROI add.** 2.5x your current volume, class-balanced (fixes your `peripheral_other` skew). Download with `download.sh` pattern: workspace `electronic-waste-detection`, project `balanced-e-waste-dataset`, version `3`. |
| Not recommended: PCB-defect sets (DeepPCB etc.) | large | 6 defect types | factory close-ups | Wrong domain (manufacturing defects, not scrap in the wild). Skip. |

**Current merged total: 15,991 images / ~80k instances -> 9 unified classes**
(trcproject 1,682 + pc_parts 2,930 + balanced_ewaste 7,211 + pcb_components 2,047
+ electrocom61_yolo 2,121). Ready to fine-tune `yolo26m` on Modal. Note: `chip`
holds ~57k dense tiny boxes (macro-PCB domain) - monitor whole-object recall
separately; use `--sources trcproject pc_parts balanced_ewaste electrocom61_yolo`
for a whole-object-only variant.

## Pipeline

```
./venv/bin/python ml/eda.py [--plots]        # audit raw sets -> ml/reports/eda_report.json
./venv/bin/python ml/preprocess.py [--zip]   # unify -> data_processed/ebroker_yolo26 [+ .zip]
./venv/bin/python ml/validate.py             # gate: must print PASS
```

`preprocess.py` does: polygon->bbox conversion, 27->9 class remap
(`ml/configs/unified_classes.json`), corrupt/orphan/empty filtering, provenance
manifest + sha256 checksums. Splits are merged per-split (no re-split, no leakage).

## Train on Modal

```
pip install modal && modal setup
modal volume create ebroker-data
modal volume put ebroker-data data_processed/ebroker_yolo26.zip /
modal run ml/modal_train.py --smoke          # cheap sanity (~30 min)
modal run ml/modal_train.py --model yolo26m.pt --epochs 50
modal volume get ebroker-data runs/ebroker_e50_final/weights/best.pt models/best_yolo26.pt
```

## Unified taxonomy (9 classes)

`battery | hard_drive | pcb | motherboard | ram | copper_cable | smartphone_device | chip | peripheral_other`
Full source mapping: `ml/configs/unified_classes.json`.
