"""Offline tests: engine math + Grok fallback (no DB, no API key). Run: python test_engine.py"""
import asyncio
import os

from app.engine import analyze, analyze_pantry_food_groups, pantry_edible_grams, pantry_food_group
from app.grok import DATA_SOURCES, Verdict, explain, postprocess


def prod(name, cat, protein, prices, **kw):
    return {"_id": name, "name": name, "brand": kw.pop("brand", "X"), "category": cat,
            "nutrition_per_serving": {"protein_g": protein}, "prices": prices, **kw}


BAR = prod("Protein Bar Chocolate", "snacks", 20, {"Store A": 3.99, "Store B": 3.49})
YOG = prod("Greek Yogurt Cup Vanilla", "snacks", 15, {"Store B": 1.29})
PB = prod("Protein Bar Peanut Butter Crunch", "snacks", 20, {"Store B": 2.69})
CHIPS = prod("Chips", "snacks", 2, {"Store A": 1.00})
MAYA = {"weekly_budget": 60, "allergies": ["peanuts"], "goals": {"protein_g_per_day": 120}}
ALTS = [BAR, YOG, PB, CHIPS]


def test_swap():
    f = analyze(BAR, MAYA, [], ALTS)
    assert f["product"]["cheapest_store"] == "Store B" and f["product"]["price"] == 3.49
    assert f["alternative"]["name"] == "Greek Yogurt Cup Vanilla"  # peanut bar excluded, chips worse cpp
    assert f["savings"] == 2.20 and f["draft_verdict"] == "Swap"


def test_allergy_skip():
    f = analyze(PB, MAYA, [], ALTS)
    assert f["allergy_conflicts"] == ["peanuts"] and f["draft_verdict"] == "Skip"


def test_pantry_and_budget():
    f = analyze(YOG, MAYA, [{"name": "Greek Yogurt Cup Vanilla"}], ALTS)
    assert f["similar_in_pantry"] and f["draft_verdict"] == "Skip"
    f = analyze(YOG, MAYA, [], ALTS, week_spent=59.5)
    assert f["budget"]["remaining"] == 0.5 and f["draft_verdict"] == "Skip"
    assert analyze(YOG, MAYA, [], ALTS)["draft_verdict"] == "Buy"


