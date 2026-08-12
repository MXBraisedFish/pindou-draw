<template>
  <div class="top-global-bar">
    <div class="global-left">
      <span class="global-logo">拼豆绘制</span>
    </div>
    <div class="global-actions">
      <button class="global-btn" title="新建画布" @click="showNewModal = true">新建</button>
      <button class="global-btn" title="导入" @click="showImportMenu = true">导入</button>
      <button class="global-btn" title="导出" @click="exportStore.showModal = true">导出</button>
      <button class="global-btn" title="保存项目" @click="showSaveMenu = true">保存</button>
      <button class="global-btn" title="设置" @click="showSettings = true">设置</button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showSaveMenu" class="action-overlay" @click.self="showSaveMenu = false">
      <section class="action-card">
        <h3>保存工程</h3>
        <p>选择工程的保存位置</p>
        <button @click="saveAsFile()">
          <strong class="action-title"><img :src="iconFileSave" alt="" />保存工程文件</strong>
          <span>下载 .pindou.json，适合长期保存和跨设备使用</span>
        </button>
        <button @click="openBrowserStorage()">
          <strong class="action-title"><img :src="iconBrowserSave" alt="" />保存在浏览器</strong>
          <span>保存到本机浏览器的手动槽位</span>
        </button>
        <button class="action-cancel" @click="showSaveMenu = false">取消</button>
      </section>
    </div>

    <div v-if="showImportMenu" class="action-overlay" @click.self="showImportMenu = false">
      <section class="action-card">
        <h3>导入工程</h3>
        <p>选择工程来源</p>
        <button @click="requestFileImport()">
          <strong class="action-title"><img :src="iconFileImport" alt="" />从文件导入</strong>
          <span>读取 .pindou.json 或图片文件</span>
        </button>
        <button @click="openBrowserStorage()">
          <strong class="action-title"><img :src="iconBrowserImport" alt="" />从浏览器读取</strong>
          <span>查看手动保存和自动保存的工程</span>
        </button>
        <button class="action-cancel" @click="showImportMenu = false">取消</button>
      </section>
    </div>
  </Teleport>

  <!-- 覆盖确认 -->
  <ConfirmModal
    v-if="showOverwriteConfirm"
    :title="overwriteTarget === 'group' ? '新建画布组' : '新建画布'"
    :message="overwriteMessage"
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
            <button class="new-opt-btn" @click="openImagePicker()">以图生图</button>
          </div>
          <button class="new-cancel-btn" @click="closeNewModal()">取消</button>
        </template>
        <template v-else-if="newStep === 'canvas'">
          <h3 class="new-title">新建画布</h3>
          <div class="new-form">
            <label>名称 <input v-model="newName" class="new-input" /></label>
            <label
              >色卡
              <select v-model="newCard" class="new-input">
                <option v-for="c in paletteStore.cardList" :key="c.name" :value="c.name">
                  {{ c.name }}
                </option>
              </select>
            </label>
            <div class="new-size-row">
              <label
                >宽
                <input
                  type="number"
                  v-model.number="newW"
                  min="1"
                  max="64"
                  class="new-input small"
                  @change="normalizeNewCanvasSize()"
              /></label>
              <label
                >高
                <input
                  type="number"
                  v-model.number="newH"
                  min="1"
                  max="64"
                  class="new-input small"
                  @change="normalizeNewCanvasSize()"
              /></label>
            </div>
          </div>
          <div class="new-actions">
            <button class="new-cancel-btn" @click="newStep = 'menu'">
              <img :src="iconBack" alt="" />返回
            </button>
            <button class="new-ok-btn" @click="doNewCanvas()">创建</button>
          </div>
        </template>
        <template v-else-if="newStep === 'group'">
          <h3 class="new-title">新建画布组</h3>
          <div class="new-form">
            <label>名称 <input v-model="newName" class="new-input" /></label>
            <label
              >色卡
              <select v-model="newCard" class="new-input">
                <option v-for="c in paletteStore.cardList" :key="c.name" :value="c.name">
                  {{ c.name }}
                </option>
              </select>
            </label>
            <div class="new-size-row">
              <label
                >列数
                <input
                  type="number"
                  v-model.number="groupCols"
                  min="1"
                  max="10"
                  class="new-input small"
                  @change="normalizeNewGroupSize()"
              /></label>
              <label
                >行数
                <input
                  type="number"
                  v-model.number="groupRows"
                  min="1"
                  max="10"
                  class="new-input small"
                  @change="normalizeNewGroupSize()"
              /></label>
            </div>
            <label
              >子画布大小
              <input
                type="number"
                v-model.number="groupSubSize"
                min="1"
                max="64"
                class="new-input small"
                @change="normalizeNewGroupSize()"
            /></label>
            <p class="new-hint">
              创建 {{ groupCols }}x{{ groupRows }} 矩阵，共 {{ groupCols * groupRows }} 幅
              {{ groupSubSize }}x{{ groupSubSize }} 子画布
            </p>
          </div>
          <div class="new-actions">
            <button class="new-cancel-btn" @click="newStep = 'menu'">
              <img :src="iconBack" alt="" />返回
            </button>
            <button class="new-ok-btn" @click="doNewGroup()">创建</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>

  <ExportModal v-if="exportStore.showModal" @close="exportStore.showModal = false" />
  <input
    ref="imageFileInput"
    class="visually-hidden"
    type="file"
    accept="image/*"
    @change="onImageFileSelected"
  />
  <ImageToPixelModal
    v-if="showImageToPixel && imageSourceFile"
    :file="imageSourceFile"
    @close="closeImageEditor()"
  />
  <BrowserProjectModal
    v-if="showBrowserStorage"
    @close="showBrowserStorage = false"
    @loaded="showImportMenu = false"
  />
  <SettingsModal v-if="showSettings" @close="showSettings = false" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { clampCanvasSize, clampGroupSize, useCanvasStore } from '@/stores/canvas'
