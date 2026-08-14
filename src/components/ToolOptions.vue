<template>
  <div class="tool-options" :class="{ vertical }">
    <template v-if="toolStore.activeTool === 'pencil'">
      <label class="option-range">
        <span>画笔大小</span>
        <input
          type="range"
          min="1"
          max="5"
          :value="toolStore.pencilSize"
          @input="toolStore.setPencilSize(Number(($event.target as HTMLInputElement).value))"
        />
        <strong>{{ toolStore.pencilSize }}</strong>
      </label>
    </template>

    <template v-else-if="toolStore.activeTool === 'eraser'">
      <label class="option-range">
        <span>橡皮大小</span>
        <input
          type="range"
          min="1"
          max="5"
          :value="toolStore.eraserSize"
          @input="toolStore.setEraserSize(Number(($event.target as HTMLInputElement).value))"
        />
        <strong>{{ toolStore.eraserSize }}</strong>
      </label>
    </template>

    <template v-else-if="toolStore.activeTool === 'select'">
      <section class="option-section">
        <span class="option-label">选区形状</span>
        <div class="option-buttons">
          <button
            v-for="shape in selectShapes"
            :key="shape.key"
            :class="{ active: toolStore.selectShape === shape.key }"
            :title="shape.label"
            @click="toolStore.setSelectShape(shape.key)"
          >
            <img :src="shape.icon" alt="" />
            <span>{{ shape.label }}</span>
          </button>
        </div>
      </section>

      <section class="option-section">
        <span class="option-label">组合方式</span>
        <div class="option-buttons">
          <button
            :class="{ active: toolStore.selectMode === 'replace' }"
            title="新建选区并替换现有选区"
            @click="toolStore.setSelectMode('replace')"
          >
            <img :src="iconSelect" alt="" />
            <span>新建</span>
          </button>
          <button
            :class="{ active: toolStore.selectMode === 'add' }"
            title="添加到选区"
            @click="toolStore.setSelectMode('add')"
          >
            <img :src="iconAddSel" alt="" />
            <span>添加</span>
          </button>
          <button
            :class="{ active: toolStore.selectMode === 'remove' }"
            title="从选区中删除"
            @click="toolStore.setSelectMode('remove')"
          >
            <img :src="iconRemoveSel" alt="" />
            <span>删除</span>
          </button>
        </div>
      </section>

      <section class="option-section">
        <span class="option-label">编辑</span>
        <div class="option-buttons text-actions">
          <button @click="selectionStore.selectAll()">全选</button>
          <button :disabled="!selectionStore.hasSelection" @click="selectionStore.copySelection()">
            复制
          </button>
          <button :disabled="!selectionStore.hasSelection" @click="selectionStore.cutSelection()">
            剪切
          </button>
          <button :disabled="!selectionStore.hasClipboard" @click="paste()">粘贴</button>
          <button
            :disabled="!selectionStore.hasSelection"
            @click="selectionStore.deleteSelectionContent()"
          >
            删除内容
          </button>
          <button
            :disabled="!selectionStore.hasSelection"
            @click="selectionStore.invertSelection()"
          >
            反选
          </button>
          <button :disabled="!selectionStore.hasSelection" @click="selectionStore.clearSelection()">
            取消选区
          </button>
        </div>
      </section>
      <p class="option-tip">绘画、填充、擦除、几何和移动操作均限制在选区内。</p>
    </template>

    <template v-else-if="toolStore.activeTool === 'geometry'">
      <section class="option-section">
        <span class="option-label">几何形状</span>
        <div class="option-buttons">
          <button
            v-for="shape in geometryShapes"
            :key="shape.key"
            :class="{ active: toolStore.geometryShape === shape.key }"
            :title="shape.label"
            @click="toolStore.setGeometryShape(shape.key)"
          >
            <img :src="shape.icon" alt="" />
            <span>{{ shape.label }}</span>
          </button>
          <button
            v-if="toolStore.geometryShape !== 'line'"
            :class="{ active: toolStore.geometryFill }"
            @click="toolStore.geometryFill = !toolStore.geometryFill"
          >
            填充
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import { useToolStore, type GeometryShape, type SelectShape } from '@/stores/tool'
import iconRect from '@/assets/icon/矩形选区.png'
import iconEllipse from '@/assets/icon/圆形选区.png'
import iconLine from '@/assets/icon/直线选区.png'
import iconLasso from '@/assets/icon/套索选区.png'
import iconAddSel from '@/assets/icon/添加选区.png'
import iconRemoveSel from '@/assets/icon/删除选区.png'
import iconSelect from '@/assets/icon/选区.png'
import iconGeoLine from '@/assets/icon/直线.png'
import iconGeoEllipse from '@/assets/icon/椭圆.png'

defineProps<{ vertical?: boolean }>()

const toolStore = useToolStore()
const canvasStore = useCanvasStore()
const selectionStore = useSelectionStore()

const selectShapes: { key: SelectShape; label: string; icon: string }[] = [
  { key: 'rect', label: '方形', icon: iconRect },
  { key: 'ellipse', label: '圆形', icon: iconEllipse },
  { key: 'line', label: '直线', icon: iconLine },
  { key: 'lasso', label: '任意', icon: iconLasso },
]

const geometryShapes: { key: GeometryShape; label: string; icon: string }[] = [
  { key: 'line', label: '直线', icon: iconGeoLine },
  { key: 'rect', label: '矩形', icon: iconRect },
  { key: 'ellipse', label: '椭圆', icon: iconGeoEllipse },
]

function paste() {
  selectionStore.pasteSelection(canvasStore.cursorRow, canvasStore.cursorCol)
}
</script>

<style scoped>
.tool-options {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tool-options::-webkit-scrollbar {
  display: none;
}

.tool-options.vertical {
  flex: none;
  width: min(360px, calc(100vw - 130px));
  max-height: min(620px, calc(100vh - 96px));
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  overflow-y: auto;
}

.option-range,
.option-section,
.option-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-section {
  flex: 0 0 auto;
}

.vertical .option-range,
.vertical .option-section {
  align-items: stretch;
  flex-direction: column;
}

.option-range,
.option-label {
  color: #4b5563;
  font-size: 0.78rem;
  white-space: nowrap;
}

.option-range input {
  width: 100px;
}

.vertical .option-range input {
  width: 100%;
}

.option-range strong {
  min-width: 22px;
  color: #6366f1;
}

.option-label {
  font-weight: 600;
}

.option-buttons {
  flex-wrap: wrap;
}

.option-buttons button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid #cfd4de;
  border-radius: 7px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
  font-size: 0.75rem;
  white-space: nowrap;
}

.option-buttons button.active {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4f46e5;
}

.option-buttons button:disabled {
  cursor: default;
  opacity: 0.38;
}

.option-buttons img {
  width: 17px;
  height: 17px;
  object-fit: contain;
}

.option-tip {
  margin: 0;
  color: #8a93a4;
  font-size: 0.72rem;
  line-height: 1.5;
}
</style>
