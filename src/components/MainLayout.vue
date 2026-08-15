<template>
  <div class="main-layout">
    <LeftToolbar />
    <CanvasArea />
    <FloatingImageWindows />
    <RightPanels />
    <MobileSheet v-if="device === 'ph'" />
    <div v-if="device === 'tb' && !canvasStore.showGroupPreview" class="tablet-history-actions">
      <button title="撤回" :disabled="!historyStore.canUndo" @click="doUndo()">
        <img :src="iconUndo" alt="撤回" />
      </button>
      <button title="回退" :disabled="!historyStore.canRedo" @click="doRedo()">
        <img :src="iconRedo" alt="回退" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import LeftToolbar from '@/components/LeftToolbar.vue'
import CanvasArea from '@/components/CanvasArea.vue'
import FloatingImageWindows from '@/components/FloatingImageWindows.vue'
import RightPanels from '@/components/RightPanels.vue'
import MobileSheet from '@/components/MobileSheet.vue'
import { useHistoryStore } from '@/stores/history'
import { useCanvasStore } from '@/stores/canvas'
import iconUndo from '@/assets/icon/撤回.png'
import iconRedo from '@/assets/icon/回退.png'

const { device } = useDevice()
const historyStore = useHistoryStore()
const canvasStore = useCanvasStore()

function doUndo() {
  const entry = historyStore.undo()
  if (entry) canvasStore.applyLayerSnapshot(entry.layerId, entry.grid)
}

function doRedo() {
  const entry = historyStore.redo()
  if (entry) canvasStore.applyLayerSnapshot(entry.layerId, entry.grid)
}
</script>

<style scoped>
.main-layout {
  position: relative;
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tablet-history-actions {
  display: none;
}
</style>
