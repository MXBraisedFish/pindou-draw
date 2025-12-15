import { CANVAS_SIZE_LIMIT } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { createCanvas, redrawCanvas, saveHistory } from './canvas.js';
import { renderSelectionLayers } from './selection-layer.js';
import { applyPalette, getEnabledColors } from './palette.js';
import { parseColor, clampChannel } from './utils.js';

const MIN_OUTPUT_SIZE = 1;
const MAX_OUTPUT_SIZE = CANVAS_SIZE_LIMIT;
const MIN_PIXEL_RATIO = 1;
const MAX_PIXEL_RATIO = 80;
const BLUE_NOISE_MATRIX = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];
const PREVIEW_MAX_DIMENSION = 420;
const PREVIEW_MIN_DIMENSION = 140;
const PREVIEW_DEBOUNCE_MS = 120;

const photoSketchState = {
  image: null,
  imageUrl: null,
  lastResult: null,
  previewHandle: null,
  previewTimer: null,
  cropInputTimer: null,
  cropLockEnabled: false,
  cropAspectRatio: 1,
  cropLastEdited: 'width',
  paletteId: '__current',
  sampleCanvas: null,
  sampleCtx: null
};

export function initializePhotoSketch() {
  if (!elements.photoSketchOverlay || !elements.photoSketchBtn) return;
  elements.photoSketchBtn.addEventListener('click', openPhotoSketchOverlay);
  elements.photoSketchCloseBtn?.addEventListener('click', closePhotoSketchOverlay);
  elements.photoSketchCancelBtn?.addEventListener('click', closePhotoSketchOverlay);
  elements.photoSketchImageBtn?.addEventListener('click', () => elements.photoSketchFileInput?.click());
  elements.photoSketchFileInput?.addEventListener('change', handlePhotoSketchFile);
  elements.photoSketchScaleRange?.addEventListener('input', handleScaleInput);
  elements.photoSketchAlignSelect?.addEventListener('change', handleAlignChange);
  bindOffsetControl('x');
  bindOffsetControl('y');
  elements.photoSketchCropWidth?.addEventListener('input', () => handleCropInput('width'));
  elements.photoSketchCropWidth?.addEventListener('change', () => handleCropChange('width'));
  elements.photoSketchCropHeight?.addEventListener('input', () => handleCropInput('height'));
  elements.photoSketchCropHeight?.addEventListener('change', () => handleCropChange('height'));
  elements.photoSketchCropLock?.addEventListener('change', handleCropLockToggle);
  elements.photoSketchAspectReset?.addEventListener('click', handleAspectReset);
  elements.photoSketchPaletteSelect?.addEventListener('change', handlePaletteChange);
  elements.photoSketchPixelRatio?.addEventListener('change', handlePixelRatioChange);
  elements.photoSketchDitherRadios?.forEach((radio) => {
    radio.addEventListener('change', schedulePreviewRender);
  });
  elements.photoSketchCreateBtn?.addEventListener('click', applySketchToCanvas);
  elements.photoSketchExportBtn?.addEventListener('click', exportSketchImage);
  syncPhotoSketchPaletteOptions();
  updateScaleDisplay(elements.photoSketchScaleRange?.value || '100');
  updateSketchSummary(null);
  updateSketchStatus('请选择图片并配置草图参数。', 'info');
  toggleSketchActionButtons(false);
  bindPhotoSketchViewTabs();
  document.addEventListener('palette-library-changed', syncPhotoSketchPaletteOptions);
  photoSketchState.cropLockEnabled = Boolean(elements.photoSketchCropLock?.checked);
  if (photoSketchState.cropLockEnabled) {
    photoSketchState.cropAspectRatio = getCurrentCropRatio();
  }
}

function openPhotoSketchOverlay() {
  syncPhotoSketchPaletteOptions();
  updateScaleDisplay(elements.photoSketchScaleRange?.value || '100');
  initializePhotoSketchViewState();
  elements.photoSketchOverlay?.setAttribute('aria-hidden', 'false');
}

function closePhotoSketchOverlay() {
  elements.photoSketchOverlay?.setAttribute('aria-hidden', 'true');
  cancelPendingPreview();
}

function bindPhotoSketchViewTabs() {
  const mainParamsBtn = document.getElementById('photoSketchTabParams');
  const mainPreviewBtn = document.getElementById('photoSketchTabPreview');
  const previewOriginalBtn = document.getElementById('photoSketchPreviewTabOriginal');
  const previewPixelBtn = document.getElementById('photoSketchPreviewTabPixel');

  mainParamsBtn?.addEventListener('click', () => setPhotoSketchMainView('params'));
  mainPreviewBtn?.addEventListener('click', () => setPhotoSketchMainView('preview'));
  previewOriginalBtn?.addEventListener('click', () => setPhotoSketchPreviewView('original'));
  previewPixelBtn?.addEventListener('click', () => setPhotoSketchPreviewView('pixel'));

  document.addEventListener('tablet:change', () => {
    if (!isPhotoSketchOverlayOpen()) return;
    initializePhotoSketchViewState();
  });

  initializePhotoSketchViewState({ allowNoOverlay: true });
}

