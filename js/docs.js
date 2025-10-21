import { elements } from './elements.js';
import { state } from './state.js';

export function initializeDocs() {
  if (!elements.docsToggleBtn || !elements.docsWindow) return;
  elements.docsToggleBtn.addEventListener('click', () => {
    toggleDocs();
  });
  elements.docsCloseBtn?.addEventListener('click', () => {
    toggleDocs(false);
  });
  document.addEventListener('keydown', handleKeydown);
  syncDocsWindow();
}

export function toggleDocs(force) {
  const next = typeof force === 'boolean' ? force : !state.docsVisible;
  if (state.docsVisible === next) return;
  state.docsVisible = next;
  syncDocsWindow();
}

function syncDocsWindow() {
  if (!elements.docsWindow) return;
  const visible = state.docsVisible;
  elements.docsWindow.classList.toggle('is-visible', visible);
  elements.docsWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
  elements.docsToggleBtn?.setAttribute('aria-pressed', visible ? 'true' : 'false');
  if (visible) {
    elements.docsWindow.focus?.();
  }
}

function handleKeydown(ev) {
  if (ev.key === 'Escape' && state.docsVisible) {
    toggleDocs(false);
  }
}
