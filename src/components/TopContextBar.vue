<template>
  <div class="top-context-bar">
    <div v-if="toolStore.activeTool" class="context-tool-name">{{ toolLabel }}</div>
    <ToolOptions />
    <div class="context-zoom">
      <label class="zoom-control">
        缩放
        <input
          type="range"
          min="0.1"
          max="2"
          step="0.01"
          :value="canvasStore.zoom"
          @input="canvasStore.setZoom(Number(($event.target as HTMLInputElement).value))"
        />
        <strong>{{ Math.round(canvasStore.zoom * 100) }}%</strong>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ToolOptions from '@/components/ToolOptions.vue'
import { useCanvasStore } from '@/stores/canvas'
import { useToolStore } from '@/stores/tool'

const canvasStore = useCanvasStore()
const toolStore = useToolStore()

const labels: Record<string, string> = {
  move: '移动',
  pencil: '铅笔',
  eraser: '橡皮',
  bucket: '填充',
  select: '选区',
  picker: '取色',
  geometry: '几何',
}
const toolLabel = computed(() => labels[toolStore.activeTool] ?? '')
</script>

<style scoped>
.top-context-bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
}

.context-tool-name {
  flex: 0 0 auto;
  color: #333;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.context-zoom {
  margin-left: auto;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #555;
  font-size: 0.78rem;
  white-space: nowrap;
}

.zoom-control input {
  width: 80px;
}

.zoom-control strong {
  min-width: 38px;
  color: #6366f1;
}
</style>
