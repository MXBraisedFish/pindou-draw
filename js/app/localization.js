import { elements } from '../elements.js';
import { TEXT } from '../language.js';

const setText = (target, value) => {
  if (!target || typeof value !== 'string') return;
  target.textContent = value;
};

const setAttr = (target, name, value) => {
  if (!target || typeof value !== 'string') return;
  target.setAttribute(name, value);
};

export function applyLocalization() {
  document.title = TEXT.meta.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  setAttr(metaDesc, 'content', TEXT.meta.description);

  
  setText(elements.updateManualBtn, TEXT.buttons.updateManual);
  setAttr(elements.updateManualBtn, 'aria-label', TEXT.aria.updateManual);

  setText(elements.docsLink, TEXT.buttons.docs);
  setAttr(elements.docsLink, 'aria-label', TEXT.aria.openDocs);

  setText(elements.importBaseBtn, TEXT.buttons.importBase);
  setText(elements.clearBaseBtn, TEXT.buttons.clearBase);
  if (elements.exportHighlightBtn) {
    setText(elements.exportHighlightBtn, TEXT.buttons.exportHighlight ?? TEXT.buttons.export);
  }
  setText(elements.importProjectBtn, TEXT.buttons.importProject);
  setText(elements.createCanvasBtn, TEXT.buttons.createCanvas);
  setText(elements.resizeCanvasBtn, TEXT.buttons.resizeCanvas);

  setText(elements.loadDefaultPaletteBtn, TEXT.buttons.loadDefaultPalette);
  setText(elements.importPaletteBtn, TEXT.buttons.importPalette);
  setText(elements.deletePaletteBtn, TEXT.buttons.deletePalette);
  setText(elements.colorManageBtn, TEXT.buttons.colorManage);
  setText(elements.canvasHighlightBtn, TEXT.buttons.colorHighlight);
  const highlightReplaceText = TEXT.canvasHighlight?.replace ?? {};
  setText(elements.canvasHighlightReplaceBtn, highlightReplaceText.button ?? TEXT.buttons.replaceHighlight ?? '替换选中颜色');
  setText(elements.canvasHighlightReplacementTitle, highlightReplaceText.panelTitle ?? '选择替换色');
  setText(elements.canvasHighlightReplacementHint, highlightReplaceText.panelHint ?? '从色卡中挑选新的替换色，可多选');
  if (elements.canvasHighlightReplacementFilter) {
    elements.canvasHighlightReplacementFilter.placeholder = highlightReplaceText.filterPlaceholder ?? TEXT.placeholders.paletteFilter;
  }
  setText(elements.canvasHighlightReplacementConfirmBtn, highlightReplaceText.confirmButton ?? TEXT.buttons.confirm ?? '确认');
  setText(elements.canvasHighlightReplacementCloseBtn, highlightReplaceText.cancelButton ?? TEXT.buttons.cancel ?? '取消');

  setText(elements.toggleBaseEditBtn, TEXT.buttons.baseEdit);
  setText(elements.recenterBaseBtn, TEXT.buttons.baseRecenter);
  setText(elements.snapBaseToCanvasBtn, TEXT.buttons.baseSnap);

  setText(elements.selectAllColorsBtn, TEXT.buttons.selectAll);
  setText(elements.deselectAllColorsBtn, TEXT.buttons.deselectAll);

  setText(elements.exportCancelBtn, TEXT.buttons.cancel);
  setText(elements.exportConfirmBtn, TEXT.buttons.confirmExport);
  setText(elements.colorManageCancelBtn, TEXT.buttons.cancel);
  setText(elements.colorManageConfirmBtn, TEXT.buttons.confirm);
  setText(elements.paletteSwitchCancelBtn, TEXT.buttons.cancel);
  setText(elements.paletteSwitchConvertBtn, TEXT.buttons.convertPalette);
  setText(elements.paletteSwitchResetBtn, TEXT.buttons.resetCanvas);
  setText(elements.resizeCancelBtn, TEXT.buttons.cancel);
  setText(elements.resizeConfirmBtn, TEXT.buttons.confirm);

  
  setAttr(elements.widthInput, 'aria-label', TEXT.labels.widthInput);
  setAttr(elements.heightInput, 'aria-label', TEXT.labels.heightInput);
  setAttr(elements.resolutionInput, 'aria-label', TEXT.labels.resolutionInput);
  if (elements.paletteFilter) {
    elements.paletteFilter.placeholder = TEXT.placeholders.paletteFilter;
  }
  if (elements.colorManageSearchInput) {
    elements.colorManageSearchInput.placeholder = TEXT.placeholders.colorManageSearch ?? TEXT.placeholders.paletteFilter;
  }

  
  setText(elements.statusSize, TEXT.status.canvasNotCreated);
  setText(elements.statusPalette, TEXT.status.paletteNotLoaded);
  setText(elements.statusBase, TEXT.base.notLoaded);
  setText(elements.statusColorCode, TEXT.status.colorCodeNone);
  setText(elements.statusColorHex, '--');

  if (elements.currentColorCode) {
    elements.currentColorCode.textContent = TEXT.status.colorCodeNone;
  }
  if (elements.currentColorRgb) {
    elements.currentColorRgb.textContent = 'RGB: --';
  }

  if (elements.colorManageCurrentCode) {
    elements.colorManageCurrentCode.textContent = TEXT.status.colorCodeNone;
  }
  if (elements.colorManageCurrentRgb) {
    elements.colorManageCurrentRgb.textContent = 'RGB: --';
  }
  if (elements.colorManageModalCode) {
    elements.colorManageModalCode.textContent = TEXT.status.colorCodeNone;
  }
  if (elements.colorManageModalRgb) {
    elements.colorManageModalRgb.textContent = 'RGB: --';
  }

  
  if (elements.baseLayerSelect) {
    const optionUnder = elements.baseLayerSelect.querySelector('option[value="under"]');
    const optionOver = elements.baseLayerSelect.querySelector('option[value="over"]');
    const optionHidden = elements.baseLayerSelect.querySelector('option[value="hidden"]');
    setText(optionUnder, TEXT.labels.baseLayerOptions.under);
    setText(optionOver, TEXT.labels.baseLayerOptions.over);
    setText(optionHidden, TEXT.labels.baseLayerOptions.hidden);
  }
}
