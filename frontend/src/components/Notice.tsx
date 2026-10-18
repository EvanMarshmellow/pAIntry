import Ionicons from '@expo/vector-icons/Ionicons'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonText } from './Button'
import { colors, radius, type } from '@/theme'

// Shared error / empty message with an optional retry.
export function Notice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.box}>
      <Ionicons name="cloud-offline-outline" size={22} color={colors.muted} />
      <Text style={[type.small, styles.text]}>{message}</Text>
      {onRetry ? (
        <Button variant="secondary" onPress={onRetry}>
          <ButtonText>Try again</ButtonText>
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    padding: 20,
    gap: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  text: { textAlign: 'center' },
})
