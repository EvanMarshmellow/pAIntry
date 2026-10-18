"""Receipt OCR via Perceptron Mk1.5 structured outputs."""
import json
import os
import tempfile
from pathlib import Path

from jsonschema import validate

RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "store": {"type": ["string", "null"]},
        "date": {"type": ["string", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "product": {"type": ["string", "null"]},
                    "price": {"type": ["string", "null"]},
                    "quantity": {"type": ["string", "null"]},
                },
                "required": ["product", "price"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["items"],
    "additionalProperties": False,
}

OCR_PROMPT = (
    "This is a grocery store receipt or a photo of purchased grocery items. "
    "Extract each line item in reading order with product name and price as printed. "
    "Preserve spelling, currency symbols, and decimal separators exactly. "
    "Use null for unreadable fields; do not guess. Include store name and purchase date "
    "only if clearly visible. Return an empty items array if no grocery lines are visible."
)

_MIME_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/webp": ".webp",
}


class OcrError(Exception):
    """Perceptron OCR failed or is not configured."""


def api_key() -> str | None:
    return os.getenv("PERCEPTRON_API_KEY")


def extract_receipt_items(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    key = api_key()
    if not key:
        raise OcrError("PERCEPTRON_API_KEY is not set")
    if not image_bytes:
        raise OcrError("empty image")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise OcrError("image too large (max 10 MB)")

    ext = _MIME_EXT.get((mime_type or "").lower(), ".jpg")
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(image_bytes)
            path = Path(tmp.name)
        from perceptron import Client, image

        client = Client(api_key=key, provider="perceptron", timeout=90.0)
        response = client.chat.completions.create(
            model="perceptron-mk1.5",
            messages=[{
                "role": "user",
                "content": [
                    image(str(path)),
                    {"type": "text", "text": OCR_PROMPT},
                ],
            }],
            reasoning_effort="high",
            max_completion_tokens=2048,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "receipt_lines", "strict": True, "schema": RECEIPT_SCHEMA},
            },
        )
        choice = response.choices[0]
        if choice.finish_reason != "stop" or choice.message.tool_calls:
            raise OcrError(f"Incomplete OCR response: {choice.finish_reason}")
        raw = choice.message.content or ""
        result = json.loads(raw)
        validate(instance=result, schema=RECEIPT_SCHEMA)
        items = [i for i in result.get("items") or [] if i.get("product")]
        return {"store": result.get("store"), "date": result.get("date"), "items": items}
    except OcrError:
        raise
    except Exception as e:
        raise OcrError(str(e)) from e
    finally:
        if path and path.exists():
            path.unlink(missing_ok=True)
