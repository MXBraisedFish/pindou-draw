<template>
  <Teleport to="body">
    <div class="cr-overlay" @click.self="$emit('close')">
      <div class="cr-dialog" @click.stop>
        <button class="cr-close" @click="$emit('close')">✕</button>
        <h3>颜色替换</h3>

        <!-- 源色（画布上已有颜色） -->
        <div class="cr-section">
          <p class="cr-label">选择要替换的颜色（多选）<span class="cr-hint">共 {{ usedColors.length }} 种颜色</span></p>
          <div class="cr-used-grid">
            <div
              v-for="uc in usedColors"
              :key="uc.hex"
              class="cr-used-cell"
              :class="{ selected: selectedHexes.has(uc.hex) }"
              @click="toggleSource(uc.hex)"
            >
              <div class="cr-used-swatch" :style="{ background: uc.hex }">
                <span v-if="selectedHexes.has(uc.hex)" class="cr-check">✓</span>
              </div>
              <span class="cr-used-count">x{{ uc.count }}</span>
            </div>
          </div>
          <div v-if="usedColors.length === 0" class="cr-empty">画布上暂无颜色</div>
        </div>

        <!-- 目标色（色卡选色） -->
        <div class="cr-section">
          <p class="cr-label">替换为目标颜色</p>
          <div class="cr-target-row">
            <div
              v-if="targetEntry"
              class="cr-target-preview"
              :style="{ background: swatchBg(targetEntry) }"
            ></div>
            <span v-if="targetEntry" class="cr-target-id">{{ targetEntry.id }}</span>
            <span v-else class="cr-target-none">未选择</span>
          </div>
          <input
            v-model="targetSearch"
            class="cr-search"
            placeholder="搜索目标色号..."
          />
          <div class="cr-target-grid">
            <div
              v-for="entry in filteredTargets"
              :key="entry.id"
              class="cr-target-cell"
              :class="{ active: targetEntry?.id === entry.id }"
              :title="`${entry.id} · ${entry.color1}`"
              @click="targetEntry = entry"
            >
              <div class="cr-target-swatch" :style="{ background: swatchBg(entry) }"></div>
              <span class="cr-target-id-sm">{{ entry.id }}</span>
            </div>
          </div>
        </div>

        <div class="cr-actions">
          <span class="cr-info">
            将 <strong>{{ selectedHexes.size }}</strong> 种颜色替换为
            <strong>{{ targetEntry?.id ?? '?' }}</strong>
          </span>
          <button
            class="cr-btn cr-btn-primary"
            :disabled="selectedHexes.size === 0 || !targetEntry"
            @click="doReplace()"
          >替换</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import type { ColorEntry } from '@/ts/colorCard'

const canvasStore = useCanvasStore()
const paletteStore = usePaletteStore()

defineEmits<{ close: [] }>()

const selectedHexes = ref(new Set<string>())
const targetEntry = ref<ColorEntry | null>(null)
const targetSearch = ref('')

// 聚合所有图层中的颜色
const usedColors = computed(() => {
  const map = new Map<string, number>()
  for (const layer of canvasStore.layers) {
    for (const row of layer.grid) {
      for (const hex of row) {
        if (hex) map.set(hex, (map.get(hex) ?? 0) + 1)
      }
    }
  }
  return Array.from(map.entries())
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
})

const filteredTargets = computed(() => {
  const entries = paletteStore.colorEntries
  if (!targetSearch.value) return entries
  const s = targetSearch.value.toUpperCase()
  return entries.filter(e => e.id.toUpperCase().includes(s))
})

function swatchBg(entry: ColorEntry): string {
  if (entry.color2 && (entry.type === 'glow' || entry.type === 'thermo' || entry.type === 'photo')) {
    return `linear-gradient(135deg, ${entry.color1} 50%, ${entry.color2} 50%)`
  }
  return entry.color1
}

function toggleSource(hex: string) {
  const next = new Set(selectedHexes.value)
  if (next.has(hex)) {
    next.delete(hex)
  } else {
    next.add(hex)
  }
  selectedHexes.value = next
}

