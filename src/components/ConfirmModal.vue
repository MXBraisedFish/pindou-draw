<template>
  <Teleport to="body">
    <div class="confirm-overlay" @click.self="$emit('cancel')">
      <div class="confirm-card">
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message" v-html="message"></p>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel" @click="$emit('cancel')">
            {{ cancelText }}
          </button>
          <button class="confirm-btn confirm-btn-ok" @click="$emit('confirm')">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  message: string
  confirmText?: string
  cancelText?: string
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40000;
  animation: confirm-fade-in 0.15s ease-out;
}
@keyframes confirm-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.confirm-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px 28px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.confirm-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}
.confirm-message {
  font-size: 0.88rem;
  color: #666;
  line-height: 1.6;
  margin-bottom: 20px;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.confirm-btn {
  padding: 7px 20px;
  border-radius: 6px;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #555;
  transition: all 0.12s;
}
.confirm-btn:hover {
  background: #f3f4f6;
}
.confirm-btn-cancel {
}
.confirm-btn-ok {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}
.confirm-btn-ok:hover {
  background: #4f46e5;
}
</style>
