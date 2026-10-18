import Constants from 'expo-constants'
import { DEMO_PANTRY, DEMO_PRODUCTS, demoAddPantry, demoConvince } from './demoData'
import type { ConvinceInput, NewPantryItem, PantryItem, Product, User, Verdict } from './types'

export type {
  ConvinceInput,
  NewPantryItem,
  PantryItem,
  Product,
  User,
  Verdict,
} from './types'

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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
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
  user: (id: string) =>
    withDemoFallback(
      () => request<User>(`/users/${id}`),
      () => ({
        _id: DEMO_USER_ID,
        name: 'Maya',
        persona: 'grad student',
        weekly_budget: 60,
        goals: { protein_g_per_day: 120 },
        allergies: ['peanuts'],
      }),
    ),
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
  savings: (_userId: string) =>
    withDemoFallback(
      () => request<{ total_saved: number; entries: number }>(`/users/${_userId}/savings`),
      () => ({ total_saved: 0, entries: 0 }),
    ),
  convinceMe: async (userId: string, input: ConvinceInput) => {
    try {
      return await request<Verdict>('/convince-me', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, ...input, log: false }),
      })
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
