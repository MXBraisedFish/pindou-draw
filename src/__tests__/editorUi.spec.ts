import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import RightPanels from '@/components/RightPanels.vue'
import MainLayout from '@/components/MainLayout.vue'
import TopGlobalBar from '@/components/TopGlobalBar.vue'
import CanvasGroupPreview from '@/components/CanvasGroupPreview.vue'
import LeftToolbar from '@/components/LeftToolbar.vue'
import FloatingImageWindows from '@/components/FloatingImageWindows.vue'
import CanvasArea from '@/components/CanvasArea.vue'
import ExportModal from '@/components/ExportModal.vue'
import { useCanvasStore } from '@/stores/canvas'
import { useExportStore } from '@/stores/exportStore'
import { useDevice } from '@/composables/useDevice'
import { useWorkspaceStore } from '@/stores/workspace'
import { usePaletteStore } from '@/stores/palette'

describe('desktop editor UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          fillStyle: '',
          strokeStyle: '',
          globalAlpha: 1,
          setTransform: vi.fn(),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          rect: vi.fn(),
          arc: vi.fn(),
          ellipse: vi.fn(),
          clip: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          setLineDash: vi.fn(),
          fillText: vi.fn(),
          createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
          drawImage: vi.fn(),
          getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
        }) as unknown as CanvasRenderingContext2D,
    )
  })

  it('locks the right panel while the whole canvas group is focused', async () => {
    const canvas = useCanvasStore()
    canvas.createCanvasGroup('测试组', 2, 2, 16)
    canvas.showGroupPreview = true

    const wrapper = mount(RightPanels, {
      global: {
        stubs: { PanelPalette: true, PanelLayers: true, PanelCanvas: true },
      },
    })
    await nextTick()

    expect(wrapper.find('.panel-lock').exists()).toBe(true)
    expect(wrapper.text()).toContain('请先选择一个画布')
  })

  it('requests a file before mounting the image editor', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(TopGlobalBar, {
      global: {
        stubs: {
          Teleport: true,
          ConfirmModal: true,
          ExportModal: true,
          ImageToPixelModal: {
            props: ['file'],
            template: '<div data-test="image-editor">{{ file.name }}</div>',
          },
        },
      },
    })

    await wrapper
      .findAll('.global-btn')
      .find((button) => button.text() === '新建')!
      .trigger('click')
    await wrapper
      .findAll('.new-opt-btn')
      .find((button) => button.text() === '以图生图')!
      .trigger('click')
    expect(inputClick).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-test="image-editor"]').exists()).toBe(false)

    const input = wrapper.find<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['image'], '测试图片.png', { type: 'image/png' })],
    })
    await input.trigger('change')

    expect(wrapper.find('[data-test="image-editor"]').text()).toContain('测试图片.png')
    inputClick.mockRestore()
  })

  it('recognizes canvas groups and exposes separate, combined, and stats exports', async () => {
    const canvas = useCanvasStore()
    canvas.createCanvasGroup('导出组', 2, 3, 8)
    canvas.activeLayer()!.grid[0]![0] = '#ffffff'
    canvas.flushComposite()

    const exportStore = useExportStore()
    expect(exportStore.exportFont).toBe('default')
    expect(exportStore.groupExportMode).toBe('separate')
    exportStore.exportName = '自定义名称'
    const sources = exportStore.getGroupSources()
    expect(sources).toHaveLength(6)
    expect(sources.map((source) => source.name)).toContain('自定义名称(1,1)')
    expect(sources.map((source) => source.name)).toContain('自定义名称(2,3)')

    const combined = exportStore.getCombinedGroupSource()
    expect(combined?.cols).toBe(16)
    expect(combined?.rows).toBe(24)
    expect(combined?.grid[0]?.[0]).toBe('#ffffff')

    exportStore.groupExportMode = 'separate'
    exportStore.exportContent = 'stats-only'
    expect(exportStore.groupExportMode).toBe('separate')
    expect(exportStore.exportContent).toBe('stats-only')
    expect(exportStore.groupSeparateDownloadMode).toBe('zip')

    const activeBefore = { row: canvas.activeGroupRow, col: canvas.activeGroupCol }
    exportStore.selectGroupPreview(2, 1)
    expect(exportStore.groupPreviewRow).toBe(2)
    expect(exportStore.groupPreviewCol).toBe(1)
    expect({ row: canvas.activeGroupRow, col: canvas.activeGroupCol }).toEqual(activeBefore)
  })

  it('requires a five-second license confirmation for non-commercial export fonts', async () => {
    vi.useFakeTimers()
    try {
      const exportStore = useExportStore()
      vi.spyOn(exportStore, 'refreshPreview').mockImplementation(() => {})
      const exportAction = vi.spyOn(exportStore, 'doExport').mockResolvedValue()
      const wrapper = mount(ExportModal, {
        global: { stubs: { Teleport: true, ExportHighlightModal: true } },
      })

      exportStore.exportFont = 'pixel'
      await nextTick()
      await wrapper.find('.export-button').trigger('click')
      expect(wrapper.find('[data-test="font-license-warning"]').exists()).toBe(true)
      expect(
        wrapper.find<HTMLButtonElement>('[data-test="font-license-confirm"]').element.disabled,
      ).toBe(true)

      await wrapper.find('.license-cancel').trigger('click')
      expect(wrapper.find('[data-test="font-license-warning"]').exists()).toBe(false)
      expect(exportAction).not.toHaveBeenCalled()

      await wrapper.find('.export-button').trigger('click')
      vi.advanceTimersByTime(4999)
      await nextTick()
      expect(
        wrapper.find<HTMLButtonElement>('[data-test="font-license-confirm"]').element.disabled,
      ).toBe(true)
      vi.advanceTimersByTime(1)
      await nextTick()
      expect(
        wrapper.find<HTMLButtonElement>('[data-test="font-license-confirm"]').element.disabled,
      ).toBe(false)

      await wrapper.find('[data-test="font-license-confirm"]').trigger('click')
      expect(exportAction).toHaveBeenCalledOnce()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rebuilds the canvas-group grid after rows and columns change', async () => {
    const canvas = useCanvasStore()
    canvas.createCanvasGroup('响应式组', 8, 5, 8)
    const wrapper = mount(CanvasGroupPreview, {
      global: { stubs: { Teleport: true, ConfirmModal: true } },
    })
    await nextTick()

    expect(wrapper.findAll('.cgp-col-label')).toHaveLength(8)
    expect(wrapper.findAll('.cgp-row-label')).toHaveLength(5)
    expect(wrapper.findAll('.cgp-cell')).toHaveLength(40)

    canvas.addGroupCol(7, false)
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('.cgp-col-label')).toHaveLength(9)
    expect(wrapper.findAll('.cgp-cell')).toHaveLength(45)

    canvas.deleteGroupRow(4)
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('.cgp-row-label')).toHaveLength(4)
    expect(wrapper.findAll('.cgp-cell')).toHaveLength(36)
  })

  it('keeps the right panel collapsible and shows icon history controls on tablet', async () => {
    useDevice().changeDevice('tb')
    const canvas = useCanvasStore()
    const wrapper = mount(MainLayout, {
      global: {
        stubs: {
          LeftToolbar: true,
          CanvasArea: true,
          RightPanels: true,
          FloatingImageWindows: true,
          MobileSheet: true,
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.tablet-history-actions').exists()).toBe(true)
    expect(wrapper.findAll('.tablet-history-actions img')).toHaveLength(2)
    expect(wrapper.findComponent({ name: 'MobileSheet' }).exists()).toBe(false)

    canvas.showGroupPreview = true
    await nextTick()
    expect(wrapper.find('.tablet-history-actions').exists()).toBe(false)

    canvas.showGroupPreview = false
    await nextTick()
    expect(wrapper.find('.tablet-history-actions').exists()).toBe(true)

    const panel = mount(RightPanels, {
      global: {
        stubs: { PanelPalette: true, PanelLayers: true, PanelCanvas: true },
      },
    })
    expect(panel.find('.right-panels').classes()).not.toContain('tablet-collapsed')

    canvas.showGroupPreview = true
    await nextTick()
    expect(panel.find('.right-panels').classes()).toContain('tablet-collapsed')

    canvas.showGroupPreview = false
    await nextTick()
    expect(panel.find('.right-panels').classes()).not.toContain('tablet-collapsed')

    await panel.find('.tablet-panel-toggle').trigger('click')
    expect(panel.find('.right-panels').classes()).toContain('tablet-collapsed')

    canvas.showGroupPreview = true
    await nextTick()
    canvas.showGroupPreview = false
    await nextTick()
    expect(panel.find('.right-panels').classes()).toContain('tablet-collapsed')
  })

  it('opens active tool options from the tablet toolbar', async () => {
    useDevice().changeDevice('tb')
    const wrapper = mount(LeftToolbar, {
      global: { stubs: { Teleport: true } },
    })

    expect(wrapper.find('.tool-expand-toggle').exists()).toBe(true)
    await wrapper.find('.tool-expand-toggle').trigger('click')
    expect(wrapper.find('.tablet-tool-options-popover').exists()).toBe(true)
    expect(wrapper.text()).toContain('铅笔设置')
  })

  it('temporarily hides floating image windows in the canvas-group overview', async () => {
    useDevice().changeDevice('pc')
    const canvas = useCanvasStore()
    const workspace = useWorkspaceStore()
    canvas.createCanvasGroup('预览组', 2, 2, 8)
    canvas.switchToSubCanvas(0, 0)
    workspace.referenceImage = { src: 'data:image/png;base64,AAAA', name: '参考.png' }
    workspace.referenceWindowOpen = true
    workspace.groupPreviewWindowOpen = true

    const wrapper = mount(FloatingImageWindows, {
      global: { stubs: { Teleport: true } },
    })
    await nextTick()
    expect(wrapper.find('[data-window="reference"]').attributes('style')).not.toContain(
      'display: none',
    )
    expect(wrapper.find('[data-window="group"]').attributes('style')).not.toContain('display: none')

    canvas.showGroupPreview = true
    await nextTick()
    expect(wrapper.find('[data-window="reference"]').attributes('style')).toContain('display: none')
    expect(wrapper.find('[data-window="group"]').attributes('style')).toContain('display: none')

    canvas.showGroupPreview = false
    await nextTick()
    expect(wrapper.find('[data-window="reference"]').attributes('style')).not.toContain(
      'display: none',
    )
    expect(workspace.referenceWindowOpen).toBe(true)
    expect(workspace.groupPreviewWindowOpen).toBe(true)
  })

  it('uses the underlay color only when a painting tool draws', async () => {
    useDevice().changeDevice('pc')
    const canvas = useCanvasStore()
    const palette = usePaletteStore()
    palette.colorEntries = [
      { id: 'dark', type: 'solid', color1: '#000000', color2: null },
      { id: 'light', type: 'solid', color1: '#ffffff', color2: null },
    ]
    palette.currentColorId = 'dark'
    canvas.underlay = {
      src: 'data:image/png;base64,AAAA',
      name: '底图.png',
      opacity: 0.1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    }
    canvas.autoPickUnderlayColor = true
    vi.spyOn(canvas, 'sampleUnderlayColor').mockReturnValue('#fefefe')

    const wrapper = mount(CanvasArea, {
      global: { stubs: { WorkspaceFooter: true, CanvasGroupPreview: true } },
    })
    const drawingCanvas = wrapper.find('canvas')
    vi.spyOn(drawingCanvas.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 160,
      width: 160,
      height: 160,
      toJSON: () => ({}),
    })
    drawingCanvas.element.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
    )
    drawingCanvas.element.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
    )
    await nextTick()

    expect(palette.currentColorId).toBe('light')
    expect(canvas.activeLayer()?.grid[0]?.[0]).toBe('#ffffff')
  })
})
