import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CartProvider } from '@/lib/cart'
import { GroupCartProvider } from '@/lib/groupCart'
import { PantryProvider } from '@/lib/pantry'
import { SessionProvider } from '@/lib/session'
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
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="convince" options={{ presentation: 'modal' }} />
              <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
              <Stack.Screen
                name="capture-receipt"
                options={{ presentation: 'fullScreenModal', animation: 'fade' }}
              />
              <Stack.Screen name="checkout" options={sheet} />
              <Stack.Screen name="add-item" options={sheet} />
              <Stack.Screen name="upload-receipt" options={sheet} />
              <Stack.Screen name="group-cart" options={sheet} />
              <Stack.Screen name="profile" options={sheet} />
            </Stack>
          </GroupCartProvider>
        </PantryProvider>
      </CartProvider>
    </SessionProvider>
  )
}
