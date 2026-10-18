const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const longDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const formatPrice = (value: number) => currency.format(value)

export function formatDate(iso: string) {
  const date = new Date(iso)
  return (date.getFullYear() === new Date().getFullYear() ? shortDate : longDate).format(date)
}

const DAY_MS = 24 * 60 * 60 * 1000

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)
}

/** Highlight shelf / "use soon" rows at this threshold (inclusive). */
export const EXPIRY_URGENT_DAYS = 3

function relativeDays(days: number) {
  if (days < 0) {
    const n = Math.abs(days)
    return `${n} day${n === 1 ? '' : 's'} ago`
  }
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

/** Expiration date plus remaining (or overdue) days for list rows. */
export function expiryLabel(iso: string) {
  const days = daysUntil(iso)
  const when = formatDate(iso)
  if (days < 0) return `Expired ${when} · ${relativeDays(days)}`
  return `Expires ${when} · ${relativeDays(days)}`
}
