<template>
  <div class="phone-editor">
    <header class="phone-header">
      <div class="phone-project-title">
        <strong>{{ project.projectName }}</strong
        ><small>{{ canvas.cols }} x {{ canvas.rows }}</small>
      </div>
      <button
        aria-label="撤回"
        :disabled="blocked || canvas.underlayEditMode || !history.canUndo"
        @click="undo()"
      >
        <img :src="iconUndo" alt="" />
      </button>
      <button
        aria-label="回退"
        :disabled="blocked || canvas.underlayEditMode || !history.canRedo"
        @click="redo()"
      >
        <img :src="iconRedo" alt="" />
      </button>
      <button class="phone-menu-button" @click="sheet = 'menu'">菜单</button>
    </header>

    <main class="phone-stage">
      <div v-if="blocked" class="phone-group-notice">
        <strong>当前工程为画布组</strong>
        <p>切换到平板模式继续编辑，或保存工程后新建单画布。</p>
        <button @click="changeDevice('tb')">切换平板模式</button>
        <button @click="project.saveProject()">保存工程文件</button>
        <button @click="sheet = 'new'">新建单画布</button>
      </div>
      <CanvasArea v-else />
      <button v-if="!blocked" class="phone-fit" @click="fitCanvas()">适应画布</button>
    </main>

    <div v-if="canvas.underlayEditMode && !blocked" class="phone-underlay-bar">
      <span>底图编辑</span>
      <button @click="sheet = 'underlay'">透明度 / 缩放</button>
      <button class="phone-primary" @click="canvas.underlayEditMode = false">完成</button>
    </div>
    <nav class="phone-tools" aria-label="绘画工具">
      <button
        v-for="item in phoneTools"
        :key="item.key"
        :class="{ active: tool.activeTool === item.key }"
        :disabled="blocked || canvas.underlayEditMode"
        :aria-pressed="tool.activeTool === item.key"
        @click="tool.setTool(item.key)"
      >
        <img :src="item.icon" alt="" /><span>{{ item.label }}</span>
      </button>
      <button :disabled="blocked" class="phone-color" @click="sheet = 'palette'">
        <span class="phone-color-chip" :style="{ background: palette.currentColor }"></span
        ><span>颜色</span>
      </button>
    </nav>

    <Teleport to="body">
      <Transition name="phone-sheet-slide" mode="out-in">
        <div v-if="sheet" :key="sheet" class="phone-sheet-backdrop" @click.self="sheet = null">
          <section
            class="phone-sheet"
            :class="{ 'phone-palette-sheet': sheet === 'palette' }"
            role="dialog"
            aria-modal="true"
            :aria-label="sheetTitle"
          >
            <header class="phone-sheet-header">
              <button v-if="sheet !== 'menu'" aria-label="返回菜单" @click="sheet = 'menu'">
                <img :src="iconBack" alt="" />
              </button>
              <strong>{{ sheetTitle }}</strong>
              <button class="phone-sheet-close" aria-label="关闭" @click="sheet = null">
                <img :src="iconClose" alt="" />
              </button>
            </header>
            <div class="phone-sheet-body">
              <div v-if="sheet === 'menu'" class="phone-menu-grid">
                <button @click="sheet = 'new'">新建画布</button>
                <button @click="pickImage()">以图生图</button>
                <button @click="projectInput?.click()">导入工程文件</button>
                <button @click="saveFile()">保存工程文件</button>
                <button :disabled="blocked" @click="openExport()">导出草图</button>
                <button :disabled="blocked" @click="sheet = 'palette'">色卡与颜色</button>
                <button :disabled="blocked" @click="sheet = 'underlay'">底图设置</button>
                <button :disabled="blocked" @click="sheet = 'brush'">画笔设置</button>
                <button @click="sheet = 'platform'">使用平台</button>
                <button @click="openUserGuide()">使用教程</button>
              </div>
              <PanelPalette v-else-if="sheet === 'palette'" simple />
              <PanelCanvas v-else-if="sheet === 'underlay'" underlay-only />
              <form v-else-if="sheet === 'new'" class="phone-form" @submit.prevent="createCanvas()">
                <label>工程名称<input v-model="newName" maxlength="100" /></label>
                <div class="phone-size-fields">
                  <label
                    >宽<input
                      v-model.number="newWidth"
                      type="number"
                      min="1"
                      max="64"
                      inputmode="numeric"
                      @change="newWidth = clampCanvasSize(newWidth)"
                  /></label>
                  <label
                    >高<input
                      v-model.number="newHeight"
                      type="number"
                      min="1"
                      max="64"
                      inputmode="numeric"
                      @change="newHeight = clampCanvasSize(newHeight)"
                  /></label>
                </div>
                <label
                  >色卡<select v-model="newCard">
                    <option v-for="card in palette.cardList" :key="card.name" :value="card.name">
                      {{ card.name }}
                    </option>
                  </select></label
                >
                <button type="submit" class="phone-primary">创建画布</button>
              </form>
              <div v-else-if="sheet === 'brush'" class="phone-form">
                <label
                  >铅笔大小：{{ tool.pencilSize
                  }}<input v-model.number="tool.pencilSize" type="range" min="1" max="16"
                /></label>
                <label
                  >橡皮大小：{{ tool.eraserSize
                  }}<input v-model.number="tool.eraserSize" type="range" min="1" max="16"
                /></label>
                <label class="phone-check"
                  ><input v-model="canvas.showGrid" type="checkbox" />显示网格</label
                >
              </div>
              <div v-else-if="sheet === 'platform'" class="phone-menu-grid">
                <button @click="changeDevice('pc')">电脑</button
                ><button @click="changeDevice('tb')">平板</button>
              </div>
              <div v-else-if="sheet === 'export'" class="phone-form">
                <img
                  v-if="exports.previewDataUrl"
                  class="phone-export-preview"
                  :src="exports.previewDataUrl"
                  alt="草图导出预览"
                />
                <p v-if="exports.previewError" role="alert">{{ exports.previewError }}</p>
                <label
                  >文件名称<input v-model="exports.exportName" @change="refreshExport()"
                /></label>
                <label class="phone-check"
                  ><input
                    v-model="exports.showGrid"
                    type="checkbox"
                    @change="refreshExport()"
                  />显示网格</label
                >
                <label class="phone-check"
                  ><input
                    v-model="exports.showColorIds"
                    type="checkbox"
                    @change="refreshExport()"
                  />显示色号</label
                >
                <label class="phone-check"
                  ><input
                    v-model="withStats"
                    type="checkbox"
                    @change="refreshExport()"
                  />附带色号卡与数量</label
                >
                <button
                  class="phone-primary"
                  :disabled="exporting || !!exports.previewError"
                  @click="downloadSketch()"
                >
                  {{ exporting ? '生成中…' : '下载 PNG 草图' }}
                </button>
              </div>
            </div>
            <footer v-if="sheet === 'palette'" class="phone-sheet-footer">
              <button class="phone-primary" @click="sheet = null">完成选色</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
    <input
      ref="projectInput"
      hidden
      type="file"
      accept=".json,.pindou.json,application/json"
      @change="importProject"
    />
    <input ref="imageInput" hidden type="file" accept="image/*" @change="importPhoto" />
    <ImageToPixelModal v-if="imageFile" :file="imageFile" @close="imageFile = null" />
    <UserGuideModal v-if="showUserGuide" @close="showUserGuide = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import CanvasArea from '@/components/CanvasArea.vue'
