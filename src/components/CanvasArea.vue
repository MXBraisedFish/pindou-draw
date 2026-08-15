<template>
  <div class="canvas-area">
    <!-- 画布组标签栏 -->
    <div v-if="canvasStore.canvasGroup" class="canvas-tabs">
      <button class="ctab-btn" title="查看画布组预览" @click="openPreview()">查看画布组</button>
      <button v-if="canScrollLeft" class="ctab-arrow" @click="scrollTabs(-1)">◀</button>
      <div class="ctab-scroll" ref="tabScrollRef" @scroll="onTabScroll()">
        <button
          v-for="tab in canvasStore.openGroupTabs"
          :key="`${tab.row},${tab.col}`"
          class="ctab-tab"
          :class="{
            active:
              !canvasStore.showGroupPreview &&
              tab.row === canvasStore.activeGroupRow &&
              tab.col === canvasStore.activeGroupCol,
          }"
          @click="canvasStore.switchToSubCanvas(tab.row, tab.col)"
        >
          <span>[{{ tab.row + 1 }},{{ tab.col + 1 }}]</span>
          <span
            class="ctab-close"
            v-if="canvasStore.openGroupTabs.length > 1"
            role="button"
            aria-label="关闭画布"
            title="关闭画布"
            @click.stop="canvasStore.closeGroupTab(tab.row, tab.col)"
          >
            <img :src="iconClose" alt="" />
          </span>
        </button>
      </div>
      <button v-if="canScrollRight" class="ctab-arrow" @click="scrollTabs(1)">▶</button>
    </div>

    <!-- 画布组预览 -->
    <CanvasGroupPreview v-if="canvasStore.canvasGroup && canvasStore.showGroupPreview" />

    <!-- 普通画布 -->
    <div v-else class="canvas-viewport" ref="viewportRef">
      <canvas
        ref="canvasRef"
        class="main-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
      ></canvas>
    </div>
    <WorkspaceFooter v-if="!canvasStore.showGroupPreview" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import WorkspaceFooter from '@/components/WorkspaceFooter.vue'
import CanvasGroupPreview from '@/components/CanvasGroupPreview.vue'
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useSelectionStore } from '@/stores/selection'
import { renderCanvas } from '@/ts/canvasRenderer'
import { useTool } from '@/composables/useTool'
import iconClose from '@/assets/icon/关闭取消.png'

const canvasStore = useCanvasStore()
const paletteStore = usePaletteStore()
const selectionStore = useSelectionStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const viewportRef = ref<HTMLDivElement | null>(null)

function openPreview() {
  canvasStore.saveActiveToGroup()
  canvasStore.showGroupPreview = true
}

// 标签栏滚动
const tabScrollRef = ref<HTMLDivElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function onTabScroll() {
  const el = tabScrollRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}
function scrollTabs(dir: number) {
  const el = tabScrollRef.value
  if (!el) return
  el.scrollBy({ left: el.clientWidth * 0.7 * dir, behavior: 'smooth' })
}
function checkTabScroll() {
  const el = tabScrollRef.value
  if (!el) return
  canScrollRight.value = el.scrollWidth > el.clientWidth + 1
  canScrollLeft.value = false
}

const { onPointerDown, onPointerMove, onPointerUp, onWheel } = useTool(canvasRef, viewportRef)

let renderPending = false

