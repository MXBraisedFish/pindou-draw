// app.js (优化后)
import { elements, fullscreenBaseEditBtn } from './elements.js';
import { state } from './state.js';
import { initializeShortcuts } from './shortcuts.js';
import { initializeUpdate } from './update.js';
import { initializeExportWindow, toggleExportWindow } from './export-window.js';
import { createCanvas, handleWheelEvent, prepareCanvasInteractions, redrawCanvas, setCellSize, setTool, updateCanvasOpacityLabel, updateToolButtons, validateCanvasSize, isCanvasDirty, undo, redo } from './canvas.js';
import { applyBaseLayerPosition, applyBaseScale, clearBaseImage, handleBaseImageChange, initializeBaseScaleRange, recenterBaseImage, snapBaseToCanvas, syncBaseControlsAvailability, toggleBaseEditMode, updateBaseEditButton, updateBaseImageDisplay, updateCanvasCursorState, updateStatusBase } from './base-image.js';
import { applyPalette, ensurePaletteSwitchAllowed, handleDeletePalette, handlePaletteFile, handlePaletteSelectionChange, loadDefaultPalettes, loadPaletteLibrary, renderPalette, restoreLastPalette, updateCurrentColorInfo } from './palette.js';
import { exportImage } from './exporter.js';
import { toggleFullscreen, updateFullscreenState } from './fullscreen.js';
import { initializeReferenceFeature, toggleReferenceWindow } from './reference.js';
import { initializeDocs } from './docs.js';
import { exportProject, importProjectFile } from './pd.js';
import { SIZE_LIMITS } from './constants.js';

fullscreenBaseEditBtn.addEventListener('click', () => {
  toggleBaseEditMode();
  showFullscreenBaseFeedback();
});

function showFullscreenBaseFeedback() {
  if (!fullscreenBaseEditBtn || !state.isFullscreen) return;
  fullscreenBaseEditBtn.classList.add('active');
  setTimeout(() => fullscreenBaseEditBtn.classList.remove('active'), 600);
}

function updateFullscreenOverlayState() {
  if (!fullscreenBaseEditBtn) return;
  const shouldShow = state.isFullscreen && state.baseImage;
  fullscreenBaseEditBtn.style.display = shouldShow ? 'inline-flex' : 'none';
  fullscreenBaseEditBtn.disabled = !state.baseImage;
}

async function init() {
  bindUIEvents();
  initializeReferenceFeature();
  initializeDocs();
  initializeUpdate();
  loadPaletteLibrary();
  await loadDefaultPalettes();
  restoreLastPalette();
  initializeShortcuts();
  initializeExportWindow();

  const initialWidth = Number(elements.widthInput?.value) || 32;
  const initialHeight = Number(elements.heightInput?.value) || 32;
  createCanvas(initialWidth, initialHeight);

  elements.autoSnapToggle && (elements.autoSnapToggle.checked = state.autoSnap);
  elements.showCodesToggle && (elements.showCodesToggle.checked = state.showCodes);
  elements.canvasOpacityRange && (elements.canvasOpacityRange.value = Math.round(state.backgroundOpacity * 100));

  updateCanvasOpacityLabel();
  updateStatusBase();
  syncBaseControlsAvailability();
  applyBaseLayerPosition();
  updateFullscreenState();
  updateFullscreenOverlayState();
  updateToolButtons();
  updateBaseEditButton();
  updateCanvasCursorState();
  prepareCanvasInteractions();
  updateCurrentColorInfo();

  setTimeout(updateFullscreenOverlayState, 100);
}

