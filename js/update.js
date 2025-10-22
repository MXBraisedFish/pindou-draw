import { elements } from './elements.js';
import { state } from './state.js';

export function initializeUpdate() {
    if (!elements.updateManualBtn || !elements.updateWindow) return;

    elements.updateManualBtn.addEventListener('click', () => {
        toggleUpdate();
    });

    elements.updateCloseBtn?.addEventListener('click', () => {
        toggleUpdate(false);
    });

    document.addEventListener('keydown', handleKeydown);
    syncUpdateWindow();
}

export function toggleUpdate(force) {
    const next = typeof force === 'boolean' ? force : !state.updateVisible;
    if (state.updateVisible === next) return;
    state.updateVisible = next;
    syncUpdateWindow();
}

function syncUpdateWindow() {
    if (!elements.updateWindow) return;
    const visible = state.updateVisible;
    elements.updateWindow.classList.toggle('is-visible', visible);
    elements.updateWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
    elements.updateManualBtn?.setAttribute('aria-pressed', visible ? 'true' : 'false');
    if (visible) {
        elements.updateWindow.focus?.();
    }
}

function handleKeydown(ev) {
    if (ev.key === 'Escape' && state.updateVisible) {
        toggleUpdate(false);
    }
}