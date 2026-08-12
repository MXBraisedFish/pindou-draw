<template>
  <Teleport to="body">
    <div class="image-editor">
      <header class="editor-header">
        <button class="header-action cancel" @click="emit('close')">
          <span class="action-icon">x</span><span>取消</span>
        </button>
        <div class="editor-title">
          <strong>裁剪图片</strong>
          <span>{{ outputLayout }}</span>
        </div>
        <div class="header-actions">
          <button class="header-action" @click="resetEditor()">
            <span class="action-icon reset-icon">↺</span><span>重置</span>
          </button>
          <button class="header-action confirm" :disabled="applying" @click="apply()">
            <span class="action-icon">✓</span><span>{{ applying ? '处理中' : '确认' }}</span>
          </button>
        </div>
      </header>

      <main ref="stageRef" class="editor-stage">
        <canvas ref="editorCanvas" class="editor-canvas" @pointerdown="onPointerDown" @pointermove="onPointerMove"
          @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerLeave"
          @wheel.prevent="onWheel"></canvas>
        <div class="stage-hint">框内为有效区域 · 拖动图片定位 · 滚轮缩放 · 边缘自动吸附</div>
      </main>

      <footer class="editor-controls">
        <div class="option-row">
          <template v-if="activeTool === 'ratio'">
            <label class="option-field">
              <span>转换比例</span>
              <span class="ratio-prefix">1 :</span>
              <input v-model.number="pixelRatio" type="number" min="1" max="32" @change="normalizeRatio()" />
            </label>
            <span class="option-note">输出约 {{ outputSize.width }} x {{ outputSize.height }}</span>
          </template>

          <template v-else-if="activeTool === 'dither'">
            <button v-for="option in ditherOptions" :key="option.key" class="option-button"
              :class="{ active: ditherMode === option.key }" @click="setDither(option.key)">
              {{ option.label }}
            </button>
          </template>

          <template v-else-if="activeTool === 'transform'">
            <label class="option-field scale-field">
              <span>缩放</span>
              <input :value="scalePercent" type="number" min="1" max="200" @change="onScaleInput" />
              <span>%</span>
            </label>
            <button class="icon-button" title="逆时针旋转 90°" @click="rotateBy(-90)">↶</button>
            <button class="icon-button" title="顺时针旋转 90°" @click="rotateBy(90)">↷</button>
            <button class="icon-button flip-horizontal" :class="{ active: flipH }" title="水平翻转"
              @click="toggleFlip('horizontal')">
              ◁▷
            </button>
            <button class="icon-button" :class="{ active: flipV }" title="垂直翻转" @click="toggleFlip('vertical')">
              ▽<span class="flip-divider"></span>△
            </button>
          </template>

          <template v-else>
            <label class="option-field card-field">
              <span>使用色卡</span>
              <select v-model="activeCard" @change="schedulePreview()">
                <option v-for="card in paletteStore.cardList" :key="card.name" :value="card.name">
                  {{ card.name }}
                </option>
              </select>
            </label>
            <label class="special-toggle">
              <input v-model="useSpecial" type="checkbox" @change="schedulePreview()" />
              <span>使用特殊色</span>
              <small>珠光 / 温变 / 夜光等</small>
            </label>
          </template>
        </div>

        <nav class="tool-row">
          <button v-for="tool in tools" :key="tool.key" class="tool-button" :class="{ active: activeTool === tool.key }"
            @click="activeTool = tool.key">
            <span class="tool-icon" :class="`tool-icon-${tool.key}`">{{ tool.icon }}</span>
            <span>{{ tool.label }}</span>
          </button>
        </nav>
      </footer>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCanvasStore, clampInteger, rawPixelGrid } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'
import { quantizeImage } from '@/ts/photoToPixel'

type EditorTool = 'ratio' | 'dither' | 'transform' | 'palette'
type DitherMode = 'none' | 'floyd-steinberg' | 'blue-noise'
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
type DragMode = 'pan' | 'rotate' | 'divider' | ResizeHandle | null

