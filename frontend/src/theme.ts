// Design tokens taken from the Figma wireframe (file 76LvwXLZ5AYbJDG67D44FR).
export const colors = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  mint: '#E5F5E0',
  green: '#A8DCAB',
  greenInk: '#24532C',
  ink: '#121412',
  muted: '#6B706B',
  faint: '#A5AAA5',
  line: '#ECEFEA',
  placeholder: '#D9D9D9',
  danger: '#C2410C',
} as const

export type ShelfId = 'fresh' | 'pantry' | 'leftover'

// Each storage shelf is a "folder": a tab + panel tint, and a deeper card tint.
export const shelves: Record<ShelfId, { label: string; panel: string; card: string }> = {
  fresh: { label: 'Fresh', panel: '#FFE4E1', card: '#F7CAC1' },
  pantry: { label: 'Pantry', panel: '#FFFACD', card: '#FFEE75' },
  leftover: { label: 'Leftover', panel: '#E3F1FF', card: '#90D5FF' },
}

export const verdictColors = {
  Buy: { bg: '#E5F5E0', ink: '#24532C' },
  Swap: { bg: '#FFF4CC', ink: '#7A5A00' },
  Skip: { bg: '#FFE4E1', ink: '#9A2B1C' },
} as const

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const

// Two text sizes plus one display size; hierarchy comes from weight and color.
export const type = {
  body: { fontSize: 15, lineHeight: 21, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
} as const
