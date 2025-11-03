import { elements } from '../elements.js';
import { state } from '../state.js';
import { initializeShortcuts } from '../shortcuts.js';
import { initializeUpdate } from '../update.js';
import { initializeExportWindow, toggleExportWindow } from '../export-window.js';
import { initializeReferenceFeature } from '../reference.js';
import { initializeDocs } from '../docs.js';
import { initializeSelectionLayers, renderSelectionLayers } from '../selection-layer.js';
import {
  createCanvas,
  prepareCanvasInteractions,
  isCanvasDirty
} from '../canvas.js';
import { initializeBaseScaleRange } from '../base-image.js';
import {
  loadPaletteLibrary,
  loadDefaultPalettes,
  restoreLastPalette,
  initializeColorManagement
} from '../palette.js';
import { updateFullscreenState } from '../fullscreen.js';
import { initializeResizeCanvas } from '../resize-canvas.js';
import { initializeUIBindings } from '../ui/ui-bindings.js';
import {
  initializeFullscreenOverlay,
  updateFullscreenOverlayState
} from './fullscreen-overlay.js';
import { resolveResolutionValue } from './resolution.js';
import { initializeCanvasHighlight } from '../canvas-highlight.js';
import { applyLocalization } from './localization.js';

export async function initializeApp() {
  applyLocalization();
  initializeFullscreenOverlay();
  initializeUIBindings();

  initializeReferenceFeature();
  initializeDocs();
  initializeUpdate();
  initializeExportWindow();
  initializeShortcuts();

  loadPaletteLibrary();
  await loadDefaultPalettes();
  restoreLastPalette();
  initializeColorManagement();
  initializeCanvasHighlight();

  const resolvedRatio = resolveResolutionValue(elements.resolutionInput?.value ?? state.pixelRatio);
  state.pixelRatio = resolvedRatio;
  if (elements.resolutionInput) {
    elements.resolutionInput.value = String(resolvedRatio);
  }

  const initialWidth = Number(elements.widthInput?.value) || 32;
  const initialHeight = Number(elements.heightInput?.value) || 32;
  const initialCellSize = resolveResolutionValue(elements.resolutionInput?.value ?? resolvedRatio);

  createCanvas(initialWidth, initialHeight, { cellSize: initialCellSize });
  initializeSelectionLayers();
  renderSelectionLayers();
  initializeResizeCanvas();
  initializeBaseScaleRange();
  updateFullscreenState();
  updateFullscreenOverlayState();
  prepareCanvasInteractions();

  window.addEventListener('beforeunload', handleBeforeUnload);
}

function shouldWarnBeforeUnload() {
  return Boolean(state.width && state.height && isCanvasDirty());
}

function handleBeforeUnload(event) {
  if (!shouldWarnBeforeUnload()) return;

  if (!state.exportVisible) {
    setTimeout(() => toggleExportWindow(true), 0);
  }

  event.preventDefault();
  event.returnValue = '';
}
