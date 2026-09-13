<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="emit('close')">
      <section class="settings-dialog">
        <header class="settings-header">
          <div>
            <h2>设置</h2>
            <p>偏好、帮助与应用数据</p>
          </div>
          <button class="settings-close" aria-label="关闭" title="关闭" @click="emit('close')">
            <img :src="iconClose" alt="" />
          </button>
        </header>

        <div class="settings-content">
          <button class="settings-item" @click="showDevicePicker = true">
            <span class="settings-icon"><img :src="iconPlatform" alt="" /></span>
            <span
              ><strong>使用平台</strong><small>当前：{{ deviceLabel }}</small></span
            >
            <b>›</b>
          </button>
          <button v-if="device === 'pc'" class="settings-item" @click="openPanel('shortcuts')">
            <span class="settings-icon"><img :src="iconShortcuts" alt="" /></span>
            <span><strong>快捷键设置</strong><small>自定义电脑端操作快捷键</small></span>
            <b>›</b>
          </button>
          <button class="settings-item" @click="showUserGuide = true">
            <span class="settings-icon"><img :src="iconTutorial" alt="" /></span>
            <span><strong>使用教程</strong><small>查看功能和操作说明</small></span>
            <b>›</b>
          </button>
          <button class="settings-item" @click="showAnnouncement()">
            <span class="settings-icon"><img :src="iconNotice" alt="" /></span>
            <span><strong>公告</strong><small>查看版本公告和更新内容</small></span>
            <b>›</b>
          </button>
          <button class="settings-item danger" @click="showCleanupConfirm = true">
            <span class="settings-icon"><img :src="iconCleanup" alt="" /></span>
            <span><strong>清理数据</strong><small>管理本地设置和浏览器工程</small></span>
            <b>›</b>
          </button>
          <button class="settings-item support" @click="openPanel('support')">
            <span class="settings-icon"><img :src="iconSupport" alt="" /></span>
            <span><strong>支持作者</strong><small>了解支持项目的方式</small></span>
            <b>›</b>
          </button>

          <div class="tutorial-replay">
            <div class="tutorial-animation-window">
              <img class="tutorial-animation" :src="tutorialAnimation" alt="教程操作演示" />
            </div>
            <button class="tutorial-replay-button" @click="replayTutorial()">教程小动画重播</button>
          </div>
        </div>
      </section>

      <DeviceModal v-if="showDevicePicker" @select="selectPlatform" />
      <UserGuideModal v-if="showUserGuide" @close="showUserGuide = false" />

      <div v-if="activePanel" class="sub-overlay" @click.self="activePanel = null">
        <section class="sub-dialog">
          <button
            class="settings-close sub-close"
            aria-label="关闭"
            title="关闭"
            @click="activePanel = null"
          >
            <img :src="iconClose" alt="" />
          </button>
          <span v-if="panelInfo.icon" class="sub-icon">
            <img :src="panelInfo.icon" alt="" />
          </span>
          <h3>{{ panelInfo.title }}</h3>
          <p v-if="activePanel !== 'support'">{{ panelInfo.description }}</p>
          <div v-if="activePanel === 'shortcuts'" class="shortcut-settings">
            <p class="shortcut-tip">点击按键框后，按下一个按键完成修改。仅支持单按键。</p>
            <div
              v-for="row in shortcutRows"
              :key="row.action"
              class="shortcut-row"
              :data-shortcut-recording="recordingAction === row.action"
            >
              <span>{{ row.label }}</span>
              <button
                class="shortcut-key"
                :class="{ recording: recordingAction === row.action }"
                @click="recordingAction = row.action"
                @keydown.stop.prevent="captureShortcut(row.action, $event)"
              >
                {{ recordingAction === row.action ? '请按键…' : row.key }}
              </button>
            </div>
            <p v-if="shortcutError" class="shortcut-error">{{ shortcutError }}</p>
            <button class="shortcut-reset" @click="resetShortcutSettings()">恢复默认</button>
          </div>
          <div v-else-if="activePanel === 'support'" class="support-links">
            <a
              v-for="link in supportLinks"
              :key="link.url"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              <strong>{{ link.label }}</strong>
              <small>{{ link.subtitle }}</small>
            </a>
          </div>
          <div v-else class="placeholder">该功能界面已接入，具体逻辑将在后续版本中完善。</div>
          <button class="sub-confirm" @click="activePanel = null">知道了</button>
        </section>
      </div>

      <ConfirmModal
        v-if="showCleanupConfirm"
        title="清理全部数据"
        message="该操作会删除浏览器中的全部工程、自动保存、快捷键和设备偏好，并将应用恢复为初始状态。<br><br><b>该操作无法撤回，确认继续吗？</b>"
        confirm-text="确认全部清理"
        cancel-text="取消"
        @confirm="clearAllData()"
        @cancel="showCleanupConfirm = false"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DeviceModal from '@/components/DeviceModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import UserGuideModal from '@/components/UserGuideModal.vue'
