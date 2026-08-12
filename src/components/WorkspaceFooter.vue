<template>
  <div class="workspace-footer">
    <span class="wf-item">{{ projectStore.projectName }}</span>
    <span class="wf-divider">|</span>
    <span class="wf-item">{{ canvasStore.cols }} x {{ canvasStore.rows }}</span>
    <span class="wf-divider">|</span>
    <span class="wf-item">缩放 {{ Math.round(canvasStore.zoom * 100) }}%</span>
    <span class="wf-divider">|</span>
    <span class="wf-item">
      色
      <span class="color-dot" :style="{ background: paletteStore.currentColor }"></span>
    </span>
    <span class="wf-divider">|</span>
    <span class="wf-item">坐标: ({{ cursorCol + 1 }}, {{ cursorRow + 1 }})</span>
    <span class="wf-divider">|</span>
    <span class="wf-item">{{ projectStore.createdAt }}</span>
    <span class="wf-spacer"></span>
    <span class="wf-item">
      <button class="wf-action" :disabled="!historyStore.canUndo" @click="doUndo">撤销</button>
      <button class="wf-action" :disabled="!historyStore.canRedo" @click="doRedo">重做</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useHistoryStore } from '@/stores/history'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'

const canvasStore = useCanvasStore()
const historyStore = useHistoryStore()
const paletteStore = usePaletteStore()
const projectStore = useProjectStore()

const cursorCol = computed(() => canvasStore.cursorCol)
const cursorRow = computed(() => canvasStore.cursorRow)

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
.workspace-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #fafafa;
  border-top: 1px solid #e5e7eb;
  font-size: 0.7rem;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
}

.wf-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wf-divider {
  color: #ddd;
}

.wf-spacer {
  flex: 1;
}

.wf-action {
  padding: 1px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  font-size: 0.65rem;
  cursor: pointer;
  color: #555;
}

.wf-action:disabled {
  opacity: 0.4;
  cursor: default;
}

.wf-action:hover:not(:disabled) {
  background: #f3f4f6;
}

.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid #ccc;
}
</style>
