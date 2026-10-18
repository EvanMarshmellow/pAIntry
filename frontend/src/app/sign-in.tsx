import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, ButtonText } from '@/components/Button'
import { DEMO_USER_ID } from '@/lib/api'
import { useSession } from '@/lib/session'
import { colors, radius, type } from '@/theme'

export default function SignIn() {
  const { signIn } = useSession()
  const [userId, setUserId] = useState('')
  const [pending, setPending] = useState<'form' | 'demo' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(id: string, source: 'form' | 'demo') {
    setPending(source)
    setError(null)
    try {
      await signIn(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPending(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Ionicons name="bag-handle-outline" size={44} color={colors.greenInk} />
          </View>
          <Text style={type.title}>pAIntry</Text>
          <Text style={[type.body, styles.tagline]}>
            Knows your kitchen, your body, and your budget.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={userId}
            onChangeText={setUserId}
            placeholder="User ID"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => userId.trim() && submit(userId, 'form')}
            style={styles.input}
          />
          {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
          <Button
            onPress={() => submit(userId, 'form')}
            disabled={!userId.trim()}
            loading={pending === 'form'}
          >
            <ButtonText>Continue</ButtonText>
          </Button>
          <Button variant="ghost" onPress={() => submit(DEMO_USER_ID, 'demo')} loading={pending === 'demo'}>
            <ButtonText variant="ghost">Use the demo account</ButtonText>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 48 },
  hero: { alignItems: 'center', gap: 12 },
  badge: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tagline: { color: colors.muted, textAlign: 'center' },
  form: { gap: 12 },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.mint,
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger },
})