def test_fallback_without_key():
    os.environ.pop("XAI_API_KEY", None)
    r = asyncio.run(explain(analyze(BAR, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Swap" and r["savings"] == 2.20
    assert r["better_alternative"] == {"name": "Greek Yogurt Cup Vanilla", "store": "Store B", "price": 1.29}


def test_fallback_bad_key():
    os.environ["XAI_API_KEY"] = "invalid"
    r = asyncio.run(explain(analyze(PB, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Skip"
    os.environ.pop("XAI_API_KEY")


def test_postprocess_fixes_vague_output():
    f = analyze(BAR, MAYA, [], ALTS)
    v = Verdict(verdict="Swap", headline="Swap for cheaper protein at Store B",
                reasons=["Lower cost per gram protein", "Same store availability"],
                data_sources=["get_alternatives", "get_pantry"], savings=9.99)
    r = postprocess(v, f)
    assert r["headline"] == "Swap to Greek Yogurt Cup Vanilla, save $2.20"
    assert r["savings"] == 2.20 and r["data_sources"] == DATA_SOURCES
    assert sum(any(c.isdigit() for c in x) for x in r["reasons"]) >= 2 and len(r["reasons"]) <= 3


def test_postprocess_keeps_good_output():
    f = analyze(BAR, MAYA, [], ALTS)
    good = ["Saves $2.20 per snack", "15g protein for $1.29"]
    r = postprocess(Verdict(verdict="Swap", headline="Swap to Greek Yogurt Cup Vanilla, save $2.20", reasons=good), f)
    assert r["reasons"] == good


def test_postprocess_allergy_overrides():
    f = analyze(PB, MAYA, [], ALTS)
    r = postprocess(Verdict(verdict="Swap", headline="Swap it", reasons=[]), f)
    assert r["verdict"] == "Skip" and any("peanuts" in x for x in r["reasons"])
    if f["alternative"]:
        assert r["better_alternative"]["name"] == f["alternative"]["name"]
        assert r["savings"] == f["savings"]
    else:
        assert r["better_alternative"] is None and r["savings"] == 0


def _seed_product(name, category, size, unit, calories=100, **nut):
    base = {"calories": calories, "protein_g": 5, "carbs_g": 10, "fat_g": 2, "fiber_g": 1, "sugar_g": 2}
    base.update(nut)
    return {
        "_id": name.replace(" ", "_"),
        "name": name,
        "category": category,
        "size": size,
        "unit": unit,
        "nutrition_per_serving": base,
        "prices": {"Store A": 1.0},
    }


MAYA_PRODUCTS = [
    _seed_product("Baby Spinach", "produce", 5, "oz", 20, protein_g=2, carbs_g=3),
    _seed_product("Plain Greek Yogurt Nonfat", "dairy_eggs", 32, "oz", 90, protein_g=16),
    _seed_product("Whole Milk", "dairy_eggs", 64, "fl oz", 150, protein_g=8, sugar_g=12),
    _seed_product("Large Eggs", "dairy_eggs", 12, "count", 70, protein_g=6, fat_g=5),
    _seed_product("Boneless Skinless Chicken Breast", "meat_seafood", 2, "lb", 120, protein_g=26),
    _seed_product("Bananas", "produce", 1, "lb", 105, protein_g=1, carbs_g=27, sugar_g=14),
    _seed_product("Long Grain White Rice", "pantry", 32, "oz", 160, protein_g=3, carbs_g=36),
    _seed_product("Black Beans Canned", "pantry", 15, "oz", 110, protein_g=7, carbs_g=20),
    _seed_product("Granola", "breakfast", 12, "oz", 200, protein_g=5, carbs_g=32, sugar_g=12),
    _seed_product("Cheddar Cheese Block", "dairy_eggs", 8, "oz", 110, protein_g=7, fat_g=9),
    _seed_product("Protein Bar Peanut Butter Crunch", "snacks", 1, "bar", 220, protein_g=20, sugar_g=3),
]

MAYA_PANTRY = [
    {"name": "Baby Spinach", "quantity": 1, "unit": "bag"},
    {"name": "Plain Greek Yogurt Nonfat", "quantity": 1, "unit": "tub"},
    {"name": "Whole Milk", "quantity": 0.5, "unit": "jug"},
    {"name": "Large Eggs", "quantity": 6, "unit": "count"},
    {"name": "Boneless Skinless Chicken Breast", "quantity": 1, "unit": "lb"},
    {"name": "Bananas", "quantity": 3, "unit": "count"},
    {"name": "Long Grain White Rice", "quantity": 1, "unit": "bag"},
    {"name": "Black Beans Canned", "quantity": 2, "unit": "can"},
    {"name": "Granola", "quantity": 1, "unit": "bag"},
    {"name": "Cheddar Cheese Block", "quantity": 1, "unit": "block"},
]


def test_pantry_food_group_classify():
    assert pantry_food_group(_seed_product("Bananas", "produce", 1, "lb")) == "fruits"
    assert pantry_food_group(_seed_product("Baby Spinach", "produce", 5, "oz")) == "vegetables"
    assert pantry_food_group(_seed_product("Almond Butter", "pantry", 12, "oz", fat_g=17)) == "sweets_fats"
    assert pantry_food_group(PB) == "proteins_dairy"


def test_pantry_edible_grams_milk_half_jug():
    milk = _seed_product("Whole Milk", "dairy_eggs", 64, "fl oz")
    g = pantry_edible_grams({"name": "Whole Milk", "quantity": 0.5, "unit": "jug"}, milk)
    assert 900 < g < 1000


def test_pantry_food_groups_maya_mix():
    r = analyze_pantry_food_groups(MAYA_PANTRY, MAYA_PRODUCTS, user_id="665f00000000000000000001")
    assert r["primary_metric"] == "servings"
    pcts = [r["groups"][g]["pct_servings"] for g in r["groups"]]
    assert 99 <= sum(pcts) <= 101
    gram_pcts = [r["groups"][g]["pct_grams"] for g in r["groups"]]
    assert 99 <= sum(gram_pcts) <= 101
    assert r["groups"]["proteins_dairy"]["grams_on_hand"] > r["groups"]["vegetables"]["grams_on_hand"]
    assert all(line["group"] for line in r["lines"])


def test_pantry_unmatched_name_only():
    r = analyze_pantry_food_groups(
        [{"name": "mystery kale bunch", "quantity": 2, "unit": "bag"}],
        [],
    )
    assert r["lines"][0]["matched_product"] is False
    assert r["lines"][0]["group"] == "vegetables"
    assert r["groups"]["vegetables"]["grams_on_hand"] > 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
