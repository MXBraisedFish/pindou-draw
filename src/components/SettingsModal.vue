<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="emit('close')">
      <section class="settings-dialog">
        <header class="settings-header">
          <div>
            <h2>设置</h2>
            <p>偏好、帮助与应用数据</p>
          </div>
          <button class="settings-close" @click="emit('close')">x</button>
        </header>

        <div class="settings-content">
          <button class="settings-item" @click="showDevicePicker = true">
            <span class="settings-icon">▣</span>
            <span
              ><strong>使用平台</strong><small>当前：{{ deviceLabel }}</small></span
            >
            <b>›</b>
          </button>
          <button v-if="device === 'pc'" class="settings-item" @click="openPanel('shortcuts')">
            <span class="settings-icon">⌨</span>
            <span><strong>快捷键设置</strong><small>自定义电脑端操作快捷键</small></span>
            <b>›</b>
          </button>
          <button class="settings-item" @click="openPanel('tutorial')">
            <span class="settings-icon">?</span>
            <span><strong>使用教程</strong><small>查看功能和操作说明</small></span>
            <b>›</b>
          </button>
          <button class="settings-item" @click="openPanel('animation')">
            <span class="settings-icon">▶</span>
            <span><strong>教程小动画重播</strong><small>重新播放界面引导动画</small></span>
            <b>›</b>
          </button>
          <button class="settings-item" @click="openPanel('notice')">
            <span class="settings-icon">!</span>
            <span><strong>公告</strong><small>查看版本公告和更新内容</small></span>
            <b>›</b>
          </button>
          <button class="settings-item danger" @click="openPanel('cleanup')">
            <span class="settings-icon">⌫</span>
            <span><strong>清理数据</strong><small>管理本地设置和浏览器工程</small></span>
            <b>›</b>
          </button>
          <button class="settings-item support" @click="openPanel('support')">
            <span class="settings-icon">♥</span>
            <span><strong>支持作者</strong><small>了解支持项目的方式</small></span>
            <b>›</b>
          </button>
        </div>
      </section>

      <DeviceModal v-if="showDevicePicker" @select="selectPlatform" />

      <div v-if="activePanel" class="sub-overlay" @click.self="activePanel = null">
        <section class="sub-dialog">
          <button class="settings-close sub-close" @click="activePanel = null">x</button>
          <span class="sub-icon">{{ panelInfo.icon }}</span>
          <h3>{{ panelInfo.title }}</h3>
          <p>{{ panelInfo.description }}</p>
          <div class="placeholder">该功能界面已接入，具体逻辑将在后续版本中完善。</div>
          <button class="sub-confirm" @click="activePanel = null">知道了</button>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DeviceModal from '@/components/DeviceModal.vue'
import { useDevice, type DeviceType } from '@/composables/useDevice'

type PanelKey = 'shortcuts' | 'tutorial' | 'animation' | 'notice' | 'cleanup' | 'support'

const emit = defineEmits<{ close: [] }>()
const { device, changeDevice } = useDevice()
const showDevicePicker = ref(false)
const activePanel = ref<PanelKey | null>(null)

const deviceLabel = computed(() => {
  const labels: Record<DeviceType, string> = { pc: '电脑', tb: '平板', ph: '手机' }
  return device.value ? labels[device.value] : '未选择'
})

const panels: Record<PanelKey, { title: string; description: string; icon: string }> = {
  shortcuts: { title: '快捷键设置', description: '配置电脑端绘制与界面操作快捷键。', icon: '⌨' },
  tutorial: { title: '使用教程', description: '查看拼豆绘制的完整使用教程。', icon: '?' },
  animation: { title: '教程小动画重播', description: '重新播放新手操作引导动画。', icon: '▶' },
  notice: { title: '公告', description: '查看版本公告、更新说明与维护信息。', icon: '!' },
  cleanup: { title: '清理数据', description: '清理本地偏好或浏览器保存的工程。', icon: '⌫' },
  support: { title: '支持作者', description: '查看支持项目继续开发的方式。', icon: '♥' },
}

const panelInfo = computed(() => (activePanel.value ? panels[activePanel.value] : panels.tutorial))

function openPanel(panel: PanelKey) {
  activePanel.value = panel
}

function selectPlatform(platform: DeviceType) {
  changeDevice(platform)
  showDevicePicker.value = false
}
</script>

<style scoped>
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
