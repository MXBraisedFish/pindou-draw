<template>
  <Teleport to="body">
    <div
      v-if="running"
      ref="overlay"
      class="tutorial-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="界面使用引导"
      tabindex="-1"
      @click.stop="advance"
      @pointerdown.stop.prevent
      @pointermove.stop.prevent
      @pointerup.stop.prevent
      @wheel.stop.prevent
      @contextmenu.prevent
      @keydown.stop="onKey"
    >
      <div v-if="frame" class="tutorial-frame" :style="frameStyle" aria-hidden="true"></div>
      <section class="tutorial-instructions" :style="tipStyle" aria-live="polite">
        <span class="tutorial-progress">{{ step + 1 }} / {{ steps.length }}</span>
        <p :key="step">{{ steps[step]?.text }}</p>
        <strong>{{ platform === 'pc' ? '左键下一步' : '点击下一步' }}</strong>
        <button @click.stop="finish">跳过引导</button>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useNotices } from '@/composables/useNotices'
import { useTutorial } from '@/composables/useTutorial'

const { device, isFirstVisit } = useDevice()
const { activeNotice } = useNotices()
const { running, step, platform, start, finish } = useTutorial()
const overlay = ref<HTMLElement | null>(null)
const frame = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const tipHeight = ref(205)
const steps = computed(() =>
  platform.value === 'ph'
    ? [
        { selector: '.phone-tools', text: '在这里可以切换基础工具。' },
        { selector: '.phone-stage', text: '单指绘制，双指缩放和移动画布。' },
        { selector: '.phone-header > button', text: '更多功能例如新建、导出、撤回等都在这里。' },
      ]
    : [
        { selector: '.left-toolbar', text: '在这里可以切换基础工具。' },
        {
          selector: '.canvas-viewport, .cgp-root',
          text:
            platform.value === 'pc'
              ? '左键在画布使用工具，摁住滚轮移动画布，ctrl+滚轮缩放画布。'
              : '单指绘制，双指缩放和移动画布。',
        },
        { selector: '.right-panels', text: '在这里可以调色、管理图层、调整画布和绘制操作。' },
        { selector: '.global-actions', text: '在这里新建、导入和导出。' },
      ],
)
const frameStyle = computed(() =>
  frame.value
    ? {
        left: `${frame.value.x}px`,
        top: `${frame.value.y}px`,
        width: `${frame.value.width}px`,
        height: `${frame.value.height}px`,
      }
    : {},
)
const tipStyle = computed(() => {
  const { width, height } = viewport.value
  const tipWidth = Math.min(340, width - 32)
  const boxHeight = tipHeight.value
  const rect = frame.value
  let x = (width - tipWidth) / 2
  let y = height - boxHeight - 20
  if (rect) {
    if (width - rect.x - rect.width > tipWidth + 32) {
      x = rect.x + rect.width + 16
      y = (height - boxHeight) / 2
    } else if (rect.x > tipWidth + 32) {
      x = rect.x - tipWidth - 16
      y = (height - boxHeight) / 2
    } else if (rect.y > boxHeight + 32) {
      y = rect.y - boxHeight - 16
    } else if (height - rect.y - rect.height > boxHeight + 32) {
      y = rect.y + rect.height + 16
    }
  }
  return {
    left: `${Math.max(16, x)}px`,
    top: `${Math.max(16, Math.min(y, height - boxHeight - 16))}px`,
    width: `${tipWidth}px`,
    maxHeight: `${height - 32}px`,
  }
})

let raf = 0
let previousFocus: HTMLElement | null = null
let lastAdvance = 0
function measure() {
  if (!running.value) return
  const tip = overlay.value?.querySelector<HTMLElement>('.tutorial-instructions')
  if (tip && tip.offsetHeight !== tipHeight.value) tipHeight.value = tip.offsetHeight
  const width = window.innerWidth
  const height = window.innerHeight
  if (viewport.value.width !== width || viewport.value.height !== height)
    viewport.value = { width, height }
  const selector = steps.value[step.value]?.selector
  let targets = selector ? [...document.querySelectorAll(selector)] : []
  if (!targets.length && step.value === 1) targets = [...document.querySelectorAll('.canvas-area')]
  const rects = targets
    .map((node) => node.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
  if (rects.length) {
    const x = Math.max(3, Math.min(...rects.map((r) => r.left)) - 4)
    const y = Math.max(3, Math.min(...rects.map((r) => r.top)) - 4)
    const right = Math.min(width - 3, Math.max(...rects.map((r) => r.right)) + 4)
    const bottom = Math.min(height - 3, Math.max(...rects.map((r) => r.bottom)) + 4)
    const next = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
    if (JSON.stringify(frame.value) !== JSON.stringify(next)) frame.value = next
  } else frame.value = null
  raf = requestAnimationFrame(measure)
}
function advance(event?: MouseEvent) {
  if (event && event.button !== 0) return
  if (performance.now() - lastAdvance < 260) return
  lastAdvance = performance.now()
  if (step.value + 1 === steps.value.length) finish()
  else step.value++
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    finish()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    overlay.value?.querySelector('button')?.focus()
  } else if ((event.key === 'Enter' || event.key === ' ') && event.target === overlay.value) {
    event.preventDefault()
    advance()
  }
}
watch(
  [device, activeNotice, isFirstVisit],
  async () => {
    await nextTick()
    if (!device.value || isFirstVisit.value || activeNotice.value) return
    start(device.value)
  },
  { immediate: true, flush: 'post' },
)
watch(running, async (value) => {
  cancelAnimationFrame(raf)
  if (value) {
    previousFocus = document.activeElement as HTMLElement | null
    frame.value = null
    lastAdvance = performance.now()
    await nextTick()
    if (!running.value) return
    overlay.value?.focus()
    measure()
  } else previousFocus?.focus()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  running.value = false
})
</script>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 40500;
  overflow: hidden;
  touch-action: none;
  cursor: pointer;
  outline: none;
}
.tutorial-frame {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  border: 3px dashed #817aff;
  border-radius: 16px;
  box-shadow: 0 0 0 9999px #11182785;
  transition:
    left 200ms ease,
    top 200ms ease,
    width 200ms ease,
    height 200ms ease;
}
.tutorial-instructions {
  position: absolute;
  box-sizing: border-box;
  padding: 18px;
  border-radius: 16px;
  background: white;
  color: #253047;
  box-shadow: 0 8px 36px #11182733;
  overflow-y: auto;
  font-size: 15px;
  line-height: 1.7;
}
.tutorial-progress {
  color: #8a91a3;
  font-size: 12px;
}
.tutorial-instructions p {
  margin: 8px 0 12px;
  animation: tutorial-text 200ms ease;
}
.tutorial-instructions strong {
  color: #635bff;
  display: block;
}
.tutorial-instructions button {
  background: none;
  border: none;
  color: #7b8496;
  font-size: 12px;
  min-height: 36px;
  margin-top: 6px;
  padding: 4px 0;
  cursor: pointer;
}
@keyframes tutorial-text {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tutorial-frame {
    transition: none;
  }
  .tutorial-instructions p {
    animation: none;
  }
}
</style>
