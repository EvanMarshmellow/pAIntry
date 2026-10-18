import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps, ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '@/theme'

type Variant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = {
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  style?: ComponentProps<typeof View>['style']
  children: ReactNode
}

export function Button({ onPress, variant = 'primary', disabled, loading, style, children }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.greenInk} /> : children}
    </Pressable>
  )
}

export function ButtonText({ children, variant = 'primary' }: { children: ReactNode; variant?: Variant }) {
  return <Text style={[styles.text, variant === 'ghost' && styles.ghostText]}>{children}</Text>
}

export function ButtonIcon({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  return <Ionicons name={name} size={18} color={colors.greenInk} />
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: { backgroundColor: colors.green },
  secondary: { backgroundColor: colors.surface },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  text: { fontSize: 15, fontWeight: '600', color: colors.greenInk },
  ghostText: { color: colors.muted },
})