function isPhotoSketchOverlayOpen() {
  return elements.photoSketchOverlay?.getAttribute('aria-hidden') === 'false';
}

function initializePhotoSketchViewState(options = {}) {
  const overlay = elements.photoSketchOverlay;
  if (!overlay && !options.allowNoOverlay) return;

  if (state.isTabletMode) {
    overlay.dataset.photoSketchView = overlay.dataset.photoSketchView || 'params';
  } else {
    delete overlay.dataset.photoSketchView;
  }

  overlay.dataset.photoSketchPreview = overlay.dataset.photoSketchPreview || 'pixel';
  updatePhotoSketchTabsUI();
}

function setPhotoSketchMainView(view) {
  const overlay = elements.photoSketchOverlay;
  if (!overlay || !state.isTabletMode) return;
  overlay.dataset.photoSketchView = view === 'preview' ? 'preview' : 'params';
  updatePhotoSketchTabsUI();
}

function setPhotoSketchPreviewView(view) {
  const overlay = elements.photoSketchOverlay;
  if (!overlay) return;
  overlay.dataset.photoSketchPreview = view === 'original' ? 'original' : 'pixel';
  updatePhotoSketchTabsUI();
}

function updatePhotoSketchTabsUI() {
  const overlay = elements.photoSketchOverlay;
  if (!overlay) return;

  const mainParamsBtn = document.getElementById('photoSketchTabParams');
  const mainPreviewBtn = document.getElementById('photoSketchTabPreview');
  const previewOriginalBtn = document.getElementById('photoSketchPreviewTabOriginal');
  const previewPixelBtn = document.getElementById('photoSketchPreviewTabPixel');

  if (state.isTabletMode) {
    const view = overlay.dataset.photoSketchView === 'preview' ? 'preview' : 'params';
    mainParamsBtn?.setAttribute('aria-selected', view === 'params' ? 'true' : 'false');
    mainPreviewBtn?.setAttribute('aria-selected', view === 'preview' ? 'true' : 'false');
  } else {
    mainParamsBtn?.setAttribute('aria-selected', 'false');
    mainPreviewBtn?.setAttribute('aria-selected', 'false');
  }

  const preview = overlay.dataset.photoSketchPreview === 'original' ? 'original' : 'pixel';
  previewOriginalBtn?.setAttribute('aria-selected', preview === 'original' ? 'true' : 'false');
  previewPixelBtn?.setAttribute('aria-selected', preview === 'pixel' ? 'true' : 'false');
}

function handlePhotoSketchFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  if (elements.photoSketchFileName) {
    elements.photoSketchFileName.textContent = file.name;
  }
  loadPhotoSketchImage(file);
}

function loadPhotoSketchImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (photoSketchState.imageUrl) {
      URL.revokeObjectURL(photoSketchState.imageUrl);
    }
    photoSketchState.imageUrl = url;
    photoSketchState.image = image;
    updateSketchStatus(`已载入图片：${image.naturalWidth} × ${image.naturalHeight}`, 'success');
    resetOffsetControls();
    schedulePreviewRender();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    updateSketchStatus('图片加载失败，请尝试重新选择。', 'error');
  };
  image.src = url;
}

function handleScaleInput(event) {
  updateScaleDisplay(event.target?.value || '100');
  schedulePreviewRender();
}

function handleAlignChange() {
  applyAlignPreset();
  schedulePreviewRender();
}

function handleCropInput(axis) {
  if (axis) {
    photoSketchState.cropLastEdited = axis;
    if (photoSketchState.cropLockEnabled) {
      enforceCropLock(axis);
    }
  }
  if (photoSketchState.cropInputTimer) {
    window.clearTimeout(photoSketchState.cropInputTimer);
    photoSketchState.cropInputTimer = null;
  }
  photoSketchState.cropInputTimer = window.setTimeout(() => {
    photoSketchState.cropInputTimer = null;
    schedulePreviewRender();
  }, 400);
}

function handleCropChange(axis) {
  if (axis) {
    photoSketchState.cropLastEdited = axis;
    if (photoSketchState.cropLockEnabled) {
      enforceCropLock(axis);
    }
  }
  if (photoSketchState.cropInputTimer) {
    window.clearTimeout(photoSketchState.cropInputTimer);
    photoSketchState.cropInputTimer = null;
  }
  schedulePreviewRender();
}

