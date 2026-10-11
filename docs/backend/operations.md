# Operations

## Local development
```bash
cp .env.local.example .env.local        # once; never commit
docker compose up -d postgres floci     # PG :5432, Floci :4566
./venv/bin/python -m uvicorn api.main:app --port 8000   # API :8000
npm start -- --port 3000                # web :3000 (production build)
```
Useful Makefile targets: `make dev` (compose + migrate + uvicorn),
`make migrate` (alembic), `make seed-recyclers`, `make floci-setup`
(buckets + SSM params; needs `aws` CLI — venv has `awscli`),
`make test-unit` / `test-int` / `e2e`, `make lint`
(ruff + mypy + eslint + tsc), `make build-images`, `make tofu-validate`.

Detached servers survive the terminal: prefix with `setsid nohup … &`.
Never `pkill -f` a pattern that appears literally in your own command line —
it matches itself; kill by PID (`pgrep -f "[u]vicorn"` brackets trick).

## E2E runbook (order matters)
1. `./venv/bin/python api/tests/e2e_seed.py <asyncpg-URL>` (wipe + seed).
2. Warm inference: `curl /detect/e2e-img-1` (first YOLO load is ~10–20s CPU).
3. `npx playwright test --project chromium`, reseed, `--project mobile`.
4. Env required on the web server: `ALLOW_DEV_ADMIN=true`,
   `NEXT_PUBLIC_ADMIN_TOKEN=dev-admin-token`.

## Lambda / SAM
`infra/sam/template.yaml` (3 image functions + HttpApi),
`samconfig.toml` (`ebroker-dev`, ap-south-1), `env.local.json` for
`sam local start-api` (`make sam-local`). Needs SAM CLI (apt/binary —
**external**, not installed). Container images exceed zip limits; ECR repos
from `infra/terraform/modules/ecr`.

## Terraform / OpenTofu (validate-only, no deploys yet)
`make tofu-validate` runs `ghcr.io/opentofu/opentofu` via Docker
(`init -backend=false` + `validate`). Root module wires
VPC → SGs/secrets/IAM → RDS/S3/Cognito/SQS/ECR. Real `plan`/`apply` needs
AWS credentials + a state backend — **paused by decision**.

## Runbooks
- **Rotate dev secrets:** change values in `.env.local` +
  `NEXT_PUBLIC_ADMIN_TOKEN`; restart both servers (baked at build/start).
- **New model version:** `modal volume get … best.pt models/best.pt`,
  verify with `ml/predict.py --demo`, restart API (weights load lazily on
  first request — first detect is slow), keep prior as `models/best_prev.pt`.
- **Flaky E2E triage order:** (1) servers up? (2) reseeded? (3) model warm?
  (4) single project? (5) shared-DB pollution from parallel runs?
- **DB reset:** `docker compose down -v && docker compose up -d postgres`
  (re-applies `infra/sql/init.sql`).
