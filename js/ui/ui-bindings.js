import { elements } from '../elements.js';
import { state } from '../state.js';
import {
  createCanvas,
  handleWheelEvent,
  isCanvasDirty,
  redrawCanvas,
  setCellSize,
  setTool,
  updateCanvasOpacityLabel,
  validateCanvasSize
} from '../canvas.js';
import {
  applyBaseLayerPosition,
  applyBaseScale,
  clearBaseImage,
  handleBaseImageChange,
  recenterBaseImage,
  snapBaseToCanvas,
  toggleBaseEditMode,
  formatBaseScaleValue
} from '../base-image.js';
import { toggleFullscreen } from '../fullscreen.js';
import { toggleReferenceWindow } from '../reference.js';
import { toggleExportWindow } from '../export-window.js';
import {
  handlePaletteFile,
  handleDeletePalette,
  handlePaletteSelectionChange,
  renderPalette,
  handleBuiltinPaletteLoad
} from '../palette.js';
import { flipHorizontal, flipVertical, rotateClockwise, rotateCounterclockwise } from '../image-operations.js';
import { importProjectFile } from '../pd.js';
import { resolveResolutionValue, handleResolutionInputChange } from '../app/resolution.js';
import { renderSelectionLayers } from '../selection-layer.js';
import { updateFullscreenOverlayState } from '../app/fullscreen-overlay.js';

const CANVAS_WARNING_AREA = 80 * 80;
const CANVAS_DANGER_AREA = 128 * 128;

export function initializeUIBindings() {
  bindBaseImageControls();
  bindCanvasControls();
  bindToolControls();
  bindImageOperationControls();
  bindPaletteControls();
  bindWindowControls();
  bindProjectControls();
  initializeImageOperationsDropdown();
}

function bindBaseImageControls() {
  elements.importBaseBtn?.addEventListener('click', () => elements.baseImageInput?.click());
  elements.clearBaseBtn?.addEventListener('click', () => {
    clearBaseImage();
    updateFullscreenOverlayState();
  });
  elements.baseImageInput?.addEventListener('change', handleBaseImageChange);
  elements.toggleFullscreenBtn?.addEventListener('click', () => {
    toggleFullscreen();
    updateFullscreenOverlayState();
  });
  elements.toggleBaseEditBtn?.addEventListener('click', toggleBaseEditMode);
  elements.recenterBaseBtn?.addEventListener('click', recenterBaseImage);
  elements.snapBaseToCanvasBtn?.addEventListener('click', snapBaseToCanvas);
  elements.baseScaleRange?.addEventListener('input', handleBaseScaleRangeInput);
  elements.baseScaleInput?.addEventListener('input', handleBaseScaleInput);
  elements.baseScaleInput?.addEventListener('change', handleBaseScaleInput);
  elements.baseLayerSelect?.addEventListener('change', (event) => {
    state.baseLayerPosition = event.target.value;
    applyBaseLayerPosition();
  });
}

function bindCanvasControls() {
  elements.widthInput?.addEventListener('input', updateCanvasSizeWarningMessage);
  elements.heightInput?.addEventListener('input', updateCanvasSizeWarningMessage);
  elements.createCanvasBtn?.addEventListener('click', createNewCanvas);
  elements.resolutionInput?.addEventListener('change', handleResolutionInputChange);
  elements.canvasWrapper?.addEventListener('wheel', handleWheelEvent, { passive: false });
  elements.canvasOpacityRange?.addEventListener('input', handleCanvasOpacityChange);
  elements.zoomRange?.addEventListener('input', handleZoomChange);
  elements.autoSnapToggle?.addEventListener('change', (event) => {
    state.autoSnap = Boolean(event.target.checked);
  });
  elements.showCodesToggle?.addEventListener('change', (event) => {
    state.showCodes = Boolean(event.target.checked);
    redrawCanvas();
    renderSelectionLayers();
  });
  updateCanvasSizeWarningMessage();
}

function bindToolControls() {
  elements.toolPencilBtn?.addEventListener('click', () => setTool('pencil'));
  elements.toolBucketBtn?.addEventListener('click', () => setTool('bucket'));
  elements.toolEyedropperBtn?.addEventListener('click', () => setTool('eyedropper'));
  elements.toolSelectionBtn?.addEventListener('click', () => setTool('selection'));
}

function bindImageOperationControls() {
  elements.flipHorizontalBtn?.addEventListener('click', flipHorizontal);
  elements.flipVerticalBtn?.addEventListener('click', flipVertical);
  elements.rotateClockwiseBtn?.addEventListener('click', rotateClockwise);
  elements.rotateCounterclockwiseBtn?.addEventListener('click', rotateCounterclockwise);
}

function bindPaletteControls() {
  elements.loadDefaultPaletteBtn?.addEventListener('click', handleBuiltinPaletteLoad);
  elements.importPaletteBtn?.addEventListener('click', () => elements.paletteFileInput?.click());
  elements.paletteFileInput?.addEventListener('change', handlePaletteFile);
  elements.paletteFilter?.addEventListener('input', renderPalette);
  elements.deletePaletteBtn?.addEventListener('click', handleDeletePalette);
  elements.paletteHistorySelect?.addEventListener('change', handlePaletteSelectionChange);
}

