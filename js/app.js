import { elements, fullscreenBaseEditBtn } from './elements.js';
import { state } from './state.js';
import {
  createCanvas,
  handleWheelEvent,
  prepareCanvasInteractions,
  redrawCanvas,
  setCellSize,
  setTool,
  updateCanvasOpacityLabel,
  updateToolButtons,
  validateCanvasSize,
  isCanvasDirty
} from './canvas.js';
import {
  applyBaseLayerPosition,
  applyBaseScale,
  clearBaseImage,
  handleBaseImageChange,
  initializeBaseScaleRange,
  recenterBaseImage,
  snapBaseToCanvas,
  syncBaseControlsAvailability,
  toggleBaseEditMode,
  updateBaseEditButton,
  updateBaseImageDisplay,
  updateCanvasCursorState,
  updateStatusBase
} from './base-image.js';
import {
  applyPalette,
  ensurePaletteSwitchAllowed,
  handleDeletePalette,
  handlePaletteFile,
  handlePaletteSelectionChange,
  loadDefaultPalettes,
  loadPaletteLibrary,
  renderPalette,
  restoreLastPalette,
  updateCurrentColorInfo
} from './palette.js';
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
  fullscreenBaseEditBtn.style.display = state.isFullscreen ? 'inline-flex' : 'none';
  fullscreenBaseEditBtn.disabled = !state.baseImage;
}

async function init() {
  bindUIEvents();
  initializeReferenceFeature();
  initializeDocs();
  loadPaletteLibrary();
  await loadDefaultPalettes();
  restoreLastPalette();
  const initialWidth = Number(elements.widthInput?.value) || 32;
  const initialHeight = Number(elements.heightInput?.value) || 32;
  createCanvas(initialWidth, initialHeight);
  if (elements.autoSnapToggle) {
    elements.autoSnapToggle.checked = state.autoSnap;
  }
  if (elements.showCodesToggle) {
    elements.showCodesToggle.checked = state.showCodes;
  }
  if (elements.canvasOpacityRange) {
    elements.canvasOpacityRange.value = Math.round(state.backgroundOpacity * 100);
  }
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
}

function bindUIEvents() {
  elements.importBaseBtn?.addEventListener('click', () => elements.baseImageInput?.click());
  elements.clearBaseBtn?.addEventListener('click', () => {
    clearBaseImage();
    updateFullscreenOverlayState();
  });
  elements.baseImageInput?.addEventListener('change', handleBaseImageChange);
  elements.autoSnapToggle?.addEventListener('change', (ev) => {
    state.autoSnap = ev.target.checked;
  });
  elements.showCodesToggle?.addEventListener('change', (ev) => {
    state.showCodes = ev.target.checked;
    redrawCanvas();
  });
  if (elements.zoomRange) {
    elements.zoomRange.min = String(SIZE_LIMITS.minCell);
    elements.zoomRange.max = String(SIZE_LIMITS.maxCell);
    elements.zoomRange.addEventListener('input', (ev) => {
      setCellSize(Number(ev.target.value));
    });
  }
  elements.canvasOpacityRange?.addEventListener('input', (ev) => {
    state.backgroundOpacity = Number(ev.target.value) / 100;
    updateCanvasOpacityLabel();
    redrawCanvas();
  });
  elements.baseLayerSelect?.addEventListener('change', (ev) => {
    state.baseLayerPosition = ev.target.value;
    applyBaseLayerPosition();
    updateBaseImageDisplay();
  });
  elements.toggleBaseEditBtn?.addEventListener('click', () => {
    toggleBaseEditMode();
  });
  elements.recenterBaseBtn?.addEventListener('click', () => {
    recenterBaseImage();
  });
  elements.snapBaseToCanvasBtn?.addEventListener('click', () => {
    snapBaseToCanvas();
  });
  elements.toggleReferenceBtn?.addEventListener('click', () => {
    toggleReferenceWindow();
  });
  elements.toggleFullscreenBtn?.addEventListener('click', () => {
    toggleFullscreen();
    updateFullscreenOverlayState();
  });
  elements.exportBtn?.addEventListener('click', () => {
    if (!state.width || !state.height) {
      window.alert("画布尺寸无效，无法导出图片。");
      return;
    }
    const includeCodes = window.confirm("图片添加色号提示吗？");
    const includeAxes = window.confirm("图片添加坐标轴吗？");
    exportImage({ includeCodes, includeAxes });
  });
  elements.exportProjectBtn?.addEventListener('click', () => {
    exportProject();
  });
  elements.importProjectBtn?.addEventListener('click', () => {
    elements.projectFileInput?.click();
  });
  elements.projectFileInput?.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    await importProjectFile(file);
    ev.target.value = '';
  });
  elements.createCanvasBtn?.addEventListener('click', () => {
    const width = Number(elements.widthInput?.value);
    const height = Number(elements.heightInput?.value);
    if (!validateCanvasSize(width, height)) {
      window.alert("请输入 1 - 2048 范围内的画布尺寸。");
      return;
    }
    if (isCanvasDirty()) {
      const confirmed = window.confirm('新建画布会清空当前画布的颜色，是否继续？');
      if (!confirmed) {
        return;
      }
    }
    createCanvas(width, height);
  });
  elements.loadDefaultPaletteBtn?.addEventListener('click', () => {
    if (!ensurePaletteSwitchAllowed()) return;
    const builtin = state.paletteLibrary.get('builtin-dmc');
    if (!builtin) {
      window.alert("内置 DMC 色卡尚未准备好，请先导入 JSON。");
      return;
    }
    applyPalette(builtin.data, builtin.name, {
      libraryId: 'builtin-dmc',
      persistSelection: true
    });
  });
  elements.importPaletteBtn?.addEventListener('click', () => elements.paletteFileInput?.click());
  elements.paletteFileInput?.addEventListener('change', handlePaletteFile);
  elements.paletteFilter?.addEventListener('input', renderPalette);
  elements.deletePaletteBtn?.addEventListener('click', handleDeletePalette);
  elements.paletteHistorySelect?.addEventListener('change', handlePaletteSelectionChange);
  elements.canvasWrapper?.addEventListener('wheel', handleWheelEvent, { passive: false });
  [elements.toolPencilBtn, elements.toolBucketBtn].forEach((btn) => {
    btn?.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    if (state.isFullscreen !== active) {
      state.isFullscreen = active;
      updateFullscreenState();
      updateFullscreenOverlayState();
    }
  });
  initializeBaseScaleRange();
  elements.baseScaleRange?.addEventListener('input', (ev) => {
    const rawValue = Number(ev.target.value);
    if (!state.baseImage || !Number.isFinite(rawValue)) {
      return;
    }
    applyBaseScale(rawValue, state.width / 2, state.height / 2);
  });
}

init();



