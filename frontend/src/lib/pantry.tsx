import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import type { ShelfId } from '@/theme'
import type { PantryItem } from './api'
import { daysUntil } from './format'

// Items added with this unit are shown on the Leftover shelf.
export const LEFTOVER_UNIT = 'leftover'

const FRESH_WITHIN_DAYS = 14

// The backend stores no shelf, so it is derived: leftovers by unit,
// short-lived food on Fresh, everything else on Pantry.
export function shelfOf(item: PantryItem): ShelfId {
  if (item.unit === LEFTOVER_UNIT) return 'leftover'
  if (item.expires_at && daysUntil(item.expires_at) <= FRESH_WITHIN_DAYS) return 'fresh'
  return 'pantry'
}

// Finished / Trashed call DELETE /users/{id}/pantry/{item_id}, then refresh().
// "Move to fridge" is still session-only (overrides shelf → fresh).
type Overrides = {
  moved: Readonly<Record<string, ShelfId>>
  move: (id: string, shelf: ShelfId) => void
  // Bumped after pantry POST/DELETE so lists and nutrition refetch.
  version: number
  refresh: () => void
}

const PantryContext = createContext<Overrides | null>(null)

export function PantryProvider({ children }: { children: ReactNode }) {
  const [moved, setMoved] = useState<Readonly<Record<string, ShelfId>>>({})
  const [version, setVersion] = useState(0)

  const value = useMemo<Overrides>(
    () => ({
      moved,
      move: (id, shelf) => setMoved((prev) => ({ ...prev, [id]: shelf })),
      version,
      refresh: () => setVersion((v) => v + 1),
    }),
    [moved, version],
  )

  return <PantryContext value={value}>{children}</PantryContext>
}

export function usePantryOverrides() {
  const ctx = use(PantryContext)
  if (!ctx) throw new Error('usePantryOverrides must be used inside PantryProvider')
  return ctx
}
