// Hand off a captured receipt URI from the camera screen back to Upload receipt.
let pendingUri: string | null = null

export function stashReceiptPhoto(uri: string) {
  pendingUri = uri
}

export function consumeReceiptPhoto() {
  const uri = pendingUri
  pendingUri = null
  return uri
}
