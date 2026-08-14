<template>
  <Teleport to="body">
    <div class="export-page">
      <header class="export-header">
        <button class="header-button" @click="closePage()">
          <img :src="iconBack" alt="" />返回编辑
        </button>
        <div class="header-title">
          <strong>导出</strong>
          <span class="work-badge">{{ isGroup ? '画布组' : '独立画布' }}</span>
          <small>{{ sourceSummary }}</small>
        </div>
        <button class="export-button" :disabled="exporting" @click="doExport()">
          {{ exporting ? '正在生成…' : exportActionLabel }}
        </button>
      </header>

      <div class="export-layout">
        <section class="preview-panel">
          <div class="preview-toolbar">
            <div class="preview-title">
              <strong>导出预览</strong>
              <span v-if="isGroup && exportStore.groupExportMode === 'separate'">
                当前展示 ({{ exportStore.groupPreviewCol + 1 }},{{
                  exportStore.groupPreviewRow + 1
                }})，导出时将生成全部子画布
              </span>
            </div>
            <div class="zoom-controls">
              <button title="缩小" @click="zoomOut()">−</button>
              <span>{{ Math.round(zoom * 100) }}%</span>
              <button title="放大" @click="zoomIn()">＋</button>
              <button @click="fitZoom()">适应</button>
            </div>
          </div>
          <div
            ref="wrapRef"
            class="preview-viewport"
            @wheel.prevent="onWheel"
            @pointerdown="onPanStart"
            @pointermove="onPanMove"
            @pointerup="onPanEnd"
            @pointercancel="onPanEnd"
            @pointerleave="onPanEnd"
          >
            <canvas ref="previewCanvas" class="preview-canvas" :style="previewCanvasStyle"></canvas>
            <div v-if="!exportStore.previewDataUrl" class="preview-empty">
              {{ exportStore.previewError || '正在生成预览…' }}
            </div>
          </div>
        </section>

        <aside class="settings-panel">
          <div class="settings-heading">
            <div>
              <strong>导出设置</strong>
              <span>选项会根据导出内容自动显示</span>
            </div>
          </div>

          <details open class="setting-group">
            <summary>
              <span class="summary-icon"><img :src="iconOutput" alt="" /></span>输出
            </summary>
            <div class="group-body">
              <label class="field">
                <span>文件名称</span>
                <input v-model="exportStore.exportName" class="input-control" />
              </label>
              <label class="field">
                <span>文件格式</span>
                <select v-model="exportStore.exportFormat" class="input-control">
                  <option value="png">PNG 图片</option>
                  <option value="jpg">JPG 图片</option>
                  <option value="pindou">工程文件 (.pindou.json)</option>
                </select>
              </label>

              <div v-if="isGroup && exportStore.exportFormat !== 'pindou'" class="choice-block">
                <span class="field-label">画布组导出方式</span>
                <div class="choice-cards">
                  <button
                    :class="{ active: exportStore.groupExportMode === 'separate' }"
                    @click="exportStore.groupExportMode = 'separate'"
                  >
                    <strong class="choice-title"
                      ><img :src="iconSeparateExport" alt="" />单独导出</strong
                    >
                    <span>{{ groupCount }} 个子画布分别生成</span>
                  </button>
                  <button
                    :class="{ active: exportStore.groupExportMode === 'combined' }"
                    @click="exportStore.groupExportMode = 'combined'"
                  >
                    <strong class="choice-title"
                      ><img :src="iconCombinedExport" alt="" />拼合导出</strong
                    >
                    <span>拼成 {{ combinedSize }}</span>
                  </button>
                </div>
              </div>

              <div
                v-if="
                  isGroup &&
                  exportStore.exportFormat !== 'pindou' &&
                  exportStore.groupExportMode === 'separate'
                "
                class="separate-options"
              >
                <div class="choice-block">
                  <span class="field-label">下载方式</span>
                  <div class="choice-cards download-cards">
                    <button
                      :class="{ active: exportStore.groupSeparateDownloadMode === 'zip' }"
                      @click="exportStore.groupSeparateDownloadMode = 'zip'"
                    >
                      <strong class="choice-title"><img :src="iconZip" alt="" />压缩包</strong>
                      <span>全部子画布打包为一个 ZIP（推荐）</span>
                    </button>
                    <button
                      :class="{ active: exportStore.groupSeparateDownloadMode === 'files' }"
                      @click="exportStore.groupSeparateDownloadMode = 'files'"
                    >
                      <strong class="choice-title"
                        ><img :src="iconIndividual" alt="" />逐张下载</strong
                      >
                      <span>浏览器依次下载 {{ groupCount }} 张图片</span>
                    </button>
                  </div>
                </div>

                <div class="choice-block">
                  <span class="field-label">选择预览子画布</span>
                  <div class="group-preview-picker-wrap">
                    <div class="group-preview-picker" :style="groupPickerStyle">
                      <button class="picker-corner" aria-hidden="true"></button>
                      <span
                        v-for="col in groupPickerCols"
                        :key="`col-${col}`"
                        class="picker-axis picker-col-axis"
                      >
                        {{ col }}
                      </span>
                      <template v-for="row in groupPickerRows" :key="`row-${row}`">
                        <span class="picker-axis picker-row-axis">{{ row }}</span>
                        <button
                          v-for="col in groupPickerCols"
                          :key="`${row}-${col}`"
                          class="picker-cell"
                          :class="{
                            active:
                              exportStore.groupPreviewRow === row - 1 &&
                              exportStore.groupPreviewCol === col - 1,
                            filled: groupCellHasPixels(row - 1, col - 1),
                          }"
                          :title="`预览子画布 (${col},${row})`"
                          @click="selectGroupPreview(row - 1, col - 1)"
                        >
                          <canvas
                            :ref="
                              (element) =>
                                setGroupThumbRef(row - 1, col - 1, element as HTMLCanvasElement)
                            "
                            class="picker-thumb"
                          ></canvas>
                          <span>{{ col }},{{ row }}</span>
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="exportStore.exportFormat !== 'pindou'" class="choice-block">
                <span class="field-label">导出内容</span>
                <div class="segmented three">
                  <button
                    :class="{ active: exportStore.exportContent === 'full' }"
                    @click="exportStore.exportContent = 'full'"
                  >
                    全部
                  </button>
                  <button
                    :class="{ active: exportStore.exportContent === 'sketch-only' }"
                    @click="exportStore.exportContent = 'sketch-only'"
                  >
                    仅草图
                  </button>
                  <button
                    :class="{ active: exportStore.exportContent === 'stats-only' }"
                    @click="exportStore.exportContent = 'stats-only'"
                  >
                    仅色号卡
                  </button>
                </div>
              </div>

              <div v-if="exportStore.exportFormat !== 'pindou'" class="resolution-note">
                <strong>1 格 = 50px</strong>
                <span>最终图片按固定格宽原尺寸生成，不随画布增大而压缩</span>
              </div>

              <div v-if="exportStore.exportLayerId" class="layer-banner">
                <span>仅导出图层：{{ layerName }}</span>
                <button @click="clearLayerExport()">恢复全部</button>
              </div>
            </div>
          </details>

          <template v-if="exportStore.exportFormat !== 'pindou'">
            <details v-if="exportStore.exportContent !== 'stats-only'" open class="setting-group">
              <summary>
                <span class="summary-icon"><img :src="iconSketchAppearance" alt="" /></span>草图外观
              </summary>
              <div class="group-body">
                <div class="inline-field">
                  <span>像素形状</span>
                  <div class="segmented">
                    <button
                      :class="{ active: exportStore.pixelShape === 'square' }"
                      @click="exportStore.pixelShape = 'square'"
                    >
                      ■ 方形
                    </button>
                    <button
                      :class="{ active: exportStore.pixelShape === 'circle' }"
                      @click="exportStore.pixelShape = 'circle'"
                    >
                      ● 圆形
                    </button>
                  </div>
                </div>
                <label class="field">
                  <span>渲染模式</span>
                  <select v-model="exportStore.exportRenderMode" class="input-control">
                    <option value="day">白天</option>
                    <option value="night">夜晚</option>
                    <option value="thermo">温变</option>
                    <option value="photo">光变</option>
                    <option value="thermo-photo">温变 + 光变</option>
                  </select>
                </label>
                <label class="field">
                  <span>字体</span>
                  <select v-model="exportStore.exportFont" class="input-control">
                    <option value="pixel">MinecraftTen</option>
                    <option value="pixelfont">PixelFont</option>
                    <option value="default">系统默认字体</option>
                  </select>
                </label>
                <div class="inline-field">
                  <span>草图背景</span>
                  <ColorPickerRow v-model="exportStore.sketchBg" />
                </div>
                <label class="check-row">
                  <input v-model="exportStore.showColorIds" type="checkbox" />
                  <span>在像素内显示色号</span>
                </label>
                <label v-if="exportStore.exportHighlightActive" class="check-row sub-check">
                  <input v-model="exportStore.showColorIdsHighlightOnly" type="checkbox" />
                  <span>仅高亮颜色显示色号</span>
                </label>
              </div>
            </details>

            <details v-if="exportStore.exportContent !== 'stats-only'" class="setting-group">
              <summary>
                <span class="summary-icon"><img :src="iconGridCoords" alt="" /></span>网格与坐标
              </summary>
              <div class="group-body">
                <label class="check-row">
                  <input v-model="exportStore.showGrid" type="checkbox" />
                  <span>显示网格</span>
                </label>
                <template v-if="exportStore.showGrid">
                  <RangeField
                    v-model="exportStore.gridThickness"
                    label="网格粗细"
                    :min="1"
                    :max="3"
                  />
                  <RangeField
                    v-model="exportStore.gridOpacity"
                    label="网格透明度"
                    :min="0"
                    :max="90"
                    suffix="%"
                  />
                  <ThickLineSettings
                    v-model:enabled="hlEnabled"
                    v-model:interval="hlInterval"
                    v-model:thickness="hlThick"
                    v-model:start="hStartPos"
                    label="水平加粗线"
                  />
                  <ThickLineSettings
                    v-model:enabled="vlEnabled"
                    v-model:interval="vlInterval"
                    v-model:thickness="vlThick"
                    v-model:start="vStartPos"
                    label="垂直加粗线"
                  />
                </template>
                <label class="field">
                  <span>坐标显示</span>
                  <select v-model="exportStore.coordDisplay" class="input-control">
                    <option value="none">不显示</option>
                    <option value="single">单侧坐标</option>
                    <option value="dual">双侧坐标</option>
                  </select>
                </label>
                <label v-if="exportStore.coordDisplay !== 'none'" class="field">
                  <span>坐标轴样式</span>
                  <select v-model="exportStore.coordAxisStyle" class="input-control">
                    <option value="direct">直接标注</option>
                    <option value="cell">方格坐标轴</option>
                  </select>
                </label>
              </div>
            </details>

            <details v-if="exportStore.exportContent !== 'sketch-only'" open class="setting-group">
              <summary>
                <span class="summary-icon"><img :src="iconColorStats" alt="" /></span>色号卡与统计
              </summary>
              <div class="group-body">
                <label class="field">
                  <span>色卡布局</span>
                  <select v-model="exportStore.tableLayout" class="input-control">
                    <option value="block">标块布局</option>
                    <option value="table">表格布局</option>
                    <option value="compact">紧凑小标块</option>
                  </select>
                </label>
                <div class="inline-field">
                  <span>页面背景</span>
                  <ColorPickerRow v-model="exportStore.pageBg" />
                </div>
                <div class="stats-summary">
                  <span
                    >使用色号 <strong>{{ exportStore.colorStats.length }}</strong> 种</span
                  >
                  <span
                    >拼豆总数 <strong>{{ exportStore.totalPixelCount }}</strong> 颗</span
                  >
                </div>
              </div>
            </details>

            <details v-if="exportStore.exportContent !== 'stats-only'" class="setting-group">
              <summary>
                <span class="summary-icon"><img :src="iconHighlightExport" alt="" /></span>高亮导出
              </summary>
              <div class="group-body">
                <label class="check-row">
                  <input v-model="exportStore.exportHighlightActive" type="checkbox" />
                  <span>启用高亮效果</span>
                </label>
                <template v-if="exportStore.exportHighlightActive">
                  <button class="secondary-button" @click="showHighlightModal = true">
                    选择高亮颜色（{{ exportStore.exportHighlightedColorIds.size }} 色）
                  </button>
                  <label class="check-row">
                    <input v-model="exportStore.exportHighlightOnly" type="checkbox" />
                    <span>仅渲染高亮像素</span>
                  </label>
                  <label class="field">
                    <span>标记序号</span>
                    <select v-model="exportStore.exportHighlightNumberMode" class="input-control">
                      <option value="off">关闭</option>
                      <option value="row">按行</option>
                      <option value="col">按列</option>
                      <option value="global">全局顺序</option>
                    </select>
                  </label>
                  <button
                    class="secondary-button warm"
                    :disabled="batchExporting"
                    @click="doBatchHighlight()"
                  >
                    {{ batchExporting ? '正在打包…' : '按高亮颜色批量导出 ZIP' }}
                  </button>
                </template>
              </div>
            </details>
          </template>
        </aside>
      </div>
    </div>

    <ExportHighlightModal v-if="showHighlightModal" @close="showHighlightModal = false" />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useExportStore } from '@/stores/exportStore'
