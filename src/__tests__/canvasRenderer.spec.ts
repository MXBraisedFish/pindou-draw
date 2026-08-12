import { describe, expect, it } from 'vitest'
import { getRawModeColor } from '@/ts/canvasRenderer'
import type { ColorEntry } from '@/ts/colorCard'

describe('canvas render modes', () => {
  it('dims regular colors at night while preserving glow colors', () => {
    const solid: ColorEntry = {
      id: 'A1',
      type: 'solid',
      color1: '#808080',
      color2: null,
    }
    const glow: ColorEntry = {
      id: 'Y1',
      type: 'glow',
      color1: '#fa81ba',
      color2: '#ffffff',
    }

    expect(getRawModeColor(solid, 'night')).toBe('#3a3a3a')
    expect(getRawModeColor(glow, 'night')).toBe('#fa81ba')
  })
})
