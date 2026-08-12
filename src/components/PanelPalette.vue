<template>
  <div class="panel-palette">
    <!-- 色卡下拉选择 -->
    <select
      class="palette-card-select"
      :value="paletteStore.activeCard?.name ?? ''"
      @change="paletteStore.switchCard(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="card in paletteStore.cardList"
        :key="card.name"
        :value="card.name"
      >
        {{ card.name }}
      </option>
    </select>

    <!-- 当前颜色大预览块 -->
    <div class="palette-preview" v-if="paletteStore.currentEntry">
      <div
        class="preview-block"
        :class="'preview-' + paletteStore.currentEntry.type"
        :style="previewStyle"
      >
        <span v-if="paletteStore.currentEntry.type === 'transparent'" class="preview-tag">透明</span>
        <span v-else-if="paletteStore.currentEntry.type === 'pearl'" class="preview-tag">珠光</span>
      </div>
      <div class="preview-info">
        <span class="preview-id">{{ paletteStore.currentEntry.id }}</span>
        <span class="preview-type">
          {{ typeLabel(paletteStore.currentEntry.type) }}
        </span>
      </div>
      <div class="preview-hexes">
        <span class="preview-hex">{{ paletteStore.currentEntry.color1 }}</span>
        <span v-if="paletteStore.currentEntry.color2" class="preview-hex preview-hex2">
          → {{ paletteStore.currentEntry.color2 }}
        </span>
      </div>
    </div>

    <!-- 颜色筛选与搜索 -->
    <div class="palette-filters">
      <div class="filter-types">
        <button
          v-for="ft in typeFilters"
          :key="ft.key"
          class="filter-type-btn"
          :class="{ active: filterType === ft.key }"
          @click="filterType = ft.key"
        >
          {{ ft.label }}
        </button>
      </div>
      <input
        v-model="filterId"
        class="filter-id-input"
        type="text"
        placeholder="搜索色号..."
      />
    </div>

    <!-- 颜色工具按钮 -->
    <div class="palette-tools">
      <button
        class="tool-btn tool-hl"
        :class="{ active: paletteStore.highlightActive }"
        title="颜色高亮"
        @click="toggleHighlight()"
      >◈ 高亮</button>
      <button
        class="tool-btn tool-replace"
        title="颜色替换"
        @click="showReplaceModal = true"
      >⇄ 替换</button>
    </div>

    <!-- 色块网格 -->
    <div class="palette-grid-wrapper">
      <div class="palette-grid">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="palette-swatch-cell"
          :class="{ active: paletteStore.currentColorId === entry.id }"
          :title="`${entry.id} · ${typeLabel(entry.type)} · ${entry.color1}`"
          @click="paletteStore.setColor(entry.id)"
        >
          <div class="swatch-color" :style="swatchBg(entry)">
            <img
              v-if="entry.type !== 'solid'"
              :src="typeIconSrc(entry.type)"
              class="swatch-badge"
          />
          </div>
          <span class="swatch-id">{{ entry.id }}</span>
        </div>
      </div>
    </div>

    <!-- 色卡切换确认弹窗 -->
    <ConfirmModal
      v-if="paletteStore.pendingSwitch"
      title="切换色卡"
      :message="`切换色卡会自动匹配当前像素于切换色卡最近的颜色<br>可能导致像素色块存在色差<br>且特殊像素（透明、珠光、光变、温变、夜光）无法转换，会被直接清空<br><b>该操作不可撤回</b><br><br>原色卡：${paletteStore.pendingSwitch.oldName}<br>新色卡：${paletteStore.pendingSwitch.newName}`"
      confirm-text="确认切换"
      cancel-text="取消"
      @confirm="paletteStore.executeCardSwitch()"
      @cancel="paletteStore.cancelCardSwitch()"
    />

    <!-- 颜色高亮弹窗 -->
    <HighlightModal
      v-if="showHighlightModal"
      @close="showHighlightModal = false"
    />

    <!-- 颜色替换弹窗 -->
    <ColorReplaceModal
      v-if="showReplaceModal"
      @close="showReplaceModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePaletteStore } from '@/stores/palette'
import ConfirmModal from '@/components/ConfirmModal.vue'
import HighlightModal from '@/components/HighlightModal.vue'
import ColorReplaceModal from '@/components/ColorReplaceModal.vue'
import { COLOR_TYPE_LABELS, type ColorType } from '@/ts/colorCard'
import iconTransparent from '@/assets/icon/透明.png'
import iconPearl from '@/assets/icon/珠光.png'
import iconGlow from '@/assets/icon/夜光.png'
import iconThermo from '@/assets/icon/温变.png'
import iconPhoto from '@/assets/icon/光变.png'