interface Point {
  x: number
  y: number
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const props = defineProps<{ file: File }>()
const emit = defineEmits<{ close: [] }>()

const canvasStore = useCanvasStore()
const paletteStore = usePaletteStore()
const projectStore = useProjectStore()

const stageRef = ref<HTMLElement | null>(null)
const editorCanvas = ref<HTMLCanvasElement | null>(null)
const sourceImage = ref<HTMLImageElement | null>(null)
const activeTool = ref<EditorTool>('ratio')
const pixelRatio = ref(4)
const ditherMode = ref<DitherMode>('floyd-steinberg')
const scalePercent = ref(100)
const rotation = ref(0)
const flipH = ref(false)
const flipV = ref(false)
const activeCard = ref(paletteStore.activeCard?.name ?? '')
const useSpecial = ref(false)
const applying = ref(false)
const cropDimensions = ref({ width: 1, height: 1 })

const tools: { key: EditorTool; label: string; icon: string }[] = [
  { key: 'ratio', label: '转换比例', icon: '▦' },
  { key: 'dither', label: '抖动算法', icon: '◫' },
  { key: 'transform', label: '缩放与旋转', icon: '↻' },
  { key: 'palette', label: '色卡', icon: '◉' },
]

const ditherOptions: { key: DitherMode; label: string }[] = [
  { key: 'none', label: '无' },
  { key: 'floyd-steinberg', label: 'Floyd–Steinberg' },
  { key: 'blue-noise', label: '有序抖动' },
]

let viewportWidth = 1
let viewportHeight = 1
let deviceScale = 1
let baseImageScale = 1
let imagePanX = 0
let imagePanY = 0
let crop: CropRect = { x: 0, y: 0, width: 1, height: 1 }
let initialState: { crop: CropRect; baseScale: number } | null = null
let dragMode: DragMode = null
let pointerStart = { x: 0, y: 0 }
let dragCropStart: CropRect = { ...crop }
let dragPanStart = { x: 0, y: 0 }
let dragRotationStart = 0
let dragAngleStart = 0
let hoverMode: DragMode = null
let resizeObserver: ResizeObserver | null = null
let sourceUrl = ''
let renderPending = false
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewCanvas: HTMLCanvasElement | null = null
let previewPending = false
let dividerRatio = 0.5
let lastViewport = { width: 1, height: 1 }

const outputSize = computed(() => {
  const safeScale = clampInteger(scalePercent.value, 1, 200, 100)
  const safeRatio = clampInteger(pixelRatio.value, 1, 32, 4)
  const effectiveScale = Math.max(0.0001, baseImageScale * (safeScale / 100))
  return {
    width: Math.max(1, Math.floor(cropDimensions.value.width / effectiveScale / safeRatio)),
    height: Math.max(1, Math.floor(cropDimensions.value.height / effectiveScale / safeRatio)),
  }
})

const outputLayout = computed(() => {
  const { width, height } = outputSize.value
  if (Math.max(width, height) <= 64) return `画布 ${width} x ${height}`
  const columns = Math.ceil(width / 64)
  const rows = Math.ceil(height / 64)
  return `画布组 ${columns} x ${rows} · 每格 64² · 总尺寸 ${width} x ${height}`
})

function normalizeRatio(refreshPreview = true) {
  pixelRatio.value = clampInteger(pixelRatio.value, 1, 32, 4)
  if (refreshPreview) schedulePreview()
}

function setScale(nextScale: number) {
  const safeScale = Math.max(1, Math.min(200, nextScale))
  scalePercent.value = Math.round(safeScale * 10) / 10
  centerCropAndImage()
  invalidatePreview()
  render()
  schedulePreview()
}

function normalizeScale(center = true) {
  const safeScale = clampInteger(scalePercent.value, 1, 200, 100)
  if (center) setScale(safeScale)
  else scalePercent.value = safeScale
}

function onScaleInput(event: Event) {
  setScale(clampInteger((event.target as HTMLInputElement).value, 1, 200, 100))
}

function setDither(mode: DitherMode) {
  ditherMode.value = mode
  schedulePreview()
}

function centerCropAndImage() {
  const offsetX = viewportWidth / 2 - (crop.x + crop.width / 2)
  const offsetY = viewportHeight / 2 - (crop.y + crop.height / 2)
  crop.x += offsetX
  crop.y += offsetY
  imagePanX += offsetX
  imagePanY += offsetY
}

function loadImage() {
  sourceUrl = URL.createObjectURL(props.file)
  const image = new Image()
  image.onload = async () => {
    sourceImage.value = image
    await nextTick()
    resizeStage(true)
  }
  image.onerror = () => emit('close')
  image.src = sourceUrl
}

function resizeStage(reset = false) {
  const stage = stageRef.value
  const canvas = editorCanvas.value
  const image = sourceImage.value
  if (!stage || !canvas || !image) return

  const rect = stage.getBoundingClientRect()
  const previousViewport = { ...lastViewport }
  viewportWidth = Math.max(1, rect.width)
  viewportHeight = Math.max(1, rect.height)
  lastViewport = { width: viewportWidth, height: viewportHeight }
  deviceScale = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(viewportWidth * deviceScale)
  canvas.height = Math.round(viewportHeight * deviceScale)
  canvas.style.width = `${viewportWidth}px`
  canvas.style.height = `${viewportHeight}px`

  if (reset || !initialState) {
    const maxCropW = Math.max(160, viewportWidth - 160)
    const maxCropH = Math.max(160, viewportHeight - 100)
    const imageAspect = image.width / image.height
    let width = Math.min(maxCropW, maxCropH * imageAspect)
    let height = width / imageAspect
    if (height > maxCropH) {
      height = maxCropH
      width = height * imageAspect
    }
    crop = {
      x: (viewportWidth - width) / 2,
      y: (viewportHeight - height) / 2,
      width,
      height,
    }
    baseImageScale = Math.min(crop.width / image.width, crop.height / image.height)
    initialState = { crop: { ...crop }, baseScale: baseImageScale }
    imagePanX = 0
    imagePanY = 0
  } else {
    crop.x += (viewportWidth - previousViewport.width) / 2
    crop.y += (viewportHeight - previousViewport.height) / 2
    centerCropAndImage()
  }
  cropDimensions.value = { width: crop.width, height: crop.height }
  invalidatePreview()
  render()
  schedulePreview()
}

function resetEditor() {
  if (!initialState) return
  crop = { ...initialState.crop }
  baseImageScale = initialState.baseScale
  imagePanX = 0
  imagePanY = 0
  scalePercent.value = 100
  rotation.value = 0
  flipH.value = false
  flipV.value = false
  pixelRatio.value = 4
  ditherMode.value = 'floyd-steinberg'
  useSpecial.value = false
  dividerRatio = 0.5
  cropDimensions.value = { width: crop.width, height: crop.height }
  invalidatePreview()
  render()
  schedulePreview()
}

function imageCenter() {
  return { x: viewportWidth / 2 + imagePanX, y: viewportHeight / 2 + imagePanY }
}

function drawImage(ctx: CanvasRenderingContext2D, alpha = 1) {
  const image = sourceImage.value
  if (!image) return
  const center = imageCenter()
  const scale = baseImageScale * (scalePercent.value / 100)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(center.x, center.y)
  ctx.rotate((rotation.value * Math.PI) / 180)
  ctx.scale((flipH.value ? -1 : 1) * scale, (flipV.value ? -1 : 1) * scale)
  ctx.drawImage(image, -image.width / 2, -image.height / 2)
  ctx.restore()
}

function drawRenderedPreview(ctx: CanvasRenderingContext2D) {
  if (!previewCanvas) return
  const dividerX = crop.x + crop.width * dividerRatio
  ctx.save()
  ctx.beginPath()
  ctx.rect(dividerX, crop.y, crop.x + crop.width - dividerX, crop.height)
  ctx.clip()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(previewCanvas, crop.x, crop.y, crop.width, crop.height)
  ctx.restore()
}

function renderNow() {
  renderPending = false
  const canvas = editorCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0)
  ctx.clearRect(0, 0, viewportWidth, viewportHeight)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, 0, viewportWidth, viewportHeight)
  drawImage(ctx, 0.28)

  ctx.save()
  ctx.beginPath()
  ctx.rect(crop.x, crop.y, crop.width, crop.height)
  ctx.clip()
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(crop.x, crop.y, crop.width, crop.height)
  drawImage(ctx)
  ctx.restore()
  drawRenderedPreview(ctx)
  drawCompareLabels(ctx)

  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 2
  ctx.strokeRect(crop.x, crop.y, crop.width, crop.height)
  drawCropHandles(ctx)
  drawDivider(ctx)
}

