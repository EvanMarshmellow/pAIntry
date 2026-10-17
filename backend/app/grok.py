"""AI explains engine facts (Grok or Gemini). Falls back to engine-only verdict on any problem."""
import json
import logging
import os
import re
from typing import Literal

import httpx
from pydantic import BaseModel, Field

log = logging.getLogger("uvicorn.error")
XAI_URL = "https://api.x.ai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
SYSTEM = """You are a friendly grocery assistant giving a Buy/Skip/Swap verdict from ENGINE FACTS.
Rules:
- Use ONLY numbers that appear in the facts. Never invent or round differently.
- Headline: on Swap, name the alternative and the dollar savings, e.g. "Swap to Greek Yogurt Cup Vanilla, save $2.20". On Buy/Skip, name the product and the main reason.
- 2-3 reasons. EACH must cite a concrete number from the facts (savings $, protein g of each item, cost per gram of protein, budget remaining, items expiring soon). Friendly, under 15 words each.
- Any allergy conflict (allergy_conflicts non-empty) is a HARD FACT: verdict Skip, first reason states the allergen. If a peanut-free/allergen-free alternative exists, still put it in better_alternative and mention its savings. No medical advice, no calorie-restriction advice.
Reply with ONLY JSON: {"verdict":"Buy|Skip|Swap","headline":str,"reasons":[str],"better_alternative":{"name":str,"store":str,"price":number}|null,"savings":number}"""
TOOLS = [{"type": "function", "function": {"name": n, "description": d, "parameters": {"type": "object", "properties": {}}}}
         for n, d in [("get_pantry", "Pantry match, expiring items and allergy conflicts"),
                      ("get_alternatives", "Product facts, best cheaper alternative and savings"),
                      ("get_budget_status", "Weekly budget, spent and remaining, and goals")]]
DATA_SOURCES = ["Seeded sample prices (Store A/B/C)", "Product nutrition labels (sample data)",
                "Your pantry", "Your weekly budget"]


class Alt(BaseModel):
    name: str
    store: str | None = None
    price: float | None = None


class Verdict(BaseModel):
    verdict: Literal["Buy", "Skip", "Swap"]
    headline: str
    reasons: list[str] = Field(default_factory=list)
    better_alternative: Alt | None = None
    savings: float = 0
    data_sources: list[str] = Field(default_factory=list)


def _tool(name, f):
    if name == "get_pantry":
        return {k: f.get(k) for k in ("similar_in_pantry", "expiring_soon", "allergy_conflicts")}
    if name == "get_alternatives":
        return {k: f.get(k) for k in ("product", "alternative", "savings")}
    return {"budget": f["budget"], "goals": f["goals"]}


def engine_headline(verdict, f):
    alt, name = f["alternative"], f["product"]["name"]
    if f["allergy_conflicts"]:
        h = f"Skip: contains {', '.join(f['allergy_conflicts'])}"
        return h + (f". Try {alt['name']} instead, save ${f['savings']:.2f}" if alt else "")
    if verdict == "Swap" and alt:
        return f"Swap to {alt['name']}, save ${f['savings']:.2f}"
    return f"{verdict}: {name}, {f['draft_reason'][0].lower()}{f['draft_reason'][1:]}"


def engine_reasons(verdict, f):
    p, alt, out = f["product"], f["alternative"], []
    if f["allergy_conflicts"]:
        out.append(f"Flagged for your {', '.join(f['allergy_conflicts'])} allergy, so we play it safe")
    if alt and (verdict == "Swap" or f["allergy_conflicts"]):
        out.append(f"Saves ${f['savings']:.2f}: ${alt['price']:.2f} vs ${p['price']:.2f}")
        if alt["cost_per_protein_g"] and p["cost_per_protein_g"]:
            out.append(f"{alt['protein_g_per_package']:g}g protein at ${alt['cost_per_protein_g']:.3f}/g "
                       f"vs {p['protein_g_per_package']:g}g at ${p['cost_per_protein_g']:.3f}/g")
    elif p["price"] is not None:
        out.append(f"${p['price']:.2f} at {p['cheapest_store']}, {p['protein_g_per_package']:g}g protein")
    out.append(f"${f['budget']['remaining']:.2f} left in your weekly budget")
    for item in (f.get("expiring_soon") or [])[:1]:
        out.append(f"Use your {item['name']} first, it expires in {item['days']} day(s)")
    return out[:3]


