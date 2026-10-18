from contextlib import asynccontextmanager
import re
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import kroger
from app.auth import router as auth_router
from app.agent import CartContext, handle as handle_agent
from app.db import close, connect, get_db
from app.engine import analyze, analyze_pantry_food_groups, cart_summary
from app.grok import explain
from app.personal_agent import PersonalContext, handle as handle_personal
from app.receipt_agent import handle_receipt
from app.receipt_flow import match_ocr_lines, new_session, start_confirm_reply


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    yield
    await close()


app = FastAPI(title="Grocery Assistant API", lifespan=lifespan)
app.include_router(auth_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def clean(doc):
    """Convert ObjectIds to str (recursively) for JSON responses."""
    if isinstance(doc, list):
        return [clean(d) for d in doc]
    if isinstance(doc, dict):
        return {k: clean(v) for k, v in doc.items()}
    return str(doc) if isinstance(doc, ObjectId) else doc


def oid(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except InvalidId:
        raise HTTPException(400, "Invalid id")


class PantryItemIn(BaseModel):
    name: str
    quantity: float = 1
    unit: str = "item"
    product_id: str | None = None
    expires_at: datetime | None = None


@app.get("/health")
async def health():
    await get_db().command("ping")
    return {"status": "ok"}


@app.get("/products")
async def list_products(category: str | None = None):
    query = {"category": category} if category else {}
    return clean(await get_db().products.find(query).to_list(500))


@app.get("/live-prices")
async def live_prices(q: str, limit: int = 5, zip: str | None = None):
    """Real prices from the 3 stores nearest `zip` (Kroger API). 503 if Kroger is unavailable."""
    results = await kroger.search(q, limit, zip)
    if results is None:
        raise HTTPException(503, "Kroger unavailable, using sample data")
    return results


@app.get("/stores")
async def stores(zip: str | None = None):
    """Nearest Kroger-family stores (QFC, Fred Meyer, ...) to a ZIP."""
    result = await kroger.nearby_stores(zip)
    if result is None:
        raise HTTPException(503, "Kroger unavailable")
    return [{"name": n, "location_id": i} for n, i in result.items()]


@app.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await get_db().users.find_one({"_id": oid(user_id)})
    if not user:
        raise HTTPException(404, "User not found")
    return clean(user)


@app.get("/users/{user_id}/pantry")
async def get_pantry(user_id: str):
    items = await get_db().pantry_items.find({"user_id": user_id}).sort("expires_at", 1).to_list(500)
    return clean(items)


@app.get("/users/{user_id}/pantry/food-groups")
async def pantry_food_groups(user_id: str):
    db = get_db()
    if not await db.users.find_one({"_id": oid(user_id)}):
        raise HTTPException(404, "User not found")
    pantry = await _user_pantry(db, user_id)
    products = await db.products.find().to_list(500)
    return analyze_pantry_food_groups(pantry, products, user_id=user_id)


@app.post("/users/{user_id}/pantry", status_code=201)
async def add_pantry_item(user_id: str, item: PantryItemIn):
    db = get_db()
    if not await db.users.find_one({"_id": oid(user_id)}):
        raise HTTPException(404, "User not found")
    doc = item.model_dump() | {"user_id": user_id, "added_at": datetime.now(timezone.utc)}
    res = await db.pantry_items.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@app.delete("/users/{user_id}/pantry/{item_id}")
async def delete_pantry_item(user_id: str, item_id: str):
    db = get_db()
    if not await db.users.find_one({"_id": oid(user_id)}):
        raise HTTPException(404, "User not found")
    result = await db.pantry_items.delete_one({"_id": oid(item_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Pantry item not found")
    return {"deleted": True, "item_id": item_id}


@app.get("/users/{user_id}/savings")
async def get_savings(user_id: str):
    pipeline = [{"$match": {"user_id": user_id}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]
    rows = await get_db().savings_ledger.aggregate(pipeline).to_list(1)
    total = rows[0]["total"] if rows else 0
    count = rows[0]["count"] if rows else 0
    return {"user_id": user_id, "total_saved": round(total, 2), "entries": count}


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # Mongo returns naive UTC


async def _user_pantry(db, user_id: str):
    return await db.pantry_items.find({"user_id": user_id}).sort("expires_at", 1).to_list(500)


async def _week_spent(db, user_id: str) -> float:
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    carts = await db.carts.find({"user_id": user_id, "created_at": {"$gte": week_ago}}).to_list(200)
    return sum(c.get("total", 0) for c in carts)

class ConvinceIn(BaseModel):
    user_id: str
    product_id: str | None = None
    barcode: str | None = None
    query: str | None = None
    log: bool = True
    live: bool = True  # use real QFC prices for query searches


@app.post("/convince-me")
async def convince_me(body: ConvinceIn, log: bool | None = None):
    """Set log=false (body or ?log=false) for rehearsals: nothing written to decisions/savings_ledger."""
    do_log = body.log if log is None else log
    db = get_db()
    user = await db.users.find_one({"_id": oid(body.user_id)})
    if not user:
        raise HTTPException(404, "User not found")

    product, alternatives, live = None, None, False
    if body.query and body.live:
        results = await kroger.search(body.query, 10, user.get("zip"))
        if results:
            items = [kroger.to_engine(r) for r in results]
            generic = body.query.split()[-1]  # e.g. "greek gods yogurt" -> "yogurt"
            more = await kroger.search(generic, 20, user.get("zip")) if generic.lower() != body.query.lower() else None
            seen = {i["_id"] for i in items}
            items += [kroger.to_engine(r) for r in (more or []) if r["upc"] not in seen]
            items = [i | {"category": generic.lower()} for i in items]
            product, alternatives, live = items[0], items, True

    if not product:
        if body.product_id:
            product = await db.products.find_one({"_id": oid(body.product_id)})
        elif body.barcode:
            product = await db.products.find_one({"barcode": body.barcode})
        elif body.query:
            product = await db.products.find_one({"name": {"$regex": re.escape(body.query), "$options": "i"}})
        else:
            raise HTTPException(400, "Provide product_id, barcode or query")
        if not product:
            raise HTTPException(404, "Product not found")
        alternatives = await db.products.find({"category": product.get("category")}).to_list(200)

    pantry = await db.pantry_items.find({"user_id": body.user_id}).to_list(500)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    carts = await db.carts.find({"user_id": body.user_id, "created_at": {"$gte": week_ago}}).to_list(200)
    week_spent = sum(c.get("total", 0) for c in carts)

    facts = analyze(product, user, pantry, alternatives, week_spent)
    facts["sample_data"] = not live
    facts["price_source"] = "Live QFC prices (Kroger API)" if live else "Seeded sample prices"
    soon = datetime.now(timezone.utc) + timedelta(days=3)
    facts["expiring_soon"] = [
        {"name": i["name"], "days": max(0, (_aware(i["expires_at"]) - datetime.now(timezone.utc)).days)}
        for i in pantry if i.get("expires_at") and _aware(i["expires_at"]) <= soon]
    result = await explain(facts)
    if live:
        result["data_sources"] = ["Live QFC prices (Kroger API)", "Kroger nutrition labels"] + result["data_sources"][2:]
    now = datetime.now(timezone.utc)
    if not do_log:
        return clean(result | {"engine": facts, "logged": False})
    await db.decisions.insert_one({"user_id": body.user_id, "product_id": product["_id"],
                                   "result": result, "engine": facts, "created_at": now})
    if result["verdict"] == "Swap" and result["savings"] > 0:
        await db.savings_ledger.insert_one({"user_id": body.user_id, "amount": result["savings"],
                                            "product": product["name"],
                                            "alternative": result["better_alternative"]["name"], "created_at": now})
    return clean(result | {"engine": facts, "logged": True})


class AgentMessageIn(BaseModel):
    space_id: str
    sender: str
    text: str | None = None
    image_base64: str | None = None
    image_mime_type: str | None = None
    message_id: str | None = None
    space_type: str | None = None


class ReceiptFixtureIn(BaseModel):
    """Debug receipt flow without Perceptron (curl / tests)."""
    ocr: dict
    space_id: str = "debug"


@app.post("/users/{user_id}/pantry/receipt", status_code=200)
async def receipt_fixture(user_id: str, body: ReceiptFixtureIn):
    db = get_db()
    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        raise HTTPException(404, "User not found")
    products = await db.products.find({}).to_list(500)
    lines = match_ocr_lines(body.ocr, products)
    session = new_session(user_id, body.space_id, body.ocr, lines)
    reply, source = await start_confirm_reply(session)
    await db.receipt_sessions.replace_one(
        {"user_id": user_id, "space_id": body.space_id},
        session,
        upsert=True,
    )
    return {"reply": reply, "source": source, "lines": lines, "receipt_state": session["state"]}


async def _user_by_phone(db, sender: str):
    return await db.users.find_one({"phone": sender})


async def _household_for_space(db, space_id: str, sender: str, user):
    """One household per Photon space. Never reuse another chat's household."""
    now = datetime.now(timezone.utc)
    household = await db.households.find_one({"space_id": space_id})
    uid = str(user["_id"]) if user else None
    if not household:
        doc = {
            "space_id": space_id,
            "members": [uid] if uid else [],
            "phones": [sender] if sender else [],
            "created_at": now,
        }
        res = await db.households.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc
    add = {}
    phones = [str(p) for p in household.get("phones") or []]
    members = [str(m) for m in household.get("members") or []]
    if sender and sender not in phones:
        add["phones"] = sender
    if uid and uid not in members:
        add["members"] = uid
    if add:
        await db.households.update_one({"_id": household["_id"]}, {"$addToSet": add})
        if "phones" in add:
            household.setdefault("phones", []).append(sender)
        if "members" in add:
            household.setdefault("members", []).append(uid)
    return household


async def _replace_group_pantry(db, space_id: str, household_id: str, items: list, now):
    await db.group_pantry_items.delete_many({"space_id": space_id})
    docs = []
    for item in items or []:
        doc = {k: v for k, v in item.items() if k != "_id"}
        doc["space_id"] = space_id
        doc["household_id"] = household_id
        doc.setdefault("unit", "item")
        doc.setdefault("quantity", 1)
        doc.setdefault("added_at", now)
        docs.append(doc)
    if docs:
        await db.group_pantry_items.insert_many(docs)


def _group_cart_from(doc, space_id: str, household_id: str):
    if not doc:
        return {"items": [], "skipped": []}, {
            "space_id": space_id, "household_id": household_id, "items": [], "skipped": []}
    return {"items": list(doc.get("items") or []), "skipped": list(doc.get("skipped") or [])}, doc


async def _save_group_cart(db, space_id: str, household_id: str, cart: dict, now):
    await db.group_carts.update_one(
        {"space_id": space_id},
        {"$set": {"space_id": space_id, "household_id": household_id,
                  "items": cart.get("items") or [], "skipped": cart.get("skipped") or [],
                  "updated_at": now}},
        upsert=True)


@app.post("/agent/message")
async def agent_message(body: AgentMessageIn):
    db = get_db()
    user = await _user_by_phone(db, body.sender)
    uid = str(user["_id"]) if user else None
    actor = uid or body.sender
    user_name = (user or {}).get("name") or body.sender or "Roommate"
    household = await _household_for_space(db, body.space_id, body.sender, user)
    hid = str(household["_id"])
    products = await db.products.find({}).to_list(500)
    pantry = await db.group_pantry_items.find({"space_id": body.space_id}).to_list(500)
    cart, _cart_doc = _group_cart_from(
        await db.group_carts.find_one({"space_id": body.space_id}), body.space_id, hid)
    week_spent = await _week_spent(db, uid) if uid else 0.0
    member_ids = [str(m) for m in household.get("members") or []]
    member_oids = []
    for mid in member_ids:
        try:
            member_oids.append(oid(mid))
        except HTTPException:
            continue
    members = await db.users.find({"_id": {"$in": member_oids}}).to_list(20) if member_oids else []
    names = {str(m["_id"]): m.get("name", str(m["_id"])) for m in members}
    names.setdefault(actor, user_name)
    receipt_out = await handle_receipt(
        db,
        user=user,
        user_id=uid,
        space_id=body.space_id,
        text=body.text,
        image_base64=body.image_base64,
        image_mime_type=body.image_mime_type,
        products=products,
        pantry=pantry,
        week_spent=week_spent,
        personal_list=None,
        scope="group",
        household_id=hid,
        added_by=actor,
        group_cart=cart,
    )
    if receipt_out:
        receipt_out.pop("_personal_list", None)
        saved_cart = receipt_out.pop("_group_cart", None)
        if saved_cart is not None:
            await _save_group_cart(db, body.space_id, hid, saved_cart, datetime.now(timezone.utc))
        return clean(receipt_out | {
            "logged": True, "space_id": body.space_id, "user_id": uid, "household_id": hid})

    if not (body.text or "").strip() and not body.image_base64:
        return clean({"reply": None, "ignored": True, "source": "engine",
                      "space_id": body.space_id, "user_id": uid, "household_id": hid})

    ctx = CartContext(products=products, pantry=pantry, cart=cart,
                      user_id=actor, user_name=user_name, names=names)
    result = await handle_agent(body.text or "", ctx)
    if not result.get("ignored"):
        now = datetime.now(timezone.utc)
        await _save_group_cart(db, body.space_id, hid, ctx.cart, now)
        await _replace_group_pantry(db, body.space_id, hid, ctx.pantry, now)
    return clean(result | {"logged": not result.get("ignored"), "space_id": body.space_id,
                           "user_id": uid, "household_id": hid})


@app.post("/agent/personal")
async def agent_personal(body: AgentMessageIn):
    db = get_db()
    user = await _user_by_phone(db, body.sender)
    if not user:
        return {
            "reply": "I don't recognize this number yet — ask your household admin to link your phone in Cartwise.",
            "list": {"items": [], "skipped": [], "total": 0, "count": 0},
            "source": "engine",
            "ignored": False,
            "logged": False,
            "space_id": body.space_id,
            "user_id": None,
        }
    uid = str(user["_id"])
    pantry = await _user_pantry(db, uid)
    week_spent = await _week_spent(db, uid)
    products = await db.products.find({}).to_list(500)
    list_doc = await db.personal_lists.find_one({"user_id": uid}) or {"user_id": uid, "items": [], "skipped": []}
    personal_list = {"items": list(list_doc.get("items") or []), "skipped": list(list_doc.get("skipped") or [])}
    receipt_out = await handle_receipt(
        db,
        user=user,
        user_id=uid,
        space_id=body.space_id,
        text=body.text,
        image_base64=body.image_base64,
        image_mime_type=body.image_mime_type,
        products=products,
        pantry=pantry,
        week_spent=week_spent,
        personal_list=personal_list,
        scope="user",
    )
    if receipt_out:
        plist = receipt_out.pop("_personal_list", None)
        if plist is not None:
            now = datetime.now(timezone.utc)
            await db.personal_lists.update_one(
                {"user_id": uid},
                {"$set": {"user_id": uid, "items": plist.get("items") or [],
                          "skipped": plist.get("skipped") or [], "updated_at": now}},
                upsert=True,
            )
        return clean(receipt_out | {"logged": True, "space_id": body.space_id, "user_id": uid})

    if not (body.text or "").strip() and not body.image_base64:
        return clean({
            "reply": None,
            "list": cart_summary(personal_list),
            "source": "engine",
            "ignored": True,
            "logged": False,
            "space_id": body.space_id,
            "user_id": uid,
        })

    ctx = PersonalContext(
        products=products,
        pantry=pantry,
        personal_list=personal_list,
        user=user,
        user_id=uid,
        user_name=user.get("name", "Friend"),
        week_spent=week_spent,
    )
    result = await handle_personal(body.text or "", ctx)
    if not result.get("ignored"):
        now = datetime.now(timezone.utc)
        await db.personal_lists.update_one(
            {"user_id": uid},
            {"$set": {"user_id": uid,
                      "items": ctx.list.get("items") or [],
                      "skipped": ctx.list.get("skipped") or [],
                      "updated_at": now}},
            upsert=True)
    return clean(result | {"logged": not result.get("ignored"), "space_id": body.space_id, "user_id": uid})


@app.get("/users/{user_id}/list")
async def get_personal_list(user_id: str):
    db = get_db()
    if not await db.users.find_one({"_id": oid(user_id)}):
        raise HTTPException(404, "User not found")
    doc = await db.personal_lists.find_one({"user_id": user_id})
    if not doc:
        return {"user_id": user_id, "items": [], "skipped": [], "total": 0, "count": 0}
    return clean(cart_summary(doc) | {"user_id": user_id})


@app.get("/households/{household_id}/cart")
async def get_household_cart(household_id: str):
    db = get_db()
    household = await db.households.find_one({"_id": oid(household_id)})
    if not household:
        raise HTTPException(404, "Household not found")
    hid = str(household["_id"])
    cart = await db.group_carts.find_one({"household_id": hid})
    if not cart and household.get("space_id"):
        cart = await db.group_carts.find_one({"space_id": household["space_id"]})
    if not cart:
        return {"household_id": hid, "space_id": household.get("space_id"),
                "items": [], "skipped": [], "total": 0, "count": 0}
    return clean(cart_summary(cart) | {"household_id": hid, "space_id": cart.get("space_id")})


@app.get("/households/{household_id}/pantry")
async def get_household_pantry(household_id: str):
    db = get_db()
    household = await db.households.find_one({"_id": oid(household_id)})
    if not household:
        raise HTTPException(404, "Household not found")
    hid = str(household["_id"])
    items = await db.group_pantry_items.find({"household_id": hid}).sort("expires_at", 1).to_list(500)
    return clean(items)