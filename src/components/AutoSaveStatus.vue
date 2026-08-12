<template>
  <div class="autosave-track" aria-label="自动保存进度">
    <div class="autosave-progress" :style="{ width: `${progress}%` }"></div>
  </div>
  <Transition name="toast">
    <div v-if="toastVisible" class="autosave-toast">✓ 已自动保存到浏览器</div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useProjectStore } from '@/stores/project'

const INTERVAL = 10 * 60 * 1000
const canvasStore = useCanvasStore()
const projectStore = useProjectStore()
const progress = ref(0)
const toastVisible = ref(false)
let startedAt = Date.now()
let timer = 0
let toastTimer = 0
let saving = false

async function autoSave() {
  if (saving || !canvasStore.hasAnyPixels()) return
  saving = true
  try {
    await projectStore.saveToBrowser('auto')
    toastVisible.value = true
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toastVisible.value = false), 2600)
  } catch {
    // IndexedDB may be unavailable in private/restricted browsing; keep editing uninterrupted.
  } finally {
    saving = false
  }
}

function tick() {
  const elapsed = Date.now() - startedAt
  progress.value = Math.min(100, (elapsed / INTERVAL) * 100)
  if (elapsed >= INTERVAL) {
    startedAt = Date.now()
    progress.value = 0
    void autoSave()
  }
}

onMounted(() => {
  startedAt = Date.now()
  timer = window.setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.clearTimeout(toastTimer)
})
</script>

<style scoped>
.autosave-track {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 33000;
  height: 3px;
  overflow: hidden;
  background: rgba(209, 213, 219, 0.55);
  pointer-events: none;
}
.autosave-progress {
  height: 100%;
  border-radius: inherit;
  background: #6366f1;
  transition: width 1s linear;
}
.autosave-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 33000;
  padding: 9px 13px;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  background: rgba(240, 253, 244, 0.96);
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.12);
  color: #15803d;
  font-size: 0.7rem;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s,
    transform 0.18s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