def postprocess(v: Verdict, f) -> dict:
    """Numbers, sources and safety come from the engine, overriding the model."""
    alt = f["alternative"]
    if f["allergy_conflicts"]:
        v.verdict = "Skip"
        v.headline = engine_headline("Skip", f)
        allergy = engine_reasons("Skip", f)[0]
        v.reasons = [allergy] + [r for r in v.reasons if r != allergy and "allerg" not in r.lower()]
        if alt:  # engine already excludes allergen-conflicting alternatives
            v.better_alternative, v.savings = Alt(**{k: alt[k] for k in ("name", "store", "price")}), f["savings"]
        else:
            v.better_alternative, v.savings = None, 0.0
    elif v.verdict == "Swap" and alt:
        v.better_alternative, v.savings = Alt(**{k: alt[k] for k in ("name", "store", "price")}), f["savings"]
        if "$" not in v.headline:
            v.headline = engine_headline("Swap", f)
    else:
        if v.verdict == "Swap":
            v.verdict = f["draft_verdict"]
            v.headline = engine_headline(v.verdict, f)
        v.better_alternative, v.savings = None, 0.0
    numeric = [r for r in v.reasons if re.search(r"\d", r)]
    if len(numeric) < 2:
        extra = [r for r in engine_reasons(v.verdict, f) if r not in v.reasons]
        v.reasons = v.reasons[:1] + extra + v.reasons[1:] if f["allergy_conflicts"] else extra + v.reasons
    v.reasons = v.reasons[:3]
    v.data_sources = list(DATA_SOURCES)
    return v.model_dump()


def fallback(f) -> dict:
    v = Verdict(verdict=f["draft_verdict"], headline=engine_headline(f["draft_verdict"], f),
                reasons=engine_reasons(f["draft_verdict"], f))
    return postprocess(v, f) | {"source": "engine"}


def _provider():
    """Pick the AI provider from .env: AI_PROVIDER=gemini or grok."""
    name = os.getenv("AI_PROVIDER", "grok").lower()
    if name == "gemini":
        return name, os.getenv("GEMINI_API_KEY"), os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), GEMINI_URL
    return "grok", os.getenv("XAI_API_KEY"), os.getenv("GROK_MODEL", "grok-4-fast"), XAI_URL


async def explain(f) -> dict:
    name, key, model, url = _provider()
    if os.getenv("USE_GROK", "true").lower() != "true" or not key:
        return fallback(f)
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Should I buy {f['product']['name']}?\nENGINE FACTS:\n{json.dumps(f, default=str)}"}]
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            for _ in range(3):
                r = await http.post(url, headers={"Authorization": f"Bearer {key}"},
                                    json={"model": model, "messages": msgs, "tools": TOOLS, "temperature": 0.2})
                r.raise_for_status()
                msg = r.json()["choices"][0]["message"]
                calls = msg.get("tool_calls") or []
                if not calls:
                    text = (msg.get("content") or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```")
                    return postprocess(Verdict(**json.loads(text)), f) | {"source": name}
                msgs.append({k: msg[k] for k in ("role", "content", "tool_calls") if k in msg})
                for c in calls:
                    msgs.append({"role": "tool", "tool_call_id": c["id"],
                                 "content": json.dumps(_tool(c["function"]["name"], f), default=str)})
        log.warning("%s fallback: no final answer after 3 tool rounds", name)
    except httpx.TimeoutException:
        log.warning("%s fallback: timeout after 15s", name)
    except httpx.HTTPStatusError as e:
        log.warning("%s fallback: HTTP %s %s", name, e.response.status_code, e.response.text[:300])
    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
        log.warning("%s fallback: bad response (%s): %r", name, type(e).__name__, e)
    except Exception as e:  # noqa: BLE001 - any failure -> deterministic answer
        log.warning("%s fallback: %r", name, e)
    return fallback(f)