<template>
  <div class="left-toolbar">
    <button
      v-for="tool in tools"
      :key="tool.key"
      class="tool-btn"
      :class="{ active: toolStore.activeTool === tool.key }"
      :title="tool.label"
      @click="toolStore.setTool(tool.key)"
    >
      <img :src="tool.icon" class="tool-icon" :alt="tool.label" />
      <span class="tool-label">{{ tool.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useToolStore } from '@/stores/tool'
import iconMove from '@/assets/icon/移动.png'
import iconPencil from '@/assets/icon/铅笔.png'
import iconEraser from '@/assets/icon/橡皮.png'
import iconBucket from '@/assets/icon/油漆桶.png'
import iconPicker from '@/assets/icon/吸管.png'
import iconSelect from '@/assets/icon/选区.png'
import iconGeometry from '@/assets/icon/几何工具.png'

const toolStore = useToolStore()

const tools = [
  { key: 'move', icon: iconMove, label: '移动' },
  { key: 'pencil', icon: iconPencil, label: '铅笔' },
  { key: 'eraser', icon: iconEraser, label: '橡皮' },
  { key: 'bucket', icon: iconBucket, label: '填充' },
  { key: 'picker', icon: iconPicker, label: '取色' },
  { key: 'select', icon: iconSelect, label: '选框' },
  { key: 'geometry', icon: iconGeometry, label: '几何' },
] as const
</script>

<style scoped>
.left-toolbar {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  gap: 2px;
  overflow-y: auto;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  color: #555;
}

.tool-btn:hover {
  background: #f3f4f6;
}

.tool-btn.active {
  background: #eef2ff;
  color: #6366f1;
}

.tool-icon {
  width: 36px;
  height: 36px;
  display: block;
}

.tool-label {
  font-size: 0.85rem;
  white-space: nowrap;
}
</style>
