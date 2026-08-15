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
import { useProjectStore } from '@/stores/project'
import { useWorkspaceStore } from '@/stores/workspace'

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

  it('keeps each canvas underlay independent inside a canvas group', () => {
    const canvas = setup()
    canvas.createCanvasGroup('底图组', 2, 1, 16)
    canvas.switchToSubCanvas(0, 0)
    canvas.setUnderlay({ src: 'data:image/png;base64,AAAA', name: '左侧.png' })
    canvas.updateUnderlay({ opacity: 0.35, scale: 1.8, offsetX: 2, offsetY: -1 })
    canvas.autoPickUnderlayColor = true
    canvas.saveActiveToGroup()

    canvas.switchToSubCanvas(0, 1)
    expect(canvas.underlay).toBeNull()
    expect(canvas.autoPickUnderlayColor).toBe(false)

    canvas.switchToSubCanvas(0, 0)
    expect(canvas.underlay).toMatchObject({
      name: '左侧.png',
      opacity: 0.35,
      scale: 1.8,
      offsetX: 2,
      offsetY: -1,
    })
    expect(canvas.autoPickUnderlayColor).toBe(true)
    expect(canvas.underlayEditMode).toBe(false)
  })

  it('directly replaces an existing underlay and resets it to centered proportional fit', () => {
    const canvas = setup()
    canvas.setUnderlay({ src: 'data:image/png;base64,AAAA', name: '旧底图.png' })
    canvas.updateUnderlay({ opacity: 0.2, scale: 3, offsetX: 5, offsetY: -4 })

    canvas.setUnderlay({ src: 'data:image/png;base64,BBBB', name: '新底图.png' })

    expect(canvas.underlay).toEqual({
      src: 'data:image/png;base64,BBBB',
      name: '新底图.png',
      opacity: 0.5,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it('serializes the underlay and project reference image', () => {
    const canvas = setup()
    const project = useProjectStore()
    const workspace = useWorkspaceStore()
    canvas.setUnderlay({ src: 'data:image/png;base64,BBBB', name: '底图.png' })
    canvas.updateUnderlay({ opacity: 0.4, scale: 1.25 })
    canvas.autoPickUnderlayColor = true
    workspace.referenceImage = { src: 'data:image/png;base64,CCCC', name: '参考图.png' }

    const saved = JSON.parse(project.createProjectJson())
    expect(saved.version).toBe(4)
    expect(saved.underlay).toMatchObject({ name: '底图.png', opacity: 0.4, scale: 1.25 })
    expect(saved.autoPickUnderlayColor).toBe(true)
    expect(saved.referenceImage).toEqual({
      src: 'data:image/png;base64,CCCC',
      name: '参考图.png',
    })
  })
})
