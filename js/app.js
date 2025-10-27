// app.js
import { elements, fullscreenBaseEditBtn } from './elements.js';
import { state } from './state.js';

// 导入功能模块
import { initializeShortcuts } from './shortcuts.js';
import { initializeUpdate } from './update.js';
import { initializeExportWindow, toggleExportWindow } from './export-window.js';
import { initializeReferenceFeature, toggleReferenceWindow } from './reference.js';
import { initializeDocs } from './docs.js';
import { initializeSelectionLayers, renderSelectionLayers } from './selection-layer.js';

// 导入核心功能
import { createCanvas, handleWheelEvent, prepareCanvasInteractions, setTool, validateCanvasSize, isCanvasDirty } from './canvas.js';
import { applyBaseLayerPosition, clearBaseImage, handleBaseImageChange, initializeBaseScaleRange, recenterBaseImage, snapBaseToCanvas, syncBaseControlsAvailability, toggleBaseEditMode, updateBaseEditButton, updateCanvasCursorState } from './base-image.js';
import { loadPaletteLibrary, loadDefaultPalettes, restoreLastPalette, handlePaletteFile, handleDeletePalette, handlePaletteSelectionChange, renderPalette, updateCurrentColorInfo } from './palette.js';
import { toggleFullscreen, updateFullscreenState } from './fullscreen.js';
import { exportProject, importProjectFile } from './pd.js';

// 导入图像操作功能
import { flipHorizontal, flipVertical, rotateClockwise, rotateCounterclockwise } from './image-operations.js';

// 全屏底图编辑按钮事件
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

  // 初始化各功能模块
  initializeReferenceFeature();
  initializeDocs();
  initializeUpdate();
  initializeExportWindow();
  initializeShortcuts();

  // 加载调色板
  loadPaletteLibrary();
  await loadDefaultPalettes();
  restoreLastPalette();

  // 初始化画布
  const initialWidth = Number(elements.widthInput?.value) || 32;
  const initialHeight = Number(elements.heightInput?.value) || 32;
  createCanvas(initialWidth, initialHeight);
  initializeSelectionLayers();
  renderSelectionLayers();

  // 设置初始状态
  initializeBaseScaleRange();
  updateFullscreenState();
  updateFullscreenOverlayState();
  prepareCanvasInteractions();

  console.log('拼豆像素画工具初始化完成');
}

