import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { DEMO_USER_ID, api, type User } from './api'

// Login is disabled for local UI work — always start as Maya.
export const DEMO_USER: User = {
  _id: DEMO_USER_ID,
  name: 'Maya',
  persona: 'Busy student on a budget',
  weekly_budget: 60,
  goals: { protein_g_per_day: 120 },
  allergies: ['peanuts'],
}

type Session = {
  user: User | null
  signIn: (userId: string) => Promise<void>
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

// The backend has no auth yet: "signing in" means loading a user by id.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEMO_USER)

  const value = useMemo<Session>(
    () => ({
      user,
      signIn: async (userId) => setUser(await api.user(userId.trim())),
      // Keep login disabled: never drop back to the sign-in screen.
      signOut: () => setUser(DEMO_USER),
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