import { useCanvasStore } from '@/stores/canvas'
import ExportHighlightModal from '@/components/ExportHighlightModal.vue'
import { useDevice } from '@/composables/useDevice'
import iconBack from '@/assets/icon/退出返回.png'
import iconOutput from '@/assets/icon/输出.png'
import iconSketchAppearance from '@/assets/icon/草图外观.png'
import iconGridCoords from '@/assets/icon/网格与坐标.png'
import iconColorStats from '@/assets/icon/色号卡与统计.png'
import iconHighlightExport from '@/assets/icon/高亮导出.png'
import iconSeparateExport from '@/assets/icon/单独导出.png'
import iconCombinedExport from '@/assets/icon/拼合导出.png'
import iconZip from '@/assets/icon/压缩包.png'
import iconIndividual from '@/assets/icon/逐张.png'

const emit = defineEmits<{ close: [] }>()
const exportStore = useExportStore()
const canvasStore = useCanvasStore()
const { device } = useDevice()
const wrapRef = ref<HTMLElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const previewCanvasStyle = ref<Record<string, string>>({})
const showHighlightModal = ref(false)
const batchExporting = ref(false)
const exporting = ref(false)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const hlEnabled = ref(false)
const hlInterval = ref(5)
const hlThick = ref(1)
const vlEnabled = ref(false)
const vlInterval = ref(5)
const vlThick = ref(1)
const hStartPos = ref<'center' | 'start' | 'end'>('center')
const vStartPos = ref<'center' | 'start' | 'end'>('center')
let isPanning = false
let panStart = { x: 0, y: 0, panX: 0, panY: 0 }
const previewPointers = new Map<number, { x: number; y: number }>()
let previewPinchStart: {
  distance: number
  centerX: number
  centerY: number
  zoom: number
  panX: number
  panY: number
} | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const isGroup = computed(() => Boolean(canvasStore.canvasGroup && !exportStore.exportLayerId))
const groupCount = computed(() => {
  const group = canvasStore.canvasGroup
  return group ? group.groupCols * group.groupRows : 1
})
const combinedSize = computed(() => {
  const group = canvasStore.canvasGroup
  return group ? `${group.groupCols * group.subSize} x ${group.groupRows * group.subSize}` : ''
})
const groupPickerCols = computed(() => canvasStore.canvasGroup?.groupCols ?? 0)
const groupPickerRows = computed(() => canvasStore.canvasGroup?.groupRows ?? 0)
const groupPickerStyle = computed(() => ({
  gridTemplateColumns: `24px repeat(${groupPickerCols.value}, minmax(42px, 1fr))`,
}))
const filledGroupCells = computed(() => {
  void canvasStore.groupVersion
  void canvasStore.gridVersion
  void exportStore.previewDataUrl
  const filled = new Set<string>()
  const group = canvasStore.canvasGroup
  if (!group) return filled
  for (let row = 0; row < group.groupRows; row++) {
    for (let col = 0; col < group.groupCols; col++) {
      const snapshot = group.canvases[row]?.[col]
      if (
        snapshot?.layers.some(
          (layer) => layer.visible && layer.grid.some((line) => line.some(Boolean)),
        )
      ) {
        filled.add(`${row},${col}`)
      }
    }
  }
  return filled
})
const sourceSummary = computed(() => {
  const group = canvasStore.canvasGroup
  if (!group) return `${canvasStore.cols} x ${canvasStore.rows}`
  return `${group.groupCols} x ${group.groupRows} · 每格 ${group.subSize}² · 拼合 ${combinedSize.value}`
})
const layerName = computed(
  () => canvasStore.layers.find((layer) => layer.id === exportStore.exportLayerId)?.name ?? '',
)
const exportActionLabel = computed(() => {
  if (exportStore.exportFormat === 'pindou') return '保存工程文件'
  if (isGroup.value && exportStore.groupExportMode === 'separate') {
    return exportStore.groupSeparateDownloadMode === 'zip'
      ? `打包 ${groupCount.value} 个子画布`
      : `下载 ${groupCount.value} 张图片`
  }
  return '导出图片'
})

