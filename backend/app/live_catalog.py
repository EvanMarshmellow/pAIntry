"""Real Kroger prices for the seeded catalog, at the user's 3 nearest stores.

The iMessage bot matches messages against the seeded `products` (stable ids/names),
but every price it sees is swapped for the live Kroger shelf price at the user's
nearest stores. Results are cached per ZIP in the `live_prices` collection and
refreshed in the background, so replies stay fast.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from app import kroger

MAX_AGE = timedelta(hours=12)
SEED_STORES = ["Store A", "Store B", "Store C"]
_refreshing = set()  # zips currently refreshing


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def refresh(db, zip_code):
    """Look up every seeded product at Kroger for this ZIP and cache the prices."""
    zip_code = zip_code or kroger.DEFAULT_ZIP
    if zip_code in _refreshing:
        return
    _refreshing.add(zip_code)
    try:
        products = await db.products.find({}, {"name": 1}).to_list(500)
        sem = asyncio.Semaphore(4)

        async def one(p):
            async with sem:
                results = await kroger.search(p["name"], 3, zip_code)
            match = next((r for r in results or [] if r.get("prices")), None)
            if not match:
                return
            await db.live_prices.replace_one(
                {"zip": zip_code, "product_id": str(p["_id"])},
                {"zip": zip_code, "product_id": str(p["_id"]), "prices": match["prices"],
                 "kroger_name": match.get("name"), "upc": match.get("upc"),
                 "updated_at": datetime.now(timezone.utc)},
                upsert=True)

        await asyncio.gather(*(one(p) for p in products), return_exceptions=True)
    finally:
        _refreshing.discard(zip_code)


def _start_refresh(db, zip_code):
    if (zip_code or kroger.DEFAULT_ZIP) not in _refreshing:
        asyncio.create_task(refresh(db, zip_code))


async def apply(db, products, zip_code):
    """Return products with live prices where cached; fall back to seeded prices renamed to real stores."""
    zip_code = zip_code or kroger.DEFAULT_ZIP
    cached = await db.live_prices.find({"zip": zip_code}).to_list(1000)
    live = {c["product_id"]: c for c in cached}
    newest = max((_aware(c["updated_at"]) for c in cached), default=None)
    if newest is None or datetime.now(timezone.utc) - newest > MAX_AGE:
        _start_refresh(db, zip_code)

    nearby = await kroger.nearby_stores(zip_code)
    names = list(nearby.keys()) if nearby else []
    rename = {old: names[i] for i, old in enumerate(SEED_STORES) if i < len(names)}

    out = []
    for p in products:
        hit = live.get(str(p["_id"]))
        if hit:
            out.append(p | {"prices": hit["prices"], "kroger_name": hit.get("kroger_name"),
                            "sample_data": False, "price_source": "kroger"})
        else:
            prices = p.get("prices") or {}
            out.append(p | {"prices": {rename.get(k, k): v for k, v in prices.items()}})
    return out