function render() {
  if (renderPending) return
  renderPending = true
  requestAnimationFrame(renderNow)
}

function drawCropHandles(ctx: CanvasRenderingContext2D) {
  const length = 20
  const line = 4
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = line
  const corners = [
    [crop.x, crop.y, 1, 1],
    [crop.x + crop.width, crop.y, -1, 1],
    [crop.x, crop.y + crop.height, 1, -1],
    [crop.x + crop.width, crop.y + crop.height, -1, -1],
  ] as const
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * length)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * length, y)
    ctx.stroke()
  }
}

function drawDivider(ctx: CanvasRenderingContext2D) {
  const x = crop.x + crop.width * dividerRatio
  ctx.save()
  ctx.strokeStyle = '#6366f1'
  ctx.fillStyle = '#6366f1'
  ctx.lineCap = 'round'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, crop.y - 2)
  ctx.lineTo(x, crop.y + crop.height)
  ctx.stroke()
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(x, crop.y - 28)
  ctx.lineTo(x, crop.y - 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, crop.y - 30, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawCompareLabels(ctx: CanvasRenderingContext2D) {
  if (crop.width < 150 || crop.height < 60) return
  const drawLabel = (text: string, x: number, align: CanvasTextAlign) => {
    ctx.save()
    ctx.font = '12px sans-serif'
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    const width = ctx.measureText(text).width + 16
    const left = align === 'left' ? x : x - width
    ctx.fillStyle = 'rgba(17, 24, 39, 0.68)'
    ctx.fillRect(left, crop.y + 10, width, 25)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, x + (align === 'left' ? 8 : -8), crop.y + 22.5)
    ctx.restore()
  }
  drawLabel('原图', crop.x + 10, 'left')
  drawLabel(previewPending ? '渲染中…' : '渲染图', crop.x + crop.width - 10, 'right')
}

