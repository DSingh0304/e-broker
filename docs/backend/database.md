# Database

PostgreSQL 16, async SQLAlchemy 2.0 ORM (`api/db/models.py`). Local schema is
created by `infra/sql/init.sql` on container start; versioned changes go
through Alembic (`api/alembic/`). UUIDs are `String(36)` (portable, no
`pgcrypto` dependency in app code); timestamps are timezone-aware UTC.

## Tables

### `images` - one row per upload
| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | uuid4 |
| `s3_key` / `s3_url` | Text | `raw/{uuid}.jpg`; URL or `s3://` placeholder when S3 unreachable |
| `uploaded_at` | TIMESTAMPTZ | default now |
| `uploader_id` | String(64) | SHA-256 fingerprint, zero PII |
| `width` / `height` | Int | post-EXIF-strip dimensions |
| `review_status` | String(16) | `pending` → `approved` \| `corrected` \| `skipped` (one-way) |

### `detections` - append-only model outputs
`id`, `image_id` FK CASCADE indexed, `class_name`, `confidence` float,
`bbox` JSONB `{x1,y1,x2,y2}` normalized 0–1, `model_version` (default
`best.pt`), `detected_at`. **Never updated or deleted** - corrections create
`labels`, preserving the audit trail.

### `labels` - human (or imported) ground truth
`id`, `image_id` FK CASCADE indexed, `class_name`, `bbox` JSONB
`{xc,yc,w,h}` YOLO format, `source` (`model`\|`admin`\|`import`),
`created_by`, `created_at`, `is_active` bool. Corrections soft-delete
predecessors (`is_active=false`) instead of deleting. Only `approved` +
`corrected` images with active labels feed training exports.

### `training_runs`
`id`, `modal_run_id`, `triggered_by`, `triggered_at`, `status`
(`queued`\|`running`\|`done`\|`failed`), `epochs`, `dataset_images`,
`metrics` JSONB (`epoch_N → {loss, mAP50, …}`), `completed_at`.

### `model_versions`
`id`, `run_id` FK nullable, `s3_key`, `map50`, `map50_95`, `per_class` JSONB,
`created_at`, `deployed_at`, `retired_at`, `approved_by`,
`canary_traffic_pct` (default 0). Promotion sets `deployed_at`; canary
bumps the pct; retirement stamps `retired_at`. Prod adds S3 Object Lock
(COMPLIANCE) on the weights file.

### `recyclers`
`id`, `name`, `address`, `city`, `state`, `lat`/`lng` floats, `phone`,
`cpcb_reg_no`, `accepts` JSONB array of class names. Seeded from
`data/recyclers_cpcb.csv` via `api/scripts/seed_recyclers.py`
(`make seed-recyclers`). Geo lookup is Haversine in Python today; move to
PostGIS `<->` when the table outgrows hundreds of rows.

### `materials`
`id` serial PK, `name` unique, `price_per_kg`. Baseline for the pricing tool;
live spot prices scale these bands (`strands_agent._fetch_spot_price`).

### `admin_users`
`id`, `cognito_sub` unique, `role` (`annotator`\|`manager`\|`admin`). Populated
from Cognito in prod; unused in bypass mode.

## Migrations
`api/alembic/env.py` builds an async engine from `api/alembic.ini` and runs
`Base.metadata.create_all` (pragmatic for hackathon velocity).
`api/alembic/versions/0001_init.py` pins the initial revision. `make migrate`
runs `alembic upgrade head`. Future schema changes: add a real revision with
`upgrade()`/`downgrade()` DDL instead of widening `create_all`.

## Seeds
- `api/scripts/seed_recyclers.py --csv data/recyclers_cpcb.csv [--db URL]`
- `api/tests/e2e_seed.py [DB_URL]` - wipes `images` and seeds one pending
  image + detection + label. **Destructive by design** (E2E isolation);
  never point it at a real database.
