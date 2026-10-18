import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { memo, useCallback, useMemo, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Notice } from '@/components/Notice'
import { ProductThumb } from '@/components/ProductThumb'
import { api, type Product } from '@/lib/api'
import { formatPrice } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { colors, radius, type } from '@/theme'

// Full-color cart from assets/elements/groceries cart.svg.
const cartArt = require('../../../assets/elements/shopping-cart.png')

type Row = {
  id: string
  name: string
  detail: string
  category: string
  fromPrice: number
}

function toRow(p: Product): Row {
  return {
    id: p._id,
    name: p.name,
    detail: `${p.brand} · ${p.size} ${p.unit}`,
    category: p.category,
    fromPrice: Math.min(...Object.values(p.prices)),
  }
}

export function AddPanel({ onDone }: { onDone?: () => void }) {
  const [query, setQuery] = useState('')
  const products = useAsync(() => api.products().then((list) => list.map(toRow)), 'products')

  // No browsable "All products" list: products only show as search results.
  const searching = query.trim().length > 0
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? (products.data ?? []).filter((r) => r.name.toLowerCase().includes(q)) : []
  }, [products.data, query])

  const openProduct = useCallback((id: string) => {
    router.push({ pathname: '/convince', params: { productId: id } })
  }, [])

  return (
    <FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={({ item }) => <ProductRow row={item} onPress={openProduct} />}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          {onDone ? (
            <Pressable onPress={onDone} style={styles.back} hitSlop={8}>
              <Ionicons name="arrow-back" size={18} color={colors.muted} />
              <Text style={type.small}>Back to cart</Text>
            </Pressable>
          ) : (
            <View style={styles.hero}>
              <Image source={cartArt} style={styles.heroCart} accessibilityLabel="Shopping cart" />
              <Text style={styles.heroTitle}>Add something to your cart</Text>
              <Text style={[type.small, styles.center]}>
                Pick a product and we&apos;ll tell you whether it&apos;s worth it.
              </Text>
            </View>
          )}

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search products"
              placeholderTextColor={colors.faint}
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.faint} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.scan, pressed && styles.pressed]}
          >
            <Ionicons name="barcode-outline" size={22} color={colors.greenInk} />
            <Text style={styles.scanLabel}>Scan a barcode</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.greenInk} />
          </Pressable>

          {searching ? <Text style={styles.sectionLabel}>Results</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !searching ? undefined : products.status === 'error' ? (
          <Notice message={products.error.message} onRetry={products.reload} />
        ) : products.status === 'success' ? (
          <Text style={[type.small, styles.center]}>No products match “{query}”.</Text>
        ) : undefined
      }
      ItemSeparatorComponent={Separator}
    />
  )
}

const keyOf = (row: Row) => row.id

function Separator() {
  return <View style={styles.separator} />
}

const ProductRow = memo(function ProductRow({ row, onPress }: { row: Row; onPress: (id: string) => void }) {
  return (
    <Pressable onPress={() => onPress(row.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ProductThumb category={row.category} size={48} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
        <Text style={type.small} numberOfLines={1}>{row.detail}</Text>
      </View>
      <Text style={type.small}>from {formatPrice(row.fromPrice)}</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { gap: 16, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  heroCart: { width: 96, height: 96, marginBottom: 8 },
  heroTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  center: { textAlign: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.mint,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
  },
  scanLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.greenInk },
  sectionLabel: { ...type.small, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 62 },
  pressed: { opacity: 0.6 },
})
