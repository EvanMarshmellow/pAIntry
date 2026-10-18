"""Offline receipt session tests (no DB, no Perceptron). Run: python test_receipt_flow.py"""
from app.engine import empty_personal_list
from app.receipt_flow import (
    STATE_AWAIT,
    STATE_CONFIRM,
    STATE_OFFER,
    apply_buy,
    build_suggestions,
    handle_session_text,
    match_ocr_lines,
    new_session,
    pantry_docs_from_session,
)


def prod(name, cat, protein, prices, **kw):
    return {"_id": name, "name": name, "brand": kw.pop("brand", "X"), "category": cat,
            "nutrition_per_serving": {"protein_g": protein}, "prices": prices, **kw}


BAR = prod("Protein Bar Chocolate", "snacks", 20, {"Store A": 3.99, "Store B": 3.49})
YOG = prod("Greek Yogurt Cup Vanilla", "snacks", 15, {"Store B": 1.29})
MAYA = {"weekly_budget": 60, "allergies": ["peanuts"], "goals": {"protein_g_per_day": 120}}
CATALOG = [BAR, YOG]


def test_match_ocr_lines():
    ocr = {"items": [{"product": "Protein Bar Chocolate", "price": "$3.49"}]}
    lines = match_ocr_lines(ocr, CATALOG)
    assert len(lines) == 1 and lines[0]["catalog_name"] == "Protein Bar Chocolate"


def test_confirm_and_pantry_docs():
    ocr = {"items": [{"product": "mystery item", "price": "$1.00"}]}
    lines = match_ocr_lines(ocr, CATALOG)
    session = new_session("u1", "space1", ocr, lines)
    assert session["state"] == STATE_CONFIRM
    turn = handle_session_text(session, "yes", MAYA, [], CATALOG, 0)
    assert turn.session["state"] == STATE_OFFER
    docs = pantry_docs_from_session(turn.session, "u1")
    assert docs[0]["name"] == "mystery item"


def test_suggestions_and_buy():
    ocr = {"items": [{"product": "Protein Bar Chocolate", "price": "$3.49"}]}
    lines = match_ocr_lines(ocr, CATALOG)
    session = new_session("u1", "space1", ocr, lines)
    session = handle_session_text(session, "yes", MAYA, [], CATALOG, 0).session
    pantry = pantry_docs_from_session(session, "u1")
    turn = handle_session_text(session, "yes", MAYA, pantry, CATALOG, 0)
    assert turn.session["state"] == STATE_AWAIT
    suggestions = turn.session["suggestions"]
    assert suggestions and suggestions[0]["alternative_name"] == "Greek Yogurt Cup Vanilla"
    buy = handle_session_text(turn.session, "buy", MAYA, pantry, CATALOG, 0)
    plist, added = apply_buy(turn.session, empty_personal_list(), CATALOG, pantry, buy.buy_indices)
    assert "Greek Yogurt Cup Vanilla" in added


def test_ignore_suggestion():
    ocr = {"items": [{"product": "Protein Bar Chocolate", "price": "$3.49"}]}
    session = new_session("u1", "s", ocr, match_ocr_lines(ocr, CATALOG))
    session = handle_session_text(session, "yes", MAYA, [], CATALOG, 0).session
    session = handle_session_text(session, "yes", MAYA, [], CATALOG, 0).session
    turn = handle_session_text(session, "ignore suggestion", MAYA, [], CATALOG, 0)
    assert turn.session is None


def test_skip_tips():
    session = new_session("u1", "s", {"items": []}, [])
    session["state"] = STATE_OFFER
    turn = handle_session_text(session, "skip", MAYA, [], CATALOG, 0)
    assert turn.session is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
