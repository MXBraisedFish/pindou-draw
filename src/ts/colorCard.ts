export type ColorType = 'solid' | 'transparent' | 'pearl' | 'glow' | 'thermo' | 'photo'

export interface ColorEntry {
  id: string
  type: ColorType
  color1: string
  color2: string | null
}

export interface ColorCard {
  name: string
  author: string
  version?: number
  colors: ColorEntry[]
}

export const COLOR_TYPE_LABELS: Record<ColorType, string> = {
  solid: '固定色',
  transparent: '透明色',
  pearl: '珠光色',
  glow: '夜光色',
  thermo: '温变色',
  photo: '光变色',
}

export const COLOR_TYPE_ICONS: Record<ColorType, string> = {
  solid: '',
  transparent: '◈',
  pearl: '✦',
  glow: '☾',
  thermo: '🌡',
  photo: '☀',
}

export function validateColorCard(json: unknown): json is ColorCard {
  if (!json || typeof json !== 'object') return false
  const card = json as Record<string, unknown>
  if (typeof card.name !== 'string') return false
  if (typeof card.author !== 'string') return false
  if (!Array.isArray(card.colors)) return false
  const validTypes = new Set<ColorType>(['solid', 'transparent', 'pearl', 'glow', 'thermo', 'photo'])
  for (const c of card.colors) {
    if (!c || typeof c !== 'object') return false
    const entry = c as Record<string, unknown>
    if (typeof entry.id !== 'string') return false
    if (!validTypes.has(entry.type as ColorType)) return false
    if (typeof entry.color1 !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.color1)) return false
    if (entry.color2 !== null && (typeof entry.color2 !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.color2))) return false
  }
  return true
}
