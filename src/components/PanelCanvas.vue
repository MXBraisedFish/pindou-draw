<template>
  <div class="panel-canvas">
    <!-- 1. 渲染模式 -->
    <div class="canv-section">
      <h4 class="canv-title">渲染模式</h4>
      <div class="canv-btns">
        <button v-for="m in renderModes" :key="m.key" class="preset-btn"
          :class="{ active: canvasStore.renderMode === m.key }"
          @click="canvasStore.setRenderMode(m.key)">{{ m.label }}</button>
      </div>
    </div>

    <!-- 2. 对称绘制 -->
    <div class="canv-section">
      <h4 class="canv-title">对称绘制</h4>
      <div class="sym-grid">
        <button v-for="s in symModes" :key="s.key" class="sym-btn"
          :class="{ active: canvasStore.symmetry === s.key }"
          :title="s.label"
          @click="canvasStore.symmetry = s.key"><img :src="s.icon" class="sym-icon" alt="" /></button>
      </div>
    </div>

    <!-- 3. 像素形状 -->
    <div class="canv-section">
      <h4 class="canv-title">像素形状</h4>
      <div class="canv-btns">
        <button class="preset-btn" :class="{ active: canvasStore.pixelShape === 'square' }"
          @click="canvasStore.pixelShape = 'square'">■ 方形</button>
        <button class="preset-btn" :class="{ active: canvasStore.pixelShape === 'circle' }"
          @click="canvasStore.pixelShape = 'circle'">○ 圆形</button>
      </div>
    </div>

    <!-- 4. 粗线显示 -->
    <div class="canv-section">
      <h4 class="canv-title">粗线显示</h4>
      <label class="canv-toggle">
        <input type="checkbox" :checked="thickLineH.enabled" @change="toggleHL" /> 水平
      </label>
      <div v-if="thickLineH.enabled" class="thick-params">
        <label>间隔 <input type="range" min="1" max="20" :value="thickLineH.interval"
          @input="canvasStore.setThickLineH({ interval: Number(($event.target as HTMLInputElement).value) })" />
          {{ thickLineH.interval }}</label>
        <label>粗细 <input type="range" min="1" max="5" :value="thickLineH.thickness"
          @input="canvasStore.setThickLineH({ thickness: Number(($event.target as HTMLInputElement).value) })" />
          {{ thickLineH.thickness }}</label>
        <div class="canv-btns">
          <button v-for="sp in startPositions" :key="sp.key" class="preset-btn"
            :class="{ active: hStartPos === sp.key }"
            @click="setHStart(sp.key)">{{ sp.label }}</button>
        </div>
      </div>
      <label class="canv-toggle" style="margin-top:4px">
        <input type="checkbox" :checked="thickLineV.enabled" @change="toggleVL" /> 垂直
      </label>
      <div v-if="thickLineV.enabled" class="thick-params">
        <label>间隔 <input type="range" min="1" max="20" :value="thickLineV.interval"
          @input="canvasStore.setThickLineV({ interval: Number(($event.target as HTMLInputElement).value) })" />
          {{ thickLineV.interval }}</label>
        <label>粗细 <input type="range" min="1" max="5" :value="thickLineV.thickness"
          @input="canvasStore.setThickLineV({ thickness: Number(($event.target as HTMLInputElement).value) })" />
          {{ thickLineV.thickness }}</label>
        <div class="canv-btns">
          <button v-for="sp in startPositions" :key="sp.key" class="preset-btn"
            :class="{ active: vStartPos === sp.key }"
            @click="setVStart(sp.key)">{{ sp.label }}</button>
        </div>
      </div>
    </div>

    <!-- 5. 色号显示 -->
    <div class="canv-section">
      <h4 class="canv-title">色号显示</h4>
      <label class="canv-toggle">
        <input type="checkbox" :checked="canvasStore.showColorIds"
          @change="canvasStore.showColorIds = !canvasStore.showColorIds" />
        在格子上显示色号
      </label>
      <label class="canv-toggle" style="margin-top:4px">
        <input type="checkbox" :checked="canvasStore.showColorIdsHighlightOnly"
          @change="canvasStore.showColorIdsHighlightOnly = !canvasStore.showColorIdsHighlightOnly" />
        仅高亮颜色显示色号
      </label>
    </div>

    <!-- 6. 背景色 -->
    <div class="canv-section">
      <h4 class="canv-title">背景色</h4>
      <div class="bg-presets">
        <button v-for="bg in bgColors" :key="bg.val" class="bg-swatch"
          :class="{ active: canvasStore.backgroundColor === bg.val }"
          :style="bg.style"
          :title="bg.label"
          @click="canvasStore.backgroundColor = bg.val"></button>
        <input type="color" :value="canvasStore.backgroundColor === 'transparent' ? '#ffffff' : canvasStore.backgroundColor"
          class="bg-picker"
          @input="canvasStore.backgroundColor = ($event.target as HTMLInputElement).value" />
      </div>
    </div>

    <!-- 7. 反转与旋转 -->
    <div class="canv-section">
      <h4 class="canv-title">反转 / 旋转</h4>
      <div class="canv-btns">
        <button class="canv-btn" title="左右反转" @click="canvasStore.flipHorizontal()"><img :src="iconFlipH" class="op-icon" alt="" /></button>
        <button class="canv-btn" title="上下反转" @click="canvasStore.flipVertical()"><img :src="iconFlipV" class="op-icon" alt="" /></button>
        <button class="canv-btn" title="顺时针90°" @click="canvasStore.rotateCW()"><img :src="iconRotCW" class="op-icon" alt="" /></button>
        <button class="canv-btn" title="逆时针90°" @click="canvasStore.rotateCCW()"><img :src="iconRotCCW" class="op-icon" alt="" /></button>
      </div>
    </div>

    <!-- 8. 扩展/裁剪 -->
    <div class="canv-section" v-if="!canvasStore.canvasGroup">
      <h4 class="canv-title">扩展 / 裁剪画布</h4>
      <div v-if="!showResize" class="canv-btns">
        <button class="canv-btn" @click="openResize()">调整画布大小</button>
      </div>
      <div v-else class="resize-form">
        <div class="resize-row">
          <label>宽 <input type="number" v-model.number="resizeW" min="1" max="64" class="resize-input" @input="updatePreview()" /></label>
          <label>高 <input type="number" v-model.number="resizeH" min="1" max="64" class="resize-input" @input="updatePreview()" /></label>
        </div>
        <div class="resize-anchor">
          <span class="resize-label">锚点</span>
          <div class="anchor-grid">
            <button v-for="a in anchors" :key="a.r + ',' + a.c"
              class="anchor-cell"
              :class="{ active: anchorR === a.r && anchorC === a.c }"
              @click="anchorR = a.r; anchorC = a.c; updatePreview()"
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
    <div class="canv-section" v-if="canvasStore.canvasGroup">
      <h4 class="canv-title">画布组子画布大小</h4>
      <p class="canv-hint">当前：{{ canvasStore.canvasGroup?.subSize }}x{{ canvasStore.canvasGroup?.subSize }}</p>
      <div class="resize-row">
        <label>新尺寸 <input type="number" v-model.number="groupResizeSize" min="4" max="64" class="resize-input" /></label>
        <button class="canv-btn" @click="doGroupResize()">应用</button>
      </div>
    </div>

    <!-- 9. 其他 -->
    <div class="canv-section">
      <h4 class="canv-title">其他</h4>
      <label class="canv-toggle">
        <input type="checkbox" :checked="canvasStore.showGrid" @change="canvasStore.toggleGrid()" />
        显示网格
      </label>
      <p class="canv-hint">设备: {{ deviceLabel }}</p>
      <button class="canv-btn" @click="showDeviceSwitch = true">切换设备</button>
    </div>
    <DeviceModal v-if="showDeviceSwitch" @select="switchDevice" />

    <ConfirmModal
      v-if="resizeConflict"
      title="裁剪确认"
      message="该操作会导致部分像素被永久删除，该操作不可撤回。<br><br>确认删除吗？"
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="canvasStore.forceResize(); resizeConflict = false"
      @cancel="resizeConflict = false"
    />
    <ConfirmModal
      v-if="showGroupResizeWarn"
      title="修改画布组大小"
      message="画布组的画布大小修改会<strong>强制所有画布</strong>修改为同样大小。<br>该步骤<b>不可撤回</b>。"
      confirm-text="确认修改"
      cancel-text="取消"
      @confirm="canvasStore.resizeGroupCanvas(groupResizeSize); showGroupResizeWarn = false"
      @cancel="showGroupResizeWarn = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useCanvasStore, type RenderMode, type SymmetryMode } from '@/stores/canvas'
