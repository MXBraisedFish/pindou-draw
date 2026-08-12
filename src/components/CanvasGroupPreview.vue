<template>
  <div class="cgp-root" ref="rootRef" @contextmenu.prevent>
    <div class="cgp-header">
      <h3>{{ group?.name ?? '画布组' }}</h3>
      <span class="cgp-info"
        >{{ group?.groupCols ?? 0 }}x{{ group?.groupRows ?? 0 }} · 每格
        {{ group?.subSize ?? 0 }}²</span
      >
    </div>

    <div class="cgp-grid-wrap">
      <!-- 统一 CSS Grid：第 1 行=列标签，第 1 列=行标签，其余=缩略图 -->
      <div :key="groupLayoutKey" class="cgp-table" :style="tableStyle">
        <!-- 左上角 -->
        <div class="cgp-corner"></div>
        <!-- 列标签 -->
        <div
          v-for="c in groupCols"
          :key="'cl' + c"
          class="cgp-col-label"
          @contextmenu.prevent="onColContext($event, c - 1)"
        >
          {{ c }}
        </div>
        <!-- 行标签 + 缩略图行 -->
        <template v-for="r in groupRows" :key="'row' + r">
          <div class="cgp-row-label" @contextmenu.prevent="onRowContext($event, r - 1)">
            {{ r }}
          </div>
          <div
            v-for="c in groupCols"
            :key="`${r},${c}`"
            class="cgp-cell"
            :data-row="r - 1"
            :data-col="c - 1"
            @click="enterCell(r - 1, c - 1)"
            @pointerdown="onCellPointerDown($event, r - 1, c - 1)"
          >
            <canvas
              :ref="(el) => setThumbRef(r - 1, c - 1, el as HTMLCanvasElement)"
              class="cgp-thumb"
            ></canvas>
          </div>
        </template>
      </div>
    </div>

    <!-- 行列右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="cgp-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      >
        <template v-if="ctxMenu.type === 'row'">
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupRows >= GROUP_SIZE_MAX }"
            @click="addRow(ctxMenu.index, true)"
          >
            向上添加行
          </div>
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupRows >= GROUP_SIZE_MAX }"
            @click="addRow(ctxMenu.index, false)"
          >
            向下添加行
          </div>
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupRows <= 1 }"
            @click="deleteRow(ctxMenu.index)"
          >
            删除此行
          </div>
        </template>
        <template v-else>
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupCols >= GROUP_SIZE_MAX }"
            @click="addCol(ctxMenu.index, true)"
          >
            向左添加列
          </div>
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupCols >= GROUP_SIZE_MAX }"
            @click="addCol(ctxMenu.index, false)"
          >
            向右添加列
          </div>
          <div
            class="cgp-ctx-item"
            :class="{ disabled: groupCols <= 1 }"
            @click="deleteCol(ctxMenu.index)"
          >
            删除此列
          </div>
        </template>
      </div>
    </Teleport>

    <!-- 拖拽浮影 -->
    <Teleport to="body">
      <div
        v-if="dragGhost.visible"
        class="cgp-ghost"
        :style="{ left: dragGhost.x + 'px', top: dragGhost.y + 'px' }"
      ></div>
    </Teleport>

    <!-- 删除确认 -->
    <ConfirmModal
      v-if="deleteConfirm.visible"
      :title="deleteConfirm.title"
      :message="deleteConfirm.message"
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="executeDelete()"
      @cancel="deleteConfirm.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { GROUP_SIZE_MAX, useCanvasStore } from '@/stores/canvas'
import ConfirmModal from '@/components/ConfirmModal.vue'

const canvasStore = useCanvasStore()

const deleteConfirm = ref<{
  visible: boolean
  title: string
  message: string
  action: (() => void) | null
}>({
  visible: false,
  title: '',
  message: '',
  action: null,
})

function executeDelete() {
  deleteConfirm.value.visible = false
  deleteConfirm.value.action?.()
}

const group = computed(() => {
  void canvasStore.groupVersion
  return canvasStore.canvasGroup
})
const groupCols = computed(() => {
  void canvasStore.groupVersion
  return canvasStore.canvasGroup?.groupCols ?? 1
})
const groupRows = computed(() => {
  void canvasStore.groupVersion
  return canvasStore.canvasGroup?.groupRows ?? 1
})
const layoutRevision = ref(0)
const groupLayoutKey = computed(
  () => `${groupRows.value}x${groupCols.value}:${layoutRevision.value}`,
)

// 自适应缩略图尺寸
const rootRef = ref<HTMLElement | null>(null)
const containerW = ref(400)
const containerH = ref(400)
const labelSz = 24 // 行列标签最小尺寸

