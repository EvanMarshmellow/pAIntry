"""Deterministic Convince Me math. No LLM here: every number comes from this file."""


def cheapest(product):
    prices = product.get("prices") or {}
    if not prices:
        return None, None
    store = min(prices, key=prices.get)
    return store, prices[store]


def protein_per_pkg(product):
    return (product.get("nutrition_per_serving") or {}).get("protein_g", 0) * product.get("servings", 1)


def cost_per_protein_g(product):
    _, price = cheapest(product)
    p = protein_per_pkg(product)
    return round(price / p, 4) if price and p else None


def allergy_conflicts(product, allergies):
    hay = " ".join(str(product.get(f, "")) for f in ("name", "brand", "ingredients", "allergens")).lower()
    return [a for a in allergies if a.lower() in hay or a.lower().rstrip("s") in hay]


def in_pantry(product, pantry):
    name = product["name"].lower()
    for item in pantry:
        iname = item.get("name", "").lower()
        if iname and (iname in name or name in iname or item.get("category") == product.get("category")):
            return item["name"]
    return None


def best_alternative(product, alternatives, allergies):
    _, price = cheapest(product)
    cpp = cost_per_protein_g(product)
    cands = [a for a in alternatives
             if a.get("_id") != product.get("_id") and a.get("category") == product.get("category")
             and not allergy_conflicts(a, allergies) and cheapest(a)[1] is not None
             and cheapest(a)[1] < (price or 0)]
    if not cands:
        return None
    protein_cands = [a for a in cands if cost_per_protein_g(a) and (cpp is None or cost_per_protein_g(a) <= cpp)]
    if protein_cands:
        return min(protein_cands, key=cost_per_protein_g)
    if cpp is None:  # product has no protein: plain cheapest same-category option
        return min(cands, key=lambda a: cheapest(a)[1])
    return None


def analyze(product, user, pantry, alternatives, week_spent=0.0):
    allergies = user.get("allergies", [])
    store, price = cheapest(product)
    budget = user.get("weekly_budget", 0)
    remaining = round(budget - week_spent, 2)
    conflicts = allergy_conflicts(product, allergies)
    have = in_pantry(product, pantry)
    alt = best_alternative(product, alternatives, allergies)
    alt_store, alt_price = cheapest(alt) if alt else (None, None)
    savings = round(price - alt_price, 2) if alt else 0.0

    facts = {
        "product": {"name": product["name"], "brand": product.get("brand"), "category": product.get("category"),
                    "cheapest_store": store, "price": price, "prices": product.get("prices"),
                    "protein_g_per_package": protein_per_pkg(product),
                    "cost_per_protein_g": cost_per_protein_g(product)},
        "allergy_conflicts": conflicts,
        "similar_in_pantry": have,
        "budget": {"weekly_budget": budget, "spent_this_week": round(week_spent, 2), "remaining": remaining,
                   "fits_budget": price is not None and price <= remaining},
        "goals": user.get("goals", {}),
        "alternative": None if not alt else {
            "name": alt["name"], "store": alt_store, "price": alt_price,
            "protein_g_per_package": protein_per_pkg(alt), "cost_per_protein_g": cost_per_protein_g(alt)},
        "savings": savings,
        "sample_data": True,
    }
    if conflicts:
        verdict, why = "Skip", f"Contains or may contain {', '.join(conflicts)}"
    elif have:
        verdict, why = "Skip", f"You already have {have} at home"
    elif alt and savings > 0:
        verdict, why = "Swap", f"{alt['name']} at {alt_store} saves ${savings:.2f}"
    elif not facts["budget"]["fits_budget"]:
        verdict, why = "Skip", "Over your remaining weekly budget"
    else:
        verdict, why = "Buy", "Good value and fits your budget"
    facts["draft_verdict"], facts["draft_reason"] = verdict, why
    return facts
