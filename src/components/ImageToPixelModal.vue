<template>
  <Teleport to="body">
    <div class="ip-overlay" @click.self="$emit('close')">
      <div class="ip-dialog" @click.stop>
        <button class="ip-close" @click="$emit('close')">✕</button>

        <!-- 左：预览 -->
        <div class="ip-preview">
          <div v-if="!sourceImage" class="ip-dropzone">
            <p>拖拽图片到此处</p>
            <p class="ip-hint">或</p>
            <input type="file" accept="image/*" @change="onFile" class="ip-file" />
          </div>
          <template v-else>
            <div class="ip-preview-panes">
              <div class="ip-pane">
                <span class="ip-pane-label">原图</span>
                <canvas ref="sourceCanvas" class="ip-canvas"></canvas>
              </div>
              <div class="ip-pane">
                <span class="ip-pane-label">像素图 {{ outW }}×{{ outH }}</span>
                <canvas ref="pixelCanvas" class="ip-canvas"></canvas>
              </div>
            </div>
          </template>
        </div>

        <!-- 右：设置 -->
        <div class="ip-settings">
          <h3>以图生图</h3>
          <div v-if="!sourceImage" class="ip-placeholder">请先导入图片</div>
          <template v-else>
            <label
              >转换比例 1:<input
                type="number"
                v-model.number="pixelRatio"
                min="1"
                max="80"
                class="ip-input small"
                @input="schedulePreview"
            /></label>
            <label
              >抖动算法
              <select v-model="ditherMode" class="ip-input" @change="schedulePreview">
                <option value="none">不抖动</option>
                <option value="floyd-steinberg">Floyd-Steinberg</option>
                <option value="blue-noise">有序抖动</option>
              </select>
            </label>

            <div class="ip-section">图片编辑</div>
            <label
              >缩放
              <input
                type="range"
                v-model.number="scale"
                min="1"
                max="100"
                @input="schedulePreview"
              />
              {{ scale }}%</label
            >
            <div class="ip-row">
              <label
                >X
                <input
                  type="number"
                  v-model.number="offsetX"
                  min="0"
                  class="ip-input small"
                  @input="schedulePreview"
              /></label>
              <label
                >Y
                <input
                  type="number"
                  v-model.number="offsetY"
                  min="0"
                  class="ip-input small"
                  @input="schedulePreview"
              /></label>
            </div>
            <div class="ip-row">
              <label
                >裁宽
                <input
                  type="number"
                  v-model.number="cropW"
                  min="0"
                  class="ip-input small"
                  @input="schedulePreview"
              /></label>
              <label
                >裁高
                <input
                  type="number"
                  v-model.number="cropH"
                  min="0"
                  class="ip-input small"
                  @input="schedulePreview"
              /></label>
            </div>
            <div class="ip-btns">
              <button class="ip-btn" @click="rotatePreview()">旋转 {{ rotate }}°</button>
              <button
                class="ip-btn"
                :class="{ active: flipH }"
                @click="toggleFlip('horizontal')"
              >
                水平翻转
              </button>
              <button
                class="ip-btn"
                :class="{ active: flipV }"
                @click="toggleFlip('vertical')"
              >
                垂直翻转
              </button>
            </div>

            <div class="ip-section">色卡与特殊色</div>
            <label
              >色卡
              <select v-model="activeCard" class="ip-input" @change="schedulePreview">
                <option v-for="c in paletteStore.cardList" :key="c.name" :value="c.name">
                  {{ c.name }}
                </option>
              </select>
            </label>
            <label class="ip-check"
              ><input type="checkbox" v-model="useSpecial" @change="schedulePreview" />
              使用特殊色号（珠光/温变/夜光等）</label
            >

            <div class="ip-section">输出信息</div>
            <p class="ip-info">输出尺寸：{{ outW }}×{{ outH }}</p>
            <p v-if="maxDim > 2048" class="ip-warn">⚠ 超过 2048 上限，将被截取</p>

            <div class="ip-actions">
              <button class="ip-btn ip-btn-primary" @click="apply()">应用到画布</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'
