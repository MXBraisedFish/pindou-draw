<template>
  <Teleport to="body">
    <div class="export-overlay" @click.self="closeModal()">
      <div class="export-dialog" @click.stop>
        <button class="export-close" @click="closeModal()">✕</button>

        <!-- 左：预览 -->
        <div class="export-preview">
          <div class="preview-zoom-bar">
            <button @click="zoomIn()">+</button>
            <span>{{ Math.round(zoom * 100) }}%</span>
            <button @click="zoomOut()">-</button>
            <button @click="fitZoom()">适应</button>
          </div>
          <div class="preview-canvas-wrap" ref="wrapRef"
            @wheel.prevent="onWheel"
            @pointerdown="onPanStart" @pointermove="onPanMove" @pointerup="onPanEnd">
            <canvas ref="previewCanvas" class="preview-canvas" :style="previewCanvasStyle"></canvas>
          </div>
        </div>

        <!-- 右：设置 -->
        <div class="export-settings">
          <h3>导出设置</h3>

          <label>导出图命名
            <input v-model="exportStore.exportName" class="exp-input" />
          </label>

          <label>导出格式
            <select v-model="exportStore.exportFormat" class="exp-input">
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="pindou">工程文件 (.pindou.json)</option>
            </select>
          </label>

          <div
            v-if="exportStore.exportLayerId"
            class="exp-layer-banner"
          >
            <span>📄 仅导出图层：<strong>{{ layerName }}</strong></span>
            <button class="exp-layer-clear" @click="clearLayerExport()">✕ 恢复全部</button>
          </div>

          <template v-if="exportStore.exportFormat !== 'pindou'">
          <label>导出内容
            <select v-model="exportStore.exportContent" class="exp-input">
              <option value="full">成图</option>
              <option value="sketch-only">仅草图</option>
            </select>
          </label>

          <div class="exp-section">显示设置</div>
          <label class="exp-check"><input type="checkbox" v-model="exportStore.showColorIds" /> 色号显示</label>
          <label class="exp-check" style="margin-left:16px" v-if="exportStore.exportHighlightActive">
            <input type="checkbox" v-model="exportStore.showColorIdsHighlightOnly" /> 仅高亮颜色显示色号
          </label>
          <label class="exp-check"><input type="checkbox" v-model="exportStore.showGrid" /> 网格显示</label>
          <template v-if="exportStore.showGrid">
            <div class="exp-sub">
              <label class="exp-check"><input type="checkbox" v-model="hlEnabled" /> 水平加粗</label>
              <template v-if="hlEnabled">
                <div class="thick-params">
                  <label>间隔 <input type="range" min="1" max="20" v-model.number="hlInterval" /> {{ hlInterval }}</label>
                  <label>粗细 <input type="range" min="1" max="5" v-model.number="hlThick" /> {{ hlThick }}</label>
                  <div class="exp-btns">
                    <button v-for="sp in startPositions" :key="sp.key" class="exp-sel-btn"
                      :class="{ active: hStartPos === sp.key }" @click="hStartPos = sp.key">{{ sp.label }}</button>
                  </div>
                </div>
              </template>
            </div>
            <div class="exp-sub">
              <label class="exp-check"><input type="checkbox" v-model="vlEnabled" /> 垂直加粗</label>
              <template v-if="vlEnabled">
                <div class="thick-params">
                  <label>间隔 <input type="range" min="1" max="20" v-model.number="vlInterval" /> {{ vlInterval }}</label>
                  <label>粗细 <input type="range" min="1" max="5" v-model.number="vlThick" /> {{ vlThick }}</label>
                  <div class="exp-btns">
                    <button v-for="sp in startPositions" :key="sp.key" class="exp-sel-btn"
                      :class="{ active: vStartPos === sp.key }" @click="vStartPos = sp.key">{{ sp.label }}</button>
                  </div>
                </div>
              </template>
            </div>
            <div class="exp-sub">
              <label>网格粗细 <input type="range" min="1" max="3" v-model.number="exportStore.gridThickness" /> {{ exportStore.gridThickness }}</label>
              <label>网格透明度 <input type="range" min="0" max="90" v-model.number="exportStore.gridOpacity" /> {{ exportStore.gridOpacity }}%</label>
            </div>
          </template>
          <label>坐标显示
            <select v-model="exportStore.coordDisplay" class="exp-input">
              <option value="none">不显示坐标</option>
              <option value="single">单侧坐标</option>
              <option value="dual">双侧坐标</option>
            </select>
          </label>
          <label>坐标轴样式
            <select v-model="exportStore.coordAxisStyle" class="exp-input">
              <option value="direct">直接渲染坐标轴</option>
              <option value="cell">方格坐标轴</option>
            </select>
          </label>

          <label>像素形状</label>
          <div class="exp-btns">
            <button class="exp-sel-btn" :class="{ active: exportStore.pixelShape === 'square' }"
              @click="exportStore.pixelShape = 'square'">■ 方形</button>
            <button class="exp-sel-btn" :class="{ active: exportStore.pixelShape === 'circle' }"
              @click="exportStore.pixelShape = 'circle'">○ 圆形</button>
          </div>

          <label>草图背景色</label>
          <div class="bg-presets">
            <button v-for="bg in bgColors" :key="bg.val" class="bg-swatch"
              :class="{ active: exportStore.sketchBg === bg.val }"
              :style="bg.style" :title="bg.label"
              @click="exportStore.sketchBg = bg.val"
            ></button>
            <input type="color" :value="exportStore.sketchBg === 'transparent' ? '#ffffff' : exportStore.sketchBg"
              class="bg-picker" @input="exportStore.sketchBg = ($event.target as HTMLInputElement).value" />
          </div>

          <label>字体
            <select v-model="exportStore.exportFont" class="exp-input">
              <option value="pixel">像素体 (MinecraftTen)</option>
              <option value="pixelfont">像素体 (PixelFont)</option>
              <option value="default">默认字体</option>
            </select>
          </label>

          <template v-if="exportStore.exportContent !== 'sketch-only'">
            <label>色块布局
              <select v-model="exportStore.tableLayout" class="exp-input">
                <option value="block">标块布局</option>
                <option value="table">表格布局</option>
                <option value="compact">小标块</option>
              </select>
            </label>

            <label>导出图背景色</label>
            <div class="bg-presets">
              <button v-for="bg in bgColors" :key="bg.val" class="bg-swatch"
                :class="{ active: exportStore.pageBg === bg.val }"
                :style="bg.style" :title="bg.label"
                @click="exportStore.pageBg = bg.val"
              ></button>
              <input type="color" :value="exportStore.pageBg === 'transparent' ? '#ffffff' : exportStore.pageBg"
                class="bg-picker" @input="exportStore.pageBg = ($event.target as HTMLInputElement).value" />
            </div>
          </template>

          <label>渲染模式
            <select v-model="exportStore.exportRenderMode" class="exp-input">
              <option value="day">白天</option>
              <option value="night">夜晚</option>
              <option value="thermo">温变</option>
              <option value="photo">光变</option>
              <option value="thermo-photo">温+光</option>
            </select>
          </label>

          <div class="exp-section">高亮导出</div>
          <label class="exp-check">
            <input type="checkbox" v-model="exportStore.exportHighlightActive" /> 启用高亮效果
          </label>
          <template v-if="exportStore.exportHighlightActive">
            <button class="exp-btn exp-btn-hl-config" @click="showExportHlModal = true">
              配置高亮颜色 (已选 {{ exportStore.exportHighlightedColorIds.size }} 色)
            </button>
            <label class="exp-check">
              <input type="checkbox" v-model="exportStore.exportHighlightOnly" /> 仅渲染高亮像素
            </label>
            <label>标记序号
              <select v-model="exportStore.exportHighlightNumberMode" class="exp-input">
                <option value="off">关闭</option>
                <option value="row">行顺序标记</option>
                <option value="col">列顺序标记</option>
                <option value="global">全局顺序标记</option>
              </select>
            </label>
            <div class="exp-sub" style="margin-top:4px">
              <span style="font-size:0.78rem;color:#888;">批量导出：为每个高亮颜色生成独立图片，打包为 .zip</span>
              <button
                class="exp-btn exp-btn-batch"
                :disabled="batchExporting"
                @click="doBatchExport()"
              >{{ batchExporting ? '导出中...' : '批量导出 (.zip)' }}</button>
            </div>
          </template>
          </template>

          <div class="exp-actions">
            <button class="exp-btn exp-btn-export" @click="exportStore.doExport()">导出</button>
          </div>
        </div>
      </div>
    </div>

    <ExportHighlightModal
      v-if="showExportHlModal"
      @close="showExportHlModal = false"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useExportStore } from '@/stores/exportStore'