function groupCellHasPixels(row: number, col: number) {
  return filledGroupCells.value.has(`${row},${col}`)
}

function selectGroupPreview(row: number, col: number) {
  exportStore.selectGroupPreview(row, col)
}

const groupThumbRefs = new Map<string, HTMLCanvasElement>()

function setGroupThumbRef(row: number, col: number, element: HTMLCanvasElement | null) {
  if (element) groupThumbRefs.set(`${row},${col}`, element)
}

function renderGroupPicker() {
  const group = canvasStore.canvasGroup
  if (!group || exportStore.groupExportMode !== 'separate') return
  for (let row = 0; row < group.groupRows; row++) {
    for (let col = 0; col < group.groupCols; col++) {
      const canvas = groupThumbRefs.get(`${row},${col}`)
      const snapshot = group.canvases[row]?.[col]
      if (!canvas || !snapshot) continue
      const size = 48
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')!
      context.fillStyle =
        snapshot.backgroundColor === 'transparent' ? '#ffffff' : snapshot.backgroundColor
      context.fillRect(0, 0, size, size)
      const pixelSize = size / group.subSize
      for (const layer of snapshot.layers) {
        if (!layer.visible) continue
        for (let pixelRow = 0; pixelRow < group.subSize; pixelRow++) {
          const line = layer.grid[pixelRow]
          for (let pixelCol = 0; pixelCol < group.subSize; pixelCol++) {
            const color = line?.[pixelCol]
            if (!color) continue
            context.fillStyle = color
            context.fillRect(
              pixelCol * pixelSize,
              pixelRow * pixelSize,
              pixelSize + 0.4,
              pixelSize + 0.4,
            )
          }
        }
      }
    }
  }
}

