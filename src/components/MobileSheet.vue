<template>
  <div class="mobile-sheet" v-if="sheetVisible">
    <div class="mobile-sheet-header">
      <span class="mobile-sheet-title">工具与色板</span>
      <button class="mobile-sheet-close" @click="sheetVisible = false">✕</button>
    </div>
    <div class="mobile-sheet-body">
      <PanelPalette />
    </div>
  </div>
  <button class="mobile-sheet-toggle" @click="sheetVisible = !sheetVisible">
    {{ sheetVisible ? '▼' : '▲' }}
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PanelPalette from '@/components/PanelPalette.vue'

const sheetVisible = ref(false)
</script>

<style scoped>
.mobile-sheet-toggle {
  display: none;
}

.mobile-sheet {
  display: none;
}
</style>
