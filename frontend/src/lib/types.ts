export type User = {
  _id: string
  name: string
  persona?: string
  weekly_budget: number
  goals: { protein_g_per_day?: number }
  allergies: string[]
}

export type Product = {
  _id: string
  name: string
  brand: string
  category: string
  size: number
  unit: string
  barcode: string
  prices: Record<string, number>
  nutrition_per_serving: { protein_g?: number }
}

export type PantryItem = {
  _id: string
  name: string
  quantity: number
  unit: string
  expires_at: string | null
  added_at: string
}

export type NewPantryItem = {
  name: string
  quantity: number
  unit: string
  product_id?: string
  expires_at?: string
}

export type PantryFoodGroupRow = {
  label: string
  target_pct: number
  pct: number
  pct_calories: number
  pct_servings: number
  pct_grams: number
  delta_from_target: number
  calories_on_hand: number
  grams_on_hand: number
  serving_equiv: number
  status: 'low' | 'ok' | 'high'
}

export type PantryFoodGroups = {
  user_id: string
  primary_metric: 'calories'
  pyramid_model: string
  pyramid_targets: Record<string, number>
  groups: Record<
    'grains' | 'vegetables' | 'fruits' | 'proteins_dairy' | 'sweets_fats',
    PantryFoodGroupRow
  >
  combined_produce_pct: number
  combined_produce_target_pct: number
  pantry_balance_hint: string[]
  assumptions: string[]
}

export type Verdict = {
  verdict: 'Buy' | 'Skip' | 'Swap'
  headline: string
  reasons: string[]
  better_alternative: { name: string; store: string | null; price: number | null } | null
  savings: number
  data_sources: string[]
  source: 'grok' | 'gemini' | 'engine'
  logged: boolean
  engine: {
    product: {
      name: string
      brand: string | null
      category: string | null
      cheapest_store: string | null
      price: number | null
      protein_g_per_package: number
    }
    alternative: {
      name: string
      store: string | null
      price: number | null
      protein_g_per_package: number
    } | null
  }
}

export type ConvinceInput =
  | { product_id: string }
  | { barcode: string }
  | { query: string }

// Perceptron OCR output (same shape as backend/app/perceptron_ocr.py).
export type ReceiptOcr = {
  store: string | null
  date: string | null
  items: { product: string | null; price: string | null; quantity?: string | null }[]
}

// One OCR line after the backend matched it against the catalog.
export type ReceiptLine = {
  ocr_name: string
  price: string | null
  quantity: string | null
  product_id: string | null
  catalog_name: string | null
}

export type ReceiptPushResult = {
  reply: string
  source: 'gemini' | 'engine'
  lines: ReceiptLine[]
  receipt_state: string | null
}