function canvasPoint(event: PointerEvent | WheelEvent) {
  const rect = editorCanvas.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function detectMode(x: number, y: number): DragMode {
  const threshold = 11
  const dividerX = crop.x + crop.width * dividerRatio
  if (Math.abs(x - dividerX) <= 12 && y >= crop.y - 44 && y <= crop.y + crop.height) {
    return 'divider'
  }
  const outsideCrop =
    x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height
  const corners: { mode: ResizeHandle; x: number; y: number }[] = [
    { mode: 'nw', x: crop.x, y: crop.y },
    { mode: 'ne', x: crop.x + crop.width, y: crop.y },
    { mode: 'sw', x: crop.x, y: crop.y + crop.height },
    { mode: 'se', x: crop.x + crop.width, y: crop.y + crop.height },
  ]
  for (const corner of corners) {
    const distance = Math.hypot(x - corner.x, y - corner.y)
    if (distance <= threshold + 3) return corner.mode
    if (outsideCrop && distance >= 20 && distance <= 42) return 'rotate'
  }
  const withinX = x >= crop.x - threshold && x <= crop.x + crop.width + threshold
  const withinY = y >= crop.y - threshold && y <= crop.y + crop.height + threshold
  if (withinX && Math.abs(y - crop.y) <= threshold) return 'n'
  if (withinX && Math.abs(y - crop.y - crop.height) <= threshold) return 's'
  if (withinY && Math.abs(x - crop.x) <= threshold) return 'w'
  if (withinY && Math.abs(x - crop.x - crop.width) <= threshold) return 'e'
  if (x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height) {
    return 'pan'
  }
  return null
}

function cursorFor(mode: DragMode) {
  if (mode === 'pan') return dragMode === 'pan' ? 'grabbing' : 'grab'
  if (mode === 'divider') return 'col-resize'
  if (mode === 'rotate') return 'crosshair'
  if (mode === 'n' || mode === 's') return 'ns-resize'
  if (mode === 'e' || mode === 'w') return 'ew-resize'
  if (mode === 'nw' || mode === 'se') return 'nwse-resize'
  if (mode === 'ne' || mode === 'sw') return 'nesw-resize'
  return 'default'
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !editorCanvas.value) return
  const point = canvasPoint(event)
  dragMode = detectMode(point.x, point.y)
  if (!dragMode) return
  pointerStart = point
  dragCropStart = { ...crop }
  dragPanStart = { x: imagePanX, y: imagePanY }
  dragRotationStart = rotation.value
  const center = imageCenter()
  dragAngleStart = Math.atan2(point.y - center.y, point.x - center.x)
  editorCanvas.value.setPointerCapture(event.pointerId)
  editorCanvas.value.style.cursor = cursorFor(dragMode)
}

