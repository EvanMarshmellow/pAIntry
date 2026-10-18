// Barcode → product name via Open Food Facts (read API, no account needed).
// https://openfoodfacts.github.io/openfoodfacts-server/api/
const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'code,product_name,brands,quantity,image_front_small_url'

// OFF asks every client to identify itself. Browsers drop this header; native apps send it.
const USER_AGENT = 'pAIntry/1.0 (DubHacks demo app)'

export type OffProduct = {
  code: string
  name: string
  brand: string | null
  quantity: string | null
  image: string | null
}

type OffResponse = {
  status?: number
  product?: {
    code?: string
    product_name?: string
    brands?: string
    quantity?: string
    image_front_small_url?: string
  }
}

/** Returns null when OFF doesn't know the barcode or can't be reached. */
export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(barcode)}?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) return null
    const body: OffResponse = await res.json()
    const name = body.product?.product_name?.trim()
    if (body.status !== 1 || !name) return null
    return {
      code: body.product?.code ?? barcode,
      name,
      // "Ferrero, Nutella" → first listed brand.
      brand: body.product?.brands?.split(',')[0]?.trim() || null,
      quantity: body.product?.quantity ?? null,
      image: body.product?.image_front_small_url ?? null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Search text for /convince-me: brand + name, without repeating the brand. */
export function searchQuery(product: OffProduct) {
  const { brand, name } = product
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name
  return `${brand} ${name}`
}