import { useNotices } from '@/composables/useNotices'
import { useTutorial } from '@/composables/useTutorial'
import { supportLinks } from '@/ts/supportLinks'
import { useDevice, type DeviceType } from '@/composables/useDevice'
import {
  useShortcuts,
  type ShortcutAction,
  shortcutDefinitions,
  normalizeShortcutKey,
} from '@/composables/useShortcuts'
import { clearProjectDatabase } from '@/ts/projectStorage'
import iconClose from '@/assets/icon/关闭取消.png'
import iconNotice from '@/assets/icon/公告.png'
import iconShortcuts from '@/assets/icon/快捷键设置.png'
import iconCleanup from '@/assets/icon/清理数据.png'
import iconTutorial from '@/assets/icon/使用教程.png'
import iconPlatform from '@/assets/icon/使用平台.png'
import iconSupport from '@/assets/icon/支持.png'
import tutorialAnimation from '@/assets/icon/播放教程小动画.gif'

type PanelKey = 'shortcuts' | 'cleanup' | 'support'

const emit = defineEmits<{ close: [] }>()
const { showAnnouncement } = useNotices()
const { device, changeDevice } = useDevice()
function replayTutorial() {
  if (!device.value) return
  emit('close')
  useTutorial().start(device.value, true)
}
const showDevicePicker = ref(false)
const showUserGuide = ref(false)
const activePanel = ref<PanelKey | null>(null)
const showCleanupConfirm = ref(false)
const recordingAction = ref<ShortcutAction | null>(null)
const shortcutError = ref('')
const { shortcutRows, setShortcut, resetShortcuts } = useShortcuts()

const deviceLabel = computed(() => {
  const labels: Record<DeviceType, string> = { pc: '电脑', tb: '平板', ph: '手机' }
  return device.value ? labels[device.value] : '未选择'
})

const panels: Record<PanelKey, { title: string; description: string; icon?: string }> = {
  shortcuts: {
    title: '快捷键设置',
    description: '配置电脑端绘制与界面操作快捷键。',
    icon: iconShortcuts,
  },
  cleanup: {
    title: '清理数据',
    description: '清理本地偏好或浏览器保存的工程。',
    icon: iconCleanup,
  },
  support: {
    title: '支持作者',
    description: '查看支持项目继续开发的方式。',
    icon: iconSupport,
  },
}

const panelInfo = computed(() => (activePanel.value ? panels[activePanel.value] : panels.shortcuts))

function openPanel(panel: PanelKey) {
  activePanel.value = panel
  recordingAction.value = null
  shortcutError.value = ''
}

function captureShortcut(action: ShortcutAction, event: KeyboardEvent) {
  if (recordingAction.value !== action) return
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    !normalizeShortcutKey(event.key)
  ) {
    shortcutError.value = '仅支持一个普通按键，不支持组合键或功能键。'
    return
  }
  const conflict = setShortcut(action, event.key)
  if (conflict) {
    const label = shortcutDefinitions.find((definition) => definition.action === conflict)?.label
    shortcutError.value = `该按键已用于“${label ?? '其他操作'}”，请换一个按键。`
    return
  }
  shortcutError.value = ''
  recordingAction.value = null
}

function resetShortcutSettings() {
  resetShortcuts()
  recordingAction.value = null
  shortcutError.value = ''
}

async function clearAllData() {
  showCleanupConfirm.value = false
  try {
    await clearProjectDatabase()
    if ('caches' in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
    }
    localStorage.clear()
    sessionStorage.clear()
    window.dispatchEvent(new CustomEvent('pindou-data-resetting'))
    window.location.reload()
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '清理数据失败。')
  }
}

function selectPlatform(platform: DeviceType) {
  changeDevice(platform)
  showDevicePicker.value = false
  emit('close')
}
</script>

