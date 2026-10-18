// Server-side proxy for Perceptron Mk1.5 receipt OCR.
// https://docs.perceptron.inc/perceptron-mk1.5/capabilities/ocr
// Perceptron sends no CORS headers, so browsers can't call it directly; this
// route runs on the Expo server and keeps the API key out of the app bundle.
const ENDPOINT = 'https://api.perceptron.inc/v1/chat/completions'
const MODEL = 'perceptron-mk1.5'

// Same schema and prompt as backend/app/perceptron_ocr.py, so the server's
// receipt matcher sees the shape it expects.
const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: { type: ['string', 'null'] },
          price: { type: ['string', 'null'] },
          quantity: { type: ['string', 'null'] },
        },
        required: ['product', 'price'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

const OCR_PROMPT =
  'This is a grocery store receipt or a photo of purchased grocery items. ' +
  'Extract each line item in reading order with product name and price as printed. ' +
  'Preserve spelling, currency symbols, and decimal separators exactly. ' +
  'Use null for unreadable fields; do not guess. Include store name and purchase date ' +
  'only if clearly visible. Return an empty items array if no grocery lines are visible.'

type Completion = {
  choices?: {
    finish_reason?: string
    message?: { content?: string | null; tool_calls?: unknown[] | null }
  }[]
  error?: { message?: string }
}

type OcrItem = { product: string | null; price: string | null; quantity?: string | null }

const fail = (status: number, error: string) => Response.json({ error }, { status })

export async function POST(request: Request) {
  const key = process.env.PERCEPTRON_API_KEY ?? process.env.EXPO_PUBLIC_PERCEPTRON_API_KEY
  if (!key) return fail(500, 'Receipt reading is not set up (PERCEPTRON_API_KEY is missing).')

  const body: { image_base64?: string; mime_type?: string } | null = await request.json().catch(() => null)
  const base64 = body?.image_base64
  if (!base64) return fail(400, 'No image was sent.')
  const mimeType = body?.mime_type || 'image/jpeg'

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: OCR_PROMPT },
            ],
          },
        ],
        reasoning_effort: 'high',
        max_completion_tokens: 2048,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'receipt_lines', strict: true, schema: RECEIPT_SCHEMA },
        },
      }),
    })
  } catch {
    return fail(502, "Couldn't reach the receipt reader. Try again in a moment.")
  }

  const completion: Completion | null = await res.json().catch(() => null)
  if (!res.ok) return fail(502, completion?.error?.message ?? `Receipt reader failed (${res.status})`)

  const choice = completion?.choices?.[0]
  if (!choice || choice.finish_reason !== 'stop' || choice.message?.tool_calls?.length) {
    return fail(502, "Couldn't finish reading that receipt. Try a sharper photo.")
  }

  let parsed: { store?: string | null; date?: string | null; items?: OcrItem[] }
  try {
    parsed = JSON.parse(choice.message?.content ?? '')
  } catch {
    return fail(502, 'The receipt reader returned something unexpected.')
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    return fail(502, 'The receipt reader returned something unexpected.')
  }

  return Response.json({
    store: parsed.store ?? null,
    date: parsed.date ?? null,
    items: parsed.items.filter((i) => typeof i?.product === 'string' && i.product.trim()),
  })
}
