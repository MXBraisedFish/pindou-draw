import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef, computed } from 'vue'

interface HistoryEntry {
  layerId: string
  grid: string[][]
  cols: number
  rows: number
}

export const useHistoryStore = defineStore('history', () => {
  // Snapshots are immutable bulk pixel data. Only replacing the stack must be
  // reactive; proxying every historical cell adds cost without any UI benefit.
  const stack = shallowRef<HistoryEntry[]>([])
  const index = ref(-1)

  const canUndo = computed(() => index.value > 0)
  const canRedo = computed(() => index.value < stack.value.length - 1)

  function sameEntry(a: HistoryEntry | undefined, b: HistoryEntry): boolean {
    if (!a || a.layerId !== b.layerId || a.cols !== b.cols || a.rows !== b.rows) return false
    if (a.grid.length !== b.grid.length) return false
    for (let r = 0; r < a.grid.length; r++) {
      const aRow = a.grid[r]
      const bRow = b.grid[r]
      if (!aRow || !bRow || aRow.length !== bRow.length) return false
      for (let c = 0; c < aRow.length; c++) {
        if (aRow[c] !== bRow[c]) return false
      }
    }
    return true
  }

  function push(entry: HistoryEntry) {
    if (sameEntry(stack.value[index.value], entry)) return
    const next = stack.value.slice(0, index.value + 1)
    next.push({ ...entry, grid: markRaw(entry.grid) })
    if (next.length > 100) next.shift()
    stack.value = next
    index.value = stack.value.length - 1
  }

  function undo(): HistoryEntry | null {
    if (!canUndo.value) return null
    index.value--
    return stack.value[index.value] ?? null
  }

  function redo(): HistoryEntry | null {
    if (!canRedo.value) return null
    index.value++
    return stack.value[index.value] ?? null
  }

  function clear() {
    stack.value = []
    index.value = -1
  }

  return {
    stack,
    index,
    canUndo,
    canRedo,
    push,
    undo,
    redo,
    clear,
  }
})
