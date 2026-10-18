"""Deterministic Convince Me math. No LLM here: every number comes from this file."""
import re


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


# --- Group cart (name match only; do not use in_pantry, which also matches category) ---


def empty_group_cart():
    return {"items": [], "skipped": []}


def _pid(product):
    return str(product.get("_id", product.get("name")))


def _word_in(query, name):
    return bool(re.search(rf"(?:^|[^a-z0-9]){re.escape(query)}(?:[^a-z0-9]|$)", name))


def resolve_product(query, products, pantry=None):
    """Best catalog match for a grocery phrase. Prefer a pantry hit so 'add milk' skips Whole Milk."""
    q = (query or "").strip().lower()
    if not q:
        return None
    scored = []
    for p in products:
        name = (p.get("name") or "").lower()
        if not name:
            continue
        if name == q:
            rank = 0
        elif _word_in(q, name):
            rank = 1
        elif q in name or name in q:
            rank = 2
        else:
            continue
        scored.append((rank, len(name), name, p))
    if not scored:
        return None
    scored.sort(key=lambda row: (row[0], row[1], row[2]))
    if pantry:
        hits = [p for _, _, _, p in scored if pantry_name_match(p, pantry)]
        if hits:
            return hits[0]
    return scored[0][3]


def pantry_name_match(product, pantry):
    """True when pantry and product names overlap. Does not compare category."""
    name = (product.get("name") or "").lower()
    if not name:
        return None
    for item in pantry or []:
        iname = (item.get("name") or "").lower()
        if iname and (iname in name or name in iname):
            return item["name"]
    return None


def add_to_group_cart(cart, product, user_id, pantry):
    """Skip pantry hits, merge the same product_id, otherwise append cheapest store/price."""
    out = {
        "items": [dict(line) for line in (cart or {}).get("items") or []],
        "skipped": list((cart or {}).get("skipped") or []),
    }
    for line in out["items"]:
        line["requesters"] = list(line.get("requesters") or [])
    have = pantry_name_match(product, pantry)
    name = product["name"]
    if have:
        out["skipped"].append({"name": name, "pantry_name": have, "requester": user_id})
        return out, {"action": "skipped", "product": name, "pantry_name": have}
    pid = _pid(product)
    for line in out["items"]:
        if str(line.get("product_id")) == pid:
            if user_id not in line["requesters"]:
                line["requesters"].append(user_id)
            return out, {"action": "merged", "product": name, "name": name,
                         "product_id": pid, "requesters": list(line["requesters"]),
                         "store": line.get("store"), "price": line.get("price")}
    store, price = cheapest(product)
    line = {"product_id": pid, "name": name, "quantity": 1,
            "requesters": [user_id], "store": store, "price": price}
    out["items"].append(line)
    return out, {"action": "added", **line}


def cart_summary(cart):
    items = list((cart or {}).get("items") or [])
    total = round(sum((line.get("price") or 0) for line in items), 2)
    return {"items": items, "skipped": list((cart or {}).get("skipped") or []),
            "total": total, "count": len(items)}


# --- Group pantry (one list per iMessage group; never a user's pantry_items) ---


def _copy_pantry(items):
    return [dict(item) for item in items or []]


def _names_overlap(a, b):
    left = (a or "").strip().lower()
    right = (b or "").strip().lower()
    if not left or not right:
        return False
    return left == right or left in right or right in left


def _find_pantry_index(items, query):
    for i, item in enumerate(items or []):
        if _names_overlap(query, item.get("name")):
            return i
    return None


def add_group_pantry_item(items, name, quantity=1, unit="item", product_id=None, added_by=None):
    """Name overlap increments quantity. Otherwise append a new line."""
    out = _copy_pantry(items)
    idx = _find_pantry_index(out, name)
    if idx is not None:
        line = out[idx]
        line["quantity"] = float(line.get("quantity") or 0) + float(quantity)
        return out, {"action": "quantity", "name": line.get("name"), "quantity": line["quantity"],
                     "unit": line.get("unit") or unit or "item", "product_id": line.get("product_id"),
                     "added_by": line.get("added_by")}
    line = {"name": name, "quantity": float(quantity), "unit": unit or "item"}
    if product_id:
        line["product_id"] = str(product_id)
    if added_by:
        line["added_by"] = added_by
    out.append(line)
    return out, {"action": "added", **line}