function updateContainerSize() {
  const el = rootRef.value
  if (!el) return
  const headerH = 36
  const gutter = 3 // gap between cells
  const colGaps = gutter * (groupCols.value + 1) // gaps between cells + label gap
  const rowGaps = gutter * (groupRows.value + 1)
  const maxLabelW = Math.min(40, Math.floor((el.clientWidth - 16) / (groupCols.value + 1)))
  containerW.value = el.clientWidth - 16 - maxLabelW - colGaps
  containerH.value = el.clientHeight - headerH - 16 - labelSz - rowGaps
}

const thumbPixelSize = computed(() => {
  const maxCW = Math.max(1, Math.floor(containerW.value / groupCols.value))
  const maxCH = Math.max(1, Math.floor(containerH.value / groupRows.value))
  return Math.max(1, Math.min(maxCW, maxCH))
})

const tableStyle = computed(() => ({
  gridTemplateColumns: `${labelSz}px repeat(${groupCols.value}, ${thumbPixelSize.value}px)`,
  gridTemplateRows: `${labelSz}px repeat(${groupRows.value}, ${thumbPixelSize.value}px)`,
}))

// 缩略图缓存
const thumbRefs = new Map<string, HTMLCanvasElement>()
const lastThumbSize = ref(0)

function setThumbRef(r: number, c: number, el: HTMLCanvasElement | null) {
  const key = `${r},${c}`
  if (el) thumbRefs.set(key, el)
  else thumbRefs.delete(key)
}

function renderThumb(r: number, c: number) {
  const key = `${r},${c}`
  const canvas = thumbRefs.get(key)
  if (!canvas) return
  const snap = group.value?.canvases[r]?.[c]
  if (!snap) return
  const size = group.value!.subSize
  const cellPx = thumbPixelSize.value
  const cellSize = Math.max(1, Math.floor(cellPx / size))
  const w = size * cellSize
  const h = size * cellSize
  if (canvas.width !== w || canvas.height !== h || lastThumbSize.value !== cellPx) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = snap.backgroundColor
  ctx.fillRect(0, 0, w, h)
  for (const layer of snap.layers) {
    if (!layer.visible) continue
    for (let rr = 0; rr < size; rr++) {
      const row = layer.grid[rr]
      if (!row) continue
      for (let cc = 0; cc < size; cc++) {
        const hex = row[cc]
        if (!hex) continue
        ctx.fillStyle = hex
        ctx.fillRect(cc * cellSize, rr * cellSize, cellSize, cellSize)
      }
    }
  }
  canvasStore.dirtyCanvases.delete(key)
}

function refreshDirty() {
  if (!group.value) return
  for (const key of canvasStore.dirtyCanvases) {
    const [r, c] = key.split(',').map(Number)
    if (r !== undefined && c !== undefined) renderThumb(r!, c!)
  }
}

function renderAll() {
  if (!group.value) return
  lastThumbSize.value = thumbPixelSize.value
  const validKeys = new Set<string>()
  for (let r = 0; r < groupRows.value; r++)
    for (let c = 0; c < groupCols.value; c++) {
      validKeys.add(`${r},${c}`)
      renderThumb(r, c)
    }
  for (const key of thumbRefs.keys()) {
    if (!validKeys.has(key)) thumbRefs.delete(key)
  }
  canvasStore.dirtyCanvases.clear()
}

let refreshRaf = 0
function scheduleRefresh() {
  if (refreshRaf) cancelAnimationFrame(refreshRaf)
  refreshRaf = requestAnimationFrame(refreshDirty)
}

let resizeObserver: ResizeObserver | null = null

watch(() => canvasStore.dirtyCanvases, scheduleRefresh, { deep: true })
watch(
  () => canvasStore.groupVersion,
  async () => {
    layoutRevision.value++
    await nextTick()
    updateContainerSize()
    await nextTick()
    renderAll()
  },
)
watch(thumbPixelSize, () => {
  if (lastThumbSize.value !== thumbPixelSize.value) renderAll()
})

function enterCell(r: number, c: number) {
  canvasStore.switchToSubCanvas(r, c)
}

// 右键菜单
const ctxMenu = ref<{ visible: boolean; x: number; y: number; type: 'row' | 'col'; index: number }>(
  {
    visible: false,
    x: 0,
    y: 0,
    type: 'row',
    index: 0,
  },
)

function closeCtxMenu() {
  ctxMenu.value.visible = false
}

function onRowContext(e: MouseEvent, idx: number) {
  ctxMenu.value = { visible: true, x: e.clientX, y: e.clientY, type: 'row', index: idx }
}
function onColContext(e: MouseEvent, idx: number) {
  ctxMenu.value = { visible: true, x: e.clientX, y: e.clientY, type: 'col', index: idx }
}

function addRow(idx: number, above: boolean) {
  canvasStore.saveActiveToGroup()
  canvasStore.addGroupRow(idx, above)
  closeCtxMenu()
  nextTick(() => renderAll())
}
function deleteRow(idx: number) {
  closeCtxMenu()
  const doDelete = () => {
    canvasStore.saveActiveToGroup()
    canvasStore.deleteGroupRow(idx)
    nextTick(() => renderAll())
  }
  if (canvasStore.hasPixelsInRow(idx)) {
    deleteConfirm.value = {
      visible: true,
      title: '删除行',
      message: '此行中存在非空子画布，删除将<b>丢失所有像素</b>。<br>该操作不可撤回。',
      action: doDelete,
    }
  } else {
    doDelete()
  }
}

