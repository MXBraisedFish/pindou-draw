<template>
  <Teleport to="body">
    <div ref="hostRef" class="floating-layer" aria-live="polite">
      <section
        v-show="showReferenceWindow"
        data-window="reference"
        ref="referenceWindowRef"
        class="floating-window"
        :style="windowStyle(referenceWindow)"
        @pointerdown="bringToFront(referenceWindow)"
      >
        <header
          class="floating-header"
          @pointerdown="beginWindowAction($event, referenceWindow, 'move')"
        >
          <button
            class="floating-close"
            title="关闭参考图"
            @pointerdown.stop
            @click.stop="workspaceStore.referenceWindowOpen = false"
          >
            <img :src="iconClose" alt="关闭" />
          </button>
          <strong>参考图</strong>
          <span>{{ workspaceStore.referenceImage?.name }}</span>
        </header>
        <div class="floating-content reference-content">
          <img
            v-if="workspaceStore.referenceImage"
            :src="workspaceStore.referenceImage.src"
            :alt="workspaceStore.referenceImage.name"
            draggable="false"
          />
        </div>
        <button
          class="floating-resize"
          title="调整窗口大小"
          aria-label="调整窗口大小"
          @pointerdown.stop="beginWindowAction($event, referenceWindow, 'resize')"
        ></button>
      </section>

      <section
        v-show="showGroupWindow"
        data-window="group"
        ref="groupWindowRef"
        class="floating-window"
        :style="windowStyle(groupWindow)"
        @pointerdown="bringToFront(groupWindow)"
      >
        <header
          class="floating-header"
          @pointerdown="beginWindowAction($event, groupWindow, 'move')"
        >
          <button
            class="floating-close"
            title="关闭组预览"
            @pointerdown.stop
            @click.stop="workspaceStore.groupPreviewWindowOpen = false"
          >
            <img :src="iconClose" alt="关闭" />
          </button>
          <strong>组预览</strong>
          <span>{{ groupDescription }}</span>
        </header>
        <div class="floating-content group-content">
          <canvas ref="groupCanvasRef"></canvas>
        </div>
        <button
          class="floating-resize"
          title="调整窗口大小"
          aria-label="调整窗口大小"
          @pointerdown.stop="beginWindowAction($event, groupWindow, 'resize')"
        ></button>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCanvasStore, type CanvasSnapshot } from '@/stores/canvas'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDevice } from '@/composables/useDevice'
import iconClose from '@/assets/icon/关闭取消.png'

interface FloatingWindowState {
  x: number
  y: number
  width: number
  height: number
  z: number
}

type WindowAction = 'move' | 'resize'

const canvasStore = useCanvasStore()
const workspaceStore = useWorkspaceStore()
const { device } = useDevice()
const hostRef = ref<HTMLElement | null>(null)
const referenceWindowRef = ref<HTMLElement | null>(null)
const groupWindowRef = ref<HTMLElement | null>(null)
const groupCanvasRef = ref<HTMLCanvasElement | null>(null)

const referenceWindow = reactive<FloatingWindowState>({
  x: 52,
  y: 20,
  width: 300,
  height: 250,
  z: 2,
})
const groupWindow = reactive<FloatingWindowState>({
  x: 392,
  y: 20,
  width: 320,
  height: 270,
  z: 1,
})
let topZ = 2

const showReferenceWindow = computed(
  () =>
    Boolean(workspaceStore.referenceImage) &&
    workspaceStore.referenceWindowOpen &&
    !canvasStore.showGroupPreview,
)
const showGroupWindow = computed(
  () =>
    Boolean(canvasStore.canvasGroup) &&
    workspaceStore.groupPreviewWindowOpen &&
    !canvasStore.showGroupPreview,
)
const groupDescription = computed(() => {
  const group = canvasStore.canvasGroup
  return group
    ? `${group.groupCols}x${group.groupRows} · 每格 ${group.subSize}x${group.subSize}`
    : ''
})

function windowStyle(state: FloatingWindowState) {
  return {
    left: `${state.x}px`,
    top: `${state.y}px`,
    width: `${state.width}px`,
    height: `${state.height}px`,
    zIndex: state.z,
  }
}

function bringToFront(state: FloatingWindowState) {
  state.z = ++topZ
}

