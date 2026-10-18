import { createContext, use, useMemo, useState, type ReactNode } from 'react'

// Rough shelf life by catalog category, so items moved from the cart into the
// pantry get a days-left countdown when they spoil fast. Others get no expiry.
const SHELF_LIFE_DAYS: Record<string, number> = { produce: 5, meat_seafood: 3, dairy_eggs: 10, bakery: 5 }

export function defaultExpiry(category: string | null) {
  const days = category ? SHELF_LIFE_DAYS[category] : undefined
  if (days == null) return undefined
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// Completed deletes on the server (DELETE /users/{id}/pantry/{item_id});
// `removed` hides the item right away and `restore` undoes that if the delete fails.
type Overrides = {
  removed: ReadonlySet<string>
  remove: (id: string) => void
  // Undo a remove when the server delete fails.
  restore: (id: string) => void
  // Bumped after a POST so screens holding pantry data refetch.
  version: number
  refresh: () => void
}

const PantryContext = createContext<Overrides | null>(null)

export function PantryProvider({ children }: { children: ReactNode }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [version, setVersion] = useState(0)

  const value = useMemo<Overrides>(
    () => ({
      removed,
      remove: (id) => setRemoved((prev) => new Set(prev).add(id)),
      restore: (id) =>
        setRemoved((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      version,
      refresh: () => setVersion((v) => v + 1),
    }),
    [removed, version],
  )

  return <PantryContext value={value}>{children}</PantryContext>
}

export function usePantryOverrides() {
  const ctx = use(PantryContext)
  if (!ctx) throw new Error('usePantryOverrides must be used inside PantryProvider')
  return ctx
}
