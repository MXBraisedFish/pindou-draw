import { beforeEach, describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import { useExportStore } from '@/stores/exportStore'
import { useToolStore } from '@/stores/tool'
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import { useDevice } from '@/composables/useDevice'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('mounts and renders device modal on first visit', async () => {
    localStorage.removeItem('pindou-device')
    const wrapper = mount(App)
    await nextTick()
    expect(wrapper.text()).toContain('欢迎使用拼豆绘制')
    wrapper.unmount()
  })

  it('executes the common desktop shortcuts outside editable controls', async () => {
    localStorage.setItem('pindou-device', 'pc')
    const wrapper = mount(App, {
      global: {
        stubs: {
          TopGlobalBar: true,
          TopContextBar: true,
          MainLayout: true,
          AutoSaveStatus: true,
          NoticeHost: true,
          TutorialOverlay: true,
        },
      },
    })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    expect(useToolStore().activeTool).toBe('move')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    expect(useExportStore().showModal).toBe(true)

    wrapper.unmount()
  })

  it('supports standard desktop selection shortcuts', async () => {
    useDevice().changeDevice('pc')
    const wrapper = mount(App, {
      global: {
        stubs: {
          TopGlobalBar: true,
          TopContextBar: true,
          MainLayout: true,
          AutoSaveStatus: true,
          NoticeHost: true,
          TutorialOverlay: true,
          DeviceModal: true,
        },
      },
    })
    const canvas = useCanvasStore()
    const selection = useSelectionStore()
    const tool = useToolStore()
    tool.setTool('select')
    canvas.activeLayer()!.grid[0]![0] = '#123456'

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
    expect(selection.hasSelection).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    expect(selection.hasClipboard).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(canvas.activeLayer()!.grid[0]![0]).toBe('')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(selection.hasSelection).toBe(false)
    wrapper.unmount()
  })
})