import { useProjectStore } from '@/stores/project'
import { usePaletteStore } from '@/stores/palette'
import { useExportStore } from '@/stores/exportStore'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ExportModal from '@/components/ExportModal.vue'
import ImageToPixelModal from '@/components/ImageToPixelModal.vue'
import BrowserProjectModal from '@/components/BrowserProjectModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import iconFileSave from '@/assets/icon/文件保存.png'
import iconBrowserSave from '@/assets/icon/浏览器保存.png'
import iconFileImport from '@/assets/icon/文件导入.png'
import iconBrowserImport from '@/assets/icon/浏览器导入.png'
import iconBack from '@/assets/icon/退出返回.png'

const canvasStore = useCanvasStore()
const projectStore = useProjectStore()
const paletteStore = usePaletteStore()
const exportStore = useExportStore()
const showSettings = ref(false)
const showSaveMenu = ref(false)
const showImportMenu = ref(false)
const showBrowserStorage = ref(false)

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
const imageFileInput = ref<HTMLInputElement | null>(null)
const imageSourceFile = ref<File | null>(null)
const showOverwriteConfirm = ref(false)
const overwriteTarget = ref<'canvas' | 'group'>('canvas')
const overwriteMessage = computed(() => {
  const current = canvasStore.canvasGroup ? '当前画布组' : '当前画布'
  const target = overwriteTarget.value === 'group' ? '画布组' : '独立画布'
  return `${current}中已有绘制内容，新建${target}将替代全部现有内容。<br>建议先<b>保存工程文件</b>，该操作无法撤回。`
})

function saveAsFile() {
  projectStore.saveProject()
  showSaveMenu.value = false
}

function openBrowserStorage() {
  showSaveMenu.value = false
  showImportMenu.value = false
  showBrowserStorage.value = true
}

function requestFileImport() {
  if (
    canvasStore.hasAnyPixels() &&
    !window.confirm('导入文件将替代当前画布内容。请先保存工程文件，是否继续导入？')
  ) {
    return
  }
  showImportMenu.value = false
  projectStore.importFile()
}