function doRender() {
  if (!canvasRef.value) return
  const mask = selectionStore.isSelecting
    ? selectionStore.previewMask
    : selectionStore.hasSelection
      ? selectionStore.selectionMask
      : null

  const preview = selectionStore.isSelecting
    ? {
        shape: selectionStore.selectShape,
        c1: selectionStore.selectStartCol,
        r1: selectionStore.selectStartRow,
        c2: selectionStore.selectEndCol,
        r2: selectionStore.selectEndRow,
        points: selectionStore.lassoPoints,
      }
    : null

  const hlMask = paletteStore.highlightActive
    ? paletteStore.computeHighlightMask(canvasStore.compositeGrid)
    : null

  renderCanvas(canvasRef.value, canvasStore, {
    colorMap: paletteStore.colorMap,
    renderMode: canvasStore.renderMode,
    prevRenderMode: canvasStore.prevRenderMode,
    transitionProgress: canvasStore.transitionProgress,
    pixelShape: canvasStore.pixelShape,
    showColorIds: canvasStore.showColorIds,
    showColorIdsHighlightOnly: canvasStore.showColorIdsHighlightOnly,
    backgroundColor: canvasStore.backgroundColor,
    symmetry: canvasStore.symmetry,
    thickLineH: canvasStore.thickLineH,
    thickLineV: canvasStore.thickLineV,
    selectionMask: mask,
    highlightMask: hlMask,
    highlightNumberMode: paletteStore.highlightNumberMode,
    previewCols: canvasStore.resizePreview?.newCols,
    previewRows: canvasStore.resizePreview?.newRows,
    previewShape: preview,
    geoPreview: canvasStore.geoPreview,
    underlay:
      canvasStore.underlay && canvasStore.underlayImage
        ? { image: canvasStore.underlayImage, state: canvasStore.underlay }
        : null,
  })
}

function scheduleRender() {
  if (renderPending) return
  renderPending = true
  requestAnimationFrame(() => {
    renderPending = false
    doRender()
  })
}

onMounted(() => doRender())

watch(
  () => [
    canvasStore.gridVersion,
    canvasStore.zoom,
    canvasStore.panX,
    canvasStore.panY,
    canvasStore.showGrid,
    canvasStore.cols,
    canvasStore.rows,
    canvasStore.renderMode,
    canvasStore.symmetry,
    canvasStore.pixelShape,
    canvasStore.showColorIds,
    canvasStore.showColorIdsHighlightOnly,
    canvasStore.backgroundColor,
    canvasStore.thickLineH,
    canvasStore.thickLineV,
    canvasStore.geoPreview,
    canvasStore.underlay,
    canvasStore.underlayImage,
    selectionStore.version,
    canvasStore.showGroupPreview,
    paletteStore.highlightActive,
    paletteStore.highlightedColorIds,
    paletteStore.highlightNumberMode,
  ],
  () => scheduleRender(),
  { deep: true },
)

watch(
  () => canvasStore.openGroupTabs.length,
  () => nextTick(checkTabScroll),
)

watch(
  () => [canvasStore.cols, canvasStore.rows] as const,
  ([cols, rows]) => selectionStore.resize(cols, rows),
)

watch(
  () => [canvasStore.activeGroupRow, canvasStore.activeGroupCol] as const,
  (next, previous) => {
    if (previous && (next[0] !== previous[0] || next[1] !== previous[1])) {
      selectionStore.clearSelection()
    }
  },
)
</script>

<style scoped>
.canvas-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.canvas-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  background: #f0f0f0;
  border-bottom: 1px solid #ddd;
}
.ctab-btn {
  padding: 5px 12px;
  border: 1px solid #6366f1;
  border-radius: 4px;
  background: #eef2ff;
  color: #6366f1;
  cursor: pointer;
  font-size: 0.78rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.ctab-btn:hover {
  background: #dde4ff;
}
.ctab-arrow {
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.7rem;
  color: #666;
  flex-shrink: 0;
  line-height: 1;
}
.ctab-arrow:hover {
  background: #e8e8e8;
}
.ctab-scroll {
  display: flex;
  align-items: center;
  gap: 3px;
  overflow-x: auto;
  flex: 1;
  white-space: nowrap;
}
.ctab-scroll::-webkit-scrollbar {
  display: none;
}
.ctab-scroll {
  scrollbar-width: none;
}
.ctab-tab {
  padding: 5px 14px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 60px;
  justify-content: center;
}
.ctab-tab:hover {
  background: #e8e8e8;
}
.ctab-tab.active {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}
.ctab-close {
  display: inline-grid;
  width: 16px;
  height: 16px;
  place-items: center;
  opacity: 0.6;
}
.ctab-close img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.ctab-close:hover {
  opacity: 1;
}

.canvas-viewport {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e5e5;
  position: relative;
}

.main-canvas {
  cursor: crosshair;
  image-rendering: pixelated;
}

body#tb .main-canvas {
  touch-action: none;
}
</style>
