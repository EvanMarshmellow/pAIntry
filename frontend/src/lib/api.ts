import Constants from 'expo-constants'

// EXPO_PUBLIC_API_URL wins. Otherwise reuse the Metro host so a phone on the
// same Wi-Fi reaches the backend on the dev machine.
function resolveBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return `http://${host ?? 'localhost'}:8000`
}

export const API_URL = resolveBaseUrl()

export const DEMO_USER_ID = '665f00000000000000000001'

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
  expires_at?: string
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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}`)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  user: (id: string) => request<User>(`/users/${id}`),
  products: () => request<Product[]>('/products'),
  pantry: (userId: string) => request<PantryItem[]>(`/users/${userId}/pantry`),
  addPantryItem: (userId: string, item: NewPantryItem) =>
    request<PantryItem>(`/users/${userId}/pantry`, { method: 'POST', body: JSON.stringify(item) }),
  savings: (userId: string) =>
    request<{ total_saved: number; entries: number }>(`/users/${userId}/savings`),
  convinceMe: (userId: string, input: ConvinceInput) =>
    request<Verdict>('/convince-me', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...input }),
    }),
}
