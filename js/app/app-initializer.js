import { elements } from '../elements.js';
import { state } from '../state.js';
import { initializeShortcuts } from '../shortcuts.js';
import { autoOpenUpdateIfNeeded, initializeUpdate } from '../update.js';
import { autoOpenIntroIfNeeded, initializeIntro } from '../intro.js';
import { initializeExportWindow, toggleExportWindow } from '../export-window.js';
import { initializeReferenceFeature } from '../reference.js';
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
import { initializePaletteWindow } from '../palette-window.js';
import { initializeResizeCanvas } from '../resize-canvas.js';
import { initializeUIBindings } from '../ui/ui-bindings.js';
import { resolveResolutionValue } from './resolution.js';
import { initializeCanvasHighlight } from '../canvas-highlight.js';
import { applyLocalization } from './localization.js';
import { initializePhotoSketch } from '../photo-sketch.js';
import { emergencyAutosave } from '../local-storage.js';

export async function initializeApp() {
  applyLocalization();
  initializeUIBindings();

  initializeReferenceFeature();
  initializeUpdate();
  initializeIntro();
  autoOpenUpdateIfNeeded();
  autoOpenIntroIfNeeded();
  initializeExportWindow();
  initializePhotoSketch();
  initializeShortcuts();

  const paletteOverlay = elements.paletteLoadingOverlay;
  if (paletteOverlay) {
    paletteOverlay.classList.add('is-visible');
    paletteOverlay.setAttribute('aria-hidden', 'false');
  }
  try {
    await loadDefaultPalettes();
    loadPaletteLibrary();
    restoreLastPalette();
    initializeColorManagement();
    initializePaletteWindow();
  } finally {
    if (paletteOverlay) {
      paletteOverlay.classList.remove('is-visible');
      paletteOverlay.setAttribute('aria-hidden', 'true');
    }
  }
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
  prepareCanvasInteractions();

  window.addEventListener('beforeunload', handleBeforeUnload);
}

function shouldWarnBeforeUnload() {
  return Boolean(state.width && state.height && isCanvasDirty());
}

function handleBeforeUnload(event) {
  if (!shouldWarnBeforeUnload()) return;
  emergencyAutosave();

  event.preventDefault();
  event.returnValue = '';
}
