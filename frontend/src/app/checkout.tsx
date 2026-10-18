import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import { colors, radius, type } from '@/theme'

type Paid = { total: number; count: number }

// Mock one-tap pay from the demo flow; nothing is charged.
export default function Checkout() {
  const { items, total, dispatch } = useCart()
  const [paid, setPaid] = useState<Paid | null>(null)

  if (paid) {
    return (
      <View style={[styles.sheet, styles.center]}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={36} color={colors.greenInk} />
        </View>
        <Text style={styles.title}>Order placed</Text>
        <Text style={[type.small, styles.centerText]}>
          {paid.count} {paid.count === 1 ? 'item' : 'items'} · {formatPrice(paid.total)}
          {'\n'}Demo payment, no money moved.
        </Text>
        <Button onPress={() => router.back()} style={styles.full}>
          <ButtonText>Done</ButtonText>
        </Button>
      </View>
    )
  }

  // Group by store so the receipt matches where each item is cheapest.
  const byStore = new Map<string, number>()
  for (const i of items) {
    const store = i.store ?? 'Any store'
    byStore.set(store, (byStore.get(store) ?? 0) + i.price * i.quantity)
  }

  function pay() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setPaid({ total, count: items.reduce((n, i) => n + i.quantity, 0) })
    dispatch({ type: 'clear' })
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Checkout</Text>
      <View style={styles.card}>
        {[...byStore].map(([store, subtotal]) => (
          <View key={store} style={styles.line}>
            <Text style={type.body}>{store}</Text>
            <Text style={styles.amount}>{formatPrice(subtotal)}</Text>
          </View>
        ))}
        <View style={[styles.line, styles.totalLine]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatPrice(total)}</Text>
        </View>
      </View>
      <Button onPress={pay} disabled={items.length === 0}>
        <ButtonText>Pay {formatPrice(total)}</ButtonText>
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 20, backgroundColor: colors.bg },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  full: { alignSelf: 'stretch' },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  card: {
    padding: 16,
    gap: 12,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  amount: { ...type.body, fontVariant: ['tabular-nums'] },
  totalLine: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  totalAmount: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
})
