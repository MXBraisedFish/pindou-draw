<template>
  <Teleport to="body">
    <div
      class="user-guide-overlay"
      @click.self="emit('close')"
      @keydown.esc.stop.prevent="emit('close')"
    >
      <section
        ref="dialog"
        class="user-guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-guide-title"
        tabindex="-1"
        @keydown.tab="trapFocus"
      >
        <header class="user-guide-header">
          <h2 id="user-guide-title">使用教程 · {{ platformName }}</h2>
          <button aria-label="关闭使用教程" @click="emit('close')">
            <img :src="iconClose" alt="" />
          </button>
        </header>
        <div class="user-guide-content">
          <article v-for="section in sections" :key="section.id" class="user-guide-section">
            <h3>{{ section.title }}</h3>
            <img
              class="user-guide-image"
              :src="section.image"
              :alt="`${platformName} · ${section.title}示意图`"
            />
            <div class="user-guide-copy">
              <p v-for="line in section.lines" :key="line">{{ line }}</p>
              <p v-if="section.warning" class="user-guide-warning">{{ section.warning }}</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { getUserGuide } from '@/ts/userGuide'
import iconClose from '@/assets/icon/关闭取消.png'

const emit = defineEmits<{ close: [] }>()
const { device } = useDevice()
const sections = computed(() => getUserGuide(device.value ?? 'pc'))
const platformName = computed(
  () => ({ pc: '电脑端', tb: '平板端', ph: '手机端' })[device.value ?? 'pc'],
)
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  dialog.value?.focus()
})
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus())
function trapFocus(event: KeyboardEvent) {
  event.preventDefault()
  dialog.value?.querySelector('button')?.focus()
}
</script>

<style scoped>
.user-guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 39000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #11182780;
}
.user-guide-dialog {
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: 90dvh;
  min-height: 0;
  background: #f6f7fb;
  color: #253047;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 60px #11182740;
  outline: none;
}
.user-guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 10px 20px;
  background: white;
  border-bottom: 1px solid #e3e6ed;
}
.user-guide-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.user-guide-header button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}
.user-guide-header img {
  width: 18px;
  height: 18px;
}
.user-guide-content {
  padding: 20px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.user-guide-section {
  padding: 18px;
  margin-bottom: 20px;
  border: 1px solid #e1e5ef;
  border-radius: 14px;
  background: white;
}
.user-guide-section:last-child {
  margin-bottom: 0;
}
.user-guide-section h3 {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 600;
}
.user-guide-image {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid #e7e9ef;
}
.user-guide-copy {
  margin-top: 14px;
  font-size: 15px;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.user-guide-copy p {
  margin: 4px 0;
}
.user-guide-copy .user-guide-warning {
  color: #dc2626;
  font-weight: 600;
  margin-top: 10px;
}
@media (max-width: 600px) {
  .user-guide-overlay {
    padding: 10px;
  }
  .user-guide-content {
    padding: 10px;
  }
  .user-guide-section {
    padding: 12px;
  }
  .user-guide-header {
    padding: 8px 12px;
  }
  .user-guide-copy {
    font-size: 14px;
  }
}
</style>
