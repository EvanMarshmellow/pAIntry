import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { Button, ButtonText } from '@/components/Button'
import { SheetHeader } from '@/components/SheetHeader'
import { consumeReceiptPhoto } from '@/lib/receiptPhoto'
import { colors, radius, type } from '@/theme'

export default function UploadReceipt() {
  const [uri, setUri] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      const photo = consumeReceiptPhoto()
      if (!photo) return
      setUri(photo)
      setError(null)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }, []),
  )

  async function pickFromGallery() {
    setBusy(true)
    setError(null)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        setError('Photo library access is needed to upload a receipt.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })
      if (result.canceled || !result.assets[0]) return
      setUri(result.assets[0].uri)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the gallery')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.sheet}>
      <SheetHeader />

      <Button variant="secondary" onPress={pickFromGallery} loading={busy} disabled={busy}>
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

      {uri ? (
        <View style={styles.previewBlock}>
          <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
          <Button
            onPress={() => {
              Haptics.selectionAsync()
              router.back()
            }}
          >
            <ButtonText>Done</ButtonText>
          </Button>
        </View>
      ) : null}

      {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 32, gap: 12, backgroundColor: colors.bg },
  previewBlock: { gap: 12, marginTop: 8 },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger },
})
