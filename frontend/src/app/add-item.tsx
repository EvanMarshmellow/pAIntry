import * as Haptics from 'expo-haptics'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, ButtonIcon, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { api } from '@/lib/api'
import { lookupBarcode, searchQuery } from '@/lib/openFoodFacts'
import { usePantryOverrides } from '@/lib/pantry'
import { consumeScannedBarcode } from '@/lib/scannedBarcode'
import { useUser } from '@/lib/session'
import { colors, radius, type } from '@/theme'

// The expiration date starts a week out; the user edits it if needed.
const DEFAULT_DAYS = 7

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
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('item')
  const [expiresOn, setExpiresOn] = useState(() => toInputDate(addDays(DEFAULT_DAYS)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)

  // Back from the scanner: name the product with Open Food Facts, then the user saves it.
  useFocusEffect(
    useCallback(() => {
      const code = consumeScannedBarcode()
      if (!code) return
      setLookingUp(true)
      setError(null)
      setScanNote(null)
      lookupBarcode(code)
        .then((product) => {
          if (product) {
            setName(searchQuery(product))
            setScanNote(product.quantity ? `Found ${product.quantity}` : 'Found it')
          } else {
            setScanNote(`Barcode ${code} isn’t in Open Food Facts. Type the name instead.`)
          }
        })
        .finally(() => setLookingUp(false))
    }, []),
  )

  const parsed = parseInputDate(expiresOn)
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
        unit: unit.trim() || 'item',
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

      <Button
        variant="secondary"
        onPress={() => router.push('/scan?for=pantry')}
        loading={lookingUp}
        disabled={saving}
      >
        <ButtonIcon name="barcode-outline" />
        <ButtonText>Scan barcode</ButtonText>
      </Button>
      {scanNote ? <Text style={type.small}>{scanNote}</Text> : null}

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Baby spinach"
        placeholderTextColor={colors.faint}
        style={styles.input}
        autoFocus
      />
      <View style={styles.row}>
        <Field label="Quantity">
          <TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
        </Field>
        <Field label="Unit">
          <TextInput value={unit} onChangeText={setUnit} autoCapitalize="none" style={styles.input} />
        </Field>
        <Field label="Expiration date">
          <TextInput
            value={expiresOn}
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