import PanelPalette from '@/components/PanelPalette.vue'
import PanelCanvas from '@/components/PanelCanvas.vue'
import ImageToPixelModal from '@/components/ImageToPixelModal.vue'
import UserGuideModal from '@/components/UserGuideModal.vue'
import { useCanvasStore, clampCanvasSize } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'
import { useExportStore } from '@/stores/exportStore'
import { useHistoryStore } from '@/stores/history'
import { useToolStore } from '@/stores/tool'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSelectionStore } from '@/stores/selection'
import { useDevice } from '@/composables/useDevice'
import { validatePhoneProject } from '@/ts/phoneProject'
import iconPencil from '@/assets/icon/铅笔.png'
import iconEraser from '@/assets/icon/橡皮.png'
import iconBucket from '@/assets/icon/油漆桶.png'
import iconMove from '@/assets/icon/移动.png'
import iconUndo from '@/assets/icon/撤回.png'
import iconRedo from '@/assets/icon/回退.png'
import iconClose from '@/assets/icon/关闭取消.png'
import iconBack from '@/assets/icon/退出返回.png'

const canvas = useCanvasStore()
const palette = usePaletteStore()
const project = useProjectStore()
const exports = useExportStore()
const history = useHistoryStore()
const tool = useToolStore()
const { changeDevice } = useDevice()
const sheet = ref<'menu' | 'new' | 'palette' | 'underlay' | 'brush' | 'export' | 'platform' | null>(
  null,
)
const titles = {
  menu: '菜单',
  new: '新建画布',
  palette: '色卡与颜色',
  underlay: '底图设置',
  brush: '画笔设置',
  export: '导出草图',
  platform: '使用平台',
}
const sheetTitle = computed(() => (sheet.value ? titles[sheet.value] : ''))
const blocked = computed(() => Boolean(canvas.canvasGroup))
const newName = ref('未命名项目')
const newWidth = ref(16)
const newHeight = ref(16)
const newCard = ref(palette.activeCard?.name ?? '')
const projectInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const imageFile = ref<File | null>(null)
const showUserGuide = ref(false)
function openUserGuide() {
  sheet.value = null
  showUserGuide.value = true
}
const withStats = ref(true)
const exporting = ref(false)
const phoneTools = [
  { key: 'pencil', label: '铅笔', icon: iconPencil },
  { key: 'eraser', label: '橡皮', icon: iconEraser },
  { key: 'bucket', label: '油漆桶', icon: iconBucket },
  { key: 'move', label: '移动', icon: iconMove },
] as const

