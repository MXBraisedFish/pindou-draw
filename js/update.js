import { elements } from './elements.js';
import { state } from './state.js';

const updateBootTimestamp = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
let updateAutoOpenActive = false;
let updateAutoClosedNotified = false;
export function initializeUpdate() {
    if (!elements.updateManualBtn || !elements.updateWindow) return;
    elements.updateManualBtn.addEventListener('click', () => toggleUpdate());
    elements.updateCloseBtn?.addEventListener('click', () => toggleUpdate(false));
    document.addEventListener('keydown', handleKeydown);
    syncUpdateWindow();
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
    visible && elements.updateWindow.focus?.();
}
function handleKeydown(ev) {
    ev.key === 'Escape' && state.updateVisible && toggleUpdate(false);
}