function doReplace() {
  if (selectedHexes.value.size === 0 || !targetEntry.value) return
  const targetHex = targetEntry.value.color1
  const srcSet = selectedHexes.value

  for (const layer of canvasStore.layers) {
    for (const row of layer.grid) {
      for (let c = 0; c < row.length; c++) {
        if (row[c] && srcSet.has(row[c]!)) {
          row[c] = targetHex
        }
      }
    }
  }
  canvasStore.buildComposite()
  selectedHexes.value = new Set()
}
</script>

<style scoped>
.cr-overlay {
  position: fixed; inset: 0; z-index: 11000;
  background: rgba(0,0,0,0.45); display: flex;
  align-items: center; justify-content: center;
}
.cr-dialog {
  background: #fff; border-radius: 12px;
  width: 620px; max-height: 80vh; display: flex; flex-direction: column;
  box-shadow: 0 12px 36px rgba(0,0,0,0.2);
  padding: 24px 24px 20px;
  position: relative;
}
.cr-close {
  position: absolute; top: 12px; right: 14px;
  border: none; background: none; font-size: 1.2rem; cursor: pointer; color: #999;
}
h3 { margin: 0 0 12px; font-size: 1.1rem; }
.cr-section { margin-bottom: 14px; }
.cr-label { margin: 0 0 6px; font-size: 0.85rem; color: #555; }
.cr-hint { color: #aaa; margin-left: 6px; font-size: 0.75rem; }
.cr-used-grid {
  display: flex; flex-wrap: wrap; gap: 5px;
  max-height: 140px; overflow-y: auto; padding: 2px;
}
.cr-used-cell {
  display: flex; flex-direction: column; align-items: center;
  width: 52px; cursor: pointer; padding: 4px; border-radius: 6px;
  border: 2px solid transparent; transition: border-color 0.15s;
}
.cr-used-cell.selected { border-color: #ef4444; background: #fef2f2; }
.cr-used-swatch {
  width: 34px; height: 34px; border-radius: 5px; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.cr-check {
  color: #fff; font-size: 0.9rem; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.cr-used-count {
  font-size: 0.6rem; color: #888; margin-top: 1px;
}
.cr-empty { color: #aaa; font-size: 0.85rem; }
.cr-target-row {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  min-height: 36px;
}
.cr-target-preview {
  width: 36px; height: 36px; border-radius: 6px; border: 1px solid #ddd;
  flex-shrink: 0;
}
.cr-target-id { font-weight: 600; font-size: 0.9rem; }
.cr-target-none { color: #aaa; font-size: 0.85rem; }
.cr-search {
  width: 100%; padding: 5px 8px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 0.85rem; outline: none; margin-bottom: 6px; box-sizing: border-box;
}
.cr-search:focus { border-color: #f59e0b; }
.cr-target-grid {
  display: flex; flex-wrap: wrap; gap: 4px;
  max-height: 130px; overflow-y: auto; padding: 2px;
}
.cr-target-cell {
  display: flex; flex-direction: column; align-items: center;
  width: 50px; cursor: pointer; padding: 3px; border-radius: 4px;
  border: 2px solid transparent;
}
.cr-target-cell.active { border-color: #f59e0b; background: #fffbeb; }
.cr-target-swatch {
  width: 30px; height: 30px; border-radius: 3px;
}
.cr-target-id-sm {
  font-size: 0.55rem; color: #888; margin-top: 1px;
  max-width: 38px; overflow: hidden; text-overflow: ellipsis;
}
.cr-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid #eee;
}
.cr-info { font-size: 0.8rem; color: #888; }
.cr-info strong { color: #555; }
.cr-btn {
  padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px;
  background: #f5f5f5; cursor: pointer; font-size: 0.85rem;
}
.cr-btn-primary {
  background: #f59e0b; color: #fff; border-color: #f59e0b;
}
.cr-btn-primary:hover { background: #e08f0b; }
.cr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
