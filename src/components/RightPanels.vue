<template>
  <div class="right-panels" :class="{ 'tablet-collapsed': collapsed }">
    <button
      class="tablet-panel-toggle"
      :title="collapsed ? '展开工具栏' : '收起工具栏'"
      :aria-label="collapsed ? '展开工具栏' : '收起工具栏'"
      @click="toggleCollapsed()"
    >
      {{ collapsed ? '‹' : '›' }}
    </button>
    <div class="panel-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="panel-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="panel-content">
      <PanelPalette v-if="activeTab === 'palette'" />
      <PanelLayers v-else-if="activeTab === 'layers'" />
      <PanelCanvas v-else-if="activeTab === 'canvas'" />
    </div>
    <div v-if="canvasStore.showGroupPreview" class="panel-lock">
      <div class="panel-lock-message">
        <span class="panel-lock-icon">▦</span>
        <span>请先选择一个画布</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useCanvasStore } from '@/stores/canvas'
import PanelPalette from '@/components/PanelPalette.vue'
import PanelLayers from '@/components/PanelLayers.vue'
import PanelCanvas from '@/components/PanelCanvas.vue'

const activeTab = ref<'palette' | 'layers' | 'canvas'>('palette')
const canvasStore = useCanvasStore()
const { device } = useDevice()
const collapsed = ref(false)
let collapsedBeforeGroupPreview = false

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

watch(
  () => canvasStore.showGroupPreview,
  (showPreview, wasShowingPreview) => {
    if (device.value !== 'tb') return
    if (showPreview && !wasShowingPreview) {
      collapsedBeforeGroupPreview = collapsed.value
      collapsed.value = true
    } else if (!showPreview && wasShowingPreview) {
      collapsed.value = collapsedBeforeGroupPreview
    }
  },
  { immediate: true },
)

const tabs = [
  { key: 'palette' as const, label: '色板' },
  { key: 'layers' as const, label: '图层' },
  { key: 'canvas' as const, label: '画布' },
]
</script>

<style scoped>
.right-panels {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  overflow: hidden;
  position: relative;
}

.tablet-panel-toggle {
  display: none;
}

.panel-lock {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(2px);
}

.panel-lock-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #6b7280;
  font-size: 0.9rem;
}

.panel-lock-icon {
  color: #6366f1;
  font-size: 2rem;
  line-height: 1;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.panel-tab {
  flex: 1;
  padding: 10px 4px;
  border: none;
  background: transparent;
  font-size: 1.05rem;
  cursor: pointer;
  color: #888;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.panel-tab.active {
  color: #6366f1;
  border-bottom-color: #6366f1;
  font-weight: 600;
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
