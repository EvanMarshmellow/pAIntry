import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CartProvider } from '@/lib/cart'
import { PantryProvider } from '@/lib/pantry'
import { SessionProvider, useSession } from '@/lib/session'
import { colors } from '@/theme'

export const unstable_settings = { anchor: 'index' }

export default function RootLayout() {
  return (
    <SessionProvider>
      <CartProvider>
        <PantryProvider>
          <StatusBar style="dark" />
          <RootStack />
        </PantryProvider>
      </CartProvider>
    </SessionProvider>
  )
}

function RootStack() {
  const { user } = useSession()

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
          name="checkout"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="add-item"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
          }}
        />
      </Stack.Protected>
    </Stack>
  )
}
