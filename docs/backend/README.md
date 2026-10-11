# E-Broker Backend - Technical Documentation

FastAPI service (`api/`, ~900 lines) behind the E-Broker platform: image upload,
YOLO inference, Strands-agent insights, admin review queue, training triggers,
and model promotion. Runs locally via uvicorn, in AWS Lambda via Mangum.

## Contents

| Doc | Covers |
|---|---|
| [overview.md](overview.md) | Runtime model, request lifecycle, project layout, config |
| [database.md](database.md) | All 8 tables, relationships, Alembic, seeds |
| [services.md](services.md) | Every service module: inference, model manager, storage, agent, labels, training, Modal client |
| [api-reference.md](api-reference.md) | All 14 endpoints: auth, payloads, responses, error codes |
| [auth.md](auth.md) | Admin JWT bypass, dev cookie, internal HMAC key, uploader fingerprinting |
| [testing.md](testing.md) | Unit/integration/E2E/ML-gate suites, fixtures, CI mapping |
| [operations.md](operations.md) | Local dev, Dockerfiles, SAM/Lambda, runbooks |

## 30-second orientation

```
api/main.py                 FastAPI app + Mangum handler (GET /health)
api/core/config.py          pydantic-settings (UNIFIED_CLASSES + all env)
api/core/database.py        async engine, get_db (app.state override in tests)
api/core/security.py        require_admin / require_internal_key / fingerprint
api/db/models.py            Image, Detection, Label, TrainingRun, ModelVersion,
                            Recycler, Material, AdminUser
api/routers/public.py       POST /upload, GET /detect, /images, /passport
api/routers/admin.py        queue, approve/skip, labels, model deploy + gate
api/routers/training.py     training trigger, internal metrics webhooks
api/services/*.py           model_manager, inference, storage, strands_agent,
                            label_service, training_service, modal_client
api/tests/                  30 unit + 12 integration tests, e2e_seed.py
api/alembic/                env.py (create_all) + 0001_init revision
```

Conventions: async SQLAlchemy 2.0 everywhere; Pydantic v2 settings with
`.env.local` in dev; `X-Request-ID`-style traceability left to the edge;
structured JSON logs via stdlib logging (structlog dependency reserved).