import { useCanvasStore } from '@/stores/canvas'
import ExportHighlightModal from '@/components/ExportHighlightModal.vue'

const exportStore = useExportStore()
const canvasStore = useCanvasStore()

defineEmits<{ close: [] }>()

const layerName = computed(() => {
  if (!exportStore.exportLayerId) return ''
  const layer = canvasStore.layers.find(l => l.id === exportStore.exportLayerId)
  return layer?.name ?? ''
})

function closeModal() {
  exportStore.exportLayerId = null
  exportStore.showModal = false
}

function clearLayerExport() {
  exportStore.exportLayerId = null
  scheduleRefresh()
}

const showExportHlModal = ref(false)

const wrapRef = ref<HTMLElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewCanvasStyle = ref<Record<string, string>>({})

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
let isPanning = false
let panStartX = 0; let panStartY = 0
let panStartPanX = 0; let panStartPanY = 0

// 粗线配置
const hlEnabled = ref(false)
const hlInterval = ref(5)
const hlThick = ref(1)
const vlEnabled = ref(false)
const vlInterval = ref(5)
const vlThick = ref(1)
const hStartPos = ref<'center' | 'start' | 'end'>('center')
const vStartPos = ref<'center' | 'start' | 'end'>('center')
const startPositions = [
  { key: 'center' as const, label: '居中' },
  { key: 'start' as const, label: '居前' },
  { key: 'end' as const, label: '居后' },
]

