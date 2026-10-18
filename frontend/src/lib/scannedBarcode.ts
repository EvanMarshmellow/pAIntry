// Hand off a barcode from the scanner back to Add item (pantry mode).
let pending: string | null = null

export function stashScannedBarcode(code: string) {
  pending = code
}

export function consumeScannedBarcode() {
  const code = pending
  pending = null
  return code
}