function resizeCrop(mode: ResizeHandle, dx: number, dy: number) {
  const minSize = 64
  const padding = 12
  let left = dragCropStart.x
  let top = dragCropStart.y
  let right = dragCropStart.x + dragCropStart.width
  let bottom = dragCropStart.y + dragCropStart.height
  if (mode.includes('w')) left = Math.min(right - minSize, Math.max(padding, left + dx))
  if (mode.includes('e'))
    right = Math.max(left + minSize, Math.min(viewportWidth - padding, right + dx))
  if (mode.includes('n')) top = Math.min(bottom - minSize, Math.max(padding, top + dy))
  if (mode.includes('s'))
    bottom = Math.max(top + minSize, Math.min(viewportHeight - padding, bottom + dy))
  const snapped = snapCropToImage(
    mode,
    { x: pointerStart.x + dx, y: pointerStart.y + dy },
    { left, top, right, bottom },
  )
  left = snapped.left
  top = snapped.top
  right = snapped.right
  bottom = snapped.bottom
  if (right - left < minSize) {
    if (mode.includes('w')) left = right - minSize
    else right = left + minSize
  }
  if (bottom - top < minSize) {
    if (mode.includes('n')) top = bottom - minSize
    else bottom = top + minSize
  }
  crop = { x: left, y: top, width: right - left, height: bottom - top }
  cropDimensions.value = { width: crop.width, height: crop.height }
  invalidatePreview()
}

function transformedImageCorners(): Point[] {
  const image = sourceImage.value
  if (!image) return []
  const center = imageCenter()
  const scale = baseImageScale * (scalePercent.value / 100)
  const radians = (rotation.value * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const sx = (flipH.value ? -1 : 1) * scale
  const sy = (flipV.value ? -1 : 1) * scale
  return [
    { x: -image.width / 2, y: -image.height / 2 },
    { x: image.width / 2, y: -image.height / 2 },
    { x: image.width / 2, y: image.height / 2 },
    { x: -image.width / 2, y: image.height / 2 },
  ].map((point) => {
    const x = point.x * sx
    const y = point.y * sy
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos }
  })
}

