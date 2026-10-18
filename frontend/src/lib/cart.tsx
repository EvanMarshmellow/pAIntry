import { createContext, use, useMemo, useReducer, type ReactNode } from 'react'

// The backend has no cart endpoint yet, so the cart lives on the device.
// Prices always come from the backend's engine; the client only sums them.
export type CartItem = {
  name: string
  category: string | null
  store: string | null
  price: number
  proteinG: number
  quantity: number
}

type Action =
  | { type: 'add'; item: Omit<CartItem, 'quantity'> }
  | { type: 'setQuantity'; name: string; quantity: number }
  | { type: 'clear' }

function reducer(items: CartItem[], action: Action): CartItem[] {
  switch (action.type) {
    case 'add': {
      const existing = items.find((i) => i.name === action.item.name)
      if (existing) {
        return items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i))
      }
      return [...items, { ...action.item, quantity: 1 }]
    }
    case 'setQuantity':
      return action.quantity <= 0
        ? items.filter((i) => i.name !== action.name)
        : items.map((i) => (i.name === action.name ? { ...i, quantity: action.quantity } : i))
    case 'clear':
      return []
  }
}

type Cart = {
  items: CartItem[]
  total: number
  proteinG: number
  dispatch: (action: Action) => void
}

const CartContext = createContext<Cart | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(reducer, [])

  const value = useMemo<Cart>(() => {
    let total = 0
    let proteinG = 0
    for (const i of items) {
      total += i.price * i.quantity
      proteinG += i.proteinG * i.quantity
    }
    return { items, total: Math.round(total * 100) / 100, proteinG, dispatch }
  }, [items])

  return <CartContext value={value}>{children}</CartContext>
}

export function useCart() {
  const ctx = use(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
