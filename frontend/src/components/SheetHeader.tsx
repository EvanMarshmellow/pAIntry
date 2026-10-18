import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { colors } from '@/theme'

type Props = {
  /** Defaults to dismissing the sheet. */
  onBack?: () => void
}

export function SheetHeader({ onBack }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={10}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  pressed: { opacity: 0.55 },
})
