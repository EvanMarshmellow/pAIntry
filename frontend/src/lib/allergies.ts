import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './api'

// Common allergens offered as chips at sign-in. Lowercase, because the backend
// engine matches allergy strings against product names and allergen lists.
export const COMMON_ALLERGIES = [
  'peanuts',
  'tree nuts',
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'wheat',
  'gluten',
  'soy',
  'sesame',
] as const

// Flip on once the backend accepts allergies (see api.updateAllergies).
// Until then they live only on this device.
const SYNC_TO_SERVER = false

const key = (userId: string) => `paintry.allergies.${userId}`

export function normalizeAllergy(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Allergies saved on this device, or null if this user never set them here. */
export async function loadAllergies(userId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === 'string') : null
  } catch {
    return null
  }
}

export async function saveAllergies(userId: string, allergies: string[]) {
  const clean = [...new Set(allergies.map(normalizeAllergy).filter(Boolean))]
  await AsyncStorage.setItem(key(userId), JSON.stringify(clean)).catch(() => {})
  if (SYNC_TO_SERVER) await api.updateAllergies(userId, clean)
  return clean
}