function polygonIntersections(axis: 'x' | 'y', value: number, polygon: Point[]): number[] {
  const results: number[] = []
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]!
    const end = polygon[(index + 1) % polygon.length]!
    const startAxis = axis === 'x' ? start.x : start.y
    const endAxis = axis === 'x' ? end.x : end.y
    if (value < Math.min(startAxis, endAxis) || value > Math.max(startAxis, endAxis)) continue
    const span = endAxis - startAxis
    if (Math.abs(span) < 0.001) continue
    const ratio = (value - startAxis) / span
    results.push(
      axis === 'x' ? start.y + (end.y - start.y) * ratio : start.x + (end.x - start.x) * ratio,
    )
  }
  return results
}

function closestSnap(value: number, candidates: number[], threshold = 14) {
  let result = value
  let distance = threshold
  for (const candidate of candidates) {
    const nextDistance = Math.abs(candidate - value)
    if (nextDistance < distance) {
      result = candidate
      distance = nextDistance
    }
  }
  return result
}

function snapCropToImage(
  mode: ResizeHandle,
  pointer: Point,
  edges: { left: number; top: number; right: number; bottom: number },
) {
  const corners = transformedImageCorners()
  if (corners.length === 0) return edges
  const result = { ...edges }
  const horizontalIntersections = polygonIntersections('y', pointer.y, corners)
  const verticalIntersections = polygonIntersections('x', pointer.x, corners)

  if (mode.includes('n')) result.top = closestSnap(result.top, verticalIntersections)
  if (mode.includes('s')) result.bottom = closestSnap(result.bottom, verticalIntersections)
  if (mode.includes('w')) result.left = closestSnap(result.left, horizontalIntersections)
  if (mode.includes('e')) result.right = closestSnap(result.right, horizontalIntersections)

  if (mode.length === 2) {
    const cornerX = mode.includes('w') ? result.left : result.right
    const cornerY = mode.includes('n') ? result.top : result.bottom
    const vertex = corners.reduce((nearest, candidate) =>
      Math.hypot(candidate.x - cornerX, candidate.y - cornerY) <
        Math.hypot(nearest.x - cornerX, nearest.y - cornerY)
        ? candidate
        : nearest,
    )
    if (Math.hypot(vertex.x - cornerX, vertex.y - cornerY) <= 20) {
      if (mode.includes('w')) result.left = vertex.x
      else result.right = vertex.x
      if (mode.includes('n')) result.top = vertex.y
      else result.bottom = vertex.y
    }
  }
  return result
}

function onPointerMove(event: PointerEvent) {
  if (!editorCanvas.value) return
  const point = canvasPoint(event)
  if (!dragMode) {
    hoverMode = detectMode(point.x, point.y)
    editorCanvas.value.style.cursor = cursorFor(hoverMode)
    return
  }

  const dx = point.x - pointerStart.x
  const dy = point.y - pointerStart.y
  if (dragMode === 'pan') {
    imagePanX = dragPanStart.x + dx
    imagePanY = dragPanStart.y + dy
    invalidatePreview()
  } else if (dragMode === 'divider') {
    dividerRatio = Math.max(0, Math.min(1, (point.x - crop.x) / crop.width))
  } else if (dragMode === 'rotate') {
    const center = imageCenter()
    const angle = Math.atan2(point.y - center.y, point.x - center.x)
    rotation.value = dragRotationStart + ((angle - dragAngleStart) * 180) / Math.PI
    invalidatePreview()
  } else {
    resizeCrop(dragMode, dx, dy)
  }
  render()
}

function onPointerUp(event: PointerEvent) {
  if (editorCanvas.value?.hasPointerCapture(event.pointerId)) {
    editorCanvas.value.releasePointerCapture(event.pointerId)
  }
  const completedMode = dragMode
  dragMode = null
  if (completedMode !== 'divider') schedulePreview()
  if (editorCanvas.value) editorCanvas.value.style.cursor = cursorFor(hoverMode)
}

