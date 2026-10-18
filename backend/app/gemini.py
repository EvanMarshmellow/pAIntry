"""Gemini chat completions (OpenAI-compatible). Copy only — numbers stay on the engine."""
import os

GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


def api_key() -> str | None:
    return os.getenv("GEMINI_API_KEY")


def model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


async def chat(http, messages: list, *, tools=None, temperature: float = 0.2) -> dict:
    key = api_key()
    if not key:
        raise RuntimeError("missing GEMINI_API_KEY")
    payload: dict = {"model": model(), "messages": messages, "temperature": temperature}
    if tools:
        payload["tools"] = tools
    r = await http.post(
        GEMINI_CHAT_URL,
        headers={"Authorization": f"Bearer {key}"},
        json=payload,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]
