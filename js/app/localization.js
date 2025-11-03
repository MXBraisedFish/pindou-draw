import { elements } from '../elements.js';
import { TEXT } from '../language.js';

function setTextContent(target, value) {
  if (!target || typeof value !== 'string') return;
  target.textContent = value;
}

function setAttribute(target, name, value) {
  if (!target || typeof value !== 'string') return;
  target.setAttribute(name, value);
}

function setFirstTextNode(element, value) {
  if (!element || typeof value !== 'string') return;
  const textNode = Array.from(element.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
  );
  if (textNode) {
    textNode.textContent = value;
  } else {
    element.insertBefore(document.createTextNode(value), element.firstChild ?? null);
  }
}

function setButtonLabel(button, value) {
  if (!button || typeof value !== 'string') return;
  const hasIcon = Boolean(button.querySelector('svg'));
  if (!hasIcon) {
    button.textContent = value;
    return;
  }

  Array.from(button.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      button.removeChild(node);
    }
  });

  let label = button.querySelector('.localized-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'localized-label';
    button.appendChild(label);
  }
  label.textContent = value;
}

function updateHeader() {
  document.title = TEXT.meta.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  setAttribute(metaDesc, 'content', TEXT.meta.description);

  setTextContent(document.querySelector('.header-text h1'), TEXT.header.title);
  setTextContent(document.querySelector('.header-text p'), TEXT.header.subtitle);

  setButtonLabel(elements.updateManualBtn, TEXT.buttons.updateManual);
  setAttribute(elements.updateManualBtn, 'aria-label', TEXT.aria.updateManual);
  setAttribute(elements.updateManualBtn, 'title', TEXT.aria.updateManual);

  setButtonLabel(elements.docsToggleBtn, TEXT.buttons.docs);
  setAttribute(elements.docsToggleBtn, 'aria-label', TEXT.aria.openDocs);
  setAttribute(elements.docsToggleBtn, 'title', TEXT.aria.docsButtonTitle);
}

function updateToolbar() {
  const canvasPane = document.querySelector('.canvas-pane');
  setAttribute(canvasPane, 'aria-label', TEXT.aria.canvasPane);

  const toolbar = document.querySelector('.canvas-toolbar');
  setAttribute(toolbar, 'aria-label', TEXT.aria.toolbar);

  setButtonLabel(elements.importBaseBtn, TEXT.buttons.importBase);
  setButtonLabel(elements.clearBaseBtn, TEXT.buttons.clearBase);
  setButtonLabel(elements.exportBtn, TEXT.buttons.export);
  setButtonLabel(elements.importProjectBtn, TEXT.buttons.importProject);
  setButtonLabel(elements.toggleFullscreenBtn, TEXT.buttons.fullscreen);
  setButtonLabel(elements.toggleReferenceBtn, TEXT.buttons.referenceWindow);

  setAttribute(elements.toolPencilBtn, 'title', TEXT.toolbar.tools.pencil);
  setAttribute(elements.toolPencilBtn, 'aria-label', TEXT.toolbar.tools.pencil);
  setAttribute(elements.toolBucketBtn, 'title', TEXT.toolbar.tools.bucket);
  setAttribute(elements.toolBucketBtn, 'aria-label', TEXT.toolbar.tools.bucket);
  setAttribute(elements.toolEyedropperBtn, 'title', TEXT.toolbar.tools.eyedropper);
  setAttribute(elements.toolEyedropperBtn, 'aria-label', TEXT.toolbar.tools.eyedropper);
  setAttribute(elements.toolSelectionBtn, 'title', TEXT.toolbar.tools.selection);
  setAttribute(elements.toolSelectionBtn, 'aria-label', TEXT.toolbar.tools.selection);

  const dropdownToggle = document.querySelector('.image-operations-dropdown .dropdown-toggle');
  const dropdownLabel = dropdownToggle?.querySelector('span');
  setTextContent(dropdownLabel, TEXT.toolbar.dropdown.label);

  const setDropdownItem = (selector, text) => {
    const item = document.querySelector(selector);
    if (!item) return;
    setAttribute(item, 'title', text);
    setAttribute(item, 'aria-label', text);
    setButtonLabel(item, text);
  };

  setDropdownItem('#flipHorizontalBtn', TEXT.toolbar.dropdown.items.flipHorizontal);
  setDropdownItem('#flipVerticalBtn', TEXT.toolbar.dropdown.items.flipVertical);
  setDropdownItem('#rotateClockwiseBtn', TEXT.toolbar.dropdown.items.rotateClockwise);
  setDropdownItem('#rotateCounterclockwiseBtn', TEXT.toolbar.dropdown.items.rotateCounterclockwise);

  const autoSnapLabel = document.querySelector('label[for="autoSnapToggle"] span');
  setTextContent(autoSnapLabel, TEXT.toggles.autoSnap);
  const showCodesLabel = document.querySelector('label[for="showCodesToggle"] span');
  setTextContent(showCodesLabel, TEXT.toggles.showCodes);
  const zoomLabel = document.querySelector('.zoom-control span');
  setTextContent(zoomLabel, TEXT.toggles.zoom);
}

