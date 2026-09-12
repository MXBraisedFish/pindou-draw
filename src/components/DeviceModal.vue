<template>
  <div class="device-modal-overlay">
    <div class="device-modal">
      <h2 class="device-modal-title">欢迎使用拼豆绘制</h2>
      <p class="device-modal-desc">请选择你使用的设备类型，以获得最佳体验</p>
      <div class="device-modal-options">
        <button
          v-for="opt in deviceOptions"
          :key="opt.value"
          class="device-option-card"
          @click="$emit('select', opt.value)"
        >
          <img :src="opt.icon" class="device-option-icon" alt="" />
          <span class="device-option-label">{{ opt.label }}</span>
        </button>
      </div>
      <p class="device-modal-note">可随时在设置中切换</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DeviceType } from '@/composables/useDevice'
import iconPc from '@/assets/icon/电脑.png'
import iconTablet from '@/assets/icon/平板.png'
import iconPhone from '@/assets/icon/手机.png'

defineEmits<{
  select: [device: DeviceType]
}>()

const deviceOptions = [
  { value: 'pc' as DeviceType, icon: iconPc, label: '电脑' },
  { value: 'tb' as DeviceType, icon: iconTablet, label: '平板' },
  { value: 'ph' as DeviceType, icon: iconPhone, label: '手机' },
]
</script>

<style scoped>
.device-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.device-modal {
  background: #fff;
  border-radius: 16px;
  padding: 32px 28px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  text-align: center;
}

.device-modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.device-modal-desc {
  font-size: 0.95rem;
  color: #666;
  margin-bottom: 28px;
}

.device-modal-options {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}

.device-option-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 20px;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 110px;
}

.device-option-card:hover {
  border-color: #6366f1;
  background: #f5f3ff;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.15);
}

.device-option-card:active {
  transform: translateY(0);
}

.device-option-icon {
  width: 48px;
  height: 48px;
}

.device-option-label {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1a1a2e;
}

.device-modal-note {
  margin-top: 20px;
  font-size: 0.8rem;
  color: #aaa;
}
</style>