function bindUIEvents() {
  // 基础操作事件
  const baseEvents = [
    [elements.importBaseBtn, 'click', () => elements.baseImageInput?.click()],
    [elements.clearBaseBtn, 'click', () => { clearBaseImage(); updateFullscreenOverlayState(); }],
    [elements.baseImageInput, 'change', handleBaseImageChange],
    [elements.toggleFullscreenBtn, 'click', () => { toggleFullscreen(); updateFullscreenOverlayState(); }],
    [elements.toggleReferenceBtn, 'click', toggleReferenceWindow],
    [elements.exportBtn, 'click', () => state.width && state.height ? toggleExportWindow(true) : window.alert("请先创建画布")],
    [elements.createCanvasBtn, 'click', createNewCanvas],
    [elements.canvasWrapper, 'wheel', handleWheelEvent, { passive: false }]
  ];

  // 绘图工具事件
  const toolEvents = [
    [elements.toolPencilBtn, 'click', () => setTool('pencil')],
    [elements.toolBucketBtn, 'click', () => setTool('bucket')],
    [elements.toolEyedropperBtn, 'click', () => setTool('eyedropper')],
    [elements.toolSelectionBtn, 'click', () => setTool('selection')]
  ];

  // 图像操作事件
  const imageOperationEvents = [
    [elements.flipHorizontalBtn, 'click', flipHorizontal],
    [elements.flipVerticalBtn, 'click', flipVertical],
    [elements.rotateClockwiseBtn, 'click', rotateClockwise],
    [elements.rotateCounterclockwiseBtn, 'click', rotateCounterclockwise]
  ];

  // 底图控制事件
  const baseControlEvents = [
    [elements.toggleBaseEditBtn, 'click', toggleBaseEditMode],
    [elements.recenterBaseBtn, 'click', recenterBaseImage],
    [elements.snapBaseToCanvasBtn, 'click', snapBaseToCanvas],
    [elements.baseScaleRange, 'input', handleBaseScaleChange]
  ];

  // 调色板事件
  const paletteEvents = [
    [elements.loadDefaultPaletteBtn, 'click', loadDefaultPalette],
    [elements.importPaletteBtn, 'click', () => elements.paletteFileInput?.click()],
    [elements.paletteFileInput, 'change', handlePaletteFile],
    [elements.paletteFilter, 'input', renderPalette],
    [elements.deletePaletteBtn, 'click', handleDeletePalette],
    [elements.paletteHistorySelect, 'change', handlePaletteSelectionChange]
  ];

  // 设置事件
  const settingEvents = [
    [elements.autoSnapToggle, 'change', (ev) => state.autoSnap = ev.target.checked],
    [elements.showCodesToggle, 'change', (ev) => { state.showCodes = ev.target.checked; redrawCanvas(); }],
    [elements.canvasOpacityRange, 'input', handleCanvasOpacityChange],
    [elements.baseLayerSelect, 'change', (ev) => { state.baseLayerPosition = ev.target.value; applyBaseLayerPosition(); }],
    [elements.zoomRange, 'input', handleZoomChange]
  ];

  // 项目文件事件
  const projectEvents = [
    [elements.importProjectBtn, 'click', () => elements.projectFileInput?.click()],
    [elements.projectFileInput, 'change', handleProjectFileImport]
  ];

  // 绑定所有事件
  const allEvents = [
    ...baseEvents, ...toolEvents, ...imageOperationEvents,
    ...baseControlEvents, ...paletteEvents, ...settingEvents, ...projectEvents
  ];

  allEvents.forEach(([element, event, handler, options]) =>
    element?.addEventListener(event, handler, options)
  );

  // 全屏事件监听
  const fullscreenEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  fullscreenEvents.forEach(event => document.addEventListener(event, () => setTimeout(updateFullscreenOverlayState, 50)));
  document.addEventListener('updateFullscreenOverlay', updateFullscreenOverlayState);
}

// 事件处理函数
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

function handleBaseScaleChange(ev) {
  const rawValue = Number(ev.target.value);
  state.baseImage && Number.isFinite(rawValue) && applyBaseScale(rawValue, state.width / 2, state.height / 2);
}

function handleCanvasOpacityChange(ev) {
  state.backgroundOpacity = Number(ev.target.value) / 100;
  updateCanvasOpacityLabel();
  redrawCanvas();
}

function handleZoomChange(ev) {
  setCellSize(Number(ev.target.value));
}

async function handleProjectFileImport(ev) {
  const file = ev.target.files?.[0];
  file && await importProjectFile(file);
  ev.target.value = '';
}

function initImageOperationsDropdown() {
  const dropdownToggle = document.querySelector('.image-operations-dropdown .dropdown-toggle');
  const dropdownMenu = document.querySelector('.image-operations-dropdown .dropdown-menu');

  if (!dropdownToggle || !dropdownMenu) return;

  // 切换下拉菜单显示/隐藏
  dropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = dropdownToggle.getAttribute('aria-expanded') === 'true';
    dropdownToggle.setAttribute('aria-expanded', !isExpanded);
    dropdownMenu.setAttribute('aria-hidden', isExpanded);
  });

  // 点击下拉项
  dropdownMenu.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-item')) {
      // 关闭下拉菜单
      dropdownToggle.setAttribute('aria-expanded', 'false');
      dropdownMenu.setAttribute('aria-hidden', 'true');
    }
  });

  // 点击页面其他区域关闭下拉菜单
  document.addEventListener('click', () => {
    dropdownToggle.setAttribute('aria-expanded', 'false');
    dropdownMenu.setAttribute('aria-hidden', 'true');
  });

  // 阻止下拉菜单内部的点击事件冒泡
  dropdownMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// 在DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initImageOperationsDropdown();
});

// 启动应用
init();
