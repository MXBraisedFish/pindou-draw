<template>
  <div class="workspace-header">
    <span class="wh-item">{{ projectStore.projectName }}</span>
    <span class="wh-divider">|</span>
    <span class="wh-item">{{ canvasStore.cols }} x {{ canvasStore.rows }}</span>
    <span class="wh-divider">|</span>
    <span class="wh-item">缩放 {{ Math.round(canvasStore.zoom * 100) }}%</span>
    <span class="wh-divider">|</span>
    <span class="wh-item">
      当前色
      <span
        class="color-dot"
        :style="{ background: paletteStore.currentColor }"
      ></span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'

const canvasStore = useCanvasStore()
const paletteStore = usePaletteStore()
const projectStore = useProjectStore()
</script>

<style scoped>
.workspace-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
}

.wh-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.wh-divider {
  color: #ddd;
}

.color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid #ccc;
}
</style>
