import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { Segmented } from '@/components/Segmented'
import { api } from '@/lib/api'
import { LEFTOVER_UNIT, usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { colors, radius, shelves, type, type ShelfId } from '@/theme'

const SHELF_OPTIONS = (['fresh', 'pantry', 'leftover'] as const).map((id) => ({
  value: id,
  label: shelves[id].label,
}))

// Typical shelf life used to prefill "expires in".
const DEFAULT_DAYS: Record<ShelfId, string> = { fresh: '5', pantry: '180', leftover: '3' }

export default function AddItem() {
  const user = useUser()
  const { refresh } = usePantryOverrides()
  const [shelf, setShelf] = useState<ShelfId>('fresh')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('item')
  // null means "use the shelf's default", so switching shelves updates it until the user edits.
  const [days, setDays] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveDays = days ?? DEFAULT_DAYS[shelf]
  const qty = Number(quantity)
  const valid = name.trim().length > 0 && qty > 0 && Number(effectiveDays) >= 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const expires = new Date(Date.now() + Number(effectiveDays) * 24 * 60 * 60 * 1000)
      await api.addPantryItem(user._id, {
        name: name.trim(),
        quantity: qty,
        unit: shelf === 'leftover' ? LEFTOVER_UNIT : unit.trim() || 'item',
        expires_at: expires.toISOString(),
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
      <Text style={styles.title}>Add to storage</Text>
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
        <Field label="Expires in (days)">
          <TextInput value={effectiveDays} onChangeText={setDays} keyboardType="number-pad" style={styles.input} />
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
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
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
