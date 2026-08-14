import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef, computed } from 'vue'
import { useToolStore } from '@/stores/tool'
import { useCanvasStore } from '@/stores/canvas'
import { useHistoryStore } from '@/stores/history'

export type SelectShape = 'rect' | 'ellipse' | 'line' | 'lasso'
export type SelectMode = 'replace' | 'add' | 'remove'

function makeEmptyMask(cols: number, rows: number): boolean[][] {
  const m: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    m.push(new Array<boolean>(cols).fill(false))
  }
  return markRaw(m)
}

function cloneMask(mask: boolean[][]): boolean[][] {
  return markRaw(mask.map((row) => [...row]))
}

export const useSelectionStore = defineStore('selection', () => {
  // Cell-level changes are signalled by version; the mask itself should not be
  // deeply proxied because selection-aware tools read it in tight loops.
  const selectionMask = shallowRef<boolean[][]>(makeEmptyMask(16, 16))
  const version = ref(0)

  // 拖拽预览
  const isSelecting = ref(false)
  const selectStartCol = ref(0)
  const selectStartRow = ref(0)
  const selectEndCol = ref(0)
  const selectEndRow = ref(0)
  const lassoPoints = ref<[number, number][]>([])

  const selectShape = ref<SelectShape>('rect')
  const selectMode = ref<SelectMode>('replace')

  const hasSelection = computed(() => {
    // Include the explicit mutation version in the dependency set.
    return version.value >= 0 && selectionMask.value.some((row) => row.some((v) => v))
  })

  const previewMask = computed(() => {
    if (!isSelecting.value) return null
    const mask =
      selectMode.value === 'replace'
        ? makeEmptyMask(selectionMask.value[0]?.length ?? 0, selectionMask.value.length)
        : cloneMask(selectionMask.value)

    if (selectShape.value === 'lasso') {
      if (lassoPoints.value.length < 2) return mask
      fillLasso(mask, lassoPoints.value, selectMode.value)
    } else {
      const c1 = selectStartCol.value
      const r1 = selectStartRow.value
      const c2 = selectEndCol.value
      const r2 = selectEndRow.value
      const colMin = Math.min(c1, c2)
      const colMax = Math.max(c1, c2)
      const rowMin = Math.min(r1, r2)
      const rowMax = Math.max(r1, r2)

      if (selectShape.value === 'rect') {
        applyRect(mask, rowMin, colMin, rowMax, colMax, selectMode.value)
      } else if (selectShape.value === 'ellipse') {
        applyEllipse(mask, rowMin, colMin, rowMax, colMax, selectMode.value)
      } else if (selectShape.value === 'line') {
        applyLine(mask, r1, c1, r2, c2, selectMode.value)
      }
    }

    return mask
  })

  function bumpVersion() {
    version.value++
  }

  function resize(cols: number, rows: number) {
    const m = makeEmptyMask(cols, rows)
    for (let r = 0; r < Math.min(rows, selectionMask.value.length); r++) {
      const srcRow = selectionMask.value[r]!
      const dstRow = m[r]!
      for (let c = 0; c < Math.min(cols, srcRow.length); c++) {
        dstRow[c] = srcRow[c]!
      }
    }
    selectionMask.value = m
    bumpVersion()
  }

  function clearSelection() {
    const { cols, rows } = {
      cols: selectionMask.value[0]?.length ?? 16,
      rows: selectionMask.value.length,
    }
    selectionMask.value = makeEmptyMask(cols, rows)
    bumpVersion()
  }

  function selectAll() {
    const rows = selectionMask.value.length
    const cols = selectionMask.value[0]?.length ?? 0
    selectionMask.value = markRaw(
      Array.from({ length: rows }, () => new Array<boolean>(cols).fill(true)),
    )
    bumpVersion()
  }

  function invertSelection() {
    const m = selectionMask.value
    for (const row of m) {
      for (let c = 0; c < row.length; c++) {
        row[c] = !row[c]
      }
    }
    bumpVersion()
  }

  function isSelected(col: number, row: number): boolean {
    return selectionMask.value[row]?.[col] ?? false
  }

  // -- 拖拽流程 --

  function beginSelection(col: number, row: number) {
    // 从 toolStore 同步形状/模式
    const toolStore = useToolStore()
    selectShape.value = toolStore.selectShape
    selectMode.value = toolStore.selectMode

    isSelecting.value = true
    selectStartCol.value = col
    selectStartRow.value = row
    selectEndCol.value = col
    selectEndRow.value = row
    lassoPoints.value = [[col, row]]
  }

  function updateSelection(col: number, row: number) {
    if (!isSelecting.value) return
    if (selectShape.value === 'lasso') {
      const last = lassoPoints.value[lassoPoints.value.length - 1]
      if (last && (last[0] !== col || last[1] !== row)) {
        lassoPoints.value.push([col, row])
      }
    } else {
      selectEndCol.value = col
      selectEndRow.value = row
    }
    bumpVersion()
  }

  function endSelection() {
    if (!isSelecting.value) return
    isSelecting.value = false

    const mode = selectMode.value
    const mask =
      mode === 'replace'
        ? makeEmptyMask(selectionMask.value[0]?.length ?? 0, selectionMask.value.length)
        : cloneMask(selectionMask.value)

    if (selectShape.value === 'lasso') {
      if (lassoPoints.value.length >= 2) {
        fillLasso(mask, lassoPoints.value, mode)
      }
      lassoPoints.value = []
    } else {
      const c1 = selectStartCol.value
      const r1 = selectStartRow.value
      const c2 = selectEndCol.value
      const r2 = selectEndRow.value
      const colMin = Math.min(c1, c2)
      const colMax = Math.max(c1, c2)
      const rowMin = Math.min(r1, r2)
      const rowMax = Math.max(r1, r2)

      if (selectShape.value === 'rect') {
        applyRect(mask, rowMin, colMin, rowMax, colMax, mode)
      } else if (selectShape.value === 'ellipse') {
        applyEllipse(mask, rowMin, colMin, rowMax, colMax, mode)
      } else if (selectShape.value === 'line') {
        applyLine(mask, r1, c1, r2, c2, mode)
      }
    }
    selectionMask.value = mask
    bumpVersion()
  }

  // -- 形状填充 --

  function applyRect(
    mask: boolean[][],
    rMin: number,
    cMin: number,
    rMax: number,
    cMax: number,
    mode: SelectMode,
  ) {
    const val = mode !== 'remove'
    for (let r = rMin; r <= rMax; r++) {
      const row = mask[r]
      if (!row) continue
      for (let c = cMin; c <= cMax; c++) {
        row[c] = val
      }
    }
  }

  function applyEllipse(
    mask: boolean[][],
    rMin: number,
    cMin: number,
    rMax: number,
    cMax: number,
    mode: SelectMode,
  ) {
    const val = mode !== 'remove'
    const cx = (cMin + cMax) / 2
    const cy = (rMin + rMax) / 2
    const rx = (cMax - cMin + 1) / 2
    const ry = (rMax - rMin + 1) / 2
    for (let r = rMin; r <= rMax; r++) {
      const row = mask[r]
      if (!row) continue
      for (let c = cMin; c <= cMax; c++) {
        const dx = (c - cx) / rx
        const dy = (r - cy) / ry
        if (dx * dx + dy * dy <= 1) {
          row[c] = val
        }
      }
    }
  }

  function applyLine(
    mask: boolean[][],
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    mode: SelectMode,
  ) {
    const val = mode !== 'remove'
    const dr = Math.abs(r2 - r1)
    const dc = Math.abs(c2 - c1)
    const sr = r1 < r2 ? 1 : -1
    const sc = c1 < c2 ? 1 : -1
    let err = dr - dc
    let r = r1
    let c = c1
    const maxSteps = (dr + dc) * 2 + 1
    let steps = 0
    while (steps < maxSteps) {
      steps++
      const row = mask[r]
      if (row) row[c] = val
      if (r === r2 && c === c2) break
      const e2 = 2 * err
      if (e2 > -dc) {
        err -= dc
        r += sr
      }
      if (e2 < dr) {
        err += dr
        c += sc
      }
    }
  }

  function fillLasso(mask: boolean[][], points: [number, number][], mode: SelectMode) {
    const val = mode !== 'remove'
    if (points.length < 3) return
    // Ray casting: for each row, find intersections with polygon edges
    const rows = mask.length
    const cols = mask[0]?.length ?? 0

    for (let r = 0; r < rows; r++) {
      const row = mask[r]!
      const intersections: number[] = []
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!
        const [x2, y2] = points[(i + 1) % points.length]!
        if ((y1 <= r && y2 > r) || (y2 <= r && y1 > r)) {
          const x = x1 + ((r - y1) / (y2 - y1)) * (x2 - x1)
          intersections.push(x)
        }
      }
      intersections.sort((a, b) => a - b)
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const start = Math.max(0, Math.ceil(intersections[i]!))
        const end = Math.min(cols - 1, Math.floor(intersections[i + 1]!))
        for (let c = start; c <= end; c++) {
          row[c] = val
        }
      }
    }
  }

  // 剪贴板
  const clipboard = ref<{
    width: number
    height: number
    cells: string[][]
    mask: boolean[][]
  } | null>(null)
  const hasClipboard = computed(() => clipboard.value !== null)

  function copySelection() {
    if (!hasSelection.value) return
    const canvasStore = useCanvasStore()
    const layer = canvasStore.activeLayer()
    if (!layer) return
    const src = layer.grid
    const mask = selectionMask.value
    let cMin = Infinity,
      cMax = -Infinity,
      rMin = Infinity,
      rMax = -Infinity
    for (let r = 0; r < mask.length; r++) {
      for (let c = 0; c < mask[r]!.length; c++) {
        if (mask[r]![c]) {
          if (r < rMin) rMin = r
          if (r > rMax) rMax = r
          if (c < cMin) cMin = c
          if (c > cMax) cMax = c
        }
      }
    }
    if (rMin > rMax || cMin > cMax) return
    const h = rMax - rMin + 1
    const w = cMax - cMin + 1
    const cells: string[][] = []
    const clipMask: boolean[][] = []
    for (let r = rMin; r <= rMax; r++) {
      const row: string[] = []
      const maskRow: boolean[] = []
      for (let c = cMin; c <= cMax; c++) {
        const selected = mask[r]![c] ?? false
        row.push(selected ? (src[r]![c] ?? '') : '')
        maskRow.push(selected)
      }
      cells.push(row)
      clipMask.push(maskRow)
    }
    clipboard.value = { width: w, height: h, cells, mask: clipMask }
  }

  function savePixelHistory() {
    const canvasStore = useCanvasStore()
    const snapshot = canvasStore.getActiveLayerSnapshot()
    if (!snapshot) return
    useHistoryStore().push({
      layerId: snapshot.layerId,
      grid: snapshot.grid,
      cols: canvasStore.cols,
      rows: canvasStore.rows,
    })
  }

  function deleteSelectionContent() {
    if (!hasSelection.value) return
    const canvasStore = useCanvasStore()
    const layer = canvasStore.activeLayer()
    if (!layer) return
    savePixelHistory()
    for (let r = 0; r < selectionMask.value.length; r++) {
      const maskRow = selectionMask.value[r]!
      const gridRow = layer.grid[r]
      if (!gridRow) continue
      for (let c = 0; c < maskRow.length; c++) {
        if (maskRow[c]) gridRow[c] = ''
      }
    }
    canvasStore.flushComposite()
    savePixelHistory()
  }

  function cutSelection() {
    if (!hasSelection.value) return
    copySelection()
    deleteSelectionContent()
  }

  function pasteSelection(atRow: number, atCol: number) {
    const cb = clipboard.value
    if (!cb) return
    const canvasStore = useCanvasStore()
    const layer = canvasStore.activeLayer()
    if (!layer) return
    const grid = layer.grid
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    savePixelHistory()
    const startR = Math.max(0, Math.min(rows - 1, atRow))
    const startC = Math.max(0, Math.min(cols - 1, atCol))
    const nextMask = makeEmptyMask(cols, rows)
    for (let r = 0; r < cb.height; r++) {
      const tr = startR + r
      if (tr < 0 || tr >= rows) continue
      for (let c = 0; c < cb.width; c++) {
        const tc = startC + c
        if (tc < 0 || tc >= cols) continue
        if (!cb.mask[r]?.[c]) continue
        grid[tr]![tc] = cb.cells[r]?.[c] ?? ''
        nextMask[tr]![tc] = true
      }
    }
    selectionMask.value = nextMask
    bumpVersion()
    canvasStore.flushComposite()
    savePixelHistory()
  }

  return {
    selectionMask,
    version,
    isSelecting,
    selectStartCol,
    selectStartRow,
    selectEndCol,
    selectEndRow,
    lassoPoints,
    selectShape,
    selectMode,
    hasSelection,
    previewMask,
    clipboard,
    hasClipboard,
    copySelection,
    cutSelection,
    pasteSelection,
    bumpVersion,
    resize,
    clearSelection,
    selectAll,
    invertSelection,
    deleteSelectionContent,
    isSelected,
    beginSelection,
    updateSelection,
    endSelection,
  }
})
