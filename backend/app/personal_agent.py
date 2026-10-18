"""Solo DM grocery planner. Gemini writes iMessage copy; tools use the engine only."""
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from app import gemini
from app.engine import (add_to_personal_list, analyze, cart_summary, cheapest,
                        empty_personal_list, remove_from_personal_list, resolve_product)
from app.convince import engine_headline, engine_reasons

log = logging.getLogger("uvicorn.error")
SYSTEM = """You are Cartwise in a private iMessage helping one person plan groceries.
Rules:
- Call tools for pantry, budget, expiring items, list changes, and Buy/Skip/Swap checks. Never invent prices or product ids.
- Personal list is separate from any roommate group cart.
- If resolve_product found is false, say it is not in the catalog.
- If add_list_item action is skipped, say they already have that pantry item at home.
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
        "description": "Match a grocery phrase to one catalog product",
        "parameters": {"type": "object",
                       "properties": {"query": {"type": "string"}},
                       "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "add_list_item",
        "description": "Add a catalog product to the personal list by product_id",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
    }},
    {"type": "function", "function": {
        "name": "remove_list_item",
        "description": "Remove a product from the personal list by product_id",
        "parameters": {"type": "object",
                       "properties": {"product_id": {"type": "string"}},
                       "required": ["product_id"]},
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
    r"should i buy|worth buying|convince|plan (?:my )?grocer|grocery plan|\bswap\b|\bskip\b",
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


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class PersonalContext:
    def __init__(self, products, pantry, personal_list, user, user_id, user_name, week_spent=0.0):
        self.products = products
        self.pantry = pantry
        self.list = personal_list
        self.user = user
        self.user_id = user_id
        self.user_name = user_name
        self.week_spent = week_spent
        self.results = []

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

    def run_tool(self, name, args=None):
        args = args or {}
        if name == "get_pantry":
            return [{"name": i.get("name"), "quantity": i.get("quantity"), "unit": i.get("unit"),
                     "expires_at": i.get("expires_at")} for i in self.pantry]
        if name == "get_budget_status":
            return self.budget_status()
        if name == "get_expiring":
            return self.expiring_soon()
        if name == "resolve_product":
            p = resolve_product(args.get("query", ""), self.products, self.pantry)
            if not p:
                return {"found": False, "query": args.get("query")}
            store, price = cheapest(p)
            return {"found": True, "product_id": str(p.get("_id", p.get("name"))),
                    "name": p["name"], "store": store, "price": price}
        if name == "add_list_item":
            pid = str(args.get("product_id", ""))
            p = next((x for x in self.products if str(x.get("_id", x.get("name"))) == pid), None)
            if not p:
                result = {"action": "unknown", "query": pid}
            else:
                self.list, result = add_to_personal_list(self.list, p, self.pantry)
            self.results.append(result)
            return result
        if name == "remove_list_item":
            pid = str(args.get("product_id", ""))
            self.list, result = remove_from_personal_list(self.list, pid)
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


def parse_add_queries(text):
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
    return [p.strip() for p in re.split(r"\s+and\s+|,\s*", blob) if p.strip()]


def parse_evaluate_query(text):
    m = EVALUATE_RE.search(text or "")
    if not m:
        return None
    for g in m.groups():
        if g:
            return g.strip(" .,!?")
    return None


def parse_remove_query(text):
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
        elif action == "not_found":
            lines.append("That item is not on your list.")
        elif action == "unknown":
            lines.append(f"I don't have '{r.get('query')}' in the catalog.")
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


def fallback(text, ctx: PersonalContext) -> dict:
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
    remove_q = parse_remove_query(text)
    if remove_q:
        p = resolve_product(remove_q, ctx.products, ctx.pantry)
        if p:
            ctx.list, result = remove_from_personal_list(ctx.list, str(p.get("_id", p.get("name"))))
            ctx.results.append(result)
    if is_list_intent(text) and not parse_add_queries(text) and not eval_q:
        summary["_show_total"] = True
        return {"reply": format_list_reply([], summary, extras),
                "list": cart_summary(ctx.list), "source": "engine", "ignored": False}
    for q in parse_add_queries(text):
        p = resolve_product(q, ctx.products, ctx.pantry)
        if not p:
            ctx.results.append({"action": "unknown", "query": q})
            continue
        ctx.list, result = add_to_personal_list(ctx.list, p, ctx.pantry)
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
    if not gemini.api_key():
        return fallback(text, ctx)
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
                        return fallback(text, ctx)
                    return {"reply": reply, "list": summary, "source": "gemini", "ignored": False}
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
        log.warning("Personal agent fallback: no final answer after tool rounds")
    except httpx.TimeoutException:
        log.warning("Personal agent fallback: timeout after 15s")
    except httpx.HTTPStatusError as e:
        log.warning("Personal agent fallback: HTTP %s %s", e.response.status_code, e.response.text[:300])
    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
        log.warning("Personal agent fallback: bad response (%s): %r", type(e).__name__, e)
    except Exception as e:  # noqa: BLE001
        log.warning("Personal agent fallback: %r", e)
    return fallback(text, ctx)
