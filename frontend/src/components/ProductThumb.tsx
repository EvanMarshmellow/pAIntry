import { Image, StyleSheet, View } from 'react-native'
import { colors, radius } from '@/theme'

const grainArt = require('../../assets/elements/grain.png')
const proteinArt = require('../../assets/elements/protein.png')
const sweetArt = require('../../assets/elements/sweet.png')
const vegiesArt = require('../../assets/elements/vegies.png')

type FoodArt = 'grain' | 'protein' | 'sweet' | 'vegies'

const ART = {
  grain: grainArt,
  protein: proteinArt,
  sweet: sweetArt,
  vegies: vegiesArt,
} as const

// Catalog categories → food-group art from assets/elements.
// grain = carbs (pasta, flour, bread, cereal); vegies = vegetables & fruit.
const CATEGORY_ART: Record<string, FoodArt> = {
  dairy_eggs: 'protein',
  meat_seafood: 'protein',
  protein_alt: 'protein',
  pantry: 'grain', // rice, pasta, flour, oats, …
  bakery: 'grain', // bread, tortillas, …
  breakfast: 'grain', // cereal, granola, …
  produce: 'vegies', // vegetables & fruit
  frozen: 'vegies', // frozen veg / fruit in the sample catalog
  snacks: 'sweet',
  beverages: 'sweet',
}

export function ProductThumb({ category, size = 56 }: { category: string | null; size?: number }) {
  const key = (category && CATEGORY_ART[category]) || 'grain'
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Image source={ART[key]} style={{ width: size * 0.82, height: size * 0.82 }} resizeMode="contain" />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
