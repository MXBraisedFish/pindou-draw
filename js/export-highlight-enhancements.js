import { exportHighlightManager } from './export-highlight.js';

const originalInitialize = exportHighlightManager.initialize.bind(exportHighlightManager);
const originalRenderColorList = exportHighlightManager.renderColorList.bind(exportHighlightManager);
const originalUpdatePreview = exportHighlightManager.updatePreview.bind(exportHighlightManager);
const originalUpdateFormatRestrictions = exportHighlightManager.updateFormatRestrictions.bind(exportHighlightManager);
const originalRenderHighlightedCanvas = exportHighlightManager.renderHighlightedCanvas.bind(exportHighlightManager);
const originalToggleSelection = exportHighlightManager.toggleColorSelection.bind(exportHighlightManager);
const originalSelectAll = exportHighlightManager.selectAllColors.bind(exportHighlightManager);
const originalDeselectAll = exportHighlightManager.deselectAllColors.bind(exportHighlightManager);

exportHighlightManager.currentFilterText = '';
exportHighlightManager.usedColorsTimer = null;

exportHighlightManager.bindExternalEvents = function bindExternalEvents() {
  if (typeof document === 'undefined' || typeof this.boundHandleGridUpdated !== 'function') return;
  if (!this._gridListenerAttached) {
    document.addEventListener('grid:updated', this.boundHandleGridUpdated);
    this._gridListenerAttached = true;
  }
};

exportHighlightManager.handleGridUpdated = function handleGridUpdated() {
  if (typeof window === 'undefined') return;
  if (this.usedColorsTimer !== null) return;
  this.usedColorsTimer = window.setTimeout(() => {
    this.usedColorsTimer = null;
    this.updateUsedColors();
  }, 120);
};

exportHighlightManager.notifyHighlightChange = function notifyHighlightChange() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
  }
};

exportHighlightManager.renderColorList = function renderColorList(filterText = this.currentFilterText) {
  const normalized = typeof filterText === 'string' ? filterText : '';
  this.currentFilterText = normalized;
  originalRenderColorList(normalized);
};

exportHighlightManager.filterColors = function filterColors(searchText) {
  this.currentFilterText = typeof searchText === 'string' ? searchText : '';
  this.renderColorList(this.currentFilterText);
};

exportHighlightManager.updateUsedColors = function updateUsedColors(options = {}) {
  const { silent = false } = options;
  const colors = this.collectUsedColors();
  this.usedColors = colors;
  const availableCodes = new Set(colors.map(color => color.code));
  let selectionChanged = false;
  this.selectedColors.forEach(code => {
    if (!availableCodes.has(code)) {
      this.selectedColors.delete(code);
      selectionChanged = true;
    }
  });
  this.renderColorList();
  if (!silent) {
    originalUpdatePreview();
  }
  if (!silent || selectionChanged) {
    originalUpdateFormatRestrictions();
  }
  if (selectionChanged) {
    this.notifyHighlightChange();
  }
  return colors;
};

exportHighlightManager.toggleColorSelection = function toggleColorSelection(colorCode) {
  originalToggleSelection(colorCode);
  this.notifyHighlightChange();
};

exportHighlightManager.selectAllColors = function selectAllColors() {
  originalSelectAll();
  this.notifyHighlightChange();
};

exportHighlightManager.deselectAllColors = function deselectAllColors() {
  originalDeselectAll();
  this.notifyHighlightChange();
};


exportHighlightManager.renderHighlightedCanvas = function renderHighlightedCanvas(canvas, selectedColors, options = {}) {
  this.updateUsedColors({ silent: true });
  return originalRenderHighlightedCanvas(canvas, selectedColors, options);
};

exportHighlightManager.initialize = function initializeEnhancements(...args) {
  const result = originalInitialize(...args);
  if (!this._enhancedHighlightManager) {
    this._enhancedHighlightManager = true;
    this.boundHandleGridUpdated = this.handleGridUpdated.bind(this);
    this.bindExternalEvents();
    this.updateUsedColors({ silent: true });
  }
  return result;
};
