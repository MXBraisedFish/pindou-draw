<template>
  <DeviceModal v-if="isFirstVisit" @select="selectDevice" />
  <NoticeHost />
  <TutorialOverlay />

  <div v-if="device" class="app-shell">
    <PhoneEditor v-if="device === 'ph'" />
    <template v-else>
      <TopGlobalBar />
      <TopContextBar />
      <MainLayout />
    </template>
    <AutoSaveStatus />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useDevice } from '@/composables/useDevice'
import DeviceModal from '@/components/DeviceModal.vue'
import NoticeHost from '@/components/NoticeHost.vue'
import TutorialOverlay from '@/components/TutorialOverlay.vue'
import TopGlobalBar from '@/components/TopGlobalBar.vue'
import TopContextBar from '@/components/TopContextBar.vue'
import MainLayout from '@/components/MainLayout.vue'
import PhoneEditor from '@/components/PhoneEditor.vue'
import AutoSaveStatus from '@/components/AutoSaveStatus.vue'
import { useCanvasStore } from '@/stores/canvas'
import { useExportStore } from '@/stores/exportStore'
import { useHistoryStore } from '@/stores/history'
import { useToolStore, type ToolType } from '@/stores/tool'
import { useSelectionStore } from '@/stores/selection'
import { useShortcuts, type ShortcutAction } from '@/composables/useShortcuts'

import '@/css/tailwind.css'
import '@/css/computer.css'
import '@/css/tablet.css'
import '@/css/phone.css'

const { device, isFirstVisit, init, selectDevice } = useDevice()
const { actionForKey } = useShortcuts()
let allowUnload = false

const shortcutTools: Partial<Record<ShortcutAction, ToolType>> = {
  toolMove: 'move',
  toolPencil: 'pencil',
  toolEraser: 'eraser',
  toolBucket: 'bucket',
  toolPicker: 'picker',
  toolSelect: 'select',
  toolGeometry: 'geometry',
}

function preventAccidentalClose(event: BeforeUnloadEvent) {
  if (allowUnload) return
  const canvasStore = useCanvasStore()
  if (!canvasStore.hasAnyPixels()) return
  event.preventDefault()
  event.returnValue = '当前工程包含绘制内容，请先保存工程文件。'
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const element = target as HTMLElement
  return Boolean(
    element.matches('input, textarea, select, [contenteditable="true"]') ||
    element.closest('[data-shortcut-recording="true"]'),
  )
}

function handleShortcut(event: KeyboardEvent) {
  if (device.value !== 'pc' || event.repeat || event.altKey) return
  if (isEditableTarget(event.target)) return
  if (
    document.querySelector(
      '.tutorial-overlay, .notice-overlay, .settings-overlay, .action-overlay, .new-overlay, .storage-overlay, .confirm-overlay, .image-editor, .export-page, .hl-overlay, .cr-overlay, .ehl-overlay, .device-modal-overlay',
    )
  ) {
    return
  }

  const toolStore = useToolStore()
  const selectionStore = useSelectionStore()
  const commandKey = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (toolStore.activeTool === 'select') {
    if (commandKey && !event.shiftKey && ['a', 'c', 'x', 'v'].includes(key)) {
      event.preventDefault()
      if (key === 'a') selectionStore.selectAll()
      else if (key === 'c') selectionStore.copySelection()
      else if (key === 'x') selectionStore.cutSelection()
      else {
        const canvasStore = useCanvasStore()
        selectionStore.pasteSelection(canvasStore.cursorRow, canvasStore.cursorCol)
      }
      return
    }
    if (!commandKey && !event.shiftKey && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      selectionStore.deleteSelectionContent()
      return
    }
    if (!commandKey && !event.shiftKey && event.key === 'Escape') {
      event.preventDefault()
      selectionStore.clearSelection()
      return
    }
  }

  if (commandKey || event.shiftKey) return
  const action = actionForKey(event.key)
  if (!action) return
  event.preventDefault()

  const tool = shortcutTools[action]
  if (tool) {
    if (useCanvasStore().underlayEditMode) return
    toolStore.setTool(tool)
    return
  }

  if (action === 'export') {
    useExportStore().showModal = true
  } else if (action === 'newProject') {
    window.dispatchEvent(new CustomEvent('pindou-open-new'))
  } else {
    const historyStore = useHistoryStore()
    const entry = action === 'undo' ? historyStore.undo() : historyStore.redo()
    if (entry) useCanvasStore().applyLayerSnapshot(entry.layerId, entry.grid)
  }
}

function permitDataResetReload() {
  allowUnload = true
}

onMounted(() => {
  init()
  window.addEventListener('beforeunload', preventAccidentalClose)
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pindou-data-resetting', permitDataResetReload)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', preventAccidentalClose)
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pindou-data-resetting', permitDataResetReload)
})
</script>