const typeIcons: Record<ColorType, string | null> = {
  solid: null,
  transparent: iconTransparent,
  pearl: iconPearl,
  glow: iconGlow,
  thermo: iconThermo,
  photo: iconPhoto,
}

function typeIconSrc(type: ColorType): string | undefined {
  return typeIcons[type] ?? undefined
}

const paletteStore = usePaletteStore()

const showHighlightModal = ref(false)
const showReplaceModal = ref(false)

const filterType = ref<'' | ColorType>('solid')
const filterId = ref('')

const typeFilters = [
  { key: '' as const, label: '全部' },
  { key: 'solid' as const, label: '固定色' },
  { key: 'transparent' as const, label: '透明' },
  { key: 'pearl' as const, label: '珠光' },
  { key: 'glow' as const, label: '夜光' },
  { key: 'thermo' as const, label: '温变' },
  { key: 'photo' as const, label: '光变' },
]

const filteredEntries = computed(() => {
  let list = paletteStore.colorEntries
  if (filterType.value) {
    list = list.filter(e => e.type === filterType.value)
  }
  if (filterId.value.trim()) {
    const q = filterId.value.trim().toLowerCase()
    list = list.filter(e => e.id.toLowerCase().includes(q))
  }
  return list
})

const previewStyle = computed(() => {
  const entry = paletteStore.currentEntry
  if (!entry) return {}
  const c1 = entry.color1
  const c2 = entry.color2
  if ((entry.type === 'glow' || entry.type === 'thermo' || entry.type === 'photo') && c2) {
    return { background: `linear-gradient(to right, ${c1}, ${c2})` }
  }
  return { background: c1 }
})

function toggleHighlight() {
  if (paletteStore.highlightActive) {
    paletteStore.clearHighlights()
  } else {
    showHighlightModal.value = true
  }
}

function swatchBg(entry: { type: ColorType; color1: string; color2: string | null }) {
  const c1 = entry.color1
  const c2 = entry.color2
  if ((entry.type === 'glow' || entry.type === 'thermo' || entry.type === 'photo') && c2) {
    return { background: `linear-gradient(to right, ${c1}, ${c2})` }
  }
  return { background: c1 }
}

function typeLabel(type: ColorType): string {
  return COLOR_TYPE_LABELS[type]
}
</script>

<style scoped>
.panel-palette {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.palette-card-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  background: #fff;
  color: #333;
  cursor: pointer;
}

.palette-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-block {
  width: 100%;
  height: 52px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  position: relative;
  overflow: hidden;
}

.preview-transparent {
  opacity: 0.75;
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}

.preview-pearl::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.5) 0%, transparent 50%, rgba(255,255,255,0.2) 100%);
}

.preview-tag {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 0.8rem;
  color: rgba(0,0,0,0.45);
  background: rgba(255,255,255,0.6);
  border-radius: 2px;
  padding: 0 3px;
  z-index: 1;
}

.preview-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-id {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.preview-type {
  font-size: 0.95rem;
  color: #888;
}

.preview-hexes {
  display: flex;
  gap: 8px;
}

.preview-hex {
  font-size: 1rem;
  font-family: monospace;
  color: #555;
}

.preview-hex2 {
  color: #999;
}

.palette-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-types {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.filter-type-btn {
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  background: #fff;
  font-size: 0.85rem;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.filter-type-btn.active {
  background: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
}

.filter-type-btn:hover {
  border-color: #9ca3af;
}

.filter-id-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 1rem;
  color: #333;
  outline: none;
}

.filter-id-input:focus {
  border-color: #6366f1;
}

.palette-tools {
  display: flex; gap: 6px;
}
.tool-btn {
  flex: 1; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;
  background: #f9fafb; cursor: pointer; font-size: 0.8rem; color: #555;
  transition: background 0.15s;
}
.tool-btn:hover { background: #e8e8e8; }
.tool-hl.active {
  background: #fef3c7; border-color: #f59e0b; color: #92400e;
}

.palette-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
}

.palette-swatch-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 6px;
  transition: all 0.15s;
  background: none;
}

.palette-swatch-cell:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}

.palette-swatch-cell.active {
  border-color: #6366f1;
  background: #eef2ff;
  box-shadow: 0 0 0 1px #6366f1;
}

.swatch-color {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.swatch-id {
  font-size: 0.75rem;
  font-weight: 600;
  color: #444;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swatch-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  pointer-events: none;
}
</style>
