import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { normalizeGroupCartId, useGroupCart } from '@/lib/groupCart'
import { colors, radius, type } from '@/theme'

type Mode = 'home' | 'join'

export default function GroupCartSheet() {
  const { groupCartId, create, join, leave } = useGroupCart()
  const [mode, setMode] = useState<Mode>('home')
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copyId(id: string) {
    await Clipboard.setStringAsync(id)
    setCopied(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTimeout(() => setCopied(false), 1600)
  }

  function onCreate() {
    const id = create()
    setMode('home')
    setError(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    void copyId(id)
  }

  function onJoin() {
    setError(null)
    try {
      join(draft)
      setDraft('')
      setMode('home')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join')
    }
  }

  if (mode === 'join') {
    return (
      <View style={styles.sheet}>
        <SheetHeader onBack={() => setMode('home')} />
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(normalizeGroupCartId(t))}
          placeholder="Group cart ID"
          placeholderTextColor={colors.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
        <Button onPress={onJoin} disabled={draft.length < 4}>
          <ButtonText>Join</ButtonText>
        </Button>
      </View>
    )
  }

  if (groupCartId) {
    return (
      <View style={styles.sheet}>
        <SheetHeader />
        <View style={styles.idCard}>
          <Text style={styles.idValue} selectable>
            {groupCartId}
          </Text>
        </View>
        <Button
          onPress={() => {
            void copyId(groupCartId)
          }}
        >
          <Ionicons name="copy-outline" size={18} color={colors.greenInk} />
          <ButtonText>{copied ? 'Copied' : 'Copy ID'}</ButtonText>
        </Button>
        <Button variant="secondary" onPress={() => setMode('join')}>
          <ButtonText variant="secondary">Join a different cart</ButtonText>
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            leave()
            Haptics.selectionAsync()
          }}
        >
          <ButtonText variant="ghost">Leave group cart</ButtonText>
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.sheet}>
      <SheetHeader />
      <Button onPress={onCreate}>
        <Ionicons name="add-circle-outline" size={18} color={colors.greenInk} />
        <ButtonText>Create group cart</ButtonText>
      </Button>
      <Button variant="secondary" onPress={() => setMode('join')}>
        <Ionicons name="enter-outline" size={18} color={colors.greenInk} />
        <ButtonText variant="secondary">Join group cart</ButtonText>
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 12, backgroundColor: colors.bg },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.mint,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.ink,
  },
  idCard: {
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
  },
  idValue: { fontSize: 28, fontWeight: '700', color: colors.greenInk, letterSpacing: 3 },
  error: { color: colors.danger },
})
