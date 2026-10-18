"""Group-chat cart agent. Gemini writes the iMessage; tools mutate the cart via the engine."""
import json
import logging
import re

import httpx

from app import gemini
from app.engine import (
    add_group_pantry_item, add_live_product, cart_summary, cheapest,
    move_cart_line_to_group_pantry, remove_group_pantry_item, resolve_product,
    set_group_pantry_quantity, split_grocery_phrases,
)
from app.kroger import search_for_list

log = logging.getLogger("uvicorn.error")
SYSTEM = """You are Cartwise in a roommate iMessage group. This chat has a shared shopping list and a separate group pantry. Never read or change anyone's personal pantry.
Rules:
- Call tools to match products and change the list or the group pantry. Never invent a product_id, name, store, or price.
- "add", "need", and "put on the list" without pantry words go to the shopping list via resolve_product and add_cart_item.
- Pantry writes use add_pantry_item, set_pantry_quantity, remove_pantry_item, or move_to_pantry. Those tools only change this group's pantry.
- "move X to the pantry" or "we bought X" is move_to_pantry.
- "used", "finished", and "move X out" decrement quantity with set_pantry_quantity. Quantity 0 removes the line.
- "we have N X" or "move X to N" is set_pantry_quantity.
- Shopping-list resolve_product searches nearby Kroger stores. product_id is the UPC. Do not invent one.
- If resolve_product status is unavailable, say Kroger can't be reached and the item was not added.
- If resolve_product found is false, say it wasn't found at nearby Kroger stores and do not add it to the list. Pantry adds may still use the spoken name.
- If add_cart_item action is skipped, say it is already in the group pantry. Do not pretend it was added to the list.
- If action is merged, say it was already on the list and note this person too.
- Short iMessage, under 4 sentences. Say "group pantry" or "list" so the two stores are obvious. No medical advice.
Reply with ONLY JSON: {"reply":"your text"}"""
TOOLS = [
    {"type": "function", "function": {
        "name": "get_pantry",
        "description": "This iMessage group's pantry only. Not any member's personal pantry.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "resolve_product",
        "description": "Search nearby Kroger stores for a shopping-list phrase. Returns found, status, product_id (UPC), name, store, price.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "add_cart_item",
        "description": "Add a product_id returned by resolve_product to the group shopping list. Skips group-pantry matches. Not for pantry writes.",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
    {"type": "function", "function": {
        "name": "get_cart",
        "description": "Current group shopping list lines, requesters, prices, total, and group-pantry skips",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "add_pantry_item",
        "description": "Add a grocery phrase to this group's pantry. Name overlap increments quantity. Does not touch personal pantries.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}, "quantity": {"type": "number"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "set_pantry_quantity",
        "description": "Set quantity of a group pantry item. Quantity 0 or less removes it. Use this to decrement after used or finished.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}, "quantity": {"type": "number"}},
                       "required": ["query", "quantity"]},
    }},
    {"type": "function", "function": {
        "name": "remove_pantry_item",
        "description": "Remove a line from this group's pantry.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "move_to_pantry",
        "description": "Move a shopping-list line into the group pantry. If it is not on the list, add the phrase to the group pantry anyway.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
]
INTENT_RE = re.compile(
    r"@cartwise\b|\badd\b|\bneed\b|put on the list|what'?s on the (?:list|cart)|"
    r"show (?:the )?(?:list|cart)\b|\bon the list\b|"
    r"\bpantry\b|\bwe have\b|\bwe bought\b|\bused\b|\bfinished\b|\bmove\b",
    re.I,
)
LIST_RE = re.compile(
    r"what'?s on the (?:list|cart)|show (?:the )?(?:list|cart)|get (?:the )?(?:list|cart)",
    re.I,
)
PANTRY_RE = re.compile(
    r"\bpantry\b|\bwe have\b|\bwe bought\b|\bused\b|\bfinished\b|\bmove\b",
    re.I,
)
PANTRY_LIST_RE = re.compile(
    r"what'?s in (?:the )?pantry|show (?:the )?(?:group )?pantry|group pantry\b",
    re.I,
)


class CartContext:
    def __init__(self, products, pantry, cart, user_id, user_name, names=None, zip_code=None, finder=None):
        self.products = products
        self.pantry = pantry
        self.cart = cart
        self.user_id = user_id
        self.user_name = user_name
        self.names = names or {user_id: user_name}
        self.zip_code = zip_code
        self._finder = finder
        self.found = {}
        self.results = []

    async def find_live(self, query):
        if self._finder is not None:
            return await self._finder(query, self.pantry)
        return await search_for_list(query, self.zip_code, self.pantry)

    def remember(self, product):
        if product:
            self.found[str(product.get("_id", product.get("name")))] = product

    def product_by_id(self, pid):
        pid = str(pid or "")
        if pid in self.found:
            return self.found[pid]
        return next((x for x in self.products if str(x.get("_id", x.get("name"))) == pid), None)

    def display(self, user_id):
        return self.names.get(user_id, user_id)

    async def run_tool(self, name, args=None):
        args = args or {}
        if name == "get_pantry":
            return [{"name": i.get("name"), "quantity": i.get("quantity"), "unit": i.get("unit")}
                    for i in self.pantry]
        if name == "resolve_product":
            query = args.get("query", "")
            found = await self.find_live(query)
            if found.get("status") != "found":
                return {"found": False, "query": query, "status": found.get("status", "not_found")}
            p = found["product"]
            self.remember(p)
            store, price = cheapest(p)
            return {"found": True, "status": "found", "product_id": str(p.get("_id", p.get("name"))),
                    "name": p["name"], "store": store, "price": price}
        if name == "add_cart_item":
            pid = str(args.get("product_id", ""))
            p = self.product_by_id(pid)
            if not p:
                result = {"action": "unknown", "query": pid}
            else:
                self.cart, result = add_live_product(self.cart, p, self.pantry, self.user_id)
            self.results.append(result)
            return result
        if name == "get_cart":
            return labeled_summary(self.cart, self.names)
        if name == "add_pantry_item":
            query = args.get("query") or ""
            quantity = args.get("quantity")
            if quantity is None:
                quantity = 1
            result = self.add_pantry(query, quantity)
            self.results.append(result)
            return result
        if name == "set_pantry_quantity":
            self.pantry, result = set_group_pantry_quantity(
                self.pantry, args.get("query") or "", args.get("quantity", 0))
            self.results.append(result)
            return result
        if name == "remove_pantry_item":
            self.pantry, result = remove_group_pantry_item(self.pantry, args.get("query") or "")
            self.results.append(result)
            return result
        if name == "move_to_pantry":
            self.cart, self.pantry, result = move_cart_line_to_group_pantry(
                self.cart, self.pantry, args.get("query") or "", self.user_id)
            self.results.append(result)
            return result
        return {"error": f"unknown tool {name}"}

    def add_pantry(self, query, quantity=1):
        """Resolve against the catalog with pantry=None so a pantry hit is not treated as a skip."""
        product = resolve_product(query, self.products, pantry=None)
        name = product["name"] if product else (query or "").strip()
        product_id = str(product.get("_id", product.get("name"))) if product else None
        unit = "item"
        self.pantry, result = add_group_pantry_item(
            self.pantry, name, quantity=quantity, unit=unit, product_id=product_id, added_by=self.user_id)
        if not product:
            result = {**result, "catalog": False}
        return result


def is_grocery_intent(text):
    return bool(INTENT_RE.search(text or ""))


def is_list_intent(text):
    return bool(LIST_RE.search(text or ""))


def is_pantry_intent(text):
    return bool(PANTRY_RE.search(text or ""))


def _clean_text(text):
    t = re.sub(r"@cartwise\b", " ", text or "", flags=re.I)
    return re.sub(r"\s+", " ", t).strip(" .,!?")


def _trim_pantry_words(blob):
    blob = re.sub(
        r"\s+(?:in|into|to|from)\s+(?:the\s+)?(?:group\s+)?pantry$", "", (blob or "").strip(), flags=re.I)
    return re.sub(r"[.!?]+$", "", blob).strip()


def parse_pantry_action(text):
    """Return (kind, query, quantity) for a group-pantry phrase, or None.

    kind is list, set, move, use, remove, or add. Shopping-list phrases return None.
    """
    t = _clean_text(text)
    if not t:
        return None
    if PANTRY_LIST_RE.search(t) and not re.search(
            r"\b(?:add|put|move|remove|used|finished|we have|we bought)\b", t, re.I):
        return ("list", None, None)
    m = re.search(r"\bwe have\s+(\d+(?:\.\d+)?)\s+(.+)$", t, re.I)
    if m:
        return ("set", _trim_pantry_words(m.group(2)), float(m.group(1)))
    m = re.search(r"\bmove\s+(?:the\s+)?(.+?)\s+to\s+(\d+(?:\.\d+)?)\s*$", t, re.I)
    if m:
        return ("set", _trim_pantry_words(m.group(1)), float(m.group(2)))
    m = re.search(r"\bmove\s+(?:the\s+)?(.+?)\s+out\b", t, re.I)
    if m:
        return ("use", _trim_pantry_words(m.group(1)), None)
    m = re.search(
        r"\bmove\s+(?:the\s+)?(.+?)\s+(?:in|into|to)\s+(?:the\s+)?(?:group\s+)?pantry\b", t, re.I)
    if m:
        return ("move", _trim_pantry_words(m.group(1)), None)
    m = re.search(r"\bwe bought\s+(.+)$", t, re.I)
    if m:
        return ("move", _trim_pantry_words(m.group(1)), None)
    m = re.search(r"\b(?:used|finished)\s+(?:the\s+)?(.+)$", t, re.I)
    if m:
        return ("use", _trim_pantry_words(m.group(1)), None)
    m = re.search(r"\bremove\s+(.+?)\s+from\s+(?:the\s+)?(?:group\s+)?pantry\b", t, re.I)
    if m:
        return ("remove", m.group(1).strip(), None)
    m = re.search(
        r"\badd\s+(?:(\d+(?:\.\d+)?)\s+)?(.+?)\s+to\s+(?:the\s+)?(?:group\s+)?pantry\b", t, re.I)
    if m:
        qty = float(m.group(1)) if m.group(1) else 1
        return ("add", m.group(2).strip(), qty)
    m = re.search(
        r"\bput\s+(?:(\d+(?:\.\d+)?)\s+)?(.+?)\s+in(?:to)?\s+(?:the\s+)?(?:group\s+)?pantry\b", t, re.I)
    if m:
        qty = float(m.group(1)) if m.group(1) else 1
        return ("add", m.group(2).strip(), qty)
    m = re.search(r"\bwe have\s+(.+)$", t, re.I)
    if m and not re.match(r"\d", m.group(1).strip()):
        return ("add", _trim_pantry_words(m.group(1)), 1)
    if PANTRY_LIST_RE.search(t):
        return ("list", None, None)
    return None


def pantry_view(items):
    view = []
    for item in items or []:
        row = {"name": item.get("name"), "quantity": item.get("quantity"), "unit": item.get("unit")}
        if item.get("product_id"):
            row["product_id"] = item.get("product_id")
        if item.get("added_by"):
            row["added_by"] = item.get("added_by")
        view.append(row)
    return view


def _current_pantry_qty(items, query):
    q = (query or "").strip().lower()
    for item in items or []:
        name = (item.get("name") or "").lower()
        if name and (name == q or q in name or name in q):
            return float(item.get("quantity") or 1)
    return None


def apply_pantry_action(ctx: CartContext, kind, query, quantity):
    if kind == "add":
        return ctx.add_pantry(query, quantity if quantity is not None else 1)
    if kind == "set":
        ctx.pantry, result = set_group_pantry_quantity(ctx.pantry, query, quantity)
        return result
    if kind == "remove":
        ctx.pantry, result = remove_group_pantry_item(ctx.pantry, query)
        return result
    if kind == "use":
        qty = _current_pantry_qty(ctx.pantry, query)
        if qty is None:
            return {"action": "not_found", "query": query}
        ctx.pantry, result = set_group_pantry_quantity(ctx.pantry, query, qty - 1)
        return result
    if kind == "move":
        ctx.cart, ctx.pantry, result = move_cart_line_to_group_pantry(
            ctx.cart, ctx.pantry, query, ctx.user_id)
        return result
    return {"action": "unknown", "query": query}


def parse_add_queries(text):
    t = re.sub(r"@cartwise\b", " ", text or "", flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" .,!?")
    m = re.search(
        r"(?:we\s+)?(?:need|add|get)\s+(?:to\s+(?:the\s+)?(?:list|cart)\s+)?(?:some\s+)?(.+)",
        t, re.I)
    if not m:
        m = re.search(r"put\s+(.+?)\s+on the list", t, re.I)
    if not m:
        return []
    blob = re.sub(r"\s+on the (?:list|cart)$", "", m.group(1), flags=re.I)
    blob = re.sub(r"[.!?]+$", "", blob).strip()
    return split_grocery_phrases(blob)


def labeled_summary(cart, names):
    s = cart_summary(cart)
    items = []
    for line in s["items"]:
        requesters = [names.get(uid, uid) for uid in line.get("requesters") or []]
        items.append({**line, "requester_names": requesters})
    skipped = []
    for row in s["skipped"]:
        skipped.append({**row, "requester_name": names.get(row.get("requester"), row.get("requester"))})
    return {**s, "items": items, "skipped": skipped}


def format_engine_reply(results, user_name, summary=None):
    lines = []
    for r in results:
        action = r.get("action")
        if action == "skipped":
            lines.append(f"Skip {r['product']} — already in the group pantry ({r['pantry_name']}).")
        elif action == "added":
            price = f"${r['price']:.2f} at {r['store']}" if r.get("price") is not None else "the catalog"
            lines.append(f"Added {r['name']} to the list ({price}) for {user_name}.")
        elif action == "merged":
            lines.append(f"{r.get('name') or r.get('product')} is already on the list; noted {user_name} wants it too.")
        elif action == "quantity":
            lines.append(f"Updated {r['name']} — quantity {r['quantity']} on the list.")
        elif action == "unknown":
            lines.append(f"I couldn't find '{r.get('query')}' at nearby Kroger stores.")
        elif action == "unavailable":
            lines.append(f"I can't reach Kroger right now, so I didn't add '{r.get('query')}'.")
    if summary and summary.get("items") and not results:
        bits = [f"{i['name']} ${i['price']:.2f} at {i['store']} ({', '.join(i.get('requester_names') or i.get('requesters') or [])})"
                for i in summary["items"]]
        lines.append("List: " + "; ".join(bits) + f". Total ${summary['total']:.2f}.")
    elif summary and summary.get("items") and any(r.get("action") in ("added", "merged", "quantity") for r in results):
        lines.append(f"Cart total ${summary['total']:.2f}.")
    if not lines:
        if summary is not None and not summary.get("items"):
            extra = ""
            if summary.get("skipped"):
                extra = " Skipped (already in the group pantry): " + ", ".join(s["name"] for s in summary["skipped"]) + "."
            return "The group list is empty." + extra
        return "Tell me what to add, like 'add hummus' or 'we need chips'."
    return " ".join(lines)


def format_pantry_list(items):
    if not items:
        return "The group pantry is empty."
    bits = []
    for item in items:
        qty = item.get("quantity", 1)
        unit = item.get("unit") or "item"
        bits.append(f"{item.get('name')} ({qty} {unit})")
    return "Group pantry: " + "; ".join(bits) + "."


def format_pantry_reply(results):
    lines = []
    for r in results:
        action = r.get("action")
        name = r.get("name") or r.get("query")
        if action == "added" and r.get("from_cart"):
            lines.append(f"Moved {name} from the list to the group pantry.")
        elif action == "quantity" and r.get("from_cart"):
            lines.append(f"Moved {name} to the group pantry. Now {r.get('quantity')}.")
        elif action == "added":
            lines.append(f"Added {name} to the group pantry.")
        elif action == "quantity":
            lines.append(f"Group pantry now has {r.get('quantity')} {name}.")
        elif action == "updated":
            lines.append(f"Set {name} to {r.get('quantity')} in the group pantry.")
        elif action == "removed":
            lines.append(f"Removed {name} from the group pantry.")
        elif action == "not_found":
            lines.append(f"I don't see {r.get('query') or name} in the group pantry.")
        elif action == "unknown":
            lines.append(f"I don't have '{r.get('query')}' in the catalog.")
    if not lines:
        return "Tell me what to put in the group pantry, like 'add milk to the pantry'."
    return " ".join(lines)


def _pack(ctx: CartContext, reply, source="engine", ignored=False):
    return {"reply": reply, "cart": labeled_summary(ctx.cart, ctx.names),
            "pantry": pantry_view(ctx.pantry), "source": source, "ignored": ignored}


def _pantry_fallback(text, ctx: CartContext) -> dict:
    action = parse_pantry_action(text)
    if action is None or action[0] == "list":
        return _pack(ctx, format_pantry_list(ctx.pantry))
    kind, query, quantity = action
    result = apply_pantry_action(ctx, kind, query, quantity)
    ctx.results.append(result)
    return _pack(ctx, format_pantry_reply([result]))


async def fallback(text, ctx: CartContext) -> dict:
    if is_pantry_intent(text):
        return _pantry_fallback(text, ctx)
    if is_list_intent(text) or not parse_add_queries(text):
        return _pack(ctx, format_engine_reply([], ctx.user_name, labeled_summary(ctx.cart, ctx.names)))
    for q in parse_add_queries(text):
        found = await ctx.find_live(q)
        status = found.get("status")
        if status == "unavailable":
            ctx.results.append({"action": "unavailable", "query": q})
            continue
        if status != "found":
            ctx.results.append({"action": "unknown", "query": q})
            continue
        product = found["product"]
        ctx.remember(product)
        ctx.cart, result = add_live_product(ctx.cart, product, ctx.pantry, ctx.user_id)
        ctx.results.append(result)
    return _pack(ctx, format_engine_reply(ctx.results, ctx.user_name, labeled_summary(ctx.cart, ctx.names)))


def _parse_reply(text):
    if not text:
        return None
    raw = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("reply"):
            return data["reply"]
    except (json.JSONDecodeError, TypeError):
        pass
    return raw or None


async def handle(text, ctx: CartContext) -> dict:
    if not is_grocery_intent(text):
        return _pack(ctx, None, ignored=True)
    if not gemini.api_key():
        return await fallback(text, ctx)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"{ctx.user_name} says: {text}"}]
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            for _ in range(6):
                msg = await gemini.chat(http, msgs, tools=TOOLS)
                calls = msg.get("tool_calls") or []
                if not calls:
                    reply = _parse_reply(msg.get("content") or "")
                    if not reply:
                        return await fallback(text, ctx)
                    return _pack(ctx, reply, source="gemini")
                msgs.append({k: msg[k] for k in ("role", "content", "tool_calls") if k in msg})
                for c in calls:
                    fn = c.get("function") or {}
                    try:
                        args = json.loads(fn.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    result = await ctx.run_tool(fn.get("name"), args)
                    msgs.append({"role": "tool", "tool_call_id": c["id"],
                                 "content": json.dumps(result, default=str)})
        log.warning("Agent fallback: no final answer after tool rounds")
    except httpx.TimeoutException:
        log.warning("Agent fallback: timeout after 15s")
    except httpx.HTTPStatusError as e:
        log.warning("Agent fallback: HTTP %s %s", e.response.status_code, e.response.text[:300])
    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
        log.warning("Agent fallback: bad response (%s): %r", type(e).__name__, e)
    except Exception as e:  # noqa: BLE001
        log.warning("Agent fallback: %r", e)
    return await fallback(text, ctx)