const ColorPickerRow = defineComponent({
  props: { modelValue: { type: String, required: true } },
  emits: ['update:modelValue'],
  setup(props, { emit: emitValue }) {
    const colors = ['#ffffff', '#e0e0e0', '#000000', 'transparent']
    return () =>
      h('div', { class: 'color-row' }, [
        ...colors.map((color) =>
          h('button', {
            class: [
              'color-swatch',
              { active: props.modelValue === color, transparent: color === 'transparent' },
            ],
            style: color === 'transparent' ? undefined : { background: color },
            title: color,
            onClick: () => emitValue('update:modelValue', color),
          }),
        ),
        h('input', {
          type: 'color',
          value: props.modelValue === 'transparent' ? '#ffffff' : props.modelValue,
          onInput: (event: Event) =>
            emitValue('update:modelValue', (event.target as HTMLInputElement).value),
        }),
      ])
  },
})

const RangeField = defineComponent({
  props: {
    modelValue: { type: Number, required: true },
    label: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    suffix: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit: emitValue }) {
    return () =>
      h('label', { class: 'range-field' }, [
        h('span', props.label),
        h('input', {
          type: 'range',
          min: props.min,
          max: props.max,
          value: props.modelValue,
          onInput: (event: Event) =>
            emitValue('update:modelValue', Number((event.target as HTMLInputElement).value)),
        }),
        h('strong', `${props.modelValue}${props.suffix}`),
      ])
  },
})

