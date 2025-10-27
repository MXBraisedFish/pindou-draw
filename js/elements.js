// elements.js
const $ = (selector) => document.querySelector(selector);

export const elements = {
  // 画布相关
  canvas: $('#drawingCanvas'),
  baseCanvas: $('#baseCanvas'),
  stage: $('#canvasStage'),
  canvasWrapper: $('#canvasWrapper'),
  fullscreenPalette: $('#fullscreenPalette'),
  ctx: $('#drawingCanvas')?.getContext('2d') ?? null,
  baseCtx: $('#baseCanvas')?.getContext('2d') ?? null,

  // 工具栏按钮
  importBaseBtn: $('#importBaseBtn'),
  clearBaseBtn: $('#clearBaseBtn'),
  toggleFullscreenBtn: $('#toggleFullscreenBtn'),
  toggleReferenceBtn: $('#toggleReferenceBtn'),
  exportBtn: $('#exportBtn'),
  createCanvasBtn: $('#createCanvasBtn'),

  // 绘图工具
  toolPencilBtn: $('#toolPencilBtn'),
  toolBucketBtn: $('#toolBucketBtn'),
  toolEyedropperBtn: $('#toolEyedropperBtn'),
  toolSelectionBtn: $('#toolSelectionBtn'),

  // 图像操作工具
  flipHorizontalBtn: $('#flipHorizontalBtn'),
  flipVerticalBtn: $('#flipVerticalBtn'),
  rotateClockwiseBtn: $('#rotateClockwiseBtn'),
  rotateCounterclockwiseBtn: $('#rotateCounterclockwiseBtn'),

  // 输入控件
  baseImageInput: $('#baseImageInput'),
  widthInput: $('#widthInput'),
  heightInput: $('#heightInput'),
  zoomRange: $('#zoomRange'),
  autoSnapToggle: $('#autoSnapToggle'),
  showCodesToggle: $('#showCodesToggle'),
  canvasOpacityRange: $('#canvasOpacityRange'),
  baseLayerSelect: $('#baseLayerSelect'),
  baseScaleRange: $('#baseScaleRange'),

  // 底图控制
  toggleBaseEditBtn: $('#toggleBaseEditBtn'),
  recenterBaseBtn: $('#recenterBaseBtn'),
  snapBaseToCanvasBtn: $('#snapBaseToCanvasBtn'),

  // 调色板相关
  paletteContainer: $('#paletteContainer'),
  paletteFilter: $('#paletteFilter'),
  paletteHistorySelect: $('#paletteHistorySelect'),
  loadDefaultPaletteBtn: $('#loadDefaultPaletteBtn'),
  importPaletteBtn: $('#importPaletteBtn'),
  deletePaletteBtn: $('#deletePaletteBtn'),
  paletteFileInput: $('#paletteFileInput'),
  currentColorInfo: $('#currentColorInfo'),

  // 状态显示
  statusSize: $('#statusSize'),
  statusBase: $('#statusBase'),
  statusPalette: $('#statusPalette'),
  canvasOpacityValue: $('#canvasOpacityValue'),
  baseScaleValue: $('#baseScaleValue'),

  // 窗口元素
  referenceWindow: $('#referenceWindow'),
  docsWindow: $('#docsWindow'),
  updateWindow: $('#updateWindow'),
  exportWindow: $('#exportWindow'),

  // 参考图相关
  referenceList: $('#referenceList'),
  referenceHeader: $('#referenceHeader'),
  referenceAddBtn: $('#referenceAddBtn'),
  referenceMinimizeBtn: $('#referenceMinimizeBtn'),
  referenceCloseBtn: $('#referenceCloseBtn'),
  referenceResizer: $('#referenceResizer'),
  referenceImageInput: $('#referenceImageInput'),

  // 文档窗口
  docsCloseBtn: $('#docsCloseBtn'),
  docsToggleBtn: $('#docsToggleBtn'),

  // 更新窗口
  updateCloseBtn: $('#updateCloseBtn'),
  updateManualBtn: $('#updateManualBtn'),

  // 导出窗口
  exportCloseBtn: $('#exportCloseBtn'),
  exportCancelBtn: $('#exportCancelBtn'),
  exportConfirmBtn: $('#exportConfirmBtn'),
  exportPreviewCanvas: $('#exportPreviewCanvas'),
  exportBackgroundColor: $('#exportBackgroundColor'),
  exportFilename: $('#exportFilename'),

  selectionMaskCanvas: $('#selectionMaskCanvas'),
  selectionContentCanvas: $('#selectionContentCanvas'),
  selectionOutlineCanvas: $('#selectionOutlineCanvas'),

  selectionMaskCtx: $('#selectionMaskCanvas')?.getContext('2d') ?? null,
  selectionContentCtx: $('#selectionContentCanvas')?.getContext('2d') ?? null,
  selectionOutlineCtx: $('#selectionOutlineCanvas')?.getContext('2d') ?? null,

};

// 动态创建全屏底图编辑按钮
export const fullscreenBaseEditBtn = (() => {
  const btn = document.createElement('button');
  btn.id = 'fullscreenBaseEditBtn';
  btn.type = 'button';
  btn.textContent = '底图编辑';
  btn.style.display = 'none';
  document.body.appendChild(btn);
  return btn;
})();