function addCol(idx: number, left: boolean) {
  canvasStore.saveActiveToGroup()
  canvasStore.addGroupCol(idx, left)
  closeCtxMenu()
  nextTick(() => renderAll())
}

function deleteCol(idx: number) {
  closeCtxMenu()
  const doDelete = () => {
    canvasStore.saveActiveToGroup()
    canvasStore.deleteGroupCol(idx)
    nextTick(() => renderAll())
  }
  if (canvasStore.hasPixelsInCol(idx)) {
    deleteConfirm.value = {
      visible: true,
      title: '删除列',
      message: '此列中存在非空子画布，删除将<b>丢失所有像素</b>。<br>该操作不可撤回。',
      action: doDelete,
    }
  } else {
    doDelete()
  }
}

// 长按拖动交换
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let dragSource: { row: number; col: number } | null = null
const dragGhost = ref<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false })

function onCellPointerDown(e: PointerEvent, r: number, c: number) {
  if (e.button !== 0) return
  const sx = e.clientX
  const sy = e.clientY
  longPressTimer = setTimeout(() => {
    // 长按触发：标记拖拽源
    dragSource = { row: r, col: c }
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
    dragGhost.value = { x: sx, y: sy, visible: true }
  }, 150)
}

function onPointerMove(e: PointerEvent) {
  if (dragSource) {
    dragGhost.value = { x: e.clientX, y: e.clientY, visible: true }
    return
  }
  if (!longPressTimer) return
  if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) {
    clearTimeout(longPressTimer!)
    longPressTimer = null
  }
}

function onPointerUp(e: PointerEvent) {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  if (!dragSource) return
  // 找目标 cell
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest('.cgp-cell') as HTMLElement | null
  document.querySelectorAll('.cgp-cell.dragging').forEach((el) => el.classList.remove('dragging'))
  dragGhost.value = { x: 0, y: 0, visible: false }
  if (target) {
    const tr = parseInt(target.dataset.row ?? '', 10)
    const tc = parseInt(target.dataset.col ?? '', 10)
    if (!isNaN(tr) && !isNaN(tc) && (tr !== dragSource.row || tc !== dragSource.col)) {
      canvasStore.swapSubCanvases(dragSource.row, dragSource.col, tr, tc)
      nextTick(() => renderAll())
    }
  }
  dragSource = null
}

onMounted(() => {
  updateContainerSize()
  nextTick(() => renderAll())
  if (rootRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerSize()
    })
    resizeObserver.observe(rootRef.value)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('click', closeCtxMenu)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('click', closeCtxMenu)
})
</script>

<style scoped>
.cgp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6px 8px;
}
.cgp-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.cgp-header h3 {
  margin: 0;
  font-size: 1rem;
}
.cgp-info {
  font-size: 0.75rem;
  color: #888;
}

.cgp-grid-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 统一表格：行列标签+缩略图 */
.cgp-table {
  display: grid;
  gap: 3px;
  background: #d4d4d4; /* gap 颜色 = 网格线 */
  border: 3px solid #d4d4d4;
  border-radius: 4px;
}
.cgp-corner {
  background: #e8e8e8;
  border-radius: 2px;
}

/* 列标签（顶部） */
.cgp-col-label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8e8e8;
  border-radius: 2px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #555;
  cursor: context-menu;
  user-select: none;
}
.cgp-col-label:hover {
  background: #ddd;
}

/* 行标签（左侧） */
.cgp-row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8e8e8;
  border-radius: 2px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #555;
  cursor: context-menu;
  user-select: none;
}
.cgp-row-label:hover {
  background: #ddd;
}

/* 缩略图 */
.cgp-cell {
  background: #fff;
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}
.cgp-cell:hover {
  outline: 2px solid #bbb;
  outline-offset: -2px;
  border-radius: 2px;
}
.cgp-cell.dragging {
  opacity: 0.35;
  outline: 2px solid #f59e0b;
  outline-offset: -2px;
}
.cgp-ghost {
  position: fixed;
  z-index: 30000;
  pointer-events: none;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.3);
  border: 2px dashed #f59e0b;
  transform: translate(-50%, -50%);
}
.cgp-thumb {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}

/* 右键菜单 */
.cgp-ctx-menu {
  position: fixed;
  z-index: 20000;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  min-width: 130px;
}
.cgp-ctx-item {
  padding: 6px 14px;
  font-size: 0.82rem;
  cursor: pointer;
  color: #333;
}
.cgp-ctx-item:hover {
  background: #f5f5f5;
}
.cgp-ctx-item.disabled {
  color: #ccc;
  cursor: default;
  pointer-events: none;
}
</style>
