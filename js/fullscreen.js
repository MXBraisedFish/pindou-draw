import { elements } from './elements.js';
import { state } from './state.js';
import { renderFullscreenPalette, updateFullscreenPaletteSelection } from './palette.js';
import { updateFullscreenOverlayState } from './app/fullscreen-overlay.js';

function getFullscreenState() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

export function toggleFullscreen() {
  const isCurrentlyFullscreen = getFullscreenState();
  const element = document.documentElement;

  if (!isCurrentlyFullscreen) {
    if (element.requestFullscreen) {
      element.requestFullscreen().catch((error) => console.error('Error enabling fullscreen:', error));
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch((error) => console.error('Error exiting fullscreen:', error));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

export function updateFullscreenState() {
  const isNowFullscreen = getFullscreenState();
  if (state.isFullscreen === isNowFullscreen) return;

  state.isFullscreen = isNowFullscreen;
  document.body.classList.toggle('canvas-fullscreen', state.isFullscreen);

  if (elements.toggleFullscreenBtn) {
    elements.toggleFullscreenBtn.textContent = state.isFullscreen ? '\u9000\u51fa\u5168\u5c4f' : '\u5168\u5c4f\u663e\u793a';
  }

  if (elements.fullscreenPalette) {
    elements.fullscreenPalette.setAttribute('aria-hidden', state.isFullscreen ? 'false' : 'true');
    if (state.isFullscreen) {
      renderFullscreenPalette();
      updateFullscreenPaletteSelection();
    }
  }

  setTimeout(updateFullscreenOverlayState, 50);
}

function initializeFullscreenListeners() {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  events.forEach((event) => document.addEventListener(event, updateFullscreenState));
  setTimeout(updateFullscreenState, 100);
}

initializeFullscreenListeners();
