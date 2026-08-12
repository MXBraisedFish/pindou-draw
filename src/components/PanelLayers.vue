<template>
  <div class="panel-layers">
    <!-- 工具栏 -->
    <div class="layers-toolbar">
      <button class="layer-tool-btn" @click="canvasStore.addLayer()">+ 新建</button>
    </div>

    <!-- 图层列表：顶层在上、底层在下 -->
    <div class="layers-list" ref="listRef" :class="{ 'drag-active': dragState.isDragging }">
      <!-- 指针跟随的拖拽指示线 -->
      <div
        v-if="dragState.isDragging && dropIndicatorY !== null"
        class="drop-indicator"
        :style="{ top: dropIndicatorY + 'px' }"
      />

      <div
        v-for="item in displayLayers"
        :key="item.layer.id"
        class="layer-item"
        :class="{
          active: canvasStore.activeLayerId === item.layer.id,
          dragging: dragState.isDragging && dragState.layerId === item.layer.id,
        }"
        :data-layer-index="item.storeIdx"
        @pointerdown="onPointerDown($event, item.layer, item.storeIdx)"
        @click="canvasStore.setActiveLayer(item.layer.id)"
        @contextmenu.prevent="onContextMenu($event, item.layer, item.storeIdx)"
      >
        <!-- 预览缩略图 -->
        <div class="layer-thumb">
          <canvas
            :ref="(el) => setThumbRef(item.layer.id, el as HTMLCanvasElement | null)"
            :width="thumbSize(item.layer.grid).w"
            :height="thumbSize(item.layer.grid).h"
            class="layer-thumb-canvas"
          ></canvas>
        </div>

        <!-- 图层名 -->
        <div class="layer-name-wrap" @dblclick.stop="startRename(item.layer)">
          <input
            v-if="renamingId === item.layer.id"
            class="layer-name-input"
            v-model="renameText"
            @keydown.enter="finishRename(item.layer.id)"
            @keydown.escape="renamingId = ''"
            @blur="finishRename(item.layer.id)"
            @click.stop
            :ref="setRenameInput"
          />
          <span v-else class="layer-name">{{ item.layer.name }}</span>
        </div>

        <!-- 可见性 -->
        <button
          class="layer-vis-btn"
          :title="item.layer.visible ? '可见' : '隐藏'"
          @click.stop="toggleLayerVisibility(item.layer)"
        >
          <img :src="item.layer.visible ? iconVisible : iconHidden" class="layer-vis-icon" alt="" />
        </button>

        <!-- 激活标记 -->
        <span v-if="canvasStore.activeLayerId === item.layer.id" class="layer-active-badge"
          >当前</span
        >
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="layer-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div
          class="context-menu-item"
          :class="{ disabled: contextMenu.layerIndex <= 0 }"
          @click="onMenuAction('mergeDown')"
        >
          向下合并
        </div>
        <div
          class="context-menu-item"
          :class="{ disabled: canvasStore.layers.length <= 1 }"
          @click="onMenuAction('delete')"
        >
          删除图层
        </div>
        <div class="context-menu-item" @click="onMenuAction('duplicate')">复制图层</div>
        <div class="context-menu-item" @click="onMenuAction('rename')">重命名</div>
        <div class="context-menu-item" @click="onMenuAction('toggleVis')">
          {{ contextMenu.layerVisible ? '隐藏图层' : '显示图层' }}
        </div>
        <div class="context-menu-item" @click="onMenuAction('export')">单独导出</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onUnmounted, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useExportStore } from '@/stores/exportStore'
import type { Layer } from '@/stores/canvas'
import iconVisible from '@/assets/icon/可见.png'
import iconHidden from '@/assets/icon/隐藏.png'

const canvasStore = useCanvasStore()
const exportStore = useExportStore()
const thumbRefs = new Map<string, HTMLCanvasElement>()

function setThumbRef(layerId: string, el: HTMLCanvasElement | null) {
  if (el) {
    thumbRefs.set(layerId, el)
    const layer = canvasStore.layers.find((item) => item.id === layerId)
    if (layer) drawThumb(el, layer.grid)
  } else {
    thumbRefs.delete(layerId)
  }
}

const renamingId = ref('')
const renameText = ref('')
const renameInputEl = ref<HTMLInputElement | null>(null)
function setRenameInput(el: unknown) {
  renameInputEl.value = el as HTMLInputElement
}

