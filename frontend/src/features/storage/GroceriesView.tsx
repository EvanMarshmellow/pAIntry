import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState, type ComponentProps } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Notice } from '@/components/Notice'
import { api, type PantryItem } from '@/lib/api'
import { daysUntil, EXPIRY_URGENT_DAYS, formatDate } from '@/lib/format'
import { useGroupCart } from '@/lib/groupCart'
import { usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import type { AsyncState } from '@/lib/useAsync'
import { colors, radius, type } from '@/theme'

type Props = { pantry: AsyncState<PantryItem[]> }

// Wireframe "Storage" plus one food frame per pantry item (no Fresh / Pantry / Leftover shelves).
export function GroceriesView({ pantry }: Props) {
  const user = useUser()
  const { removed, remove, restore, refresh } = usePantryOverrides()
  const { groupCartId } = useGroupCart()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Completed deletes the line on the server. Hide it now; bring it back on failure.
  function deleteItem(item: PantryItem) {
    setDeleteError(null)
    remove(item._id)
    api.deletePantryItem(user._id, item._id).then(
      () => refresh(),
      (e: Error) => {
        restore(item._id)
        setDeleteError(`Couldn’t remove ${item.name}: ${e.message}`)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      },
    )
  }

  // One list: soonest to expire first, items without a date last
  // (the API's expires_at sort puts missing dates first).
  const visible = (pantry.data ?? [])
    .filter((item) => !removed.has(item._id))
    .sort((a, b) => expiryTime(a) - expiryTime(b))

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.actions}>
        <ActionTile icon="add-circle-outline" label="Add item" onPress={() => router.push('/add-item')} />
        <ActionTile
          icon="receipt-outline"
          label="Upload receipt"
          onPress={() => router.push('/upload-receipt')}
        />
        <ActionTile
          icon="people-outline"
          label="Group cart"
          footnote={groupCartId ?? undefined}
          onPress={() => router.push('/group-cart')}
        />
      </View>

      <View style={styles.list}>
        {deleteError ? <Text style={[type.small, styles.deleteError]}>{deleteError}</Text> : null}
        {pantry.status === 'error' && !pantry.data ? (
          <Notice message={pantry.error.message} onRetry={pantry.reload} />
        ) : !pantry.data ? (
          <ActivityIndicator color={colors.muted} style={styles.spinner} />
        ) : visible.length === 0 ? (
          <Text style={[type.small, styles.empty]}>Your pantry is empty.</Text>
        ) : (
          visible.map((item) => (
            <FoodCard
              key={item._id}
              item={item}
              onCompleted={() => deleteItem(item)}
            />
          ))
        )}
      </View>
    </ScrollView>
  )
}

type TileProps = {
  icon: ComponentProps<typeof Ionicons>['name']
  label: string
  /** Shown under the label (e.g. joined group cart ID). */
  footnote?: string
} & Omit<ComponentProps<typeof Pressable>, 'children' | 'style'>

function ActionTile({ icon, label, footnote, ...pressable }: TileProps) {
  return (
    <Pressable {...pressable} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={colors.greenInk} />
      <Text style={styles.tileLabel}>{label}</Text>
      {footnote ? (
        <Text style={styles.footnote} numberOfLines={1}>
          {footnote}
        </Text>
      ) : null}
    </Pressable>
  )
}

// Wireframe food frame: name, expiration date, days left to finish it, then Completed.
function FoodCard({ item, onCompleted }: { item: PantryItem; onCompleted: () => void }) {
  const days = item.expires_at ? daysUntil(item.expires_at) : null
  const urgent = days !== null && days <= EXPIRY_URGENT_DAYS

  return (
    <View style={styles.item}>
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          {item.expires_at ? `Expires ${formatDate(item.expires_at)}` : 'No expiration date'}
        </Text>
        {days !== null ? <Text style={[styles.itemMeta, urgent && styles.urgent]}>{daysLeftLabel(days)}</Text> : null}
      </View>
      <View style={styles.itemActions}>
        <ItemAction label="Completed" onPress={onCompleted} />
      </View>
    </View>
  )
}

function expiryTime(item: PantryItem) {
  return item.expires_at ? new Date(item.expires_at).getTime() : Number.POSITIVE_INFINITY
}

function daysLeftLabel(days: number) {
  if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`
  if (days === 0) return 'Last day to finish it'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

function ItemAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      hitSlop={6}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={styles.itemActionText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  deleteError: { color: colors.danger, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 24 },
  actions: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
  },
  tileLabel: { fontSize: 13, fontWeight: '600', color: colors.greenInk },
  footnote: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.greenInk,
    letterSpacing: 1,
  },
  list: { gap: 10 },
  spinner: { marginTop: 40 },
  empty: { textAlign: 'center', marginTop: 40 },
  item: {
    backgroundColor: colors.green,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  itemBody: { flex: 1, gap: 4 },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  itemMeta: { fontSize: 13, lineHeight: 18, color: 'rgba(18, 20, 18, 0.65)' },
  urgent: { color: colors.danger, fontWeight: '700' },
  itemActions: { gap: 10, alignItems: 'flex-end', justifyContent: 'center' },
  itemActionText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  pressed: { opacity: 0.6 },
})