const ThickLineSettings = defineComponent({
  props: {
    enabled: Boolean,
    interval: { type: Number, required: true },
    thickness: { type: Number, required: true },
    start: { type: String, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:enabled', 'update:interval', 'update:thickness', 'update:start'],
  setup(props, { emit: emitValue }) {
    return () =>
      h('div', { class: 'thick-setting' }, [
        h('label', { class: 'check-row' }, [
          h('input', {
            type: 'checkbox',
            checked: props.enabled,
            onChange: (event: Event) =>
              emitValue('update:enabled', (event.target as HTMLInputElement).checked),
          }),
          h('span', props.label),
        ]),
        props.enabled
          ? h('div', { class: 'thick-detail' }, [
              h('label', [
                '间隔 ',
                h('input', {
                  type: 'number',
                  min: 1,
                  max: 20,
                  value: props.interval,
                  onChange: (event: Event) =>
                    emitValue('update:interval', Number((event.target as HTMLInputElement).value)),
                }),
              ]),
              h('label', [
                '粗细 ',
                h('input', {
                  type: 'number',
                  min: 1,
                  max: 5,
                  value: props.thickness,
                  onChange: (event: Event) =>
                    emitValue('update:thickness', Number((event.target as HTMLInputElement).value)),
                }),
              ]),
              h(
                'select',
                {
                  value: props.start,
                  onChange: (event: Event) =>
                    emitValue('update:start', (event.target as HTMLSelectElement).value),
                },
                [
                  h('option', { value: 'center' }, '居中'),
                  h('option', { value: 'start' }, '居前'),
                  h('option', { value: 'end' }, '居后'),
                ],
              ),
            ])
          : null,
      ])
  },
})

function closePage() {
  exportStore.exportLayerId = null
  exportStore.showModal = false
  emit('close')
}

function clearLayerExport() {
  exportStore.exportLayerId = null
}

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

function syncThickToStore() {
  exportStore.thickLineH = {
    enabled: hlEnabled.value,
    interval: hlInterval.value,
    thickness: hlThick.value,
    startOffset: 0,
  }
  exportStore.thickLineV = {
    enabled: vlEnabled.value,
    interval: vlInterval.value,
    thickness: vlThick.value,
    startOffset: 0,
  }
  exportStore.hStartPos = hStartPos.value
  exportStore.vStartPos = vStartPos.value
}

function renderPreviewToCanvas() {
  if (!previewCanvas.value || !exportStore.previewDataUrl) return
  const image = new Image()
  image.onload = () => {
    const canvas = previewCanvas.value
    if (!canvas) return
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')?.drawImage(image, 0, 0)
  }
  image.src = exportStore.previewDataUrl
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    syncThickToStore()
    exportStore.refreshPreview()
    nextTick(renderPreviewToCanvas)
  }, 120)
}

