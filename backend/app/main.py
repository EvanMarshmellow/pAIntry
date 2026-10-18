from contextlib import asynccontextmanager
import re
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import kroger
from app.db import close, connect, get_db
from app.engine import analyze
from app.grok import explain


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    yield
    await close()


app = FastAPI(title="Grocery Assistant API", lifespan=lifespan)
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
async def live_prices(q: str, limit: int = 5):
    """Real prices from 3 QFC stores (Kroger API). 503 if Kroger is unavailable."""
    results = await kroger.search(q, limit)
    if results is None:
        raise HTTPException(503, "Kroger unavailable, using sample data")
    return results


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


@app.post("/users/{user_id}/pantry", status_code=201)
async def add_pantry_item(user_id: str, item: PantryItemIn):
    doc = item.model_dump() | {"user_id": user_id, "added_at": datetime.now(timezone.utc)}
    res = await get_db().pantry_items.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


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
        results = await kroger.search(body.query, 10)
        if results:
            items = [kroger.to_engine(r) for r in results]
            generic = body.query.split()[-1]  # e.g. "greek gods yogurt" -> "yogurt"
            more = await kroger.search(generic, 20) if generic.lower() != body.query.lower() else None
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