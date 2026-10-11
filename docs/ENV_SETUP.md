# E-Broker - Environment & Secrets Setup

Single source of truth for every environment variable, secret, and where it
lives. The stack runs from **three places** - understand the split before
touching anything:

| # | Place | Used by | Committed? |
|---|---|---|---|
| 1 | `docker-compose.yaml` → per-service `environment:` | Containers (`postgres`, `minio`, `api`, `web`) | **Yes** - dev defaults only |
| 2 | `.env.local` (copy of `.env.local.example`) | Host-side runs: `./venv` backend, `pytest`, `npm run dev`, smoke script | **No** (git-ignored) |
| 3 | `Dockerfile.web` build `ARG`s (fed from compose `args:`) | Baked into the web image at build time (`NEXT_PUBLIC_*` only) | **Yes** - dev defaults only |

Rules:

- `NEXT_PUBLIC_*` values are **inlined at build time**. Changing one
  requires `sudo docker compose up -d --build web`. Everything else is read
  at container start → `sudo docker compose up -d <service>` suffices.
- The backend never reads `.env.local` inside Docker; it uses the compose
  `environment:` block. `.env.local` matters only for host-side tooling.
- `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` apply **only
  on first volume init**. Changing them later without wiping the volume
  locks you out - rotate via the procedure below, not by editing env.
- `ADMIN_JWT_BYPASS_TOKEN` / `NEXT_PUBLIC_ADMIN_TOKEN` / `INTERNAL_API_KEY`
  in this repo are **local-dev placeholders**. They must be replaced before
  any non-laptop deployment.

## Quick start (fresh machine)

```bash
# 1. Prereqs: docker + compose plugin, node 20, python 3.12 venv, ollama
ollama pull gemma4:31b-cloud
./venv/bin/python -m pip install -r api/requirements.txt
npm ci

# 2. Host-side env (optional but recommended for pytest/smoke/seed)
cp .env.local.example .env.local

# 3. Ollama relay (Ollama binds 127.0.0.1; containers need :11435)
nohup ./venv/bin/python scripts/ollama_forwarder.py > logs/ollama-forwarder.log 2>&1 &

# 4. Boot the stack
sudo docker compose up -d --build

# 5. Seed production-scale demo data (60 users, 60 photos, 55+ rows/table)
./venv/bin/python -m api.scripts.seed_production

# 6. Verify
bash scripts/test_e2e_smoke.sh
```

Open `http://localhost:3000`. Logins are in the smoke output section of the
main README workflow; seeded accounts use per-role passwords
(`admin123` / `kabadi123` / `vendor123` / `recycler123`).

## Variable reference

### Database

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `postgres` container | `ebroker` / `ebroker` / `ebroker_dev_password` | First-init only (see rotation) |
| `DATABASE_URL` | `api` (async engine, Alembic-online `create_all`, seed) | `postgresql+asyncpg://ebroker:…@postgres:5432/ebroker` (compose) / `@localhost` (host) | Host vs container differ by hostname only |
| `DATABASE_URL_SYNC` | `api` background training worker (sync engine) | same, `postgresql://` scheme | Requires `psycopg2-binary` (in requirements) |

### S3-compatible storage (Elestio MinIO - not AWS)

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `minio` container | `minioadmin` / `minioadmin123` | First-init only; console at `:9001` |
| `AWS_ENDPOINT_URL` | `api` (boto3 S3 client) | `http://minio:9000` (compose) / `http://localhost:9000` (host) | boto3 speaks S3 API to MinIO |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `api` | mirror of MinIO root pair | Must match the pair MinIO was init with |
| `AWS_DEFAULT_REGION` | `api` | `ap-south-1` | Bucket-create fallback only |
| `S3_BUCKET` / `S3_MODEL_BUCKET` | `api` | `ebroker-images` / `ebroker-models` | Auto-created on first upload |

### Auth

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `ADMIN_JWT_BYPASS` | `api` (`require_admin`) | `true` | Static-token mode for local dev |
| `ADMIN_JWT_BYPASS_TOKEN` | `api` | `dev-admin-token` | **Must equal `NEXT_PUBLIC_ADMIN_TOKEN`** |
| `NEXT_PUBLIC_ADMIN_TOKEN` | `web` (build arg + runtime) | `dev-admin-token` | Inlined at build → rebuild web after change |
| `ADMIN_BYPASS_EMAIL` | `api` (identity label) | `admin@test.com` | Cosmetic |
| `NEXTAUTH_SECRET` | `web` (session JWT signing) | `ebroker-local-dev-secret-change-in-prod` | Generate per deployment (below) |
| `NEXTAUTH_URL` | `web` | `http://localhost:3000` | Must match the public URL |
| `ALLOW_DEV_ADMIN` | reserved (docs reference only) | `true` | No code reads it today |

### Internal service-to-service

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `INTERNAL_API_KEY` | `api` (`/internal/*` guard); `web` proxies inject it server-side | `test-internal-key` | Browser never sees it (`app/api/internal/*/route.ts`) |
| `INTERNAL_API_URL` | `web` (proxy target, NextAuth authorize) | `http://api:8000` (compose) / `http://localhost:8000` (host) | |