function handleCropLockToggle(event) {
  const enabled = Boolean(event?.target?.checked);
  photoSketchState.cropLockEnabled = enabled;
  if (enabled) {
    photoSketchState.cropAspectRatio = getCurrentCropRatio() || photoSketchState.cropAspectRatio || 1;
    enforceCropLock(photoSketchState.cropLastEdited);
  }
  schedulePreviewRender();
}

function handleAspectReset() {
  const config = computeSketchConfig();
  const ratio = getOriginalImageRatio();
  if (!config || !Number.isFinite(ratio) || ratio <= 0) return;
  const minCropWidth = MIN_OUTPUT_SIZE * config.pixelRatio;
  const minCropHeight = MIN_OUTPUT_SIZE * config.pixelRatio;
  const maxCropWidth = Math.max(minCropWidth, Math.min(MAX_OUTPUT_SIZE * config.pixelRatio, config.scaledWidth));
  const maxCropHeight = Math.max(minCropHeight, Math.min(MAX_OUTPUT_SIZE * config.pixelRatio, config.scaledHeight));
  let width = clampNumber(config.scaledWidth, minCropWidth, maxCropWidth);
  let height = Math.round(width / ratio);
  if (height > maxCropHeight) {
    height = clampNumber(maxCropHeight, minCropHeight, maxCropHeight);
    width = Math.round(height * ratio);
  }
  width = clampNumber(width, minCropWidth, maxCropWidth);
  height = clampNumber(height, minCropHeight, maxCropHeight);
  if (elements.photoSketchCropWidth) {
    elements.photoSketchCropWidth.value = String(Math.round(width));
  }
  if (elements.photoSketchCropHeight) {
    elements.photoSketchCropHeight.value = String(Math.round(height));
  }
  photoSketchState.cropAspectRatio = ratio;
  photoSketchState.cropLockEnabled = true;
  photoSketchState.cropLastEdited = 'width';
  if (elements.photoSketchCropLock) {
    elements.photoSketchCropLock.checked = true;
  }
  enforceCropLock('width');
  schedulePreviewRender({ immediate: true });
}

function handlePaletteChange(event) {
  photoSketchState.paletteId = event.target?.value || '__current';
  schedulePreviewRender();
}

function handlePixelRatioChange(event) {
  const safeValue = clampNumber(Number(event.target?.value) || state.pixelRatio, MIN_PIXEL_RATIO, MAX_PIXEL_RATIO);
  if (elements.photoSketchPixelRatio) {
    elements.photoSketchPixelRatio.value = String(safeValue);
  }
  schedulePreviewRender();
}

function bindOffsetControl(axis) {
  const { range, number } = getOffsetElements(axis);
  const handleRangeInput = () => {
    const value = Number(range?.value);
    setOffsetValue(axis, Number.isFinite(value) ? value : 0);
    schedulePreviewRender({ immediate: true });
  };
  const handleNumberInput = () => {
    const value = Number(number?.value);
    if (!Number.isFinite(value)) return;
    setOffsetValue(axis, value);
    schedulePreviewRender();
  };
  range?.addEventListener('input', handleRangeInput);
  range?.addEventListener('change', handleRangeInput);
  number?.addEventListener('input', handleNumberInput);
  number?.addEventListener('change', handleNumberInput);
}

function updateScaleDisplay(value) {
  if (elements.photoSketchScaleValue) {
    elements.photoSketchScaleValue.textContent = `${Math.round(Number(value) || 100)}%`;
  }
}

function schedulePreviewRender(options = {}) {
  const immediate = Boolean(options.immediate);
  photoSketchState.lastResult = null;
  toggleSketchActionButtons(false);
  cancelPendingPreview();
  if (immediate) {
    photoSketchState.previewHandle = window.requestAnimationFrame(() => {
      photoSketchState.previewHandle = null;
      renderPhotoSketchPreview();
    });
    return;
  }
  photoSketchState.previewTimer = window.setTimeout(() => {
    photoSketchState.previewTimer = null;
    photoSketchState.previewHandle = window.requestAnimationFrame(() => {
      photoSketchState.previewHandle = null;
      renderPhotoSketchPreview();
    });
  }, PREVIEW_DEBOUNCE_MS);
}

function cancelPendingPreview() {
  if (photoSketchState.previewHandle) {
    window.cancelAnimationFrame(photoSketchState.previewHandle);
    photoSketchState.previewHandle = null;
  }
  if (photoSketchState.previewTimer) {
    window.clearTimeout(photoSketchState.previewTimer);
    photoSketchState.previewTimer = null;
  }
}

