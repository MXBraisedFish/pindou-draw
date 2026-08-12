<template>
  <DeviceModal
    v-if="isFirstVisit"
    @select="selectDevice"
  />

  <div v-if="device" class="app-shell">
    <TopGlobalBar />
    <TopContextBar />
    <MainLayout />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDevice } from '@/composables/useDevice'
import DeviceModal from '@/components/DeviceModal.vue'
import TopGlobalBar from '@/components/TopGlobalBar.vue'
import TopContextBar from '@/components/TopContextBar.vue'
import MainLayout from '@/components/MainLayout.vue'

import '@/css/tailwind.css'
import '@/css/computer.css'
import '@/css/tablet.css'
import '@/css/phone.css'

const { device, isFirstVisit, init, selectDevice } = useDevice()

onMounted(() => {
  init()
})
</script>
