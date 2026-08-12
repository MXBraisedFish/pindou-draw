import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ColorEntry, ColorCard } from '@/ts/colorCard'
import { validateColorCard } from '@/ts/colorCard'
import { findBestMatch } from '@/ts/colorDistance'
import { useCanvasStore } from '@/stores/canvas'

const cardModules = import.meta.glob<{ default: unknown }>(
  '@/assets/color_card/*.json',
)

async function loadAllCards(): Promise<ColorCard[]> {
  const cards: ColorCard[] = []
  for (const [path, loader] of Object.entries(cardModules)) {
    const mod = await loader()
    const raw = mod.default
    if (validateColorCard(raw)) {
      cards.push(raw)
    }
  }
  // DMC 排第一作为默认
  const dmcIdx = cards.findIndex(c => c.name === 'DMC')
  if (dmcIdx > 0) {
    const [dmc] = cards.splice(dmcIdx, 1)
    cards.unshift(dmc!)
  }
  return cards
}

export const usePaletteStore = defineStore('palette', () => {
  const cardList = ref<ColorCard[]>([])
  const activeCard = ref<ColorCard | null>(null)
  const colorEntries = ref<ColorEntry[]>([])
  const currentColorId = ref<string>('')
  const recentColorIds = ref<string[]>([])
  const cardsLoaded = ref(false)

  const pendingSwitch = ref<{
    oldName: string
    newName: string
    newCard: ColorCard
  } | null>(null)

  const currentColor = computed(() =>
    colorEntries.value.find(c => c.id === currentColorId.value)?.color1 ?? '#000000',
  )

  const currentEntry = computed(() =>
    colorEntries.value.find(c => c.id === currentColorId.value) ?? null,
  )

  const colorMap = computed(() => {
    const map = new Map<string, ColorEntry>()
    for (const entry of colorEntries.value) {
      map.set(entry.color1, entry)
    }
    return map
  })

  function registerCard(card: ColorCard) {
    const existing = cardList.value.find(c => c.name === card.name)
    if (!existing) {
      cardList.value.push(card)
    }
    if (!activeCard.value) {
      loadCard(card)
    }
  }

  const SPECIAL_TYPES = new Set(['transparent', 'pearl', 'glow', 'thermo', 'photo'])

  function switchCard(name: string) {
    const card = cardList.value.find(c => c.name === name)
    if (!card || card.name === activeCard.value?.name) return

    const canvasStore = useCanvasStore()

    const hasPixels = canvasStore.layers.some(layer =>
      layer.grid.some(row => row.some(cell => cell !== '')),
    )

    if (!hasPixels) {
      loadCard(card)
      return
    }

    pendingSwitch.value = {
      oldName: activeCard.value?.name ?? '未知',
      newName: card.name,
      newCard: card,
    }
  }

  function executeCardSwitch() {
    const ps = pendingSwitch.value
    if (!ps) return

    const canvasStore = useCanvasStore()

    for (const layer of canvasStore.layers) {
      for (let r = 0; r < layer.grid.length; r++) {
        const row = layer.grid[r]!
        for (let c = 0; c < row.length; c++) {
          const hex = row[c]
          if (!hex) continue
          // 特殊类型直接清空
          if (SPECIAL_TYPES.has(colorEntries.value.find(e => e.color1 === hex)?.type ?? '')) {
            row[c] = ''
            continue
          }
          // 找新色卡最接近的颜色
          const best = findBestMatch(hex, ps.newCard.colors)
          row[c] = best.color1
        }
      }
    }
    canvasStore.buildComposite()
    loadCard(ps.newCard)
    pendingSwitch.value = null
  }

  function cancelCardSwitch() {
    pendingSwitch.value = null
  }

  function loadCard(card: ColorCard) {
    activeCard.value = card
    colorEntries.value = [...card.colors]
    clearHighlights()
    if (card.colors.length > 0 && !card.colors.find(c => c.id === currentColorId.value)) {
      currentColorId.value = card.colors[0]!.id
    }
  }

  async function loadBuiltinCards() {
    if (cardsLoaded.value) return
    cardsLoaded.value = true
    const cards = await loadAllCards()
    for (const card of cards) {
      registerCard(card)
    }
  }

  function importColorCard(json: string): boolean {
    try {
      const parsed = JSON.parse(json)
      if (!validateColorCard(parsed)) return false
      registerCard(parsed)
      loadCard(parsed)
      return true
    } catch {
      return false
    }
  }

  function exportColorCard(): string {
    const card: ColorCard = {
      name: activeCard.value?.name ?? '我的色卡',
      author: 'user',
      version: 1,
      colors: colorEntries.value,
    }
    return JSON.stringify(card, null, 2)
  }

  function setColor(id: string) {
    if (colorEntries.value.find(c => c.id === id)) {
      currentColorId.value = id
      if (!recentColorIds.value.includes(id)) {
        recentColorIds.value.unshift(id)
        if (recentColorIds.value.length > 12) {
          recentColorIds.value.pop()
        }
      }
    }
  }

  function findClosestColor(hex: string): string {
    const r1 = parseInt(hex.slice(1, 3), 16)
    const g1 = parseInt(hex.slice(3, 5), 16)
    const b1 = parseInt(hex.slice(5, 7), 16)
    let minDist = Infinity
    let closest = '#000000'
    for (const entry of colorEntries.value) {
      const c = entry.color1
      const r2 = parseInt(c.slice(1, 3), 16)
      const g2 = parseInt(c.slice(3, 5), 16)
      const b2 = parseInt(c.slice(5, 7), 16)
      const dist = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
      if (dist < minDist) {
        minDist = dist
        closest = c
      }
    }
    return closest
  }

  // load builtin cards on init
  loadBuiltinCards()

  // --- 颜色高亮 ---
  const highlightedColorIds = ref<Set<string>>(new Set())
  const highlightActive = ref(false)
  const highlightNumberMode = ref<'off' | 'row' | 'col' | 'global'>('off')

  function toggleHighlightColor(id: string) {
    const next = new Set(highlightedColorIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    highlightedColorIds.value = next
  }

  function setHighlightColors(ids: string[]) {
    highlightedColorIds.value = new Set(ids)
  }

  function clearHighlights() {
    highlightedColorIds.value = new Set()
    highlightActive.value = false
  }

  function computeHighlightMask(grid: string[][]): boolean[][] | null {
    if (!highlightActive.value || highlightedColorIds.value.size === 0) return null
    // highlightedColorIds 存的是色号 ID，需要映射为 hex 颜色值后再匹配 grid
    const idSet = highlightedColorIds.value
    const hexSet = new Set<string>()
    for (const entry of colorEntries.value) {
      if (idSet.has(entry.id)) {
        hexSet.add(entry.color1)
      }
    }
    if (hexSet.size === 0) return null
    return grid.map(row => row.map(hex => hex !== '' && hexSet.has(hex)))
  }

  return {
    cardList,
    activeCard,
    colorEntries,
    currentColorId,
    recentColorIds,
    currentColor,
    currentEntry,
    colorMap,
    cardsLoaded,
    registerCard,
    pendingSwitch,
    switchCard,
    executeCardSwitch,
    cancelCardSwitch,
    loadCard,
    loadBuiltinCards,
    importColorCard,
    exportColorCard,
    setColor,
    findClosestColor,
    highlightedColorIds,
    highlightActive,
    toggleHighlightColor,
    setHighlightColors,
    clearHighlights,
    computeHighlightMask,
    highlightNumberMode,
  }
})
