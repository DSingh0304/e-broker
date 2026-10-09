"""Strands tool contracts — return shapes and toxicity logic."""
from unittest.mock import AsyncMock, patch

import pytest

from api.services.strands_agent import assess_toxicity, get_scrap_price
from api.services.strands_tools import (
    assess_toxicity as new_assess_toxicity,
)
from api.services.strands_tools import (
    find_recyclers,
    generate_epr_summary,
    get_exchange_rate,
    get_material_handling_rules,
)
from api.services.strands_tools import (
    get_scrap_price as new_get_scrap_price,
)


@pytest.mark.parametrize("class_name,expected_level", [
    ("battery", "hazardous"),
    ("pcb", "caution"),
    ("copper_cable", "safe"),
    ("peripheral_other", "safe"),
])
def test_toxicity_levels(class_name, expected_level):
    result = assess_toxicity(class_name)
    assert result["level"] == expected_level
    assert "notes" in result
    assert isinstance(result["notes"], str)


def test_scrap_price_returns_range():
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("api.services.strands_agent._fetch_spot_price", lambda *_: 450.0)
        result = get_scrap_price("pcb", region="delhi")
    assert result["minINR"] < result["maxINR"]
    assert result["unit"] in ("kg", "piece", "gram")


def test_scrap_price_unknown_class_returns_zero():
    result = get_scrap_price("unknown_class")
    assert result["minINR"] == 0
    assert result["maxINR"] == 0


def test_toxicity_all_9_classes_covered():
    classes = [
        "battery", "hard_drive", "pcb", "motherboard", "ram",
        "copper_cable", "smartphone_device", "chip", "peripheral_other"
    ]
    for cls in classes:
        result = assess_toxicity(cls)
        assert result["level"] in ("safe", "caution", "hazardous"), \
            f"Missing toxicity data for class: {cls}"


# ── New Strands SDK tools (api/services/strands_tools.py) ───────────────────
# No Bedrock, no DB, no network — live APIs fall back to static data.


@pytest.mark.asyncio
async def test_new_get_scrap_price_valid():
    result = await new_get_scrap_price.func("pcb", "Delhi", 1.0)
    assert result["min_inr"] > 0
    assert result["max_inr"] >= result["min_inr"]
    assert result["unit"] == "kg"


@pytest.mark.asyncio
async def test_new_get_scrap_price_invalid_class():
    result = await new_get_scrap_price.func("unknown_widget", "Delhi", 1.0)
    assert "error" in result


@pytest.mark.asyncio
async def test_new_get_scrap_price_static_reference():
    result = await new_get_scrap_price.func("pcb", "Delhi", 1.0)
    assert result["price_source"] == "static_reference"
    assert result["min_inr"] == 800  # band low × Delhi premium 1.0
    assert result["max_inr"] == 1200


def test_reference_metal_lookup():
    from api.services import strands_tools

    assert strands_tools._reference_metal_price_inr("pcb") == 13044.00
    assert strands_tools._reference_metal_price_inr("copper_cable") == 0.95
    assert strands_tools._reference_metal_price_inr("hard_drive") is None


@pytest.mark.asyncio
async def test_static_reference_regional_premium():
    result = await new_get_scrap_price.func("pcb", "Mumbai", 2.0)
    assert result["price_source"] == "static_reference"
    assert result["min_inr"] == round(800 * 1.05 * 2.0, 2)
    assert result["max_inr"] == round(1200 * 1.05 * 2.0, 2)


def test_new_assess_toxicity_battery_is_hazardous():
    result = new_assess_toxicity.func("battery")
    assert result["level"] == "hazardous"
    assert "lead" in str(result).lower() or "lithium" in str(result).lower()


def test_new_assess_toxicity_copper_is_safe():
    assert new_assess_toxicity.func("copper_cable")["level"] == "safe"


def test_new_assess_toxicity_unknown_class():
    assert "error" in new_assess_toxicity.func("mystery_component")


def test_epr_summary_generates_passport_id():
    result = generate_epr_summary.func(["battery", "pcb", "chip"], "abcd1234")
    assert result["passport_id"].startswith("EPR-ABCD1234")
    assert result["compliance_status"] == "VERIFIED"
    assert "battery" in result["hazardous_components"]
    assert len(result["classes_covered"]) == 3


def test_epr_summary_filters_invalid_classes():
    result = generate_epr_summary.func(["not_real"], "abcd1234")
    assert "error" in result


@pytest.mark.asyncio
async def test_find_recyclers_empty_db_returns_honest_empty():
    """No rows → empty list with a note, never fabricated recyclers."""
    with patch("api.services.agent_cache.query_recyclers", new=AsyncMock(return_value=[])):
        result = await find_recyclers.func(28.61, 77.20, 50.0, None)
    assert result["recyclers"] == []
    assert result["count"] == 0
    assert "note" in result


@pytest.mark.asyncio
async def test_find_recyclers_corrects_out_of_india_coords():
    """Coords outside India bounding box should not raise — defaults to Delhi."""
    with patch("api.services.agent_cache.query_recyclers", new=AsyncMock(return_value=[])):
        result = await find_recyclers.func(51.5, -0.1, 50.0, None)  # London
    assert result["recyclers"] is not None


@pytest.mark.asyncio
async def test_get_exchange_rate_static_fallback():
    result = await get_exchange_rate.func("USD")
    assert result["rate"] > 0
    assert result["to_currency"] == "INR"


@pytest.mark.asyncio
async def test_get_exchange_rate_unsupported_currency():
    result = await get_exchange_rate.func("ZWL")
    assert "error" in result


def test_handling_rules_includes_penalty():
    result = get_material_handling_rules.func("battery")
    assert result["hazard_level"] == "hazardous"
    assert "penalty" in result["specific_penalty"].lower() or "fine" in result["specific_penalty"].lower()
