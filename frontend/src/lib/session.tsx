import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { api, type User } from './api'

type Session = {
  user: User | null
  signIn: (userId: string) => Promise<void>
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

// The backend has no auth yet: "signing in" means loading a user by id.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const value = useMemo<Session>(
    () => ({
      user,
      signIn: async (userId) => setUser(await api.user(userId.trim())),
      signOut: () => setUser(null),
    }),
    [user],
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
