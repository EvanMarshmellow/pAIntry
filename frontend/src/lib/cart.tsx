import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, type PersonalList } from './api'
import { useSession } from './session'

// The shopping list is personal_lists on the server, shared with iMessage.
// Prices come from the engine. The client multiplies price by quantity for display.
export type CartItem = {
  productId: string
  name: string
  category: string | null
  store: string | null
  price: number
  proteinG: number
  quantity: number
}

export type ListAction = 'added' | 'quantity' | 'skipped' | 'removed' | 'cleared' | 'unknown' | 'unavailable' | 'not_found'

function toCartItem(line: PersonalList['items'][number]): CartItem {
  return {
    productId: line.product_id,
    name: line.name,
    category: null,
    store: line.store,
    price: line.price ?? 0,
    proteinG: 0,
    quantity: line.quantity || 1,
  }
}

type Cart = {
  items: CartItem[]
  total: number
  proteinG: number
  refresh: () => Promise<void>
  addQuery: (query: string) => Promise<ListAction>
  setQuantity: (productId: string, quantity: number) => Promise<void>
  clearList: () => Promise<void>
}

const CartContext = createContext<Cart | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const userId = user?._id ?? null
  const [items, setItems] = useState<CartItem[]>([])
  const itemsRef = useRef(items)
  const gen = useRef(0)
  itemsRef.current = items

  const apply = useCallback((data: PersonalList) => {
    setItems((data.items ?? []).map(toCartItem))
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([])
      return
    }
    const seen = gen.current
    const data = await api.list(userId)
    if (gen.current === seen) apply(data)
  }, [apply, userId])

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setItems([])
      return
    }
    const seen = gen.current
    api.list(userId)
      .then((data) => {
        if (!cancelled && gen.current === seen) apply(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [apply, userId])

  const addQuery = useCallback(
    async (query: string) => {
      if (!userId) throw new Error('Sign in to change your list')
      const id = ++gen.current
      const data = await api.addListItem(userId, query.trim())
      if (gen.current === id) apply(data)
      return (data.action ?? 'unknown') as ListAction
    },
    [apply, userId],
  )

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (!userId) throw new Error('Sign in to change your list')
      const snapshot = itemsRef.current
      const id = ++gen.current
      setItems(
        quantity <= 0
          ? snapshot.filter((item) => item.productId !== productId)
          : snapshot.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
      )
      try {
        const data =
          quantity <= 0
            ? await api.removeListItem(userId, productId)
            : await api.setListQuantity(userId, productId, quantity)
        if (gen.current === id) apply(data)
      } catch (e) {
        if (gen.current === id) setItems(snapshot)
        throw e
      }
    },
    [apply, userId],
  )

  const clearList = useCallback(async () => {
    if (!userId) throw new Error('Sign in to change your list')
    const snapshot = itemsRef.current
    const id = ++gen.current
    setItems([])
    try {
      const data = await api.clearList(userId)
      if (gen.current === id) apply(data)
    } catch (e) {
      if (gen.current === id) setItems(snapshot)
      throw e
    }
  }, [apply, userId])

  const value = useMemo<Cart>(() => {
    let total = 0
    let proteinG = 0
    for (const item of items) {
      total += item.price * item.quantity
      proteinG += item.proteinG * item.quantity
    }
    return {
      items,
      total: Math.round(total * 100) / 100,
      proteinG,
      refresh,
      addQuery,
      setQuantity,
      clearList,
    }
  }, [addQuery, clearList, items, refresh, setQuantity])

  return <CartContext value={value}>{children}</CartContext>
}

export function useCart() {
  const ctx = use(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
