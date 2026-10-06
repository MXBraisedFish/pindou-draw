import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePaletteStore } from '@/stores/palette'
import type { ColorCard } from '@/ts/colorCard'
import { useCanvasStore } from '@/stores/canvas'

const card: ColorCard = {
  name: 'test',
  author: 'test',
  colors: Array.from({ length: 7 }, (_, index) => ({
    id: String(index),
    type: 'solid',
    color1: '#123456',
    color2: null,
  })),
}

describe('session color history', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('keeps five distinct colors in most recently selected order', () => {
    const palette = usePaletteStore()
    palette.loadCard(card)
    for (const entry of card.colors) palette.setColor(entry.id)
    expect(palette.recentColorIds).toEqual(['6', '5', '4', '3', '2'])
    palette.setColor('3')
    expect(palette.recentColorIds).toEqual(['3', '6', '5', '4', '2'])
    palette.setColor('invalid')
    expect(palette.recentColorIds).toHaveLength(5)
  })
  it('clears on card changes and keeps programmatic restoration out of history', () => {
    const palette = usePaletteStore()
    palette.registerCard(card)
    palette.registerCard({ ...card, name: 'other' })
    palette.setColor('3')
    palette.switchCard('other')
    expect(palette.recentColorIds).toEqual([])
    palette.setColor('4', false)
    expect(palette.currentColorId).toBe('4')
    expect(palette.recentColorIds).toEqual([])
    setActivePinia(createPinia())
    expect(usePaletteStore().recentColorIds).toEqual([])
  })

  it('keeps history on a cancelled switch and clears only when the switch completes', () => {
    const palette = usePaletteStore()
    palette.registerCard(card)
    palette.registerCard({ ...card, name: 'other' })
    useCanvasStore().setCell(0, 0, '#123456')
    palette.setColor('3')
    palette.switchCard('other')
    expect(palette.recentColorIds).toEqual(['3'])
    palette.cancelCardSwitch()
    expect(palette.recentColorIds).toEqual(['3'])
    palette.switchCard('other')
    palette.executeCardSwitch()
    expect(palette.activeCard?.name).toBe('other')
    expect(palette.recentColorIds).toEqual([])
  })
})
