import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, ButtonText } from '@/components/Button'
import { stashReceiptPhoto } from '@/lib/receiptPhoto'
import { colors, radius, type } from '@/theme'

export default function CaptureReceipt() {
  const cameraRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)

  async function snap() {
    if (!cameraRef.current || capturing) return
    setCapturing(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        shutterSound: false,
      })
      if (!photo?.uri) return
      stashReceiptPhoto(photo.uri)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch {
      setCapturing(false)
    }
  }

  if (!permission) return <View style={styles.dark} />

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission}>
        <Ionicons name="camera-outline" size={40} color={colors.greenInk} />
        <View style={styles.permissionActions}>
          {permission.canAskAgain ? (
            <Button onPress={requestPermission}>
              <ButtonText>Allow camera</ButtonText>
            </Button>
          ) : (
            <Text style={[type.small, styles.center]}>Turn on camera access in Settings.</Text>
          )}
          <Button variant="ghost" onPress={() => router.back()}>
            <ButtonText variant="ghost">Not now</ButtonText>
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.dark}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setReady(true)}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.closeButton} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.frame} pointerEvents="none" />
        <Pressable
          onPress={snap}
          disabled={!ready || capturing}
          style={({ pressed }) => [styles.shutter, (!ready || capturing) && styles.shutterDisabled, pressed && styles.pressed]}
          accessibilityLabel="Take picture"
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: '84%',
    aspectRatio: 0.7,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: colors.green,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
  },
  shutterDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: colors.bg },
  permissionActions: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  center: { textAlign: 'center' },
})
