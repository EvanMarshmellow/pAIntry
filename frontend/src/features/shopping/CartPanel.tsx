import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { memo, useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, ButtonText } from '@/components/Button'
import { ProductThumb } from '@/components/ProductThumb'
import { api } from '@/lib/api'
import { useCart, type CartItem } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import { defaultExpiry, usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { colors, radius, type } from '@/theme'

export function CartPanel({ onAdd }: { onAdd: () => void }) {
  const { items, total, dispatch } = useCart()
  const user = useUser()
  const { refresh } = usePantryOverrides()
  const insets = useSafeAreaInsets()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Replaces checkout: everything kept or swapped into the cart goes into the pantry.
  async function addToPantry() {
    setSaving(true)
    setError(null)
    try {
      for (const item of items) {
        const expires_at = defaultExpiry(item.category)
        await api.addPantryItem(user._id, {
          name: item.name,
          quantity: item.quantity,
          unit: 'item',
          ...(expires_at ? { expires_at } : {}),
        })
        // Drop each line once saved, so a failure part-way never adds it twice on retry.
        dispatch({ type: 'setQuantity', name: item.name, quantity: 0 })
      }
      refresh()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to your pantry')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setSaving(false)
    }
  }

  const setQuantity = useCallback(
    (name: string, quantity: number) => dispatch({ type: 'setQuantity', name, quantity }),
    [dispatch],
  )

  const count = items.reduce((n, i) => n + i.quantity, 0)

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={keyOf}
        renderItem={({ item }) => (
          <CartRow
            name={item.name}
            category={item.category}
            store={item.store}
            price={item.price}
            quantity={item.quantity}
            onChangeQuantity={setQuantity}
          />
        )}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Your cart</Text>
              <Text style={type.small}>{count === 1 ? '1 item' : `${count} items`}</Text>
            </View>
            <Pressable onPress={onAdd} style={styles.addButton} accessibilityLabel="Add a product" hitSlop={6}>
              <Ionicons name="add" size={24} color={colors.greenInk} />
            </Pressable>
          </View>
        }
        ListFooterComponent={
          <View style={styles.totalRow}>
            <Text style={type.small}>Total</Text>
            <Text style={styles.total}>{formatPrice(total)}</Text>
          </View>
        }
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
        <Button onPress={addToPantry} loading={saving} disabled={items.length === 0}>
          <Ionicons name="file-tray-full-outline" size={18} color={colors.greenInk} />
          <ButtonText>Add to pantry</ButtonText>
        </Button>
      </View>
    </View>
  )
}

const keyOf = (item: CartItem) => item.name

type RowProps = Omit<CartItem, 'proteinG'> & {
  onChangeQuantity: (name: string, quantity: number) => void
}

const CartRow = memo(function CartRow({ name, category, store, price, quantity, onChangeQuantity }: RowProps) {
  return (
    <View style={styles.row}>
      <ProductThumb category={category} size={64} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>{name}</Text>
        {store ? <Text style={type.small}>{store}</Text> : null}
        <View style={styles.rowFooter}>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => onChangeQuantity(name, quantity - 1)}
              hitSlop={8}
              accessibilityLabel={quantity === 1 ? `Remove ${name}` : `Decrease ${name}`}
            >
              <Ionicons name={quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={colors.muted} />
            </Pressable>
            <Text style={styles.qty}>{quantity}</Text>
            <Pressable onPress={() => onChangeQuantity(name, quantity + 1)} hitSlop={8} accessibilityLabel={`Increase ${name}`}>
              <Ionicons name="add" size={16} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.price}>{formatPrice(price * quantity)}</Text>
        </View>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600', color: colors.ink },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.mint,
  },
  rowBody: { flex: 1, gap: 4 },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.ink },
  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  qty: { fontSize: 15, fontWeight: '600', color: colors.ink, minWidth: 14, textAlign: 'center' },
  price: { fontSize: 15, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 10, paddingTop: 20 },
  total: { fontSize: 17, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, textAlign: 'center' },
  footer: { gap: 8, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
})