def remove_group_pantry_item(items, query):
    out = _copy_pantry(items)
    idx = _find_pantry_index(out, query)
    if idx is None:
        return out, {"action": "not_found", "query": query}
    removed = out.pop(idx)
    return out, {"action": "removed", "name": removed.get("name"), "query": query}


def set_group_pantry_quantity(items, query, quantity):
    """Set quantity. Quantity <= 0 deletes the line."""
    out = _copy_pantry(items)
    idx = _find_pantry_index(out, query)
    if idx is None:
        return out, {"action": "not_found", "query": query}
    if float(quantity) <= 0:
        removed = out.pop(idx)
        return out, {"action": "removed", "name": removed.get("name"), "quantity": 0, "query": query}
    out[idx]["quantity"] = float(quantity)
    return out, {"action": "updated", "name": out[idx].get("name"), "quantity": out[idx]["quantity"],
                 "query": query}


def move_cart_line_to_group_pantry(cart, items, query, added_by):
    """Move a group-cart line into the group pantry. No cart match still adds the query."""
    out_cart = {
        "items": [dict(line) for line in (cart or {}).get("items") or []],
        "skipped": list((cart or {}).get("skipped") or []),
    }
    for line in out_cart["items"]:
        line["requesters"] = list(line.get("requesters") or [])
    matched = None
    kept = []
    for line in out_cart["items"]:
        if matched is None and _names_overlap(query, line.get("name")):
            matched = line
            qty = int(line.get("quantity") or 1)
            if qty > 1:
                line["quantity"] = qty - 1
                kept.append(line)
        else:
            kept.append(line)
    out_cart["items"] = kept
    if matched:
        pantry, result = add_group_pantry_item(
            items, matched.get("name") or query, quantity=1,
            unit=matched.get("unit") or "item", product_id=matched.get("product_id"),
            added_by=added_by)
        result = {**result, "from_cart": True}
    else:
        pantry, result = add_group_pantry_item(items, (query or "").strip(), quantity=1, added_by=added_by)
        result = {**result, "from_cart": False}
    return out_cart, pantry, result


# --- Personal list (solo DM; no requesters / household merge) ---


def empty_personal_list():
    return {"items": [], "skipped": []}


def add_to_personal_list(cart, product, pantry):
    """Skip pantry hits; duplicate product_id bumps quantity."""
    out = {
        "items": [dict(line) for line in (cart or {}).get("items") or []],
        "skipped": list((cart or {}).get("skipped") or []),
    }
    have = pantry_name_match(product, pantry)
    name = product["name"]
    if have:
        out["skipped"].append({"name": name, "pantry_name": have})
        return out, {"action": "skipped", "product": name, "pantry_name": have}
    pid = _pid(product)
    for line in out["items"]:
        if str(line.get("product_id")) == pid:
            line["quantity"] = int(line.get("quantity") or 1) + 1
            return out, {"action": "quantity", "name": name, "product_id": pid,
                         "quantity": line["quantity"], "store": line.get("store"), "price": line.get("price")}
    store, price = cheapest(product)
    line = {"product_id": pid, "name": name, "quantity": 1, "store": store, "price": price}
    out["items"].append(line)
    return out, {"action": "added", **line}


def remove_from_personal_list(cart, product_id):
    out = {
        "items": [dict(line) for line in (cart or {}).get("items") or []],
        "skipped": list((cart or {}).get("skipped") or []),
    }
    pid = str(product_id)
    removed_name = None
    kept = []
    for line in out["items"]:
        if str(line.get("product_id")) == pid:
            removed_name = line.get("name")
        else:
            kept.append(line)
    if removed_name is None:
        return out, {"action": "not_found", "product_id": pid}
    out["items"] = kept
    return out, {"action": "removed", "name": removed_name, "product_id": pid}