// --- 显示图层：逆序（顶层在最上面、底层在最下面） ---
const displayLayers = computed(() => {
  const result: { layer: Layer; storeIdx: number }[] = []
  const len = canvasStore.layers.length
  for (let i = len - 1; i >= 0; i--) {
    result.push({ layer: canvasStore.layers[i]!, storeIdx: i })
  }
  return result
})

// --- 拖拽状态 ---
const listRef = ref<HTMLElement | null>(null)
const dragState = reactive({
  isDragging: false,
  layerId: '' as string,
  layerIndex: -1,
})
const dragInsertIndex = ref(-1)
const dropIndicatorY = ref<number | null>(null)
const pointerStartX = ref(0)
const pointerStartY = ref(0)
let hasMovedForDrag = false
const DRAG_THRESHOLD = 3

let pendingDragLayerId = ''
let pendingDragLayerIndex = -1

// --- 右键菜单状态 ---
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  layerId: '' as string,
  layerVisible: true,
  layerIndex: -1,
})

// ========== 拖拽逻辑 ==========

function onPointerDown(e: PointerEvent, layer: Layer, index: number) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  if (renamingId.value) return

  pointerStartX.value = e.clientX
  pointerStartY.value = e.clientY
  hasMovedForDrag = false
  pendingDragLayerId = layer.id
  pendingDragLayerIndex = index

  document.addEventListener('pointermove', onPotentialDrag)
  document.addEventListener('pointerup', onPointerUp)
}

function onPotentialDrag(e: PointerEvent) {
  const dx = e.clientX - pointerStartX.value
  const dy = e.clientY - pointerStartY.value

  if (!hasMovedForDrag && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
    return
  }

  if (!dragState.isDragging) {
    hasMovedForDrag = true
    dragState.isDragging = true
    dragState.layerId = pendingDragLayerId
    dragState.layerIndex = pendingDragLayerIndex
    dragInsertIndex.value = pendingDragLayerIndex

    document.removeEventListener('pointermove', onPotentialDrag)
    document.removeEventListener('pointerup', onPointerUp)
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', onDragEnd)
    document.addEventListener('keydown', onDragKeydown)
    if (listRef.value) {
      listRef.value.addEventListener('scroll', onListScroll)
    }
  }
}

function onPointerUp() {
  document.removeEventListener('pointermove', onPotentialDrag)
  document.removeEventListener('pointerup', onPointerUp)
  pendingDragLayerId = ''
  pendingDragLayerIndex = -1
}

// 记录最后一次指针坐标，供 scroll 事件重新计算使用
let lastPointerClientY = 0

function onDragMove(e: PointerEvent) {
  lastPointerClientY = e.clientY
  recalcDrag(e.clientY)
}

function onListScroll() {
  if (!dragState.isDragging) return
  recalcDrag(lastPointerClientY)
}

