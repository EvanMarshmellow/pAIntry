import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps, ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { api, type PantryItem } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { daysUntil, EXPIRY_URGENT_DAYS, expiryLabel, formatPrice } from '@/lib/format'
import { usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { useAsync } from '@/lib/useAsync'
import { colors, radius, type } from '@/theme'

const USE_SOON_DAYS = EXPIRY_URGENT_DAYS

// Wireframe: "Storage-Nutrition" ([Nutrition Bar] + [Suggestion]).
export function NutritionView({ pantry }: { pantry: PantryItem[] }) {
  const user = useUser()
  const cart = useCart()
  const { removed } = usePantryOverrides()
  const savings = useAsync(() => api.savings(user._id), user._id)

  const weeklyProteinGoal = (user.goals.protein_g_per_day ?? 0) * 7
  const useSoon = pantry
    .filter((i) => !removed.has(i._id) && i.expires_at && daysUntil(i.expires_at) <= USE_SOON_DAYS)
    .map((i) => ({
      id: i._id,
      name: i.name,
      expiresAt: i.expires_at!,
      days: daysUntil(i.expires_at!),
    }))

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Meter
        icon="wallet-outline"
        label="Weekly budget"
        value={cart.total}
        max={user.weekly_budget}
        caption={`${formatPrice(cart.total)} in cart of ${formatPrice(user.weekly_budget)}`}
      />
      {weeklyProteinGoal > 0 ? (
        <Meter
          icon="barbell-outline"
          label="Protein in your cart"
          value={cart.proteinG}
          max={weeklyProteinGoal}
          caption={`${Math.round(cart.proteinG)} g of your ${weeklyProteinGoal} g weekly goal`}
        />
      ) : null}

      <Card icon="sparkles-outline" title="Saved with pAIntry">
        <Text style={styles.bigNumber}>
          {savings.data ? formatPrice(savings.data.total_saved) : '—'}
        </Text>
        <Text style={type.small}>
          {savings.status === 'error'
            ? savings.error.message
            : savings.data
              ? `From ${savings.data.entries} ${savings.data.entries === 1 ? 'swap' : 'swaps'}`
              : 'Loading…'}
        </Text>
      </Card>

      <Card icon="time-outline" title="Use these first">
        {useSoon.length === 0 ? (
          <Text style={type.small}>Nothing is about to expire.</Text>
        ) : (
          useSoon.map((i) => (
            <View key={i.id} style={styles.line}>
              <Text style={type.body}>{i.name}</Text>
              <Text style={[type.small, i.days <= EXPIRY_URGENT_DAYS && styles.urgent]}>
                {expiryLabel(i.expiresAt)}
              </Text>
            </View>
          ))
        )}
      </Card>

      {user.allergies.length > 0 ? (
        <Card icon="alert-circle-outline" title="Avoiding">
          <View style={styles.chips}>
            {user.allergies.map((a) => (
              <Text key={a} style={styles.chip}>{a}</Text>
            ))}
          </View>
          <Text style={type.small}>Convince Me skips products that contain these.</Text>
        </Card>
      ) : null}

      <Text style={styles.disclaimer}>General nutrition info, not medical advice.</Text>
    </ScrollView>
  )
}

type IconName = ComponentProps<typeof Ionicons>['name']

function Card({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={18} color={colors.greenInk} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function Meter({ icon, label, value, max, caption }: {
  icon: IconName
  label: string
  value: number
  max: number
  caption: string
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  const over = max > 0 && value > max
  return (
    <Card icon={icon} title={label}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }, over && styles.fillOver]} />
      </View>
      <Text style={[type.small, over && styles.urgent]}>{caption}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 4, gap: 12 },
  card: {
    padding: 16,
    gap: 10,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bg, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.green },
  fillOver: { backgroundColor: '#F7CAC1' },
  bigNumber: { fontSize: 28, fontWeight: '700', color: colors.greenInk, letterSpacing: -0.5 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urgent: { color: colors.danger, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9A2B1C',
    backgroundColor: '#FFE4E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  disclaimer: { fontSize: 13, color: colors.faint, textAlign: 'center', marginTop: 8 },
})
