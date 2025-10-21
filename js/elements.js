const $ = (selector) => document.querySelector(selector);

export const elements = {
  canvas: $('#drawingCanvas'),
  baseCanvas: $('#baseCanvas'),
  stage: $('#canvasStage'),
  canvasWrapper: $('#canvasWrapper'),
  fullscreenPalette: $('#fullscreenPalette'),
  ctx: $('#drawingCanvas')?.getContext('2d') ?? null,
  baseCtx: $('#baseCanvas')?.getContext('2d') ?? null,
  importBaseBtn: $('#importBaseBtn'),
  clearBaseBtn: $('#clearBaseBtn'),
  baseImageInput: $('#baseImageInput'),
  autoSnapToggle: $('#autoSnapToggle'),
  showCodesToggle: $('#showCodesToggle'),
  zoomRange: $('#zoomRange'),
  toggleFullscreenBtn: $('#toggleFullscreenBtn'),
  exportBtn: $('#exportBtn'),
  exportFormat: $('#exportFormat'),
  widthInput: $('#widthInput'),
  heightInput: $('#heightInput'),
  createCanvasBtn: $('#createCanvasBtn'),
  toggleReferenceBtn: $('#toggleReferenceBtn'),
  referenceImageInput: $('#referenceImageInput'),
  docsToggleBtn: $('#docsToggleBtn'),
  exportProjectBtn: $('#exportProjectBtn'),
  importProjectBtn: $('#importProjectBtn'),
  projectFileInput: $('#projectFileInput'),
  loadDefaultPaletteBtn: $('#loadDefaultPaletteBtn'),
  importPaletteBtn: $('#importPaletteBtn'),
  paletteFileInput: $('#paletteFileInput'),
  paletteFilter: $('#paletteFilter'),
  paletteHistorySelect: $('#paletteHistorySelect'),
  paletteContainer: $('#paletteContainer'),
  deletePaletteBtn: $('#deletePaletteBtn'),
  currentColorInfo: $('#currentColorInfo'),
  canvasOpacityRange: $('#canvasOpacityRange'),
  canvasOpacityValue: $('#canvasOpacityValue'),
  toggleBaseEditBtn: $('#toggleBaseEditBtn'),
  toolPencilBtn: $('#toolPencilBtn'),
  toolBucketBtn: $('#toolBucketBtn'),
  baseLayerSelect: $('#baseLayerSelect'),
  statusSize: $('#statusSize'),
  statusBase: $('#statusBase'),
  statusPalette: $('#statusPalette'),
  baseScaleRange: $('#baseScaleRange'),
  baseScaleValue: $('#baseScaleValue'),
  recenterBaseBtn: $('#recenterBaseBtn'),
  snapBaseToCanvasBtn: $('#snapBaseToCanvasBtn'),
  referenceWindow: document.getElementById('referenceWindow'),
  docsWindow: document.getElementById('docsWindow'),
  referenceList: document.getElementById('referenceList'),
  referenceHeader: document.getElementById('referenceHeader'),
  referenceAddBtn: document.getElementById('referenceAddBtn'),
  docsCloseBtn: document.getElementById('docsCloseBtn'),
  referenceMinimizeBtn: document.getElementById('referenceMinimizeBtn'),
  referenceCloseBtn: document.getElementById('referenceCloseBtn'),
  referenceResizer: document.getElementById('referenceResizer')
};

export const fullscreenBaseEditBtn = (() => {
  const btn = document.createElement('button');
  btn.id = 'fullscreenBaseEditBtn';
  btn.type = 'button';
  btn.textContent = '\u5E95\u56FE\u7F16\u8F91';
  btn.style.display = 'none';
  document.body.appendChild(btn);
  return btn;
})();
