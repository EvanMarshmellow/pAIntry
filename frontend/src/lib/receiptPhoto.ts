// Hand off a captured receipt from the camera screen back to Upload receipt.
// base64 rides along so the OCR call doesn't need a file-system read.
export type ReceiptPhoto = { uri: string; base64: string | null; mimeType: string }

let pending: ReceiptPhoto | null = null

export function stashReceiptPhoto(photo: ReceiptPhoto) {
  pending = photo
}

export function consumeReceiptPhoto() {
  const photo = pending
  pending = null
  return photo
}
