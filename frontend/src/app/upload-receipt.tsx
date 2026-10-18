import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { api, type ReceiptLine } from '@/lib/api'
import { usePantryOverrides } from '@/lib/pantry'
import { readReceipt } from '@/lib/perceptron'
import { consumeReceiptPhoto, type ReceiptPhoto } from '@/lib/receiptPhoto'
import { useUser } from '@/lib/session'
import { colors, radius, type } from '@/theme'

type Phase = 'idle' | 'reading' | 'review' | 'saving' | 'saved'

export default function UploadReceipt() {
  const user = useUser()
  const { refresh } = usePantryOverrides()
  const [photo, setPhoto] = useState<ReceiptPhoto | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function choose(next: ReceiptPhoto) {
    setPhoto(next)
    setPhase('idle')
    setLines([])
    setError(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  useFocusEffect(
    useCallback(() => {
      const captured = consumeReceiptPhoto()
      if (captured) choose(captured)
    }, []),
  )

  async function pickFromGallery() {
    setPicking(true)
    setError(null)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        setError('Photo library access is needed to upload a receipt.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
      })
      const asset = result.canceled ? null : result.assets[0]
      if (!asset) return
      choose({ uri: asset.uri, base64: asset.base64 ?? null, mimeType: asset.mimeType ?? 'image/jpeg' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the gallery')
    } finally {
      setPicking(false)
    }
  }

  // Perceptron reads the photo on-device, then the backend matches lines to the catalog.
  async function read() {
    if (!photo?.base64) {
      setError("Couldn't load that photo. Try taking it again.")
      return
    }
    setPhase('reading')
    setError(null)
    try {
      const ocr = await readReceipt(photo.base64, photo.mimeType)
      if (ocr.items.length === 0) {
        setError('No grocery lines found on that photo.')
        setPhase('idle')
        return
      }
      const pushed = await api.pushReceipt(user._id, ocr)
      setLines(pushed.lines)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the receipt')
      setPhase('idle')
    }
  }

  async function addToPantry() {
    setPhase('saving')
    setError(null)
    try {
      for (const line of lines) {
        await api.addPantryItem(user._id, {
          name: line.catalog_name ?? line.ocr_name,
          quantity: Number.parseFloat(line.quantity ?? '') || 1,
          unit: 'item',
          ...(line.product_id ? { product_id: line.product_id } : {}),
        })
      }
      refresh()
      setPhase('saved')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add items to your pantry')
      setPhase('review')
    }
  }

  const busy = picking || phase === 'reading' || phase === 'saving'

  return (
    <View style={styles.sheet}>
      <SheetHeader />

      {phase === 'review' || phase === 'saving' || phase === 'saved' ? (
        <View style={styles.block}>
          <Text style={styles.heading}>
            {phase === 'saved' ? `Added ${lines.length} to your pantry` : `Found ${lines.length} items`}
          </Text>
          <ScrollView style={styles.lines} contentContainerStyle={styles.linesContent}>
            {lines.map((line, i) => (
              <View key={`${line.ocr_name}-${i}`} style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={type.body} numberOfLines={1}>
                    {line.catalog_name ?? line.ocr_name}
                  </Text>
                  {line.catalog_name && line.catalog_name !== line.ocr_name ? (
                    <Text style={type.small} numberOfLines={1}>
                      Receipt: {line.ocr_name}
                    </Text>
                  ) : null}
                </View>
                {line.price ? <Text style={type.small}>{line.price}</Text> : null}
              </View>
            ))}
          </ScrollView>
          {phase === 'saved' ? (
            <Button onPress={() => router.back()}>
              <ButtonText>Done</ButtonText>
            </Button>
          ) : (
            <>
              <Button onPress={addToPantry} loading={phase === 'saving'}>
                <ButtonText>Add to pantry</ButtonText>
              </Button>
              <Button variant="ghost" onPress={() => setPhase('idle')} disabled={busy}>
                <ButtonText variant="ghost">Back</ButtonText>
              </Button>
            </>
          )}
        </View>
      ) : (
        <>
          <Button variant="secondary" onPress={pickFromGallery} loading={picking} disabled={busy}>
            <Ionicons name="images-outline" size={18} color={colors.greenInk} />
            <ButtonText variant="secondary">Upload from gallery</ButtonText>
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setError(null)
              router.push('/capture-receipt')
            }}
            disabled={busy}
          >
            <Ionicons name="camera-outline" size={18} color={colors.greenInk} />
            <ButtonText variant="secondary">Take a picture</ButtonText>
          </Button>

          {photo ? (
            <View style={styles.block}>
              <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
              <Button onPress={read} loading={phase === 'reading'} disabled={busy}>
                <ButtonText>Read receipt</ButtonText>
              </Button>
              {phase === 'reading' ? (
                <Text style={[type.small, styles.center]}>Reading line items…</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 12, backgroundColor: colors.bg },
  block: { gap: 12, marginTop: 8 },
  heading: { fontSize: 17, fontWeight: '600', color: colors.ink },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  lines: {
    maxHeight: 320,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  linesContent: { padding: 12, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineText: { flex: 1, gap: 2 },
  center: { textAlign: 'center' },
  error: { color: colors.danger },
})
