# E-Broker
Live: https://e-broker.ysinghc.in/
`Login Credentials:`
1. `Kabadiwala	+919876543210	kabadi123	Mohan Kumar → lands on /dashboard`
2. `Vendor	+91123456000	vendor123	RecycleCorp India → lands on /vendor/dashboard`

The AI broker that turns a photo of e-waste into money, safety, and compliance - before the kabadiwala leaves the doorstep.

Next.js · FastAPI · YOLO26 · Amazon Bedrock · SageMaker

> Most days, E-Broker says only one thing: fair price, safe handling, certified pickup. That's the point.

E-Broker is an agentic marketplace for India's e-waste: a kabadiwala photographs scrap, YOLO26 identifies components, a Strands agent prices materials, warns on toxicity, generates an EPR passport, and routes the lot to certified recyclers - built to run entirely on AWS.

Ramesh (Delhi) photographs a motherboard pile and speaks Hindi or Hinglish. Vendors bid in a live market. Admins review, correct, and promote better models. Families of small shops get one calm screen. They are notified only when a bid wins, a pickup is due, or something is hazardous - and only the person who can act is asked first.

Build story + architecture: `docs/ARCHITECTURE.md` · `docs/backend/`
Agent runbook: `docs/backend/agent_plan.md` · `api/services/strands_agent.py`

## The real problem: informal e-waste handling causes cancer

India generates **3.2 million metric tonnes of e-waste every year** - the third largest in the world - and less than **5% reaches certified recyclers**. The rest is burned, acid-stripped, or dumped by informal handlers who have no way of knowing what they are touching.

The consequences are not abstract. They are chemical, irreversible, and happening now:

- **PCBs and motherboards burned in the open** release brominated flame retardants (BFRs) that produce dioxins - among the most potent carcinogens known to science, directly linked to lung cancer, liver cancer, and non-Hodgkin lymphoma.
- **Batteries acid-stripped informally** leach lead and cadmium into groundwater. Lead has no safe exposure threshold and is classified as a Group 2A carcinogen by the IARC. Children in households near informal recycling sites show measurably elevated blood-lead levels.
- **CRT monitors and older chips** contain hexavalent chromium and beryllium compounds - both Group 1 human carcinogens - that persist in soil and enter the food chain through crops irrigated with contaminated groundwater.
- **Gold recovery via aqua regia** in backyard operations releases nitrogen dioxide fumes, a lung carcinogen, directly into residential air.

The kabadiwala picking up your old laptop does not know which components are time bombs. Neither does the scrap yard that buys them. The formal system's answer - paper-based EPR compliance forms - never reaches the doorstep. **The hazard warning that could prevent cancer exposure is generated after the transaction, not before it.**

E-Broker moves that warning to the only moment that matters: **before the item changes hands**.

## The operational problem

India's kabadiwalas price e-waste by eye. Vendors can't see supply. Recyclers get mixed, hazardous lots. EPR compliance is paperwork nobody can produce at the doorstep.

Cameras alone don't help. Spreadsheets don't help. A missed battery poisons a lot; a missed gold-bearing board loses a week's margin.

E-Broker sits in between: it learns what each component is worth, tells the seller first, remembers what was sold, enforces what is hazardous, and only then coordinates the buyer who can actually lift it.

E-Broker is not a replacement for CPCB process. Recycler screens always surface registration numbers and safe-handling rules.

## Who it's for

| Who | What they get |
|---|---|
| Kabadiwala seller (Ramesh, Suresh, Vijay) | Scan, instant quote, market listing, bid inbox |
| Vendor buyer (recycler, metals, logistics) | Market grid, command center, bidding, EPR intake |
| Admin / reviewer | Review queue, Konva labeller, training runs, model promotion |
| Certified recycler network | Geo-matched demand, CPCB registration, accepts-list routing |

## What E-Broker does

| Capability | Detail |
|---|---|
| Agentic scan companion | Photograph e-waste - detections, price bands, toxicity, EPR summary stream back; it doesn't only label boxes |
| All-in-one marketplace memory | RDS PostgreSQL single schema: images, detections, labels, listings, bids, training runs, model versions, agent results - not a disposable chat blob |
| Vision-first | YOLO26m, 9 unified classes, mAP50 0.802; dense PCB macros to whole phones in one taxonomy |
| Continuous learning loop | Every admin approve / correct becomes training data; nightly threshold check opens a SageMaker job; regression gate blocks bad promotes |
| Ask the seller first | Low-confidence or hazardous lot → seller sees hazard card and handling rules before any vendor is notified |
| Evidence-only pricing Q&A | "What is this lot worth?" → answers only from tool-returned detections and price bands, or not sure |
| Recycler matching | Haversine match against CPCB-seeded recyclers by lat/lng + accepts-list |
| Quiet by design | Most scans: price, safety, pickup. Engagement is not the goal |