function renderPhotoSketchPreview() {
  if (!photoSketchState.image) {
    clearPreviewCanvases();
    updateSketchSummary(null);
    updateSketchStatus('尚未选择图片。', 'info');
    return;
  }
  const config = computeSketchConfig();
  if (!config) {
    clearPreviewCanvases();
    toggleSketchActionButtons(false);
    return;
  }
  updateSketchSummary(config);
  updateOffsetControls(config);
  syncCropInputs(config);
  const paletteEntries = resolvePaletteEntries(photoSketchState.paletteId);
  if (!paletteEntries.length) {
    updateSketchStatus('选定的色卡为空，请检查色卡配置。', 'error');
    toggleSketchActionButtons(false);
    return;
  }
  const ditherMode = getDitherMode();
  const previewResult = quantizeImage(config, paletteEntries, ditherMode);
  if (!previewResult) {
    toggleSketchActionButtons(false);
    return;
  }
  photoSketchState.lastResult = previewResult;
  updatePhotoSketchPreview(previewResult, config);
  toggleSketchActionButtons(true);
  updateSketchStatus(`已生成 ${previewResult.width} × ${previewResult.height} 的草图预览`, 'success');
}

function computeSketchConfig() {
  if (!photoSketchState.image) return null;
  const ratioInput = Number(elements.photoSketchPixelRatio?.value || state.pixelRatio);
  const pixelRatio = clampNumber(Math.round(ratioInput) || state.pixelRatio, MIN_PIXEL_RATIO, MAX_PIXEL_RATIO);
  const scalePercent = clampNumber(Number(elements.photoSketchScaleRange?.value) || 100, 1, 100);
  const scaledWidth = Math.max(1, Math.round(photoSketchState.image.naturalWidth * (scalePercent / 100)));
  const scaledHeight = Math.max(1, Math.round(photoSketchState.image.naturalHeight * (scalePercent / 100)));
  const cropWidthInput = Math.max(0, Number(elements.photoSketchCropWidth?.value) || 0);
  const cropHeightInput = Math.max(0, Number(elements.photoSketchCropHeight?.value) || 0);
  let useCustomCropWidth = cropWidthInput > 0;
  let useCustomCropHeight = cropHeightInput > 0;
  const minCropWidth = MIN_OUTPUT_SIZE * pixelRatio;
  const minCropHeight = MIN_OUTPUT_SIZE * pixelRatio;
  const maxCropWidth = Math.max(minCropWidth, Math.min(MAX_OUTPUT_SIZE * pixelRatio, scaledWidth));
  const maxCropHeight = Math.max(minCropHeight, Math.min(MAX_OUTPUT_SIZE * pixelRatio, scaledHeight));
  let cropPixelWidth = useCustomCropWidth
    ? clampNumber(cropWidthInput, minCropWidth, maxCropWidth)
    : clampNumber(scaledWidth, minCropWidth, maxCropWidth);
  let cropPixelHeight = useCustomCropHeight
    ? clampNumber(cropHeightInput, minCropHeight, maxCropHeight)
    : clampNumber(scaledHeight, minCropHeight, maxCropHeight);
  let cellWidth = clampNumber(Math.floor(cropPixelWidth / pixelRatio), MIN_OUTPUT_SIZE, MAX_OUTPUT_SIZE);
  let cellHeight = clampNumber(Math.floor(cropPixelHeight / pixelRatio), MIN_OUTPUT_SIZE, MAX_OUTPUT_SIZE);
  if (cellWidth <= 0 || cellHeight <= 0) return null;
  cropPixelWidth = clampNumber(cellWidth * pixelRatio, minCropWidth, maxCropWidth);
  cropPixelHeight = clampNumber(cellHeight * pixelRatio, minCropHeight, maxCropHeight);
  if (photoSketchState.cropLockEnabled && (useCustomCropWidth || useCustomCropHeight)) {
    useCustomCropWidth = true;
    useCustomCropHeight = true;
  }
  if (photoSketchState.cropLockEnabled && cellWidth > 0 && cellHeight > 0) {
    photoSketchState.cropAspectRatio = cellWidth / cellHeight;
  }
  return {
    width: cellWidth,
    height: cellHeight,
    pixelRatio,
    scalePercent,
    scaledWidth,
    scaledHeight,
    cropPixelWidth,
    cropPixelHeight,
    useCustomCropWidth,
    useCustomCropHeight
  };
}

function applyAlignPreset() {
  const config = computeSketchConfig();
  if (!config) return;
  const offsetXMax = Math.max(0, config.scaledWidth - config.cropPixelWidth);
  const offsetYMax = Math.max(0, config.scaledHeight - config.cropPixelHeight);
  const mode = elements.photoSketchAlignSelect?.value || 'fit';
  if (mode === 'fit') {
    setOffsetValue('x', Math.round(offsetXMax / 2));
    setOffsetValue('y', Math.round(offsetYMax / 2));
  } else if (mode === 'stretch') {
    setOffsetValue('x', 0);
    setOffsetValue('y', 0);
  }
  updateOffsetControls(config);
}

