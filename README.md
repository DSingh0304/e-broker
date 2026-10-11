# ♻️ E-Broker - AI Broker for India's E-Waste

Photograph e-waste → YOLO26 identifies components → Strands AI agent prices
materials, warns on toxicity, generates EPR passports, and routes sellers to
certified recyclers. Built for the WeMakeDevs × AWS Bharat Builds hackathon
(Track 03: Waste & Energy).

## Status
Working local stack: Next.js frontend, FastAPI backend, YOLO26m fine-tune
(mAP50 **0.802**, 9 classes, 15,991 images), Modal training, human-in-the-loop
retraining pipeline. See [docs/backend/](docs/backend/) for the full technical
reference.

## Quickstart (Local Docker Stack)
```bash
# 1. Boot entire stack (PostgreSQL, Floci S3, FastAPI with YOLO26m, Next.js 14)
docker compose up -d

# 2. Run automated E2E smoke tests
./scripts/test_e2e_smoke.sh
```
- Open http://localhost:3000 to use the application.
- See [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) for architecture, credentials, and runbooks.
- API Swagger Docs: http://localhost:8000/docs
- Admin Credentials: `admin@ebroker.in` / `Password123!`

## Repo map
| Path | What |
|---|---|
| `app/`, `components/`, `lib/` | Next.js 14 frontend (App Router, Tailwind, Konva labeller) |
| `api/` | FastAPI backend (public/admin/training routers, 8-table PG schema) |
| `ml/` | YOLO dataset pipeline (EDA → unify → Modal train → validate) |
| `infra/` | SAM template + Terraform modules (validate-only; deploys paused) |
| `docs/backend/` | Complete backend technical documentation |
| `e2e/`, `__tests__/` | Playwright + Vitest suites |

## Testing
| Suite | Result |
|---|---|
| Backend pytest (unit + integration) | 42/42 |
| Vitest unit / integration | 17 + 4 |
| Playwright (chromium + mobile) | 26/26 |
| `tsc`, `eslint`, `ruff`, `mypy`, `next build`, `tofu validate` | clean |

`make test-unit`, `make test-int`, `make e2e`, `make lint`, `make tofu-validate`.

## Environment & secrets
Copy `.env.local.example` → `.env.local` (gitignored, never committed).
Real secrets live in AWS SSM in prod; local dev uses documented dummy values
only. No credentials of any kind are stored in this repo.

## License
MIT - see [LICENSE](LICENSE).
