import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, ButtonText } from '@/components/Button'
import { colors, radius, type } from '@/theme'

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const

// Wireframe: "Convince Me Card" scanning screen.
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions()
  // A ref, not state: the camera fires many events per second and we only want the first.
  const scanned = useRef(false)

  function onScanned({ data }: BarcodeScanningResult) {
    if (scanned.current) return
    scanned.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    // Use a query string so the barcode always lands on /convince (object params were dropping it).
    router.replace(`/convince?barcode=${encodeURIComponent(String(data))}`)
  }

  if (!permission) return <View style={styles.dark} />

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission}>
        <Ionicons name="camera-outline" size={40} color={colors.greenInk} />
        <Text style={styles.permissionTitle}>Scan products in the store</Text>
        <Text style={[type.small, styles.center]}>
          pAIntry uses the camera only to read barcodes.
        </Text>
        <View style={styles.permissionActions}>
          {permission.canAskAgain ? (
            <Button onPress={requestPermission}>
              <ButtonText>Allow camera</ButtonText>
            </Button>
          ) : (
            <Text style={[type.small, styles.center]}>Turn on camera access in Settings to scan.</Text>
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
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={onScanned}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.closeButton} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.hint}>Point at a product barcode</Text>
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
    width: '80%',
    aspectRatio: 1.6,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: colors.green,
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    marginBottom: 24,
  },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: colors.bg },
  permissionTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  permissionActions: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  center: { textAlign: 'center' },
})
