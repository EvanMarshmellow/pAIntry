import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'paintry.groupCartId'

type GroupCart = {
  groupCartId: string | null
  ready: boolean
  create: () => string
  join: (id: string) => void
  leave: () => void
}

const GroupCartContext = createContext<GroupCart | null>(null)

function newGroupCartId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 6; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)]
  return id
}

export function normalizeGroupCartId(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function GroupCartProvider({ children }: { children: ReactNode }) {
  const [groupCartId, setGroupCartId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (cancelled) return
      setGroupCartId(value)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<GroupCart>(
    () => ({
      groupCartId,
      ready,
      create: () => {
        const id = newGroupCartId()
        setGroupCartId(id)
        void AsyncStorage.setItem(STORAGE_KEY, id)
        return id
      },
      join: (raw) => {
        const id = normalizeGroupCartId(raw)
        if (id.length < 4) throw new Error('Enter a valid group cart ID')
        setGroupCartId(id)
        void AsyncStorage.setItem(STORAGE_KEY, id)
      },
      leave: () => {
        setGroupCartId(null)
        void AsyncStorage.removeItem(STORAGE_KEY)
      },
    }),
    [groupCartId, ready],
  )

  return <GroupCartContext value={value}>{children}</GroupCartContext>
}

export function useGroupCart() {
  const ctx = use(GroupCartContext)
  if (!ctx) throw new Error('useGroupCart must be used inside GroupCartProvider')
  return ctx
}
