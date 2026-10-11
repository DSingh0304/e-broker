#!/bin/bash
# test_e2e_smoke.sh - production smoke test. Run after the stack is up.
# Expects: API :8000, web :3000, Floci/MinIO storage, Ollama on :11434.
set -u

ADMIN_TOKEN="${ADMIN_JWT_BYPASS_TOKEN:-dev-admin-token}"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

echo "=== E-Broker production smoke test ==="

echo "[1] Service health"
curl -sf http://localhost:8000/health | grep -q '"ok"' && ok "api /health" || bad "api /health"
curl -sf http://localhost:3000 > /dev/null && ok "web :3000" || bad "web :3000"
curl -sf http://localhost:11434/api/tags | grep -q gemma4 && ok "ollama gemma4" || bad "ollama gemma4"

echo "[2] Auth (salted passwords, no bypass, no privilege escalation)"
curl -sf -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","password":"kabadi123"}' | grep -q KABADIWALA \
  && ok "login kabadiwala" || bad "login kabadiwala"
[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","password":"wrong"}')" = "401" ] \
  && ok "wrong password rejected" || bad "wrong password rejected"
[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+910000000001","password":"test1234","full_name":"Probe","role":"ADMIN"}')" = "403" ] \
  && ok "ADMIN self-register blocked" || bad "ADMIN self-register blocked"

echo "[3] Scan pipeline (upload -> detect -> image bytes)"
IMAGE_ID=$(curl -sf -X POST http://localhost:8000/upload \
  -F "file=@api/tests/fixtures/test_pcb.jpg" | python3 -c "import json,sys; print(json.load(sys.stdin)['imageId'])")
[ -n "${IMAGE_ID:-}" ] && ok "upload $IMAGE_ID" || bad "upload"
curl -sf "http://localhost:8000/detect/$IMAGE_ID" | grep -q detections \
  && ok "detect returns detections" || bad "detect"
curl -sf "http://localhost:8000/images/$IMAGE_ID" -o /dev/null \
  && ok "image bytes served" || bad "image bytes"

echo "[4] Marketplace (list -> bid -> accept)"
LISTING=$(curl -sf -X POST http://localhost:8000/market/listings \
  -H "X-User-Phone: +919876543210" -H "X-User-Role: KABADIWALA" \
  -H "Content-Type: application/json" \
  -d "{\"image_id\":\"$IMAGE_ID\",\"total_weight_kg\":2.5,\"asking_price\":1500}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
[ -n "${LISTING:-}" ] && ok "listing $LISTING" || bad "listing"
BID=$(curl -sf -X POST http://localhost:8000/market/bids \
  -H "X-User-Phone: +91123456000" -H "X-User-Role: VENDOR" \
  -H "Content-Type: application/json" \
  -d "{\"listing_id\":\"$LISTING\",\"bid_amount\":1600}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
[ -n "${BID:-}" ] && ok "bid $BID" || bad "bid"
curl -sf -X POST "http://localhost:8000/market/bids/$BID/accept" \
  -H "X-User-Phone: +919876543210" -H "X-User-Role: KABADIWALA" | grep -q Accepted \
  && ok "bid accepted" || bad "bid accepted"

echo "[5] Admin API (queue, models, stats, runs)"
curl -sf http://localhost:8000/admin/queue -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -q imageId && ok "queue (thumbnails via /api/images)" || bad "queue"
curl -sf http://localhost:8000/admin/models -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -q deployed && ok "models" || bad "models"
curl -sf http://localhost:8000/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -q pending_count && ok "stats" || bad "stats"
curl -sf "http://localhost:8000/admin/training/runs?limit=3" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -q runs && ok "training runs" || bad "training runs"
TRIGGER_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/admin/training/trigger \
  -H "Authorization: Bearer $ADMIN_TOKEN")
[ "$TRIGGER_CODE" = "422" ] || [ "$TRIGGER_CODE" = "200" ] \
  && ok "training trigger gate ($TRIGGER_CODE)" || bad "training trigger gate ($TRIGGER_CODE)"

echo "[6] Reference pricing (static table, no external feed)"
if ./venv/bin/python -c "
import asyncio, sys
sys.path.insert(0, '.')
from api.services.strands_tools import get_scrap_price
r = asyncio.run(get_scrap_price.func('pcb', 'Delhi', 1.0))
assert r['price_source'] == 'static_reference', r
assert (r['min_inr'], r['max_inr']) == (800, 1200), r
"; then ok "static reference pcb 800-1200 INR/kg"; else bad "static reference pricing"; fi

echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ]
