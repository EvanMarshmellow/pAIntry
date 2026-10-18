import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { Segmented } from '@/components/Segmented'
import { api } from '@/lib/api'
import { LEFTOVER_UNIT, usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { colors, radius, shelves, type, type ShelfId } from '@/theme'

const SHELF_OPTIONS = (['fresh', 'pantry', 'leftover'] as const).map((id) => ({
  value: id,
  label: shelves[id].label,
}))

// Typical shelf life used to prefill the expiration date.
const DEFAULT_DAYS: Record<ShelfId, number> = { fresh: 5, pantry: 180, leftover: 3 }

function addDays(days: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

function toInputDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseInputDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  return Number.isNaN(date.getTime()) ? null : date
}

export default function AddItem() {
  const user = useUser()
  const { refresh } = usePantryOverrides()
  const [shelf, setShelf] = useState<ShelfId>('fresh')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('item')
  // null means "use the shelf's default", so switching shelves updates it until the user edits.
  const [expiresOn, setExpiresOn] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveDate = expiresOn ?? toInputDate(addDays(DEFAULT_DAYS[shelf]))
  const parsed = parseInputDate(effectiveDate)
  const qty = Number(quantity)
  const valid = name.trim().length > 0 && qty > 0 && parsed != null

  async function save() {
    if (!parsed) return
    setSaving(true)
    setError(null)
    try {
      await api.addPantryItem(user._id, {
        name: name.trim(),
        quantity: qty,
        unit: shelf === 'leftover' ? LEFTOVER_UNIT : unit.trim() || 'item',
        expires_at: parsed.toISOString(),
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      refresh()
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <View style={styles.sheet}>
      <SheetHeader />
      <Segmented options={SHELF_OPTIONS} value={shelf} onChange={setShelf} />

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={shelf === 'leftover' ? 'e.g. Chicken fried rice' : 'e.g. Baby spinach'}
        placeholderTextColor={colors.faint}
        style={styles.input}
        autoFocus
      />
      <View style={styles.row}>
        <Field label="Quantity">
          <TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
        </Field>
        {shelf === 'leftover' ? null : (
          <Field label="Unit">
            <TextInput value={unit} onChangeText={setUnit} autoCapitalize="none" style={styles.input} />
          </Field>
        )}
        <Field label="Expiration date">
          <TextInput
            value={effectiveDate}
            onChangeText={setExpiresOn}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </Field>
      </View>

      {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
      <Button onPress={save} disabled={!valid} loading={saving}>
        <ButtonText>Save</ButtonText>
      </Button>
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={type.small}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 16, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 6 },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.mint,
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger },
})
