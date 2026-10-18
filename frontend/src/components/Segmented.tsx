import * as Haptics from 'expo-haptics'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius } from '@/theme'

type Props<T extends string> = {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** `pill` (default): the main Shopping / Pantry switch. `text`: a lighter
   * secondary switch, no background, active label in bold black. */
  variant?: 'pill' | 'text'
}

// The Shopping / Pantry switch from the wireframe: a soft mint pill marks the active side.
export function Segmented<T extends string>({ options, value, onChange, variant = 'pill' }: Props<T>) {
  const text = variant === 'text'
  return (
    <View style={text ? styles.textTrack : styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return
              Haptics.selectionAsync()
              onChange(option.value)
            }}
            style={text ? styles.textSegment : [styles.segment, active && styles.active]}
          >
            <Text
              style={
                text
                  ? [styles.textLabel, active && styles.textLabelActive]
                  : [styles.label, active && styles.activeLabel]
              }
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  active: {
    backgroundColor: colors.mint,
    boxShadow: '0 1px 2px rgba(36, 83, 44, 0.08)',
  },
  label: { fontSize: 15, fontWeight: '500', color: colors.muted },
  activeLabel: { color: colors.greenInk, fontWeight: '600' },
  textTrack: { flexDirection: 'row' },
  textSegment: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  textLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  textLabelActive: { color: colors.ink, fontWeight: '700' },
})
