import { elements } from './elements.js';
import { state } from './state.js';
import { renderFullscreenPalette, updateFullscreenPaletteSelection } from './palette.js';

function getFullscreenState() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement ||
    document.mozFullScreenElement || document.msFullscreenElement);
}

export function toggleFullscreen() {
  const isCurrentlyFullscreen = getFullscreenState();
  const element = document.documentElement;

  if (!isCurrentlyFullscreen) {
    if (element.requestFullscreen) element.requestFullscreen().catch(err => console.error('Error enabling fullscreen:', err));
    else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    else if (element.mozRequestFullScreen) element.mozRequestFullScreen();
    else if (element.msRequestFullscreen) element.msRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(err => console.error('Error exiting fullscreen:', err));
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
}

export function updateFullscreenState() {
  const isNowFullscreen = getFullscreenState();
  if (state.isFullscreen === isNowFullscreen) return;

  state.isFullscreen = isNowFullscreen;
  document.body.classList.toggle('canvas-fullscreen', state.isFullscreen);

  elements.toggleFullscreenBtn && (elements.toggleFullscreenBtn.textContent = state.isFullscreen ? '退出全屏' : '全屏显示');

  if (elements.fullscreenPalette) {
    elements.fullscreenPalette.setAttribute('aria-hidden', state.isFullscreen ? 'false' : 'true');
    if (state.isFullscreen) {
      renderFullscreenPalette();
      updateFullscreenPaletteSelection();
    }
  }

  setTimeout(() => {
    typeof updateFullscreenOverlayState === 'function'
      ? updateFullscreenOverlayState()
      : document.dispatchEvent(new CustomEvent('updateFullscreenOverlay'));
  }, 50);
}

function initializeFullscreenListeners() {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  events.forEach(event => document.addEventListener(event, updateFullscreenState));
  setTimeout(updateFullscreenState, 100);
}

initializeFullscreenListeners();