function onPointerLeave() {
  if (!dragMode && editorCanvas.value) editorCanvas.value.style.cursor = 'default'
}

function onWheel(event: WheelEvent) {
  const oldScale = scalePercent.value
  const factor = Math.exp(-event.deltaY * 0.0015)
  const nextScale = Math.max(1, Math.min(200, oldScale * factor))
  setScale(nextScale)
}

function rotateBy(degrees: number) {
  rotation.value = (rotation.value + degrees) % 360
  invalidatePreview()
  render()
  schedulePreview()
}

function toggleFlip(axis: 'horizontal' | 'vertical') {
  if (axis === 'horizontal') flipH.value = !flipH.value
  else flipV.value = !flipV.value
  invalidatePreview()
  render()
  schedulePreview()
}

function createCroppedCanvas(width: number, height: number): HTMLCanvasElement {
  const image = sourceImage.value!
  const effectiveScale = Math.max(0.0001, baseImageScale * (scalePercent.value / 100))
  const result = document.createElement('canvas')
  result.width = width
  result.height = height
  const ctx = result.getContext('2d')!
  const cropCenter = { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }
  const center = imageCenter()
  const viewportScaleX = width / crop.width
  const viewportScaleY = height / crop.height
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.translate(
    width / 2 + (center.x - cropCenter.x) * viewportScaleX,
    height / 2 + (center.y - cropCenter.y) * viewportScaleY,
  )
  ctx.rotate((rotation.value * Math.PI) / 180)
  ctx.scale(
    (flipH.value ? -1 : 1) * effectiveScale * viewportScaleX,
    (flipV.value ? -1 : 1) * effectiveScale * viewportScaleY,
  )
  ctx.drawImage(image, -image.width / 2, -image.height / 2)
  return result
}

function activePalette() {
  const card = paletteStore.cardList.find((item) => item.name === activeCard.value)
  return {
    card,
    colors: card?.colors ?? paletteStore.colorEntries,
  }
}

function invalidatePreview() {
  previewCanvas = null
  previewPending = true
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
}

function schedulePreview() {
  invalidatePreview()
  if (!sourceImage.value) return
  render()
  previewTimer = setTimeout(() => {
    previewTimer = null
    buildPreview()
  }, 140)
}

function buildPreview() {
  if (!sourceImage.value) return
  const { width, height } = outputSize.value
  const previewScale = Math.min(1, 384 / Math.max(width, height))
  const previewWidth = Math.max(1, Math.round(width * previewScale))
  const previewHeight = Math.max(1, Math.round(height * previewScale))
  const edited = createCroppedCanvas(previewWidth, previewHeight)
  const { colors } = activePalette()
  const result = quantizeImage(edited, {
    palette: colors.map((color) => ({ hex: color.color1, type: color.type })),
    useSpecial: useSpecial.value,
    ditherMode: ditherMode.value,
    pixelRatio: 1,
  })
  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = result.width
  resultCanvas.height = result.height
  const context = resultCanvas.getContext('2d')
  if (!context) return
  const imageData = context.createImageData(result.width, result.height)
  imageData.data.set(result.pixels)
  context.putImageData(imageData, 0, 0)
  previewCanvas = resultCanvas
  previewPending = false
  render()
}

async function apply() {
  if (!sourceImage.value || applying.value) return
  normalizeRatio(false)
  normalizeScale(false)
  const { width: resultWidth, height: resultHeight } = outputSize.value
  if (Math.max(resultWidth, resultHeight) > 2048) {
    alert(`输出尺寸为 ${resultWidth}x${resultHeight}，超过 2048 上限，请提高转换比例。`)
    return
  }
  const edited = createCroppedCanvas(resultWidth, resultHeight)

  applying.value = true
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  try {
    const { card, colors } = activePalette()
    const result = quantizeImage(edited, {
      palette: colors.map((color) => ({ hex: color.color1, type: color.type })),
      useSpecial: useSpecial.value,
      ditherMode: ditherMode.value,
      pixelRatio: 1,
    })
    if (card) paletteStore.loadCard(card)
    projectStore.projectName = props.file.name.replace(/\.[^.]+$/, '') || '以图生图'
    if (Math.max(result.width, result.height) <= 64) {
      canvasStore.newCanvas(result.width, result.height)
      const layer = canvasStore.activeLayer()
      if (layer) layer.grid = rawPixelGrid(result.grid)
      canvasStore.flushComposite()
    } else {
      canvasStore.createCanvasGroupFromGrid(projectStore.projectName, result.grid, 64)
    }
    emit('close')
  } finally {
    applying.value = false
  }
}

