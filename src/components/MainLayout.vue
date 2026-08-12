<template>
  <div class="main-layout">
    <LeftToolbar />
    <CanvasArea />
    <RightPanels />
    <MobileSheet v-if="device !== 'pc'" />
  </div>
</template>

<script setup lang="ts">
import { useDevice } from '@/composables/useDevice'
import LeftToolbar from '@/components/LeftToolbar.vue'
import CanvasArea from '@/components/CanvasArea.vue'
import RightPanels from '@/components/RightPanels.vue'
import MobileSheet from '@/components/MobileSheet.vue'

const { device } = useDevice()
</script>

<style scoped>
.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