## Example moments

| Moment | What happens | AWS |
|---|---|---|
| First photo of the day | Image posts to API; YOLO26m returns boxes; morning quote + EPR draft stream | API Gateway · Lambda · S3 · Bedrock |
| Seller speaks a task | Transcribed intent → companion agent + 6 tools → typed + spoken breakdown | Bedrock Nova Pro · RDS |
| Battery in the lot | Hazard card, toxicity tier, handling rules; vendors see warning | Bedrock · RDS · S3 |
| New bid wins | Seller inbox pings; one-tap accept; EPR passport PDF to S3 | Lambda · RDS · S3 |
| Admin approves 200 labels | Training trigger opens SageMaker job; SSE progress on `/admin/training` | EventBridge · SageMaker · Lambda |
| New weights land | Regression check vs active model; admin promotes; canary 10% → 100% | Lambda · S3 Object Lock · CloudWatch |
| Vendor asks a question | Market agent answers from listings + detections only | Bedrock · RDS |

## Architecture (AWS-first)

```
E-Broker on AWS

Kabadiwala / Vendor / Admin browser
        │
   AWS Amplify Hosting (Next.js 14 App Router)
   Amazon CloudFront + AWS WAF v2
        │
   Amazon API Gateway HTTP API
   JWT for people · admin authorizer · HMAC for internal callbacks
        ▼
   AWS Lambda - containers via Amazon ECR (arm64, Python 3.12, FastAPI + Mangum)
        ├─ Public API  - /api/v1/{proxy+} - upload, detect, market, recyclers
        ├─ Admin API   - /api/admin/{proxy+} - queue, labeller, models, stats
        └─ Internal API - /api/internal/{proxy+} - training webhooks, metrics
             │
             ├─ Amazon Bedrock (Nova Pro) - Strands agent + judge
             ├─ Amazon SageMaker - Training Jobs (H100) + Serverless Inference (A10G)
             ├─ Amazon SQS - inference queue (decoupled upload → inference)
             ├─ Amazon S3 - images + model artifacts (Object Lock, Glacier 90d)
             ├─ Amazon RDS PostgreSQL 16 + RDS Proxy - single schema, JSONB boxes
             └─ Amazon EventBridge (nightly) - approved-label threshold check
   Amazon Cognito - kabadiwala / vendor / admin groups
   AWS Secrets Manager · SSM Parameter Store · KMS
   Amazon CloudWatch (logs, metrics, alarms, dashboard) · X-Ray · CloudTrail
```

Design rules:

- No silent model fallbacks - inference or agent failure surfaces as structured error in the UI.
- The model decides vision and judgement; code decides money and actions.
- Safety cannot be switched off; hazardous lots always show handling rules.
- Only `approved` / `corrected` labels ever train; `skipped` is permanently excluded.
- Models never auto-deploy; an admin must promote, and a >5% mAP50 drop blocks the button.

## AWS services

| Layer | Services |
|---|---|
| Presentation | AWS Amplify Hosting · Amazon CloudFront · AWS WAF v2 |
| Identity | Amazon Cognito (seller / vendor / admin groups, `custom:role`) |
| Edge API | Amazon API Gateway HTTP API (JWT + HMAC, throttling 50/10 RPS, 10 MB cap) |
| Compute | AWS Lambda (public, admin, internal) · Amazon ECR (container images, 10 GB) |
| IaC | AWS SAM (`infra/sam/template.yaml`) → CloudFormation · Terraform modules (`infra/terraform/`) |
| Vision | Amazon SageMaker Training Jobs (YOLO26m, 80 epochs, 640px, AdamW) · SageMaker Serverless Inference |
| Agents | Amazon Bedrock (Nova Pro `us-east-1`) · Strands-style tools (6 tools, strict JSON, SSE) |
| Memory | Amazon RDS PostgreSQL 16 (`db.t4g.micro`, JSONB boxes) · RDS Proxy · Alembic |
| Storage | Amazon S3 (`ebroker-images`, `ebroker-models`, Object Lock, SSE-S3, lifecycle) |
| Queue | Amazon SQS (`ebroker-inference-queue`) |
| Proactive | Amazon EventBridge (nightly training check, threshold 200) |
| Policy | IAM least-privilege per function · Cognito authorizer · HMAC internal key rotation |
| Secrets | AWS Secrets Manager · SSM Parameter Store (`/ebroker/...`, SecureString) · KMS |
| Ops | Amazon CloudWatch (alarms: error >1%, p95 >5s, RDS CPU >80%) · X-Ray · CloudTrail · Cost Anomaly Detection |
| Network | Amazon VPC 3-tier (public / private / isolated) · NAT GW · VPC Endpoints (S3, SSM, ECR, CloudWatch) · Security Groups |

