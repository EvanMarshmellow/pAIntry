"""Multi-turn receipt OCR → pantry → optional swap suggestions (engine math, Gemini copy optional)."""
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from app import gemini
from app.grok import engine_headline, engine_reasons
from app.engine import add_to_group_cart, add_to_personal_list, analyze, resolve_product

log = logging.getLogger("uvicorn.error")

STATE_CONFIRM = "confirm_pantry"
STATE_OFFER = "offer_suggestions"
STATE_AWAIT = "await_action"

CONFIRM_RE = re.compile(
    r"^(?:yes|yep|yeah|confirm|add(?:\s+to\s+(?:my\s+)?pantry)?|ok|okay)\s*[.!?]*$", re.I)
CANCEL_RE = re.compile(r"^(?:cancel|never\s*mind|stop|no\s+thanks)\s*[.!?]*$", re.I)
OPT_IN_RE = re.compile(r"^(?:yes|yep|yeah|sure|suggestions?|tips?)\s*[.!?]*$", re.I)
OPT_OUT_RE = re.compile(
    r"(?:^|\b)(?:skip|no\s+thanks|ignore\s+suggestion|i'?m\s+fine|pass)\b", re.I)
BUY_RE = re.compile(r"\bbuy(?:\s+(?P<num>\d+))?\b", re.I)


@dataclass
class ReceiptTurn:
    reply: str
    session: dict | None = None
    pantry_docs: list = field(default_factory=list)
    purchase_swaps: bool = False
    buy_indices: list | None = None
    ignored: bool = False
    source: str = "engine"


def _now():
    return datetime.now(timezone.utc)


def _product_by_id(products, pid: str):
    pid = str(pid)
    return next((p for p in products if str(p.get("_id", p.get("name"))) == pid), None)


def match_ocr_lines(ocr: dict, products: list) -> list[dict]:
    lines = []
    for row in ocr.get("items") or []:
        name = (row.get("product") or "").strip()
        if not name:
            continue
        matched = resolve_product(name, products, pantry=None)
        line = {
            "ocr_name": name,
            "price": row.get("price"),
            "quantity": row.get("quantity"),
            "product_id": None,
            "catalog_name": None,
        }
        if matched:
            line["product_id"] = str(matched.get("_id", matched.get("name")))
            line["catalog_name"] = matched["name"]
        lines.append(line)
    return lines


def new_session(user_id: str, space_id: str, ocr: dict, lines: list[dict], owner: dict | None = None) -> dict:
    session = {
        "user_id": user_id,
        "space_id": space_id,
        "state": STATE_CONFIRM,
        "store": ocr.get("store"),
        "date": ocr.get("date"),
        "lines": lines,
        "suggestions": [],
        "updated_at": _now(),
    }
    if owner:
        session["owner"] = owner
    return session


def _group_owner(session: dict | None, owner: dict | None = None) -> dict | None:
    chosen = owner if owner is not None else (session or {}).get("owner")
    if isinstance(chosen, dict) and chosen.get("household_id"):
        return chosen
    return None


def pantry_docs_from_session(session: dict, user_id: str | None = None, owner: dict | None = None) -> list[dict]:
    """Personal docs keep user_id. Group owner docs have household_id and space_id and no user_id."""
    now = _now()
    group = _group_owner(session, owner)
    docs = []
    for line in session.get("lines") or []:
        name = line.get("catalog_name") or line.get("ocr_name")
        if not name:
            continue
        doc = {"name": name, "quantity": 1.0, "unit": "item", "added_at": now}
        if line.get("product_id"):
            doc["product_id"] = line["product_id"]
        if group:
            doc["household_id"] = group["household_id"]
            doc["space_id"] = group.get("space_id") or session.get("space_id")
            if group.get("added_by"):
                doc["added_by"] = group["added_by"]
        else:
            doc["user_id"] = user_id if user_id is not None else session.get("user_id")
        docs.append(doc)
    return docs


def _alternatives(product, products):
    cat = product.get("category")
    return [p for p in products if p.get("category") == cat]


