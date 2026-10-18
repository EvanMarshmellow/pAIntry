import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps, ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Notice } from '@/components/Notice'
import { api, type FoodGroups, type PantryItem } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { daysUntil, EXPIRY_URGENT_DAYS, expiryLabel, formatPrice } from '@/lib/format'
import { usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { useAsync } from '@/lib/useAsync'
import { colors, foodGroupBars, radius, type, verdictColors } from '@/theme'

const USE_SOON_DAYS = EXPIRY_URGENT_DAYS

// Figma "Storage-Nutrition": five food-group bars (share of pantry calories vs the
// classic food-pyramid goal), then the backend's suggestion.
export function NutritionView({ pantry }: { pantry: PantryItem[] }) {
  const user = useUser()
  const cart = useCart()
  const { removed, version } = usePantryOverrides()
  // Refetch after pantry adds, like the pantry list itself.
  const mix = useAsync(() => api.foodGroups(user._id), `${user._id}|${version}`)

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
      {mix.status === 'error' ? (
        <Notice message={mix.error.message} onRetry={mix.reload} />
      ) : (
        <PantryMix data={mix.data} />
      )}

      {user.weekly_budget > 0 ? (
        <Meter
          icon="wallet-outline"
          label="Weekly budget"
          value={cart.total}
          max={user.weekly_budget}
          caption={`${formatPrice(cart.total)} in cart of ${formatPrice(user.weekly_budget)}`}
        />
      ) : null}
      {weeklyProteinGoal > 0 ? (
        <Meter
          icon="barbell-outline"
          label="Protein in your cart"
          value={cart.proteinG}
          max={weeklyProteinGoal}
          caption={`${Math.round(cart.proteinG)} g of your ${weeklyProteinGoal} g weekly goal`}
        />
      ) : null}

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

const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function PantryMix({ data }: { data?: FoodGroups }) {
  const empty = data != null && foodGroupBars.every((g) => data.groups[g.id].calories_on_hand === 0)
  const hints = data?.pantry_balance_hint ?? []
  return (
    <View style={styles.mix}>
      {foodGroupBars.map((bar) => {
        const group = data?.groups[bar.id]
        const pct = group?.pct ?? 0
        return (
          <View
            key={bar.id}
            style={styles.mixRow}
            accessible
            accessibilityLabel={`${bar.label} ${percent.format(pct)} percent of calories, goal ${group?.target_pct ?? '?'} percent`}
          >
            <View style={styles.mixLabelRow}>
              <Text style={type.body}>{bar.label}</Text>
              {group ? <Text style={type.small}>Goal {percent.format(group.target_pct)}%</Text> : null}
            </View>
            <View style={styles.mixBarRow}>
              <View style={styles.mixTrack}>
                {group ? (
                  <View style={[styles.mixBar, { width: `${Math.min(pct, 100)}%`, backgroundColor: bar.color }]} />
                ) : null}
              </View>
              <Text style={[styles.mixPct, group?.status === 'low' && styles.urgent, group?.status === 'high' && styles.over]}>
                {group ? `${percent.format(pct)}%` : '—'}
              </Text>
            </View>
          </View>
        )
      })}
      <Text style={[type.body, styles.suggestion]}>
        {!data
          ? 'Checking your pantry mix…'
          : empty
            ? 'Add groceries to see how your pantry is balanced.'
            : hints.length > 0
              ? hints.join(' ')
              : 'Your pantry looks well balanced.'}
      </Text>
    </View>
  )
}

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
  mix: { gap: 22, paddingTop: 16, paddingBottom: 24 },
  mixRow: { gap: 8 },
  mixLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: 64 },
  mixBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mixTrack: { flex: 1 },
  // 10 pt rounded strokes, as in the Figma line assets; never narrower than a dot.
  mixBar: { height: 10, minWidth: 10, borderRadius: 5 },
  mixPct: { width: 52, textAlign: 'right', fontSize: 13, color: colors.ink },
  suggestion: { marginTop: 8 },
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
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urgent: { color: colors.danger, fontWeight: '700' },
  over: { color: verdictColors.Swap.ink, fontWeight: '700' },
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
