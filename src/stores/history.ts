import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface HistoryEntry {
  layerId: string
  grid: string[][]
  cols: number
  rows: number
}

export const useHistoryStore = defineStore('history', () => {
  const stack = ref<HistoryEntry[]>([])
  const index = ref(-1)

  const canUndo = computed(() => index.value > 0)
  const canRedo = computed(() => index.value < stack.value.length - 1)

  function push(entry: HistoryEntry) {
    stack.value = stack.value.slice(0, index.value + 1)
    stack.value.push(entry)
    if (stack.value.length > 100) {
      stack.value.shift()
    }
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