function updateCanvasStyle() {
  previewCanvasStyle.value = {
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
    transformOrigin: 'center center',
  }
}
function zoomIn() {
  zoom.value = Math.min(5, zoom.value * 1.2)
  updateCanvasStyle()
}
function zoomOut() {
  zoom.value = Math.max(0.08, zoom.value / 1.2)
  updateCanvasStyle()
}
function fitZoom() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  updateCanvasStyle()
}
function onWheel(event: WheelEvent) {
  zoom.value = Math.max(0.08, Math.min(5, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)))
  updateCanvasStyle()
}
function onPanStart(event: PointerEvent) {
  if (event.button !== 0) return
  if (device.value === 'tb' && event.pointerType === 'touch') {
    previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    wrapRef.value?.setPointerCapture(event.pointerId)
    if (previewPointers.size >= 2) {
      isPanning = false
      const points = [...previewPointers.values()].slice(0, 2)
      const first = points[0]!
      const second = points[1]!
      previewPinchStart = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        zoom: zoom.value,
        panX: panX.value,
        panY: panY.value,
      }
    }
    return
  }
  isPanning = true
  panStart = { x: event.clientX, y: event.clientY, panX: panX.value, panY: panY.value }
  wrapRef.value?.setPointerCapture(event.pointerId)
}
function onPanMove(event: PointerEvent) {
  if (device.value === 'tb' && event.pointerType === 'touch') {
    if (!previewPointers.has(event.pointerId)) return
    previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (previewPinchStart && previewPointers.size >= 2) {
      const points = [...previewPointers.values()].slice(0, 2)
      const first = points[0]!
      const second = points[1]!
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
      const centerX = (first.x + second.x) / 2
      const centerY = (first.y + second.y) / 2
      zoom.value = Math.max(
        0.08,
        Math.min(5, previewPinchStart.zoom * (distance / previewPinchStart.distance)),
      )
      panX.value = previewPinchStart.panX + centerX - previewPinchStart.centerX
      panY.value = previewPinchStart.panY + centerY - previewPinchStart.centerY
      updateCanvasStyle()
    }
    return
  }
  if (!isPanning) return
  panX.value = panStart.panX + event.clientX - panStart.x
  panY.value = panStart.panY + event.clientY - panStart.y
  updateCanvasStyle()
}
function onPanEnd(event: PointerEvent) {
  if (device.value === 'tb' && event.pointerType === 'touch') {
    previewPointers.delete(event.pointerId)
    if (previewPointers.size < 2) previewPinchStart = null
    return
  }
  isPanning = false
  if (wrapRef.value?.hasPointerCapture(event.pointerId))
    wrapRef.value.releasePointerCapture(event.pointerId)
}

async function doExport() {
  exporting.value = true
  try {
    await exportStore.doExport()
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '导出失败。')
  } finally {
    exporting.value = false
  }
}
async function doBatchHighlight() {
  batchExporting.value = true
  try {
    await exportStore.batchExportHighlight()
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '批量导出失败。')
  } finally {
    batchExporting.value = false
  }
}