onMounted(() => {
  loadImage()
  resizeObserver = new ResizeObserver(() => resizeStage(false))
  if (stageRef.value) resizeObserver.observe(stageRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (previewTimer) clearTimeout(previewTimer)
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
})
</script>

<style scoped>
.image-editor {
  position: fixed;
  inset: 0;
  z-index: 30000;
  display: grid;
  grid-template-rows: 64px minmax(0, 1fr) 176px;
  background: #f8fafc;
  color: #111827;
}

.editor-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.96);
}

.editor-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 0.95rem;
}

.editor-title strong {
  font-weight: 600;
}

.editor-title span {
  color: #6b7280;
  font-size: 0.7rem;
  font-weight: 400;
}

.header-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.header-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  cursor: pointer;
}

.header-action.cancel {
  justify-self: start;
}

.header-action.confirm {
  background: #6366f1;
  color: #fff;
}

.header-action:disabled {
  opacity: 0.55;
  cursor: wait;
}

.action-icon {
  font-size: 1.35rem;
  line-height: 1;
}

.reset-icon {
  font-size: 1.2rem;
}

.editor-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #e5e7eb;
}

.editor-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.stage-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.66);
  color: #fff;
  font-size: 0.72rem;
  pointer-events: none;
}

.editor-controls {
  display: grid;
  grid-template-rows: 76px 100px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 24px;
  border-bottom: 1px solid #eef0f3;
}

.option-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #4b5563;
  font-size: 0.86rem;
}

.option-field input,
.option-field select {
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  padding: 0 10px;
  outline: none;
}

.option-field input {
  width: 72px;
}

.option-field select {
  min-width: 220px;
}

.option-field input:focus,
.option-field select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

.ratio-prefix {
  margin-right: -5px;
  color: #111827;
  font-weight: 600;
}

.option-note {
  color: #9ca3af;
  font-size: 0.75rem;
}

.special-toggle {
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 7px;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.82rem;
}

.special-toggle input {
  grid-row: 1 / 3;
  width: 16px;
  height: 16px;
  accent-color: #6366f1;
}

.special-toggle small {
  color: #9ca3af;
  font-size: 0.66rem;
}

.option-button,
.icon-button {
  height: 38px;
  border: 1px solid #d1d5db;
  border-radius: 9px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
}

.option-button {
  min-width: 128px;
  padding: 0 18px;
}

.icon-button {
  position: relative;
  min-width: 46px;
  padding: 0 11px;
  font-size: 1.25rem;
}

.option-button.active,
.icon-button.active {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4f46e5;
}

.flip-horizontal {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: -2px;
}

.flip-divider {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 50%;
  border-top: 1px solid currentColor;
}

.tool-row {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  padding: 10px 20px 14px;
}

.tool-button {
  display: flex;
  min-width: 132px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 14px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 0.76rem;
  cursor: pointer;
}

.tool-button.active {
  background: #6366f1;
  color: #fff;
}

.tool-icon {
  font-size: 1.45rem;
  line-height: 1;
}

@media (max-height: 720px) {
  .image-editor {
    grid-template-rows: 54px minmax(0, 1fr) 148px;
  }

  .editor-controls {
    grid-template-rows: 64px 84px;
  }

  .tool-row {
    padding-block: 7px 10px;
  }
}
</style>