import DeviceModal from '@/components/DeviceModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'

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

const { device, changeDevice } = useDevice()
const canvasStore = useCanvasStore()
const showDeviceSwitch = ref(false)

// 扩展/裁剪
const showResize = ref(false)
const resizeW = ref(16)
const resizeH = ref(16)
const anchorR = ref(1)
const anchorC = ref(1)
const resizeConflict = ref(false)
const anchors = [
  { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
  { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
  { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 },
]

function openResize() {
  resizeW.value = canvasStore.cols
  resizeH.value = canvasStore.rows
  anchorR.value = 1
  anchorC.value = 1
  showResize.value = true
}

function updatePreview() {
  canvasStore.startResize(resizeW.value, resizeH.value, anchorR.value, anchorC.value)
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

function cancelResize() {
  canvasStore.cancelResize()
  showResize.value = false
}

// 画布组统一调整
const groupResizeSize = ref(canvasStore.canvasGroup?.subSize ?? 16)
const showGroupResizeWarn = ref(false)

function doGroupResize() {
  if (!canvasStore.canvasGroup) return
  showGroupResizeWarn.value = true
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
  canvasStore.setThickLineH({ startOffset: calcOffset(pos, canvasStore.rows, thickLineH.value.interval) })
}
function setVStart(pos: 'center' | 'start' | 'end') {
  vStartPos.value = pos
  canvasStore.setThickLineV({ startOffset: calcOffset(pos, canvasStore.cols, thickLineV.value.interval) })
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
  { val: 'transparent', label: '透明', style: { background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50%/8px 8px' } },
]

const deviceLabels: Record<string, string> = { pc: '电脑', tb: '平板', ph: '手机' }
const deviceLabel = computed(() => deviceLabels[device.value ?? 'pc'] ?? '未知')

function switchDevice(type: 'pc' | 'tb' | 'ph') {
  changeDevice(type)
  showDeviceSwitch.value = false
}
</script>

<style scoped>
.panel-canvas { padding: 14px; display: flex; flex-direction: column; gap: 16px; }
.canv-section { display: flex; flex-direction: column; gap: 6px; }
.canv-title { font-size: 1.05rem; font-weight: 600; color: #555; }
.canv-toggle { display: flex; align-items: center; gap: 8px; font-size: 1.05rem; color: #333; cursor: pointer; }
.canv-btns { display: flex; gap: 4px; flex-wrap: wrap; }
.canv-btn { padding: 7px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font-size: 1rem; cursor: pointer; }
.canv-btn:hover { border-color: #6366f1; color: #6366f1; }
.preset-btn { padding: 5px 12px; border: 1px solid #d1d5db; border-radius: 5px; background: #fff; font-size: 0.95rem; cursor: pointer; transition: all 0.15s; }
.preset-btn:hover { border-color: #9ca3af; }
.preset-btn.active { background: #eef2ff; color: #6366f1; border-color: #c7d2fe; font-weight: 600; }
.canv-hint { font-size: 0.95rem; color: #888; }

.sym-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.sym-btn { padding: 5px; border: 1px solid #e5e7eb; border-radius: 5px; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.sym-icon { width: 28px; height: 28px; display: block; }
.sym-btn:hover { border-color: #9ca3af; }
.sym-btn.active { background: #eef2ff; border-color: #6366f1; }

.thick-params { display: flex; flex-direction: column; gap: 5px; padding: 4px 0 0 8px; }
.thick-params label { font-size: 1rem; color: #555; display: flex; align-items: center; gap: 6px; }
.thick-params input[type='range'] { width: 80px; height: 4px; }

.bg-presets { display: flex; gap: 6px; align-items: center; }
.bg-swatch { width: 38px; height: 38px; border: 2px solid #d1d5db; border-radius: 5px; cursor: pointer; }
.bg-swatch:hover { border-color: #9ca3af; }
.bg-swatch.active { border-color: #6366f1; box-shadow: 0 0 0 1px #6366f1; }
.bg-picker { width: 40px; height: 38px; border: 1px solid #d1d5db; border-radius: 5px; cursor: pointer; padding: 2px; }

.resize-form { display: flex; flex-direction: column; gap: 6px; }
.resize-row { display: flex; gap: 6px; }
.resize-row label { font-size: 0.8rem; color: #555; display: flex; align-items: center; gap: 4px; }
.resize-input { width: 56px; padding: 3px 4px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.8rem; text-align: center; outline: none; }
.resize-input:focus { border-color: #6366f1; }
.resize-anchor { display: flex; align-items: center; gap: 6px; }
.resize-label { font-size: 0.75rem; color: #888; }
.anchor-grid { display: grid; grid-template-columns: repeat(3, 18px); gap: 3px; }
.anchor-cell { width: 18px; height: 18px; border: 1px solid #d1d5db; border-radius: 3px; background: #fff; cursor: pointer; padding: 0; }
.anchor-cell.active { background: #6366f1; border-color: #6366f1; }
.op-icon { width: 22px; height: 22px; display: block; }
</style>
