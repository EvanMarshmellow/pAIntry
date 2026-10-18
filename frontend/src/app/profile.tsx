import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { API_URL } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import { useSession, useUser } from '@/lib/session'
import { colors, radius, type } from '@/theme'

export default function Profile() {
  const user = useUser()
  const { signOut } = useSession()
  const { dispatch } = useCart()

  const rows: [string, string][] = [
    ['Weekly budget', formatPrice(user.weekly_budget)],
    ['Protein goal', user.goals.protein_g_per_day ? `${user.goals.protein_g_per_day} g / day` : 'Not set'],
    ['Allergies', user.allergies.length ? user.allergies.join(', ') : 'None'],
  ]

  return (
    <View style={styles.sheet}>
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

      <Button
        variant="secondary"
        onPress={() => {
          router.back()
          dispatch({ type: 'clear' })
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footnote: { fontSize: 13, color: colors.faint, textAlign: 'center' },
})
