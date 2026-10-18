import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { api, API_URL } from '@/lib/api'
import { formatPrice } from '@/lib/format'
import { useSession, useUser } from '@/lib/session'
import { colors, radius, type } from '@/theme'

export default function Profile() {
  const user = useUser()
  const { signOut, refresh } = useSession()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows: [string, string][] = [
    ['Weekly budget', user.weekly_budget > 0 ? formatPrice(user.weekly_budget) : 'Not set'],
    ['Protein goal', user.goals.protein_g_per_day ? `${user.goals.protein_g_per_day} g / day` : 'Not set'],
    ['Allergies', user.allergies.length ? user.allergies.join(', ') : 'None'],
    ['iMessage', user.phone || 'Not connected'],
  ]

  async function sendCode() {
    setBusy(true)
    setError(null)
    try {
      const sent = await api.startPhoneLink(user._id, phone)
      setSentTo(sent.phone)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not text a code')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    if (!sentTo) return
    setBusy(true)
    setError(null)
    try {
      await api.verifyPhoneLink(user._id, sentTo, code)
      await refresh()
      setSentTo(null)
      setCode('')
      setPhone('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.sheet}>
      <SheetHeader />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initial}>{user.name.charAt(0)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{user.name}</Text>
          {user.persona ? <Text style={type.small}>{user.persona}</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={type.small}>{label}</Text>
            <Text style={type.body}>{value}</Text>
          </View>
        ))}
      </View>

      {user.phone ? null : (
        <View style={styles.link}>
          <Text style={styles.linkTitle}>Connect iMessage</Text>
          <Text style={type.small}>
            We’ll text a code. After that, this number’s grocery list is the one in the app.
          </Text>
          {sentTo ? (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              style={styles.input}
            />
          ) : (
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={colors.faint}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              style={styles.input}
            />
          )}
          {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
          {sentTo ? (
            <Button onPress={verifyCode} loading={busy} disabled={code.trim().length < 6}>
              <ButtonText>Connect number</ButtonText>
            </Button>
          ) : (
            <Button onPress={sendCode} loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
              <ButtonText>Text me a code</ButtonText>
            </Button>
          )}
        </View>
      )}

      <Button
        variant="secondary"
        onPress={() => {
          router.back()
          signOut()
        }}
      >
        <ButtonText>Sign out</ButtonText>
      </Button>
      <Text style={styles.footnote}>Connected to {API_URL}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 20, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 22, fontWeight: '700', color: colors.greenInk },
  headerText: { gap: 2 },
  name: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  card: {
    padding: 16,
    gap: 14,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  link: { gap: 12 },
  linkTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.mint,
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger },
  footnote: { fontSize: 13, color: colors.faint, textAlign: 'center' },
})
