# Testing

Backends tests live in `api/tests/` (`pytest.ini`: `asyncio_mode=auto`,
session-scoped event loop — required, see gotcha #1). Run: `pytest api/tests/`
(42 tests: 30 unit + 12 integration). E2E seed: `api/tests/e2e_seed.py`
(**destructive** wipe + one pending image; dev DBs only).

## Unit (`api/tests/unit/`, no I/O)
| File | What it pins |
|---|---|
| `test_model_manager.py` | normalised detections, atomic reload under 10 racing readers, model swap |
| `test_inference_service.py` | taxonomy indices (0/2/4/8), conf filtering, bbox normalisation, multi-box |
| `test_label_service.py` | approve/correct transitions, bbox edge cases (zero-area, OOB, negative, extra keys), class membership |
| `test_strands_tools.py` | toxicity levels per class, price-range shape, unknown-class zeros, all-9 coverage |
| `test_training_trigger.py` | threshold boundaries (199/200), active-run blocking |

## Integration (`api/tests/integration/`, testcontainers PG)
Real Postgres (session container), mocked S3/Modal/agent:
- `test_upload_detect_flow.py` — upload creates pending row; detect persists
  one `pcb` row and returns `className` cards (needs the `className` mapping,
  not the service's `class_name`).
- `test_label_approval_flow.py` — approve/correct/skip transitions; 422 on
  bad class and out-of-bounds bbox.
- `test_training_trigger_api.py` — trigger-check count, Modal `spawn` called
  once with `object_id` plumbed to `modalRunId`, 409 on duplicate, metrics
  flip run to `running`.
- `test_model_deploy_flow.py` — reload called once, `deployed_at` +
  `approved_by` stamped; regression candidate (map50 0.80 vs deployed 0.90)
  blocked with 422 containing "regression".

`conftest.py` provides `postgres → db_engine → db_session → client` (with
`get_db` override + `ADMIN_*`/`INTERNAL_API_KEY` env pinned **before** settings
import) plus six seed fixtures (pending image, approved labels, active/queued
runs, good/bad model candidates).

## ML regression gate (`ml/tests/test_model_regression.py`)
Post-training only: `CANDIDATE_MODEL_PATH=… pytest ml/tests/`. Compares
candidate vs `models/best.pt` via `YOLO.val`: blocks on overall or any
per-class mAP50 drop > 0.05. Slow on CPU (two full validations) — CI-gated,
never in the dev loop.

## E2E (Playwright, `e2e/`, 26 tests)
Chromium + Pixel 7, serial workers, reseed-per-project. Fixture photo is a
real battery image (exactly 1 detection — strict-mode-safe). Known
spec-hygiene rules this suite taught us: seed helper for state-consuming
specs, model warmup before canvas specs, fake-device flags for camera probes.

## Gotchas (earned, keep)
1. **Session event loop is mandatory.** Session-scoped engine + function loops
   = asyncpg cross-loop protocol desync. `pytest.ini` pins both scopes to
   `session`.
2. **`MagicMock(..., cls=…)` is a TypeError** (`cls` collides with
   `Mock.__new__`). Build box mocks via attribute assignment.
3. **`.env.local` beats code defaults** (dotenv < real env < code). Tests pin
   real env vars in `conftest.py`, never rely on defaults.
4. **Service return keys use `class_name`; API responses use `className`.**
   The router translates — tests assert the translated shape.
5. **S3 is optional at runtime.** `put_object` degrades to placeholder URLs;
   `get_object` raises 422. Tests run with no Floci; the live path needs it.