function recalcDrag(clientY: number) {
  if (!listRef.value) return

  const listRect = listRef.value.getBoundingClientRect()
  const scrollTop = listRef.value.scrollTop
  // viewport 坐标 + scrollTop → 内容区坐标（指示线 top 以此为参考系）
  const pointerY = clientY - listRect.top + scrollTop
  const N = canvasStore.layers.length
  const draggedStoreIdx = dragState.layerIndex

  // 获取所有非拖拽中 item，按视觉 Y 排序
  const items = Array.from(
    listRef.value.querySelectorAll<HTMLElement>('.layer-item:not(.dragging)'),
  )
  items.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)

  if (items.length === 0) return

  // 构建间隙（gap），坐标转换为内容区坐标（+ scrollTop）
  const gaps: { y: number; storeIdx: number }[] = []

  // gap[0]: 最顶图层之上 → insertIdx = N
  gaps.push({
    y: items[0]!.getBoundingClientRect().top - listRect.top + scrollTop - 3,
    storeIdx: N,
  })

  // gap[k] (1..M-1): 两个图层正中间
  for (let k = 1; k < items.length; k++) {
    const aboveBottom = items[k - 1]!.getBoundingClientRect().bottom
    const belowTop = items[k]!.getBoundingClientRect().top
    const y = (aboveBottom + belowTop) / 2 - listRect.top + scrollTop

    const aboveStoreIdx = parseInt(items[k - 1]!.dataset.layerIndex ?? '', 10)
    const higherStoreIdx = Math.max(aboveStoreIdx, parseInt(items[k]!.dataset.layerIndex ?? '', 10))
    // 若被拖拽图层在原位置下方（storeIdx 更小），则上方 item 会因删除而下移一位
    const targetStoreIdx = higherStoreIdx - (draggedStoreIdx < higherStoreIdx ? 1 : 0)

    gaps.push({ y, storeIdx: targetStoreIdx })
  }

  // gap[M]: 最底图层之下 → insertIdx = 0
  gaps.push({
    y: items[items.length - 1]!.getBoundingClientRect().bottom - listRect.top + scrollTop + 3,
    storeIdx: 0,
  })

  // 找距离指针最近的间隙
  let bestGap = 0
  let bestDist = Infinity
  for (let i = 0; i < gaps.length; i++) {
    const dist = Math.abs(gaps[i]!.y - pointerY)
    if (dist < bestDist) {
      bestDist = dist
      bestGap = i
    }
  }

  const target = gaps[bestGap]!.storeIdx
  dragInsertIndex.value = Math.max(0, Math.min(N, target))

  // 若落点与原位相同，隐藏指示线
  if (target === draggedStoreIdx) {
    dropIndicatorY.value = null
  } else {
    dropIndicatorY.value = Math.max(0, gaps[bestGap]!.y)
  }
}

function onDragEnd() {
  const layerId = dragState.layerId
  const oldLayerIndex = dragState.layerIndex
  const targetIdx = dragInsertIndex.value

  cleanupDrag()

  if (layerId && targetIdx !== oldLayerIndex && targetIdx >= 0) {
    canvasStore.moveLayerTo(layerId, targetIdx)
  }
}

function onDragKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cleanupDrag()
  }
}

function cleanupDrag() {
  dragState.isDragging = false
  dragState.layerId = ''
  dragState.layerIndex = -1
  dragInsertIndex.value = -1
  dropIndicatorY.value = null
  hasMovedForDrag = false
  pendingDragLayerId = ''
  pendingDragLayerIndex = -1

  document.removeEventListener('pointermove', onPotentialDrag)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.removeEventListener('keydown', onDragKeydown)
  if (listRef.value) {
    listRef.value.removeEventListener('scroll', onListScroll)
  }
}

// ========== 右键菜单逻辑 ==========

function onContextMenu(e: MouseEvent, layer: Layer, index: number) {
  if (renamingId.value) {
    renamingId.value = ''
  }

  contextMenu.visible = true
  contextMenu.layerId = layer.id
  contextMenu.layerVisible = layer.visible
  contextMenu.layerIndex = index

  const MENU_W = 170
  const ITEM_H = 33
  const PAD = 8
  const GAP = 2
  const ITEM_COUNT = 6
  const estimatedH = PAD * 2 + ITEM_COUNT * ITEM_H + (ITEM_COUNT - 1) * GAP + 4

  let x = e.clientX
  let y = e.clientY
  if (x + MENU_W > window.innerWidth) x = window.innerWidth - MENU_W - 8
  if (y + estimatedH > window.innerHeight) y = window.innerHeight - estimatedH - 8
  if (x < 0) x = 8
  if (y < 0) y = 8

  contextMenu.x = x
  contextMenu.y = y

  nextTick(() => {
    document.addEventListener('click', closeContextMenu)
    document.addEventListener('keydown', onContextMenuKeydown)
  })
}

function closeContextMenu() {
  contextMenu.visible = false
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('keydown', onContextMenuKeydown)
}

function onContextMenuKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeContextMenu()
}

function onMenuAction(action: string) {
  const id = contextMenu.layerId
  closeContextMenu()
  switch (action) {
    case 'mergeDown':
      if (contextMenu.layerIndex > 0) canvasStore.mergeDown(id)
      break
    case 'delete':
      if (canvasStore.layers.length > 1) canvasStore.removeLayer(id)
      break
    case 'duplicate':
      canvasStore.duplicateLayer(id)
      break
    case 'rename': {
      const layer = canvasStore.layers.find((l) => l.id === id)
      if (layer) startRename(layer)
      break
    }
    case 'toggleVis': {
      const l = canvasStore.layers.find((la) => la.id === id)
      if (l) toggleLayerVisibility(l)
      break
    }
    case 'export':
      exportStore.exportLayerId = id
      exportStore.showModal = true
      break
  }
}

