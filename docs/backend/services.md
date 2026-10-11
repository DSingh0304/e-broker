# Services

## `model_manager.py` — thread-safe YOLO holder
`ModelManager(model_path="models/best.pt")` wraps `ultralytics.YOLO` in a
`_ModelRef` (model + source path) behind an `RLock`.
- `predict(image, conf=0.20, max_det=50)` → `[{class_name, confidence,
  bbox:{x1,y1,x2,y2}}]` with normalized 0–1 coords; unknown indices fall back
  to `peripheral_other`.
- `reload(new_path)` loads **outside** the lock, swaps atomically inside —
  in-flight requests finish on the old weights, new requests get the new ones.
  This is the canary/hot-swap primitive (see deploy endpoint).
- Import seam: `from ultralytics import YOLO` at module top, patched in tests
  as `api.services.model_manager.YOLO`.

## `inference.py` — prediction façade
`InferenceService` owns a `ModelManager` (lazy singleton per router via
`get_inference()`). `predict()` delegates to the manager; `_parse_results()`
accepts both raw tensors and `.tolist()` mocks, filters by confidence, and
truncates to `INFERENCE_MAX_DETECTIONS`. `UNIFIED_CLASSES` is re-exported here
so routers, tests, and the frontend share one ordering.

## `storage.py` — S3 + upload safety
- `s3_client()` — boto3 with 2s connect / 5s read timeouts, single retry.
  Floci-compatible via `AWS_ENDPOINT_URL`.
- `validate_image_bytes()` — magic bytes only (`FF D8 FF` JPEG, `89 50 4E 47`
  PNG). Rejects disguised executables regardless of Content-Type.
- `strip_exif_and_resize()` — rebuilds pixels (drops GPS/device EXIF),
  enforces 224–8000px and ≤20:1 aspect ratio, downscales to 1280px, returns
  JPEG bytes + dimensions.
- `put_object()` — creates the bucket if missing; on connection failure
  returns an `s3://` placeholder instead of raising (tests/dev without Floci).
- `get_object()` — downloads bytes; raises `FileNotFoundError` → HTTP 422.

## `strands_agent.py` — agent tools (contract-implemented, LLM-unwired)
Pure functions with stable return shapes; the Bedrock Nova agent will register
these same functions as tools. `run_agent(detections, uploader_id)`
orchestrates per distinct class and is the mock seam in API tests.
- `get_scrap_price(class, region="delhi")` → `{minINR, maxINR, unit}`.
  Static INR/kg bands scaled by `_fetch_spot_price` (raises
  `NotImplementedError` until a feed is configured → static bands used).
  Unknown class → zeros.
- `assess_toxicity(class)` → `{level: safe|caution|hazardous, notes}`.
  Battery = hazardous; PCB/motherboard/RAM/chip/smartphone = caution; cable
  and peripheral = safe. All 9 classes covered (unit-tested).
- `generate_epr_passport(detections, uploader_id)` → `{passport_id
  ("EPR-XXXXXXXX-NN"), compliance_status: "VERIFIED"}`. PDF rendering lives in
  the `/passport` endpoint, not here.
- `find_recyclers(lat, lng, radius_km=50)` → sorted `[{name, distance_km,
  contact}]` via Haversine over static CPCB-sample data (DB query in prod).

## `label_service.py` — review domain logic
- `LabelSource`: `model | admin | import`.
- `compute_review_status`: model labels approved → `"approved"`;
  admin-redrawn → `"corrected"`.
- `validate_bbox`: all of xc/yc/w/h in [0,1], w/h > 0 (area rule ≥0.001
  enforced at the router via `w*h` — see api-reference).
- `validate_class`: membership in `UNIFIED_CLASSES`.

## `training_service.py`
`should_trigger_training(new_labels, threshold=200, active_run=False)` —
pure predicate; returns False while any run is `queued`/`running`.

## `modal_client.py`
Lazy `spawn()` wrapper around `ml.modal_train.train` (import deferred to call
time so the API never imports Modal at startup). Exposed as
`api.routers.training.modal_train` — the exact patch point used by
`test_trigger_spawns_modal_job`.
