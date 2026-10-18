import { useEffect, useState } from 'react'

export type AsyncState<T> = (
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: Error }
) & { reload: () => void }

type Settled<T> = { key: string; data?: T; error?: Error }

// Minimal fetch hook. `key` identifies the request: when it changes, `load`
// runs again. Loading is derived (the settled key is stale), so the effect
// only sets state from the promise. Previous data stays visible meanwhile.
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [nonce, setNonce] = useState(0)
  const requestKey = `${key}#${nonce}`
  const [settled, setSettled] = useState<Settled<T>>({ key: '' })

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => !cancelled && setSettled({ key: requestKey, data }),
      (error: Error) => !cancelled && setSettled((prev) => ({ key: requestKey, error, data: prev.data })),
    )
    return () => {
      cancelled = true
    }
    // `load` is deliberately not a dependency: `key` is what identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const reload = () => setNonce((n) => n + 1)

  if (settled.key !== requestKey) return { status: 'loading', data: settled.data, reload }
  if (settled.error) return { status: 'error', error: settled.error, data: settled.data, reload }
  return { status: 'success', data: settled.data as T, reload }
}
