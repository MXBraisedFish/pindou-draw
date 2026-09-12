<template>
  <div class="panel-canvas">
    <!-- 图像辅助 -->
    <div class="canv-section underlay-section">
      <h4 class="canv-title">底图</h4>
      <input
        ref="underlayInputRef"
        class="hidden-file-input"
        type="file"
        accept="image/*"
        @change="onUnderlayFile"
      />
      <template v-if="canvasStore.underlay">
        <p class="canv-hint image-name" :title="canvasStore.underlay.name">
          {{ canvasStore.underlay.name }}
        </p>
        <div class="canv-btns underlay-actions">
          <button
            class="canv-btn"
            :class="{ active: canvasStore.underlayEditMode }"
            @click="canvasStore.underlayEditMode = !canvasStore.underlayEditMode"
          >
            {{ canvasStore.underlayEditMode ? '完成编辑' : '编辑底图' }}
          </button>
          <button class="canv-btn" @click="underlayInputRef?.click()">重新导入</button>
          <button class="canv-btn danger" @click="canvasStore.removeUnderlay()">删除底图</button>
        </div>
        <div class="image-adjustments">
          <label>
            <span>等比缩放</span>
            <input
              type="range"
              min="10"
              max="1000"
              :value="Math.round(canvasStore.underlay.scale * 100)"
              @input="setUnderlayScale"
            />
            <span>{{ Math.round(canvasStore.underlay.scale * 100) }}%</span>
          </label>
          <label>
            <span>透明度</span>
            <input
              type="range"
              min="0"
              max="100"
              :value="Math.round(canvasStore.underlay.opacity * 100)"
              @input="setUnderlayOpacity"
            />
            <span>{{ Math.round(canvasStore.underlay.opacity * 100) }}%</span>
          </label>
        </div>
        <button class="canv-btn reset-underlay" @click="canvasStore.resetUnderlayTransform()">
          重置位置与缩放
        </button>
        <label class="canv-toggle">
          <input
            type="checkbox"
            :checked="canvasStore.autoPickUnderlayColor"
            @change="canvasStore.autoPickUnderlayColor = !canvasStore.autoPickUnderlayColor"
          />
          根据底图自动切换画笔颜色
        </label>
        <p v-if="canvasStore.underlayEditMode" class="edit-mode-tip">
          底图编辑中：拖动移动，滚轮或双指缩放；绘画工具已暂停。
        </p>
      </template>
      <button v-else class="canv-btn" @click="underlayInputRef?.click()">导入底图</button>
    </div>

    <template v-if="!underlayOnly">
      <div class="canv-section floating-section">
        <h4 class="canv-title">浮动窗口</h4>
        <input
          ref="referenceInputRef"
          class="hidden-file-input"
          type="file"
          accept="image/*"
          @change="onReferenceFile"
        />
        <div class="canv-btns floating-actions">
          <button
            class="canv-btn"
            :class="{ active: workspaceStore.referenceWindowOpen }"
            @click="toggleReferenceWindow()"
          >
            {{ workspaceStore.referenceImage ? '参考图' : '导入参考图' }}
          </button>
          <button
            v-if="canvasStore.canvasGroup"
            class="canv-btn"
            :class="{ active: workspaceStore.groupPreviewWindowOpen }"
            @click="workspaceStore.groupPreviewWindowOpen = !workspaceStore.groupPreviewWindowOpen"
          >
            组预览
          </button>
        </div>
        <div v-if="workspaceStore.referenceImage" class="canv-btns reference-actions">
          <button class="canv-btn" @click="referenceInputRef?.click()">更换参考图</button>
          <button class="canv-btn danger" @click="workspaceStore.removeReferenceImage()">
            删除参考图
          </button>
        </div>
      </div>

      <!-- 1. 渲染模式 -->
      <div class="canv-section render-section">
        <h4 class="canv-title">渲染模式</h4>
        <div class="canv-btns">
          <button
            v-for="m in renderModes"
            :key="m.key"
            class="preset-btn"
            :class="{ active: canvasStore.renderMode === m.key }"
            @click="canvasStore.setRenderMode(m.key)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>

      <!-- 2. 对称绘制 -->
      <div class="canv-section symmetry-section">
        <h4 class="canv-title">对称绘制</h4>
        <div class="sym-grid">
          <button
            v-for="s in symModes"
            :key="s.key"
            class="sym-btn"
            :class="{ active: canvasStore.symmetry === s.key }"
            :title="s.label"
            @click="canvasStore.symmetry = s.key"
          >
            <img :src="s.icon" class="sym-icon" alt="" />
          </button>
        </div>
      </div>

      <!-- 3. 像素形状 -->
      <div class="canv-section shape-section">
        <h4 class="canv-title">像素形状</h4>
        <div class="canv-btns">
          <button
            class="preset-btn"
            :class="{ active: canvasStore.pixelShape === 'square' }"
            @click="canvasStore.pixelShape = 'square'"
          >
            <img :src="iconSquarePixel" class="preset-icon" alt="" />方形
          </button>
          <button
            class="preset-btn"
            :class="{ active: canvasStore.pixelShape === 'circle' }"
            @click="canvasStore.pixelShape = 'circle'"
          >
            <img :src="iconCirclePixel" class="preset-icon" alt="" />圆形
          </button>
        </div>
      </div>

      <!-- 4. 粗线显示 -->
      <div class="canv-section thick-section">
        <h4 class="canv-title">粗线显示</h4>
        <label class="canv-toggle">
          <input type="checkbox" :checked="thickLineH.enabled" @change="toggleHL" /> 水平
        </label>
        <div v-if="thickLineH.enabled" class="thick-params">
          <label
            >间隔
            <input
              type="range"
              min="1"
              max="20"
              :value="thickLineH.interval"
              @input="
                canvasStore.setThickLineH({
                  interval: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            {{ thickLineH.interval }}</label
          >
          <label
            >粗细
            <input
              type="range"
              min="1"
              max="5"
              :value="thickLineH.thickness"
              @input="
                canvasStore.setThickLineH({
                  thickness: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            {{ thickLineH.thickness }}</label
          >
          <div class="canv-btns">
            <button
              v-for="sp in startPositions"
              :key="sp.key"
              class="preset-btn"
              :class="{ active: hStartPos === sp.key }"
              @click="setHStart(sp.key)"
            >
              {{ sp.label }}
            </button>
          </div>
        </div>
        <label class="canv-toggle" style="margin-top: 4px">
          <input type="checkbox" :checked="thickLineV.enabled" @change="toggleVL" /> 垂直
        </label>
        <div v-if="thickLineV.enabled" class="thick-params">
          <label
            >间隔
            <input
              type="range"
              min="1"
              max="20"
              :value="thickLineV.interval"
              @input="
                canvasStore.setThickLineV({
                  interval: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            {{ thickLineV.interval }}</label
          >
          <label
            >粗细
            <input
              type="range"
              min="1"
              max="5"
              :value="thickLineV.thickness"
              @input="
                canvasStore.setThickLineV({
                  thickness: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
            {{ thickLineV.thickness }}</label
          >
          <div class="canv-btns">
            <button
              v-for="sp in startPositions"
              :key="sp.key"
              class="preset-btn"
              :class="{ active: vStartPos === sp.key }"
              @click="setVStart(sp.key)"
            >
              {{ sp.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 5. 色号显示 -->
      <div class="canv-section labels-section">
        <h4 class="canv-title">色号显示</h4>
        <label class="canv-toggle">
          <input
            type="checkbox"
            :checked="canvasStore.showColorIds"
            @change="canvasStore.showColorIds = !canvasStore.showColorIds"
          />
          在格子上显示色号
        </label>
        <label class="canv-toggle" style="margin-top: 4px">
          <input
            type="checkbox"
            :checked="canvasStore.showColorIdsHighlightOnly"
            @change="canvasStore.showColorIdsHighlightOnly = !canvasStore.showColorIdsHighlightOnly"
          />
          仅高亮颜色显示色号
        </label>
      </div>

      <!-- 6. 背景色 -->
      <div class="canv-section background-section">
        <h4 class="canv-title">背景色</h4>
        <div class="bg-presets">
          <button
            v-for="bg in bgColors"
            :key="bg.val"
            class="bg-swatch"
            :class="{ active: canvasStore.backgroundColor === bg.val }"
            :style="bg.style"
            :title="bg.label"
            @click="canvasStore.backgroundColor = bg.val"
          ></button>
          <input
            type="color"
            :value="
              canvasStore.backgroundColor === 'transparent'
                ? '#ffffff'
                : canvasStore.backgroundColor
            "
            class="bg-picker"
            @input="canvasStore.backgroundColor = ($event.target as HTMLInputElement).value"
          />
        </div>
      </div>

      <!-- 7. 反转与旋转 -->
      <div class="canv-section transform-section">
        <h4 class="canv-title">反转 / 旋转</h4>
        <div class="canv-btns">
          <button class="canv-btn" title="左右反转" @click="canvasStore.flipHorizontal()">
            <img :src="iconFlipH" class="op-icon" alt="" />
          </button>
          <button class="canv-btn" title="上下反转" @click="canvasStore.flipVertical()">
            <img :src="iconFlipV" class="op-icon" alt="" />
          </button>
          <button class="canv-btn" title="顺时针90°" @click="canvasStore.rotateCW()">
            <img :src="iconRotCW" class="op-icon" alt="" />
          </button>
          <button class="canv-btn" title="逆时针90°" @click="canvasStore.rotateCCW()">
            <img :src="iconRotCCW" class="op-icon" alt="" />
          </button>
        </div>
      </div>

      <!-- 8. 扩展/裁剪 -->
      <div class="canv-section resize-section" v-if="!canvasStore.canvasGroup">
        <h4 class="canv-title">扩展 / 裁剪画布</h4>
        <div v-if="!showResize" class="canv-btns">
          <button class="canv-btn" @click="openResize()">调整画布大小</button>
        </div>
        <div v-else class="resize-form">
          <div class="resize-row">
            <label
              >宽
              <input
                type="number"
                v-model.number="resizeW"
                min="1"
                max="64"
                class="resize-input"
                @input="updatePreview()"
                @change="normalizeResize()"
            /></label>
            <label
              >高
              <input
                type="number"
                v-model.number="resizeH"
                min="1"
                max="64"
                class="resize-input"
                @input="updatePreview()"
                @change="normalizeResize()"
            /></label>
          </div>
          <div class="resize-anchor">
            <span class="resize-label">锚点</span>
            <div class="anchor-grid">
              <button
                v-for="a in anchors"
                :key="a.r + ',' + a.c"
                class="anchor-cell"
                :class="{ active: anchorR === a.r && anchorC === a.c }"
                @click="selectAnchor(a.r, a.c)"
              ></button>
            </div>
          </div>
          <div class="canv-btns">
            <button class="canv-btn" @click="doResize()">确认</button>
            <button class="canv-btn" @click="cancelResize()">取消</button>
          </div>
        </div>
      </div>

      <!-- 画布组统一调整大小 -->
      <div class="canv-section resize-section" v-if="canvasStore.canvasGroup">
        <h4 class="canv-title">画布组子画布大小</h4>
        <p class="canv-hint">
          当前：{{ canvasStore.canvasGroup?.subSize }}x{{ canvasStore.canvasGroup?.subSize }}
        </p>
        <div class="resize-row">
          <label
            >新尺寸
            <input
              type="number"
              v-model.number="groupResizeSize"
              min="1"
              max="64"
              class="resize-input"
              @change="normalizeGroupResize()"
          /></label>
          <button class="canv-btn" @click="doGroupResize()">应用</button>
        </div>
      </div>

      <!-- 9. 其他 -->
      <div class="canv-section misc-section">
        <h4 class="canv-title">其他</h4>
        <label class="canv-toggle">
          <input
            type="checkbox"
            :checked="canvasStore.showGrid"
            @change="canvasStore.toggleGrid()"
          />
          显示网格
        </label>
      </div>

      <ConfirmModal
        v-if="resizeConflict"
        title="裁剪确认"
        message="该操作会导致部分像素被永久删除，该操作不可撤回。<br><br>确认删除吗？"
        confirm-text="确认删除"
        cancel-text="取消"
        @confirm="confirmForcedResize()"
        @cancel="resizeConflict = false"
      />
      <ConfirmModal
        v-if="showGroupResizeWarn"
        title="修改画布组大小"
        message="画布组的画布大小修改会<strong>强制所有画布</strong>修改为同样大小。<br>该步骤<b>不可撤回</b>。"
        confirm-text="确认修改"
        cancel-text="取消"
        @confirm="confirmGroupResize()"
        @cancel="showGroupResizeWarn = false"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  clampCanvasSize,
  useCanvasStore,
  type RenderMode,
  type SymmetryMode,
} from '@/stores/canvas'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useWorkspaceStore } from '@/stores/workspace'

import iconSymOff from '@/assets/icon/关闭对称.png'
import iconSymCenter from '@/assets/icon/中心对称.png'
import iconSymVertical from '@/assets/icon/垂直对称.png'
import iconSymHorizontal from '@/assets/icon/水平对称.png'
import iconSymDiag45 from '@/assets/icon/45度对称.png'
import iconSymDiag135 from '@/assets/icon/135度对称.png'
import iconSymCross from '@/assets/icon/十字对称.png'
import iconSymX from '@/assets/icon/叉形对称.png'
import iconSymAll8 from '@/assets/icon/八向对称.png'
import iconFlipH from '@/assets/icon/左右对称.png'
import iconFlipV from '@/assets/icon/上下对称.png'
import iconRotCW from '@/assets/icon/顺时针旋转.png'
import iconRotCCW from '@/assets/icon/逆时针旋转.png'
import iconSquarePixel from '@/assets/icon/方形像素.png'
import iconCirclePixel from '@/assets/icon/圆形像素.png'

const canvasStore = useCanvasStore()
defineProps<{ underlayOnly?: boolean }>()
const workspaceStore = useWorkspaceStore()
const underlayInputRef = ref<HTMLInputElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onUnderlayFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const src = await readImageFile(file)
  canvasStore.setUnderlay({ src, name: file.name })
}

async function onReferenceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const src = await readImageFile(file)
  workspaceStore.setReferenceImage({ src, name: file.name })
}

function toggleReferenceWindow() {
  if (!workspaceStore.referenceImage) {
    referenceInputRef.value?.click()
    return
  }
  workspaceStore.referenceWindowOpen = !workspaceStore.referenceWindowOpen
}

function setUnderlayScale(event: Event) {
  canvasStore.updateUnderlay({
    scale: Number((event.target as HTMLInputElement).value) / 100,
  })
}

function setUnderlayOpacity(event: Event) {
  canvasStore.updateUnderlay({
    opacity: Number((event.target as HTMLInputElement).value) / 100,
  })
}

// 扩展/裁剪
const showResize = ref(false)
const resizeW = ref(16)
const resizeH = ref(16)
const anchorR = ref(1)
const anchorC = ref(1)
const resizeConflict = ref(false)
const anchors = [
  { r: 0, c: 0 },
  { r: 0, c: 1 },
  { r: 0, c: 2 },
  { r: 1, c: 0 },
  { r: 1, c: 1 },
  { r: 1, c: 2 },
  { r: 2, c: 0 },
  { r: 2, c: 1 },
  { r: 2, c: 2 },
]

function openResize() {
  resizeW.value = canvasStore.cols
  resizeH.value = canvasStore.rows
  anchorR.value = 1
  anchorC.value = 1
  showResize.value = true
}

function updatePreview() {
  if (!Number.isFinite(resizeW.value) || !Number.isFinite(resizeH.value)) return
  canvasStore.startResize(resizeW.value, resizeH.value, anchorR.value, anchorC.value)
}

function selectAnchor(row: number, col: number) {
  anchorR.value = row
  anchorC.value = col
  updatePreview()
}

function normalizeResize() {
  resizeW.value = clampCanvasSize(resizeW.value, canvasStore.cols)
  resizeH.value = clampCanvasSize(resizeH.value, canvasStore.rows)
  updatePreview()
}

function doResize() {
  const result = canvasStore.confirmResize()
  if (result.hasConflict) {
    resizeConflict.value = true
  } else {
    canvasStore.forceResize()
    showResize.value = false
  }
}

function confirmForcedResize() {
  canvasStore.forceResize()
  resizeConflict.value = false
  showResize.value = false
}

function cancelResize() {
  canvasStore.cancelResize()
  showResize.value = false
}

// 画布组统一调整
const groupResizeSize = ref(canvasStore.canvasGroup?.subSize ?? 16)
const showGroupResizeWarn = ref(false)

function normalizeGroupResize() {
  groupResizeSize.value = clampCanvasSize(
    groupResizeSize.value,
    canvasStore.canvasGroup?.subSize ?? 16,
  )
}

function doGroupResize() {
  if (!canvasStore.canvasGroup) return
  normalizeGroupResize()
  showGroupResizeWarn.value = true
}

function confirmGroupResize() {
  normalizeGroupResize()
  canvasStore.resizeGroupCanvas(groupResizeSize.value)
  showGroupResizeWarn.value = false
}

const thickLineH = computed(() => canvasStore.thickLineH)
const thickLineV = computed(() => canvasStore.thickLineV)

const renderModes: { key: RenderMode; label: string }[] = [
  { key: 'day', label: '白天' },
  { key: 'night', label: '夜晚' },
  { key: 'thermo', label: '温变' },
  { key: 'photo', label: '光变' },
  { key: 'thermo-photo', label: '温+光' },
]

const symModes: { key: SymmetryMode; label: string; icon: string }[] = [
  { key: 'off', label: '关闭', icon: iconSymOff },
  { key: 'center', label: '中心', icon: iconSymCenter },
  { key: 'vertical', label: '垂直', icon: iconSymVertical },
  { key: 'horizontal', label: '水平', icon: iconSymHorizontal },
  { key: 'diag45', label: '45°', icon: iconSymDiag45 },
  { key: 'diag135', label: '135°', icon: iconSymDiag135 },
  { key: 'cross', label: '十字', icon: iconSymCross },
  { key: 'x', label: 'X字', icon: iconSymX },
  { key: 'all8', label: '八向', icon: iconSymAll8 },
]

const startPositions = [
  { key: 'center' as const, label: '居中' },
  { key: 'start' as const, label: '居前' },
  { key: 'end' as const, label: '居后' },
]

const hStartPos = ref<'center' | 'start' | 'end'>('center')
const vStartPos = ref<'center' | 'start' | 'end'>('center')

function calcOffset(pos: 'center' | 'start' | 'end', total: number, interval: number) {
  const rem = total % interval
  if (pos === 'start') return 0
  if (pos === 'end') return rem
  return Math.floor(rem / 2)
}

function setHStart(pos: 'center' | 'start' | 'end') {
  hStartPos.value = pos
  canvasStore.setThickLineH({
    startOffset: calcOffset(pos, canvasStore.rows, thickLineH.value.interval),
  })
}
function setVStart(pos: 'center' | 'start' | 'end') {
  vStartPos.value = pos
  canvasStore.setThickLineV({
    startOffset: calcOffset(pos, canvasStore.cols, thickLineV.value.interval),
  })
}

function toggleHL() {
  canvasStore.setThickLineH({ enabled: !thickLineH.value.enabled })
}
function toggleVL() {
  canvasStore.setThickLineV({ enabled: !thickLineV.value.enabled })
}

const bgColors = [
  { val: '#ffffff', label: '白色', style: { background: '#fff' } },
  { val: '#e0e0e0', label: '灰色', style: { background: '#e0e0e0' } },
  { val: '#000000', label: '黑色', style: { background: '#000' } },
  {
    val: 'transparent',
    label: '透明',
    style: { background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50%/8px 8px' },
  },
]
</script>

<style scoped>
.panel-canvas {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  align-content: start;
  background: #f7f8fb;
}
.canv-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 9px;
  padding: 12px;
  border: 1px solid #e2e5eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
}
.canv-section,
.render-section,
.symmetry-section,
.thick-section,
.resize-section,
.misc-section {
  grid-column: 1 / -1;
}
.canv-title {
  margin: 0;
  color: #374151;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
}
.canv-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.7rem;
  line-height: 1.35;
}
.canv-toggle input {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: #6366f1;
}
.canv-btns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
  gap: 6px;
}
.canv-btn {
  display: flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.7rem;
}
.canv-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
}
.canv-btn.active {
  border-color: #818cf8;
  background: #eef2ff;
  color: #4f46e5;
}
.canv-btn.danger {
  color: #dc2626;
}
.hidden-file-input {
  display: none;
}
.image-name {
  overflow: hidden;
  color: #6b7280;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.underlay-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.floating-actions,
.reference-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.image-adjustments {
  display: grid;
  gap: 8px;
  padding: 9px;
  border-radius: 7px;
  background: #f8fafc;
}
.image-adjustments label {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
  align-items: center;
  gap: 6px;
  color: #6b7280;
  font-size: 0.66rem;
}
.image-adjustments input {
  width: 100%;
  min-width: 0;
  accent-color: #6366f1;
}
.image-adjustments label span:last-child {
  text-align: right;
}
.reset-underlay {
  width: 100%;
}
.edit-mode-tip {
  margin: 0;
  padding: 8px;
  border-radius: 7px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 0.65rem;
  line-height: 1.5;
}
.preset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: #fff;
  color: #4b5563;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.preset-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.preset-btn:hover {
  border-color: #9ca3af;
}
.preset-btn.active {
  background: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
  font-weight: 600;
}
.canv-hint {
  margin: 0;
  color: #9ca3af;
  font-size: 0.66rem;
}

.sym-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}
.sym-btn {
  min-width: 0;
  height: 38px;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sym-icon {
  width: 24px;
  height: 24px;
  display: block;
}
.sym-btn:hover {
  border-color: #9ca3af;
}
.sym-btn.active {
  background: #eef2ff;
  border-color: #6366f1;
}

.thick-params {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  padding: 9px;
  border-radius: 7px;
  background: #f8fafc;
}
.thick-params label {
  display: grid;
  grid-template-columns: 30px 1fr 20px;
  align-items: center;
  gap: 5px;
  color: #6b7280;
  font-size: 0.64rem;
}
.thick-params input[type='range'] {
  width: 100%;
  min-width: 0;
  height: 4px;
  accent-color: #6366f1;
}
.thick-params .canv-btns {
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, 1fr);
}

.bg-presets {
  display: grid;
  grid-template-columns: repeat(5, minmax(28px, 1fr));
  gap: 5px;
}
.bg-swatch {
  width: 100%;
  height: 34px;
  padding: 0;
  border: 2px solid #d1d5db;
  border-radius: 5px;
  cursor: pointer;
}
.bg-swatch:hover {
  border-color: #9ca3af;
}
.bg-swatch.active {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}
.bg-picker {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  cursor: pointer;
  padding: 2px;
}

.resize-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.resize-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, max-content));
  align-items: center;
  gap: 8px;
}
.resize-row label {
  font-size: 0.68rem;
  color: #555;
  display: flex;
  align-items: center;
  gap: 4px;
}
.resize-input {
  box-sizing: border-box;
  width: 64px;
  height: 34px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.8rem;
  text-align: center;
  outline: none;
}
.resize-input:focus {
  border-color: #6366f1;
}
.resize-anchor {
  display: flex;
  align-items: center;
  gap: 6px;
}
.resize-label {
  font-size: 0.68rem;
  color: #888;
}
.anchor-grid {
  display: grid;
  grid-template-columns: repeat(3, 18px);
  gap: 3px;
}
.anchor-cell {
  width: 18px;
  height: 18px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  padding: 0;
}
.anchor-cell.active {
  background: #6366f1;
  border-color: #6366f1;
}
.op-icon {
  width: 22px;
  height: 22px;
  display: block;
}
.transform-section .canv-btns {
  grid-template-columns: repeat(2, 1fr);
}
.shape-section .canv-btns {
  grid-template-columns: repeat(2, 1fr);
}
.labels-section {
  justify-content: start;
}

@media (max-width: 360px) {
  .panel-canvas {
    grid-template-columns: 1fr;
  }
  .canv-section,
  .render-section,
  .symmetry-section,
  .thick-section,
  .resize-section,
  .misc-section {
    grid-column: 1;
  }
  .sym-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
</style>
