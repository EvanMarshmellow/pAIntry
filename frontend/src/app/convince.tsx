import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { router, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, ButtonIcon, ButtonText } from '@/components/Button'
import { Notice } from '@/components/Notice'
import { ProductThumb } from '@/components/ProductThumb'
import { api, type ConvinceInput, type Verdict } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/format'
import { useUser } from '@/lib/session'
import { useAsync } from '@/lib/useAsync'
import { colors, radius, type, verdictColors } from '@/theme'

const SOURCE_LABEL: Record<Verdict['source'], string> = {
  grok: 'Explained by Grok',
  gemini: 'Explained by Gemini',
  engine: 'Rule-based verdict',
}

function param(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value?.trim() || undefined
}

export default function ConvinceMe() {
  const user = useUser()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ productId?: string; barcode?: string; query?: string }>()
  const productId = param(params.productId)
  const barcode = param(params.barcode)
  const query = param(params.query)

  const input: ConvinceInput | null = productId
    ? { product_id: productId }
    : barcode
      ? { barcode }
      : query
        ? { query }
        : null

  const result = useAsync(
    () =>
      input
        ? api.convinceMe(user._id, input)
        : Promise.reject(new Error('No product to evaluate — try scanning again.')),
    input ? `${user._id}|${JSON.stringify(input)}` : 'missing',
  )

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Convince Me</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {result.status === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.greenInk} />
          <Text style={type.small}>Weighing it up…</Text>
        </View>
      ) : result.status === 'error' ? (
        <View style={styles.padded}>
          <Notice message={result.error.message} onRetry={result.reload} />
        </View>
      ) : (
        <VerdictCard verdict={result.data} bottomInset={insets.bottom} />
      )}
    </View>
  )
}

function VerdictCard({ verdict, bottomInset }: { verdict: Verdict; bottomInset: number }) {
  const { dispatch } = useCart()
  const { product, alternative } = verdict.engine
  const tone = verdictColors[verdict.verdict]

  function addProduct() {
    if (product.price == null) return
    dispatch({
      type: 'add',
      item: {
        name: product.name,
        category: product.category,
        store: product.cheapest_store,
        price: product.price,
        proteinG: product.protein_g_per_package,
      },
    })
    done()
  }

  function addAlternative() {
    if (!alternative || alternative.price == null) return
    dispatch({
      type: 'add',
      item: {
        name: alternative.name,
        // Alternatives come from the same category as the product.
        category: product.category,
        store: alternative.store,
        price: alternative.price,
        proteinG: alternative.protein_g_per_package,
      },
    })
    done()
  }

  function done() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.back()
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.photo}>
          <ProductThumb category={product.category} size={96} />
          <View style={styles.photoText}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={type.small}>
              {[product.brand, product.price != null ? formatPrice(product.price) : null, product.cheapest_store]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.headlineBlock}>
          <View style={[styles.pill, { backgroundColor: tone.bg }]}>
            <Text style={[styles.pillText, { color: tone.ink }]}>{verdict.verdict}</Text>
          </View>
          <Text style={styles.headline}>{verdict.headline}</Text>
        </View>

        {verdict.better_alternative ? (
          <View style={styles.alt}>
            <Ionicons name="swap-horizontal" size={20} color={colors.greenInk} />
            <View style={styles.altText}>
              <Text style={styles.altName}>{verdict.better_alternative.name}</Text>
              <Text style={type.small}>
                {[
                  verdict.better_alternative.store,
                  verdict.better_alternative.price != null ? formatPrice(verdict.better_alternative.price) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {verdict.savings > 0 ? (
              <Text style={styles.savings}>Save {formatPrice(verdict.savings)}</Text>
            ) : null}
          </View>
        ) : null}

        {verdict.reasons.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why this?</Text>
            {verdict.reasons.map((reason) => (
              <View key={reason} style={styles.reason}>
                <View style={styles.dot} />
                <Text style={[type.body, styles.reasonText]}>{reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.sources}>
          <Text style={styles.sourceLabel}>{SOURCE_LABEL[verdict.source]}</Text>
          {verdict.data_sources.map((s) => (
            <Text key={s} style={styles.sourceItem}>{s}</Text>
          ))}
          <Text style={styles.sourceItem}>General nutrition info, not medical advice.</Text>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(bottomInset, 16) }]}>
        {verdict.verdict === 'Swap' && alternative ? (
          <>
            <Button variant="secondary" onPress={addProduct} style={styles.action}>
              <ButtonText>Keep original</ButtonText>
            </Button>
            <Button onPress={addAlternative} style={styles.action}>
              <ButtonIcon name="swap-horizontal" />
              <ButtonText>Swap</ButtonText>
            </Button>
          </>
        ) : verdict.verdict === 'Skip' ? (
          <>
            <Button variant="secondary" onPress={addProduct} style={styles.action}>
              <ButtonText>Add anyway</ButtonText>
            </Button>
            <Button onPress={() => router.back()} style={styles.action}>
              <ButtonText>Skip it</ButtonText>
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={() => router.back()} style={styles.action}>
              <ButtonText>Skip</ButtonText>
            </Button>
            <Button onPress={addProduct} style={styles.action}>
              <ButtonIcon name="add" />
              <ButtonText>Add to cart</ButtonText>
            </Button>
          </>
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { height: 56, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  close: { position: 'absolute', right: 16 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  padded: { padding: 20 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 24 },
  photo: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.mint,
  },
  photoText: { alignItems: 'center', gap: 4 },
  productName: { fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  headlineBlock: { gap: 12, alignItems: 'flex-start' },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  pillText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  alt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
  },
  altText: { flex: 1, gap: 2 },
  altName: { fontSize: 15, fontWeight: '600', color: colors.greenInk },
  savings: { fontSize: 15, fontWeight: '700', color: colors.greenInk },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  reason: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green, marginTop: 8 },
  reasonText: { flex: 1 },
  sources: { gap: 2, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sourceLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  sourceItem: { fontSize: 13, lineHeight: 18, color: colors.faint },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  action: { flex: 1 },
})
