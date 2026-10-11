"""Static metal reference prices (INR per gram).

The metals.dev free tier is exhausted, so live spot lookups are disabled.
Pricing below is a reviewed snapshot - update the values and REFERENCE_DATE
together when refreshing from a market source. All agent valuations derive
from these constants, so quotes stay deterministic and testable.
"""

REFERENCE_DATE = "2026-08-15"
REFERENCE_SOURCE = "snapshot of Indian retail spot averages (incl. GST basis)"

# INR per gram, rounded to 2 dp.
REFERENCE_METALS_INR_PER_G: dict[str, float] = {
    "gold": 13044.00,
    "silver": 155.00,
    "copper": 0.95,
    "aluminum": 0.28,
    "lead": 0.22,
    "nickel": 1.35,
    "platinum": 3900.00,
    "palladium": 3100.00,
    "zinc": 0.26,
}

# Which reference metal backs each e-waste class (informational; band
# pricing below already bakes the metal content in).
CLASS_REFERENCE_METAL: dict[str, str] = {
    "pcb": "gold",
    "chip": "gold",
    "motherboard": "gold",
    "ram": "gold",
    "copper_cable": "copper",
    "battery": "lead",
}

# Scrap price bands per class: (low_inr, high_inr, unit).
PRICE_BANDS: dict[str, tuple[float, float, str]] = {
    "battery": (45, 65, "kg"),
    "hard_drive": (120, 180, "kg"),
    "pcb": (800, 1200, "kg"),
    "motherboard": (600, 900, "kg"),
    "ram": (1500, 2200, "kg"),
    "copper_cable": (550, 700, "kg"),
    "smartphone_device": (800, 1500, "piece"),
    "chip": (900, 1400, "kg"),
    "peripheral_other": (30, 60, "kg"),
}
