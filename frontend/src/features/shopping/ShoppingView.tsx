import { useState } from 'react'
import { useCart } from '@/lib/cart'
import { AddPanel } from './AddPanel'
import { CartPanel } from './CartPanel'

// Wireframe: "Shopping" (empty) and "Shopping - Have things in cart".
export function ShoppingView() {
  const { items } = useCart()
  const count = items.reduce((n, i) => n + i.quantity, 0)
  // Cart size when "+" was tapped. Once something is added the count moves on
  // and the cart shows again, so no effect is needed to reset it.
  const [addingAt, setAddingAt] = useState<number | null>(null)

  if (count === 0 || addingAt === count) {
    return <AddPanel onDone={count > 0 ? () => setAddingAt(null) : undefined} />
  }
  return <CartPanel onAdd={() => setAddingAt(count)} />
}
