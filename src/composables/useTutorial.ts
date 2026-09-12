import { ref } from 'vue'
import type { DeviceType } from '@/composables/useDevice'

const running = ref(false)
const step = ref(0)
const platform = ref<DeviceType>('pc')
const seen = new Set<DeviceType>()
export const tutorialKey = (device: DeviceType) => `pindou-tutorial-v1-${device}`

export function useTutorial() {
  function start(device: DeviceType, replay = false) {
    if (running.value) return
    if (!replay) {
      if (seen.has(device)) return
      try {
        if (localStorage.getItem(tutorialKey(device)) === '1') return
      } catch {
        /* Storage may be unavailable in private browsing. */
      }
    }
    platform.value = device
    step.value = 0
    running.value = true
  }
  function finish() {
    seen.add(platform.value)
    try {
      localStorage.setItem(tutorialKey(platform.value), '1')
    } catch {
      /* Keep session state. */
    }
    running.value = false
  }
  return { running, step, platform, start, finish }
}
