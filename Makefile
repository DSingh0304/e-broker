# E-Broker — Local Development Bootstrap
# ════════════════════════════════════════════════════════════════
# Usage:
#   make dev          — start all local services (Floci + Postgres + API)
#   make sam-local    — start Lambda locally via SAM CLI
#   make test-unit    — unit tests only (no I/O)
#   make test-int     — integration tests (requires `make dev` running)
#   make e2e          — full E2E with Playwright
#   make migrate      — run Alembic migrations against local DB
#   make seed-recyclers — populate recyclers table from CSV
#   make lint         — ruff + mypy + eslint + tsc
#   make build-images — build all 3 Lambda container images locally
#   make deploy-dev   — SAM deploy to AWS dev stage
#   make floci-setup  — create S3 buckets + SSM params in local Floci

.PHONY: dev sam-local test-unit test-int e2e migrate lint build-images
.DEFAULT_GOAL := dev

# ── Env ────────────────────────────────────────────────────────
include .env.local
export

# ── Services ───────────────────────────────────────────────────
dev:
	@echo "▶ Starting Floci + PostgreSQL + FastAPI..."
	docker compose up -d floci postgres
	sleep 2
	$(MAKE) floci-setup
	$(MAKE) migrate
	uvicorn api.main:app --reload --port 8000 --env-file .env.local

sam-local:
	@echo "▶ Starting Lambda locally via SAM CLI..."
	sam local start-api \
		--template infra/sam/template.yaml \
		--env-vars infra/sam/env.local.json \
		--port 3001

# ── Floci bootstrap (local AWS services) ───────────────────────
floci-setup:
	@echo "▶ Creating local S3 buckets in Floci..."
	aws s3 mb s3://ebroker-images       --endpoint-url http://localhost:4566 2>/dev/null || true
	aws s3 mb s3://ebroker-models       --endpoint-url http://localhost:4566 2>/dev/null || true
	@echo "▶ Seeding SSM Parameter Store in Floci..."
	aws ssm put-parameter --name /ebroker/db/url         --value "$(DATABASE_URL)"    --type SecureString --overwrite --endpoint-url http://localhost:4566 2>/dev/null || true
	aws ssm put-parameter --name /ebroker/s3/bucket      --value "ebroker-images"     --type String       --overwrite --endpoint-url http://localhost:4566 2>/dev/null || true
	aws ssm put-parameter --name /ebroker/internal-api-key --value "dev-internal-key" --type SecureString --overwrite --endpoint-url http://localhost:4566 2>/dev/null || true
	aws ssm put-parameter --name /ebroker/inference/conf-threshold --value "0.35"     --type String       --overwrite --endpoint-url http://localhost:4566 2>/dev/null || true
	aws ssm put-parameter --name /ebroker/inference/max-detections --value "50"       --type String       --overwrite --endpoint-url http://localhost:4566 2>/dev/null || true
	@echo "✓ Floci setup complete"

# ── Database ───────────────────────────────────────────────────
migrate:
	@echo "▶ Running Alembic migrations..."
	alembic -c api/alembic.ini upgrade head

seed-recyclers:
	@echo "▶ Seeding recyclers from CSV..."
	python api/scripts/seed_recyclers.py --csv data/recyclers_cpcb.csv

# ── Tests ──────────────────────────────────────────────────────
test-unit:
	pytest api/tests/unit/ -v --tb=short --cov=api --cov-report=term-missing

test-int:
	pytest api/tests/integration/ -v --tb=short \
		--env DATABASE_URL=$(DATABASE_URL) \
		--env AWS_ENDPOINT_URL=http://localhost:4566

e2e:
	npx playwright test

# ── Lint ───────────────────────────────────────────────────────
lint:
	ruff check api/ ml/
	mypy api/services/ --ignore-missing-imports
	npm run lint
	npm run type-check

# ── Build ──────────────────────────────────────────────────────
build-images:
	docker build -f api/Dockerfile.api      -t ebroker-api:local      api/
	docker build -f api/Dockerfile.admin    -t ebroker-admin:local    api/
	docker build -f api/Dockerfile.internal -t ebroker-internal:local api/

# ── Deploy ─────────────────────────────────────────────────────
deploy-dev:
	sam deploy \
		--config-file infra/sam/samconfig.toml \
		--config-env dev \
		--no-confirm-changeset

# ── IaC validation (OpenTofu via Docker — no system install) ──
tofu-validate:
	docker run --rm -v "$(PWD)/infra/terraform:/tf" -w /tf \
		ghcr.io/opentofu/opentofu:latest init -backend=false
	docker run --rm -v "$(PWD)/infra/terraform:/tf" -w /tf \
		ghcr.io/opentofu/opentofu:latest validate

clean:
	docker compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
