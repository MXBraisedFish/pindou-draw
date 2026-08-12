import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef, triggerRef } from 'vue'

export type RenderMode = 'day' | 'night' | 'thermo' | 'photo' | 'thermo-photo'
export type SymmetryMode =
  | 'off'
  | 'center'
  | 'vertical'
  | 'horizontal'
  | 'diag45'
  | 'diag135'
  | 'cross'
  | 'x'
  | 'all8'
export type PixelShape = 'square' | 'circle'

export interface ThickLineConfig {
  enabled: boolean
  interval: number
  thickness: number
  startOffset: number
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  grid: string[][]
}

export interface CanvasSnapshot {
  layers: { id: string; name: string; visible: boolean; grid: string[][] }[]
  activeLayerId: string
  renderMode: RenderMode
  symmetry: SymmetryMode
  pixelShape: PixelShape
  showColorIds: boolean
  showColorIdsHighlightOnly: boolean
  backgroundColor: string
  showGrid: boolean
  thickLineH: ThickLineConfig
  thickLineV: ThickLineConfig
}

export interface CanvasGroup {
  name: string
  groupCols: number
  groupRows: number
  subSize: number
  canvases: CanvasSnapshot[][]
}

export const CANVAS_SIZE_MIN = 1
export const CANVAS_SIZE_MAX = 64
export const GROUP_SIZE_MIN = 1
export const GROUP_SIZE_MAX = 32

export function clampInteger(value: unknown, min: number, max: number, fallback = min): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

export function clampCanvasSize(value: unknown, fallback = 16): number {
  return clampInteger(value, CANVAS_SIZE_MIN, CANVAS_SIZE_MAX, fallback)
}

export function clampGroupSize(value: unknown, fallback = 4): number {
  return clampInteger(value, GROUP_SIZE_MIN, GROUP_SIZE_MAX, fallback)
}

let layerUid = 0
function nextLayerId(): string {
  return `layer_${++layerUid}`
}

function makeEmptyGrid(cols: number, rows: number): string[][] {
  const g: string[][] = []
  for (let r = 0; r < rows; r++) {
    g.push(new Array<string>(cols).fill(''))
  }
  return markRaw(g)
}

/** Keep the large pixel matrix outside Vue's deep-reactivity graph. */
export function rawPixelGrid(grid: string[][]): string[][] {
  return markRaw(grid)
}

function clonePixelGrid(grid: string[][]): string[][] {
  return rawPixelGrid(grid.map((row) => [...row]))
}

function makeEmptyMask(cols: number, rows: number): boolean[][] {
  const m: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    m.push(new Array<boolean>(cols).fill(false))
  }
  return m
}

