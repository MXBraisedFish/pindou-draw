<template>
  <div class="top-global-bar">
    <div class="global-left">
      <span class="global-logo">拼豆绘制</span>
    </div>
    <div class="global-actions">
      <button class="global-btn" title="新建画布" @click="showNewModal = true">新建</button>
      <button class="global-btn" title="导入" @click="projectStore.importFile()">导入</button>
      <button class="global-btn" title="导出" @click="exportStore.showModal = true">导出</button>
      <button class="global-btn" title="保存项目" @click="projectStore.saveProject()">保存</button>
      <button class="global-btn" title="设置" @click="showSettings = true">设置</button>
    </div>
  </div>

  <!-- 覆盖确认 -->
  <ConfirmModal
    v-if="showOverwriteConfirm"
    :title="overwriteTarget === 'group' ? '新建画布组' : '新建画布'"
    message="当前画布有内容，新建将直接覆盖旧画布。<br>该操作<b>无法撤回</b>。"
    confirm-text="确认覆盖"
    cancel-text="取消"
    @confirm="executeOverwrite()"
    @cancel="onOverwriteCancel()"
  />

  <!-- 新建弹窗 -->
  <Teleport to="body">
    <div v-if="showNewModal" class="new-overlay" @click.self="closeNewModal()">
      <div class="new-card">
        <template v-if="newStep === 'menu'">
          <h3 class="new-title">新建</h3>
          <div class="new-options">
            <button class="new-opt-btn" @click="newStep = 'canvas'">新建画布</button>
            <button class="new-opt-btn" @click="newStep = 'group'">新建画布组</button>
            <button class="new-opt-btn" @click="showImageToPixel = true; closeNewModal()">以图生图</button>
          </div>
          <button class="new-cancel-btn" @click="closeNewModal()">取消</button>
        </template>
        <template v-else-if="newStep === 'canvas'">
          <h3 class="new-title">新建画布</h3>
          <div class="new-form">
            <label>名称 <input v-model="newName" class="new-input" /></label>
            <label>色卡
              <select v-model="newCard" class="new-input">
                <option v-for="c in paletteStore.cardList" :key="c.name" :value="c.name">{{ c.name }}</option>
              </select>
            </label>
            <div class="new-size-row">
              <label>宽 <input type="number" v-model.number="newW" min="1" max="64" class="new-input small" /></label>
              <label>高 <input type="number" v-model.number="newH" min="1" max="64" class="new-input small" /></label>
            </div>
          </div>
          <div class="new-actions">
            <button class="new-cancel-btn" @click="newStep = 'menu'">返回</button>
            <button class="new-ok-btn" @click="doNewCanvas()">创建</button>
          </div>
        </template>
        <template v-else-if="newStep === 'group'">
          <h3 class="new-title">新建画布组</h3>
          <div class="new-form">
            <label>名称 <input v-model="newName" class="new-input" /></label>
            <label>色卡
              <select v-model="newCard" class="new-input">
                <option v-for="c in paletteStore.cardList" :key="c.name" :value="c.name">{{ c.name }}</option>
              </select>
            </label>
            <div class="new-size-row">
              <label>列数 <input type="number" v-model.number="groupCols" min="1" max="32" class="new-input small" /></label>
              <label>行数 <input type="number" v-model.number="groupRows" min="1" max="32" class="new-input small" /></label>
            </div>
            <label>子画布大小 <input type="number" v-model.number="groupSubSize" min="4" max="64" class="new-input small" /></label>
            <p class="new-hint">创建 {{ groupCols }}x{{ groupRows }} 矩阵，共 {{ groupCols * groupRows }} 幅 {{ groupSubSize }}x{{ groupSubSize }} 子画布</p>
          </div>
          <div class="new-actions">
            <button class="new-cancel-btn" @click="newStep = 'menu'">返回</button>
            <button class="new-ok-btn" @click="doNewGroup()">创建</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>

  <ExportModal v-if="exportStore.showModal" @close="exportStore.showModal = false" />
  <ImageToPixelModal v-if="showImageToPixel" @close="showImageToPixel = false" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useProjectStore } from '@/stores/project'
import { usePaletteStore } from '@/stores/palette'
import { useExportStore } from '@/stores/exportStore'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ExportModal from '@/components/ExportModal.vue'
import ImageToPixelModal from '@/components/ImageToPixelModal.vue'

