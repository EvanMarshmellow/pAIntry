"""Orchestrate receipt OCR sessions for agent routes."""
import asyncio
import base64
import binascii
import logging

from app.perceptron_ocr import OcrError, extract_receipt_items
from app.receipt_flow import (
    ReceiptTurn,
    apply_buy,
    handle_session_text_async,
    match_ocr_lines,
    new_session,
    start_confirm_reply,
)
from app.engine import cart_summary

log = logging.getLogger("uvicorn.error")


async def _load_session(db, user_id: str, space_id: str):
    return await db.receipt_sessions.find_one({"user_id": user_id, "space_id": space_id})


async def _save_session(db, session: dict | None, user_id: str, space_id: str):
    if session is None:
        await db.receipt_sessions.delete_one({"user_id": user_id, "space_id": space_id})
        return
    session["user_id"] = user_id
    session["space_id"] = space_id
    await db.receipt_sessions.replace_one(
        {"user_id": user_id, "space_id": space_id},
        session,
        upsert=True,
    )


def _decode_image(image_base64: str) -> bytes:
    raw = image_base64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]
    try:
        return base64.b64decode(raw, validate=True)
    except binascii.Error as e:
        raise OcrError("invalid image encoding") from e


async def handle_receipt(
    db,
    *,
    user: dict,
    user_id: str,
    space_id: str,
    text: str | None,
    image_base64: str | None,
    image_mime_type: str | None,
    products: list,
    pantry: list,
    week_spent: float,
    personal_list: dict | None,
) -> dict | None:
    """
    Returns a response dict when this turn is handled by receipt flow, else None.
    """
    session = await _load_session(db, user_id, space_id)

    if image_base64:
        try:
            image_bytes = _decode_image(image_base64)
            ocr = await asyncio.to_thread(
                extract_receipt_items, image_bytes, image_mime_type or "image/jpeg"
            )
        except OcrError as e:
            return {
                "reply": f"I couldn't read that photo ({e}). Try a clearer receipt image.",
                "source": "engine",
                "ignored": False,
                "receipt": True,
            }
        # Save the store's ZIP from the receipt so live prices use the user's nearest stores
        if ocr.get("zip") and ocr["zip"] != user.get("zip"):
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"zip": ocr["zip"]}})
            user["zip"] = ocr["zip"]
            log.info("receipt zip saved: %s", ocr["zip"])
        lines = match_ocr_lines(ocr, products)
        if not lines:
            return {
                "reply": "I couldn't find any grocery items on that image. Try a receipt or shelf photo.",
                "source": "engine",
                "ignored": False,
                "receipt": True,
            }
        session = new_session(user_id, space_id, ocr, lines)
        reply, source = await start_confirm_reply(session)
        await _save_session(db, session, user_id, space_id)
        out = {
            "reply": reply,
            "source": source,
            "ignored": False,
            "receipt": True,
            "receipt_state": session.get("state"),
        }
        if personal_list is not None:
            out["list"] = cart_summary(personal_list)
        return out

    if not session or not (text or "").strip():
        return None

    turn: ReceiptTurn = await handle_session_text_async(
        session, text, user, pantry, products, week_spent
    )

    if turn.pantry_docs:
        await db.pantry_items.insert_many(turn.pantry_docs)
        pantry = pantry + turn.pantry_docs

    plist = personal_list
    if turn.purchase_swaps and plist is not None:
        plist, added = apply_buy(session, plist, products, pantry, turn.buy_indices)
        if added:
            turn.reply = f"Added to your list: {', '.join(added)}."
        else:
            turn.reply = "Nothing new added to your list."
        await _save_session(db, None, user_id, space_id)
        personal_list = plist
    else:
        await _save_session(db, turn.session, user_id, space_id)

    out = {
        "reply": turn.reply,
        "source": turn.source,
        "ignored": turn.ignored,
        "receipt": True,
        "receipt_state": turn.session.get("state") if turn.session else None,
    }
    if personal_list is not None:
        out["list"] = cart_summary(personal_list)
        if turn.purchase_swaps:
            out["_personal_list"] = personal_list
    return out