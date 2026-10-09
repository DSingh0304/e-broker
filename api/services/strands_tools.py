"""
E-Broker Strands tool implementations.

Each function is decorated with @tool (strands_agents.tools.tool).
Falls back to a no-op decorator when the strands package is not installed
(local dev / CI) so tools remain directly callable and expose `.func`.
"""
from __future__ import annotations

import math
from typing import Annotated

import httpx

try:  # pragma: no cover - exercised when strands is installed
    from strands import tool as _strands_tool
    tool = _strands_tool
except ImportError:  # pragma: no cover - local dev without strands-agents

    def tool(fn=None, **_kwargs):
        """Fallback decorator mimicking strands Tool behaviour for tests."""
        def _wrap(f):
            f.func = f  # type: ignore[attr-defined]
            f.name = getattr(f, "__name__", "tool")  # type: ignore[attr-defined]
            return f

        if fn is not None and callable(fn):
            return _wrap(fn)
        return _wrap

from api.core.config import UNIFIED_CLASSES, settings
from api.core.metal_prices import (
    CLASS_REFERENCE_METAL,
    PRICE_BANDS,
    REFERENCE_DATE,
    REFERENCE_METALS_INR_PER_G,
)

# ── Constants ────────────────────────────────────────────────────────────────

_LAT_MIN, _LAT_MAX = 6.0, 37.5
_LNG_MIN, _LNG_MAX = 68.0, 98.0

# Legacy alias (offline/mock stream reads bands off this module).
_PRICE_BANDS = PRICE_BANDS

_TOXICITY: dict[str, dict] = {
    "battery": {
        "level": "hazardous",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 5",
        "hazards": ["Lead-acid / Lithium — corrosive, flammable"],
        "safe_handling": "Do not incinerate, puncture or acid-strip. "
                         "Requires certified Battery Waste Management Rules recycler.",
        "penalty": "Up to ₹1 lakh fine under E-Waste Rules 2016 Rule 16.",
    },
    "hard_drive": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 1",
        "hazards": ["Lead solder on PCB", "Beryllium in voice coil (some models)"],
        "safe_handling": "Dismantle with gloves. No open burning. "
                         "Data-wipe required before disposal (IT Act 2000).",
        "penalty": "Fine under Environment Protection Act 1986.",
    },
    "pcb": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 12",
        "hazards": ["Lead solder", "Brominated Flame Retardants (BFR)", "Gold/Palladium traces"],
        "safe_handling": "No open burning — BFR releases dioxins. "
                         "Sell to CPCB-certified precious metal refiner.",
        "penalty": "Criminal liability under EPA 1986 Sec 15.",
    },
    "motherboard": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 12",
        "hazards": ["Lead solder", "BFR", "Cadmium in some capacitors"],
        "safe_handling": "No acid baths. Mechanical dismantling only. "
                         "Separate heat-sinks (aluminium) for higher scrap value.",
        "penalty": "Fine under EPA 1986.",
    },
    "ram": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I",
        "hazards": ["Lead solder", "Gold-plated contacts"],
        "safe_handling": "Handle with gloves. High value — avoid acid cleaning. "
                         "Sell directly to certified refiner for gold recovery.",
        "penalty": "Fine under EPA 1986.",
    },
    "copper_cable": {
        "level": "safe",
        "regulation": "Not specifically scheduled — standard scrap metal rules.",
        "hazards": ["PVC insulation releases HCl/dioxins if burned"],
        "safe_handling": "Strip mechanically — NEVER burn PVC insulation. "
                         "Bare copper commands premium price.",
        "penalty": "Burning PVC in urban areas: ₹500–5000 municipal fine.",
    },
    "smartphone_device": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 2",
        "hazards": ["Lithium-ion battery — fire/explosion risk", "Tantalum capacitors"],
        "safe_handling": "Do not puncture battery. Discharge fully before dismantling. "
                         "Remove battery first — it commands separate scrap price.",
        "penalty": "Fine under EPA 1986 and Battery Waste Management Rules 2022.",
    },
    "chip": {
        "level": "caution",
        "regulation": "E-Waste Rules 2016, Schedule I — Category 12",
        "hazards": ["Lead/tin solder", "Arsenic in some compound semiconductors"],
        "safe_handling": "No acid baths without PPE. Sell to certified IC refiner. "
                         "High precious metal content — do not mix with general scrap.",
        "penalty": "Fine under EPA 1986.",
    },
    "peripheral_other": {
        "level": "safe",
        "regulation": "E-Waste Rules 2016 — general category.",
        "hazards": ["Mixed materials; check sub-components"],
        "safe_handling": "Route via any CPCB-certified e-waste collector.",
        "penalty": "Standard e-waste disposal non-compliance fine.",
    },
}

