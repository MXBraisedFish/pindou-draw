<template>
  <Teleport to="body">
    <div class="ehl-overlay" @click.self="$emit('close')">
      <div class="ehl-dialog" @click.stop>
        <button class="ehl-close" aria-label="关闭" title="关闭" @click="$emit('close')">
          <img :src="iconClose" alt="" />
        </button>
        <h3>导出高亮配置</h3>
        <p class="ehl-desc">
          选择需要在导出图中高亮的颜色，对应格子将被边框标记，其余区域以灰色遮罩覆盖。
        </p>

        <div class="ehl-filter">
          <input v-model="search" class="ehl-search" placeholder="搜索色号..." />
          <label class="ehl-check-label">
            <input type="checkbox" v-model="onlyUsed" /> 仅展示画布已有颜色
          </label>
          <button class="ehl-btn ehl-btn-clear" @click="clearAll()">清空</button>
          <button class="ehl-btn ehl-btn-all" @click="selectAll()">全选</button>
        </div>

        <div class="ehl-num-row">
          <label class="ehl-num-label">标记序号</label>
          <select v-model="numberMode" class="ehl-num-select">
            <option value="off">关闭</option>
            <option value="row">行顺序标记</option>
            <option value="col">列顺序标记</option>
            <option value="global">全局顺序标记</option>
          </select>
        </div>

        <div class="ehl-grid">
          <div
            v-for="entry in filteredEntries"
            :key="entry.id"
            class="ehl-cell"
            :class="{ checked: checkedIds.has(entry.id) }"
            @click="toggle(entry.id)"
          >
            <div class="ehl-swatch" :style="{ background: swatchBg(entry) }">
              <span v-if="checkedIds.has(entry.id)" class="ehl-check">✓</span>
            </div>
            <span class="ehl-id">{{ entry.id }}</span>
          </div>
        </div>

        <div class="ehl-actions">
          <span class="ehl-count">已选 {{ checkedIds.size }} 色</span>
          <button class="ehl-btn ehl-btn-primary" @click="apply()">确认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useExportStore } from '@/stores/exportStore'
import { usePaletteStore } from '@/stores/palette'
import { useCanvasStore } from '@/stores/canvas'
import type { ColorEntry } from '@/ts/colorCard'
import iconClose from '@/assets/icon/关闭取消.png'

const exportStore = useExportStore()
const paletteStore = usePaletteStore()
const canvasStore = useCanvasStore()

const emit = defineEmits<{ close: [] }>()

const checkedIds = ref(new Set(exportStore.exportHighlightedColorIds))
const search = ref('')
const onlyUsed = ref(true)
const numberMode = ref(exportStore.exportHighlightNumberMode)

const usedHexSet = computed(() => {
  const set = new Set<string>()
  const group = canvasStore.canvasGroup
  if (group) {
    canvasStore.saveActiveToGroup()
    for (const canvasRow of group.canvases) {
      for (const snapshot of canvasRow) {
        for (const layer of snapshot.layers) {
          if (!layer.visible) continue
          for (const row of layer.grid) {
            for (const hex of row) if (hex) set.add(hex)
          }
        }
      }
    }
  } else {
    for (const row of canvasStore.compositeGrid) {
      for (const hex of row) {
        if (hex) set.add(hex)
      }
    }
  }
  return set
})

const filteredEntries = computed(() => {
  let entries = paletteStore.colorEntries
  if (onlyUsed.value) {
    entries = entries.filter((e) => usedHexSet.value.has(e.color1))
  }
  if (search.value) {
    const s = search.value.toUpperCase()
    entries = entries.filter((e) => e.id.toUpperCase().includes(s))
  }
  return entries
})

function swatchBg(entry: ColorEntry): string {
  if (
    entry.color2 &&
    (entry.type === 'glow' || entry.type === 'thermo' || entry.type === 'photo')
  ) {
    return `linear-gradient(135deg, ${entry.color1} 50%, ${entry.color2} 50%)`
  }
  return entry.color1
}

function toggle(id: string) {
  const next = new Set(checkedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  checkedIds.value = next
}

function clearAll() {
  checkedIds.value = new Set()
}

function selectAll() {
  checkedIds.value = new Set(filteredEntries.value.map((e) => e.id))
}

function apply() {
  const ids = [...checkedIds.value]
  exportStore.exportHighlightedColorIds = new Set(ids)
  exportStore.exportHighlightNumberMode = numberMode.value
  emit('close')
}
</script>

<style scoped>
.ehl-overlay {
  position: fixed;
  inset: 0;
  z-index: 31000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ehl-dialog {
  background: #fff;
  border-radius: 12px;
  width: 580px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
  padding: 24px 24px 20px;
  position: relative;
}
.ehl-close {
  position: absolute;
  top: 14px;
  right: 16px;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
}
.ehl-close img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
h3 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.ehl-desc {
  margin: 0 0 14px;
  font-size: 0.82rem;
  color: #888;
}
.ehl-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.ehl-search {
  flex: 1;
  min-width: 120px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
}
.ehl-search:focus {
  border-color: #f59e0b;
}
.ehl-check-label {
  font-size: 0.8rem;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  cursor: pointer;
}
.ehl-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 0.82rem;
}
.ehl-btn:hover {
  background: #e8e8e8;
}
.ehl-btn-primary {
  background: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
  font-size: 0.9rem;
  padding: 7px 20px;
}
.ehl-btn-primary:hover {
  background: #e08f0b;
}
.ehl-num-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ehl-num-label {
  font-size: 0.82rem;
  color: #555;
  white-space: nowrap;
}
.ehl-num-select {
  padding: 5px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.82rem;
  background: #fff;
  color: #333;
  cursor: pointer;
}
.ehl-grid {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
  align-content: flex-start;
}
.ehl-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 56px;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}
.ehl-cell.checked {
  border-color: #f59e0b;
  background: #fff7ed;
}
.ehl-swatch {
  width: 38px;
  height: 38px;
  border-radius: 5px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ehl-check {
  color: #fff;
  font-size: 1.1rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.ehl-id {
  font-size: 0.65rem;
  color: #666;
  margin-top: 3px;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ehl-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}
.ehl-count {
  font-size: 0.88rem;
  color: #888;
}
</style>
