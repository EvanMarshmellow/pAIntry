import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Notice } from '@/components/Notice'
import { CartProvider } from '@/lib/cart'
import { GroupCartProvider } from '@/lib/groupCart'
import { PantryProvider } from '@/lib/pantry'
import { SessionProvider, useSession } from '@/lib/session'
import { colors } from '@/theme'

export const unstable_settings = { anchor: 'index' }

const sheet = {
  presentation: 'formSheet' as const,
  sheetAllowedDetents: 'fitToContents' as const,
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <CartProvider>
        <PantryProvider>
          <GroupCartProvider>
            <StatusBar style="dark" />
            <Routes />
          </GroupCartProvider>
        </PantryProvider>
      </CartProvider>
    </SessionProvider>
  )
}

function Routes() {
  const { status, user, retry } = useSession()

  if (status === 'restoring') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.greenInk} />
      </View>
    )
  }
  if (status === 'offline') {
    return (
      <View style={styles.center}>
        <Notice message="Can't reach pAIntry right now. The server may be waking up." onRetry={retry} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" />
        <Stack.Screen name="convince" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen
          name="capture-receipt"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen name="add-item" options={sheet} />
        <Stack.Screen name="upload-receipt" options={sheet} />
        <Stack.Screen name="group-cart" options={sheet} />
        <Stack.Screen name="profile" options={sheet} />
      </Stack.Protected>
    </Stack>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
})
