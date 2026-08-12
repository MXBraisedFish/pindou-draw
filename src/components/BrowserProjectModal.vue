<template>
  <Teleport to="body">
    <div class="storage-overlay" @click.self="emit('close')">
      <section class="storage-dialog">
        <header class="storage-header">
          <div>
            <h2>浏览器工程</h2>
            <p>9 个手动槽位，另有 1 个不可手动覆盖的自动保存槽位。</p>
          </div>
          <button class="close-button" @click="emit('close')">x</button>
        </header>

        <p class="storage-tip">
          浏览器存储仅作为临时保存，清理浏览器缓存或站点数据后可能被删除；若要长期存储，请导出工程文件。
        </p>

        <div v-if="errorMessage" class="storage-error">{{ errorMessage }}</div>

        <div class="storage-list">
          <article v-for="slot in slots" :key="slot" class="storage-card"
            :class="{ selected: selectedSlot === slot, auto: slot === 'auto' }" @click="selectedSlot = slot">
            <div class="slot-preview">
              <img v-if="recordFor(slot)?.preview" :src="recordFor(slot)?.preview" alt="工程预览" />
              <span v-else>空槽位</span>
              <b>{{ slot === 'auto' ? '自动保存' : `槽位 ${slot}` }}</b>
            </div>
            <div class="slot-info">
              <strong>{{ recordFor(slot)?.name || '尚未保存' }}</strong>
              <span>{{ recordFor(slot)?.summary || '可保存当前工程' }}</span>
              <time v-if="recordFor(slot)">{{ formatTime(recordFor(slot)!.savedAt) }}</time>
            </div>
            <div class="slot-actions" @click.stop>
              <button v-if="slot !== 'auto'" class="save-button" @click="saveSlot(slot)">
                {{ recordFor(slot) ? '覆盖保存' : '保存' }}
              </button>
              <button class="load-button" :disabled="!recordFor(slot)" @click="loadSlot(slot)">
                读取
              </button>
              <button v-if="slot !== 'auto' && recordFor(slot)" class="delete-button" @click="deleteSlot(slot)">
                删除
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useProjectStore } from '@/stores/project'
import { deleteStoredProject, type ProjectSlot, type StoredProject } from '@/ts/projectStorage'

const emit = defineEmits<{ close: []; loaded: [] }>()
const projectStore = useProjectStore()
const canvasStore = useCanvasStore()
const records = ref<StoredProject[]>([])
const selectedSlot = ref<ProjectSlot>('auto')
const errorMessage = ref('')
const slots: ProjectSlot[] = ['auto', 1, 2, 3, 4, 5, 6, 7, 8, 9]

function recordFor(slot: ProjectSlot) {
  return records.value.find((record) => record.slot === slot)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function refresh() {
  try {
    records.value = await projectStore.listBrowserProjects()
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取浏览器工程。'
  }
}

async function saveSlot(slot: Exclude<ProjectSlot, 'auto'>) {
  if (recordFor(slot) && !window.confirm(`槽位 ${slot} 已有工程，确认覆盖吗？`)) return
  try {
    await projectStore.saveToBrowser(slot)
    await refresh()
    selectedSlot.value = slot
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败。'
  }
}

async function loadSlot(slot: ProjectSlot) {
  if (
    canvasStore.hasAnyPixels() &&
    !window.confirm('读取该工程将替代当前画布内容。建议先导出工程文件，是否继续？')
  ) {
    return
  }
  try {
    await projectStore.loadFromBrowser(slot)
    emit('loaded')
    emit('close')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取失败。'
  }
}

async function deleteSlot(slot: Exclude<ProjectSlot, 'auto'>) {
  if (!window.confirm(`确认删除槽位 ${slot} 中的工程吗？`)) return
  await deleteStoredProject(slot)
  await refresh()
}

onMounted(refresh)
</script>

<style scoped>
.storage-overlay {
  position: fixed;
  inset: 0;
  z-index: 32000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.48);
}

.storage-dialog {
  box-sizing: border-box;
  width: min(920px, 94vw);
  max-height: 88vh;
  overflow: hidden;
  border-radius: 16px;
  background: #f7f8fb;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.25);
}

.storage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 22px 14px;
  background: #fff;
}

.storage-header h2,
.storage-header p {
  margin: 0;
}

.storage-header h2 {
  font-size: 1.05rem;
}

.storage-header p {
  margin-top: 5px;
  color: #9ca3af;
  font-size: 0.72rem;
}

.close-button {
  border: 0;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 1.5rem;
}

.storage-tip,
.storage-error {
  margin: 12px 18px 0;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.7rem;
  line-height: 1.55;
}

.storage-tip {
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.storage-error {
  background: #fef2f2;
  color: #b91c1c;
}

.storage-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: calc(88vh - 160px);
  overflow-y: auto;
  padding: 14px 18px 20px;
}

.storage-card {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
  border: 1px solid #e1e5eb;
  border-radius: 11px;
  background: #fff;
  cursor: pointer;
}

.storage-card.selected {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.storage-card.auto {
  grid-column: 1 / -1;
  border-color: #c7d2fe;
  background: #f5f7ff;
}

.slot-preview {
  position: relative;
  display: grid;
  height: 82px;
  place-items: center;
  overflow: hidden;
  border-radius: 7px;
  background: #e5e7eb;
  color: #9ca3af;
  font-size: 0.65rem;
}

.slot-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
  image-rendering: pixelated;
}

.slot-preview b {
  position: absolute;
  left: 5px;
  bottom: 5px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  font-size: 0.58rem;
}

.slot-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.slot-info strong,
.slot-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-info strong {
  color: #374151;
  font-size: 0.78rem;
}

.slot-info span,
.slot-info time {
  color: #9ca3af;
  font-size: 0.64rem;
}

.slot-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.slot-actions button {
  padding: 6px 11px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.66rem;
}

.slot-actions button:disabled {
  cursor: default;
  opacity: 0.4;
}

.save-button,
.load-button {
  color: #4f46e5;
}

.delete-button {
  color: #dc2626;
}

@media (max-width: 680px) {
  .storage-list {
    grid-template-columns: 1fr;
  }

  .storage-card.auto {
    grid-column: 1;
  }
}
</style>