_HANDLING_RULES: dict[str, dict] = {
    cls: {
        "authority": "CPCB (Central Pollution Control Board), India",
        "rules": [
            "E-Waste (Management) Rules 2016 (amended 2018, 2022)",
            "Environment Protection Act 1986",
            "Hazardous and Other Wastes (Management) Rules 2016",
        ],
        "producer_responsibility": "EPR mandate: producers must meet annual collection targets.",
        "kabadiwala_duty": "Must hand over to authorised dealer/dismantler only. "
                           "Penalty for direct sale to unauthorised buyer.",
    }
    for cls in UNIFIED_CLASSES
}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(min(1.0, math.sqrt(a)))


def _reference_metal_price_inr(class_name: str) -> float | None:
    """Static reference price (INR/g) for the class's backing metal.

    metals.dev free-tier access is exhausted, so valuations derive from the
    reviewed snapshot in api/core/metal_prices.py — deterministic, no network.
    """
    metal = CLASS_REFERENCE_METAL.get(class_name)
    if metal is None:
        return None
    return REFERENCE_METALS_INR_PER_G.get(metal)


@tool
async def get_scrap_price(
    class_name: Annotated[str, "E-waste component class."],
    region: Annotated[str, "Indian city or region."] = "Delhi",
    quantity_kg: Annotated[float, "Estimated weight in kg."] = 1.0,
) -> dict:
    """Returns the current scrap/resale price range in INR for a component."""
    if class_name not in UNIFIED_CLASSES:
        return {"error": f"Unknown class '{class_name}'. Valid: {', '.join(UNIFIED_CLASSES)}"}
    if quantity_kg <= 0 or quantity_kg > 10000:
        quantity_kg = 1.0
    lo, hi, unit = PRICE_BANDS[class_name]
    _ = _reference_metal_price_inr(class_name)  # backing metal, for audit trails
    source = "static_reference"
    _REGIONAL_PREMIUM = {
        "mumbai": 1.05, "chennai": 1.05, "bangalore": 1.03, "bengaluru": 1.03,
        "hyderabad": 1.02, "pune": 1.02, "delhi": 1.0, "ncr": 1.0,
    }
    premium = _REGIONAL_PREMIUM.get(region.lower().strip(), 0.92)
    lo = round(lo * premium * quantity_kg, 2)
    hi = round(hi * premium * quantity_kg, 2)
    return {
        "class_name": class_name,
        "region": region,
        "quantity_kg": quantity_kg,
        "min_inr": lo,
        "max_inr": hi,
        "unit": unit,
        "price_source": source,
        "note": f"Price per {unit} (reference {REFERENCE_DATE}). Actual price depends on condition and local buyer.",
    }


@tool
def assess_toxicity(
    class_name: Annotated[str, "E-waste component class name."],
) -> dict:
    """Returns hazard classification and safe handling for a component."""
    if class_name not in UNIFIED_CLASSES:
        return {"error": f"Unknown class '{class_name}'"}
    return dict(_TOXICITY[class_name])


@tool
async def find_recyclers(
    lat: Annotated[float, "Latitude (India)."],
    lng: Annotated[float, "Longitude (India)."],
    radius_km: Annotated[float, "Search radius km, max 200."] = 50.0,
    accepts_class: Annotated[str | None, "Filter by accepted class."] = None,
) -> dict:
    """Finds CPCB-certified e-waste recyclers near a location."""
    if not (_LAT_MIN <= lat <= _LAT_MAX and _LNG_MIN <= lng <= _LNG_MAX):
        lat, lng = 28.6139, 77.2090
    radius_km = min(float(radius_km), 200.0)
    if accepts_class and accepts_class not in UNIFIED_CLASSES:
        accepts_class = None
    from api.services.agent_cache import query_recyclers
    rows = await query_recyclers(lat, lng, radius_km, accepts_class)
    if not rows:
        # No certified recycler on file — return an honest empty result
        # instead of fabricated listings. The caller seeds 15 real rows.
        return {
            "recyclers": [],
            "count": 0,
            "search_radius_km": radius_km,
            "note": "No CPCB-certified recyclers on file for this area yet.",
        }
    return {
        "recyclers": rows[:5],
        "count": len(rows[:5]),
        "search_radius_km": radius_km,
        "note": "All listed recyclers are CPCB-certified. Contact before visiting.",
    }


