import type { ReceiptOcr } from './types'

// Receipt OCR goes through the Expo API route in src/app/receipt-ocr+api.ts,
// which calls Perceptron Mk1.5 server-side (Perceptron blocks browser CORS).
// In development, relative URLs reach the Expo dev server on web and native.
export class OcrError extends Error {}

export async function readReceipt(base64: string, mimeType = 'image/jpeg'): Promise<ReceiptOcr> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100_000)
  let res: Response
  try {
    res = await fetch('/receipt-ocr', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64, mime_type: mimeType }),
    })
  } catch {
    throw new OcrError("Couldn't reach the receipt reader. Check your connection and try again.")
  } finally {
    clearTimeout(timer)
  }

  const body: (ReceiptOcr & { error?: string }) | null = await res.json().catch(() => null)
  if (!res.ok || !body || !Array.isArray(body.items)) {
    throw new OcrError(body?.error ?? `Receipt reader failed (${res.status})`)
  }
  return body
}
