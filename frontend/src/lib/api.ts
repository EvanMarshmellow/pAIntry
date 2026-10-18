import {
  DEMO_PANTRY,
  DEMO_PRODUCTS,
  demoAddPantry,
  demoConvince,
  demoPantryFoodGroups,
  demoRemovePantry,
} from './demoData'
import { lookupBarcode, searchQuery } from './openFoodFacts'
import type {
  ConvinceInput,
  NewPantryItem,
  PantryFoodGroups,
  PantryItem,
  Product,
  ReceiptOcr,
  ReceiptPushResult,
  User,
  Verdict,
} from './types'

export type {
  ConvinceInput,
  NewPantryItem,
  PantryFoodGroups,
  PantryItem,
  Product,
  ReceiptLine,
  ReceiptOcr,
  ReceiptPushResult,
  User,
  Verdict,
} from './types'

// Deployed backend on Render. Set EXPO_PUBLIC_API_URL (e.g. http://<lan-ip>:8000)
// to point at a local server instead.
const DEFAULT_API_URL = 'https://paintry.onrender.com'

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '')

// Render's free instance sleeps when idle and the first request can take ~30 s.
const REQUEST_TIMEOUT_MS = 45_000

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json()
}

async function withDemoFallback<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  try {
    return await live()
  } catch (e) {
    // Offline / hung API / 5xx → keep the UI usable with seeded fixtures.
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) return demo()
    throw e
  }
}

export const api = {
  // No demo fallback: a signed-in user must be the real account.
  user: (id: string) => request<User>(`/users/${id}`),
  // Not live yet: the backend has no allergies endpoint. Adjust the path/body to
  // match it, then set SYNC_TO_SERVER in allergies.ts.
  updateAllergies: (userId: string, allergies: string[]) =>
    request<unknown>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ allergies }) }),
  // Exchanges a Supabase session token for the MongoDB user (created on first sign-in).
  loginSupabase: (accessToken: string) =>
    request<{ user_id: string; name: string; email: string; new_user: boolean }>('/login/supabase', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    }),
  products: () => withDemoFallback(() => request<Product[]>('/products'), () => DEMO_PRODUCTS),
  pantry: (userId: string) =>
    withDemoFallback(() => request<PantryItem[]>(`/users/${userId}/pantry`), () => DEMO_PANTRY),
  addPantryItem: (userId: string, item: NewPantryItem) =>
    withDemoFallback(
      () =>
        request<PantryItem>(`/users/${userId}/pantry`, {
          method: 'POST',
          body: JSON.stringify(item),
        }),
      () => demoAddPantry(item),
    ),
  deletePantryItem: (userId: string, itemId: string) =>
    withDemoFallback(
      () =>
        request<{ deleted: boolean; item_id: string }>(`/users/${userId}/pantry/${itemId}`, {
          method: 'DELETE',
        }),
      () => {
        demoRemovePantry(itemId)
        return { deleted: true, item_id: itemId }
      },
    ),
  pantryFoodGroups: (userId: string) =>
    withDemoFallback(
      () => request<PantryFoodGroups>(`/users/${userId}/pantry/food-groups`),
      () => demoPantryFoodGroups(),
    ),
  savings: (_userId: string) =>
    withDemoFallback(
      () => request<{ total_saved: number; entries: number }>(`/users/${_userId}/savings`),
      () => ({ total_saved: 0, entries: 0 }),
    ),
  // OCR runs on the device (Perceptron); the server matches lines to the catalog
  // and opens a receipt session. Items are confirmed with addPantryItem.
  pushReceipt: (userId: string, ocr: ReceiptOcr, spaceId = `app:${userId}`) =>
    request<ReceiptPushResult>(`/users/${userId}/pantry/receipt`, {
      method: 'POST',
      body: JSON.stringify({ ocr, space_id: spaceId }),
    }),
  convinceMe: async (userId: string, input: ConvinceInput) => {
    const post = (body: ConvinceInput) =>
      request<Verdict>('/convince-me', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, ...body, log: false }),
      })
    try {
      if ('barcode' in input) {
        // Real UPCs aren't in the seeded catalog: name the product with Open Food
        // Facts, then let the backend price it by name (live QFC prices).
        const scanned = await lookupBarcode(input.barcode)
        if (scanned) {
          try {
            return await post({ query: searchQuery(scanned) })
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 404)) throw e
          }
        }
      }
      return await post(input)
    } catch (e) {
      // Seeded DB almost never has real UPCs; fall back to the offline catalog.
      if (
        e instanceof ApiError &&
        (e.status === 0 || e.status === 404 || e.status >= 500)
      ) {
        return demoConvince(input)
      }
      throw e
    }
  },
}