# --- Pantry food-group mix (classic pyramid, calorie-based %) ---

FOOD_GROUPS = ("grains", "vegetables", "fruits", "proteins_dairy", "sweets_fats")

# Classic food pyramid targets (sum to 100%).
PYRAMID_TARGET_PCT = {
    "grains": 30,
    "vegetables": 25,
    "fruits": 20,
    "proteins_dairy": 15,
    "sweets_fats": 10,
}

PYRAMID_LABELS = {
    "grains": "Grains",
    "vegetables": "Vegetables",
    "fruits": "Fruit",
    "proteins_dairy": "Protein & Dairy",
    "sweets_fats": "Fat & Sweet",
}

PYRAMID_STATUS_BAND = 5  # percentage points above/below target → high/low

SERVING_G = {
    "vegetables": 85,
    "fruits": 120,
    "grains": 30,
    "proteins_dairy": 85,
    "sweets_fats": 15,
}

_PACKAGE_UNITS = frozenset({"bag", "tub", "jug", "can", "block", "item", "bar"})

_FRUIT_KW = (
    "banana", "apple", "berry", "blueberr", "strawberr", "raspberr", "grape", "orange", "juice",
    "mango", "peach", "pear", "melon", "pineapple", "avocado",
)
_VEG_KW = (
    "spinach", "broccoli", "carrot", "onion", "marinara", "tomato", "lettuce", "kale", "pepper",
    "celery", "cucumber", "zucchini", "squash", "vegetable", "salad", "edamame",
)
_SWEETS_FATS_KW = (
    "almond butter", "sunflower seed butter", "seed butter", "nut butter", "frosted", "cookie dough",
    "margarine", "mayo", "shortening", "olive oil", "vegetable oil", "canola oil",
)
_PROTEIN_DAIRY_KW = (
    "black bean", "chickpea", "lentil", "bean", "tuna", "chicken", "salmon", "turkey", "beef",
    "egg", "milk", "yogurt", "cheese", "tofu", "hummus", "protein bar", "whey", "almond", "nut",
    "edamame", "fish", "pork", "ham", "sausage", "cottage",
)
_GRAIN_KW = (
    "rice", "pasta", "oat", "bread", "tortilla", "granola", "cereal", "wheat", "spaghetti",
    "quinoa", "barley", "couscous", "cracker", "bagel", "muffin",
)


def _contains_any(text, keywords):
    t = (text or "").lower()
    return any(k in t for k in keywords)


def pantry_food_group(product=None, *, name=None, category=None):
    """Map a catalog product or plain name to one of FOOD_GROUPS (or None to exclude)."""
    if product:
        name = product.get("name") or name or ""
        category = product.get("category") or category
    name = name or ""
    cat = (category or "").lower()
    nut = (product or {}).get("nutrition_per_serving") or {}

    if _contains_any(name, ("protein bar", "whey protein", "whey")):
        return "proteins_dairy"
    if _contains_any(name, _SWEETS_FATS_KW):
        return "sweets_fats"
    if _contains_any(name, _FRUIT_KW):
        if "juice" in name.lower() and "vegetable" in name.lower():
            pass
        else:
            return "fruits"
    if _contains_any(name, _VEG_KW):
        return "vegetables"
    if _contains_any(name, _PROTEIN_DAIRY_KW):
        return "proteins_dairy"
    if _contains_any(name, _GRAIN_KW):
        return "grains"

    if cat == "produce":
        return "vegetables"
    if cat in ("meat_seafood", "protein_alt", "dairy_eggs"):
        return "proteins_dairy"
    if cat in ("bakery", "breakfast"):
        if float(nut.get("sugar_g") or 0) >= 8 or "frosted" in name.lower():
            return "sweets_fats"
        return "grains"
    if cat == "pantry":
        if _contains_any(name, _GRAIN_KW) or float(nut.get("carbs_g") or 0) >= 25:
            return "grains"
        if float(nut.get("protein_g") or 0) >= 6:
            return "proteins_dairy"
        if float(nut.get("sugar_g") or 0) >= 8 or float(nut.get("fat_g") or 0) >= 10:
            return "sweets_fats"
        return "grains"
    if cat == "snacks":
        if float(nut.get("protein_g") or 0) >= 10 or _contains_any(name, ("hummus", "almond", "nut")):
            return "proteins_dairy"
        return "sweets_fats"
    if cat == "beverages":
        if "juice" in name.lower():
            return "fruits"
        if "milk" in name.lower():
            return "proteins_dairy"
        return None
    if cat == "frozen":
        if _contains_any(name, _FRUIT_KW):
            return "fruits"
        return "vegetables"
    return None