watch(
  [
    () => exportStore.exportName,
    () => exportStore.exportFormat,
    () => exportStore.exportContent,
    () => exportStore.groupExportMode,
    () => exportStore.groupSeparateDownloadMode,
    () => exportStore.groupPreviewRow,
    () => exportStore.groupPreviewCol,
    () => exportStore.showColorIds,
    () => exportStore.showColorIdsHighlightOnly,
    () => exportStore.showGrid,
    () => exportStore.gridThickness,
    () => exportStore.gridOpacity,
    () => exportStore.coordDisplay,
    () => exportStore.coordAxisStyle,
    () => exportStore.pixelShape,
    () => exportStore.sketchBg,
    () => exportStore.pageBg,
    () => exportStore.exportRenderMode,
    () => exportStore.exportFont,
    () => exportStore.tableLayout,
    () => exportStore.exportLayerId,
    () => exportStore.exportHighlightActive,
    () => exportStore.exportHighlightOnly,
    () => exportStore.exportHighlightedColorIds,
    () => exportStore.exportHighlightNumberMode,
    () => canvasStore.groupVersion,
    () => [
      hlEnabled.value,
      hlInterval.value,
      hlThick.value,
      hStartPos.value,
      vlEnabled.value,
      vlInterval.value,
      vlThick.value,
      vStartPos.value,
    ],
  ],
  scheduleRefresh,
  { deep: true },
)

watch([() => exportStore.groupExportMode, () => canvasStore.groupVersion], () =>
  nextTick(renderGroupPicker),
)

onMounted(() => {
  exportStore.initFromCanvas()
  syncThickFromStore()
  exportStore.refreshPreview()
  nextTick(() => {
    renderPreviewToCanvas()
    renderGroupPicker()
    updateCanvasStyle()
  })
})
onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<style scoped>
.export-page {
  position: fixed;
  inset: 0;
  z-index: 30000;
  display: grid;
  grid-template-rows: 64px minmax(0, 1fr);
  background: #f3f4f6;
  color: #111827;
}

.export-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 0 22px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.header-button,
.export-button {
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font-size: 0.84rem;
}

.header-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
  padding: 8px 10px;
  background: transparent;
  color: #4b5563;
}

.header-button img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.export-button {
  justify-self: end;
  min-width: 120px;
  padding: 10px 17px;
  background: #6366f1;
  color: #fff;
}

.export-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title strong {
  font-size: 1rem;
}

.header-title small {
  color: #9ca3af;
  font-size: 0.7rem;
}

.work-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 0.68rem;
}

.export-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  min-height: 0;
}

.preview-panel {
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  min-width: 0;
  background: #dfe3e9;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #d1d5db;
  background: rgba(255, 255, 255, 0.92);
}

.preview-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.preview-title strong {
  font-size: 0.84rem;
}

.preview-title span {
  color: #9ca3af;
  font-size: 0.68rem;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 5px;
}

.zoom-controls button {
  height: 28px;
  min-width: 30px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.zoom-controls span {
  min-width: 48px;
  text-align: center;
  color: #6b7280;
  font-size: 0.72rem;
}

.preview-viewport {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  cursor: grab;
  background: radial-gradient(circle at center, #eef0f3 0, #dfe3e9 70%);
  touch-action: none;
}

.preview-viewport:active {
  cursor: grabbing;
}

.preview-canvas {
  position: absolute;
  max-width: 78%;
  max-height: 82%;
  width: auto;
  height: auto;
  background: #fff;
  box-shadow: 0 10px 35px rgba(17, 24, 39, 0.16);
  image-rendering: auto;
}

.preview-empty {
  max-width: min(560px, 72%);
  padding: 14px 18px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: #9ca3af;
  font-size: 0.8rem;
  line-height: 1.6;
  text-align: center;
}

.settings-panel {
  overflow-y: auto;
  border-left: 1px solid #d9dde4;
  background: #f8fafc;
}

.settings-heading {
  position: sticky;
  top: 0;
  z-index: 3;
  padding: 17px 18px 13px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(248, 250, 252, 0.96);
  backdrop-filter: blur(8px);
}

.settings-heading > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.settings-heading strong {
  font-size: 0.92rem;
}

.settings-heading span {
  color: #9ca3af;
  font-size: 0.7rem;
}

.setting-group {
  margin: 10px 12px;
  border: 1px solid #e2e5ea;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.setting-group summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  color: #374151;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  list-style: none;
}

.setting-group summary::-webkit-details-marker {
  display: none;
}

.setting-group summary::after {
  content: '⌄';
  margin-left: auto;
  color: #9ca3af;
  transition: transform 0.15s;
}

.setting-group:not([open]) summary::after {
  transform: rotate(-90deg);
}

.summary-icon {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 6px;
  background: #eef2ff;
  color: #6366f1;
}
.summary-icon img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.group-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 13px 14px;
  border-top: 1px solid #eef0f3;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field > span,
.field-label,
.inline-field > span {
  color: #6b7280;
  font-size: 0.72rem;
}

.input-control {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  padding: 0 9px;
  color: #374151;
  outline: none;
  font-size: 0.78rem;
}

.input-control:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.choice-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.separate-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 11px;
  border: 1px solid #dbe4ff;
  border-radius: 9px;
  background: #f8faff;
}

.download-cards button {
  min-width: 0;
}

.group-preview-picker-wrap {
  max-height: 288px;
  overflow: auto;
  padding: 6px;
  border: 1px solid #e1e5ec;
  border-radius: 8px;
  background: #eef1f5;
}

.group-preview-picker {
  display: grid;
  width: max-content;
  min-width: 100%;
  gap: 4px;
}

.picker-corner,
.picker-cell {
  border: 0;
}

.picker-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 3;
  background: #eef1f5;
}

