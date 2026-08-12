import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isProxy, isReactive } from 'vue'
import {
  CANVAS_SIZE_MAX,
  CANVAS_SIZE_MIN,
  GROUP_SIZE_MAX,
  useCanvasStore,
  rawPixelGrid,
} from '@/stores/canvas'
import { useHistoryStore } from '@/stores/history'
import { useSelectionStore } from '@/stores/selection'

describe('bulk canvas data reactivity', () => {
  function setup() {
    setActivePinia(createPinia())
    return useCanvasStore()
  }

  it('keeps active pixel and composite grids outside deep reactivity', () => {
    const canvas = setup()

    expect(isProxy(canvas.activeLayer()!.grid)).toBe(false)
    expect(isReactive(canvas.activeLayer()!.grid[0])).toBe(false)
    expect(isProxy(canvas.compositeGrid)).toBe(false)

    canvas.resizeCanvas(128, 128)
    expect(isProxy(canvas.activeLayer()!.grid)).toBe(false)
    expect(isProxy(canvas.compositeGrid)).toBe(false)

    const snapshot = canvas.getActiveLayerSnapshot()!
    canvas.applyLayerSnapshot(snapshot.layerId, snapshot.grid)
    expect(isProxy(canvas.activeLayer()!.grid)).toBe(false)
  })

  it('keeps imported and historical pixel matrices raw', () => {
    const canvas = setup()
    const history = useHistoryStore()
    const imported = rawPixelGrid(Array.from({ length: 4 }, () => Array(4).fill('#ffffff')))

    canvas.layers = [{ id: 'imported', name: '导入', visible: true, grid: imported }]
    canvas.activeLayerId = 'imported'
    history.push({ layerId: 'imported', grid: imported, cols: 4, rows: 4 })

    expect(isProxy(canvas.activeLayer()!.grid)).toBe(false)
    expect(isProxy(history.stack[0]!.grid)).toBe(false)
  })

  it('keeps the selection mask raw while versioning its mutations', () => {
    setup()
    const selection = useSelectionStore()

    expect(isProxy(selection.selectionMask)).toBe(false)
    selection.beginSelection(0, 0)
    selection.updateSelection(3, 3)
    selection.endSelection()
    expect(selection.hasSelection).toBe(true)
    expect(isProxy(selection.selectionMask)).toBe(false)
  })

  it('clamps canvas and group dimensions at the store boundary', () => {
    const canvas = setup()

    canvas.newCanvas(-20, 1000)
    expect(canvas.cols).toBe(CANVAS_SIZE_MIN)
    expect(canvas.rows).toBe(CANVAS_SIZE_MAX)

    canvas.createCanvasGroup('边界测试', 0, 99, 100)
    expect(canvas.canvasGroup?.groupCols).toBe(1)
    expect(canvas.canvasGroup?.groupRows).toBe(GROUP_SIZE_MAX)
    expect(canvas.canvasGroup?.subSize).toBe(CANVAS_SIZE_MAX)
    expect(canvas.showGroupPreview).toBe(true)
  })

  it('notifies group structure changes and makes standalone canvas independent', () => {
    const canvas = setup()
    canvas.createCanvasGroup('组', 2, 2, 16)
    const createdVersion = canvas.groupVersion

    canvas.addGroupCol(0, false)
    expect(canvas.canvasGroup?.groupCols).toBe(3)
    expect(canvas.groupVersion).toBeGreaterThan(createdVersion)

    canvas.activeLayer()!.grid[0]![0] = '#ffffff'
    expect(canvas.hasAnyPixels()).toBe(true)
    canvas.newCanvas(12, 10)
    expect(canvas.canvasGroup).toBeNull()
    expect(canvas.cols).toBe(12)
    expect(canvas.rows).toBe(10)
    expect(canvas.hasAnyPixels()).toBe(false)
  })

  it('does not add rows or columns beyond the group size limit', () => {
    const canvas = setup()
    canvas.createCanvasGroup('上限测试', GROUP_SIZE_MAX, GROUP_SIZE_MAX, 8)

    canvas.addGroupRow(GROUP_SIZE_MAX - 1, false)
    canvas.addGroupCol(GROUP_SIZE_MAX - 1, false)

    expect(canvas.canvasGroup?.groupRows).toBe(GROUP_SIZE_MAX)
    expect(canvas.canvasGroup?.groupCols).toBe(GROUP_SIZE_MAX)
  })
})
