<template>
  <div class="mobile-sheet" v-if="sheetVisible">
    <div class="mobile-sheet-header">
      <span class="mobile-sheet-title">工具与色板</span>
      <button
        class="mobile-sheet-close"
        aria-label="关闭"
        title="关闭"
        @click="sheetVisible = false"
      >
        <img :src="iconClose" alt="" />
      </button>
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
import iconClose from '@/assets/icon/关闭取消.png'

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