function updateOffsetControls(config = null) {
  const current = config || computeSketchConfig();
  if (!current) return;
  const maxX = Math.max(0, current.scaledWidth - current.cropPixelWidth);
  const maxY = Math.max(0, current.scaledHeight - current.cropPixelHeight);
  updateOffsetBounds('x', maxX);
  updateOffsetBounds('y', maxY);
}

function syncCropInputs(config) {
  const applyValue = (input, applied, maxValue, isCustom) => {
    if (!input) return;
    const roundedApplied = Math.round(applied);
    input.max = String(Math.round(maxValue));
    input.placeholder = String(roundedApplied);
    if (isCustom) {
      if (document.activeElement !== input) {
        const nextValue = String(roundedApplied);
        if (input.value !== nextValue) {
          input.value = nextValue;
        }
      }
    } else if (document.activeElement !== input) {
      input.value = '';
    }
  };
  applyValue(elements.photoSketchCropWidth, config.cropPixelWidth, config.scaledWidth, config.useCustomCropWidth);
  applyValue(elements.photoSketchCropHeight, config.cropPixelHeight, config.scaledHeight, config.useCustomCropHeight);
}

function resetOffsetControls() {
  setOffsetValue('x', 0);
  setOffsetValue('y', 0);
  updateOffsetBounds('x', 0);
  updateOffsetBounds('y', 0);
}

function getOffsetElements(axis) {
  if (axis === 'x') {
    return { range: elements.photoSketchOffsetX, number: elements.photoSketchOffsetXInput };
  }
  return { range: elements.photoSketchOffsetY, number: elements.photoSketchOffsetYInput };
}

function setOffsetValue(axis, value) {
  const { range, number } = getOffsetElements(axis);
  const normalized = Number.isFinite(value) ? value : 0;
  const fixed = (Math.round(normalized * 10) / 10).toFixed(1);
  const stringValue = fixed;
  if (range) range.value = stringValue;
  if (number) number.value = stringValue;
}

function getOffsetValue(axis) {
  const { number, range } = getOffsetElements(axis);
  const numericSource = number && number.value.length
    ? Number(number.value)
    : Number(range?.value);
  return Number.isFinite(numericSource) ? Math.round(numericSource * 10) / 10 : 0;
}

function updateOffsetBounds(axis, max) {
  const { range, number } = getOffsetElements(axis);
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  if (range) {
    range.min = '0';
    range.max = String(safeMax);
    range.step = '0.1';
  }
  if (number) {
    number.min = '0';
    number.max = String(safeMax);
    number.step = '0.1';
  }
  const clamped = clampNumber(getOffsetValue(axis), 0, safeMax);
  setOffsetValue(axis, clamped);
}

function enforceCropLock(preferredAxis = photoSketchState.cropLastEdited || 'width') {
  if (!photoSketchState.cropLockEnabled) return;
  updateLockedCropValue(preferredAxis === 'height' ? 'height' : 'width');
}

function updateLockedCropValue(axis) {
  if (!photoSketchState.cropLockEnabled) return;
  const widthInput = elements.photoSketchCropWidth;
  const heightInput = elements.photoSketchCropHeight;
  if (!widthInput || !heightInput) return;
  const ratio = ensureCropAspectRatio();
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  if (axis === 'width') {
    const widthValue = Math.max(1, Number(widthInput.value) || 0);
    if (widthValue > 0) {
      const nextHeight = Math.max(1, Math.round(widthValue / ratio));
      heightInput.value = String(nextHeight);
    }
  } else {
    const heightValue = Math.max(1, Number(heightInput.value) || 0);
    if (heightValue > 0) {
      const nextWidth = Math.max(1, Math.round(heightValue * ratio));
      widthInput.value = String(nextWidth);
    }
  }
}

function ensureCropAspectRatio() {
  if (!Number.isFinite(photoSketchState.cropAspectRatio) || photoSketchState.cropAspectRatio <= 0) {
    photoSketchState.cropAspectRatio = getCurrentCropRatio() || 1;
  }
  return photoSketchState.cropAspectRatio;
}

function getCurrentCropRatio() {
  const widthValue = Number(elements.photoSketchCropWidth?.value) || 0;
  const heightValue = Number(elements.photoSketchCropHeight?.value) || 0;
  if (widthValue > 0 && heightValue > 0) {
    return widthValue / heightValue;
  }
  const config = computeSketchConfig();
  if (config && config.width > 0 && config.height > 0) {
    return config.width / config.height;
  }
  return getOriginalImageRatio();
}

function getOriginalImageRatio() {
  if (photoSketchState.image?.naturalHeight > 0) {
    return photoSketchState.image.naturalWidth / photoSketchState.image.naturalHeight;
  }
  return 1;
}

