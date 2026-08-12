<template>
  <div class="right-panels">
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PanelPalette from '@/components/PanelPalette.vue'
import PanelLayers from '@/components/PanelLayers.vue'
import PanelCanvas from '@/components/PanelCanvas.vue'

const activeTab = ref<'palette' | 'layers' | 'canvas'>('palette')

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