function bindWindowControls() {
  elements.toggleReferenceBtn?.addEventListener('click', toggleReferenceWindow);
  elements.exportBtn?.addEventListener('click', () => {
    if (state.width && state.height) {
      toggleExportWindow(true);
    } else {
      window.alert('\u8bf7\u5148\u521b\u5efa\u753b\u5e03\u3002');
    }
  });
}

function bindProjectControls() {
  elements.importProjectBtn?.addEventListener('click', () => elements.projectFileInput?.click());
  elements.projectFileInput?.addEventListener('change', handleProjectFileImport);
}

function handleBaseScaleRangeInput(event) {
  const rawValue = Number(event.target.value);
  if (!state.baseImage || !Number.isFinite(rawValue)) return;

  const changed = applyBaseScale(rawValue, state.width / 2, state.height / 2);
  if (elements.baseScaleRange) {
    elements.baseScaleRange.value = String(state.baseScale);
  }
  if (elements.baseScaleInput) {
    elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);
  }

  if (changed) updateFullscreenOverlayState();
}

function handleBaseScaleInput(event) {
  if (!elements.baseScaleInput) return;

  const rawValue = Number(event.target.value);
  if (!state.baseImage || !Number.isFinite(rawValue)) {
    elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);
    return;
  }

  const changed = applyBaseScale(rawValue, state.width / 2, state.height / 2);
  if (elements.baseScaleRange) {
    elements.baseScaleRange.value = String(state.baseScale);
  }
  elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);

  if (changed) updateFullscreenOverlayState();
}

function handleCanvasOpacityChange(event) {
  state.backgroundOpacity = Number(event.target.value) / 100;
  updateCanvasOpacityLabel();
  redrawCanvas();
  renderSelectionLayers();
}

function updateCanvasSizeWarningMessage() {
  const warningEl = elements.canvasSizeWarning;
  if (!warningEl) return;

  const width = Number(elements.widthInput?.value);
  const height = Number(elements.heightInput?.value);

  warningEl.className = 'canvas-size-warning';

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    warningEl.textContent = '';
    return;
  }

  const area = width * height;
  let message = '';
  if (area > CANVAS_DANGER_AREA) {
    message = `当前设置为 ${width} × ${height}，超大的画布可能导致严重卡顿。`;
    warningEl.classList.add('is-danger');
  } else if (area > CANVAS_WARNING_AREA) {
    message = `当前设置为 ${width} × ${height}，过大的画布可能导致卡顿。`;
    warningEl.classList.add('is-warning');
  } else {
    warningEl.textContent = '';
    return;
  }

  warningEl.textContent = message;
}

function handleZoomChange(event) {
  const value = Number(event.target.value);
  if (Number.isFinite(value)) {
    setCellSize(value);
  }
}

function createNewCanvas() {
  const width = Number(elements.widthInput?.value);
  const height = Number(elements.heightInput?.value);
  updateCanvasSizeWarningMessage();

  if (!validateCanvasSize(width, height)) {
    window.alert('\u8bf7\u8f93\u5165 1 - 2048 \u8303\u56f4\u5185\u7684\u753b\u5e03\u5c3a\u5bf8\u3002');
    return;
  }

  if (isCanvasDirty() && !window.confirm('\u65b0\u5efa\u753b\u5e03\u4f1a\u6e05\u7a7a\u5f53\u524d\u753b\u5e03\u7684\u989c\u8272\uff0c\u662f\u5426\u7ee7\u7eed\uff1f')) {
    return;
  }

  const normalizedResolution = resolveResolutionValue(elements.resolutionInput?.value);
  if (elements.resolutionInput) {
    elements.resolutionInput.value = String(normalizedResolution);
  }
  state.pixelRatio = normalizedResolution;

  createCanvas(width, height, { cellSize: normalizedResolution });
  renderSelectionLayers();
  updateFullscreenOverlayState();
}

async function handleProjectFileImport(event) {
  const file = event.target.files?.[0];
  if (file) {
    await importProjectFile(file);
  }
  event.target.value = '';
}

function initializeImageOperationsDropdown() {
  const setupDropdown = () => {
    const dropdownToggle = document.querySelector('.image-operations-dropdown .dropdown-toggle');
    const dropdownMenu = document.querySelector('.image-operations-dropdown .dropdown-menu');

    if (!dropdownToggle || !dropdownMenu) return;

    dropdownToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isExpanded = dropdownToggle.getAttribute('aria-expanded') === 'true';
      dropdownToggle.setAttribute('aria-expanded', String(!isExpanded));
      dropdownMenu.setAttribute('aria-hidden', String(isExpanded));
    });

    dropdownMenu.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target.classList.contains('dropdown-item')) {
        dropdownToggle.setAttribute('aria-expanded', 'false');
        dropdownMenu.setAttribute('aria-hidden', 'true');
      }
    });

    document.addEventListener('click', () => {
      dropdownToggle.setAttribute('aria-expanded', 'false');
      dropdownMenu.setAttribute('aria-hidden', 'true');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDropdown, { once: true });
  } else {
    setupDropdown();
  }
}