function prepareSampleContext(width, height) {
  if (!photoSketchState.sampleCanvas) {
    photoSketchState.sampleCanvas = document.createElement('canvas');
    photoSketchState.sampleCtx = photoSketchState.sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  const canvas = photoSketchState.sampleCanvas;
  const ctx = photoSketchState.sampleCtx;
  if (!ctx) return null;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function quantizeImage(config, paletteEntries, ditherMode) {
  const { width, height, pixelRatio, scaledWidth, scaledHeight, cropPixelWidth, cropPixelHeight } = config;
  const image = photoSketchState.image;
  if (!image) return null;
  const offsets = getCroppingOffsets(config);
  const scaleFactor = Math.max(0.0001, scaledWidth / image.naturalWidth);
  const sourceX = offsets.offsetX / scaleFactor;
  const sourceY = offsets.offsetY / scaleFactor;
  const sourceWidth = cropPixelWidth / scaleFactor;
  const sourceHeight = cropPixelHeight / scaleFactor;
  const sampleCtx = prepareSampleContext(width, height);
  if (!sampleCtx) return null;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  const imageData = sampleCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const working = new Float32Array(width * height * 3);
  for (let i = 0; i < data.length; i += 4) {
    const j = (i / 4) * 3;
    working[j] = data[i];
    working[j + 1] = data[i + 1];
    working[j + 2] = data[i + 2];
  }
  const buffer = new Uint8ClampedArray(width * height * 4);
  const grid = Array.from({ length: height }, () => Array(width).fill(null));
  const distributeError = ditherMode === 'floyd-steinberg';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index3 = (y * width + x) * 3;
      const index4 = (y * width + x) * 4;
      let r = working[index3];
      let g = working[index3 + 1];
      let b = working[index3 + 2];
      if (ditherMode === 'blue-noise') {
        const noise = (BLUE_NOISE_MATRIX[y % 8][x % 8] / 64) - 0.5;
        const strength = 24;
        r = clampChannel(r + noise * strength);
        g = clampChannel(g + noise * strength);
        b = clampChannel(b + noise * strength);
      }
      const nearest = findNearestPaletteColor(r, g, b, paletteEntries);
      if (!nearest) continue;
      buffer[index4] = nearest.rgb.r;
      buffer[index4 + 1] = nearest.rgb.g;
      buffer[index4 + 2] = nearest.rgb.b;
      buffer[index4 + 3] = 255;
      grid[y][x] = {
        code: nearest.code,
        color: `rgb(${nearest.rgb.r}, ${nearest.rgb.g}, ${nearest.rgb.b})`,
        rgb: { ...nearest.rgb },
        type: nearest.type || 'normal'
      };
      if (distributeError) {
        const errR = r - nearest.rgb.r;
        const errG = g - nearest.rgb.g;
        const errB = b - nearest.rgb.b;
        distributeFsError(working, width, height, x, y, errR, errG, errB);
      }
    }
  }
  return {
    width,
    height,
    pixelRatio,
    grid,
    buffer,
    source: { width: image.naturalWidth, height: image.naturalHeight }
  };
}

function distributeFsError(buffer, width, height, x, y, errR, errG, errB) {
  const applyError = (nx, ny, factor) => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    const idx = (ny * width + nx) * 3;
    buffer[idx] += errR * factor;
    buffer[idx + 1] += errG * factor;
    buffer[idx + 2] += errB * factor;
  };
  applyError(x + 1, y, 7 / 16);
  applyError(x - 1, y + 1, 3 / 16);
  applyError(x, y + 1, 5 / 16);
  applyError(x + 1, y + 1, 1 / 16);
}

function findNearestPaletteColor(r, g, b, paletteEntries) {
  let best = null;
  let bestDistance = Infinity;
  for (const entry of paletteEntries) {
    const dr = entry.rgb.r - r;
    const dg = entry.rgb.g - g;
    const db = entry.rgb.b - b;
    const distance = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best;
}

function updatePhotoSketchPreview(result, config) {
  updatePreviewCanvasSizing(config, result);
  drawOriginalPreview(config);
  drawPixelPreview(result);
  updatePreviewInfo(result, config);
}

function updatePreviewCanvasSizing(config, result) {
  if (config) {
    const sourceRatio = config.scaledHeight > 0 ? config.scaledWidth / config.scaledHeight : 1;
    applyPreviewAspect(elements.photoSketchOriginalPreview, sourceRatio);
  }
  const targetRatio = (() => {
    if (result && result.height > 0) {
      return result.width / result.height;
    }
    if (config && config.height > 0) {
      return config.width / config.height;
    }
    return 1;
  })();
  applyPreviewAspect(elements.photoSketchPixelPreview, targetRatio);
}

function drawOriginalPreview(config) {
  const canvas = elements.photoSketchOriginalPreview;
  if (!canvas || !photoSketchState.image) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const placement = computePreviewPlacement(canvas, config.scaledWidth, config.scaledHeight);
  ctx.drawImage(
    photoSketchState.image,
    0,
    0,
    photoSketchState.image.naturalWidth,
    photoSketchState.image.naturalHeight,
    placement.x,
    placement.y,
    placement.width,
    placement.height
  );
  const offsets = getCroppingOffsets(config);
  drawCropGuides(ctx, placement, config, offsets);
}

function computePreviewPlacement(canvas, width, height) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(canvas.width / safeWidth, canvas.height / safeHeight);
  const drawWidth = safeWidth * scale;
  const drawHeight = safeHeight * scale;
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;
  return { x, y, width: drawWidth, height: drawHeight, scale: scale || 1 };
}