.picker-axis {
  position: sticky;
  z-index: 2;
  display: grid;
  min-width: 24px;
  min-height: 20px;
  place-items: center;
  border-radius: 4px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 0.58rem;
  font-variant-numeric: tabular-nums;
}

.picker-col-axis {
  top: 0;
}

.picker-row-axis {
  left: 0;
}

.picker-cell {
  position: relative;
  min-width: 42px;
  height: 52px;
  overflow: hidden;
  padding: 0;
  border: 1px solid #d5d9e0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.picker-cell:hover {
  border-color: #a5b4fc;
}

.picker-cell.active {
  border-color: #6366f1;
  box-shadow: inset 0 0 0 2px #6366f1;
}

.picker-cell:not(.filled) .picker-thumb {
  opacity: 0.45;
}

.picker-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.picker-cell > span {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(17, 24, 39, 0.66);
  color: #fff;
  font-size: 0.5rem;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.resolution-note {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid #dbe4ff;
  border-radius: 8px;
  background: #f3f6ff;
}

.resolution-note strong {
  flex: 0 0 auto;
  color: #4f46e5;
  font-size: 0.78rem;
}

.resolution-note span {
  color: #6b7280;
  font-size: 0.68rem;
  line-height: 1.45;
}

.choice-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.choice-cards button {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px;
  border: 1px solid #d9dde4;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.choice-cards button.active {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4f46e5;
}

.choice-cards strong {
  font-size: 0.74rem;
}

.choice-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.choice-title img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.choice-cards span {
  color: #9ca3af;
  font-size: 0.62rem;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border-radius: 8px;
  background: #f1f3f6;
}

.segmented.three {
  grid-template-columns: repeat(3, 1fr);
}

.segmented button {
  padding: 6px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 0.7rem;
}

.segmented button.active {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.09);
}

.layer-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  border-radius: 7px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.68rem;
}

.layer-banner button {
  border: 0;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  font-size: 0.65rem;
}

.inline-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.inline-field .segmented {
  width: 190px;
}

.check-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.74rem;
}

.check-row input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #6366f1;
}

.sub-check {
  padding-left: 22px;
  color: #6b7280;
}

:deep(.color-row) {
  display: flex;
  align-items: center;
  gap: 5px;
}

:deep(.color-swatch) {
  width: 24px;
  height: 24px;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}

:deep(.color-swatch.active) {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}

:deep(.color-swatch.transparent) {
  background: repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50%/8px 8px;
}

:deep(.color-row input[type='color']) {
  width: 25px;
  height: 25px;
  padding: 1px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

:deep(.range-field) {
  display: grid;
  grid-template-columns: 74px 1fr 36px;
  align-items: center;
  gap: 7px;
  color: #6b7280;
  font-size: 0.68rem;
}

:deep(.range-field input) {
  min-width: 0;
  accent-color: #6366f1;
}

:deep(.range-field strong) {
  text-align: right;
  color: #4b5563;
  font-size: 0.68rem;
}

:deep(.thick-setting) {
  padding: 8px;
  border-radius: 7px;
  background: #f8fafc;
}

:deep(.thick-detail) {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  padding-top: 8px;
}

:deep(.thick-detail label) {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #6b7280;
  font-size: 0.64rem;
}

:deep(.thick-detail input),
:deep(.thick-detail select) {
  min-width: 0;
  width: 100%;
  height: 27px;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  font-size: 0.65rem;
}

.stats-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stats-summary span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px;
  border-radius: 7px;
  background: #f8fafc;
  color: #9ca3af;
  font-size: 0.64rem;
}

.stats-summary strong {
  color: #4f46e5;
  font-size: 0.9rem;
}

.secondary-button {
  width: 100%;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.7rem;
}

.secondary-button.warm {
  border-color: #fcd34d;
  background: #fffbeb;
  color: #b45309;
}

.secondary-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

@media (max-width: 1000px) {
  .export-layout {
    grid-template-columns: minmax(0, 1fr) 340px;
  }

  .header-title small {
    display: none;
  }
}
</style>
