import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Web pages are also rendered on the Expo server (app.json web.output "server"),
// where there's no window/localStorage: keep the session in memory there.
const isServer = typeof window === 'undefined'

// Supabase only proves who the person is (email code). Their data lives in
// MongoDB: the session token is exchanged for a user id at POST /login/supabase.
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: Platform.OS === 'web', // finishes an email magic link on web
  },
})