def build_suggestions(session: dict, user: dict, pantry: list, products: list, week_spent: float) -> list[dict]:
    """Compare receipt buys to catalog swaps (ignore pantry — items were just purchased)."""
    out = []
    seen_alt = set()
    for line in session.get("lines") or []:
        pid = line.get("product_id")
        if not pid:
            continue
        product = _product_by_id(products, pid)
        if not product:
            continue
        facts = analyze(product, user, [], _alternatives(product, products), week_spent)
        if facts.get("draft_verdict") != "Swap" or not facts.get("alternative"):
            continue
        alt_name = facts["alternative"]["name"]
        alt_product = next((p for p in products if p["name"] == alt_name), None)
        if not alt_product:
            continue
        alt_id = str(alt_product.get("_id", alt_product.get("name")))
        if alt_id in seen_alt:
            continue
        seen_alt.add(alt_id)
        out.append({
            "index": len(out) + 1,
            "bought_product_id": pid,
            "bought_name": product["name"],
            "alternative_product_id": alt_id,
            "alternative_name": alt_product["name"],
            "savings": facts.get("savings") or 0,
            "headline": engine_headline("Swap", facts),
            "reasons": engine_reasons("Swap", facts)[:2],
        })
    out.sort(key=lambda s: s["savings"], reverse=True)
    for i, s in enumerate(out[:3], start=1):
        s["index"] = i
    return out[:3]


def apply_buy(session: dict, personal_list: dict, products: list, pantry: list, indices: list | None):
    suggestions = session.get("suggestions") or []
    if not suggestions:
        return personal_list, []
    if indices is None:
        picks = suggestions
    else:
        picks = [s for s in suggestions if s["index"] in indices]
    added = []
    for s in picks:
        alt = _product_by_id(products, s["alternative_product_id"])
        if not alt:
            continue
        personal_list, result = add_to_personal_list(personal_list, alt, pantry)
        if result.get("action") in ("added", "quantity"):
            added.append(s["alternative_name"])
    return personal_list, added


def apply_group_buy(session: dict, cart: dict, products: list, pantry: list, indices: list | None, added_by):
    """Add swap alternatives to the group shopping list. Does not touch a personal list."""
    suggestions = session.get("suggestions") or []
    if not suggestions:
        return cart, []
    if indices is None:
        picks = suggestions
    else:
        picks = [s for s in suggestions if s["index"] in indices]
    added = []
    for s in picks:
        alt = _product_by_id(products, s["alternative_product_id"])
        if not alt:
            continue
        cart, result = add_to_group_cart(cart, alt, added_by, pantry)
        if result.get("action") in ("added", "merged"):
            added.append(s["alternative_name"])
    return cart, added


def _lines_summary(session: dict) -> str:
    parts = []
    for line in session.get("lines") or []:
        name = line.get("catalog_name") or line.get("ocr_name")
        price = line.get("price")
        bit = name
        if price:
            bit += f" ({price})"
        if line.get("catalog_name") and line.get("ocr_name") and line["catalog_name"] != line["ocr_name"]:
            bit += f" [matched {line['catalog_name']}]"
        parts.append(f"• {bit}")
    if not parts:
        return "I couldn't read any line items."
    header = ""
    if session.get("store"):
        header = f"From {session['store']}:\n"
    return header + "\n".join(parts)


def _suggestions_summary(suggestions: list) -> str:
    if not suggestions:
        return "No swap suggestions right now — your picks look reasonable for your budget and pantry."
    lines = []
    for s in suggestions:
        lines.append(
            f"{s['index']}. {s['headline']} — "
            + (s["reasons"][0] if s.get("reasons") else f"save ${s['savings']:.2f}")
        )
    return "\n".join(lines)


def engine_confirm_reply(session: dict) -> str:
    where = "the group pantry" if _group_owner(session) else "your pantry"
    return (
        f"{_lines_summary(session)}\n\n"
        f"Reply **yes** to add these to {where}, or **cancel**."
    )


def engine_offer_reply(session: dict | None = None) -> str:
    where = "the group pantry" if _group_owner(session) else "your pantry"
    return f"Added to {where}. Want suggestions to improve future trips? Reply **yes** or **skip**."


def engine_await_reply(suggestions: list, session: dict | None = None) -> str:
    body = _suggestions_summary(suggestions)
    where = "the group list" if _group_owner(session) else "your shopping list"
    return (
        f"{body}\n\n"
        f"Reply **buy** to add the swaps to {where}, or **ignore suggestion** to keep your receipt as-is."
    )