let activeAction: {
  state: FloatingWindowState
  action: WindowAction
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  width: number
  height: number
} | null = null
let pendingAction: {
  event: PointerEvent
  state: FloatingWindowState
  action: WindowAction
  timer: ReturnType<typeof setTimeout>
} | null = null

function activateWindowAction(
  event: PointerEvent,
  state: FloatingWindowState,
  action: WindowAction,
) {
  bringToFront(state)
  activeAction = {
    state,
    action,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  }
}

function clearPendingAction() {
  if (!pendingAction) return
  clearTimeout(pendingAction.timer)
  pendingAction = null
}

function beginWindowAction(event: PointerEvent, state: FloatingWindowState, action: WindowAction) {
  if (event.button !== 0) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
  clearPendingAction()
  if (device.value === 'tb' && event.pointerType === 'touch') {
    const timer = setTimeout(() => {
      if (!pendingAction) return
      activateWindowAction(pendingAction.event, pendingAction.state, pendingAction.action)
      pendingAction = null
    }, 320)
    pendingAction = { event, state, action, timer }
    return
  }
  activateWindowAction(event, state, action)
}

function clampWindow(state: FloatingWindowState) {
  const host = hostRef.value
  if (!host) return
  state.width = Math.max(220, Math.min(state.width, host.clientWidth))
  state.height = Math.max(160, Math.min(state.height, host.clientHeight))
  state.x = Math.max(0, Math.min(state.x, Math.max(0, host.clientWidth - state.width)))
  state.y = Math.max(0, Math.min(state.y, Math.max(0, host.clientHeight - state.height)))
}

function onPointerMove(event: PointerEvent) {
  if (pendingAction) {
    if (
      Math.hypot(
        event.clientX - pendingAction.event.clientX,
        event.clientY - pendingAction.event.clientY,
      ) > 10
    ) {
      clearPendingAction()
    }
    return
  }
  const current = activeAction
  if (!current || current.pointerId !== event.pointerId) return
  event.preventDefault()
  const dx = event.clientX - current.startX
  const dy = event.clientY - current.startY
  if (current.action === 'move') {
    current.state.x = current.x + dx
    current.state.y = current.y + dy
  } else {
    current.state.width = current.width + dx
    current.state.height = current.height + dy
  }
  clampWindow(current.state)
  if (current.state === groupWindow) scheduleGroupRender()
}

function onPointerUp(event: PointerEvent) {
  if (pendingAction?.event.pointerId === event.pointerId) clearPendingAction()
  if (activeAction?.pointerId === event.pointerId) {
    if (activeAction.state === groupWindow) scheduleGroupRender()
    activeAction = null
  }
}

function liveSnapshot(): Pick<CanvasSnapshot, 'layers' | 'backgroundColor'> {
  return {
    layers: canvasStore.layers,
    backgroundColor: canvasStore.backgroundColor,
  }
}

let renderFrame = 0
function scheduleGroupRender() {
  if (renderFrame) cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(renderGroupPreview)
}