function getCroppingOffsets(config) {
  const maxX = Math.max(0, config.scaledWidth - config.cropPixelWidth);
  const maxY = Math.max(0, config.scaledHeight - config.cropPixelHeight);
  const offsetX = clampNumber(getOffsetValue('x'), 0, maxX);
  const offsetY = clampNumber(getOffsetValue('y'), 0, maxY);
  return { offsetX, offsetY };
}

function drawCropGuides(ctx, placement, config, offsets) {
  const canvas = ctx.canvas;
  const scale = placement.scale || 1;
  const rectWidth = Math.max(1, config.cropPixelWidth * scale);
  const rectHeight = Math.max(1, config.cropPixelHeight * scale);
  const rectX = placement.x + offsets.offsetX * scale;
  const rectY = placement.y + offsets.offsetY * scale;
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = Math.max(1, canvas.width * 0.004);
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(Math.round(rectX) + 0.5, Math.round(rectY) + 0.5, Math.max(1, rectWidth - 1), Math.max(1, rectHeight - 1));
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
  ctx.lineWidth = Math.max(1, canvas.width * 0.0025);
  ctx.setLineDash([]);
  const centerX = rectX + rectWidth / 2;
  const centerY = rectY + rectHeight / 2;
  ctx.beginPath();
  ctx.moveTo(centerX, rectY);
  ctx.lineTo(centerX, rectY + rectHeight);
  ctx.moveTo(rectX, centerY);
  ctx.lineTo(rectX + rectWidth, centerY);
  ctx.stroke();
  ctx.restore();
}