function normalizeNewCanvasSize() {
  newW.value = clampCanvasSize(newW.value)
  newH.value = clampCanvasSize(newH.value)
}

function normalizeNewGroupSize() {
  groupCols.value = clampGroupSize(groupCols.value)
  groupRows.value = clampGroupSize(groupRows.value)
  groupSubSize.value = clampCanvasSize(groupSubSize.value)
}

function closeNewModal() {
  showNewModal.value = false
  newStep.value = 'menu'
}

function openImagePicker() {
  if (!imageFileInput.value) return
  imageFileInput.value.value = ''
  imageFileInput.value.click()
}

function onImageFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  imageSourceFile.value = file
  showImageToPixel.value = true
  closeNewModal()
}

function closeImageEditor() {
  showImageToPixel.value = false
  imageSourceFile.value = null
}

function doNewCanvas() {
  normalizeNewCanvasSize()
  const hasPixels = canvasStore.hasAnyPixels()

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
  normalizeNewCanvasSize()
  showOverwriteConfirm.value = false
  projectStore.projectName = newName.value
  projectStore.createdAt = new Date().toLocaleDateString('zh-CN')
  const card = paletteStore.cardList.find((c) => c.name === newCard.value)
  if (card) paletteStore.loadCard(card)
  canvasStore.newCanvas(newW.value, newH.value)
  closeNewModal()
}

function doNewGroup() {
  normalizeNewGroupSize()
  const hasPixels = canvasStore.hasAnyPixels()
  if (hasPixels) {
    showNewModal.value = false
    overwriteTarget.value = 'group'
    showOverwriteConfirm.value = true
    return
  }
  executeNewGroup()
}

function executeNewGroup() {
  normalizeNewGroupSize()
  showOverwriteConfirm.value = false
  projectStore.projectName = newName.value
  projectStore.createdAt = new Date().toLocaleDateString('zh-CN')
  const card = paletteStore.cardList.find((c) => c.name === newCard.value)
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

.action-overlay {
  position: fixed;
  inset: 0;
  z-index: 30010;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.42);
}
.action-card {
  display: flex;
  box-sizing: border-box;
  width: min(390px, 92vw);
  flex-direction: column;
  gap: 9px;
  padding: 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 54px rgba(15, 23, 42, 0.22);
}
.action-card h3,
.action-card p {
  margin: 0;
}
.action-card h3 {
  color: #1f2937;
  font-size: 1rem;
}
.action-card p {
  margin-bottom: 5px;
  color: #9ca3af;
  font-size: 0.72rem;
}
.action-card > button:not(.action-cancel) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 13px;
  border: 1px solid #dfe3e9;
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.action-card > button:not(.action-cancel):hover {
  border-color: #818cf8;
  background: #f5f7ff;
}
.action-card strong {
  color: #4f46e5;
  font-size: 0.78rem;
}
.action-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.action-title img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.action-card span {
  color: #9ca3af;
  font-size: 0.66rem;
}
.action-cancel {
  margin-top: 3px;
  padding: 8px;
  border: 0;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 0.72rem;
}

.new-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.new-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px 28px;
  max-width: 360px;
  width: 90%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.new-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}
.new-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.new-opt-btn {
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
}
.new-opt-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #6366f1;
}
.new-opt-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.new-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.new-form label {
  font-size: 0.85rem;
  color: #555;
  display: flex;
  align-items: center;
  gap: 6px;
}
.new-input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 0.85rem;
  outline: none;
  flex: 1;
}
.new-input:focus {
  border-color: #6366f1;
}
.new-input.small {
  width: 60px;
  flex: none;
}
.new-hint {
  font-size: 0.75rem;
  color: #888;
  margin: 4px 0 0;
}
.new-size-row {
  display: flex;
  gap: 12px;
}
.new-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.new-cancel-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}
.new-cancel-btn img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.new-ok-btn {
  padding: 6px 20px;
  border: none;
  border-radius: 6px;
  background: #6366f1;
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}
.new-ok-btn:hover {
  background: #4f46e5;
}

.visually-hidden {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