<style scoped>
.support-links {
  display: grid;
  gap: 12px;
  margin: 20px 0;
}
.support-links a {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid #dce0ef;
  border-radius: 12px;
  background: #f8f9ff;
  color: #635bff;
  text-decoration: none;
  text-align: left;
  touch-action: manipulation;
}
.support-links a:hover {
  background: #eef0ff;
  border-color: #635bff;
}
.support-links small {
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}
.settings-overlay,
.sub-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.46);
}
.settings-overlay {
  z-index: 32000;
}
.sub-overlay {
  z-index: 2;
  background: rgba(15, 23, 42, 0.35);
}
.settings-dialog {
  width: min(480px, 92vw);
  max-height: 88vh;
  overflow: hidden;
  border-radius: 15px;
  background: #f7f8fb;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
}
.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 21px 14px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}
.settings-header h2,
.settings-header p,
.sub-dialog h3,
.sub-dialog p {
  margin: 0;
}
.settings-header h2 {
  color: #1f2937;
  font-size: 1.05rem;
}
.settings-header p {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 0.7rem;
}
.settings-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 1rem;
}
.settings-close:hover {
  background: #f3f4f6;
}
.settings-close img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.settings-content {
  display: flex;
  max-height: calc(88vh - 80px);
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
  padding: 14px;
}
.settings-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid #e1e5eb;
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.settings-item:hover {
  border-color: #a5b4fc;
  background: #f8faff;
}
.settings-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 0.9rem;
}
.settings-icon img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  image-rendering: pixelated;
}
.settings-item > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-item strong {
  color: #374151;
  font-size: 0.76rem;
}
.settings-item small {
  overflow: hidden;
  color: #9ca3af;
  font-size: 0.63rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-item > b {
  color: #9ca3af;
  font-size: 1rem;
}
.settings-item.danger .settings-icon {
  background: #fef2f2;
  color: #dc2626;
}
.settings-item.support .settings-icon {
  background: #fff1f2;
  color: #e11d48;
}
.tutorial-replay {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  margin-top: -8px;
  padding-top: 0;
}
.tutorial-animation-window {
  position: relative;
  z-index: 1;
  width: 112px;
  height: 68px;
  margin: 0 0 -1px 16px;
  overflow: hidden;
  pointer-events: none;
}
.tutorial-animation {
  display: block;
  width: 112px;
  height: 112px;
  transform: translateY(-45px);
  object-fit: contain;
}
.tutorial-replay-button {
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 42px;
  padding: 9px 18px;
  border: 1px solid #a5b4fc;
  border-radius: 10px;
  background: #fff;
  color: #4f46e5;
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 600;
  text-align: center;
}
.tutorial-replay-button:hover {
  border-color: #6366f1;
  background: #f5f7ff;
}
.sub-dialog {
  position: relative;
  box-sizing: border-box;
  width: min(390px, 90vw);
  padding: 27px 24px 22px;
  border-radius: 13px;
  background: #fff;
  text-align: center;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
}
.shortcut-settings {
  display: flex;
  max-height: min(48vh, 420px);
  flex-direction: column;
  gap: 6px;
  margin: 14px 0;
  overflow-y: auto;
  text-align: left;
}
.shortcut-tip {
  margin: 0 0 3px;
  color: #9ca3af;
  font-size: 0.65rem;
}
.shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 94px;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 5px 8px;
  border-radius: 7px;
  background: #f8fafc;
  color: #4b5563;
  font-size: 0.69rem;
}
.shortcut-key {
  min-height: 27px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #4f46e5;
  cursor: pointer;
  font-size: 0.67rem;
  font-weight: 700;
}
.shortcut-key.recording {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.13);
}
.shortcut-error {
  margin: 2px 0;
  color: #dc2626;
  font-size: 0.64rem;
}
.shortcut-reset {
  align-self: flex-end;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  font-size: 0.66rem;
}
.sub-close {
  position: absolute;
  top: 10px;
  right: 10px;
}
.sub-icon {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  place-items: center;
  border-radius: 12px;
  background: #eef2ff;
  color: #4f46e5;
  font-size: 1.2rem;
}
.sub-icon img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  image-rendering: pixelated;
}
.sub-dialog h3 {
  color: #1f2937;
  font-size: 0.95rem;
}
.sub-dialog > p {
  margin-top: 6px;
  color: #6b7280;
  font-size: 0.7rem;
}
.placeholder {
  margin: 16px 0;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  color: #9ca3af;
  font-size: 0.67rem;
  line-height: 1.55;
}
.sub-confirm {
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 7px;
  background: #6366f1;
  color: #fff;
  cursor: pointer;
  font-size: 0.7rem;
}
</style>