function updateNewCanvasPanel() {
  const controlPanel = document.querySelector('.side-pane');
  setAttribute(controlPanel, 'aria-label', TEXT.aria.controlPanel);

  const newCanvasHeading = controlPanel?.querySelector('section.panel:first-of-type h2');
  setTextContent(newCanvasHeading, TEXT.labels.newCanvasSection);

  setTextContent(document.querySelector('label[for="widthInput"]'), TEXT.labels.widthInput);
  setTextContent(document.querySelector('label[for="heightInput"]'), TEXT.labels.heightInput);
  setTextContent(document.querySelector('label[for="resolutionInput"]'), TEXT.labels.resolutionInput);
  const resolutionSuffix = document.querySelector('.resolution-suffix');
  setTextContent(resolutionSuffix, TEXT.labels.resolutionSuffix);

  setButtonLabel(elements.createCanvasBtn, TEXT.buttons.createCanvas);
  setButtonLabel(elements.resizeCanvasBtn, TEXT.buttons.resizeCanvas);

  const canvasOpacityLabel = document.querySelector('label[for="canvasOpacityRange"]');
  if (canvasOpacityLabel) {
    setFirstTextNode(canvasOpacityLabel, TEXT.labels.canvasOpacity + ' ');
  }
}

function updatePalettePanel() {
  const palettePanel = document.querySelectorAll('.side-pane section.panel')[1];
  const heading = palettePanel?.querySelector('h2');
  setTextContent(heading, TEXT.labels.paletteSection);

  setTextContent(document.querySelector('label[for="paletteHistorySelect"]'), TEXT.labels.paletteHistory);
  setTextContent(document.querySelector('label[for="paletteFilter"]'), TEXT.labels.paletteFilter);
  setAttribute(document.querySelector('#paletteFilter'), 'placeholder', TEXT.placeholders.paletteFilter);

  setButtonLabel(elements.loadDefaultPaletteBtn, TEXT.buttons.loadDefaultPalette);
  setButtonLabel(elements.importPaletteBtn, TEXT.buttons.importPalette);
  setButtonLabel(elements.colorManageBtn, TEXT.buttons.colorManage);
  setButtonLabel(elements.canvasHighlightBtn, TEXT.buttons.colorHighlight);
  setButtonLabel(elements.deletePaletteBtn, TEXT.buttons.deletePalette);

  const historyPlaceholder = document.querySelector('#paletteHistorySelect option[value="__none"]');
  setTextContent(historyPlaceholder, TEXT.palette.historyPlaceholder);

  setTextContent(elements.currentColorInfo, `${TEXT.labels.currentColorPrefix}`);
  const currentColorCode = elements.currentColorInfo?.querySelector('.code');
  setTextContent(currentColorCode, TEXT.status.colorCodeNone);
}