def _count_item_grams(name):
    n = (name or "").lower()
    if "egg" in n:
        return 50.0
    if "banana" in n:
        return 118.0
    if "avocado" in n:
        return 150.0
    if "tortilla" in n:
        return 45.0
    if "bar" in n and "protein" in n:
        return 60.0
    return 100.0


def package_grams(product):
    """Estimated edible mass for one retail unit of a catalog product."""
    if not product:
        return 0.0
    size = float(product.get("size") or 1)
    unit = (product.get("unit") or "item").lower()
    name = product.get("name") or ""
    if unit == "oz":
        return size * 28.3495
    if unit == "lb":
        return size * 453.592
    if unit == "fl oz":
        return size * 30.0
    if unit == "count":
        return size * _count_item_grams(name)
    return size * 28.3495


def _pantry_to_grams_direct(pantry_item):
    """Fallback mass when there is no catalog match."""
    qty = float(pantry_item.get("quantity") or 1)
    unit = (pantry_item.get("unit") or "item").lower()
    name = pantry_item.get("name") or ""
    if unit == "lb":
        return qty * 453.592
    if unit == "oz":
        return qty * 28.3495
    if unit == "count":
        return qty * _count_item_grams(name)
    if unit in _PACKAGE_UNITS:
        return qty * 150.0
    return qty * 100.0


def pantry_edible_grams(pantry_item, product=None):
    """Estimated edible grams on hand for one pantry line."""
    qty = float(pantry_item.get("quantity") or 1)
    punit = (pantry_item.get("unit") or "item").lower()
    if not product:
        return _pantry_to_grams_direct(pantry_item)

    pkg = package_grams(product)
    if pkg <= 0:
        return _pantry_to_grams_direct(pantry_item)

    prod_unit = (product.get("unit") or "item").lower()
    prod_size = float(product.get("size") or 1)
    pname = (product.get("name") or "").lower()

    if punit == "count" and prod_unit == "lb" and "banana" in pname:
        return qty * _count_item_grams("banana")
    if punit == "count" and prod_unit == "count":
        return pkg * min(qty / prod_size, 1.0) if prod_size else qty * _count_item_grams(pname)
    if punit == "lb" and prod_unit == "lb":
        return pkg * (qty / prod_size) if prod_size else qty * 453.592
    if punit in _PACKAGE_UNITS or prod_unit in _PACKAGE_UNITS:
        return pkg * qty
    if punit == prod_unit:
        return pkg * (qty / prod_size) if prod_size else pkg * qty
    return pkg * qty


def _product_for_pantry_item(item, products):
    pid = item.get("product_id")
    if pid:
        for p in products:
            if str(p.get("_id")) == str(pid):
                return p
    return resolve_product(item.get("name", ""), products, pantry=None)