function syncThickFromStore() {
  hlEnabled.value = exportStore.thickLineH.enabled
  hlInterval.value = exportStore.thickLineH.interval
  hlThick.value = exportStore.thickLineH.thickness
  vlEnabled.value = exportStore.thickLineV.enabled
  vlInterval.value = exportStore.thickLineV.interval
  vlThick.value = exportStore.thickLineV.thickness
  hStartPos.value = exportStore.hStartPos
  vStartPos.value = exportStore.vStartPos
}
function calcOffset(pos: 'center' | 'start' | 'end', total: number, interval: number) {
  const rem = total % interval
  if (pos === 'start') return 0
  if (pos === 'end') return rem
  return Math.floor(rem / 2)
}
function syncThickToStore() {
  exportStore.thickLineH = { enabled: hlEnabled.value, interval: hlInterval.value, thickness: hlThick.value, startOffset: 0 }
  exportStore.thickLineV = { enabled: vlEnabled.value, interval: vlInterval.value, thickness: vlThick.value, startOffset: 0 }
  exportStore.hStartPos = hStartPos.value
  exportStore.vStartPos = vStartPos.value
}

// 背景色预设
const bgColors = [
  { val: '#ffffff', label: '白色', style: { background: '#fff' } },
  { val: '#e0e0e0', label: '灰色', style: { background: '#e0e0e0' } },
  { val: '#000000', label: '黑色', style: { background: '#000' } },
  { val: 'transparent', label: '透明', style: { background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50%/8px 8px' } },
]

const batchExporting = ref(false)
async function doBatchExport() {
  batchExporting.value = true
  try {
    await exportStore.batchExportHighlight()
  } finally {
    batchExporting.value = false
  }
}

function updateCanvasStyle() {
  previewCanvasStyle.value = {
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
    transformOrigin: 'center center',
  }
}

function zoomIn() { zoom.value = Math.min(5, zoom.value * 1.25); updateCanvasStyle() }
function zoomOut() { zoom.value = Math.max(0.1, zoom.value / 1.25); updateCanvasStyle() }
function fitZoom() { zoom.value = 1; panX.value = 0; panY.value = 0; updateCanvasStyle() }
function onWheel(e: WheelEvent) {
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * (e.deltaY > 0 ? 0.9 : 1.1)))
  updateCanvasStyle()
}
function onPanStart(e: PointerEvent) {
  if (e.button !== 0) return
  isPanning = true; panStartX = e.clientX; panStartY = e.clientY; panStartPanX = panX.value; panStartPanY = panY.value
}
function onPanMove(e: PointerEvent) {
  if (!isPanning) return
  panX.value = panStartPanX + (e.clientX - panStartX)
  panY.value = panStartPanY + (e.clientY - panStartY)
  updateCanvasStyle()
}
function onPanEnd() { isPanning = false }

function renderPreviewToCanvas() {
  if (!previewCanvas.value || !exportStore.previewDataUrl) return
  const img = new Image()
  img.onload = () => {
    const c = previewCanvas.value!
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
  }
  img.src = exportStore.previewDataUrl
}

// 自动刷新
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    exportStore.refreshPreview()
    nextTick(() => renderPreviewToCanvas())
  }, 150)
}

const watched = [
  () => exportStore.exportName,
  () => exportStore.showColorIds,
  () => exportStore.showColorIdsHighlightOnly,
  () => exportStore.showGrid,
  () => exportStore.gridThickness,
  () => exportStore.gridOpacity,
  () => exportStore.coordDisplay,
  () => exportStore.coordAxisStyle,
  () => exportStore.sketchBg,
  () => exportStore.pageBg,
  () => exportStore.exportRenderMode,
  () => exportStore.pixelShape,
  () => exportStore.exportFont,
  () => exportStore.tableLayout,
  () => exportStore.exportContent,
  () => exportStore.exportLayerId,
  () => exportStore.exportHighlightActive,
  () => exportStore.exportHighlightOnly,
  () => exportStore.exportHighlightedColorIds,
  () => exportStore.exportHighlightNumberMode,
  () => [hlEnabled.value, hlInterval.value, hlThick.value, hStartPos.value, vlEnabled.value, vlInterval.value, vlThick.value, vStartPos.value],
]
watch(watched, () => { syncThickToStore(); scheduleRefresh() }, { deep: true })

