<template>
  <div class="top-context-bar">
    <div class="context-tool-name" v-if="toolStore.activeTool">{{ toolLabel }}</div>
    <div class="context-params">
      <template v-if="toolStore.activeTool === 'pencil'">
        <label class="param-item">
          大小
          <input
            type="range"
            min="1"
            max="5"
            :value="toolStore.pencilSize"
            @input="toolStore.setPencilSize(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="param-val">{{ toolStore.pencilSize }}</span>
        </label>
      </template>
      <template v-else-if="toolStore.activeTool === 'eraser'">
        <label class="param-item">
          大小
          <input
            type="range"
            min="1"
            max="5"
            :value="toolStore.eraserSize"
            @input="toolStore.setEraserSize(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="param-val">{{ toolStore.eraserSize }}</span>
        </label>
      </template>
      <template v-else-if="toolStore.activeTool === 'select'">
        <button
          v-for="s in selectShapes"
          :key="s.key"
          class="sel-shape-btn"
          :class="{ active: toolStore.selectShape === s.key }"
          :title="s.label"
          @click="toolStore.setSelectShape(s.key)"
        ><img :src="s.icon" class="sel-icon" alt="" /></button>
        <span class="sel-sep">|</span>
        <button
          class="sel-shape-btn"
          :class="{ active: toolStore.selectMode === 'add' }"
          title="添加选区"
          @click="toolStore.setSelectMode('add')"
        ><img :src="iconAddSel" class="sel-icon" alt="" /></button>
        <button
          class="sel-shape-btn"
          :class="{ active: toolStore.selectMode === 'remove' }"
          title="删除选区"
          @click="toolStore.setSelectMode('remove')"
        ><img :src="iconRemoveSel" class="sel-icon" alt="" /></button>
        <span class="sel-sep">|</span>
        <button class="sel-shape-btn" :disabled="!selectionStore.hasSelection" title="复制" @click="selectionStore.copySelection()">复制</button>
        <button class="sel-shape-btn" :disabled="!selectionStore.hasSelection" title="剪切" @click="selectionStore.cutSelection()">剪切</button>
        <span class="sel-sep">|</span>
        <button class="sel-shape-btn" :disabled="!selectionStore.hasSelection" title="反向选择" @click="selectionStore.invertSelection()">反向</button>
        <button class="sel-shape-btn" :disabled="!selectionStore.hasSelection" title="清除选区" @click="selectionStore.clearSelection()">清除</button>
      </template>
      <template v-else-if="toolStore.activeTool === 'geometry'">
        <button
          v-for="g in geoShapes"
          :key="g.key"
          class="sel-shape-btn"
          :class="{ active: toolStore.geometryShape === g.key }"
          :title="g.label"
          @click="toolStore.setGeometryShape(g.key)"
        ><img :src="g.icon" class="sel-icon" alt="" /></button>
        <template v-if="toolStore.geometryShape !== 'line'">
          <span class="sel-sep">|</span>
          <button class="sel-shape-btn" :class="{ active: toolStore.geometryFill }"
            @click="toolStore.geometryFill = !toolStore.geometryFill">填充</button>
        </template>
      </template>
      <span v-else-if="!selectionStore.hasClipboard" class="param-hint">无额外设置</span>
      <button v-if="selectionStore.hasClipboard" class="sel-shape-btn" title="粘贴到光标位置" @click="doPaste()">粘贴</button>
    </div>
    <div class="context-zoom">
      <label class="param-item">
        缩放
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.01"
          :value="canvasStore.zoom"
          @input="canvasStore.setZoom(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="param-val">{{ Math.round(canvasStore.zoom * 100) }}%</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore, type SelectShape, type GeometryShape } from '@/stores/tool'
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import iconRect from '@/assets/icon/矩形选区.png'
import iconEllipse from '@/assets/icon/圆形选区.png'
import iconLine from '@/assets/icon/直线选区.png'
import iconLasso from '@/assets/icon/套索选区.png'
import iconAddSel from '@/assets/icon/添加选区.png'
import iconRemoveSel from '@/assets/icon/删除选区.png'
import iconGeoLine from '@/assets/icon/直线.png'
import iconGeoEllipse from '@/assets/icon/椭圆.png'

const toolStore = useToolStore()
const canvasStore = useCanvasStore()
const selectionStore = useSelectionStore()

const selectShapes: { key: SelectShape; label: string; icon: string }[] = [
  { key: 'rect', label: '矩形', icon: iconRect },
  { key: 'ellipse', label: '椭圆', icon: iconEllipse },
  { key: 'line', label: '直线', icon: iconLine },
  { key: 'lasso', label: '套索', icon: iconLasso },
]

const geoShapes: { key: GeometryShape; label: string; icon: string }[] = [
  { key: 'line', label: '直线', icon: iconGeoLine },
  { key: 'rect', label: '矩形', icon: iconRect },
  { key: 'ellipse', label: '椭圆', icon: iconGeoEllipse },
]

const labels: Record<string, string> = {
  move: '移动',
  pencil: '铅笔',
  eraser: '橡皮',
  bucket: '油漆桶',
  select: '选框',
  picker: '取色器',
}

function doPaste() {
  selectionStore.pasteSelection(canvasStore.cursorRow, canvasStore.cursorCol)
}

const toolLabel = computed(() => labels[toolStore.activeTool] ?? '')
</script>

<style scoped>
.top-context-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  background: #fafafa;
  border-bottom: 1px solid #e5e7eb;
}

.context-tool-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: #333;
  white-space: nowrap;
}

.context-params {
  display: flex;
  align-items: center;
  gap: 10px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: #555;
}

.param-item input[type='range'] {
  width: 80px;
  height: 4px;
}

.param-val {
  font-weight: 600;
  color: #6366f1;
  min-width: 16px;
}

.param-hint {
  font-size: 0.8rem;
  color: #999;
}

.sel-shape-btn {
  padding: 3px 6px;
  border: 1px solid #c5c9d2;
  border-radius: 5px;
  background: #fff;
  font-size: 0.75rem;
  color: #555;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  display: flex;
  align-items: center;
}
.sel-shape-btn:hover:not(:disabled) {
  border-color: #a5aab5;
  background: #f5f5f5;
}
.sel-shape-btn.active {
  background: #eef2ff;
  color: #6366f1;
  border-color: #6366f1;
}
.sel-shape-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.sel-icon {
  width: 16px;
  height: 16px;
  display: block;
}
.sel-sep {
  color: #ddd;
  font-size: 0.8rem;
}
</style>
