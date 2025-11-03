import { fullscreenBaseEditBtn } from '../elements.js';
import { state } from '../state.js';
import { toggleBaseEditMode } from '../base-image.js';

let feedbackTimer = null;

export function initializeFullscreenOverlay() {
  if (!fullscreenBaseEditBtn) return;

  fullscreenBaseEditBtn.addEventListener('click', handleFullscreenBaseToggle);
  document.addEventListener('updateFullscreenOverlay', updateFullscreenOverlayState);

  updateFullscreenOverlayState();
}

export function updateFullscreenOverlayState() {
  if (!fullscreenBaseEditBtn) return;

  const shouldShow = state.isFullscreen && state.baseImage;
  fullscreenBaseEditBtn.style.display = shouldShow ? 'inline-flex' : 'none';
  fullscreenBaseEditBtn.disabled = !state.baseImage;
}

function handleFullscreenBaseToggle() {
  toggleBaseEditMode();
  showFullscreenBaseFeedback();
}

function showFullscreenBaseFeedback() {
  if (!fullscreenBaseEditBtn || !state.isFullscreen) return;

  window.clearTimeout(feedbackTimer);
  fullscreenBaseEditBtn.classList.add('active');
  feedbackTimer = window.setTimeout(() => {
    fullscreenBaseEditBtn.classList.remove('active');
  }, 600);
}
