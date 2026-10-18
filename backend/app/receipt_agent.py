"""Orchestrate receipt OCR sessions for agent routes."""
import asyncio
import base64
import binascii
import logging

from app.perceptron_ocr import OcrError, extract_receipt_items
from app.receipt_flow import (
    ReceiptTurn,
    apply_buy,
    apply_group_buy,
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


def _empty_cart():
    return {"items": [], "skipped": []}


async def handle_receipt(
    db,
    *,
    user: dict | None,
    user_id: str | None,
    space_id: str,
    text: str | None,
    image_base64: str | None,
    image_mime_type: str | None,
    products: list,
    pantry: list,
    week_spent: float,
    personal_list: dict | None,
    scope: str = "user",
    household_id: str | None = None,
    added_by: str | None = None,
    group_cart: dict | None = None,
) -> dict | None:
    """
    Returns a response dict when this turn is handled by receipt flow, else None.

    scope "user" writes pantry_items and personal_lists.
    scope "group" writes group_pantry_items and the group cart. Session key is group:{space_id}.
    """
    profile = user or {}
    group = scope == "group"
    session_key = f"group:{space_id}" if group else user_id
    if not session_key:
        return None
    owner = None
    if group:
        owner = {
            "household_id": household_id,
            "space_id": space_id,
            "added_by": added_by or user_id,
        }
        if group_cart is None:
            group_cart = _empty_cart()
    session = await _load_session(db, session_key, space_id)
    if group and session is not None:
        session["owner"] = owner

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
        # Personal receipts remember the store ZIP. Group receipts do not write users.
        if not group and user and user.get("_id") and ocr.get("zip") and ocr["zip"] != user.get("zip"):
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
        session = new_session(session_key, space_id, ocr, lines, owner=owner)
        reply, source = await start_confirm_reply(session)
        await _save_session(db, session, session_key, space_id)
        out = {
            "reply": reply,
            "source": source,
            "ignored": False,
            "receipt": True,
            "receipt_state": session.get("state"),
        }
        if group:
            out["cart"] = cart_summary(group_cart)
        elif personal_list is not None:
            out["list"] = cart_summary(personal_list)
        return out

    if not session or not (text or "").strip():
        return None

    turn: ReceiptTurn = await handle_session_text_async(
        session, text, profile, pantry, products, week_spent
    )

    if turn.pantry_docs:
        if group:
            for doc in turn.pantry_docs:
                doc["household_id"] = household_id
                doc["space_id"] = space_id
                if added_by:
                    doc["added_by"] = added_by
                doc.pop("user_id", None)
            await db.group_pantry_items.insert_many(turn.pantry_docs)
        else:
            await db.pantry_items.insert_many(turn.pantry_docs)
        pantry = pantry + turn.pantry_docs

    plist = personal_list
    if turn.purchase_swaps and group:
        group_cart, added = apply_group_buy(
            session, group_cart, products, pantry, turn.buy_indices, added_by or session_key)
        if added:
            turn.reply = f"Added to the group list: {', '.join(added)}."
        else:
            turn.reply = "Nothing new added to the group list."
        await _save_session(db, None, session_key, space_id)
    elif turn.purchase_swaps and plist is not None:
        plist, added = apply_buy(session, plist, products, pantry, turn.buy_indices)
        if added:
            turn.reply = f"Added to your list: {', '.join(added)}."
        else:
            turn.reply = "Nothing new added to your list."
        await _save_session(db, None, session_key, space_id)
        personal_list = plist
    else:
        await _save_session(db, turn.session, session_key, space_id)

    out = {
        "reply": turn.reply,
        "source": turn.source,
        "ignored": turn.ignored,
        "receipt": True,
        "receipt_state": turn.session.get("state") if turn.session else None,
    }
    if group:
        out["cart"] = cart_summary(group_cart)
        if turn.purchase_swaps:
            out["_group_cart"] = group_cart
    elif personal_list is not None:
        out["list"] = cart_summary(personal_list)
        if turn.purchase_swaps:
            out["_personal_list"] = personal_list
    return out