def _pct(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


def _group_status_pyramid(group, pct_calories):
    target = PYRAMID_TARGET_PCT.get(group, 0)
    band = PYRAMID_STATUS_BAND
    if pct_calories < target - band:
        return "low"
    if pct_calories > target + band:
        return "high"
    return "ok"


def _pyramid_hints(groups_out):
    hints = []
    for g in FOOD_GROUPS:
        row = groups_out[g]
        delta = round(row["pct_calories"] - row["target_pct"], 1)
        label = PYRAMID_LABELS[g]
        if row["status"] == "low":
            hints.append(f"{label} is {abs(delta):.0f} pts below the {row['target_pct']}% pyramid target.")
        elif row["status"] == "high":
            hints.append(f"{label} is {delta:.0f} pts above the {row['target_pct']}% pyramid target.")
    return hints[:4]


def analyze_pantry_food_groups(pantry, products, user_id=None):
    totals_g = {g: 0.0 for g in FOOD_GROUPS}
    totals_serv = {g: 0.0 for g in FOOD_GROUPS}
    totals_cal = {g: 0.0 for g in FOOD_GROUPS}
    lines = []
    unclassified_grams = 0.0

    for item in pantry or []:
        product = _product_for_pantry_item(item, products)
        matched = product is not None
        group = pantry_food_group(product) if product else pantry_food_group(name=item.get("name"))
        grams = pantry_edible_grams(item, product)
        if not group:
            unclassified_grams += grams
            lines.append({
                "name": item.get("name"),
                "group": None,
                "grams_on_hand": round(grams, 1),
                "matched_product": matched,
            })
            continue

        totals_g[group] += grams
        totals_serv[group] += grams / SERVING_G[group]

        cal = 0.0
        if product:
            pkg = package_grams(product)
            nut = product.get("nutrition_per_serving") or {}
            cal_per = float(nut.get("calories") or 0)
            if pkg > 0 and cal_per:
                spp = max(1, round(pkg / SERVING_G[group]))
                cal = (grams / pkg) * spp * cal_per
        elif grams:
            cal = grams * 1.5
        totals_cal[group] += cal

        lines.append({
            "name": item.get("name"),
            "group": group,
            "grams_on_hand": round(grams, 1),
            "matched_product": matched,
        })

    sum_serv = sum(totals_serv.values())
    sum_g = sum(totals_g.values())
    sum_cal = sum(totals_cal.values())

    groups_out = {}
    for g in FOOD_GROUPS:
        pct_s = _pct(totals_serv[g], sum_serv)
        pct_c = _pct(totals_cal[g], sum_cal)
        target = PYRAMID_TARGET_PCT[g]
        groups_out[g] = {
            "label": PYRAMID_LABELS[g],
            "target_pct": target,
            "pct": pct_c,
            "pct_calories": pct_c,
            "pct_servings": pct_s,
            "pct_grams": _pct(totals_g[g], sum_g),
            "delta_from_target": round(pct_c - target, 1),
            "calories_on_hand": round(totals_cal[g], 0),
            "grams_on_hand": round(totals_g[g], 1),
            "serving_equiv": round(totals_serv[g], 2),
            "status": "ok",
        }

    for g in FOOD_GROUPS:
        groups_out[g]["status"] = _group_status_pyramid(g, groups_out[g]["pct_calories"])

    produce_target = PYRAMID_TARGET_PCT["vegetables"] + PYRAMID_TARGET_PCT["fruits"]
    produce_actual = groups_out["vegetables"]["pct_calories"] + groups_out["fruits"]["pct_calories"]

    return {
        "user_id": user_id,
        "primary_metric": "calories",
        "pyramid_model": "classic",
        "pyramid_targets": dict(PYRAMID_TARGET_PCT),
        "groups": groups_out,
        "combined_produce_pct": round(produce_actual, 1),
        "combined_produce_target_pct": produce_target,
        "pantry_balance_hint": _pyramid_hints(groups_out),
        "lines": lines,
        "unclassified_grams": round(unclassified_grams, 1),
        "assumptions": [
            "Primary percentages are share of estimated pantry calories by food group.",
            "Calories scale from catalog nutrition_per_serving and estimated amount on hand.",
            "Targets follow the classic pyramid: grains 30%, vegetables 25%, fruit 20%, "
            "protein & dairy 15%, fat & sweet 10%.",
            "Pantry mix reflects what you have on hand, not daily intake.",
        ],
    }
