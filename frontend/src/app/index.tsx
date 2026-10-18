import Ionicons from '@expo/vector-icons/Ionicons'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Segmented } from '@/components/Segmented'
import { ShoppingView } from '@/features/shopping/ShoppingView'
import { StorageView } from '@/features/storage/StorageView'
import { colors } from '@/theme'

const SECTIONS = [
  { value: 'shopping', label: 'Shopping' },
  { value: 'storage', label: 'Storage' },
] as const

type Section = (typeof SECTIONS)[number]['value']

export default function Home() {
  const [section, setSection] = useState<Section>('shopping')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Text style={styles.greeting}>Hi,</Text>
          <Link href="/profile" asChild>
            <Pressable hitSlop={8} accessibilityLabel="Profile">
              <Ionicons name="person-circle-outline" size={32} color={colors.ink} />
            </Pressable>
          </Link>
        </View>
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
      </View>
      {section === 'shopping' ? <ShoppingView /> : <StorageView />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.ink },
})
