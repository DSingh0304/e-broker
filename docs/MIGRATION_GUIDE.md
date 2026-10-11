# E-Broker: AWS → Local Docker + Ollama Migration & Production Hardening Guide

> **Project:** E-Broker (E-Waste Recycling Marketplace)  
> **Target Environment:** Docker Compose (PostgreSQL 16, Floci S3 emulator, FastAPI + YOLO26m, Next.js 14) + Host Ollama (`gemma4:latest`)  
> **Status:** Fully Implemented, Hardened & Verified  
> **Date:** October 2026  

---

## Table of Contents
1. [Migration Overview & Outcomes](#1-migration-overview--outcomes)
2. [Target Architecture & Service Topography](#2-target-architecture--service-topography)
3. [Component-by-Component Implementation](#3-component-by-component-implementation)
   - [3.1 Docker Compose & Network Stack](#31-docker-compose--network-stack)
   - [3.2 Authentication & User Model Overhaul](#32-authentication--user-model-overhaul)
   - [3.3 AI & Inference Pipeline (YOLO26m + Ollama gemma4)](#33-ai--inference-pipeline-yolo26m--ollama-gemma4)
   - [3.4 Object Storage & Metals Pricing](#34-object-storage--metals-pricing)
   - [3.5 Admin Portal Rebuild & Annotation Canvas Fix](#35-admin-portal-rebuild--annotation-canvas-fix)
   - [3.6 Frontend-to-Backend Reverse Proxy Routing](#36-frontend-to-backend-reverse-proxy-routing)
4. [Pre-Seeded Credentials & Access Matrix](#4-pre-seeded-credentials--access-matrix)
5. [Verification Runbook & Test Results](#5-verification-runbook--test-results)
6. [Operations & Troubleshooting](#6-operations--troubleshooting)

---

## 1. Migration Overview & Outcomes

E-Broker was migrated from an AWS-dependent serverless architecture (Lambda, Bedrock Nova Pro, S3, Cognito, Modal.com GPU) to a self-contained, reproducible local Docker + Ollama architecture with production hardening.

### Completed Outcomes Matrix

| AWS Component | Target Local Replacement | Status | Verified Behavior |
|---|---|---|---|
| **AWS Lambda + Mangum** | Dockerized FastAPI on Uvicorn (`python:3.12-slim`) | ✅ Completed | Runs natively in container; Mangum wrapped in fallback for AWS portability |
| **AWS Bedrock (Nova Pro)** | Local Ollama (`gemma4:latest` via `host.docker.internal:11434`) | ✅ Completed | Fast prompt evaluation, live streaming agent breakdown, zero cloud cost |
| **AWS RDS PostgreSQL** | PostgreSQL 16 container (`postgres:16-alpine`) | ✅ Completed | Async SQLAlchemy 2.0, complete 11-table schema, persistent volume |
| **AWS S3** | Floci S3 emulator (`floci/floci:latest-compat`) | ✅ Completed | Presigned URLs, direct uploads, bucket auto-initialization at `:4566` |
| **AWS Cognito (Stubs)** | Unified NextAuth v4 + Backend JWT (`/auth/login`, `/auth/register`) | ✅ Completed | Password hashing (`pbkdf2_sha256`), role-based routing (Admin, Kabadiwala, Vendor, Recycler) |
| **Modal.com GPU Training** | Local mock training trigger + SSE event stream | ✅ Completed | `POST /admin/training` and `GET /admin/training/{id}/stream` work seamlessly |
| **Cloudflare Pages / Frontend** | Dockerized Next.js 14 (`node:20-alpine`) | ✅ Completed | App Router, SSR/CSR, internal proxying via `INTERNAL_API_URL` to `http://api:8000` |
| **Metals Pricing** | Live `metals.dev` API | ✅ Completed | Real-time INR/g prices for Au, Ag, Cu, Pd, Pt with caching |

---

## 2. Target Architecture & Service Topography

```
                    ┌──────────────────────────────────────────────────┐
                    │                   Browser Client                 │
                    │               http://localhost:3000              │
                    └────────────┬────────────────────────┬────────────┘
                                 │                        │
                                 │ :3000                  │ Static Assets / Pages
                                 v                        v
                    ┌──────────────────────────────────────────────────┐
                    │                   ebroker-web                    │
                    │               (Next.js 14 Container)             │
                    │       NextAuth JWT Session + next.config.js      │
                    └────────────────────┬─────────────────────────────┘
                                         │
                                         │ Internal Docker Network (rewrites)
                                         │ http://api:8000/:path*
                                         v
                    ┌──────────────────────────────────────────────────┐
                    │                   ebroker-api                    │
                    │            (FastAPI + Uvicorn Container)         │
                    │      Port 8000 (Internal & Host accessible)      │
                    └───┬─────────────┬──────────────┬─────────────┬───┘
                        │             │              │             │
        SQLAlchemy      │             │ S3 Boto3     │ Local PT    │ HTTP API
      AsyncPG           │             │ :4566        │ Weights     │ :11434
        v               v             v              v             v
┌───────────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────────┐
│ebroker-postgres│ │ebroker-   │ │  Models   │ │   metals    │ │ Host Ollama   │
│ PostgreSQL 16 │ │ floci     │ │ Directory │ │   .dev      │ │ gemma4:latest │
│  :5432        │ │  :4566    │ │best_yolo26│ │ Live INR/g  │ │ (Host Engine) │
└───────────────┘ └───────────┘ └───────────┘ └─────────────┘ └───────────────┘
```

### Docker Ports & Boundaries
- `3000` → `ebroker-web` (Public frontend UI & NextAuth)
- `8000` → `ebroker-api` (FastAPI REST & SSE endpoints)
- `5432` → `ebroker-postgres` (PostgreSQL 16)
- `4566` → `ebroker-floci` (Floci S3 emulator)
- `11434` → Host Ollama instance (bridged via `host.docker.internal:11434`)

---

## 3. Component-by-Component Implementation

### 3.1 Docker Compose & Network Stack
- **File:** `docker-compose.yaml`
- Replaced outdated configuration with modern compose specification.
- Configured health checks on `postgres` (`pg_isready`) and `floci` (`curl /_floci/health`).
- Configured `api` container with `extra_hosts: ["host.docker.internal:host-gateway"]` to allow containerized FastAPI to access Ollama running on the host OS.
- Mounted `./models` read-only to `/models` inside `ebroker-api` for YOLO26m inference.
- Created `api/Dockerfile.local` using `python:3.12-slim` with `libgl1-mesa-glx`, `libglib2.0-0` system dependencies for OpenCV/Ultralytics image manipulation.

### 3.2 Authentication & User Model Overhaul
- **Database Schema:** Added `password_hash VARCHAR(255)` to `users` in `infra/sql/init.sql` and `api/db/models.py`.
- **Backend Auth Router:** Created `api/routers/auth.py` providing:
  - `POST /auth/register` — Validates role, checks existing email, hashes password with PBKDF2-SHA256, stores user.
  - `POST /auth/login` — Verifies password, returns user profile and roles.
- **Frontend Auth Integration:**
  - Consolidated NextAuth in `lib/auth.ts` with credentials provider calling `POST /auth/login`.
  - Resolved Next.js App Router constraint by keeping `app/api/auth/[...nextauth]/route.ts` strictly exporting HTTP handlers (`GET`, `POST`).
  - Wrapped `app/auth/login/page.tsx` in React `<Suspense>` to support Next.js 14 client-side `useSearchParams()`.
  - Replaced browser `alert()` on `app/auth/register/page.tsx` with real async registration calling `/api/auth/register`, followed by auto-login.
  - Eliminated the admin infinite redirect loop by verifying both NextAuth admin session role and fallback cookie.

### 3.3 AI & Inference Pipeline (YOLO26m + Ollama gemma4)
- **Object Detection:** Active model `/models/best_yolo26.pt` (mAP50 0.802, 9 unified classes) loaded dynamically on CPU/GPU without cloud dependencies.
- **Ollama Integration:** Configured `api/core/config.py` with `AGENT_PROVIDER=ollama`, `OLLAMA_HOST=http://host.docker.internal:11434`, `OLLAMA_MODEL=gemma4:latest`.
- **Strands AI Agent:** `api/services/strands_agent.py` streams material evaluation, hazardous element detection, and EPR certificate breakdown via SSE.
- **Helper Setup:** Provided `scripts/setup-ollama.sh` to check or pull `gemma4:latest` on demand.

### 3.4 Object Storage & Metals Pricing
- **Floci S3:** Emulates AWS S3 on `http://floci:4566`. Initialized with default buckets: `ebroker-images` and `ebroker-models`. Presigned upload URLs work seamlessly with boto3 using `AWS_ENDPOINT_URL=http://floci:4566`.
- **Live Metals Pricing:** `api/services/strands_tools.py` interfaces with `api.metals.dev/v1/latest` returning live INR/gram rates for gold, silver, copper, platinum, and palladium.

### 3.5 Admin Portal Rebuild & Annotation Canvas Fix
- **Black Screen Canvas Fix:**
  - Root Cause: `LabelCanvas.tsx` hid the underlying image with CSS `hidden`, expecting Konva to draw it, but `KonvaBoard.tsx` lacked an `Image` element.
  - Resolution: Updated `components/admin/KonvaBoard.tsx` and `components/admin/LabelCanvas.tsx` to render the image properly using HTML5 `Image` on Konva's bottom canvas layer, preserving bounding box drawing, drag, and resize interactions.
- **Admin Endpoints:**
  - Implemented `GET /admin/models` in `api/routers/admin.py` returning active version (`d71db039`), metrics, and rollback history.
  - Implemented `POST /admin/models/{id}/reject` in `api/routers/admin.py`.
  - Implemented `GET /admin/stats` in `api/routers/admin.py` returning queue length, accuracy, and processed count.
  - Implemented SSE endpoint `GET /admin/training/{run_id}/stream` in `api/routers/training.py` emitting epoch-by-epoch mAP, loss, and completion events.
- **UI Pages:** Rebuilt `app/(admin)/admin/page.tsx`, `app/(admin)/admin/queue/page.tsx`, `app/(admin)/admin/models/page.tsx`, and `app/(admin)/admin/training/page.tsx`.
- **Semantic HTML Cleanliness:** Removed nested `<main>` tags across 10 App Router pages, restoring WCAG-compliant document structure.

### 3.6 Frontend-to-Backend Reverse Proxy Routing
- **Problem:** In Docker, client-side requests use relative `/api/*` which hits Next.js on `:3000`. Next.js rewrites in `next.config.js` were pointing to `http://127.0.0.1:8000`, causing `ECONNREFUSED` inside the web container.
- **Solution:** Updated `next.config.js` to read `process.env.INTERNAL_API_URL` (set to `http://api:8000` in `docker-compose.yaml`), seamlessly forwarding all `/api/*` traffic across Docker network bridges.

---

## 4. Pre-Seeded Credentials & Access Matrix

All passwords are standardized to `Password123!` for development:

| Role | Email | Password | Primary Interface |
|---|---|---|---|
| **Admin** | `admin@ebroker.in` | `Password123!` | `/admin` (Review Queue, Model Management, Training) |
| **Secondary Admin** | `reviewer@ebroker.in` | `Password123!` | `/admin/queue` (HITL Annotation & Labeling) |
| **Kabadiwala (Delhi)** | `ramesh@kabadi.in` | `Password123!` | `/dashboard`, `/scan` (Component detection, instant quote) |
| **Kabadiwala (Bengaluru)** | `suresh@kabadi.in` | `Password123!` | `/dashboard`, `/scan` |
| **Kabadiwala (Mumbai)** | `vijay@kabadi.in` | `Password123!` | `/dashboard`, `/scan` |
| **Vendor (Recycler)** | `vendor@ecorecycle.in` | `Password123!` | `/vendor/market`, `/vendor/dashboard` (Bidding & EPR) |
| **Vendor (Metals)** | `vendor@metalreclaim.in`| `Password123!` | `/vendor/market` |
| **Vendor (Logistics)** | `vendor@safescrap.in` | `Password123!` | `/vendor/market` |

*Seeding Script:* Run `docker compose exec api python api/scripts/seed_production.py` to reset/re-seed accounts and demo listings anytime.

---

## 5. Verification Runbook & Test Results

An automated end-to-end smoke test script is located at `scripts/test_e2e_smoke.sh`.

```bash
chmod +x scripts/test_e2e_smoke.sh
./scripts/test_e2e_smoke.sh
```

### Verified Output
```
=== E-Broker E2E Smoke Test ===
API Health: {"status":"ok"}
Frontend: OK
Login OK: User ID 451f9f53-4afc-40a5-8eff-454259aab39c
Upload OK: Image ID c96d0e8b-6374-4e96-9215-9a4c03616986
Detections count: 1
Market Listing OK
Metals API Gold Price (INR/g): 13042.8553
Admin Queue Items: 10
Deployed Model Version: d71db039
=== ALL E2E CHECKS PASSED SUCCESSFULLY ===
```

### Direct Verification Commands
1. **Frontend-to-Backend Proxy Verification:**
   ```bash
   curl -i http://localhost:3000/api/health
   # Returns HTTP/1.1 200 OK from FastAPI via Next.js proxy
   ```
2. **CPCB Registered Recyclers List:**
   ```bash
   curl -s http://localhost:3000/api/recyclers | jq .count
   # Returns 15 verified recyclers
   ```
3. **Admin Queue Status:**
   ```bash
   curl -s -H "Authorization: Bearer dev-admin-token" http://localhost:8000/admin/queue | jq .total
   ```

---

## 6. Operations & Troubleshooting

### Daily Operations Commands

```bash
# Start all services in background
docker compose up -d

# Verify all containers are healthy
docker compose ps

# View real-time logs from API and Web
docker compose logs -f api web

# Re-seed test accounts and market listings
docker compose exec api python api/scripts/seed_production.py

# Pull or update Ollama gemma4 model
./scripts/setup-ollama.sh

# Stop all services (preserves database & uploaded files)
docker compose down

# Full reset (erases database volume and re-runs init.sql)
docker compose down -v
docker compose up -d
docker compose exec api python api/scripts/seed_production.py
```

### Troubleshooting Checklist

- **Issue: `ECONNREFUSED 127.0.0.1:8000` from Next.js server logs:**
  - Cause: Next.js running in Docker tried to resolve `127.0.0.1` instead of container name `api`.
  - Fix: Ensure `INTERNAL_API_URL=http://api:8000` is present in `docker-compose.yaml` and loaded in `next.config.js`.
- **Issue: Ollama connection fails (`Connection refused` on 11434):**
  - Cause: Ollama is listening only on `127.0.0.1` on the host, or `host.docker.internal` is not resolvable.
  - Fix: Start Ollama with `OLLAMA_HOST=0.0.0.0:11434 ollama serve`. The `api` container already has `extra_hosts: ["host.docker.internal:host-gateway"]`.
- **Issue: YOLO weights loading slowly on first request:**
  - Explanation: Model weights (`/models/best_yolo26.pt`) are loaded lazily into memory on the first request (~5–10s on CPU) and cached in memory thereafter (<100ms per inference).

