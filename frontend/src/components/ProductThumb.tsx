import Ionicons from '@expo/vector-icons/Ionicons'
import type { ComponentProps } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radius } from '@/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

// Products have no photos in the sample data, so each category gets a glyph.
const CATEGORY_ICONS: Record<string, IconName> = {
  dairy_eggs: 'egg-outline',
  meat_seafood: 'fish-outline',
  protein_alt: 'leaf-outline',
  pantry: 'file-tray-stacked-outline',
  bakery: 'cafe-outline',
  produce: 'nutrition-outline',
  frozen: 'snow-outline',
  snacks: 'fast-food-outline',
  breakfast: 'sunny-outline',
  beverages: 'water-outline',
}

export function ProductThumb({ category, size = 56 }: { category: string | null; size?: number }) {
  const icon = (category && CATEGORY_ICONS[category]) || 'basket-outline'
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Ionicons name={icon} size={Math.round(size * 0.42)} color={colors.greenInk} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