function updateBasePanel() {
  const basePanel = document.querySelectorAll('.side-pane section.panel')[2];
  const heading = basePanel?.querySelector('h2');
  setTextContent(heading, TEXT.labels.baseSection);

  setTextContent(document.querySelector('label[for="baseLayerSelect"]'), TEXT.labels.baseLayer);

  const optionUnder = document.querySelector('#baseLayerSelect option[value="under"]');
  const optionOver = document.querySelector('#baseLayerSelect option[value="over"]');
  const optionHidden = document.querySelector('#baseLayerSelect option[value="hidden"]');
  setTextContent(optionUnder, TEXT.labels.baseLayerOptions.under);
  setTextContent(optionOver, TEXT.labels.baseLayerOptions.over);
  setTextContent(optionHidden, TEXT.labels.baseLayerOptions.hidden);

  setButtonLabel(elements.toggleBaseEditBtn, TEXT.buttons.baseEdit);
  setButtonLabel(elements.recenterBaseBtn, TEXT.buttons.baseRecenter);
  setButtonLabel(elements.snapBaseToCanvasBtn, TEXT.buttons.baseSnap);

  const baseScaleLabel = document.querySelector('label[for="baseScaleRange"]');
  if (baseScaleLabel) {
    setFirstTextNode(baseScaleLabel, TEXT.labels.baseScale + ' ');
  }
  setAttribute(elements.baseScaleInput, 'aria-label', TEXT.aria.baseScaleInput);
}

function updateStatusPanel() {
  const statusPanel = document.querySelectorAll('.side-pane section.panel')[3];
  const heading = statusPanel?.querySelector('h2');
  setTextContent(heading, TEXT.labels.statusSection);

  const statusItems = statusPanel?.querySelectorAll('.status-list li');
  if (!statusItems) return;

  const [canvasItem, baseItem, paletteItem] = statusItems;
  setFirstTextNode(canvasItem, TEXT.labels.statusCanvas);
  setTextContent(elements.statusSize, TEXT.status.canvasNotCreated);

  setFirstTextNode(baseItem, TEXT.labels.statusBase);
  setTextContent(elements.statusBase, TEXT.status.baseNotImported);

  setFirstTextNode(paletteItem, TEXT.labels.statusPalette);
  setTextContent(elements.statusPalette, TEXT.status.paletteNotLoaded);
}

function updateReferenceWindow() {
  setTextContent(document.querySelector('#referenceHeader .reference-title'), TEXT.reference.title);
  setAttribute(elements.referenceAddBtn, 'aria-label', TEXT.aria.referenceAdd);
  setAttribute(elements.referenceMinimizeBtn, 'aria-label', TEXT.aria.referenceMinimize);
  setAttribute(elements.referenceCloseBtn, 'aria-label', TEXT.aria.referenceClose);
}

function updateDocsWindow() {
  setTextContent(document.querySelector('#docsWindow .docs-title'), TEXT.docs.title);
  setAttribute(elements.docsCloseBtn, 'aria-label', TEXT.docs.closeAria);
  const docsBody = document.querySelector('#docsWindow .docs-body');
  if (docsBody) docsBody.innerHTML = TEXT.docs.content;
}

function updateUpdateWindow() {
  setTextContent(document.querySelector('#updateWindow .update-title'), TEXT.update.title);
  setAttribute(elements.updateCloseBtn, 'aria-label', TEXT.update.closeAria);
  const updateBody = document.querySelector('#updateWindow .update-body');
  if (updateBody) updateBody.innerHTML = TEXT.update.content;
}

