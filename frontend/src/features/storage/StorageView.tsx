import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Segmented } from '@/components/Segmented'
import { api } from '@/lib/api'
import { usePantryOverrides } from '@/lib/pantry'
import { useUser } from '@/lib/session'
import { useAsync } from '@/lib/useAsync'
import { colors } from '@/theme'
import { GroceriesView } from './GroceriesView'
import { NutritionView } from './NutritionView'

const TABS = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'nutrition', label: 'Nutrition' },
] as const

type Tab = (typeof TABS)[number]['value']

export function StorageView() {
  const user = useUser()
  const { version } = usePantryOverrides()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>('groceries')
  // Fetched here so both tabs share one copy of the pantry.
  const pantry = useAsync(() => api.pantry(user._id), `${user._id}|${version}`)

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        {tab === 'groceries' ? <GroceriesView pantry={pantry} /> : <NutritionView pantry={pantry.data ?? []} />}
      </View>
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
})
