import { createApp } from 'vue'
import { createPinia } from 'pinia'

import loadingAnimation from '@/assets/icon/加载动画.gif'
import { preloadApplicationAssets } from '@/ts/preloadAssets'

async function bootstrap() {
  const root = document.querySelector<HTMLElement>('#app')
  if (root) {
    root.innerHTML = `
      <div style="position:fixed;inset:0;display:grid;place-items:center;background:#f8fafc;color:#64748b;font:14px system-ui,sans-serif">
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
          <img src="${loadingAnimation}" alt="正在加载" width="96" height="96" style="object-fit:contain" />
          <span>正在加载资源…</span>
        </div>
      </div>`
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await preloadApplicationAssets()

  const [{ default: App }, { default: router }, { usePaletteStore }] = await Promise.all([
    import('./App.vue'),
    import('./router'),
    import('./stores/palette'),
  ])
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  await usePaletteStore(pinia).loadBuiltinCards()

  app.mount('#app')
}

void bootstrap()