function updateExportWindow() {
  const exportWindow = elements.exportWindow;
  setAttribute(exportWindow, 'aria-label', TEXT.exportWindow.title);
  setTextContent(exportWindow?.querySelector('.export-title'), TEXT.exportWindow.title);
  setAttribute(elements.exportCloseBtn, 'aria-label', TEXT.exportWindow.closeAria);

  const previewTitle = exportWindow?.querySelector('.export-preview-container h3');
  if (previewTitle) {
    const hint = previewTitle.querySelector('.preview-controls-hint');
    setFirstTextNode(previewTitle, TEXT.exportWindow.previewTitle);
    setTextContent(hint, TEXT.exportWindow.previewHint);
  }

  setTextContent(exportWindow?.querySelector('.export-setting-group:nth-of-type(1) h3'), TEXT.exportWindow.fileSettings);
  setTextContent(document.querySelector('label[for="exportFilename"]'), TEXT.exportWindow.fileNameLabel);
  setAttribute(elements.exportFilename, 'placeholder', TEXT.exportWindow.fileNamePlaceholder);
  const filenameSuffix = document.querySelector('.filename-suffix');
  setTextContent(filenameSuffix, TEXT.exportWindow.fileNameSuffix);

  setTextContent(exportWindow?.querySelector('.export-setting-group:nth-of-type(2) h3'), TEXT.exportWindow.optionsHeading);
  const formatLabels = document.querySelectorAll('input[name="exportFormat"] + span');
  formatLabels?.forEach((span, index) => {
    const texts = [
      TEXT.exportWindow.formats.png,
      TEXT.exportWindow.formats.jpeg,
      TEXT.exportWindow.formats.pdf,
      TEXT.exportWindow.formats.pd
    ];
    setTextContent(span, texts[index] ?? span.textContent);
  });

  setTextContent(exportWindow?.querySelector('.export-setting-group:nth-of-type(3) h3'), TEXT.exportWindow.displayHeading);
  const displayLabels = document.querySelectorAll('.export-setting-group:nth-of-type(3) .radio-group span');
  displayLabels?.forEach((span, index) => {
    const texts = [
      TEXT.exportWindow.displayOptions.codesInclude,
      TEXT.exportWindow.displayOptions.codesExclude,
      TEXT.exportWindow.displayOptions.axesInclude,
      TEXT.exportWindow.displayOptions.axesExclude
    ];
    setTextContent(span, texts[index] ?? span.textContent);
  });

  setTextContent(exportWindow?.querySelector('.export-setting-group:nth-of-type(4) h3'), TEXT.exportWindow.backgroundHeading);
  setTextContent(document.querySelector('label[for="exportBackgroundColor"]'), TEXT.exportWindow.backgroundLabel);
  const backgroundLabels = document.querySelectorAll('.export-setting-group:nth-of-type(4) .radio-group span');
  backgroundLabels?.forEach((span, index) => {
    const texts = [TEXT.exportWindow.backgroundOptions.solid, TEXT.exportWindow.backgroundOptions.transparent];
    setTextContent(span, texts[index] ?? span.textContent);
  });

  setTextContent(exportWindow?.querySelector('.export-highlight-panel h3'), TEXT.exportWindow.highlightHeading);
  setButtonLabel(document.getElementById('selectAllHighlightColors'), TEXT.buttons.selectAll);
  setButtonLabel(document.getElementById('deselectAllHighlightColors'), TEXT.buttons.deselectAll);
  setAttribute(document.getElementById('highlightColorFilter'), 'placeholder', TEXT.exportWindow.searchPlaceholder);
  const highlightEmpty = document.querySelector('#highlightColorList .highlight-color-empty');
  setTextContent(highlightEmpty, TEXT.exportWindow.loading);
  setButtonLabel(document.getElementById('exportAllHighlightColors'), TEXT.exportWindow.exportAll);
  setButtonLabel(elements.exportCancelBtn, TEXT.buttons.cancel);
  setButtonLabel(elements.exportConfirmBtn, TEXT.buttons.confirmExport);
}

function updateResizeOverlay() {
  setTextContent(document.querySelector('#resizeCanvasTitle'), TEXT.resize.title);
  setAttribute(elements.resizeCloseBtn, 'aria-label', TEXT.resize.closeAria);
  const modeLabel = document.querySelector('.resize-mode-row');
  setAttribute(modeLabel, 'aria-label', TEXT.resize.modeLabel);
  setButtonLabel(elements.resizeModeExpandBtn, TEXT.resize.modeExpand);
  setButtonLabel(elements.resizeModeCropBtn, TEXT.resize.modeCrop);
  elements.resizeEditButtons?.forEach((btn) => setFirstTextNode(btn, TEXT.resize.editButton));
  elements.resizeEditValues?.forEach((label) => {
    setTextContent(label, TEXT.resize.initialEditValue(0));
  });
  setTextContent(elements.resizeCurrentSize, `${TEXT.resize.currentSizeLabel}0 × 0`);
  setTextContent(elements.resizeResultSize, `${TEXT.resize.resultSizeLabel}0 × 0`);
  setButtonLabel(elements.resizeConfirmBtn, TEXT.buttons.confirm);
  setButtonLabel(elements.resizeCancelBtn, TEXT.buttons.cancel);
}