function bindUIEvents() {
  // 事件绑定简化
  const eventMap = [
    [elements.importBaseBtn, 'click', () => elements.baseImageInput?.click()],
    [elements.clearBaseBtn, 'click', () => { clearBaseImage(); updateFullscreenOverlayState(); }],
    [elements.baseImageInput, 'change', handleBaseImageChange],
    [elements.autoSnapToggle, 'change', (ev) => state.autoSnap = ev.target.checked],
    [elements.showCodesToggle, 'change', (ev) => { state.showCodes = ev.target.checked; redrawCanvas(); }],
    [elements.canvasOpacityRange, 'input', (ev) => { state.backgroundOpacity = Number(ev.target.value) / 100; updateCanvasOpacityLabel(); redrawCanvas(); }],
    [elements.baseLayerSelect, 'change', (ev) => { state.baseLayerPosition = ev.target.value; applyBaseLayerPosition(); updateBaseImageDisplay(); }],
    [elements.toggleBaseEditBtn, 'click', toggleBaseEditMode],
    [elements.recenterBaseBtn, 'click', recenterBaseImage],
    [elements.snapBaseToCanvasBtn, 'click', snapBaseToCanvas],
    [elements.toggleReferenceBtn, 'click', toggleReferenceWindow],
    [elements.toggleFullscreenBtn, 'click', () => { toggleFullscreen(); updateFullscreenOverlayState(); }],
    [elements.exportBtn, 'click', () => { state.width && state.height ? toggleExportWindow(true) : window.alert("请先创建画布"); }],
    [elements.importProjectBtn, 'click', () => elements.projectFileInput?.click()],
    [elements.createCanvasBtn, 'click', createNewCanvas],
    [elements.loadDefaultPaletteBtn, 'click', loadDefaultPalette],
    [elements.importPaletteBtn, 'click', () => elements.paletteFileInput?.click()],
    [elements.paletteFileInput, 'change', handlePaletteFile],
    [elements.paletteFilter, 'input', renderPalette],
    [elements.deletePaletteBtn, 'click', handleDeletePalette],
    [elements.paletteHistorySelect, 'change', handlePaletteSelectionChange],
    [elements.canvasWrapper, 'wheel', handleWheelEvent, { passive: false }]
  ];

  eventMap.forEach(([element, event, handler, options]) =>
    element?.addEventListener(event, handler, options)
  );

  // 工具按钮事件
  [elements.toolPencilBtn, elements.toolBucketBtn, elements.toolEyedropperBtn].forEach(btn =>
    btn?.addEventListener('click', () => setTool(btn.dataset.tool))
  );

  // 缩放范围初始化
  if (elements.zoomRange) {
    elements.zoomRange.min = String(SIZE_LIMITS.minCell);
    elements.zoomRange.max = String(SIZE_LIMITS.maxCell);
    elements.zoomRange.addEventListener('input', (ev) => setCellSize(Number(ev.target.value)));
  }

  // 底图缩放
  initializeBaseScaleRange();
  elements.baseScaleRange?.addEventListener('input', (ev) => {
    const rawValue = Number(ev.target.value);
    state.baseImage && Number.isFinite(rawValue) && applyBaseScale(rawValue, state.width / 2, state.height / 2);
  });

  // 项目文件导入
  elements.projectFileInput?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    file && await importProjectFile(file);
    ev.target.value = '';
  });

  // 全屏事件监听
  const fullscreenEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  fullscreenEvents.forEach(event => document.addEventListener(event, () => setTimeout(updateFullscreenOverlayState, 50)));
  document.addEventListener('updateFullscreenOverlay', updateFullscreenOverlayState);
}

function createNewCanvas() {
  const width = Number(elements.widthInput?.value);
  const height = Number(elements.heightInput?.value);

  if (!validateCanvasSize(width, height)) {
    window.alert("请输入 1 - 2048 范围内的画布尺寸。");
    return;
  }

  if (isCanvasDirty() && !window.confirm('新建画布会清空当前画布的颜色，是否继续？')) return;

  createCanvas(width, height);
}

function loadDefaultPalette() {
  if (!ensurePaletteSwitchAllowed()) return;
  const builtin = state.paletteLibrary.get('builtin-dmc');
  builtin ? applyPalette(builtin.data, builtin.name, { libraryId: 'builtin-dmc', persistSelection: true })
    : window.alert("内置 DMC 色卡尚未准备好，请先导入 JSON。");
}

init();