Deep dive: `docs/ARCHITECTURE.md`.

## Product surfaces (web)

| Route | Audience | Purpose |
|---|---|---|
| `/` | Everyone | Landing - problem, how it works, architecture |
| `/scan` | Seller | Upload + camera capture + detection canvas |
| `/result/[id]` | Seller | Component cards, price, hazard, agent insights, recyclers |
| `/recyclers` | Everyone | CPCB recycler list + Leaflet map |
| `/dashboard` | Seller | Operations tabs, listings, activity |
| `/dashboard/inbox` | Seller | Bid inbox, accept / standing |
| `/vendor/market` | Vendor | Marketplace grid, scout picks |
| `/vendor/dashboard` | Vendor | Command center, activity bars |
| `/vendor/bids` | Vendor | Bids grouped: leading / outbid / decided |
| `/auth/login` · `/auth/register` | Everyone | Cognito-backed credentials entry |
| `/admin` | Admin | Overview stats, queue depth, accuracy |
| `/admin/queue` | Admin | Review queue, approve / skip |
| `/admin/labeller/[id]` | Admin | Per-image Konva annotation |
| `/admin/training` | Admin | Training runs + SSE progress |
| `/admin/models` | Admin | Candidate deploy / reject, rollback history |

## Repository layout

```
app/               Next.js 14 - landing, scan, result, dashboard, vendor, admin, auth proxy
components/        scan, result, recyclers, admin (KonvaBoard, LabelCanvas, MetricsChart), brand, layout
hooks/             useAgentStream (SSE), usePinProgress, useReducedMotion
lib/               api client, auth, session, bbox-utils, constants, format, metalReference, training-sse
api/               FastAPI - routers (public, auth, admin, agent, market, training),
                   services (inference, model_manager, label_service, training_service,
                   strands_agent, strands_tools, agent_cache, storage), core (config,
                   metal_prices, database, security), Alembic, Dockerfiles
ml/                EDA → unify → SageMaker train → validate (preprocess, eda, validate,
                   sagemaker_train, predict, configs/unified_classes.json, tests/test_model_regression.py)
models/            best_yolo26.pt (active), best.pt, best_prev.pt, preds_*/
dataset/           5 sources: balanced_ewaste, electrocom61, pc_parts, pcb_components, trcproject
data_processed/    ebroker_yolo26/{train,valid,test} + data.yaml + manifest.json + checksums
data/              recyclers_cpcb.csv (15 CPCB seed rows)
infra/             SAM (API GW + 3 Lambdas) · Terraform (vpc, rds, s3, cognito, sqs, ecr) · SQL init
e2e/ __tests__/    Playwright (26) + Vitest (21) · pytest (42)
docs/              ARCHITECTURE, backend/{overview, api-reference, auth, database,
                   services, agent_plan, operations, testing}, ENV_SETUP, TESTING
scripts/           E2E smoke, deploy and seed helpers
```

## Vision + agent detail

**9-class taxonomy** (`ml/configs/unified_classes.json`): `battery · hard_drive · pcb · motherboard · ram · copper_cable · smartphone_device · chip · peripheral_other` - mapped from 27+ source classes across 5 datasets (15,991 images, ~80k instances). `battery=toxic`, `pcb/motherboard/ram/chip=gold value`.

**Training:** SageMaker Training Job, YOLO26m, 80 epochs, 640px, auto-batch, AdamW `lr0 0.001` + cosine, `patience 20`, hsv / mosaic / mixup / copy_paste aug, `workers 4`, `data.yaml` roots rewritten to the job volume, weights to `s3://ebroker-models/runs/`, metrics webhook to Internal Lambda.

**Inference:** `ModelManager` (`YOLO` + `RLock` + atomic `reload` hot-swap) → `predict_detailed()` → `xyxyn` → conf filter → sort → per-class dedupe `IoU>0.5`, max 10/class, cap 50. Served from the Lambda container image + SageMaker Serverless A10G via SQS for burst.

**Strands agent tools** (`api/services/strands_tools.py`): `get_scrap_price · assess_toxicity · find_recyclers · generate_epr_summary · get_exchange_rate · get_material_handling_rules` - static `PRICE_BANDS` (gold ₹13044/g Aug 2026), CPCB rules, Haversine geo-query. Strict-JSON system prompt, SSE `stream_agent_events()`, `status|tool_call|tool_result|result`.

