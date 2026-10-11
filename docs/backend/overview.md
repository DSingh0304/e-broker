# Backend Overview

## Runtime model
Single FastAPI app (`api/main.py`) with three router groups. Locally it runs
under uvicorn (`:8000`); in AWS each logical group maps to one Lambda
(public / admin / internal) via the Mangum handler (`handler = Mangum(app)`),
built from `api/Dockerfile.{api,admin,internal}` (arm64, `CMD ["api.main.handler"]`).

Cloudflare Workers (prod) or the Next.js rewrite (dev) mount the API under
`/api/*` and strip the prefix - **backend routes have no `/api` prefix**.

## Request lifecycle: upload → detect
1. `POST /upload` (multipart JPEG/PNG ≤10MB) → magic-bytes check
   (`FF D8 FF` / `89 50 4E 47`), EXIF strip + resize to 1280px (`storage.py`),
   S3 put with bucket auto-create, `images` row (`review_status=pending`),
   `{imageId, s3Url}`.
2. `GET /detect/{id}` → download bytes from S3 (`get_object`), YOLO predict
   via `InferenceService` (default conf 0.20, cap 50), `run_agent` pricing /
   toxicity / EPR / recyclers, detections persisted (append-only), assembled
   cards + totals returned.
3. `GET /images/{id}` serves the stripped bytes (result canvas, thumbnails).
4. `GET /passport/{id}` renders the EPR PDF on demand (ReportLab).

Uploads are anonymous: `uploader_id = SHA-256(filename + 0.0.0.0 + hour)` -
see [auth.md](auth.md). No login, no PII.

## Project layout
```
api/
  main.py              app factory, CORS, router mounting, /health
  core/
    config.py          Settings + UNIFIED_CLASSES (9-class canonical order)
    database.py        async engine; get_db prefers app.state.session_factory
    security.py        auth dependencies (see auth.md)
  db/models.py         8 ORM models (see database.md)
  routers/
    public.py          upload / detect / images / passport
    admin.py           queue / approve / skip / labels / deploy
    training.py        trigger (admin) + trigger-check / metrics (internal)
  services/
    model_manager.py   thread-safe YOLO holder, atomic reload
    inference.py       predict → normalised detection dicts
    storage.py         S3 client, validation, EXIF strip, get/put
    strands_agent.py   pricing / toxicity / passport / recyclers / run_agent
    label_service.py   review state machine + bbox/class validation
    training_service.py trigger threshold predicate
    modal_client.py    lazy Modal spawn wrapper (test seam)
  scripts/seed_recyclers.py   CSV → recyclers table
  tests/               unit/ (5 files, 30 tests) + integration/ (4 files, 12)
  alembic/             env.py + 0001_init
```

## Configuration (`api/core/config.py`)
All settings come from environment / `.env.local` (never committed).
Key knobs:

| Setting | Default (dev/test) | Prod |
|---|---|---|
| `DATABASE_URL` | local asyncpg URL | RDS via Proxy (IAM auth) |
| `AWS_ENDPOINT_URL` | `http://localhost:4566` (Floci) | unset (real AWS) |
| `ADMIN_JWT_BYPASS` / `ADMIN_JWT_BYPASS_TOKEN` | `true` / `admin-test-token` | `false` + Cognito JWT |
| `INTERNAL_API_KEY` | `test-internal-key` | SSM SecureString, rotated monthly |
| `MOCK_INFERENCE` | `true` | `false` (Modal A10G via SQS) |
| `ACTIVE_MODEL_PATH` | `models/best.pt` | S3 Object-Locked weights |
| `INFERENCE_CONF_THRESHOLD` / `INFERENCE_MAX_DETECTIONS` | `0.20` / `50` | SSM-tunable, no redeploy |
| `TRAINING_TRIGGER_THRESHOLD` | `200` | same |

`UNIFIED_CLASSES` order is canonical and load-bearing (YOLO class indices):
`battery, hard_drive, pcb, motherboard, ram, copper_cable,
smartphone_device, chip, peripheral_other`. It is duplicated in
`lib/constants.ts`, `ml/configs/unified_classes.json`, and the test suites -
change all four together.
