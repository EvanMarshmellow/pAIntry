"""Live grocery prices from the Kroger API, at the stores nearest the user's ZIP. Returns None on any problem."""
import base64
import os
import time

import httpx

API = "https://api.kroger.com/v1"
DEFAULT_ZIP = os.getenv("DEFAULT_ZIP", "98105")  # used when a user has no zip
_stores_cache = {}  # zip -> {store name: locationId}
_token = {"value": None, "exp": 0}


async def _get_token(http):
    if _token["value"] and time.time() < _token["exp"] - 60:
        return _token["value"]
    cid, secret = os.getenv("KROGER_CLIENT_ID"), os.getenv("KROGER_CLIENT_SECRET")
    if not cid or not secret:
        return None
    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = await http.post(f"{API}/connect/oauth2/token",
                        headers={"Authorization": f"Basic {auth}"},
                        data={"grant_type": "client_credentials", "scope": "product.compact"})
    r.raise_for_status()
    j = r.json()
    _token.update(value=j["access_token"], exp=time.time() + j.get("expires_in", 1800))
    return _token["value"]


def _protein_per_package(p):
    for n in p.get("nutritionInformation") or []:
        servings = (n.get("servingsPerPackage") or {}).get("value") or 1
        for nut in n.get("nutrients") or []:
            if nut.get("displayName") == "Protein" and nut.get("quantity") is not None:
                return round(nut["quantity"] * servings, 1)
    return None


def _shape(p, prices):
    """Same fields the engine uses for seeded products."""
    item = (p.get("items") or [{}])[0]
    protein = _protein_per_package(p)
    store = min(prices, key=prices.get) if prices else None
    price = prices.get(store) if store else None
    return {
        "name": p.get("description"),
        "brand": p.get("brand"),
        "category": (p.get("categories") or ["other"])[0].lower(),
        "upc": p.get("upc"),
        "size": item.get("size"),
        "prices": prices,
        "cheapest_store": store,
        "price": price,
        "protein_g_per_package": protein,
        "cost_per_protein_g": round(price / protein, 4) if price and protein else None,
        "allergens": [a["name"] for a in p.get("allergens") or []
                      if a.get("levelOfContainmentName") in ("Contains", "May contain")],
        "image": f"https://www.kroger.com/product/images/medium/front/{p.get('upc')}",
        "source": "kroger",
    }


def to_engine(p):
    """Kroger product -> the shape engine.py expects."""
    return p | {"_id": p["upc"], "servings": 1,
                "nutrition_per_serving": {"protein_g": p["protein_g_per_package"] or 0}}


async def _nearby(http, token, zip_code, count=3):
    """Nearest Kroger-family stores to a ZIP, as {"QFC University Village (2746 NE 45th St)": locationId}."""
    if zip_code in _stores_cache:
        return _stores_cache[zip_code]
    r = await http.get(f"{API}/locations", headers={"Authorization": f"Bearer {token}"},
                       params={"filter.zipCode.near": zip_code, "filter.limit": count})
    r.raise_for_status()
    stores = {}
    for loc in r.json().get("data", []):
        name = loc.get("name") or loc.get("chain") or "Store"
        street = (loc.get("address") or {}).get("addressLine1")
        stores[f"{name} ({street})" if street else name] = loc["locationId"]
    _stores_cache[zip_code] = stores
    return stores


async def nearby_stores(zip_code: str | None = None, count: int = 3):
    """Public helper: nearest stores for a ZIP, or None if Kroger is unavailable."""
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            token = await _get_token(http)
            return await _nearby(http, token, zip_code or DEFAULT_ZIP, count) if token else None
    except Exception:  # noqa: BLE001
        return None


async def search(term: str, limit: int = 5, zip_code: str | None = None):
    """Search the 3 stores nearest zip_code; return products with per-store prices, or None if Kroger is unavailable."""
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            token = await _get_token(http)
            if not token:
                return None
            stores = await _nearby(http, token, zip_code or DEFAULT_ZIP)
            if not stores:
                return None
            products = {}
            for store, loc in stores.items():
                r = await http.get(f"{API}/products", headers={"Authorization": f"Bearer {token}"},
                                   params={"filter.term": term, "filter.locationId": loc, "filter.limit": limit})
                r.raise_for_status()
                for p in r.json().get("data", []):
                    pr = ((p.get("items") or [{}])[0].get("price") or {})
                    price = pr.get("promo") or pr.get("regular")
                    entry = products.setdefault(p["productId"], {"raw": p, "prices": {}})
                    if price:
                        entry["prices"][store] = price
            return [_shape(e["raw"], e["prices"]) for e in products.values() if e["prices"]]
    except Exception:  # noqa: BLE001 - fall back to seeded data
        return None