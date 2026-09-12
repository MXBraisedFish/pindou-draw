import { ref } from 'vue'

export const PHONE_INTRO_KEY = 'pindou-phone-intro-seen'
export const ANNOUNCEMENT_KEY = 'pindou-announcement-rebuild-v1-seen'
const activeNotice = ref<'phone' | 'announcement' | null>(null)
const seenThisSession = new Set<string>()

function hasSeen(key: string) {
  if (seenThisSession.has(key)) return true
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function useNotices() {
  function showFirstUse(device: string | null) {
    if (!device || activeNotice.value) return
    if (device === 'ph' && !hasSeen(PHONE_INTRO_KEY)) activeNotice.value = 'phone'
    else if (!hasSeen(ANNOUNCEMENT_KEY)) activeNotice.value = 'announcement'
  }
  function dismiss() {
    if (!activeNotice.value) return
    const key = activeNotice.value === 'phone' ? PHONE_INTRO_KEY : ANNOUNCEMENT_KEY
    seenThisSession.add(key)
    try {
      localStorage.setItem(key, '1')
    } catch {
      // Private browsing may deny storage; avoid repeated prompts in this session.
    }
    activeNotice.value = null
  }
  function showAnnouncement() {
    activeNotice.value = 'announcement'
  }
  return { activeNotice, showFirstUse, dismiss, showAnnouncement }
}
