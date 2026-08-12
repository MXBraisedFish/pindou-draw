import { elements } from './elements.js';
import { state } from './state.js';

// 版本号 30
export const UPDATE_NOTICE_VERSION = 30;
const UPDATE_NOTICE_KEY = 'update-notice-version';

const updateBootTimestamp = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
let updateAutoOpenActive = false;
let updateAutoClosedNotified = false;
export function initializeUpdate() {
    if (!elements.updateManualBtn || !elements.updateWindow) return;
    elements.updateManualBtn.addEventListener('click', () => toggleUpdate());
    elements.updateCloseBtn?.addEventListener('click', () => toggleUpdate(false));
    elements.updateDismissToggle?.addEventListener('change', handleDismissToggleChange);
    document.addEventListener('keydown', handleKeydown);
    syncUpdateWindow();
}

export function autoOpenUpdateIfNeeded() {
    if (shouldAutoOpen()) {
        toggleUpdate(true);
    }
}

export function isUpdateDismissed() {
    return readNoticeVersion() === UPDATE_NOTICE_VERSION;
}

function shouldAutoOpen() {
    const stored = readNoticeVersion();
    return stored !== UPDATE_NOTICE_VERSION;
}

function readNoticeVersion() {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(UPDATE_NOTICE_KEY);
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function writeNoticeVersion(value) {
    if (typeof localStorage === 'undefined') return;
    if (value === null || value === undefined) {
        localStorage.removeItem(UPDATE_NOTICE_KEY);
        return;
    }
    localStorage.setItem(UPDATE_NOTICE_KEY, String(value));
}

function handleDismissToggleChange(event) {
    const checked = Boolean(event.target.checked);
    if (checked) {
        writeNoticeVersion(UPDATE_NOTICE_VERSION);
    } else {
        writeNoticeVersion(null);
    }
}
export function toggleUpdate(force) {
    const next = typeof force === 'boolean' ? force : !state.updateVisible;
    if (state.updateVisible === next) return;

    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    if (next) {
        const isForcedOpen = typeof force === 'boolean' && force === true;
        const openedNearBoot = isForcedOpen && (now - updateBootTimestamp) <= 15000;
        updateAutoOpenActive = openedNearBoot;
    }

    state.updateVisible = next;
    syncUpdateWindow();

    if (!next && updateAutoOpenActive && !updateAutoClosedNotified) {
        updateAutoClosedNotified = true;
        updateAutoOpenActive = false;
        document.dispatchEvent(new CustomEvent('update:autoClosed'));
    }
    if (!next) updateAutoOpenActive = false;
}
function syncUpdateWindow() {
    if (!elements.updateWindow) return;
    const visible = state.updateVisible;
    elements.updateWindow.classList.toggle('is-visible', visible);
    elements.updateWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
    elements.updateManualBtn?.setAttribute('aria-pressed', visible ? 'true' : 'false');
    if (elements.updateDismissToggle) {
        elements.updateDismissToggle.checked = readNoticeVersion() === UPDATE_NOTICE_VERSION;
    }
    visible && elements.updateWindow.focus?.();
}
function handleKeydown(ev) {
    ev.key === 'Escape' && state.updateVisible && toggleUpdate(false);
}