### Agent (Ollama)

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `AGENT_PROVIDER` | `api` | `ollama` | `bedrock` branch kept, needs AWS creds |
| `OLLAMA_HOST` | `api` | `http://host.docker.internal:11435` (compose) / `http://localhost:11434` (host) | `:11435` = forwarder; direct `:11434` refuses containers (Ollama binds loopback) |
| `OLLAMA_MODEL` | `api` | `gemma4:31b-cloud` | `ollama pull` it on the host first |
| `AGENT_MOCK` | `api` | `false` | `true` replays offline SSE (degraded mode) |
| `AGENT_TIMEOUT_S` | `api` | `300` | Cloud answers in ~10s; CPU-local needs the headroom |

### Pricing

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `METALS_API_KEY` | nothing (empty) | empty | metals.dev free tier exhausted; static table in `api/core/metal_prices.py` |
| `METALS_API_URL` / `_CURRENCY` / `_UNIT` | reserved | defaults | Kept for a future live feed |
| `EXCHANGE_RATE_API_KEY` | `api` (FX tool) | empty | Empty → built-in static table |

### ML / training

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `MOCK_INFERENCE` | `api` | `false` | Live YOLO on `ACTIVE_MODEL_PATH` |
| `ACTIVE_MODEL_PATH` | `api` | `/models/best_yolo26.pt` (compose) / `models/best_yolo26.pt` (host) | Mounted into the container |
| `INFERENCE_CONF_THRESHOLD` / `_MAX_DETECTIONS` | `api` | `0.20` / `50` | Quality bar + flood cap |
| `TRAINING_TRIGGER_THRESHOLD` | `api` | `200` | Labels required before a retrain trigger |

### Misc

| Variable | Used by | Dev value | Notes |
|---|---|---|---|
| `CORS_ORIGINS` | `api` | `http://localhost:3000` | Browser → API direct calls (mostly proxied) |
| `LOG_LEVEL` | `api` | `DEBUG` | Use `INFO` outside dev |

## Generating real secrets (anything beyond this laptop)

```bash
# NextAuth session signing key (32+ random bytes, base64)
openssl rand -base64 32

# Admin bypass token and internal key (unguessable, no meaning)
openssl rand -hex 24   # ADMIN_JWT_BYPASS_TOKEN / NEXT_PUBLIC_ADMIN_TOKEN (same value)
openssl rand -hex 24   # INTERNAL_API_KEY

# Postgres + MinIO (set BEFORE first volume init)
openssl rand -hex 16   # POSTGRES_PASSWORD
openssl rand -hex 12   # MINIO_ROOT_PASSWORD (min 8 chars)
```

Apply to `docker-compose.yaml`, then `sudo docker compose up -d --build web`
(rebuild needed only because `NEXT_PUBLIC_ADMIN_TOKEN` is build-inlined).

## Rotation (first-init credentials)

`POSTGRES_PASSWORD` and the MinIO root pair live **inside the data volumes**,
not in env. To rotate:

```bash
# Postgres
sudo docker exec ebroker-postgres psql -U ebroker -d ebroker \
  -c "ALTER USER ebroker WITH PASSWORD 'NEW';"
# then update compose + .env.local to match and recreate the api container.

# MinIO (no in-place root rotation on this image) - backup, wipe, restore:
sudo docker compose stop minio
sudo docker run --rm -v bharatbuilds_minio-data:/from -v /tmp/minio-bak:/to \
  alpine sh -c "cp -r /from/buckets /to/"
# set new MINIO_ROOT_* in compose, then:
sudo docker volume rm bharatbuilds_minio-data
sudo docker compose up -d minio
# re-seed or restore objects, then recreate api so boto3 picks up new keys.
```

`ADMIN_JWT_BYPASS_TOKEN`, `INTERNAL_API_KEY`, `NEXTAUTH_SECRET` are pure env:
change value → `sudo docker compose up -d api web` (rebuild web for the
`NEXT_PUBLIC_*` mirror), no data loss.

## Verification

```bash
curl -sf http://localhost:8000/health
curl -sf http://localhost:3000/api/recyclers | head -c 120     # proxy hop
curl -sf http://localhost:9000/minio/health/live              # MinIO
curl -sf http://localhost:11434/api/tags | grep -o gemma4     # Ollama
bash scripts/test_e2e_smoke.sh                                # 18 checks
node e2e/scripts/crawl.mjs                                    # 60 browser page loads
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every `/api/*` → 500/502 in browser, direct `:8000` fine | Web can't reach `http://api:8000` (stale rewrite/proxy target) | `app/api/[...proxy]` logs the target: `sudo docker logs ebroker-web`; recreate web |
| Agent stream `All connection attempts failed` | Container dialing `:11434` (Ollama refuses non-loopback) | Use `:11435` forwarder; see `scripts/ollama_forwarder.py` |
| `AccessDenied` / `SignatureDoesNotMatch` on upload | MinIO keys differ from first init | Rotation procedure above; don't just edit env |
| Postgres `password authentication failed` | Same first-init trap | `ALTER USER`, then match env |
| Training trigger `422 … 14 / 200` | Working as designed | Approve 200 labels in `/admin/queue` first |
| metals.dev errors in old docs | Feed retired | Static table `api/core/metal_prices.py` is authoritative |
