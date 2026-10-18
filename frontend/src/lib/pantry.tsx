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

// Rough shelf life by catalog category, so items moved from the cart into the
// pantry land on the Fresh shelf when they spoil fast. Others get no expiry.
const SHELF_LIFE_DAYS: Record<string, number> = { produce: 5, meat_seafood: 3, dairy_eggs: 10, bakery: 5 }

export function defaultExpiry(category: string | null) {
  const days = category ? SHELF_LIFE_DAYS[category] : undefined
  if (days == null) return undefined
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// Finished / Trashed delete on the server (DELETE /users/{id}/pantry/{item_id});
// `removed` hides the item right away and `restore` undoes that if the delete fails.
// Move to fridge has no endpoint, so it is session-only (overrides shelf → fresh).
type Overrides = {
  removed: ReadonlySet<string>
  moved: Readonly<Record<string, ShelfId>>
  remove: (id: string) => void
  // Undo a remove when the server delete fails.
  restore: (id: string) => void
  move: (id: string, shelf: ShelfId) => void
  // Bumped after a POST so screens holding pantry data refetch.
  version: number
  refresh: () => void
}

const PantryContext = createContext<Overrides | null>(null)

export function PantryProvider({ children }: { children: ReactNode }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [moved, setMoved] = useState<Readonly<Record<string, ShelfId>>>({})
  const [version, setVersion] = useState(0)

  const value = useMemo<Overrides>(
    () => ({
      removed,
      moved,
      remove: (id) => setRemoved((prev) => new Set(prev).add(id)),
      restore: (id) =>
        setRemoved((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      move: (id, shelf) => setMoved((prev) => ({ ...prev, [id]: shelf })),
      version,
      refresh: () => setVersion((v) => v + 1),
    }),
    [removed, moved, version],
  )

  return <PantryContext value={value}>{children}</PantryContext>
}

export function usePantryOverrides() {
  const ctx = use(PantryContext)
  if (!ctx) throw new Error('usePantryOverrides must be used inside PantryProvider')
  return ctx
}
