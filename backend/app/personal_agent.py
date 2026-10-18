"""Solo DM grocery planner. Gemini writes iMessage copy; tools use the engine only."""
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from app import gemini
from app.engine import (add_live_product, add_personal_pantry_item, add_spoken_personal_pantry_item,
                        analyze, bump_latest_personal_list_line, cart_summary, cheapest,
                        clear_personal_list, latest_personal_list_line, list_line_for_query,
                        move_list_line_into_pantry, move_personal_list_to_pantry,
                        remove_from_personal_list, resolve_product, split_grocery_phrases)
from app.grok import engine_headline, engine_reasons
from app.kroger import search_for_list

log = logging.getLogger("uvicorn.error")
SYSTEM = """You are Cartwise in a private iMessage helping one person plan groceries.
Rules:
- Call tools for pantry, budget, expiring items, list changes, and Buy/Skip/Swap checks. Never invent prices or product ids.
- Personal list is separate from any roommate group cart.
- resolve_product searches nearby Kroger stores. product_id is the UPC. Do not invent one.
- If resolve_product status is unavailable, say Kroger can't be reached and the item was not added.
- If resolve_product found is false, say it wasn't found at nearby Kroger stores and do not add it.
- If add_list_item action is skipped, say they already have that pantry item at home.
- Call clear_list only when they want the entire list deleted. remove_list_item removes one product.
- "add that to my pantry" moves the most recent list line into the personal pantry. A named food is looked up at Kroger. Never store the words "that", "this", or "it".
- "add that to my list" increases the quantity of the most recent list line. Do not search for the word "that".
- Short iMessage, under 5 sentences. No medical advice.
Reply with ONLY JSON: {"reply":"your text"}"""
TOOLS = [
    {"type": "function", "function": {
        "name": "get_pantry",
        "description": "User pantry items with quantity and expiry when known",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_budget_status",
        "description": "Weekly budget, spent this week, remaining, and goals",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_expiring",
        "description": "Pantry items expiring within 3 days",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "resolve_product",
        "description": "Search nearby Kroger stores for a grocery phrase. Returns found, status, product_id (UPC), name, store, price.",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "add_list_item",
        "description": "Add a product_id returned by resolve_product to the personal list",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
    {"type": "function", "function": {
        "name": "remove_list_item",
        "description": "Remove one product from the personal list by product_id or by the words they used",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
    {"type": "function", "function": {
        "name": "clear_list",
        "description": "Remove every item from the personal list. Use only when the person wants the whole list gone.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_list",
        "description": "Personal list lines, total, and pantry skips",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "evaluate_product",
        "description": "Engine Buy/Skip/Swap facts for a catalog product_id",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
]
INTENT_RE = re.compile(
    r"@cartwise\b|\badd\b|\bneed\b|put on (?:my )?(?:the )?list|what'?s on (?:my )?(?:the )?(?:list|cart)|"
    r"show (?:my )?(?:the )?(?:list|cart)\b|\bon (?:my )?list\b|\bremove\b|\bbudget\b|\bexpir|\bpantry\b|"
    r"should i buy|worth buying|convince|plan (?:my )?grocer|grocery plan|\bswap\b|\bskip\b|"
    r"\b(?:clear|delete|empty)\b.{0,24}\b(?:list|cart)\b",
    re.I,
)
LIST_RE = re.compile(
    r"what'?s on (?:my )?(?:the )?(?:list|cart)|show (?:my )?(?:the )?(?:list|cart)|get (?:my )?(?:the )?(?:list|cart)",
    re.I,
)
EXPIRE_RE = re.compile(r"\bexpir", re.I)
BUDGET_RE = re.compile(r"\bbudget\b|\bspent\b|\bleft this week\b", re.I)
EVALUATE_RE = re.compile(r"should i buy\s+(.+)|worth buying\s+(.+)|convince me(?: to buy)?\s+(.+)", re.I)
REMOVE_RE = re.compile(r"\bremove\s+(.+?)(?:\s+from|\s+off)?(?:\s+(?:my )?(?:list|cart))?$", re.I)
CLEAR_RE = re.compile(
    r"^(?:please\s+)?(?:clear|remove|delete|empty)(?:\s+out)?\s+(?:my|the)\s+(?:list|cart)\s*$",
    re.I,
)


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class PersonalContext:
    def __init__(self, products, pantry, personal_list, user, user_id, user_name, week_spent=0.0,
                 zip_code=None, finder=None):
        self.products = products
        self.pantry = pantry
        self.list = personal_list
        self.user = user
        self.user_id = user_id
        self.user_name = user_name
        self.week_spent = week_spent
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

    def expiring_soon(self):
        soon = datetime.now(timezone.utc) + timedelta(days=3)
        now = datetime.now(timezone.utc)
        out = []
        for item in self.pantry or []:
            exp = item.get("expires_at")
            if not exp:
                continue
            exp = _aware(exp)
            if exp <= soon:
                out.append({"name": item.get("name"), "days": max(0, (exp - now).days)})
        return out

    def budget_status(self):
        budget = self.user.get("weekly_budget", 0)
        remaining = round(budget - self.week_spent, 2)
        return {
            "weekly_budget": budget,
            "spent_this_week": round(self.week_spent, 2),
            "remaining": remaining,
            "goals": self.user.get("goals") or {},
        }

    def _alternatives(self, product):
        cat = product.get("category")
        return [p for p in self.products if p.get("category") == cat]

    async def run_tool(self, name, args=None):
        args = args or {}
        if name == "get_pantry":
            return [{"name": i.get("name"), "quantity": i.get("quantity"), "unit": i.get("unit"),
                     "expires_at": i.get("expires_at")} for i in self.pantry]
        if name == "get_budget_status":
            return self.budget_status()
        if name == "get_expiring":
            return self.expiring_soon()
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
        if name == "add_list_item":
            pid = str(args.get("product_id", ""))
            p = self.product_by_id(pid)
            if not p:
                result = {"action": "unknown", "query": pid}
            else:
                self.list, result = add_live_product(self.list, p, self.pantry, personal=True)
            self.results.append(result)
            return result
        if name == "remove_list_item":
            pid = str(args.get("product_id", ""))
            line = next((x for x in self.list.get("items") or [] if str(x.get("product_id")) == pid), None)
            if line is None:
                line = list_line_for_query(self.list, pid)
                if line:
                    pid = line.get("product_id")
            self.list, result = remove_from_personal_list(self.list, pid)
            self.results.append(result)
            return result
        if name == "clear_list":
            self.list, result = clear_personal_list(self.list)
            self.results.append(result)
            return result
        if name == "get_list":
            return cart_summary(self.list)
        if name == "evaluate_product":
            pid = str(args.get("product_id", ""))
            p = next((x for x in self.products if str(x.get("_id", x.get("name"))) == pid), None)
            if not p:
                return {"found": False, "product_id": pid}
            facts = analyze(p, self.user, self.pantry, self._alternatives(p), self.week_spent)
            facts["expiring_soon"] = self.expiring_soon()
            verdict = facts["draft_verdict"]
            return {
                "found": True,
                "verdict": verdict,
                "headline": engine_headline(verdict, facts),
                "reasons": engine_reasons(verdict, facts)[:3],
                "savings": facts.get("savings"),
                "alternative": facts.get("alternative"),
                "product": facts.get("product"),
            }
        return {"error": f"unknown tool {name}"}


def is_personal_intent(text):
    return bool(INTENT_RE.search(text or ""))


def is_list_intent(text):
    return bool(LIST_RE.search(text or ""))


_PANTRY_ASK = {
    "something", "anything", "an item", "stuff", "food", "item", "items",
}
_PANTRY_ALL_RE = re.compile(
    r"\b(?:add|move|put)\s+"
    r"(?:everything(?:\s+(?:from|on)\s+(?:my|the)\s+list)?|"
    r"all(?:\s+of)?\s+(?:my|the)\s+list|"
    r"(?:my|the)\s+whole\s+list)"
    r"\s+(?:in|into|to)\s+(?:my\s+)?pantry\b",
    re.I,
)
_PANTRY_ONE_RE = re.compile(
    r"\badd\s+(.+?)\s+to\s+(?:my\s+)?pantry\b",
    re.I,
)
_PANTRY_RECENT_RE = re.compile(
    r"\bnot\s+to\s+(?:my\s+|the\s+)?(?:list|cart)\b.*\bpantry\b",
    re.I,
)
_REFERENCE_RE = re.compile(r"^(?:that|this|it)(?:\s+one)?$", re.I)
_LIST_REFERENCE_RE = re.compile(
    r"\b(?:add|need|get|put)\s+(?:that|this|it)(?:\s+one)?\s+(?:to|on)\s+(?:my\s+|the\s+)?(?:list|cart)\b",
    re.I,
)


def _is_reference_query(query):
    return bool(_REFERENCE_RE.match((query or "").strip()))


def parse_pantry_move(text):
    """Return ('all', None), ('recent', None), ('ask', None), ('one', query), or None.

    Whole-list phrases and the words that/this/it are recognized before a
    grocery name, so those words are never stored as food.
    """
    t = _list_text(text)
    if not t or not re.search(r"\bpantry\b", t, re.I):
        return None
    if _PANTRY_ALL_RE.search(t):
        return ("all", None)
    if _PANTRY_RECENT_RE.search(t):
        return ("recent", None)
    match = _PANTRY_ONE_RE.search(t)
    if not match:
        return None
    query = re.sub(r"^(?:some|the)\s+", "", match.group(1).strip(), flags=re.I).strip(" .,!?")
    if not query or query.lower() in _PANTRY_ASK:
        return ("ask", None)
    if _is_reference_query(query):
        return ("recent", None)
    if _PANTRY_ALL_RE.search(f"add {query} to my pantry"):
        return ("all", None)
    return ("one", query)


def parse_list_reference(text):
    """True when "add that to my list" means the latest list line."""
    if parse_pantry_move(text):
        return False
    return bool(_LIST_REFERENCE_RE.search(_list_text(text)))


def _qty_text(quantity):
    number = float(quantity or 1)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


def format_pantry_move(result):
    action = result.get("action")
    if action == "empty":
        return "Your list is already empty."
    if action == "moved_all":
        names = [item.get("name") for item in result.get("items") or [] if item.get("name")]
        if len(names) == 1:
            return f"Added {names[0]} from your list to your pantry."
        return f"Added {len(names)} items from your list to your pantry: {', '.join(names)}."
    name = result.get("name") or "that item"
    if result.get("from_list"):
        if action == "quantity":
            return f"Moved {name} from your list to your pantry. You now have {_qty_text(result.get('quantity'))}."
        moved = _qty_text(result.get("list_quantity") or result.get("quantity"))
        if moved == "1":
            return f"Moved {name} from your list to your pantry."
        return f"Moved {moved} {name} from your list to your pantry."
    if action == "quantity":
        return f"Updated {name} — quantity {_qty_text(result.get('quantity'))} in your pantry."
    return f"Added {name} to your pantry."


def parse_add_queries(text):
    if parse_pantry_move(text) or parse_list_reference(text):
        return []
    t = re.sub(r"@cartwise\b", " ", text or "", flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" .,!?")
    m = re.search(
        r"(?:add|need|get)\s+(?:to\s+(?:my\s+)?(?:list|cart)\s+)?(?:some\s+)?(.+)",
        t, re.I)
    if not m:
        m = re.search(r"put\s+(.+?)\s+on (?:my )?(?:the )?list", t, re.I)
    if not m:
        return []
    blob = re.sub(r"\s+to (?:my )?(?:the )?(?:list|cart)$", "", m.group(1), flags=re.I)
    blob = re.sub(r"\s+on (?:my )?(?:the )?(?:list|cart)$", "", blob, flags=re.I)
    blob = re.sub(r"[.!?]+$", "", blob).strip()
    return split_grocery_phrases(blob)


def parse_evaluate_query(text):
    m = EVALUATE_RE.search(text or "")
    if not m:
        return None
    for g in m.groups():
        if g:
            return g.strip(" .,!?")
    return None


def _list_text(text):
    t = re.sub(r"@cartwise\b", " ", text or "", flags=re.I)
    return re.sub(r"\s+", " ", t).strip(" .,!?")


def parse_clear(text):
    """True when the message asks to wipe the whole list, not one item."""
    return bool(CLEAR_RE.match(_list_text(text)))


def parse_remove_query(text):
    if parse_clear(text):
        return None
    m = REMOVE_RE.search((text or "").strip())
    return m.group(1).strip(" .,!?") if m else None


def format_list_reply(results, summary, extras=None):
    lines = list(extras or [])
    for r in results:
        action = r.get("action")
        if action == "skipped":
            lines.append(f"Skip {r['product']} — you already have {r['pantry_name']} at home.")
        elif action == "added":
            price = f"${r['price']:.2f} at {r['store']}" if r.get("price") is not None else "the catalog"
            lines.append(f"Added {r['name']} ({price}) to your list.")
        elif action == "quantity":
            lines.append(f"Updated {r['name']} — quantity {r['quantity']} on your list.")
        elif action == "removed":
            lines.append(f"Removed {r['name']} from your list.")
        elif action == "cleared":
            n = int(r.get("removed") or 0)
            if n == 0:
                lines.append("Your list is already empty.")
            elif n == 1:
                lines.append("Cleared 1 item from your list.")
            else:
                lines.append(f"Cleared {n} items from your list.")
        elif action == "not_found":
            lines.append("That item is not on your list.")
        elif action == "unknown":
            lines.append(f"I couldn't find '{r.get('query')}' at nearby Kroger stores.")
        elif action == "unavailable":
            lines.append(f"I can't reach Kroger right now, so I didn't add '{r.get('query')}'.")
    if summary and summary.get("items") and summary.get("_show_total"):
        bits = [f"{i['name']} ${i['price']:.2f} at {i['store']}" for i in summary["items"]]
        lines.append("Your list: " + "; ".join(bits) + f". Total ${summary['total']:.2f}.")
    elif summary and summary.get("items") and not any(r.get("action") in ("added", "quantity") for r in results):
        pass
    elif summary and summary.get("items") and any(r.get("action") in ("added", "quantity", "removed") for r in results):
        lines.append(f"List total ${summary['total']:.2f}.")
    if not lines:
        if summary is not None and not summary.get("items"):
            extra = ""
            if summary.get("skipped"):
                extra = " Skipped (pantry): " + ", ".join(s["name"] for s in summary["skipped"]) + "."
            return "Your list is empty." + extra
        return "Tell me what to add, like 'add eggs to my list' or 'what's expiring?'."
    return " ".join(lines)


async def _pantry_from_kroger(ctx: PersonalContext, query: str) -> str:
    """Store the Kroger product. A miss does not write the spoken words."""
    found = await ctx.find_live(query)
    status = found.get("status")
    if status == "unavailable":
        return f"I can't reach Kroger right now, so I didn't add '{query}'."
    if status != "found":
        return f"I couldn't find '{query}' at nearby Kroger stores."
    product = found["product"]
    ctx.remember(product)
    line = list_line_for_query(ctx.list, product.get("name") or query)
    if line:
        ctx.list, ctx.pantry, result = move_list_line_into_pantry(ctx.list, ctx.pantry, line)
    else:
        product_id = str(product.get("_id", product.get("name")))
        ctx.pantry, result = add_personal_pantry_item(
            ctx.pantry, product.get("name") or query, quantity=1, product_id=product_id)
        result = {**result, "from_list": False}
    ctx.results.append(result)
    return format_pantry_move(result)


async def fallback(text, ctx: PersonalContext) -> dict:
    summary = cart_summary(ctx.list)
    extras = []
    if EXPIRE_RE.search(text or ""):
        exp = ctx.expiring_soon()
        if exp:
            extras.append("Expiring soon: " + ", ".join(f"{e['name']} ({e['days']}d)" for e in exp) + ".")
        else:
            extras.append("Nothing in your pantry expires in the next 3 days.")
    if BUDGET_RE.search(text or ""):
        b = ctx.budget_status()
        extras.append(f"Weekly budget ${b['weekly_budget']:.2f}, spent ${b['spent_this_week']:.2f}, "
                      f"${b['remaining']:.2f} left.")
    eval_q = parse_evaluate_query(text)
    if eval_q:
        p = resolve_product(eval_q, ctx.products, ctx.pantry)
        if not p:
            ctx.results.append({"action": "unknown", "query": eval_q})
        else:
            facts = analyze(p, ctx.user, ctx.pantry, ctx._alternatives(p), ctx.week_spent)
            verdict = facts["draft_verdict"]
            extras.append(engine_headline(verdict, facts) + " " + " ".join(engine_reasons(verdict, facts)[:2]))
    pantry_move = parse_pantry_move(text)
    if pantry_move:
        kind, query = pantry_move
        if kind == "ask":
            reply = "Which item should I add to your pantry?"
        elif kind == "all":
            ctx.list, ctx.pantry, result = move_personal_list_to_pantry(ctx.list, ctx.pantry)
            ctx.results.append(result)
            reply = format_pantry_move(result)
        elif kind == "recent":
            line = latest_personal_list_line(ctx.list)
            if not line:
                reply = "Your list is empty, so there's nothing recent to move."
            else:
                ctx.list, ctx.pantry, result = move_list_line_into_pantry(ctx.list, ctx.pantry, line)
                ctx.results.append(result)
                reply = format_pantry_move(result)
        else:
            ctx.list, ctx.pantry, result = add_spoken_personal_pantry_item(
                ctx.list, ctx.pantry, query, ctx.products)
            if result.get("action") == "not_on_list":
                reply = await _pantry_from_kroger(ctx, query)
            else:
                ctx.results.append(result)
                reply = format_pantry_move(result)
        if extras:
            reply = " ".join(extras + [reply])
        return {"reply": reply, "list": cart_summary(ctx.list), "source": "engine", "ignored": False}
    if parse_list_reference(text):
        ctx.list, result = bump_latest_personal_list_line(ctx.list)
        ctx.results.append(result)
        if result.get("action") == "empty":
            reply = "Your list is empty. Tell me what to add, like 'add eggs to my list'."
        else:
            reply = format_list_reply(ctx.results, cart_summary(ctx.list), extras)
        return {"reply": reply, "list": cart_summary(ctx.list), "source": "engine", "ignored": False}
    if parse_clear(text):
        ctx.list, result = clear_personal_list(ctx.list)
        ctx.results.append(result)
    remove_q = parse_remove_query(text)
    if remove_q:
        line = list_line_for_query(ctx.list, remove_q)
        if line:
            ctx.list, result = remove_from_personal_list(ctx.list, line.get("product_id"))
            ctx.results.append(result)
    if is_list_intent(text) and not parse_add_queries(text) and not eval_q:
        summary["_show_total"] = True
        return {"reply": format_list_reply([], summary, extras),
                "list": cart_summary(ctx.list), "source": "engine", "ignored": False}
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
        ctx.list, result = add_live_product(ctx.list, product, ctx.pantry, personal=True)
        ctx.results.append(result)
    if ctx.results or extras:
        return {"reply": format_list_reply(ctx.results, cart_summary(ctx.list), extras),
                "list": cart_summary(ctx.list), "source": "engine", "ignored": False}
    if not is_personal_intent(text):
        return {"reply": None, "list": summary, "source": "engine", "ignored": True}
    return {"reply": format_list_reply([], summary, extras),
            "list": summary, "source": "engine", "ignored": False}


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


async def handle(text, ctx: PersonalContext) -> dict:
    if not is_personal_intent(text):
        return {"reply": None, "list": cart_summary(ctx.list), "source": "engine", "ignored": True}
    if parse_clear(text) or parse_pantry_move(text) or parse_list_reference(text) or not gemini.api_key():
        return await fallback(text, ctx)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"{ctx.user_name} says: {text}"}]
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            for _ in range(8):
                msg = await gemini.chat(http, msgs, tools=TOOLS)
                calls = msg.get("tool_calls") or []
                if not calls:
                    reply = _parse_reply(msg.get("content") or "")
                    summary = cart_summary(ctx.list)
                    if not reply:
                        return await fallback(text, ctx)
                    return {"reply": reply, "list": summary, "source": "gemini", "ignored": False}
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
        log.warning("Personal agent fallback: no final answer after tool rounds")
    except httpx.TimeoutException:
        log.warning("Personal agent fallback: timeout after 15s")
    except httpx.HTTPStatusError as e:
        log.warning("Personal agent fallback: HTTP %s %s", e.response.status_code, e.response.text[:300])
    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
        log.warning("Personal agent fallback: bad response (%s): %r", type(e).__name__, e)
    except Exception as e:  # noqa: BLE001
        log.warning("Personal agent fallback: %r", e)
    return await fallback(text, ctx)
