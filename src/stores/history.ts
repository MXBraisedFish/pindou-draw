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

  function push(entry: HistoryEntry) {
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
