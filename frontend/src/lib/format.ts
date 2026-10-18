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

export function expiryLabel(days: number) {
  if (days < 0) return 'Expired'
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  if (days <= 60) return `Expires in ${days} days`
  return `Good for ${Math.round(days / 30)} months`
}