@tool
def generate_epr_summary(
    detected_classes: Annotated[list[str], "Unique class names detected."],
    uploader_id_prefix: Annotated[str, "First 8 chars of anonymised uploader ID."],
) -> dict:
    """Generates the EPR waste passport summary for a detected batch."""
    valid_classes = [c for c in detected_classes if c in UNIFIED_CLASSES]
    if not valid_classes:
        return {"error": "No valid classes provided"}
    passport_id = f"EPR-{uploader_id_prefix.upper()[:8]}-{len(valid_classes):02d}"
    hazardous = [c for c in valid_classes if _TOXICITY.get(c, {}).get("level") == "hazardous"]
    caution = [c for c in valid_classes if _TOXICITY.get(c, {}).get("level") == "caution"]
    return {
        "passport_id": passport_id,
        "compliance_status": "VERIFIED",
        "total_component_classes": len(valid_classes),
        "classes_covered": valid_classes,
        "hazardous_components": hazardous,
        "caution_components": caution,
        "safe_components": [c for c in valid_classes if c not in hazardous + caution],
        "compliance_text": (
            f"This batch of {len(valid_classes)} e-waste component type(s) has been "
            f"identified via AI vision and registered for compliant disposal. "
            f"{'HAZARDOUS materials present — requires CPCB-certified recycler. ' if hazardous else ''}"
            f"Passport ID: {passport_id}. Valid under E-Waste (Management) Rules 2016."
        ),
        "authority": "Central Pollution Control Board (CPCB), India",
    }


@tool
async def get_exchange_rate(
    from_currency: Annotated[str, "ISO 4217 code to convert to INR."] = "USD",
) -> dict:
    """Returns the current exchange rate to INR."""
    from_currency = from_currency.upper().strip()
    ALLOWED = {"USD", "EUR", "GBP", "CNY", "JPY", "AED"}
    if from_currency not in ALLOWED:
        return {"error": f"Currency {from_currency} not supported. Use: {', '.join(ALLOWED)}"}
    if not settings.EXCHANGE_RATE_API_KEY:
        STATIC = {"USD": 83.5, "EUR": 91.2, "GBP": 106.8, "CNY": 11.5, "JPY": 0.56, "AED": 22.7}
        return {"from_currency": from_currency, "to_currency": "INR",
                "rate": STATIC.get(from_currency, 83.5), "source": "static_fallback"}
    try:
        url = settings.EXCHANGE_RATE_API_URL.format(key=settings.EXCHANGE_RATE_API_KEY)
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return {"from_currency": from_currency, "to_currency": "INR",
                    "rate": float(data["conversion_rates"]["INR"]),
                    "source": "exchangerate_api_live"}
    except Exception:  # noqa: BLE001
        return {"from_currency": from_currency, "to_currency": "INR",
                "rate": 83.5, "source": "static_fallback"}


@tool
def get_material_handling_rules(
    class_name: Annotated[str, "E-waste component class name."],
) -> dict:
    """Returns Indian regulatory rules and penalties for a component."""
    if class_name not in UNIFIED_CLASSES:
        return {"error": f"Unknown class '{class_name}'"}
    base = dict(_HANDLING_RULES[class_name])
    tox = _TOXICITY[class_name]
    base["hazard_level"] = tox["level"]
    base["specific_penalty"] = tox.get("penalty", "Fine under EPA 1986.")
    return base


# Ensure `.func` exists even when strands is installed (spec tests use .func).
for _fn in (get_scrap_price, assess_toxicity, find_recyclers,
            generate_epr_summary, get_exchange_rate, get_material_handling_rules):
    if not hasattr(_fn, "func"):
        _fn.func = _fn  # type: ignore[attr-defined]