## Deployed (Ship it)

| Piece | Where |
|---|---|
| Web | Amplify Hosting (auto-build on `main`) + CloudFront + WAF |
| API | API Gateway → Lambda containers (`ebroker-api`, `ebroker-admin`, `ebroker-internal` via ECR `:SHORT_SHA`) |
| Auth | Cognito user pool (groups: kabadiwala, vendor, admin; demo: `admin@ebroker.in`, `ramesh@kabadi.in`, `vendor@ecorecycle.in`) |
| Secrets | Secrets Manager + SSM `/ebroker/...` (DB URL, API keys, HMAC key, thresholds) |
| Data | RDS PostgreSQL 16 + Proxy · S3 `ebroker-images` / `ebroker-models` |
| Training | SageMaker Training Jobs + S3 weights + Internal Lambda webhook |
| Agent | Bedrock Nova Pro (`us-east-1`) + RDS recyclers + S3 EPR PDFs |
| Ops | CloudWatch dashboard (req/min, p50/p95 inference, training status, mAP50 trend) · X-Ray map `Amplify → API GW → Lambda → SQS → SageMaker` |

Exact URLs and pool IDs: see `infra/sam/samconfig.toml` outputs (`ApiUrl`) and Amplify console after deploy.

## Deploy to AWS

```bash
# Images are tagged with the git SHA; deploy refuses a stale tag
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com

for svc in api admin internal; do
  docker build -f api/Dockerfile.$svc -t ebroker-$svc:$SHORT_SHA api/
  docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/ebroker-$svc:$SHORT_SHA
done

sam deploy \
  --config-file infra/sam/samconfig.toml \
  --parameter-overrides ApiImageUri=$IMAGE_API AdminImageUri=$IMAGE_ADMIN InternalImageUri=$IMAGE_INTERNAL \
  --no-confirm-changeset --no-fail-on-empty-changeset

# Web (Amplify auto-build on main; manual equivalent)
npm run build
aws amplify start-deployment --app-id $AMPLIFY_APP_ID --branch-name main
```

Reset a demo day (keeps profile, listings, audit, labelled history):

```bash
python api/scripts/seed_production.py
python api/scripts/seed_recyclers.py --csv data/recyclers_cpcb.csv
```

## Safety model (the part that matters)

- Allowlist by code. Six agent tools exist; params validated by Pydantic before any DB or S3 write.
- Allowlist by data. Only `approved` / `corrected` labels enter the training export; `skipped` never does.
- Dry run first. Candidate weights must pass `ml/tests/test_model_regression.py` (overall or per-class drop >0.05 fails) before Promote enables.
- Consent is in the schema. Every label carries `created_by` + `created_at`; soft deletes only; non-repudiable audit.
- Executes exactly once. `training_runs` state machine (`queued → running → done/failed`); duplicate triggers blocked within 6h.
- Two planes, one direction. Public Lambda cannot promote models; admin Lambda cannot be reached without Cognito; internal Lambda requires HMAC.
- Recovered means proven. Promotion sets `canary_traffic_pct=10` for 1h; CloudWatch error/latency alarms must stay at baseline before 100%.
- One switch stops retraining. Threshold via SSM (`/ebroker/inference/...`, `/ebroker/training/threshold`) without redeploy.

Details: `docs/ARCHITECTURE.md` §5–7.

## Production notes

| Concern | Where |
|---|---|
| Public endpoints fail closed: magic-bytes verify, EXIF strip, 224–8000px + 20:1 aspect guard, 10 MB WAF cap | `api/routers/public.py`, WAF |
| Every AWS call has bounded timeouts and retries; a hung Bedrock or S3 call returns structured error inside the turn | `api/services/strands_agent.py`, `api/services/storage.py` |
| CORS set once on API Gateway, only for the Amplify origin | `api/main.py`, SAM template |
| Every Lambda logs JSON to a named group (`level`, `request_id`, `endpoint`, `duration_ms`) | CloudWatch Logs |
| Lambda Errors + Escalated metric page the SNS topic | CloudWatch Alarms |
| All tables use UUID PKs, JSONB boxes, geo indexes; PITR + TTLs on ephemeral state | `infra/sql/init.sql`, RDS |
| Image tags are the git SHA; deploy targets refuse stale tags | CI `deploy` job |
| Secrets never in images; fetched from SSM at cold start and cached in memory | `api/core/config.py` |

Known gaps, on purpose for a hackathon: RDS Single-AZ (`t4g.micro`), no multi-region failover, WAF geo-restriction log-only for non-IN.

## License

MIT - see `LICENSE`.