const canvasStore = useCanvasStore()
const projectStore = useProjectStore()
const paletteStore = usePaletteStore()
const exportStore = useExportStore()
const showSettings = ref(false)

const showNewModal = ref(false)
const newStep = ref<'menu' | 'canvas' | 'group'>('menu')
const newName = ref('未命名项目')
const newCard = ref('DMC')
const newW = ref(16)
const newH = ref(16)
const groupCols = ref(4)
const groupRows = ref(4)
const groupSubSize = ref(16)
const showImageToPixel = ref(false)
const showOverwriteConfirm = ref(false)
const overwriteTarget = ref<'canvas' | 'group'>('canvas')

function closeNewModal() {
  showNewModal.value = false
  newStep.value = 'menu'
}

function doNewCanvas() {
  const hasPixels = canvasStore.layers.some(layer =>
    layer.grid.some(row => row.some(cell => cell !== '')),
  )

  if (hasPixels) {
    showNewModal.value = false
    overwriteTarget.value = 'canvas'
    showOverwriteConfirm.value = true
    return
  }

  executeNewCanvas()
}

function executeOverwrite() {
  if (overwriteTarget.value === 'group') executeNewGroup()
  else executeNewCanvas()
}

function onOverwriteCancel() {
  showOverwriteConfirm.value = false
  showNewModal.value = true
}

function executeNewCanvas() {
  showOverwriteConfirm.value = false
  projectStore.projectName = newName.value
  projectStore.createdAt = new Date().toLocaleDateString('zh-CN')
  const card = paletteStore.cardList.find(c => c.name === newCard.value)
  if (card) paletteStore.loadCard(card)
  canvasStore.newCanvas(newW.value, newH.value)
  closeNewModal()
}

function doNewGroup() {
  const hasPixels = canvasStore.layers.some(layer =>
    layer.grid.some(row => row.some(cell => cell !== '')),
  )
  if (hasPixels) {
    showNewModal.value = false
    overwriteTarget.value = 'group'
    showOverwriteConfirm.value = true
    return
  }
  executeNewGroup()
}

function executeNewGroup() {
  showOverwriteConfirm.value = false
  projectStore.projectName = newName.value
  projectStore.createdAt = new Date().toLocaleDateString('zh-CN')
  const card = paletteStore.cardList.find(c => c.name === newCard.value)
  if (card) paletteStore.loadCard(card)
  canvasStore.createCanvasGroup(newName.value, groupCols.value, groupRows.value, groupSubSize.value)
  closeNewModal()
}
</script>

<style scoped>
.top-global-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.global-logo {
  font-weight: 700;
  font-size: 0.95rem;
  color: #1a1a2e;
  white-space: nowrap;
}

.global-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.global-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #333;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.global-btn:hover {
  background: #f3f4f6;
}

.new-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.4); display: flex;
  align-items: center; justify-content: center;
}
.new-card {
  background: #fff; border-radius: 12px; padding: 24px 28px;
  max-width: 360px; width: 90%; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
}
.new-title { font-size: 1.1rem; font-weight: 600; color: #333; margin-bottom: 16px; }
.new-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.new-opt-btn {
  padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff;
  font-size: 0.9rem; cursor: pointer; text-align: center; transition: all 0.12s;
}
.new-opt-btn:hover:not(:disabled) { background: #f3f4f6; border-color: #6366f1; }
.new-opt-btn:disabled { opacity: 0.4; cursor: default; }
.new-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.new-form label { font-size: 0.85rem; color: #555; display: flex; align-items: center; gap: 6px; }
.new-input { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 0.85rem; outline: none; flex: 1; }
.new-input:focus { border-color: #6366f1; }
.new-input.small { width: 60px; flex: none; }
.new-hint { font-size: 0.75rem; color: #888; margin: 4px 0 0; }
.new-size-row { display: flex; gap: 12px; }
.new-actions { display: flex; justify-content: flex-end; gap: 8px; }
.new-cancel-btn { padding: 6px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font-size: 0.85rem; cursor: pointer; }
.new-ok-btn { padding: 6px 20px; border: none; border-radius: 6px; background: #6366f1; color: #fff; font-size: 0.85rem; cursor: pointer; }
.new-ok-btn:hover { background: #4f46e5; }
</style>
