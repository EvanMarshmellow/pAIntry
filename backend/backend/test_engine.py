"""Offline tests: engine math + Grok fallback (no DB, no API key). Run: python test_engine.py"""
import asyncio
import os

from app.engine import analyze
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
    assert r["verdict"] == "Skip" and r["better_alternative"] is None and r["savings"] == 0
    assert any("peanuts" in x for x in r["reasons"])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