function drawPixelPreview(result) {
  const canvas = elements.photoSketchPixelPreview;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = result.width;
  tempCanvas.height = result.height;
  const tempCtx = tempCanvas.getContext('2d');
  const imageData = new ImageData(result.buffer, result.width, result.height);
  tempCtx.putImageData(imageData, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
}

function applyPreviewAspect(canvas, ratio) {
  if (!canvas) return null;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let width;
  let height;
  if (safeRatio >= 1) {
    width = PREVIEW_MAX_DIMENSION;
    height = Math.round(width / safeRatio);
  } else {
    height = PREVIEW_MAX_DIMENSION;
    width = Math.round(height * safeRatio);
  }
  if (Math.min(width, height) < PREVIEW_MIN_DIMENSION) {
    const scale = PREVIEW_MIN_DIMENSION / Math.min(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  if (Math.max(width, height) > PREVIEW_MAX_DIMENSION) {
    const scale = PREVIEW_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  canvas.style.setProperty('--preview-aspect', safeRatio.toFixed(4));
  return { width: canvas.width, height: canvas.height, ratio: safeRatio };
}

function updatePreviewInfo(result, config) {
  if (!elements.photoSketchPreviewInfo) return;
  elements.photoSketchPreviewInfo.textContent = `原图：${photoSketchState.image.naturalWidth} × ${photoSketchState.image.naturalHeight} ｜ 像素图：${result.width} × ${result.height} ｜ 像素比 1:${config.pixelRatio}`;
}

function updateSketchSummary(config) {
  if (!elements.photoSketchSummary) return;
  if (!config || !photoSketchState.image) {
    elements.photoSketchSummary.textContent = '目标尺寸：-- × --';
    return;
  }
  elements.photoSketchSummary.textContent = `目标尺寸：${config.width} × ${config.height}（像素比 1:${config.pixelRatio}）`;
}

function clearPreviewCanvases() {
  [elements.photoSketchOriginalPreview, elements.photoSketchPixelPreview].forEach((canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  });
  if (elements.photoSketchPreviewInfo) {
    elements.photoSketchPreviewInfo.textContent = '尚未选择图片';
  }
}

function getDitherMode() {
  const checked = Array.from(elements.photoSketchDitherRadios || []).find((radio) => radio.checked);
  return checked?.value || 'none';
}

function ensureSketchPaletteApplied() {
  const targetPaletteId = photoSketchState.paletteId;
  if (!targetPaletteId || targetPaletteId === '__current') return;
  if (state.currentPaletteId === targetPaletteId) return;
  const entry = state.paletteLibrary.get(targetPaletteId);
  if (!entry?.data) return;
  applyPalette(entry.data, entry.name || targetPaletteId, { libraryId: targetPaletteId, persistSelection: true });
}

function applySketchToCanvas() {
  if (!photoSketchState.lastResult) {
    updateSketchStatus('请先生成预览。', 'error');
    return;
  }
  ensureSketchPaletteApplied();
  const { width, height, grid } = photoSketchState.lastResult;
  createCanvas(width, height, { cellSize: state.cellSize });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      state.grid[y][x] = grid[y][x];
    }
  }
  redrawCanvas();
  renderSelectionLayers();
  saveHistory();
  updateSketchStatus(`已创建 ${width} × ${height} 草图并应用到画布。`, 'success');
  closePhotoSketchOverlay();
}

function exportSketchImage() {
  if (!photoSketchState.lastResult) {
    updateSketchStatus('没有可以导出的像素图，请先生成预览。', 'error');
    return;
  }
  const { width, height, buffer } = photoSketchState.lastResult;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d');
  const imageData = new ImageData(buffer, width, height);
  ctx.putImageData(imageData, 0, 0);
  const link = document.createElement('a');
  link.href = exportCanvas.toDataURL('image/png');
  link.download = `pixel-sketch-${width}x${height}.png`;
  link.click();
  updateSketchStatus('像素图已导出为 PNG 文件。', 'success');
}

function toggleSketchActionButtons(enabled) {
  if (elements.photoSketchCreateBtn) {
    elements.photoSketchCreateBtn.disabled = !enabled;
  }
  if (elements.photoSketchExportBtn) {
    elements.photoSketchExportBtn.disabled = !enabled;
  }
}

function updateSketchStatus(message, type = 'info') {
  if (!elements.photoSketchStatus) return;
  elements.photoSketchStatus.textContent = message;
  elements.photoSketchStatus.dataset.statusType = type;
}

function resolvePaletteEntries(paletteId) {
  if (paletteId === '__current' || !paletteId) {
    const enabledCodes = getEnabledColors();
    if (!enabledCodes.length) return [];
    return enabledCodes
      .map((code) => {
        const entry = state.palette[code];
        if (!entry || (entry.type && entry.type !== 'normal')) return null;
        const rgb = entry.rgb || parseColor(entry.color);
        if (!rgb) return null;
        return {
          code,
          rgb: { r: clampChannel(rgb.r), g: clampChannel(rgb.g), b: clampChannel(rgb.b) },
          type: entry.type || 'normal'
        };
      })
      .filter(Boolean);
  }
  const libraryEntry = state.paletteLibrary.get(paletteId);
  if (!libraryEntry?.data) return [];
  return normalizePaletteData(libraryEntry.data);
}

function normalizePaletteData(rawData) {
  const list = [];
  if (Array.isArray(rawData)) {
    rawData.forEach((item) => {
      appendPaletteEntry(list, item?.code || item?.num, item);
    });
  } else if (typeof rawData === 'object' && rawData) {
    Object.entries(rawData).forEach(([key, value]) => {
      appendPaletteEntry(list, value?.code || value?.num || key, value);
    });
  }
  return list;
}

function appendPaletteEntry(list, code, rawEntry) {
  const parsed = parseColor(rawEntry?.color || rawEntry?.rgb);
  if (!parsed) return;
  const safeCode = String(code || '').trim() || `color-${list.length + 1}`;
  list.push({
    code: safeCode,
    rgb: { r: clampChannel(parsed.r), g: clampChannel(parsed.g), b: clampChannel(parsed.b) },
    type: rawEntry?.type || 'normal'
  });
}

function syncPhotoSketchPaletteOptions() {
  if (!elements.photoSketchPaletteSelect) return;
  const select = elements.photoSketchPaletteSelect;
  const currentValue = select.value || photoSketchState.paletteId;
  select.innerHTML = '';
  const currentLabel = state.currentPaletteLabel || '当前色卡';
  const currentOption = document.createElement('option');
  currentOption.value = '__current';
  currentOption.textContent = `使用当前色卡「${currentLabel}」`;
  select.appendChild(currentOption);
  let libraryCount = 0;
  state.paletteOrder.forEach((id) => {
    const entry = state.paletteLibrary.get(id);
    if (!entry?.data) return;
    const option = document.createElement('option');
    option.value = id;
    const colorCount = getPaletteEntryCount(entry.data);
    option.textContent = colorCount ? `${entry.name || id}（${colorCount}色）` : (entry.name || id);
    select.appendChild(option);
    libraryCount += 1;
  });
  if (libraryCount === 0) {
    select.dataset.empty = 'true';
  } else {
    delete select.dataset.empty;
  }
  const resolvedValue = select.querySelector(`option[value="${currentValue}"]`) ? currentValue : '__current';
  photoSketchState.paletteId = resolvedValue;
  select.value = resolvedValue;
}

function getPaletteEntryCount(data) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.entries)) return data.entries.length;
    return Object.keys(data).length;
  }
  return 0;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