onMounted(() => {
  exportStore.initFromCanvas()
  syncThickFromStore()
  exportStore.refreshPreview()
  nextTick(() => { renderPreviewToCanvas(); updateCanvasStyle() })
})
</script>

<style scoped>
.export-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.5); display: flex;
  align-items: center; justify-content: center;
}
.export-dialog {
  background: #fff; border-radius: 14px;
  display: flex; width: 92vw; max-width: 1100px; height: 82vh;
  box-shadow: 0 16px 48px rgba(0,0,0,0.2);
  overflow: hidden; position: relative;
}
.export-close {
  position: absolute; top: 10px; right: 14px; z-index: 5;
  border: none; background: none; font-size: 1.3rem; cursor: pointer; color: #999;
}
.export-preview {
  flex: 1; background: #e8e8e8;
  display: flex; flex-direction: column; min-width: 0;
}
.preview-zoom-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; background: #fff; border-bottom: 1px solid #e5e7eb;
  font-size: 0.8rem; flex-shrink: 0;
}
.preview-zoom-bar button {
  padding: 2px 8px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; font-size: 0.75rem;
}
.preview-canvas-wrap {
  flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center;
  cursor: grab; position: relative;
}
.preview-canvas {
  position: absolute; image-rendering: pixelated;
}

.export-settings {
  width: 260px; flex-shrink: 0;
  padding: 20px 16px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  border-left: 1px solid #e5e7eb; background: #fafafa;
}
.export-settings h3 { font-size: 1rem; font-weight: 600; color: #333; }
.export-settings label { font-size: 0.78rem; color: #555; display: flex; flex-direction: column; gap: 2px; }
.exp-input { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 0.82rem; outline: none; }
.exp-input:focus { border-color: #6366f1; }
.exp-color { width: 36px; height: 28px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; }
.exp-layer-banner {
  background: #eff6ff; border: 1px solid #93c5fd; border-radius: 6px;
  padding: 6px 10px; margin-bottom: 6px; font-size: 0.8rem;
  display: flex; align-items: center; justify-content: space-between;
}
.exp-layer-banner strong { color: #1d4ed8; }
.exp-layer-clear {
  border: none; background: none; color: #ef4444; cursor: pointer; font-size: 0.75rem;
}
.exp-layer-clear:hover { text-decoration: underline; }
.exp-section { font-size: 0.75rem; color: #888; font-weight: 600; padding-top: 6px; border-top: 1px solid #e5e7eb; }
.exp-check { flex-direction: row !important; align-items: center; gap: 6px !important; cursor: pointer; }
.exp-check input { margin: 0; }
.exp-sub { padding-left: 12px; }
.thick-params { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 2px 12px; }
.thick-params label { font-size: 0.7rem; color: #555; display: flex; align-items: center; gap: 4px; }
.thick-params input[type='range'] { width: 60px; height: 4px; }
.exp-btns { display: flex; gap: 3px; }
.exp-sel-btn { padding: 2px 6px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; font-size: 0.65rem; cursor: pointer; }
.exp-sel-btn.active { background: #eef2ff; color: #6366f1; border-color: #c7d2fe; }

.bg-presets { display: flex; gap: 4px; align-items: center; }
.bg-swatch { width: 26px; height: 26px; border: 2px solid #d1d5db; border-radius: 5px; cursor: pointer; }
.bg-swatch:hover { border-color: #9ca3af; }
.bg-swatch.active { border-color: #6366f1; box-shadow: 0 0 0 1px #6366f1; }
.bg-picker { width: 28px; height: 26px; border: 1px solid #d1d5db; border-radius: 5px; cursor: pointer; padding: 1px; }

.exp-actions { display: flex; gap: 8px; margin-top: 8px; }
.exp-btn { flex: 1; padding: 8px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; border: none; }
.exp-btn-export { background: #6366f1; color: #fff; }
.exp-btn-export:hover { background: #4f46e5; }
.exp-btn-hl-config {
  width: 100%; margin-top: 4px; margin-bottom: 6px;
}
.exp-btn-batch {
  background: #f59e0b; color: #fff; margin-top: 6px; width: 100%;
}
.exp-btn-batch:hover { background: #e08f0b; }
.exp-btn-batch:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
