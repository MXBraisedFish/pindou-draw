<template>
  <div ref="toolbarRef" class="left-toolbar">
    <div v-for="tool in tools" :key="tool.key" class="tool-entry">
      <button
        class="tool-btn"
        :class="{ active: toolStore.activeTool === tool.key }"
        :title="tool.label"
        @click="selectTool(tool.key)"
      >
        <img :src="tool.icon" class="tool-icon" :alt="tool.label" />
        <span class="tool-label">{{ tool.label }}</span>
      </button>
      <button
        v-if="device === 'tb' && toolStore.activeTool === tool.key && tool.expandable"
        class="tool-expand-toggle"
        :class="{ open: optionsOpen }"
        :title="optionsOpen ? '收起工具设置' : '展开工具设置'"
        @click.stop="optionsOpen = !optionsOpen"
      >
        {{ optionsOpen ? '‹' : '›' }}
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="device === 'tb' && optionsOpen && hasOptions"
        ref="optionsRef"
        class="tablet-tool-options-popover"
        @pointerdown.stop
        @click.stop
      >
        <header>
          <strong>{{ activeToolLabel }}设置</strong>
          <button title="收起" @click="optionsOpen = false">‹</button>
        </header>
        <ToolOptions vertical />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ToolOptions from '@/components/ToolOptions.vue'
import { useDevice } from '@/composables/useDevice'
import { useToolStore } from '@/stores/tool'
import type { ToolType } from '@/stores/tool'
import iconMove from '@/assets/icon/移动.png'
import iconPencil from '@/assets/icon/铅笔.png'
import iconEraser from '@/assets/icon/橡皮.png'
import iconBucket from '@/assets/icon/油漆桶.png'
import iconPicker from '@/assets/icon/吸管.png'
import iconSelect from '@/assets/icon/选区.png'
import iconGeometry from '@/assets/icon/几何工具.png'

const toolStore = useToolStore()
const { device } = useDevice()
const toolbarRef = ref<HTMLElement | null>(null)
const optionsRef = ref<HTMLElement | null>(null)
const optionsOpen = ref(false)

const tools = [
  { key: 'move', icon: iconMove, label: '移动', expandable: false },
  { key: 'pencil', icon: iconPencil, label: '铅笔', expandable: true },
  { key: 'eraser', icon: iconEraser, label: '橡皮', expandable: true },
  { key: 'bucket', icon: iconBucket, label: '填充', expandable: false },
  { key: 'picker', icon: iconPicker, label: '取色', expandable: false },
  { key: 'select', icon: iconSelect, label: '选区', expandable: true },
  { key: 'geometry', icon: iconGeometry, label: '几何', expandable: true },
] as const

const activeTool = computed(() => tools.find((tool) => tool.key === toolStore.activeTool))
const hasOptions = computed(() => activeTool.value?.expandable ?? false)
const activeToolLabel = computed(() => activeTool.value?.label ?? '工具')

function selectTool(tool: ToolType) {
  if (toolStore.activeTool !== tool) optionsOpen.value = false
  toolStore.setTool(tool)
}

function closeOnOutside(event: PointerEvent) {
  const target = event.target as Node | null
  if (toolbarRef.value?.contains(target) || optionsRef.value?.contains(target)) return
  optionsOpen.value = false
}

watch(
  () => toolStore.activeTool,
  () => {
    if (!hasOptions.value) optionsOpen.value = false
  },
)
onMounted(() => window.addEventListener('pointerdown', closeOnOutside))
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeOnOutside))
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

.tool-entry {
  position: relative;
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

.tool-expand-toggle {
  display: none;
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
