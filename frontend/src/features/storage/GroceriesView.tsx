import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState, type ComponentProps } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Notice } from '@/components/Notice'
import type { PantryItem } from '@/lib/api'
import { daysUntil, EXPIRY_URGENT_DAYS, expiryLabel } from '@/lib/format'
import { useGroupCart } from '@/lib/groupCart'
import { shelfOf, usePantryOverrides } from '@/lib/pantry'
import type { AsyncState } from '@/lib/useAsync'
import { colors, radius, shelves, type, type ShelfId } from '@/theme'

const SHELF_ORDER: ShelfId[] = ['fresh', 'pantry', 'leftover']

type Props = { pantry: AsyncState<PantryItem[]> }

// Wireframes: "Storage", "Storage-Fresh product", "Storage-Pantry", "Storage-Leftover".
export function GroceriesView({ pantry }: Props) {
  const { removed, moved, remove, move } = usePantryOverrides()
  const { groupCartId } = useGroupCart()
  const [shelf, setShelf] = useState<ShelfId>('fresh')
  const tint = shelves[shelf]

  const visible = (pantry.data ?? []).filter(
    (item) => !removed.has(item._id) && (moved[item._id] ?? shelfOf(item)) === shelf,
  )

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

      <View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {SHELF_ORDER.map((id) => {
            const active = id === shelf
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  Haptics.selectionAsync()
                  setShelf(id)
                }}
                style={[styles.tab, active && { backgroundColor: shelves[id].panel }]}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{shelves[id].label}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={[styles.panel, { backgroundColor: tint.panel }, shelf === 'fresh' && styles.panelFirst, shelf === 'leftover' && styles.panelLast]}>
          {pantry.status === 'error' && !pantry.data ? (
            <Notice message={pantry.error.message} onRetry={pantry.reload} />
          ) : !pantry.data ? (
            <ActivityIndicator color={colors.muted} style={styles.spinner} />
          ) : visible.length === 0 ? (
            <Text style={[type.small, styles.empty]}>Nothing on this shelf.</Text>
          ) : (
            visible.map((item) => (
              <ShelfItem
                key={item._id}
                item={item}
                color={tint.card}
                onFinished={() => remove(item._id)}
                onTrashed={() => remove(item._id)}
                onMoveToFridge={
                  shelf === 'pantry'
                    ? () => {
                        // Fridge = Fresh shelf for this session.
                        move(item._id, 'fresh')
                        setShelf('fresh')
                      }
                    : undefined
                }
              />
            ))
          )}
        </View>
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

type ShelfItemProps = {
  item: PantryItem
  color: string
  onFinished: () => void
  onTrashed: () => void
  onMoveToFridge?: () => void
}

function ShelfItem({ item, color, onFinished, onTrashed, onMoveToFridge }: ShelfItemProps) {
  const days = item.expires_at ? daysUntil(item.expires_at) : null
  const urgent = days !== null && days <= EXPIRY_URGENT_DAYS

  return (
    <View style={[styles.item, { backgroundColor: color }]}>
      <View style={styles.itemBody}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          {item.quantity} {item.unit}
        </Text>
        {item.expires_at ? (
          <Text style={[styles.itemMeta, urgent && styles.urgent]}>{expiryLabel(item.expires_at)}</Text>
        ) : null}
      </View>
      <View style={styles.itemActions}>
        <ItemAction label="Finished" onPress={onFinished} />
        <ItemAction label="Trashed" onPress={onTrashed} />
        {onMoveToFridge ? <ItemAction label="Move to fridge" onPress={onMoveToFridge} /> : null}
      </View>
    </View>
  )
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
  tabs: { flexDirection: 'row' },
  tab: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderCurve: 'continuous',
  },
  tabLabel: { fontSize: 15, fontWeight: '500', color: colors.muted },
  tabLabelActive: { color: colors.ink, fontWeight: '600' },
  panel: {
    minHeight: 360,
    padding: 12,
    gap: 10,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  panelFirst: { borderTopLeftRadius: 0 },
  panelLast: { borderTopRightRadius: 0 },
  spinner: { marginTop: 40 },
  empty: { textAlign: 'center', marginTop: 40 },
  item: {
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
