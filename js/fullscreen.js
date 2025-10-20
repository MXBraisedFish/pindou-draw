import { elements } from './elements.js';
import { state } from './state.js';
import { renderFullscreenPalette, updateFullscreenPaletteSelection } from './palette.js';

export function toggleFullscreen() {
  state.isFullscreen = !state.isFullscreen;
  if (state.isFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!state.isFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  updateFullscreenState();
}

export function updateFullscreenState() {
  document.body.classList.toggle('canvas-fullscreen', state.isFullscreen);
  if (elements.toggleFullscreenBtn) {
    elements.toggleFullscreenBtn.textContent = state.isFullscreen ? '退出全屏' : '全屏显示';
  }
  if (elements.fullscreenPalette) {
    elements.fullscreenPalette.setAttribute('aria-hidden', state.isFullscreen ? 'false' : 'true');
    if (state.isFullscreen) {
      renderFullscreenPalette();
      updateFullscreenPaletteSelection();
    }
  }
}
