import { elements } from './elements.js';
import { state } from './state.js';

// 版本号 30
export const INTRO_NOTICE_VERSION = 30;
const INTRO_NOTICE_KEY = 'intro-notice-version';

export function initializeIntro() {
  if (!elements.introWindow) return;
  elements.introCloseBtn?.addEventListener('click', () => toggleIntro(false));
  elements.introDismissToggle?.addEventListener('change', handleDismissToggleChange);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('update:autoClosed', () => {
    autoOpenIntroIfNeeded();
  });
  syncIntroWindow();
}

export function autoOpenIntroIfNeeded() {
  if (state.updateVisible) return;
  if (shouldAutoOpen()) {
    toggleIntro(true);
  }
}

export function isIntroDismissed() {
  return readNoticeVersion() === INTRO_NOTICE_VERSION;
}

function shouldAutoOpen() {
  const stored = readNoticeVersion();
  return stored !== INTRO_NOTICE_VERSION;
}

function readNoticeVersion() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(INTRO_NOTICE_KEY);
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeNoticeVersion(value) {
  if (typeof localStorage === 'undefined') return;
  if (value === null || value === undefined) {
    localStorage.removeItem(INTRO_NOTICE_KEY);
    return;
  }
  localStorage.setItem(INTRO_NOTICE_KEY, String(value));
}

function handleDismissToggleChange(event) {
  const checked = Boolean(event.target.checked);
  if (checked) {
    writeNoticeVersion(INTRO_NOTICE_VERSION);
  } else {
    writeNoticeVersion(null);
  }
}

export function toggleIntro(force) {
  const next = typeof force === 'boolean' ? force : !state.introVisible;
  if (state.introVisible === next) return;

  state.introVisible = next;
  syncIntroWindow();

  if (!next) {
    document.dispatchEvent(new CustomEvent('intro:closed'));
  }
}

function syncIntroWindow() {
  if (!elements.introWindow) return;
  const visible = state.introVisible;
  elements.introWindow.classList.toggle('is-visible', visible);
  elements.introWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (elements.introDismissToggle) {
    elements.introDismissToggle.checked = readNoticeVersion() === INTRO_NOTICE_VERSION;
  }
  visible && elements.introWindow.focus?.();
}

function handleKeydown(ev) {
  ev.key === 'Escape' && state.introVisible && toggleIntro(false);
}