function updateColorManageWindow() {
  const title = document.querySelector('#colorManageWindow .color-manage-title');
  setTextContent(title, TEXT.labels.colorManageTitle);
  setAttribute(elements.colorManageCloseBtn, 'aria-label', TEXT.aria.colorManageClose);
  setButtonLabel(elements.selectAllColorsBtn, TEXT.buttons.selectAll);
  setButtonLabel(elements.deselectAllColorsBtn, TEXT.buttons.deselectAll);
  setTextContent(elements.enabledColorCount, TEXT.palette.enabledCount(0, 0));
  const empty = document.querySelector('#colorManageList .color-manage-empty');
  setTextContent(empty, TEXT.colorManagement.loading);
  setButtonLabel(elements.colorManageCancelBtn, TEXT.buttons.cancel);
  setButtonLabel(elements.colorManageConfirmBtn, TEXT.buttons.confirm);
}

function updateCanvasHighlightWindow() {
  setTextContent(document.querySelector('#canvasHighlightWindow .canvas-highlight-title'), TEXT.canvasHighlight.title);
  setAttribute(elements.canvasHighlightCloseBtn, 'aria-label', TEXT.canvasHighlight.closeAria);
  setButtonLabel(elements.canvasHighlightSelectAllBtn, TEXT.buttons.selectAll);
  setButtonLabel(elements.canvasHighlightDeselectAllBtn, TEXT.buttons.deselectAll);
  setAttribute(elements.canvasHighlightFilter, 'placeholder', TEXT.canvasHighlight.searchPlaceholder);
  const empty = document.querySelector('#canvasHighlightList .highlight-color-empty');
  setTextContent(empty, TEXT.canvasHighlight.loading);
  setTextContent(document.querySelector('.canvas-highlight-replace label'), TEXT.canvasHighlight.replaceLabel);
  setButtonLabel(elements.canvasHighlightApplyReplaceBtn, TEXT.buttons.applyReplace);
}

function updatePaletteSwitchOverlay() {
  setTextContent(document.querySelector('#paletteSwitchTitle'), TEXT.paletteSwitch.title);
  setAttribute(elements.paletteSwitchCloseBtn, 'aria-label', TEXT.paletteSwitch.closeAria);
  setTextContent(document.querySelector('.palette-switch-summary'), TEXT.paletteSwitch.summary);
  const targetLabel = document.querySelector('.palette-switch-target');
  if (targetLabel) {
    setFirstTextNode(targetLabel, TEXT.paletteSwitch.targetLabel);
  }
  setTextContent(elements.paletteSwitchName, TEXT.paletteSwitch.fallbackName);
  setButtonLabel(elements.paletteSwitchCancelBtn, TEXT.buttons.cancel);
  setButtonLabel(elements.paletteSwitchConvertBtn, TEXT.buttons.convertPalette);
  setButtonLabel(elements.paletteSwitchResetBtn, TEXT.buttons.resetCanvas);
}

function updatePreviewLoadingText() {
  const exportPreview = document.querySelector('.export-preview');
  if (exportPreview) {
    exportPreview.setAttribute('data-loading-text', TEXT.preview.loading);
  }
}

export function applyLocalization() {
  updateHeader();
  updateToolbar();
  updateNewCanvasPanel();
  updatePalettePanel();
  updateBasePanel();
  updateStatusPanel();
  updateReferenceWindow();
  updateDocsWindow();
  updateUpdateWindow();
  updateExportWindow();
  updateResizeOverlay();
  updateColorManageWindow();
  updateCanvasHighlightWindow();
  updatePaletteSwitchOverlay();
  updatePreviewLoadingText();
}