// ========== 已有逻辑 ==========

function startRename(layer: { id: string; name: string }) {
  renamingId.value = layer.id
  renameText.value = layer.name
  nextTick(() => {
    renameInputEl.value?.focus()
    renameInputEl.value?.select()
  })
}

function finishRename(id: string) {
  if (renameText.value.trim()) {
    canvasStore.renameLayer(id, renameText.value.trim())
  }
  renamingId.value = ''
}

function toggleLayerVisibility(layer: Layer) {
  layer.visible = !layer.visible
  canvasStore.buildComposite()
}

function thumbSize(grid: string[][]): { w: number; h: number } {
  const cols = grid[0]?.length ?? 16
  const rows = grid.length
  const MAX = 32
  if (cols >= rows) {
    return { w: MAX, h: Math.max(1, Math.round((MAX * rows) / cols)) }
  }
  return { w: Math.max(1, Math.round((MAX * cols) / rows)), h: MAX }
}

function drawThumb(canvas: HTMLCanvasElement | null, grid: string[][]) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cols = grid[0]?.length ?? 16
  const rows = grid.length
  const cellW = canvas.width / cols
  const cellH = canvas.height / rows

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let r = 0; r < rows; r++) {
    const row = grid[r]
    if (!row) continue
    for (let c = 0; c < cols; c++) {
      const color = row[c]
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH))
      }
    }
  }
}

function refreshLayerThumbs() {
  for (const layer of canvasStore.layers) {
    drawThumb(thumbRefs.get(layer.id) ?? null, layer.grid)
  }
}

watch(
  () => [canvasStore.gridVersion, canvasStore.layers.length],
  () => nextTick(refreshLayerThumbs),
  { immediate: true },
)

onUnmounted(() => {
  cleanupDrag()
  document.removeEventListener('click', closeContextMenu)
  document.removeEventListener('keydown', onContextMenuKeydown)
})
</script>

<style scoped>
.panel-layers {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.layers-toolbar {
  display: flex;
  flex-shrink: 0;
}

.layer-tool-btn {
  flex: 1;
  padding: 8px 4px;
  border: 1px solid #6366f1;
  border-radius: 5px;
  background: #6366f1;
  font-size: 1rem;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
}

.layer-tool-btn:hover {
  background: #4f46e5;
}

.layers-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
}

.layers-list.drag-active {
  cursor: grabbing;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: default;
  user-select: none;
  transition: all 0.15s;
}

.layer-item:hover {
  background: #f9fafb;
  border-color: #e5e7eb;
}

.layer-item.active {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.layer-item.dragging {
  opacity: 0.4;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: scale(1.03);
  background: #f0f0f0;
  z-index: 5;
}

.drop-indicator {
  position: absolute;
  left: 4px;
  right: 4px;
  height: 3px;
  background: #6366f1;
  border-radius: 2px;
  pointer-events: none;
  z-index: 10;
}

.layer-thumb {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

.layer-thumb-canvas {
  border-radius: 3px;
  border: 1px solid #d1d5db;
  display: block;
}

.layer-name-wrap {
  flex: 1;
  min-width: 0;
}

.layer-name {
  font-size: 1.05rem;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.layer-name-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid #6366f1;
  border-radius: 3px;
  font-size: 1.05rem;
  outline: none;
}

.layer-vis-btn {
  flex-shrink: 0;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px;
}

.layer-vis-icon {
  width: 20px;
  height: 20px;
  display: block;
}

.layer-active-badge {
  font-size: 0.85rem;
  padding: 2px 6px;
  border-radius: 3px;
  background: #6366f1;
  color: #fff;
  flex-shrink: 0;
}
</style>

<style>
.layer-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 150px;
  padding: 6px 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.14);
  animation: ctx-fade-in 0.12s ease-out;
}

@keyframes ctx-fade-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-item {
  padding: 7px 14px;
  font-size: 0.95rem;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}

.context-menu-item:hover:not(.disabled) {
  background: #f3f4f6;
}

.context-menu-item.disabled {
  color: #bbb;
  cursor: default;
}
</style>
