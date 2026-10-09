"""Seed the database with production-scale demo data (50+ rows per entity).

Usage:
    python -m api.scripts.seed_production [--db-url ...] [--images 60]
                                           [--image-dir dataset]
Wipes tables first (idempotent). Samples real e-waste photos from the
training dataset, uploads the bytes to S3-compatible storage (MinIO) so
GET /images/{id} and GET /detect/{id} work end-to-end.

Reference tables keep their natural size: materials has one row per
unified class (9); admin_users is a small legacy stub.
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from api.core.config import UNIFIED_CLASSES, settings
from api.core.passwords import hash_password
from api.db.models import (
    AdminUser,
    AgentResult,
    Base,
    Bid,
    Detection,
    Image,
    Label,
    MarketplaceListing,
    Material,
    ModelVersion,
    Recycler,
    TrainingRun,
    User,
)
from api.services.storage import put_object

random.seed(42)

IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png")
FALLBACK_FIXTURE = ROOT / "api" / "tests" / "fixtures" / "test_pcb.jpg"

CITIES = [
    ("Delhi", "Delhi", 28.61, 77.21),
    ("Mumbai", "Maharashtra", 19.07, 72.87),
    ("Bengaluru", "Karnataka", 12.97, 77.59),
    ("Chennai", "Tamil Nadu", 13.08, 80.27),
    ("Hyderabad", "Telangana", 17.38, 78.48),
    ("Kolkata", "West Bengal", 22.57, 88.36),
    ("Pune", "Maharashtra", 18.52, 73.85),
    ("Ahmedabad", "Gujarat", 23.03, 72.58),
    ("Jaipur", "Rajasthan", 26.91, 75.78),
    ("Gurgaon", "Haryana", 28.46, 77.02),
    ("Noida", "Uttar Pradesh", 28.53, 77.39),
    ("Ludhiana", "Punjab", 30.90, 75.85),
    ("Kanpur", "Uttar Pradesh", 26.44, 80.33),
    ("Surat", "Gujarat", 21.17, 72.83),
    ("Bhopal", "Madhya Pradesh", 23.25, 77.41),
    ("Indore", "Madhya Pradesh", 22.72, 75.87),
    ("Nagpur", "Maharashtra", 21.14, 79.08),
    ("Lucknow", "Uttar Pradesh", 26.85, 80.95),
    ("Patna", "Bihar", 25.59, 85.13),
    ("Kochi", "Kerala", 9.93, 76.27),
    ("Coimbatore", "Tamil Nadu", 11.01, 76.95),
    ("Chandigarh", "Chandigarh", 30.73, 76.77),
    ("Dehradun", "Uttarakhand", 30.31, 78.03),
    ("Ranchi", "Jharkhand", 23.34, 85.36),
    ("Guwahati", "Assam", 26.14, 91.73),
    ("Meerut", "Uttar Pradesh", 28.98, 77.70),
    ("Agra", "Uttar Pradesh", 27.17, 78.00),
    ("Varanasi", "Uttar Pradesh", 25.31, 82.98),
    ("Rajkot", "Gujarat", 22.30, 70.80),
    ("Nashik", "Maharashtra", 19.99, 73.78),
]

RECYCLER_BASE = [
    "EcoRecycle India", "GreenTech Recyclers", "EcoCircle E-Waste", "MetalReclaim Co",
    "CleanChip Disposal", "ReLoop Recycling", "UrbanMine Refineries", "SafeScrap Logistics",
    "VoltCycle E-Waste", "TerraRefine Metals", "EKO Disposal Works", "Prithvi Recyclers",
    "ShuddhDhaatu Metals", "KabadiKart Refine", "DhaatuCycle Works", "HaritMetal Recovery",
]

VENDOR_COMPANIES = [
    "RecycleCorp India", "GreenTech Recyclers", "Shree Balaji Scrap Traders",
    "Mumbai Metal Mart", "Delhi Dismantlers Co", "Karnataka RefineWorks",
    "EcoMelt Industries", "Bharat Scrap Exchange", "Chennai Chip Recovery",
    "Hyderabad HazMat Handlers", "Pune Precious Metals", "Gujarat Green Metals",
    "Rajkot Refurb Labs", "Noida E-Cycle Traders", "Surat Smelters",
    "Bhopal Battery Buyers", "Indore Iron & E-Waste", "Nagpur Noble Metals",
    "Lucknow Lot Buyers", "Kochi Copper Co", "Coimbatore Circuit Buyers",
    "Jaipur Junk Junction",
]

KABADI_NAMES = [
    "Mohan Kumar", "Sita Devi", "Arjun Patel", "Ramesh Yadav", "Geeta Singh",
    "Vikram Gupta", "Anita Sharma", "Suresh Pal", "Kavita Rani", "Deepak Verma",
    "Pooja Kumari", "Raju Khan", "Sunita Devi", "Manoj Tiwari", "Rekha Gupta",
    "Amit Kumar", "Shanti Devi", "Ravi Shankar", "Meena Kumari", "Santosh Roy",
    "Prakash Jain", "Usha Verma", "Kishore Lal", "Babita Singh",
]

ADMIN_NAMES = ["Priya Sharma", "Raj Verma", "Neha Iyer", "Amit Desai"]

RECYCLER_PEOPLE = [
    "EcoRecycle Mumbai", "GreenLine Refine", "SouthSide E-Waste", "Deccan Dismantlers",
    "Ganga Metals Recovery", "NorthEast E-Cycle", "Malabar Scrap Works",
    "Chola Circuit Recovery", "Vindhya Volt Works", "Aravali E-Refine",
]

PROCESSES = ["dismantling", "refurbishing", "shredding", "precious_metal_recovery", "battery_processing"]

PRICE_MID = {
    "battery": 55, "hard_drive": 150, "pcb": 1000, "motherboard": 750, "ram": 1850,
    "copper_cable": 625, "smartphone_device": 1150, "chip": 1150, "peripheral_other": 45,
}

TOX_LEVEL = {
    "battery": "hazardous", "hard_drive": "caution", "pcb": "caution",
    "motherboard": "caution", "ram": "caution", "copper_cable": "safe",
    "smartphone_device": "caution", "chip": "caution", "peripheral_other": "safe",
}


def _agent_result(classes: list[str], uploader: str) -> dict:
    pricing = {c: {"min_inr": round(PRICE_MID[c] * 0.9, 2),
                   "max_inr": round(PRICE_MID[c] * 1.1, 2),
                   "unit": "piece" if c == "smartphone_device" else "kg"} for c in classes}
    return {
        "summary": f"Detected {len(classes)} component type(s): {', '.join(classes)}. "
                   f"Total scrap value ₹{sum(v['min_inr'] for v in pricing.values()):.0f}–"
                   f"₹{sum(v['max_inr'] for v in pricing.values()):.0f}.",
        "pricing": pricing,
        "toxicity": {c: {"level": TOX_LEVEL[c], "safe_handling": "Handle with gloves; route via CPCB recycler."}
                     for c in classes},
        "regulations": {},
        "total_value_range": {"min_inr": sum(v["min_inr"] for v in pricing.values()),
                              "max_inr": sum(v["max_inr"] for v in pricing.values())},
        "recyclers": [{"name": "EcoRecycle India", "city": "Delhi", "distance_km": 4.2,
                       "phone": "+91-11-23456789",
                       "accepts": classes[:3]}],
        "epr_passport": {"passport_id": f"EPR-{uploader[:8].upper()}-{len(classes):02d}",
                         "compliance_status": "VERIFIED",
                         "compliance_text": "Registered for compliant disposal under E-Waste Rules 2016."},
        "exchange_rate": {"usd_to_inr": 83.5},
        "agent_notes": "Market-band estimate; live metal prices applied when available.",
    }


def _looks_annotated(path: Path) -> bool:
    """Roboflow exports sometimes burn boxes into the pixels (bright green/red
    overlays). Those would double-render under our own detection boxes, so the
    seed only uses clean photos. Heuristic: >0.3% overlay-colored pixels."""
    from PIL import Image as PILImage

    try:
        img = PILImage.open(path).convert("RGB").resize((128, 128))
    except Exception:  # noqa: BLE001 — unreadable file counts as unusable
        return True
    px = list(img.getdata())
    overlay = sum(
        1 for r, g, b in px
        if (g > 180 and r < 120 and b < 120) or (r > 180 and g < 120 and b < 120)
    )
    return overlay > 0.003 * len(px)


def _ground_truth_classes(label_path: Path) -> set[int]:
    """Parse YOLO label file -> set of class ids. Missing/unreadable -> empty."""
    try:
        ids: set[int] = set()
        for line in label_path.read_text().splitlines():
            parts = line.split()
            if parts:
                ids.add(int(float(parts[0])))
        return ids
    except (OSError, ValueError):
        return set()


def _discover_images(image_dir: str | None, n: int) -> list[tuple[str, bytes]]:
    if image_dir:
        root = Path(image_dir)
        if not root.is_absolute():
            root = ROOT / root
        pool = sorted(p for p in root.rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
        assert pool, f"no images found under {root}"
        # Prefer images with known ground-truth classes (sibling labels dirs)
        # so the seed covers all 9 classes instead of one dominant prediction.
        gt: dict[Path, set[int]] = {}
        for p in pool:
            lab = p.parent.parent / "labels" / (p.stem + ".txt")
            gt[p] = _ground_truth_classes(lab)
        by_class: dict[int, list[Path]] = {c: [] for c in range(9)}
        unknown: list[Path] = []
        for p in pool:
            ids = gt[p]
            if not ids:
                unknown.append(p)
            else:
                by_class[min(ids)].append(p)
        for lst in list(by_class.values()) + [unknown]:
            random.shuffle(lst)
        ordered: list[Path] = []
        while len(ordered) < n * 4:  # oversample: annotation + inference filters apply
            progressed = False
            for c in range(9):
                if by_class[c]:
                    ordered.append(by_class[c].pop())
                    progressed = True
                    if len(ordered) >= n * 4:
                        break
            if unknown:
                ordered.append(unknown.pop())
                progressed = True
            if not progressed:
                break
        chosen: list[tuple[str, bytes]] = []
        skipped_annotated = 0
        for p in ordered:
            if len(chosen) >= n:
                break
            if _looks_annotated(p):
                skipped_annotated += 1
                continue
            try:
                chosen.append((p.name, p.read_bytes()))
            except Exception:  # noqa: BLE001, S112 — skip unreadable files
                continue
        print(f"seeding {len(chosen)} clean images sampled from {root} "
              f"(pool={len(pool)}, skipped {skipped_annotated} pre-annotated)")
        assert len(chosen) >= n, f"only {len(chosen)} clean images found under {root}"
        return chosen
    raw = FALLBACK_FIXTURE.read_bytes()
    return [(FALLBACK_FIXTURE.name, raw)] * n


def _users_def() -> list[dict]:
    """Original 8 accounts (kept stable for existing flows) + generated users
    for every role: 4 ADMIN, 24 KABADIWALA, 22 VENDOR, 10 RECYCLER."""
    defs = [
        {"phone": "+919999900001", "password": "admin123", "name": "Priya Sharma", "role": "ADMIN"},
        {"phone": "+919999900002", "password": "admin123", "name": "Raj Verma", "role": "ADMIN"},
        {"phone": "+919876543210", "password": "kabadi123", "name": "Mohan Kumar", "role": "KABADIWALA"},
        {"phone": "+919876543211", "password": "kabadi123", "name": "Sita Devi", "role": "KABADIWALA"},
        {"phone": "+919876543212", "password": "kabadi123", "name": "Arjun Patel", "role": "KABADIWALA"},
        {"phone": "+91123456000", "password": "vendor123", "name": "RecycleCorp India", "role": "VENDOR"},
        {"phone": "+91123456001", "password": "vendor123", "name": "GreenTech Recyclers", "role": "VENDOR"},
        {"phone": "+91445678123", "password": "recycler123", "name": "EcoRecycle Mumbai", "role": "RECYCLER"},
    ]
    used_phones = {d["phone"] for d in defs}

    def _phone() -> str:
        while True:
            p = f"+91-98{random.randint(10000000, 99999999)}"
            if p not in used_phones:
                used_phones.add(p)
                return p

    for name in ADMIN_NAMES[2:]:
        defs.append({"phone": _phone(), "password": "admin123", "name": name, "role": "ADMIN"})
    for name in KABADI_NAMES[3:]:
        defs.append({"phone": _phone(), "password": "kabadi123", "name": name, "role": "KABADIWALA"})
    for name in VENDOR_COMPANIES[2:]:
        defs.append({"phone": _phone(), "password": "vendor123", "name": name, "role": "VENDOR"})
    for name in RECYCLER_PEOPLE[1:]:
        defs.append({"phone": _phone(), "password": "recycler123", "name": name, "role": "RECYCLER"})
    return defs


async def main(db_url: str, n_images: int = 60, image_dir: str | None = "data_processed/ebroker_yolo26",
               n_listings: int = 55, n_agent_results: int = 55,
               n_recyclers: int = 55, n_runs: int = 55) -> None:
    sources = _discover_images(image_dir, n_images)
    n_images = len(sources)
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    async with Session() as s:
        for model in (AgentResult, Detection, Label, ModelVersion, TrainingRun,
                      Bid, MarketplaceListing, Image, Recycler, Material,
                      AdminUser, User):
            await s.execute(delete(model))
        await s.flush()

        # ── Images (N, real training photos) + detections ─────────────────
        statuses = (["pending"] * 24 + ["approved"] * 16 + ["corrected"] * 12 + ["skipped"] * 8)
        while len(statuses) < n_images:
            statuses += ["pending"]
        statuses = statuses[:n_images]
        random.shuffle(statuses)
        images: list[Image] = []
        blobs: list[bytes] = []
        skipped = 0
        for i, (fname, blob) in enumerate(sources):
            # Identical pipeline to POST /upload: strip EXIF/GPS + normalize,
            # so seeded predictions match what serving inference sees.
            from api.services.storage import strip_exif_and_resize

            try:
                clean, w, h = strip_exif_and_resize(blob)
            except ValueError:
                skipped += 1
                continue
            img_id = str(uuid.uuid4())
            suffix = Path(fname).suffix.lower() or ".jpg"
            key = f"raw/seed-{len(images) + 1:03d}{suffix}"
            try:
                url = await asyncio.to_thread(put_object, key, clean)
            except Exception as e:  # noqa: BLE001 - storage optional in seed
                print(f"  storage upload failed ({e}); rows still seeded")
                url = f"s3://seed/{key}"
            img = Image(id=img_id, s3_key=key, s3_url=url,
                        uploader_id=f"fp_{len(images) + 1:03d}a3f9c2e1b4d6",
                        width=w, height=h, review_status=statuses[len(images) % len(statuses)],
                        uploaded_at=now - timedelta(days=30 - len(images) % 30,
                                                    hours=len(images) % 24))
            s.add(img)
            images.append(img)
            blobs.append(clean)
        await s.flush()
        print(f"  skipped {skipped} unsuitable images; {len(images)} stored")

        # ── REAL YOLO predictions on every seeded photo ───────────────────
        # No random boxes: the demo shows what best_yolo26.pt actually sees.
        import io as _io

        from PIL import Image as PILImage

        from api.services.inference import InferenceService

        svc = InferenceService()
        pred_classes: dict[str, list[str]] = {}
        n_dets = 0
        for i, img in enumerate(images):
            pil = PILImage.open(_io.BytesIO(blobs[i])).convert("RGB")
            fresh, _, _ = await asyncio.to_thread(svc.predict_detailed, pil)
            classes: list[str] = []
            for d in fresh:
                s.add(Detection(image_id=img.id, class_name=d["class_name"],
                                confidence=round(d["confidence"], 3), bbox=d["bbox"],
                                model_version="best_yolo26.pt",
                                detected_at=img.uploaded_at + timedelta(minutes=5)))
                classes.append(d["class_name"])
                n_dets += 1
            pred_classes[img.id] = classes
        await s.flush()
        print(f"  real inference: {n_dets} detections across {len(images)} images")

        def _to_yolo(box: dict) -> dict:
            return {"xc": round((box["x1"] + box["x2"]) / 2, 3),
                    "yc": round((box["y1"] + box["y2"]) / 2, 3),
                    "w": round(box["x2"] - box["x1"], 3),
                    "h": round(box["y2"] - box["y1"], 3)}

        # ── Labels mirror the model's own boxes on reviewed images ───────
        for img in images:
            dets = [d for d in (await s.execute(
                select(Detection).where(Detection.image_id == img.id)
                .order_by(Detection.confidence.desc()).limit(2))).scalars().all()]
            if img.review_status == "approved":
                for d in dets:
                    s.add(Label(image_id=img.id, class_name=d.class_name,
                                bbox=_to_yolo(d.bbox),
                                source="model", created_by="yolo26m", is_active=True))
            elif img.review_status == "corrected":
                for d in dets:
                    s.add(Label(image_id=img.id, class_name=d.class_name,
                                bbox=_to_yolo(d.bbox),
                                source="admin", created_by="annotator@ebroker.in",
                                is_active=True))

        # ── Training runs (N) + model versions ────────────────────────────
        run_statuses = (["done"] * (n_runs - 4)) + ["running", "queued", "failed", "done"]
        random.shuffle(run_statuses)
        run_ids: list[str] = []
        for i, st in enumerate(run_statuses):
            rid = str(uuid.uuid4())
            run_ids.append(rid)
            per_class = {c: round(random.uniform(0.72, 0.91), 3) for c in UNIFIED_CLASSES}
            metrics = ({"map50": round(sum(per_class.values()) / 9, 3),
                        "map50_95": round(random.uniform(0.55, 0.68), 3),
                        "precision": round(random.uniform(0.74, 0.86), 3),
                        "recall": round(random.uniform(0.78, 0.90), 3),
                        "per_class": per_class} if st in ("done", "running") else None)
            # Active-looking rows are backdated so they read as stale history
            # and never block the training trigger gate.
            days_ago = 29 - (i % 29) if st in ("queued", "running") else 29 - (i % 30)
            s.add(TrainingRun(id=rid, modal_run_id=f"local-run-{i + 1:03d}",
                              triggered_by="manager@ebroker.in",
                              triggered_at=now - timedelta(days=days_ago),
                              status=st, epochs=30,
                              dataset_images=15000 + i * 137 if st != "queued" else None,
                              metrics=metrics,
                              completed_at=now - timedelta(days=days_ago, hours=-1)
                              if st == "done" else None))
        await s.flush()
        deployed_set = False
        for i, rid in enumerate(run_ids):
            if run_statuses[i] not in ("done", "running"):
                continue
            per_class = {c: round(random.uniform(0.72, 0.91), 3) for c in UNIFIED_CLASSES}
            deploy_this = run_statuses[i] == "done" and not deployed_set
            deployed_set = deployed_set or deploy_this
            s.add(ModelVersion(run_id=rid, s3_key=f"models/seed-{i + 1:03d}.pt",
                               map50=round(sum(per_class.values()) / 9, 3),
                               map50_95=round(random.uniform(0.55, 0.68), 3),
                               per_class=per_class,
                               created_at=now - timedelta(days=28 - (i % 28)),
                               deployed_at=now - timedelta(days=27 - (i % 27)) if deploy_this else None,
                               approved_by="manager@ebroker.in" if deploy_this else None,
                               canary_traffic_pct=10 if (i == 1 and run_statuses[i] == "done") else 0))

        # ── Recyclers (N, verified, across 30 cities) ─────────────────────
        for i in range(n_recyclers):
            city, state, lat, lng = CITIES[i % len(CITIES)]
            s.add(Recycler(
                name=f"{RECYCLER_BASE[i % len(RECYCLER_BASE)]} {city}" if i >= len(RECYCLER_BASE)
                else RECYCLER_BASE[i],
                address=f"Plot {i + 7}, Industrial Area",
                city=city, state=state,
                lat=round(lat + random.uniform(-0.05, 0.05), 4),
                lng=round(lng + random.uniform(-0.05, 0.05), 4),
                phone=f"+91-98{random.randint(10000000, 99999999)}",
                email=None,
                website=None,
                cpcb_reg_no=f"CPCB/{state[:2].upper()}/E-WASTE/{100 + i}",
                cpcb_valid_until=now + timedelta(days=365),
                accepts=random.sample(UNIFIED_CLASSES, random.randint(3, 6)),
                min_quantity_kg=float(random.choice([0.0, 0.0, 1.0, 5.0])),
                processing_types=random.sample(PROCESSES, random.randint(1, 3)),
                verified=True))

        # ── Materials (9 — one per class, reference table) ────────────────
        for cls in UNIFIED_CLASSES:
            s.add(Material(name=cls, price_per_kg=float(PRICE_MID[cls])))

        # ── Admin users (legacy stub rows) ────────────────────────────────
        for i, role in enumerate(["admin"] * 2 + ["manager"] * 4 + ["annotator"] * 6):
            s.add(AdminUser(cognito_sub=str(uuid.uuid4()), role=role))

        # ── Agent results (N cached, done) from REAL predicted classes ────
        with_dets = [img for img in images if pred_classes.get(img.id)][:n_agent_results]
        for img in with_dets:
            classes = sorted(set(pred_classes[img.id]))
            s.add(AgentResult(image_id=img.id,
                              result=_agent_result(classes, img.uploader_id),
                              status="done",
                              completed_at=img.uploaded_at + timedelta(minutes=8),
                              duration_ms=random.randint(1800, 9000)))
        await s.flush()

        # ── Users (all roles) + marketplace ───────────────────────────────
        users_def = _users_def()
        created: dict[str, User] = {}
        by_role: dict[str, list[User]] = {}
        for uinfo in users_def:
            u = User(
                phone_number=uinfo["phone"],
                role=uinfo["role"],
                full_name=uinfo["name"],
                password_hash=hash_password(uinfo["password"]),
            )
            s.add(u)
            created[uinfo["phone"]] = u
            by_role.setdefault(uinfo["role"], []).append(u)
        await s.flush()

        kabadiwalas = by_role.get("KABADIWALA", [])
        vendors = by_role.get("VENDOR", []) + by_role.get("RECYCLER", [])
        lot_images = [img for img in images
                      if img.review_status in ("approved", "corrected", "pending")
                      and pred_classes.get(img.id)][:n_listings]
        listings = []
        for i, img in enumerate(lot_images):
            seller = kabadiwalas[i % len(kabadiwalas)]
            weight = round(random.uniform(2.0, 60.0), 1)
            price = round(weight * random.uniform(90, 160), 0)
            row = MarketplaceListing(
                seller_id=seller.id, image_id=img.id,
                total_weight_kg=weight, asking_price=price,
                status="SOLD" if i % 11 == 0 else "ACTIVE",
                created_at=now - timedelta(days=29 - i % 29))
            s.add(row)
            listings.append(row)
        await s.flush()

        sold_total = 0.0
        for i, listing in enumerate(listings):
            bidders = random.sample(vendors, min(len(vendors), random.randint(2, 4)))
            for v in bidders:
                s.add(Bid(listing_id=listing.id, vendor_id=v.id,
                          bid_amount=round((listing.asking_price or 1000)
                                           * random.uniform(0.85, 1.1), 0),
                          status="OPEN",
                          created_at=now - timedelta(days=28 - i % 28, hours=2)))
            if listing.status == "SOLD":
                winner = bidders[0]
                s.add(Bid(listing_id=listing.id, vendor_id=winner.id,
                          bid_amount=listing.asking_price or 0,
                          status="ACCEPTED", created_at=now - timedelta(days=27 - i % 27)))
                sold_total += float(listing.asking_price or 0)
        if kabadiwalas:
            kabadiwalas[0].total_value_recovered = sold_total
        await s.commit()
    await engine.dispose()
    print(f"seed ok: {len(images)} images, {n_runs} runs, {n_recyclers} recyclers, "
          f"9 materials, {len(with_dets)} agent results, {len(users_def)} users, "
          f"{len(listings)} listings")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=settings.DATABASE_URL)
    ap.add_argument("--images", type=int, default=60)
    ap.add_argument("--image-dir", default="data_processed/ebroker_yolo26",
                    help="sample image bytes from this dir (training dataset)")
    ap.add_argument("--listings", type=int, default=55)
    ap.add_argument("--agent-results", type=int, default=55)
    ap.add_argument("--recyclers", type=int, default=55)
    ap.add_argument("--runs", type=int, default=55)
    args = ap.parse_args()
    asyncio.run(main(args.db_url, args.images, args.image_dir,
                     args.listings, args.agent_results,
                     args.recyclers, args.runs))
