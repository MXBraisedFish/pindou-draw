<template>
  <DeviceModal v-if="isFirstVisit" @select="selectDevice" />

  <div v-if="device" class="app-shell">
    <TopGlobalBar />
    <TopContextBar />
    <MainLayout />
    <AutoSaveStatus />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useDevice } from '@/composables/useDevice'
import DeviceModal from '@/components/DeviceModal.vue'
import TopGlobalBar from '@/components/TopGlobalBar.vue'
import TopContextBar from '@/components/TopContextBar.vue'
import MainLayout from '@/components/MainLayout.vue'
import AutoSaveStatus from '@/components/AutoSaveStatus.vue'
import { useCanvasStore } from '@/stores/canvas'

import '@/css/tailwind.css'
import '@/css/computer.css'
import '@/css/tablet.css'
import '@/css/phone.css'

const { device, isFirstVisit, init, selectDevice } = useDevice()

function preventAccidentalClose(event: BeforeUnloadEvent) {
  const canvasStore = useCanvasStore()
  if (!canvasStore.hasAnyPixels()) return
  event.preventDefault()
  event.returnValue = '当前工程包含绘制内容，请先保存工程文件。'
}

onMounted(() => {
  init()
  window.addEventListener('beforeunload', preventAccidentalClose)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', preventAccidentalClose))
</script>
