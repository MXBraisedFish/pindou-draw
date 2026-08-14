import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCanvasStore } from '@/stores/canvas'
import { useHistoryStore } from '@/stores/history'
import { useSelectionStore } from '@/stores/selection'
import { useToolStore } from '@/stores/tool'

describe('selection editing', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('supports replacing, adding, removing, inverting and clearing selections', () => {
    const selection = useSelectionStore()
    const tool = useToolStore()
    selection.resize(8, 8)

    tool.setSelectMode('replace')
    selection.beginSelection(1, 1)
    selection.updateSelection(3, 3)
    selection.endSelection()
    expect(selection.isSelected(2, 2)).toBe(true)
    expect(selection.isSelected(0, 0)).toBe(false)

    tool.setSelectMode('add')
    selection.beginSelection(5, 5)
    selection.endSelection()
    expect(selection.isSelected(2, 2)).toBe(true)
    expect(selection.isSelected(5, 5)).toBe(true)

    tool.setSelectMode('remove')
    selection.beginSelection(2, 2)
    selection.endSelection()
    expect(selection.isSelected(2, 2)).toBe(false)

    selection.invertSelection()
    expect(selection.isSelected(2, 2)).toBe(true)
    expect(selection.isSelected(1, 1)).toBe(false)
    selection.clearSelection()
    expect(selection.hasSelection).toBe(false)
  })

  it('copies selected pixels and transparent cells across layers', () => {
    const canvas = useCanvasStore()
    const selection = useSelectionStore()
    const tool = useToolStore()
    canvas.newCanvas(4, 4)
    selection.resize(4, 4)
    canvas.activeLayer()!.grid[0]![0] = '#111111'
    canvas.activeLayer()!.grid[0]![1] = ''

    tool.setSelectMode('replace')
    selection.beginSelection(0, 0)
    selection.updateSelection(1, 0)
    selection.endSelection()
    selection.copySelection()

    const target = canvas.addLayer('目标图层')
    target.grid[2]![2] = '#ffffff'
    target.grid[2]![3] = '#ffffff'
    selection.pasteSelection(2, 2)

    expect(target.grid[2]![2]).toBe('#111111')
    expect(target.grid[2]![3]).toBe('')
    expect(selection.isSelected(2, 2)).toBe(true)
    expect(selection.isSelected(3, 2)).toBe(true)
  })

  it('keeps the clipboard available between group canvases and histories destructive edits', () => {
    const canvas = useCanvasStore()
    const selection = useSelectionStore()
    const tool = useToolStore()
    const history = useHistoryStore()
    canvas.createCanvasGroup('跨画布', 2, 1, 4)
    selection.resize(4, 4)
    canvas.activeLayer()!.grid[0]![0] = '#abcdef'

    tool.setSelectMode('replace')
    selection.beginSelection(0, 0)
    selection.endSelection()
    selection.copySelection()
    canvas.switchToSubCanvas(0, 1)
    selection.clearSelection()
    selection.pasteSelection(1, 1)

    expect(canvas.activeLayer()!.grid[1]![1]).toBe('#abcdef')
    expect(history.canUndo).toBe(true)
    const previous = history.undo()
    expect(previous).not.toBeNull()
    canvas.applyLayerSnapshot(previous!.layerId, previous!.grid)
    expect(canvas.activeLayer()!.grid[1]![1]).toBe('')
  })
})
