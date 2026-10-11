# Authentication & Security Model

Three independent gates. Nothing shares credentials across tiers.

## 1. Admin (`require_admin`) → 401
- **Local/test:** `ADMIN_JWT_BYPASS=true` + static token
  (`ADMIN_JWT_BYPASS_TOKEN`, default `admin-test-token`). `curl -H
  "Authorization: Bearer …"` or the frontend's `NEXT_PUBLIC_ADMIN_TOKEN`.
- **Dev browser:** same bypass, but via the `ebroker_dev_admin=1` cookie
  (see web `lib/auth.ts`). Lets a logged-in browser call admin APIs without
  stuffing tokens into JS - bypass-gated, dev-only.
- **Prod:** bypass forced `false`; Cognito JWT verification against JWKS
  (issuer/audience + `custom:role`), **not yet implemented** - this is the
  largest open security item. Until then, do not expose admin routes publicly.

## 2. Internal (`require_internal_key`) → 403
Modal → Lambda callbacks (`/internal/*`) must send `X-Internal-Key` equal to
`INTERNAL_API_KEY` (SSM SecureString in prod, rotated monthly via
EventBridge). Constant-time comparison is used in the HMAC variant
(`api-reference` metrics endpoint); the header check here is equality
against a high-entropy secret - acceptable, rotation is the real control.

## 3. Public upload (no auth) → fingerprinting
`fingerprint_uploader()` = `SHA-256(filename | 0.0.0.0 | hour-bucket)[:32]`.
Deliberately coarse: abuse-rate-limitable, zero PII, no GPS (EXIF stripped
before storage). Tighten with Cloudflare rate limits (100 req/5min on
upload) and WAF 10MB body caps per ARCHITECTURE.md §4.

## Transport & storage rules enforced in code
- S3 buckets block public access; SSE-S3; lifecycle to Glacier (90d) → delete
  (365d). Model weights get Object Lock COMPLIANCE in prod.
- RDS: encrypted at rest, `rds.force_ssl`, Proxy IAM auth (no passwords in
  Lambda env). Local dev uses password auth against the compose Postgres.
- Secrets live in SSM, never `.env` files in images. `.env.local` is
  gitignored and dev-only.

## What is mocked vs real today
| Control | Local/dev | Prod (per plan, pending) |
|---|---|---|
| Admin identity | static token / dev cookie | Cognito JWT + Cloudflare Access |
| Internal key | static string | SSM + monthly rotation |
| S3/SQS/SSM | Floci :4566 | real AWS |
| Inference | local `best.pt` | Modal A10G via SQS |
| Pricing feed | static INR bands | metals-api scaling |
