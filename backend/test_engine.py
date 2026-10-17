"""Offline tests: engine math + Gemini fallback (no DB, no API key). Run: python test_engine.py"""
import asyncio
import os

from app.agent import CartContext, handle, is_grocery_intent, parse_add_queries
from app.engine import (add_to_group_cart, analyze, cart_summary, empty_group_cart,
                        pantry_name_match, resolve_product)
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
    os.environ.pop("GEMINI_API_KEY", None)
    r = asyncio.run(explain(analyze(BAR, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Swap" and r["savings"] == 2.20
    assert r["better_alternative"] == {"name": "Greek Yogurt Cup Vanilla", "store": "Store B", "price": 1.29}


def test_fallback_bad_key():
    os.environ["GEMINI_API_KEY"] = "invalid"
    r = asyncio.run(explain(analyze(PB, MAYA, [], ALTS)))
    assert r["source"] == "engine" and r["verdict"] == "Skip"
    os.environ.pop("GEMINI_API_KEY")


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


MILK = prod("Whole Milk", "dairy_eggs", 8, {"Store A": 3.29, "Store B": 2.89})
SKIM = prod("Skim Milk", "dairy_eggs", 8, {"Store B": 2.79})
HUMMUS = prod("Hummus Classic", "snacks", 2, {"Store A": 3.99, "Store B": 3.49})
TORTILLA = prod("Tortilla Chips", "snacks", 2, {"Store B": 2.99})
CATALOG = [MILK, SKIM, HUMMUS, TORTILLA, BAR]
PANTRY_MILK = [{"name": "Whole Milk"}]


def test_resolve_unknown():
    assert resolve_product("dragonfruit", CATALOG) is None
    assert resolve_product("hummus", CATALOG)["name"] == "Hummus Classic"
    assert resolve_product("chips", CATALOG)["name"] == "Tortilla Chips"


def test_resolve_milk_prefers_pantry():
    assert resolve_product("milk", CATALOG, PANTRY_MILK)["name"] == "Whole Milk"


def test_pantry_name_match_ignores_category():
    assert pantry_name_match(MILK, PANTRY_MILK) == "Whole Milk"
    assert pantry_name_match(HUMMUS, PANTRY_MILK) is None
    # category overlap must not count
    eggs = prod("Large Eggs", "dairy_eggs", 6, {"Store B": 2.99})
    assert pantry_name_match(eggs, PANTRY_MILK) is None


def test_add_skips_pantry_milk():
    cart, result = add_to_group_cart(empty_group_cart(), MILK, "maya", PANTRY_MILK)
    assert result["action"] == "skipped" and result["pantry_name"] == "Whole Milk"
    assert cart["items"] == [] and cart["skipped"][0]["name"] == "Whole Milk"


def test_add_hummus_then_merge():
    cart, result = add_to_group_cart(empty_group_cart(), HUMMUS, "alex", PANTRY_MILK)
    assert result["action"] == "added" and result["price"] == 3.49 and result["store"] == "Store B"
    cart, result = add_to_group_cart(cart, HUMMUS, "maya", PANTRY_MILK)
    assert result["action"] == "merged" and result["requesters"] == ["alex", "maya"]
    assert len(cart["items"]) == 1
    s = cart_summary(cart)
    assert s["total"] == 3.49 and s["count"] == 1


def test_parse_add_queries():
    assert parse_add_queries("we need hummus and chips") == ["hummus", "chips"]
    assert parse_add_queries("add milk") == ["milk"]
    assert is_grocery_intent("add milk") and not is_grocery_intent("lol see you at 8")


def test_agent_fallback_skip_add_merge():
    os.environ.pop("GEMINI_API_KEY", None)
    names = {"maya": "Maya", "alex": "Alex"}
    ctx = CartContext(CATALOG, PANTRY_MILK, empty_group_cart(), "maya", "Maya", names)
    skip = asyncio.run(handle("add milk", ctx))
    assert skip["source"] == "engine" and skip["ignored"] is False
    assert "Whole Milk" in skip["reply"] and skip["cart"]["items"] == []

    ctx = CartContext(CATALOG, PANTRY_MILK, empty_group_cart(), "alex", "Alex", names)
    added = asyncio.run(handle("we need hummus and chips", ctx))
    assert {i["name"] for i in added["cart"]["items"]} == {"Hummus Classic", "Tortilla Chips"}
    assert added["cart"]["total"] == 6.48

    ctx = CartContext(CATALOG, PANTRY_MILK, ctx.cart, "maya", "Maya", names)
    merged = asyncio.run(handle("add hummus", ctx))
    hummus = next(i for i in merged["cart"]["items"] if i["name"] == "Hummus Classic")
    assert hummus["requesters"] == ["alex", "maya"]

    ignored = asyncio.run(handle("see you tonight", ctx))
    assert ignored["ignored"] is True and ignored["reply"] is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
