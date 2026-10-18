import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAllergies } from './allergies'
import { ApiError, api, type User } from './api'
import { supabase } from './supabase'

// AsyncStorage is localStorage on web.
const USER_ID_KEY = 'user_id'

// restoring: reading the saved id on launch. offline: saved id, but the server
// couldn't be reached, so we keep the id and offer a retry instead of signing out.
type Status = 'restoring' | 'offline' | 'ready'

type Session = {
  status: Status
  user: User | null
  signIn: (userId: string) => Promise<void>
  signOut: () => void
  retry: () => void
}

const SessionContext = createContext<Session | null>(null)

// Allergies set at sign-in live on this device until the backend accepts them,
// so they override the server's list.
async function loadUser(userId: string): Promise<User> {
  const [user, allergies] = await Promise.all([api.user(userId), loadAllergies(userId)])
  return allergies ? { ...user, allergies } : user
}

async function forget() {
  await AsyncStorage.removeItem(USER_ID_KEY).catch(() => {})
}

// Sign-in is a Supabase email code exchanged at /login/supabase; the session is the Mongo user id.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<Status>('restoring')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(USER_ID_KEY)
      .catch(() => null)
      .then(async (id) => {
        if (!id) return null
        try {
          return await loadUser(id)
        } catch (e) {
          // A bad or deleted id means signing in again; anything else is the network.
          if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
            await forget()
            return null
          }
          throw e
        }
      })
      .then(
        (restored) => {
          if (cancelled) return
          setUser(restored)
          setStatus('ready')
        },
        () => !cancelled && setStatus('offline'),
      )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      signIn: async (userId) => {
        const next = await loadUser(userId)
        await AsyncStorage.setItem(USER_ID_KEY, userId).catch(() => {})
        setUser(next)
      },
      signOut: () => {
        void supabase.auth.signOut()
        forget()
        setUser(null)
        setStatus('ready')
      },
      retry: () => {
        setStatus('restoring')
        setAttempt((n) => n + 1)
      },
    }),
    [status, user],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}

export function useSession() {
  const ctx = use(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

// For screens that only render once signed in (the root layout guards this).
export function useUser() {
  const { user } = useSession()
  if (!user) throw new Error('No signed-in user')
  return user
}