export const useCanvasStore = defineStore('canvas', () => {
  const cols = ref(16)
  const rows = ref(16)
  // Rendering is driven by gridVersion; individual composite cells never need
  // dependency tracking.
  const compositeGrid = shallowRef<string[][]>(markRaw([]))
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const showGrid = ref(true)
  const cursorCol = ref(0)
  const cursorRow = ref(0)
  const gridVersion = ref(0)

  const renderMode = ref<RenderMode>('day')
  const prevRenderMode = ref<RenderMode>('day')
  const transitionProgress = ref(1)
  let transitionRaf = 0

  function setRenderMode(mode: RenderMode) {
    if (mode === renderMode.value) return
    prevRenderMode.value = renderMode.value
    renderMode.value = mode
    transitionProgress.value = 0
    cancelAnimationFrame(transitionRaf)

    const start = performance.now()
    const duration = 280
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      // ease-out
      transitionProgress.value = 1 - (1 - t) ** 2
      bumpVersion()
      if (t < 1) {
        transitionRaf = requestAnimationFrame(tick)
      } else {
        transitionProgress.value = 1
        prevRenderMode.value = mode
        bumpVersion()
      }
    }
    transitionRaf = requestAnimationFrame(tick)
  }

  const symmetry = ref<SymmetryMode>('off')
  const pixelShape = ref<PixelShape>('square')
  const showColorIds = ref(false)
  const showColorIdsHighlightOnly = ref(false)
  const backgroundColor = ref('#ffffff')
  const thickLineH = ref<ThickLineConfig>({
    enabled: false,
    interval: 5,
    thickness: 1,
    startOffset: 0,
  })
  const thickLineV = ref<ThickLineConfig>({
    enabled: false,
    interval: 5,
    thickness: 1,
    startOffset: 0,
  })

  const geoPreview = ref<{
    shape: string
    sides: number
    c1: number
    r1: number
    c2: number
    r2: number
  } | null>(null)

  // 画布组
  // A group may contain millions of cells. Deep-proxying every nested row and
  // cell makes large image imports dramatically slower and consumes far more
  // memory. Group mutations are explicit, so a shallow ref is sufficient.
  const canvasGroup = shallowRef<CanvasGroup | null>(null)
  const groupVersion = ref(0)
  const activeGroupCol = ref(0)
  const activeGroupRow = ref(0)
  const openGroupTabs = ref<{ row: number; col: number }[]>([])
  const showGroupPreview = ref(false)
  const dirtyCanvases = ref<Set<string>>(new Set()) // 缩略图脏标记

  function markDirty(row: number, col: number) {
    const next = new Set(dirtyCanvases.value)
    next.add(`${row},${col}`)
    dirtyCanvases.value = next
  }

  function notifyGroupChanged() {
    groupVersion.value++
    triggerRef(canvasGroup)
  }

  function captureCanvasSnapshot(): CanvasSnapshot {
    return {
      layers: layers.value.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        grid: clonePixelGrid(l.grid),
      })),
      activeLayerId: activeLayerId.value,
      renderMode: renderMode.value,
      symmetry: symmetry.value,
      pixelShape: pixelShape.value,
      showColorIds: showColorIds.value,
      showColorIdsHighlightOnly: showColorIdsHighlightOnly.value,
      backgroundColor: backgroundColor.value,
      showGrid: showGrid.value,
      thickLineH: { ...thickLineH.value },
      thickLineV: { ...thickLineV.value },
    }
  }

  function restoreCanvasSnapshot(snap: CanvasSnapshot) {
    cols.value = canvasGroup.value!.subSize
    rows.value = canvasGroup.value!.subSize
    layers.value = snap.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      grid: clonePixelGrid(l.grid),
    }))
    activeLayerId.value = snap.activeLayerId
    renderMode.value = snap.renderMode
    symmetry.value = snap.symmetry
    pixelShape.value = snap.pixelShape
    showColorIds.value = snap.showColorIds
    showColorIdsHighlightOnly.value = snap.showColorIdsHighlightOnly
    backgroundColor.value = snap.backgroundColor
    showGrid.value = snap.showGrid
    thickLineH.value = { ...snap.thickLineH }
    thickLineV.value = { ...snap.thickLineV }
    buildComposite()
    bumpVersion()
  }

  function saveActiveToGroup() {
    if (!canvasGroup.value) return
    canvasGroup.value.canvases[activeGroupRow.value]![activeGroupCol.value] =
      captureCanvasSnapshot()
  }

  function setThickLineH(cfg: Partial<ThickLineConfig>) {
    thickLineH.value = { ...thickLineH.value, ...cfg }
  }
  function setThickLineV(cfg: Partial<ThickLineConfig>) {
    thickLineV.value = { ...thickLineV.value, ...cfg }
  }

  // Layer metadata stays reactive for the panels, while every layer grid is
  // explicitly markRaw. This prevents flood fill and rendering from paying a
  // Proxy get/set cost for every pixel.
  const layers = ref<Layer[]>([])
  const activeLayerId = ref<string>('')

  function activeLayer(): Layer | undefined {
    return layers.value.find((l) => l.id === activeLayerId.value)
  }

  function bumpVersion() {
    gridVersion.value++
  }

  function buildComposite() {
    const result = makeEmptyGrid(cols.value, rows.value)
    for (const layer of layers.value) {
      if (!layer.visible) continue
      for (let r = 0; r < rows.value; r++) {
        const srcRow = layer.grid[r]
        const dstRow = result[r]!
        for (let c = 0; c < cols.value; c++) {
          const color = srcRow?.[c]
          if (color) dstRow[c] = color
        }
      }
    }
    compositeGrid.value = rawPixelGrid(result)
    bumpVersion()
  }

  // ===== 画布组管理 =====

  function createCanvasGroup(name: string, groupCols: number, groupRows: number, subSize: number) {
    groupCols = clampGroupSize(groupCols)
    groupRows = clampGroupSize(groupRows)
    subSize = clampCanvasSize(subSize)
    const empty = (): CanvasSnapshot => ({
      layers: [
        { id: nextLayerId(), name: '主图层', visible: true, grid: makeEmptyGrid(subSize, subSize) },
      ],
      activeLayerId: '',
      renderMode: 'day',
      symmetry: 'off',
      pixelShape: 'square',
      showColorIds: false,
      showColorIdsHighlightOnly: false,
      backgroundColor: '#ffffff',
      showGrid: true,
      thickLineH: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
      thickLineV: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
    })
    const canvases: CanvasSnapshot[][] = []
    for (let r = 0; r < groupRows; r++) {
      const row: CanvasSnapshot[] = []
      for (let c = 0; c < groupCols; c++) {
        const snap = empty()
        snap.activeLayerId = snap.layers[0]!.id
        row.push(snap)
      }
      canvases.push(row)
    }
    canvasGroup.value = { name, groupCols, groupRows, subSize, canvases }
    activeGroupCol.value = 0
    activeGroupRow.value = 0
    openGroupTabs.value = [{ row: 0, col: 0 }]
    showGroupPreview.value = true
    restoreCanvasSnapshot(canvases[0]![0]!)
    notifyGroupChanged()
  }

  function createCanvasGroupFromGrid(name: string, source: string[][], subSize = 64) {
    subSize = clampCanvasSize(subSize, 64)
    const sourceRows = source.length
    const sourceCols = source[0]?.length ?? 0
    const groupCols = Math.max(1, Math.ceil(sourceCols / subSize))
    const groupRows = Math.max(1, Math.ceil(sourceRows / subSize))
    const canvases: CanvasSnapshot[][] = new Array(groupRows)

    for (let gr = 0; gr < groupRows; gr++) {
      const canvasRow: CanvasSnapshot[] = new Array(groupCols)
      for (let gc = 0; gc < groupCols; gc++) {
        const grid: string[][] = new Array(subSize)
        for (let sr = 0; sr < subSize; sr++) {
          const sourceRow = source[gr * subSize + sr]
          const row = sourceRow?.slice(gc * subSize, (gc + 1) * subSize) ?? []
          if (row.length < subSize) row.push(...new Array<string>(subSize - row.length).fill(''))
          grid[sr] = row
        }
        const layerId = nextLayerId()
        canvasRow[gc] = {
          layers: [{ id: layerId, name: '主图层', visible: true, grid: rawPixelGrid(grid) }],
          activeLayerId: layerId,
          renderMode: 'day',
          symmetry: 'off',
          pixelShape: 'square',
          showColorIds: false,
          showColorIdsHighlightOnly: false,
          backgroundColor: '#ffffff',
          showGrid: true,
          thickLineH: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
          thickLineV: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
        }
      }
      canvases[gr] = canvasRow
    }

    canvasGroup.value = { name, groupCols, groupRows, subSize, canvases }
    activeGroupCol.value = 0
    activeGroupRow.value = 0
    openGroupTabs.value = [{ row: 0, col: 0 }]
    showGroupPreview.value = true
    restoreCanvasSnapshot(canvases[0]![0]!)
    dirtyCanvases.value = new Set()
    notifyGroupChanged()
  }

  function switchToSubCanvas(row: number, col: number) {
    if (!canvasGroup.value) return
    saveActiveToGroup()
    const snap = canvasGroup.value.canvases[row]?.[col]
    if (!snap) return
    const same = row === activeGroupRow.value && col === activeGroupCol.value
    activeGroupRow.value = row
    activeGroupCol.value = col
    if (!same) restoreCanvasSnapshot(snap)
    showGroupPreview.value = false
    // 保留 tab 原有位置，仅当新 tab 时追加末尾
    const tabs = openGroupTabs.value
    if (!tabs.some((t) => t.row === row && t.col === col)) {
      openGroupTabs.value = [...tabs, { row, col }]
    }
  }

  function closeGroupTab(row: number, col: number) {
    if (!canvasGroup.value) return
    const tabs = openGroupTabs.value
    if (tabs.length <= 1) return // 至少保留一个
    const idx = tabs.findIndex((t) => t.row === row && t.col === col)
    if (idx === -1) return
    // 如果关闭的是当前活跃 tab，先保存再切换
    if (row === activeGroupRow.value && col === activeGroupCol.value) {
      saveActiveToGroup()
      // 切换到相邻 tab
      const next = tabs[idx + 1] ?? tabs[idx - 1]
      if (next) {
        activeGroupRow.value = next.row
        activeGroupCol.value = next.col
        restoreCanvasSnapshot(canvasGroup.value.canvases[next.row]![next.col]!)
      }
    }
    openGroupTabs.value = tabs.filter((t) => !(t.row === row && t.col === col))
  }

  function swapSubCanvases(r1: number, c1: number, r2: number, c2: number) {
    if (!canvasGroup.value) return
    const g = canvasGroup.value.canvases
    const a = g[r1]![c1]!
    const b = g[r2]![c2]!
    g[r1]![c1] = b
    g[r2]![c2] = a
    markDirty(r1, c1)
    markDirty(r2, c2)
    // 更新标签：标签跟随内容移动
    openGroupTabs.value = openGroupTabs.value.map((t) => {
      if (t.row === r1 && t.col === c1) return { row: r2, col: c2 }
      if (t.row === r2 && t.col === c2) return { row: r1, col: c1 }
      return t
    })
    if (activeGroupRow.value === r1 && activeGroupCol.value === c1) {
      activeGroupRow.value = r2
      activeGroupCol.value = c2
    } else if (activeGroupRow.value === r2 && activeGroupCol.value === c2) {
      activeGroupRow.value = r1
      activeGroupCol.value = c1
    }
    saveActiveToGroup()
    notifyGroupChanged()
  }

  function resizeGroupCanvas(newSize: number) {
    if (!canvasGroup.value) return
    newSize = clampCanvasSize(newSize, canvasGroup.value.subSize)
    const g = canvasGroup.value
    for (let r = 0; r < g.groupRows; r++) {
      for (let c = 0; c < g.groupCols; c++) {
        const snap = g.canvases[r]![c]!
        for (const layer of snap.layers) {
          const oldGrid = layer.grid
          const newGrid = makeEmptyGrid(newSize, newSize)
          for (let rr = 0; rr < Math.min(newSize, oldGrid.length); rr++) {
            const oldRow = oldGrid[rr]!
            const newRow = newGrid[rr]!
            for (let cc = 0; cc < Math.min(newSize, oldRow.length); cc++) {
              newRow[cc] = oldRow[cc]!
            }
          }
          layer.grid = rawPixelGrid(newGrid)
        }
      }
    }
    g.subSize = newSize
    cols.value = newSize
    rows.value = newSize
    dirtyCanvases.value = new Set() // 全部标记脏
    buildComposite()
    bumpVersion()
    notifyGroupChanged()
  }

  function addGroupRow(atIndex: number, above: boolean) {
    if (!canvasGroup.value) return
    const g = canvasGroup.value
    if (g.groupRows >= 32) return
    const insertIdx = above ? atIndex : atIndex + 1
    const newRow: CanvasSnapshot[] = []
    for (let c = 0; c < g.groupCols; c++) {
      const snap: CanvasSnapshot = {
        layers: [
          {
            id: nextLayerId(),
            name: '主图层',
            visible: true,
            grid: makeEmptyGrid(g.subSize, g.subSize),
          },
        ],
        activeLayerId: '',
        renderMode: 'day',
        symmetry: 'off',
        pixelShape: 'square',
        showColorIds: false,
        showColorIdsHighlightOnly: false,
        backgroundColor: '#ffffff',
        showGrid: true,
        thickLineH: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
        thickLineV: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
      }
      snap.activeLayerId = snap.layers[0]!.id
      newRow.push(snap)
    }
    g.canvases.splice(insertIdx, 0, newRow)
    g.groupRows++
    // 调整活跃行列和 tabs
    if (activeGroupRow.value >= insertIdx) activeGroupRow.value++
    openGroupTabs.value = openGroupTabs.value.map((t) =>
      t.row >= insertIdx ? { row: t.row + 1, col: t.col } : t,
    )
    notifyGroupChanged()
  }

  function deleteGroupRow(index: number) {
    if (!canvasGroup.value) return
    const g = canvasGroup.value
    if (g.groupRows <= 1) return
    g.canvases.splice(index, 1)
    g.groupRows--
    // 调整活跃行列
    if (activeGroupRow.value > index) activeGroupRow.value--
    else if (activeGroupRow.value === index) {
      activeGroupRow.value = Math.min(index, g.groupRows - 1)
      restoreCanvasSnapshot(g.canvases[activeGroupRow.value]![activeGroupCol.value]!)
    }
    openGroupTabs.value = openGroupTabs.value
      .filter((t) => t.row !== index)
      .map((t) => (t.row > index ? { row: t.row - 1, col: t.col } : t))
    dirtyCanvases.value = new Set()
    notifyGroupChanged()
  }

  function addGroupCol(atIndex: number, left: boolean) {
    if (!canvasGroup.value) return
    const g = canvasGroup.value
    if (g.groupCols >= 32) return
    const insertIdx = left ? atIndex : atIndex + 1
    for (const row of g.canvases) {
      const snap: CanvasSnapshot = {
        layers: [
          {
            id: nextLayerId(),
            name: '主图层',
            visible: true,
            grid: makeEmptyGrid(g.subSize, g.subSize),
          },
        ],
        activeLayerId: '',
        renderMode: 'day',
        symmetry: 'off',
        pixelShape: 'square',
        showColorIds: false,
        showColorIdsHighlightOnly: false,
        backgroundColor: '#ffffff',
        showGrid: true,
        thickLineH: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
        thickLineV: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
      }
      snap.activeLayerId = snap.layers[0]!.id
      row.splice(insertIdx, 0, snap)
    }
    g.groupCols++
    if (activeGroupCol.value >= insertIdx) activeGroupCol.value++
    openGroupTabs.value = openGroupTabs.value.map((t) =>
      t.col >= insertIdx ? { row: t.row, col: t.col + 1 } : t,
    )
    notifyGroupChanged()
  }

  function deleteGroupCol(index: number) {
    if (!canvasGroup.value) return
    const g = canvasGroup.value
    if (g.groupCols <= 1) return
    for (const row of g.canvases) {
      row.splice(index, 1)
    }
    g.groupCols--
    if (activeGroupCol.value > index) activeGroupCol.value--
    else if (activeGroupCol.value === index) {
      activeGroupCol.value = Math.min(index, g.groupCols - 1)
      restoreCanvasSnapshot(g.canvases[activeGroupRow.value]![activeGroupCol.value]!)
    }
    openGroupTabs.value = openGroupTabs.value
      .filter((t) => t.col !== index)
      .map((t) => (t.col > index ? { row: t.row, col: t.col - 1 } : t))
    dirtyCanvases.value = new Set()
    notifyGroupChanged()
  }

  function hasPixelsInRow(index: number): boolean {
    if (!canvasGroup.value) return false
    const row = canvasGroup.value.canvases[index]
    if (!row) return false
    return row.some((snap) =>
      snap.layers.some((l) => l.grid.some((r) => r.some((cell) => cell !== ''))),
    )
  }

  function hasPixelsInCol(index: number): boolean {
    if (!canvasGroup.value) return false
    return canvasGroup.value.canvases.some((row) => {
      const snap = row[index]
      return snap
        ? snap.layers.some((l) => l.grid.some((r) => r.some((cell) => cell !== '')))
        : false
    })
  }

  function leaveGroupMode() {
    if (!canvasGroup.value) return
    saveActiveToGroup()
    canvasGroup.value = null
    openGroupTabs.value = []
    showGroupPreview.value = false
    initLayers()
  }

  function initLayers() {
    const g = makeEmptyGrid(cols.value, rows.value)
    const mainLayer: Layer = { id: nextLayerId(), name: '主图层', visible: true, grid: g }
    layers.value = [mainLayer]
    activeLayerId.value = mainLayer.id
    buildComposite()
  }

  function addLayer(name?: string): Layer {
    const g = makeEmptyGrid(cols.value, rows.value)
    const layer: Layer = {
      id: nextLayerId(),
      name: name ?? `图层 ${layers.value.length + 1}`,
      visible: true,
      grid: g,
    }
    layers.value.push(layer)
    activeLayerId.value = layer.id
    buildComposite()
    return layer
  }

  function removeLayer(id: string) {
    if (layers.value.length <= 1) return
    layers.value = layers.value.filter((l) => l.id !== id)
    if (activeLayerId.value === id) {
      activeLayerId.value = layers.value[0]?.id ?? ''
    }
    buildComposite()
  }

  function duplicateLayer(id: string) {
    const idx = layers.value.findIndex((l) => l.id === id)
    if (idx === -1) return
    const original = layers.value[idx]!
    const clonedGrid = clonePixelGrid(original.grid)
    const cloned: Layer = {
      id: nextLayerId(),
      name: `${original.name} 副本`,
      visible: original.visible,
      grid: clonedGrid,
    }
    layers.value.splice(idx + 1, 0, cloned)
    activeLayerId.value = cloned.id
    buildComposite()
  }

  function setActiveLayer(id: string) {
    if (layers.value.find((l) => l.id === id)) {
      activeLayerId.value = id
    }
  }

  function renameLayer(id: string, name: string) {
    const layer = layers.value.find((l) => l.id === id)
    if (layer) layer.name = name
  }

  function moveLayerUp(id: string) {
    const idx = layers.value.findIndex((l) => l.id === id)
    if (idx > 0) {
      ;[layers.value[idx - 1], layers.value[idx]] = [layers.value[idx]!, layers.value[idx - 1]!]
      buildComposite()
    }
  }

  function moveLayerDown(id: string) {
    const idx = layers.value.findIndex((l) => l.id === id)
    if (idx < layers.value.length - 1) {
      ;[layers.value[idx], layers.value[idx + 1]] = [layers.value[idx + 1]!, layers.value[idx]!]
      buildComposite()
    }
  }

  function moveLayerTo(id: string, targetIndex: number) {
    const idx = layers.value.findIndex((l) => l.id === id)
    if (idx === -1) return
    const clamped = Math.max(0, Math.min(layers.value.length - 1, targetIndex))
    if (idx === clamped) return
    const [layer] = layers.value.splice(idx, 1)
    layers.value.splice(clamped, 0, layer!)
    buildComposite()
  }

  function mergeDown(id: string) {
    const idx = layers.value.findIndex((l) => l.id === id)
    if (idx <= 0) return
    const upper = layers.value[idx]!
    const lower = layers.value[idx - 1]!
    for (let r = 0; r < rows.value; r++) {
      const uRow = upper.grid[r]
      const lRow = lower.grid[r]!
      for (let c = 0; c < cols.value; c++) {
        const color = uRow?.[c]
        if (color) lRow[c] = color
      }
    }
    removeLayer(id)
  }

  function newCanvas(c?: number, r?: number) {
    const nextCols = clampCanvasSize(c, cols.value)
    const nextRows = clampCanvasSize(r, rows.value)
    if (canvasGroup.value) {
      canvasGroup.value = null
      openGroupTabs.value = []
      showGroupPreview.value = false
      dirtyCanvases.value = new Set()
      groupVersion.value++
    }
    cols.value = nextCols
    rows.value = nextRows
    zoom.value = 1
    panX.value = 0
    panY.value = 0
    initLayers()
  }

  function flipHorizontal() {
    for (const layer of layers.value) {
      for (const row of layer.grid) {
        row.reverse()
      }
    }
    buildComposite()
  }

  function flipVertical() {
    for (const layer of layers.value) {
      layer.grid.reverse()
    }
    buildComposite()
  }

  function rotateCW() {
    const oldCols = cols.value
    const oldRows = rows.value
    for (const layer of layers.value) {
      const newGrid: string[][] = []
      for (let c = 0; c < oldCols; c++) {
        const newRow: string[] = []
        for (let r = oldRows - 1; r >= 0; r--) {
          newRow.push(layer.grid[r]![c]!)
        }
        newGrid.push(newRow)
      }
      layer.grid = rawPixelGrid(newGrid)
    }
    cols.value = oldRows
    rows.value = oldCols
    buildComposite()
  }

  function rotateCCW() {
    const oldCols = cols.value
    const oldRows = rows.value
    for (const layer of layers.value) {
      const newGrid: string[][] = []
      for (let c = oldCols - 1; c >= 0; c--) {
        const newRow: string[] = []
        for (let r = 0; r < oldRows; r++) {
          newRow.push(layer.grid[r]![c]!)
        }
        newGrid.push(newRow)
      }
      layer.grid = rawPixelGrid(newGrid)
    }
    cols.value = oldRows
    rows.value = oldCols
    buildComposite()
  }

  function resizeCanvas(c: number, r: number) {
    c = clampCanvasSize(c, cols.value)
    r = clampCanvasSize(r, rows.value)
    for (const layer of layers.value) {
      const oldGrid = layer.grid
      const newGrid: string[][] = []
      for (let row = 0; row < r; row++) {
        const newRow = new Array<string>(c).fill('')
        for (let col = 0; col < c; col++) {
          if (row < oldGrid.length && col < (oldGrid[0]?.length ?? 0)) {
            newRow[col] = oldGrid[row]![col]!
          }
        }
        newGrid.push(newRow)
      }
      layer.grid = rawPixelGrid(newGrid)
    }
    cols.value = c
    rows.value = r
    buildComposite()
  }

  // --- 扩展/裁剪（直接预览，可撤销） ---
  const resizePreview = ref<{
    newCols: number
    newRows: number
    anchorRow: number
    anchorCol: number
  } | null>(null)

  // 保存原始状态以便取消
  let resizeBackup: { layers: { grid: string[][] }[]; cols: number; rows: number } | null = null

  function applyResize(newCols: number, newRows: number, aRow: number, aCol: number) {
    const oldC = cols.value
    const oldR = rows.value
    const rowOffset =
      aRow === 0 ? 0 : aRow === 1 ? Math.floor((oldR - newRows) / 2) : oldR - newRows
    const colOffset =
      aCol === 0 ? 0 : aCol === 1 ? Math.floor((oldC - newCols) / 2) : oldC - newCols

    for (const layer of layers.value) {
      const newGrid = makeEmptyGrid(newCols, newRows)
      for (let r = 0; r < oldR; r++) {
        const nr = r - rowOffset
        if (nr < 0 || nr >= newRows) continue
        for (let c = 0; c < oldC; c++) {
          const nc = c - colOffset
          if (nc < 0 || nc >= newCols) continue
          newGrid[nr]![nc] = layer.grid[r]![c]!
        }
      }
      layer.grid = rawPixelGrid(newGrid)
    }
    cols.value = newCols
    rows.value = newRows
    buildComposite()
  }

  function saveResizeBackup() {
    resizeBackup = {
      layers: layers.value.map((l) => ({ grid: clonePixelGrid(l.grid) })),
      cols: cols.value,
      rows: rows.value,
    }
  }

  function restoreResizeBackup() {
    if (!resizeBackup) return
    for (let i = 0; i < layers.value.length; i++) {
      layers.value[i]!.grid = clonePixelGrid(resizeBackup.layers[i]!.grid)
    }
    cols.value = resizeBackup.cols
    rows.value = resizeBackup.rows
  }

  function startResize(c: number, r: number, aRow: number, aCol: number) {
    c = clampCanvasSize(c, cols.value)
    r = clampCanvasSize(r, rows.value)
    if (!resizeBackup) {
      saveResizeBackup()
    } else {
      restoreResizeBackup()
    }
    resizePreview.value = { newCols: c, newRows: r, anchorRow: aRow, anchorCol: aCol }
    applyResize(c, r, aRow, aCol)
  }

  function cancelResize() {
    if (!resizeBackup) return
    restoreResizeBackup()
    resizeBackup = null
    resizePreview.value = null
    buildComposite()
  }

  function confirmResize(): { hasConflict: boolean } {
    if (!resizeBackup) return { hasConflict: false }
    const newC = cols.value
    const newR = rows.value
    const oldC = resizeBackup.cols
    const oldR = resizeBackup.rows
    const prev = resizePreview.value
    if (!prev) return { hasConflict: false }
    const rowOffset =
      prev.anchorRow === 0 ? 0 : prev.anchorRow === 1 ? Math.floor((oldR - newR) / 2) : oldR - newR
    const colOffset =
      prev.anchorCol === 0 ? 0 : prev.anchorCol === 1 ? Math.floor((oldC - newC) / 2) : oldC - newC

    // 检查被删除区域在原始grid中是否有像素
    let conflictCount = 0
    for (let i = 0; i < resizeBackup.layers.length; i++) {
      const grid = resizeBackup.layers[i]!.grid
      for (let r = 0; r < oldR; r++) {
        const row = grid[r]!
        for (let c = 0; c < oldC; c++) {
          const inNew =
            r >= rowOffset && r < rowOffset + newR && c >= colOffset && c < colOffset + newC
          if (!inNew && row[c]) conflictCount++
        }
      }
    }
    return { hasConflict: conflictCount > 0 }
  }

  function forceResize() {
    resizeBackup = null
    resizePreview.value = null
    // 已经应用了，只需清理 backup
  }

  function setCellSilent(col: number, row: number, color: string) {
    const layer = activeLayer()
    if (!layer) return false
    if (row >= 0 && row < rows.value && col >= 0 && col < cols.value) {
      layer.grid[row]![col] = color
      return true
    }
    return false
  }

  function flushComposite() {
    buildComposite()
    if (canvasGroup.value) {
      markDirty(activeGroupRow.value, activeGroupCol.value)
    }
  }

  function setCell(col: number, row: number, color: string) {
    if (setCellSilent(col, row, color)) {
      flushComposite()
    }
  }

  function getCell(col: number, row: number): string {
    if (row >= 0 && row < rows.value && col >= 0 && col < cols.value) {
      return compositeGrid.value[row]![col]!
    }
    return ''
  }

  function setZoom(z: number) {
    zoom.value = Math.max(0.1, Math.min(2.0, z))
  }

  function setPan(x: number, y: number) {
    panX.value = x
    panY.value = y
  }

  function toggleGrid() {
    showGrid.value = !showGrid.value
  }

  function updateCursor(col: number, row: number) {
    cursorCol.value = col
    cursorRow.value = row
  }

  function getActiveLayerSnapshot(): { layerId: string; grid: string[][] } | null {
    const layer = activeLayer()
    if (!layer) return null
    return {
      layerId: layer.id,
      grid: clonePixelGrid(layer.grid),
    }
  }

  function applyLayerSnapshot(layerId: string, gridSnapshot: string[][]) {
    const layer = layers.value.find((l) => l.id === layerId)
    if (!layer) return
    if (gridSnapshot.length > 0) {
      layer.grid = clonePixelGrid(gridSnapshot)
    }
    buildComposite()
  }

  function hasAnyPixels(): boolean {
    const hasPixels = (sourceLayers: CanvasSnapshot['layers']) =>
      sourceLayers.some((layer) => layer.grid.some((row) => row.some(Boolean)))
    if (hasPixels(layers.value)) return true
    return (
      canvasGroup.value?.canvases.some((row, groupRow) =>
        row.some(
          (snapshot, groupCol) =>
            (groupRow !== activeGroupRow.value || groupCol !== activeGroupCol.value) &&
            hasPixels(snapshot.layers),
        ),
      ) ?? false
    )
  }

  // init
  initLayers()

  return {
    cols,
    rows,
    compositeGrid,
    zoom,
    panX,
    panY,
    showGrid,
    cursorCol,
    cursorRow,
    gridVersion,
    renderMode,
    prevRenderMode,
    transitionProgress,
    setRenderMode,
    symmetry,
    pixelShape,
    showColorIds,
    showColorIdsHighlightOnly,
    backgroundColor,
    thickLineH,
    thickLineV,
    geoPreview,
    setThickLineH,
    setThickLineV,
    layers,
    activeLayerId,
    activeLayer,
    initLayers,
    addLayer,
    removeLayer,
    setActiveLayer,
    renameLayer,
    duplicateLayer,
    moveLayerUp,
    moveLayerDown,
    moveLayerTo,
    mergeDown,
    flipHorizontal,
    flipVertical,
    rotateCW,
    rotateCCW,
    newCanvas,
    resizeCanvas,
    resizePreview,
    startResize,
    cancelResize,
    confirmResize,
    forceResize,
    setCellSilent,
    flushComposite,
    setCell,
    getCell,
    setZoom,
    setPan,
    toggleGrid,
    updateCursor,
    getActiveLayerSnapshot,
    applyLayerSnapshot,
    hasAnyPixels,
    buildComposite,
    bumpVersion,
    // 画布组
    canvasGroup,
    groupVersion,
    activeGroupCol,
    activeGroupRow,
    openGroupTabs,
    showGroupPreview,
    dirtyCanvases,
    createCanvasGroup,
    createCanvasGroupFromGrid,
    switchToSubCanvas,
    closeGroupTab,
    swapSubCanvases,
    resizeGroupCanvas,
    addGroupRow,
    deleteGroupRow,
    addGroupCol,
    deleteGroupCol,
    hasPixelsInRow,
    hasPixelsInCol,
    leaveGroupMode,
    saveActiveToGroup,
    restoreCanvasSnapshot,
    markDirty,
  }
})