import { quantizeImage } from '@/ts/photoToPixel'

const canvasStore = useCanvasStore()
const paletteStore = usePaletteStore()
const projectStore = useProjectStore()

defineEmits<{ close: [] }>()

const sourceImage = ref<HTMLImageElement | null>(null)
const sourceCanvas = ref<HTMLCanvasElement | null>(null)
const pixelCanvas = ref<HTMLCanvasElement | null>(null)

const pixelRatio = ref(4)
const ditherMode = ref<'none' | 'floyd-steinberg' | 'blue-noise'>('floyd-steinberg')
const scale = ref(100)
const offsetX = ref(0)
const offsetY = ref(0)
const cropW = ref(0)
const cropH = ref(0)
const rotate = ref<0 | 90 | 180 | 270>(0)
const flipH = ref(false)
const flipV = ref(false)
const activeCard = ref(paletteStore.activeCard?.name ?? '')
const useSpecial = ref(false)

function rotatePreview() {
  rotate.value = ((rotate.value + 90) % 360) as 0 | 90 | 180 | 270
  schedulePreview()
}

function toggleFlip(direction: 'horizontal' | 'vertical') {
  if (direction === 'horizontal') flipH.value = !flipH.value
  else flipV.value = !flipV.value
  schedulePreview()
}

const maxDim = computed(() => Math.max(outW.value, outH.value))
const outW = ref(0)
const outH = ref(0)

let lastGrid: string[][] | null = null

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const img = new Image()
  img.onload = () => {
    sourceImage.value = img
    cropW.value = 0
    cropH.value = 0
    offsetX.value = 0
    offsetY.value = 0
    nextTick(() => renderPreview())
  }
  img.src = URL.createObjectURL(file)
}

function getEditedCanvas(): HTMLCanvasElement {
  const img = sourceImage.value!
  const scaledW = Math.round((img.width * scale.value) / 100)
  const scaledH = Math.round((img.height * scale.value) / 100)
  const cw = cropW.value || scaledW
  const ch = cropH.value || scaledH
  const needsSwap = rotate.value === 90 || rotate.value === 270
  const canvas = document.createElement('canvas')
  canvas.width = needsSwap ? ch : cw
  canvas.height = needsSwap ? cw : ch
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (rotate.value !== 0) ctx.rotate((rotate.value * Math.PI) / 180)
  if (flipH.value) ctx.scale(-1, 1)
  if (flipV.value) ctx.scale(1, -1)
  ctx.drawImage(img, offsetX.value, offsetY.value, cw, ch, -cw / 2, -ch / 2, cw, ch)
  ctx.restore()
  return canvas
}

