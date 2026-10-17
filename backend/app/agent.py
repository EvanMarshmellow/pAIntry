"""Group-chat cart agent. Grok writes the iMessage; tools mutate the cart via the engine."""
import json
import logging
import os
import re

import httpx

from app.engine import add_to_group_cart, cart_summary, cheapest, resolve_product

log = logging.getLogger("uvicorn.error")
XAI_URL = "https://api.x.ai/v1/chat/completions"
SYSTEM = """You are Cartwise in a roommate iMessage group helping add groceries to a shared cart.
Rules:
- Call tools to match products and change the cart. Never invent a product_id, name, store, or price.
- If resolve_product found is false, say it is not in the catalog. Do not add it.
- If add_cart_item action is skipped, say they already have that pantry item. Do not pretend it was added.
- If action is merged, say it was already on the list and note this person too.
- Short iMessage, under 4 sentences. No medical advice.
Reply with ONLY JSON: {"reply":"your text"}"""
TOOLS = [
    {"type": "function", "function": {
        "name": "get_pantry",
        "description": "Household pantry item names already at home",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "resolve_product",
        "description": "Match a grocery phrase to one catalog product. Returns found, product_id, name, store, price.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "add_cart_item",
        "description": "Add a catalog product to the group cart by product_id. Skips pantry matches and merges duplicates.",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
    {"type": "function", "function": {
        "name": "get_cart",
        "description": "Current group cart lines, requesters, prices, total, and pantry skips",
        "parameters": {"type": "object", "properties": {}},
    }},
]
INTENT_RE = re.compile(
    r"@cartwise\b|\badd\b|\bneed\b|put on the list|what'?s on the (?:list|cart)|"
    r"show (?:the )?(?:list|cart)\b|\bon the list\b",
    re.I,
)
LIST_RE = re.compile(
    r"what'?s on the (?:list|cart)|show (?:the )?(?:list|cart)|get (?:the )?(?:list|cart)",
    re.I,
)


class CartContext:
    def __init__(self, products, pantry, cart, user_id, user_name, names=None):
        self.products = products
        self.pantry = pantry
        self.cart = cart
        self.user_id = user_id
        self.user_name = user_name
        self.names = names or {user_id: user_name}
        self.results = []

    def display(self, user_id):
        return self.names.get(user_id, user_id)

    def run_tool(self, name, args=None):
        args = args or {}
        if name == "get_pantry":
            return [{"name": i.get("name"), "quantity": i.get("quantity"), "unit": i.get("unit")}
                    for i in self.pantry]
        if name == "resolve_product":
            p = resolve_product(args.get("query", ""), self.products, self.pantry)
            if not p:
                return {"found": False, "query": args.get("query")}
            store, price = cheapest(p)
            return {"found": True, "product_id": str(p.get("_id", p.get("name"))),
                    "name": p["name"], "store": store, "price": price}
        if name == "add_cart_item":
            pid = str(args.get("product_id", ""))
            p = next((x for x in self.products if str(x.get("_id", x.get("name"))) == pid), None)
            if not p:
                result = {"action": "unknown", "query": pid}
            else:
                self.cart, result = add_to_group_cart(self.cart, p, self.user_id, self.pantry)
            self.results.append(result)
            return result
        if name == "get_cart":
            return labeled_summary(self.cart, self.names)
        return {"error": f"unknown tool {name}"}


def is_grocery_intent(text):
    return bool(INTENT_RE.search(text or ""))


def is_list_intent(text):
    return bool(LIST_RE.search(text or ""))


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
    return [p.strip() for p in re.split(r"\s+and\s+|,\s*", blob) if p.strip()]


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
            lines.append(f"Skip {r['product']} — you already have {r['pantry_name']} at home.")
        elif action == "added":
            price = f"${r['price']:.2f} at {r['store']}" if r.get("price") is not None else "the catalog"
            lines.append(f"Added {r['name']} ({price}) for {user_name}.")
        elif action == "merged":
            lines.append(f"{r.get('name') or r.get('product')} is already on the list; noted {user_name} wants it too.")
        elif action == "unknown":
            lines.append(f"I don't have '{r.get('query')}' in the catalog.")
    if summary and summary.get("items") and not results:
        bits = [f"{i['name']} ${i['price']:.2f} at {i['store']} ({', '.join(i.get('requester_names') or i.get('requesters') or [])})"
                for i in summary["items"]]
        lines.append("Cart: " + "; ".join(bits) + f". Total ${summary['total']:.2f}.")
    elif summary and summary.get("items") and any(r.get("action") in ("added", "merged") for r in results):
        lines.append(f"Cart total ${summary['total']:.2f}.")
    if not lines:
        if summary is not None and not summary.get("items"):
            extra = ""
            if summary.get("skipped"):
                extra = " Skipped (already in pantry): " + ", ".join(s["name"] for s in summary["skipped"]) + "."
            return "The group cart is empty." + extra
        return "Tell me what to add, like 'add hummus' or 'we need chips'."
    return " ".join(lines)


def fallback(text, ctx: CartContext) -> dict:
    if is_list_intent(text) or not parse_add_queries(text):
        summary = labeled_summary(ctx.cart, ctx.names)
        if is_list_intent(text):
            return {"reply": format_engine_reply([], ctx.user_name, summary),
                    "cart": summary, "source": "engine", "ignored": False}
        if not parse_add_queries(text):
            return {"reply": format_engine_reply([], ctx.user_name, summary),
                    "cart": summary, "source": "engine", "ignored": False}
    for q in parse_add_queries(text):
        p = resolve_product(q, ctx.products, ctx.pantry)
        if not p:
            ctx.results.append({"action": "unknown", "query": q})
            continue
        ctx.cart, result = add_to_group_cart(ctx.cart, p, ctx.user_id, ctx.pantry)
        ctx.results.append(result)
    summary = labeled_summary(ctx.cart, ctx.names)
    return {"reply": format_engine_reply(ctx.results, ctx.user_name, summary),
            "cart": summary, "source": "engine", "ignored": False}


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
        return {"reply": None, "cart": labeled_summary(ctx.cart, ctx.names),
                "source": "engine", "ignored": True}
    key = os.getenv("XAI_API_KEY")
    if not key:
        return fallback(text, ctx)
    model = os.getenv("GROK_MODEL", "grok-4-fast")
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"{ctx.user_name} says: {text}"}]
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            for _ in range(6):
                r = await http.post(XAI_URL, headers={"Authorization": f"Bearer {key}"},
                                    json={"model": model, "messages": msgs, "tools": TOOLS, "temperature": 0.2})
                r.raise_for_status()
                msg = r.json()["choices"][0]["message"]
                calls = msg.get("tool_calls") or []
                if not calls:
                    reply = _parse_reply(msg.get("content") or "")
                    summary = labeled_summary(ctx.cart, ctx.names)
                    if not reply:
                        return fallback(text, ctx)
                    return {"reply": reply, "cart": summary, "source": "grok", "ignored": False}
                msgs.append({k: msg[k] for k in ("role", "content", "tool_calls") if k in msg})
                for c in calls:
                    fn = c.get("function") or {}
                    try:
                        args = json.loads(fn.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    result = ctx.run_tool(fn.get("name"), args)
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
    return fallback(text, ctx)
