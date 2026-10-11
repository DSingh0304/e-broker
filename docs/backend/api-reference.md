# API Reference

Base path is `/` on the backend; edge/proxy serves it under `/api/*`.
Auth: `A` = admin Bearer (or dev cookie), `I` = `X-Internal-Key`, `–` = public.

## Public

### `POST /upload` (–, multipart)
Field `file`: JPEG/PNG, 1KB–10MB. Validates magic bytes, strips EXIF,
stores to S3, creates `images` (pending).
- `200 {imageId, s3Url}` · `400` bad image/dimensions · `413` too large.

### `GET /detect/{image_id}` (–)
Runs inference + agent, persists detections, returns cards.
- `200 {imageId, detections[{className, confidence, bbox{x1,y1,x2,y2},
  pricing{minINR,maxINR,unit}, toxicity{level,notes}}], totalValueRange{min,max},
  recyclers[{name,distance_km,contact}], passportUrl, passportId}`
- `404` unknown image · `422` image bytes unavailable.

### `GET /images/{image_id}` (–)
EXIF-stripped JPEG bytes (`image/jpeg`). `404` / `422` as above.
Used by the result canvas and admin thumbnails.

### `GET /passport/{image_id}` (–)
On-demand EPR PDF (`application/pdf`, `attachment; filename="epr-{id8}.pdf"`):
passport ID, uploader hash, date, detection list with confidences, certified-
recycler footer. `404` unknown image.

### `GET /health` (–)
`200 {status: healthy}`. Load-balancer / compose healthcheck target.

## Admin (Bearer `Authorization` or dev cookie → 401 otherwise)

### `GET /admin/queue?page=&status=pending`
`200 {items[{imageId, thumbnailUrl, detections[{className, confidence}],
reviewStatus, uploadedAt}], total}` - 50/page, newest first.

### `GET /admin/queue/{image_id}`
`200 {imageId, reviewStatus, thumbnailUrl}` · `404`.

### `POST /admin/queue/{image_id}/approve`
`review_status → approved`. `200 {success, reviewStatus}` · `404`.

### `POST /admin/queue/{image_id}/skip`
`review_status → skipped` (permanently excluded from training).
`200 {success, reviewStatus}` · `404`.

### `POST /admin/labels/{image_id}`
Body `{labels: [{className, bbox{xc,yc,w,h}}]}`. Validates every class
(∈ taxonomy) and bbox (range + area); soft-deletes prior active labels;
writes `source=admin` rows; `review_status → corrected`.
`200 {success, reviewStatus}` · `404` · `422` with reason.

### `POST /admin/models/{version_id}/deploy`
Regression gate → hot-swap reload → stamps `deployed_at`/`approved_by`.
Blocks with `422` containing `Regression blocked: …` when overall mAP50 drops
> 0.05 vs the deployed baseline, or any single class drops > 0.05.
`200 {success, deployedAt}` · `404`.

## Training + internal

### `POST /admin/training/trigger` (A)
Refuses with `409 "already running"` while any run is queued/running.
Otherwise spawns Modal (`modal_client.spawn`) and records the run.
`200 {runId, modalRunId}`.

### `GET /internal/training/trigger-check` (I)
`200 {new_labels: <active label count>}`. The Modal cron compares against the
200-label threshold (see ARCHITECTURE.md §7).

### `POST /internal/training/metrics` (I)
Body `{runId, type: epoch|done, epoch, total, loss, mAP50, …}`. Marks the run
`running` and appends per-epoch metrics; `done` closes it with
`completed_at`. `200 {success}` · `404` unknown run.

## Error shape
FastAPI defaults: `{detail: string}`. Validation failures are `422`
(malformed bbox/class/model id); auth failures are `401` (admin) or `403`
(bad internal key); state conflicts (duplicate trigger) are `409`.