function renderPreview() {
  const img = sourceImage.value
  if (!img) return
  const edited = getEditedCanvas()

  // 原图预览
  if (sourceCanvas.value) {
    const sc = sourceCanvas.value
    const maxP = 400
    const s = Math.min(maxP / edited.width, maxP / edited.height, 1)
    sc.width = edited.width * s
    sc.height = edited.height * s
    sc.getContext('2d')!.drawImage(edited, 0, 0, sc.width, sc.height)
  }

  // 像素化（直接传 edited canvas，内部会做降采样 + Float32Array 处理）
  const card = paletteStore.cardList.find((c) => c.name === activeCard.value)
  const palette: { hex: string; type: string }[] = card
    ? card.colors.map((c) => ({ hex: c.color1, type: c.type }))
    : paletteStore.colorEntries.map((c) => ({ hex: c.color1, type: c.type }))

  const result = quantizeImage(edited, {
    palette,
    useSpecial: useSpecial.value,
    ditherMode: ditherMode.value,
    pixelRatio: pixelRatio.value,
  })

  lastGrid = result.grid
  outW.value = result.width
  outH.value = result.height

  // 像素预览
  if (pixelCanvas.value) {
    const pc = pixelCanvas.value
    const cellSz = Math.max(1, Math.floor(200 / Math.max(result.width, result.height, 1)))
    pc.width = result.width * cellSz
    pc.height = result.height * cellSz
    const pctx = pc.getContext('2d')!
    const raw = document.createElement('canvas')
    raw.width = result.width
    raw.height = result.height
    const rawCtx = raw.getContext('2d')!
    const previewImage = rawCtx.createImageData(result.width, result.height)
    previewImage.data.set(result.pixels)
    rawCtx.putImageData(previewImage, 0, 0)
    pctx.imageSmoothingEnabled = false
    pctx.drawImage(raw, 0, 0, pc.width, pc.height)
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
function schedulePreview() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(renderPreview, 100)
}

function apply() {
  if (!lastGrid || lastGrid.length === 0) return
  const w = outW.value
  const h = outH.value
  const maxD = Math.max(w, h)

  // 上限检查
  if (maxD > 2048) {
    alert('输出尺寸超过 2048 上限，当前输出尺寸为 ' + w + '×' + h + '，请调整参数。')
    return
  }

  const card = paletteStore.cardList.find((c) => c.name === activeCard.value)
  if (card) paletteStore.loadCard(card)

  projectStore.projectName = '以图生图'

  if (maxD <= 64) {
    // 单画布
    canvasStore.newCanvas(w, h)
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const hex = lastGrid[r]![c]
        if (hex) canvasStore.setCellSilent(c, r, hex)
      }
    }
    canvasStore.flushComposite()
  } else {
    // Build all sub-canvases once from row slices. This avoids creating an
    // empty multi-million-cell group and then performing one reactive write
    // for every imported pixel.
    canvasStore.createCanvasGroupFromGrid('以图生图', lastGrid, 64)
  }
}
</script>

<style scoped>
.ip-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ip-dialog {
  background: #fff;
  border-radius: 12px;
  display: flex;
  width: 92vw;
  max-width: 1000px;
  height: 82vh;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  position: relative;
}
.ip-close {
  position: absolute;
  top: 10px;
  right: 14px;
  z-index: 5;
  border: none;
  background: none;
  font-size: 1.3rem;
  cursor: pointer;
  color: #999;
}
.ip-preview {
  flex: 1;
  background: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ip-dropzone {
  text-align: center;
  color: #888;
}
.ip-dropzone p {
  margin: 4px 0;
}
.ip-hint {
  font-size: 0.8rem;
}
.ip-file {
  margin-top: 8px;
}
.ip-preview-panes {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.ip-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ip-pane-label {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 4px;
}
.ip-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border: 1px solid #ddd;
  background: #fff;
}
.ip-canvas:last-child {
  image-rendering: pixelated;
}
.ip-pane + .ip-pane {
  border-top: 1px dashed #ccc;
  padding-top: 8px;
}

.ip-settings {
  width: 300px;
  padding: 20px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid #e5e7eb;
}
.ip-settings h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.ip-placeholder {
  color: #aaa;
  font-size: 0.85rem;
}
.ip-section {
  font-size: 0.75rem;
  color: #888;
  font-weight: 600;
  padding-top: 6px;
  border-top: 1px solid #e5e7eb;
}
.ip-input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 0.82rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.ip-input:focus {
  border-color: #6366f1;
}
.ip-input.small {
  width: 70px;
}
.ip-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ip-row label {
  font-size: 0.8rem;
  color: #555;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ip-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.ip-btn {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #f9fafb;
  cursor: pointer;
  font-size: 0.78rem;
}
.ip-btn:hover {
  background: #e8e8e8;
}
.ip-btn.active {
  background: #eef2ff;
  border-color: #6366f1;
  color: #6366f1;
}
.ip-btn-primary {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
  width: 100%;
  padding: 8px;
}
.ip-btn-primary:hover {
  background: #4f46e5;
}
.ip-check {
  font-size: 0.8rem;
  color: #555;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.ip-info {
  font-size: 0.85rem;
  color: #555;
  margin: 0;
}
.ip-warn {
  font-size: 0.8rem;
  color: #dc2626;
  margin: 0;
}
.ip-actions {
  margin-top: auto;
  padding-top: 8px;
}
</style>
