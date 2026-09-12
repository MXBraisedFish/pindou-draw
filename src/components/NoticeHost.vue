<template>
  <Teleport to="body">
    <div v-if="activeNotice" class="notice-overlay" @keydown.esc.stop.prevent="closeNotice">
      <section
        ref="dialog"
        class="notice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        tabindex="-1"
        @keydown.tab="trapFocus"
      >
        <header>
          <h2 id="notice-title">{{ activeNotice === 'phone' ? '手机端使用提示' : '公告' }}</h2>
          <button aria-label="关闭提示" @click="closeNotice">
            <img :src="iconClose" alt="" />
          </button>
        </header>
        <div class="notice-content">
          <p v-if="activeNotice === 'phone'">
            手机端适合快速绘制简洁草图，如需更丰富的功能，可改用平板或电脑打开本网站继续制作。
          </p>
          <template v-else>
            <p>大家久等了！拼豆草图制作网页终于完成重构，页面与后端架构都做了大幅优化。</p>
            <p>总之，这个网站希望为大家提供一个快捷、随时随地可用的拼豆草图制作工具。</p>
            <p>
              本网站制作出的草图没有任何水印（包括隐形水印），分享的图片无需声明来源于本网站，也可随意用于商业用途（本网站不对任何侵权内容负责）。
            </p>
            <p>
              本网站永远免费使用，所有代码开源且仅在本地运行，没有任何强制收费或 AI
              功能，数据也均存储在本地。
            </p>
            <p>
              如果喜欢，欢迎多多分享，也欢迎在我的 GitHub
              仓库点一颗星，或在爱发电打赏支持！（打赏纯自愿，不强制）
            </p>
            <nav class="notice-links" aria-label="支持链接">
              <a
                v-for="link in supportLinks"
                :key="link.url"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                >{{ link.label }}</a
              >
            </nav>
          </template>
        </div>
        <footer><button class="notice-confirm" @click="closeNotice">知道了</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useDevice } from '@/composables/useDevice'
import { useNotices } from '@/composables/useNotices'
import iconClose from '@/assets/icon/关闭取消.png'
import { supportLinks } from '@/ts/supportLinks'

const { device } = useDevice()
const { activeNotice, showFirstUse, dismiss } = useNotices()
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
watch(device, (value) => showFirstUse(value), { immediate: true })
watch(
  activeNotice,
  async (value, previous) => {
    if (value) {
      if (!previous) previousFocus = document.activeElement as HTMLElement | null
      await nextTick()
      dialog.value?.focus()
    } else {
      previousFocus?.focus()
    }
  },
  { immediate: true },
)
function closeNotice() {
  dismiss()
  showFirstUse(device.value)
}
function trapFocus(event: KeyboardEvent) {
  const buttons = dialog.value?.querySelectorAll<HTMLElement>('button, a[href]')
  if (!buttons?.length) return
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === dialog.value)
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
.notice-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-bottom: 16px;
}
.notice-links a {
  color: #635bff;
  text-decoration: underline;
  padding: 10px 0;
}
.notice-overlay {
  position: fixed;
  inset: 0;
  z-index: 41000;
  background: #11182780;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.notice-dialog {
  width: min(560px, 100%);
  max-height: 85dvh;
  display: flex;
  flex-direction: column;
  background: white;
  color: #253047;
  border-radius: 18px;
  box-shadow: 0 20px 70px #11182740;
  overflow: hidden;
  outline: none;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #e3e6ed;
}
h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
}
button {
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
  border: 0;
  border-radius: 10px;
  background: transparent;
  touch-action: manipulation;
}
button:focus-visible {
  outline: 2px solid #635bff;
  outline-offset: -2px;
}
header img {
  width: 18px;
  height: 18px;
  margin: auto;
}
.notice-content {
  padding: 4px 22px;
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: 15px;
  line-height: 1.85;
}
p {
  margin: 16px 0;
}
footer {
  padding: 12px 22px 20px;
}
.notice-confirm {
  width: 100%;
  background: #635bff;
  color: white;
  font-size: 15px;
}
</style>