function renderGroupPreview() {
  renderFrame = 0
  const canvas = groupCanvasRef.value
  const group = canvasStore.canvasGroup
  const parent = canvas?.parentElement
  if (!canvas || !group || !parent || !showGroupWindow.value) return
  const width = Math.max(1, parent.clientWidth)
  const height = Math.max(1, parent.clientHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#eef0f4'
  context.fillRect(0, 0, width, height)

  const totalCols = group.groupCols * group.subSize
  const totalRows = group.groupRows * group.subSize
  const pixelSize = Math.max(0.1, Math.min((width - 16) / totalCols, (height - 16) / totalRows))
  const contentWidth = totalCols * pixelSize
  const contentHeight = totalRows * pixelSize
  const originX = (width - contentWidth) / 2
  const originY = (height - contentHeight) / 2

  for (let groupRow = 0; groupRow < group.groupRows; groupRow++) {
    for (let groupCol = 0; groupCol < group.groupCols; groupCol++) {
      const isActive =
        groupRow === canvasStore.activeGroupRow && groupCol === canvasStore.activeGroupCol
      const snapshot = isActive ? liveSnapshot() : group.canvases[groupRow]?.[groupCol]
      if (!snapshot) continue
      const cellX = originX + groupCol * group.subSize * pixelSize
      const cellY = originY + groupRow * group.subSize * pixelSize
      context.fillStyle =
        snapshot.backgroundColor === 'transparent' ? '#ffffff' : snapshot.backgroundColor
      context.fillRect(cellX, cellY, group.subSize * pixelSize, group.subSize * pixelSize)
      for (const layer of snapshot.layers) {
        if (!layer.visible) continue
        for (let row = 0; row < group.subSize; row++) {
          const sourceRow = layer.grid[row]
          if (!sourceRow) continue
          for (let col = 0; col < group.subSize; col++) {
            const color = sourceRow[col]
            if (!color) continue
            context.fillStyle = color
            context.fillRect(
              cellX + col * pixelSize,
              cellY + row * pixelSize,
              pixelSize + 0.15,
              pixelSize + 0.15,
            )
          }
        }
      }
    }
  }

  context.strokeStyle = 'rgba(99, 102, 241, 0.62)'
  context.lineWidth = 1
  for (let col = 0; col <= group.groupCols; col++) {
    const x = originX + col * group.subSize * pixelSize
    context.beginPath()
    context.moveTo(x, originY)
    context.lineTo(x, originY + contentHeight)
    context.stroke()
  }
  for (let row = 0; row <= group.groupRows; row++) {
    const y = originY + row * group.subSize * pixelSize
    context.beginPath()
    context.moveTo(originX, y)
    context.lineTo(originX + contentWidth, y)
    context.stroke()
  }
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  resizeObserver = new ResizeObserver(() => {
    clampWindow(referenceWindow)
    clampWindow(groupWindow)
    scheduleGroupRender()
  })
  if (hostRef.value) resizeObserver.observe(hostRef.value)
  if (groupWindowRef.value) resizeObserver.observe(groupWindowRef.value)
  nextTick(() => {
    clampWindow(referenceWindow)
    clampWindow(groupWindow)
    scheduleGroupRender()
  })
})

watch(
  () => [showReferenceWindow.value, showGroupWindow.value, device.value],
  async () => {
    await nextTick()
    clampWindow(referenceWindow)
    clampWindow(groupWindow)
    scheduleGroupRender()
  },
)

watch(
  () => [
    showGroupWindow.value,
    canvasStore.gridVersion,
    canvasStore.groupVersion,
    canvasStore.activeGroupRow,
    canvasStore.activeGroupCol,
  ],
  async () => {
    await nextTick()
    scheduleGroupRender()
  },
)
watch(
  () => canvasStore.canvasGroup,
  (group) => {
    if (!group) workspaceStore.groupPreviewWindowOpen = false
  },
)

onBeforeUnmount(() => {
  clearPendingAction()
  if (renderFrame) cancelAnimationFrame(renderFrame)
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})
</script>

<style scoped>
.floating-layer {
  position: fixed;
  inset: 0;
  z-index: 14000;
  overflow: hidden;
  pointer-events: none;
}

.floating-window {
  position: absolute;
  display: flex;
  min-width: 220px;
  min-height: 160px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.75);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.2);
  pointer-events: auto;
}

.floating-header {
  display: grid;
  grid-template-columns: 28px auto minmax(0, 1fr);
  min-height: 38px;
  align-items: center;
  gap: 7px;
  padding: 4px 9px 4px 6px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #334155;
  cursor: move;
  touch-action: none;
  user-select: none;
}

.floating-header strong {
  font-size: 0.76rem;
  white-space: nowrap;
}

.floating-header span {
  overflow: hidden;
  color: #94a3b8;
  font-size: 0.62rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.floating-close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.floating-close:hover {
  background: #fee2e2;
}

.floating-close img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.floating-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #eef0f4;
}

.reference-content {
  display: grid;
  place-items: center;
  padding: 8px;
}

.reference-content img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

.group-content canvas {
  display: block;
}

.floating-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background:
    linear-gradient(135deg, transparent 52%, #64748b 53%, #64748b 58%, transparent 59%) 8px 8px /
      14px 14px no-repeat,
    linear-gradient(135deg, transparent 66%, #94a3b8 67%, #94a3b8 72%, transparent 73%) 5px 5px /
      17px 17px no-repeat;
  cursor: nwse-resize;
  touch-action: none;
}
</style>