async def _gemini_polish(instruction: str, facts: str, fallback: str) -> tuple[str, str]:
    if not gemini.api_key():
        return fallback, "engine"
    try:
        async with httpx.AsyncClient(timeout=12) as http:
            msg = await gemini.chat(http, [
                {"role": "system", "content": "You write short iMessage replies. Use ONLY facts given. Under 6 sentences."},
                {"role": "user", "content": f"{instruction}\n\nFACTS:\n{facts}\n\nFallback:\n{fallback}"},
            ], temperature=0.3)
            text = (msg.get("content") or "").strip()
            if text:
                return text, "gemini"
    except Exception as e:  # noqa: BLE001
        log.warning("Receipt gemini polish: %r", e)
    return fallback, "engine"


async def start_confirm_reply(session: dict) -> tuple[str, str]:
    fallback = engine_confirm_reply(session)
    facts = json.dumps({"lines": session.get("lines"), "store": session.get("store")}, default=str)
    return await _gemini_polish(
        "Summarize what they bought from the receipt and ask them to reply yes to add to pantry or cancel.",
        facts,
        fallback,
    )


async def start_await_reply(session: dict) -> tuple[str, str]:
    fallback = engine_await_reply(session.get("suggestions") or [], session)
    facts = json.dumps({"suggestions": session.get("suggestions")}, default=str)
    return await _gemini_polish(
        "Present numbered swap suggestions using exact savings from facts. "
        "End with buy or ignore suggestion instructions.",
        facts,
        fallback,
    )


def handle_session_text(
    session: dict,
    text: str,
    user: dict,
    pantry: list,
    products: list,
    week_spent: float,
) -> ReceiptTurn:
    t = (text or "").strip()
    state = session.get("state")

    if state == STATE_CONFIRM:
        if CANCEL_RE.match(t):
            return ReceiptTurn(reply="Cancelled — send another receipt photo anytime.", session=None)
        if CONFIRM_RE.match(t):
            session = {**session, "state": STATE_OFFER, "updated_at": _now()}
            docs = pantry_docs_from_session(session, session.get("user_id"))
            return ReceiptTurn(reply=engine_offer_reply(session), session=session, pantry_docs=docs)
        return ReceiptTurn(
            reply="Reply **yes** to add these items to your pantry, or **cancel**.",
            session=session,
        )

    if state == STATE_OFFER:
        if OPT_OUT_RE.search(t):
            return ReceiptTurn(reply="Sounds good — your pantry is updated.", session=None)
        if OPT_IN_RE.match(t):
            suggestions = build_suggestions(session, user, pantry, products, week_spent)
            session = {
                **session,
                "state": STATE_AWAIT,
                "suggestions": suggestions,
                "updated_at": _now(),
            }
            if not suggestions:
                return ReceiptTurn(
                    reply="No swaps stood out for those items. You're all set!",
                    session=None,
                )
            return ReceiptTurn(
                reply=engine_await_reply(suggestions, session),
                session=session,
            )
        return ReceiptTurn(
            reply="Want habit tips for next time? Reply **yes** or **skip**.",
            session=session,
        )

    if state == STATE_AWAIT:
        if OPT_OUT_RE.search(t) and not BUY_RE.search(t):
            return ReceiptTurn(reply="Got it — keeping your receipt choices.", session=None)
        m = BUY_RE.search(t)
        if m:
            num = m.group("num")
            indices = [int(num)] if num else None
            return ReceiptTurn(
                reply="",
                session=session,
                purchase_swaps=True,
                buy_indices=indices,
            )
        return ReceiptTurn(
            reply="Reply **buy** to add swap items to your list, or **ignore suggestion**.",
            session=session,
        )

    return ReceiptTurn(reply="Send a receipt photo to start over.", session=None)


async def handle_session_text_async(
    session: dict,
    text: str,
    user: dict,
    pantry: list,
    products: list,
    week_spent: float,
) -> ReceiptTurn:
    turn = handle_session_text(session, text, user, pantry, products, week_spent)
    if turn.session and turn.session.get("state") == STATE_AWAIT and turn.reply and turn.session.get("suggestions"):
        reply, source = await start_await_reply(turn.session)
        turn.reply = reply
        turn.source = source
    return turn