function fitCanvas() {
  canvas.setZoom(1)
  canvas.setPan(0, 0)
}
function saveFile() {
  project.saveProject()
  sheet.value = null
}
function undo() {
  const entry = history.undo()
  if (entry) canvas.applyLayerSnapshot(entry.layerId, entry.grid)
}
function redo() {
  const entry = history.redo()
  if (entry) canvas.applyLayerSnapshot(entry.layerId, entry.grid)
}
function confirmReplace() {
  return (
    !canvas.hasAnyPixels() || window.confirm('这将替换当前工程。建议先保存工程文件，是否继续？')
  )
}
function prepareDrawing() {
  if (blocked.value) return
  useSelectionStore().clearSelection()
  tool.setTool('pencil')
  canvas.underlayEditMode = false
  canvas.symmetry = 'off'
  palette.clearHighlights()
  fitCanvas()
}
function createCanvas() {
  if (!confirmReplace()) return
  newWidth.value = clampCanvasSize(newWidth.value)
  newHeight.value = clampCanvasSize(newHeight.value)
  canvas.newCanvas(newWidth.value, newHeight.value)
  useWorkspaceStore().resetWorkspace()
  project.projectName = newName.value.trim() || '未命名项目'
  project.createdAt = new Date().toLocaleDateString('zh-CN')
  const card = palette.cardList.find((entry) => entry.name === newCard.value)
  if (card) palette.loadCard(card)
  prepareDrawing()
  sheet.value = null
}
async function importProject(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const json = await file.text()
    validatePhoneProject(json)
    if (!confirmReplace()) return
    // The validated single project replaces any previous group context in full.
    canvas.newCanvas(16, 16)
    await project.loadProjectJson(json)
    prepareDrawing()
    sheet.value = null
  } catch (error) {
    window.alert(
      error instanceof SyntaxError
        ? '无法读取工程，请选择有效的工程 JSON 文件。'
        : error instanceof Error
          ? error.message
          : '导入失败。',
    )
  }
}
function pickImage() {
  imageInput.value?.click()
}
function importPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !confirmReplace()) return
  imageFile.value = file
  sheet.value = null
}
function refreshExport() {
  exports.exportContent = withStats.value ? 'full' : 'sketch-only'
  exports.refreshPreview()
}
function openExport() {
  exports.exportLayerId = null
  exports.initFromCanvas()
  exports.exportFormat = 'png'
  exports.exportFont = 'default'
  exports.exportHighlightActive = false
  exports.exportHighlightOnly = false
  exports.showColorIdsHighlightOnly = false
  refreshExport()
  sheet.value = 'export'
}
async function downloadSketch() {
  if (exporting.value) return
  exporting.value = true
  try {
    await exports.doExport()
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '导出失败。')
  } finally {
    exporting.value = false
  }
}
// Start editing on the canvas as soon as a bottom image is imported or editing is enabled.
watch(
  () => canvas.underlayEditMode,
  (editing) => {
    if (editing && sheet.value === 'underlay') sheet.value = null
  },
)
watch(imageFile, (next, previous) => {
  if (!next && previous) prepareDrawing()
})
onMounted(() => {
  if (!blocked.value) prepareDrawing()
})
onBeforeUnmount(() => {
  canvas.underlayEditMode = false
})
</script>
